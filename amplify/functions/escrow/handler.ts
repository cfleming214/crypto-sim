import { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';

const ddb = new DynamoDBClient({});
const MOCK = !process.env.STRIPE_SECRET_KEY;
const stripe = MOCK ? null : new Stripe(process.env.STRIPE_SECRET_KEY!);

// Platform rake as basis points (100 = 1%). Winner gets pot − rake. 0 for now.
const RAKE_BPS = Number(process.env.ESCROW_RAKE_BPS ?? '0');

// Dedicated server gate so escrow can be exercised in Stripe TEST mode via the
// admin test script while the CLIENT feature (USER_ESCROW_CONTESTS_ENABLED) stays
// OFF for users. With a sk_test_ key this is test-money only; a real charge needs
// a LIVE key AND legal sign-off. Enable in backend.ts.
const CASH = () => process.env.ESCROW_ENABLED === 'true';
const compTable = () => process.env.COMPETITION_TABLE_NAME!;
const finishedTable = () => process.env.FINISHED_COMPETITION_TABLE_NAME!;
const holdTable = () => process.env.ESCROW_HOLD_TABLE_NAME!;
const payoutTable = () => process.env.PAYOUT_TABLE_NAME!;
const annualTable = () => process.env.ANNUAL_WINNINGS_TABLE_NAME;

interface ResolverEvent {
  arguments?: { competitionId?: string; amountCents?: number };
  identity?: { sub?: string; username?: string };
  fieldName?: string;
  info?: { fieldName?: string };
}

// Load a contest by id from Competition, falling back to FinishedCompetition.
async function loadContest(competitionId: string): Promise<any | null> {
  for (const table of [compTable(), finishedTable()]) {
    const { Item } = await ddb.send(new GetItemCommand({ TableName: table, Key: marshall({ id: competitionId }) }));
    if (Item) return { ...unmarshall(Item), __table: table };
  }
  return null;
}

async function holdsFor(competitionId: string): Promise<any[]> {
  const out: any[] = [];
  let start: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: holdTable(),
      ExclusiveStartKey: start,
      FilterExpression: 'competitionId = :c',
      ExpressionAttributeValues: marshall({ ':c': competitionId }),
    }));
    for (const it of res.Items ?? []) out.push(unmarshall(it));
    start = res.LastEvaluatedKey;
  } while (start);
  return out;
}

async function setHoldStatus(id: string, status: string, extra: Record<string, any> = {}) {
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, any> = { ':s': status };
  let expr = 'SET #s = :s';
  for (const [k, v] of Object.entries(extra)) { names[`#${k}`] = k; values[`:${k}`] = v; expr += `, #${k} = :${k}`; }
  await ddb.send(new UpdateItemCommand({ TableName: holdTable(), Key: marshall({ id }), UpdateExpression: expr, ExpressionAttributeNames: names, ExpressionAttributeValues: marshall(values) }));
}

// ── 1. Authorize/hold the caller's entry fee ────────────────────────────────
async function createHold(userId: string, competitionId: string, amountCents: number) {
  if (!CASH()) return { ok: false, error: 'Escrow contests are not enabled' };
  if (!(amountCents > 0)) return { ok: false, error: 'Invalid amount' };
  const comp = await loadContest(competitionId);
  if (!comp) return { ok: false, error: 'Contest not found' };
  if (comp.escrow !== true) return { ok: false, error: 'Not an escrow contest' };
  if (comp.entryAmountCents && amountCents !== comp.entryAmountCents) return { ok: false, error: 'Wrong entry amount' };

  const holdId = randomUUID();
  const now = new Date().toISOString();
  // Manual-capture PaymentIntent: authorizes/holds funds; captured at settlement.
  const pi = MOCK
    ? { id: `pi_mock_${holdId.slice(0, 8)}`, client_secret: `mock_secret_${holdId.slice(0, 8)}` }
    : await stripe!.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        capture_method: 'manual',
        metadata: { competitionId, userId, holdId },
        description: `Escrow entry — ${competitionId}`,
      });

  await ddb.send(new PutItemCommand({
    TableName: holdTable(),
    Item: marshall({
      id: holdId, __typename: 'EscrowHold', competitionId, userId, owner: userId,
      paymentIntentId: pi.id, amountCents, status: 'pending', createdAt: now,
    }, { removeUndefinedValues: true }),
  }));
  return { ok: true, escrowHoldId: holdId, paymentIntentId: pi.id, clientSecret: pi.client_secret };
}

// ── 2. Settle: capture all holds → credit the winner a Payout of the pot ─────
async function settleContest(competitionId: string) {
  if (!CASH()) return { ok: false, error: 'Escrow contests are not enabled' };
  const comp = await loadContest(competitionId);
  if (!comp) return { ok: false, error: 'Contest not found' };
  if (comp.escrow !== true) return { ok: false, error: 'Not an escrow contest' };
  if (comp.escrowSettled === true) return { ok: true, already: true };
  const winnerOwner: string | undefined = comp.winnerOwner;
  if (!winnerOwner) return { ok: false, error: 'No winner yet (contest not settled by close-competition)' };
  const winnerSub = winnerOwner.split('::')[0];

  const holds = await holdsFor(competitionId);
  let potCents = 0;
  for (const h of holds) {
    if (h.status === 'captured') { potCents += h.amountCents; continue; }
    try {
      if (MOCK) { potCents += h.amountCents; await setHoldStatus(h.id, 'captured'); continue; }
      const pi = await stripe!.paymentIntents.retrieve(h.paymentIntentId);
      if (pi.status === 'requires_capture') {
        const captured = await stripe!.paymentIntents.capture(h.paymentIntentId);
        potCents += captured.amount_received ?? h.amountCents;
        await setHoldStatus(h.id, 'captured');
      } else if (pi.status === 'succeeded') {
        potCents += pi.amount_received ?? h.amountCents; await setHoldStatus(h.id, 'captured');
      } else {
        await setHoldStatus(h.id, 'failed', { note: pi.status });
      }
    } catch (e: any) { await setHoldStatus(h.id, 'failed', { note: String(e?.message ?? e).slice(0, 120) }); }
  }

  const prizeCents = Math.max(0, potCents - Math.floor((potCents * RAKE_BPS) / 10000));

  // Credit the winner via the EXISTING Payout rail (they claim → balance → withdraw).
  if (prizeCents > 0) {
    const payoutId = `escrow-${competitionId}#${winnerSub}`;
    const now = new Date().toISOString();
    try {
      await ddb.send(new PutItemCommand({
        TableName: payoutTable(),
        Item: marshall({
          id: payoutId, __typename: 'Payout', owner: winnerOwner, userId: winnerSub,
          competitionId, rank: 1, amountCents: prizeCents, status: 'unclaimed',
          claimed: false, withdrawn: false, createdAt: now, updatedAt: now,
        }, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(id)',
      }));
      if (annualTable()) await bumpAnnualWinnings(winnerSub, winnerOwner, prizeCents);
    } catch (e: any) { if (e?.name !== 'ConditionalCheckFailedException') throw e; }
  }

  await ddb.send(new UpdateItemCommand({
    TableName: comp.__table, Key: marshall({ id: competitionId }),
    UpdateExpression: 'SET escrowSettled = :t, potCents = :p, updatedAt = :now',
    ExpressionAttributeValues: marshall({ ':t': true, ':p': potCents, ':now': new Date().toISOString() }),
  }));
  return { ok: true, potCents, prizeCents, winner: winnerSub, holds: holds.length };
}

// ── 3. Cancel: release every hold (no charge) ───────────────────────────────
async function cancelContest(competitionId: string) {
  if (!CASH()) return { ok: false, error: 'Escrow contests are not enabled' };
  const holds = await holdsFor(competitionId);
  let released = 0;
  for (const h of holds) {
    if (h.status === 'captured' || h.status === 'refunded') continue;
    try {
      if (!MOCK && h.paymentIntentId) await stripe!.paymentIntents.cancel(h.paymentIntentId).catch(() => {});
      await setHoldStatus(h.id, 'refunded');
      released++;
    } catch { /* best effort */ }
  }
  const comp = await loadContest(competitionId);
  if (comp) await ddb.send(new UpdateItemCommand({ TableName: comp.__table, Key: marshall({ id: competitionId }), UpdateExpression: 'SET escrowSettled = :t', ExpressionAttributeValues: marshall({ ':t': true }) }));
  return { ok: true, released };
}

async function bumpAnnualWinnings(userId: string, owner: string, amountCents: number) {
  const table = annualTable(); if (!table) return;
  const taxYear = new Date().getUTCFullYear();
  const now = new Date().toISOString();
  await ddb.send(new UpdateItemCommand({
    TableName: table, Key: marshall({ id: `${userId}#${taxYear}` }),
    UpdateExpression: 'SET userId = :u, taxYear = :y, updatedAt = :n, #tn = :tn, #o = :o ADD totalCents :c',
    ExpressionAttributeNames: { '#tn': '__typename', '#o': 'owner' },
    ExpressionAttributeValues: marshall({ ':u': userId, ':y': taxYear, ':n': now, ':tn': 'AnnualWinnings', ':o': owner, ':c': amountCents }),
  }));
}

// ── Entry: mutation (has arguments) or scheduled settlement sweep ────────────
export const handler = async (event: ResolverEvent): Promise<any> => {
  const field = event.info?.fieldName ?? event.fieldName;
  const sub = event.identity?.sub;
  const args = event.arguments ?? {};

  if (field === 'escrowCreateHold') {
    if (!sub) return { ok: false, error: 'Unauthenticated' };
    return createHold(sub, args.competitionId!, args.amountCents!);
  }
  if (field === 'escrowSettleContest') return settleContest(args.competitionId!);
  if (field === 'escrowCancelContest') return cancelContest(args.competitionId!);

  // Scheduled: settle every finished escrow contest that has a winner and isn't settled.
  if (!CASH()) return { settled: 0 };
  let settled = 0, start: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: finishedTable(), ExclusiveStartKey: start,
      FilterExpression: 'escrow = :t AND attribute_exists(winnerOwner) AND (attribute_not_exists(escrowSettled) OR escrowSettled = :f)',
      ExpressionAttributeValues: marshall({ ':t': true, ':f': false }),
    }));
    for (const it of res.Items ?? []) { await settleContest(unmarshall(it).id); settled++; }
    start = res.LastEvaluatedKey;
  } while (start);
  return { settled };
};
