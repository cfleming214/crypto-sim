// End-to-end escrow test against Stripe TEST mode. Exercises the DEPLOYED escrow
// Lambda: create a user-funded contest, place two holds (createHold → confirm with
// a test card), settle → capture the pot + credit the winner a Payout. Then a
// separate contest to test the cancel/refund path.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/test-escrow.mjs
//
// Needs: admin AWS creds; the SAME Stripe TEST key the escrow Lambda uses (so it
// can capture the PaymentIntents this script confirms). Reads region from
// amplify_outputs.json. Test rows use ids prefixed `escrow-test-` (safe to leave).
import { LambdaClient, ListFunctionsCommand, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, ListTablesCommand, PutItemCommand, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY || !KEY.startsWith('sk_test_')) { console.error('Set STRIPE_SECRET_KEY to your sk_test_… key (must match the escrow Lambda).'); process.exit(1); }
const stripe = new Stripe(KEY);
const out = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const REGION = out.data?.aws_region ?? out.auth.aws_region;
const ddb = new DynamoDBClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

const WINNER = 'escrow-test-winner';
const LOSER  = 'escrow-test-loser';
const ENTRY_CENTS = 500; // $5 entry

async function findTable(needle) { let s, hit; do { const r = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: s })); hit = (r.TableNames ?? []).find(t => t.includes(needle)); s = r.LastEvaluatedTableName; } while (!hit && s); return hit; }
async function findFn(needle) { let m, hit; do { const r = await lambda.send(new ListFunctionsCommand({ Marker: m })); hit = (r.Functions ?? []).find(f => f.FunctionName.toLowerCase().includes(needle)); m = r.NextMarker; } while (!hit && m); return hit?.FunctionName; }
async function invoke(fn, event) { const r = await lambda.send(new InvokeCommand({ FunctionName: fn, Payload: Buffer.from(JSON.stringify(event)) })); const p = JSON.parse(Buffer.from(r.Payload).toString() || '{}'); return p; }
const call = (fn, fieldName, args, sub) => invoke(fn, { info: { fieldName }, fieldName, arguments: args, identity: sub ? { sub } : undefined });

(async () => {
  const fn = await findFn('escrow');
  const compTable = await findTable('Competition-');
  const holdTable = await findTable('EscrowHold');
  const payoutTable = await findTable('Payout-');
  if (!fn) { console.error('escrow Lambda not found (deploy first).'); process.exit(1); }
  console.log(`escrow Lambda: ${fn}\n`);

  // ── Happy path: two holds → settle → winner Payout ─────────────────────────
  const cid = `escrow-test-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  await ddb.send(new PutItemCommand({ TableName: compTable, Item: marshall({
    id: cid, __typename: 'Competition', name: '⚔️ Escrow Test Duel', type: '1v1', status: 'finished',
    escrow: true, entryAmountCents: ENTRY_CENTS, winnerOwner: `${WINNER}::${WINNER}`,
    startAt: now, endAt: now, prizePool: '$10', maxPlayers: 2, stake: '$5', createdAt: now, updatedAt: now,
  }, { removeUndefinedValues: true }) }));
  console.log(`1) created escrow contest ${cid} (entry $${ENTRY_CENTS/100}, winner=${WINNER})`);

  for (const [who, sub] of [[WINNER, WINNER], [LOSER, LOSER]]) {
    const res = await call(fn, 'escrowCreateHold', { competitionId: cid, amountCents: ENTRY_CENTS }, sub);
    if (!res.ok) { console.error('   createHold failed:', res.error); process.exit(1); }
    // Confirm the hold with a test card (simulates the client PaymentSheet).
    const pi = await stripe.paymentIntents.confirm(res.paymentIntentId, { payment_method: 'pm_card_visa' });
    console.log(`2) ${who}: hold ${res.paymentIntentId} → ${pi.status} (${pi.status === 'requires_capture' ? 'held ✓' : pi.status})`);
  }

  const settle = await call(fn, 'escrowSettleContest', { competitionId: cid });
  console.log(`3) settle:`, JSON.stringify(settle));

  const { Item: payout } = await ddb.send(new GetItemCommand({ TableName: payoutTable, Key: marshall({ id: `escrow-${cid}#${WINNER}` }) }));
  console.log(`4) winner Payout: ${payout ? `$${unmarshall(payout).amountCents/100} status=${unmarshall(payout).status} ✓` : 'MISSING ✗'}`);
  const holds = (await ddb.send(new ScanCommand({ TableName: holdTable, FilterExpression: 'competitionId = :c', ExpressionAttributeValues: marshall({ ':c': cid }) }))).Items?.map(unmarshall) ?? [];
  console.log(`   holds: ${holds.map(h => h.status).join(', ')} (expect captured, captured)`);

  // ── Cancel path: hold → cancel → refunded ─────────────────────────────────
  const cid2 = `escrow-test-cancel-${Date.now().toString(36)}`;
  await ddb.send(new PutItemCommand({ TableName: compTable, Item: marshall({ id: cid2, __typename: 'Competition', name: 'Escrow Cancel Test', type: '1v1', status: 'open', escrow: true, entryAmountCents: ENTRY_CENTS, startAt: now, endAt: now, createdAt: now, updatedAt: now }, { removeUndefinedValues: true }) }));
  const h = await call(fn, 'escrowCreateHold', { competitionId: cid2, amountCents: ENTRY_CENTS }, LOSER);
  await stripe.paymentIntents.confirm(h.paymentIntentId, { payment_method: 'pm_card_visa' });
  const cancel = await call(fn, 'escrowCancelContest', { competitionId: cid2 });
  const pi2 = await stripe.paymentIntents.retrieve(h.paymentIntentId);
  console.log(`5) cancel: released=${cancel.released}, PI status=${pi2.status} (${pi2.status === 'canceled' ? 'refunded ✓' : pi2.status})`);

  console.log('\n✅ Escrow sandbox test complete. Check the Stripe TEST dashboard for the captured + canceled PaymentIntents.');
})().catch(e => { console.error(e); process.exit(1); });
