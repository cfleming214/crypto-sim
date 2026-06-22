#!/usr/bin/env node
/**
 * Seeds ONE cash-prize contest that YOU win, so you can test the Stripe payout
 * flow end-to-end (in TEST mode). It creates:
 *   1. A Competition with a real cash prize (prizesJson in dollars), status
 *      'live', already ended (endAt in the past) so the close-competition cron
 *      settles it on its next run (≤10 min) — or set --minutes N to keep it
 *      live for N minutes first.
 *   2. A winning CompetitionEntry owned by YOU (rank 1, highest bankroll), so
 *      settlement creates a Payout row for your account.
 *   3. A few synthetic bot entries (ranks 2+, lower bankroll) for a realistic
 *      leaderboard. numberOfPrizes = 1, so only YOU are paid.
 *
 * When close-competition runs it writes a Payout (status 'paid' if you've
 * already onboarded with Stripe → a real test Transfer; otherwise 'pending' →
 * claim it in-app under Activity → Earnings, which fires the Transfer then).
 *
 * Resolve "you" by handle (default), email, or owner sub:
 *   node scripts/seed-payout-test.mjs --handle chrisf
 *   node scripts/seed-payout-test.mjs --email you@email.com
 *   node scripts/seed-payout-test.mjs --owner <cognito-sub>
 * Options:
 *   --prize 50        prize in dollars (default 50)
 *   --minutes 0       keep it live this many minutes before it ends (default 0)
 *   --dry-run         resolve + print the plan, write nothing
 *
 * Requires AWS creds in env (or ~/.aws). Reads region + pool from amplify_outputs.json.
 */
import {
  DynamoDBClient, ListTablesCommand, ScanCommand, PutItemCommand, DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const argVal = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const DRY = process.argv.includes('--dry-run');
const HANDLE = argVal('--handle', 'chrisf');
const EMAIL = argVal('--email', null);
const OWNER_ARG = argVal('--owner', null);
const PRIZE = Math.max(1, Number(argVal('--prize', '50')));
const MINUTES = Math.max(0, Number(argVal('--minutes', '0')));
const CREATED_BY = 'payout-test';
const STARTING_CASH = 100_000;

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTables() {
  const want = ['Competition', 'CompetitionEntry', 'UserProfile', 'Payout'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      for (const m of want) if (name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  for (const m of want) if (!out[m]) throw new Error(`table for ${m} not found — deploy the backend first`);
  return out;
}

async function* scanAll(table, extra = {}) {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey, ...extra }));
    for (const it of out.Items ?? []) yield it;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

// Resolve the target user's { owner, handle }. --owner wins; then --email via
// Cognito; else match --handle against UserProfile (case-insensitive, no '@').
async function resolveUser(profileTable) {
  if (OWNER_ARG) return { owner: OWNER_ARG, handle: HANDLE };
  if (EMAIL) {
    const { CognitoIdentityProviderClient, AdminGetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const pool = outputs.auth?.user_pool_id;
    if (!pool) throw new Error('user_pool_id missing from amplify_outputs.json');
    const cog = new CognitoIdentityProviderClient({ region: REGION });
    const got = await cog.send(new AdminGetUserCommand({ UserPoolId: pool, Username: EMAIL }));
    const sub = got.UserAttributes?.find(a => a.Name === 'sub')?.Value;
    if (!sub) throw new Error(`no sub for ${EMAIL}`);
    return { owner: `${sub}::${EMAIL}`, handle: HANDLE };
  }
  const target = HANDLE.replace(/^@/, '').toLowerCase();
  for await (const raw of scanAll(profileTable)) {
    const p = unmarshall(raw);
    if ((p.handle ?? '').replace(/^@/, '').toLowerCase() === target && p.owner) {
      return { owner: p.owner, handle: p.handle };
    }
  }
  throw new Error(`No UserProfile found with handle "${HANDLE}". Pass --handle, --email, or --owner.`);
}

async function clearPriorSeed(tables) {
  const compIds = new Set();
  for await (const raw of scanAll(tables.Competition, { ProjectionExpression: 'id, createdBy' })) {
    const c = unmarshall(raw);
    if (c.createdBy === CREATED_BY) { compIds.add(c.id); if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.Competition, Key: marshall({ id: c.id }) })); }
  }
  let entries = 0, payouts = 0;
  for await (const raw of scanAll(tables.CompetitionEntry, { ProjectionExpression: 'id, competitionId' })) {
    const e = unmarshall(raw);
    if (compIds.has(e.competitionId)) { if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.CompetitionEntry, Key: marshall({ id: e.id }) })); entries++; }
  }
  for await (const raw of scanAll(tables.Payout, { ProjectionExpression: 'id, competitionId' })) {
    const p = unmarshall(raw);
    if (compIds.has(p.competitionId)) { if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.Payout, Key: marshall({ id: p.id }) })); payouts++; }
  }
  console.log(`  cleared ${compIds.size} prior payout-test contest(s), ${entries} entr${entries === 1 ? 'y' : 'ies'}, ${payouts} payout row(s)`);
}

async function put(table, item) {
  if (DRY) return;
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

async function main() {
  console.log(`Region: ${REGION}${DRY ? '  ** DRY RUN **' : ''}`);
  const tables = await findTables();

  const me = await resolveUser(tables.UserProfile);
  console.log(`Winner: ${me.handle}  (owner ${me.owner.split('::')[0]}…)`);

  await clearPriorSeed(tables);

  const now = Date.now();
  const startAt = now - 60 * 60 * 1000;                  // started an hour ago
  const endAt = now + MINUTES * 60 * 1000 - (MINUTES === 0 ? 60 * 1000 : 0); // ended (or +N min)
  const nowIso = new Date(now).toISOString();
  const compId = randomUUID();

  await put(tables.Competition, {
    __typename: 'Competition',
    id: compId,
    name: `💸 Payout Test ($${PRIZE})`,
    type: 'featured',
    status: 'live',
    prizePool: `$${PRIZE}`,
    maxPlayers: 10,
    stake: 'Free',
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    entryCount: 5,
    numberOfPrizes: 1,                 // only rank 1 (you) is paid
    prizesJson: JSON.stringify([PRIZE]),
    cashPrize: true,
    prizeXp: 0,
    lockAfterStart: false,
    createdBy: CREATED_BY,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // YOU — rank 1, clearly the highest bankroll so re-ranking keeps you #1.
  await put(tables.CompetitionEntry, {
    __typename: 'CompetitionEntry',
    id: randomUUID(),
    competitionId: compId,
    handle: me.handle,
    owner: me.owner,
    bankroll: Number((STARTING_CASH * 1.6).toFixed(2)),
    pnlPct: 60,
    rank: 1,
    joinedAt: nowIso,
    isActive: true,
    cash: Number((STARTING_CASH * 1.6).toFixed(2)),
    holdingsJson: '[]',
    tradesJson: '[]',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Synthetic also-rans (ranks 2-5) for a realistic board. Not paid
  // (numberOfPrizes = 1) and never log in — just leaderboard filler.
  const bots = ['AvaWhale', 'MaxLeverage', 'DiamondHan', 'SatoshiJr'];
  for (let i = 0; i < bots.length; i++) {
    const bankroll = Number((STARTING_CASH * (1.4 - i * 0.18)).toFixed(2));
    await put(tables.CompetitionEntry, {
      __typename: 'CompetitionEntry',
      id: randomUUID(),
      competitionId: compId,
      handle: bots[i],
      owner: `payout-test::${bots[i]}`,
      bankroll,
      pnlPct: Number((((bankroll - STARTING_CASH) / STARTING_CASH) * 100).toFixed(2)),
      rank: i + 2,
      joinedAt: nowIso,
      isActive: true,
      cash: bankroll,
      holdingsJson: '[]',
      tradesJson: '[]',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  const when = MINUTES === 0 ? 'already ended — settles on the next close-competition run (≤10 min)' : `live for ${MINUTES} min, then settles ≤10 min after`;
  console.log(`\n${DRY ? 'Would create' : 'Created'} "💸 Payout Test ($${PRIZE})" — you rank #1, ${when}.`);
  console.log('Next: wait for settlement, then open the app → Activity → Earnings to see/claim your payout.');
  console.log('(Auto-paid if you onboarded with Stripe; otherwise it sits as pending to claim.)');
}

main().catch(e => { console.error(e); process.exit(1); });
