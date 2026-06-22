#!/usr/bin/env node
/**
 * End-to-end seed for the wallet-balance payout flow. Creates ONE cash-prize
 * contest scheduled for 1 hour with a 3-place podium ($10 / $5 / $1), a cap of
 * 20 players, YOU entered as the rank-1 winner, and 10 synthetic bots filling
 * the board (ranks 2-11). When the contest ends, close-competition writes
 * UNCLAIMED Payout rows; you then claim → balance → withdraw → daily payout.
 *
 *   node scripts/seed-payout-contest.mjs --handle chrisf
 *   node scripts/seed-payout-contest.mjs --email you@email.com --now
 *   node scripts/seed-payout-contest.mjs --owner <cognito-sub>
 * Options:
 *   --now          backdate endAt so the next close-competition run (≤10 min)
 *                  settles it immediately, instead of waiting the full hour
 *   --minutes 60   contest length in minutes (default 60)
 *   --dry-run      resolve + print the plan, write nothing
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
const NOW_SETTLE = process.argv.includes('--now');
const HANDLE = argVal('--handle', 'chrisf');
const EMAIL = argVal('--email', null);
const OWNER_ARG = argVal('--owner', null);
const MINUTES = Math.max(1, Number(argVal('--minutes', '60')));
// Podium prizes in dollars, e.g. --prizes 10,5,2 (default 10,5,1). numberOfPrizes
// is derived from the count.
const PRIZES = argVal('--prizes', '10,5,1').split(',').map(s => Number(s.trim())).filter(n => n > 0);
const MAX_PLAYERS = 20;
const CREATED_BY = 'payout-contest';
const NAME_PREFIX = '💸 Payout Contest';   // stable across prize amounts — used to sweep orphan payouts
const STARTING_CASH = 100_000;

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTables() {
  const want = ['Competition', 'CompetitionEntry', 'UserProfile', 'Payout'];
  const optional = ['FinishedCompetition'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      // First match wins — a sandbox can carry an orphan table from a prior data
      // stack; the live table sorts first and is what the Lambdas + diag use.
      for (const m of [...want, ...optional]) if (!out[m] && name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
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
  // Once a contest ends, close-competition MOVES it into FinishedCompetition, so
  // its prizes are only reachable via that table on a re-seed — sweep it too, or
  // stale UNCLAIMED/CLAIMED payouts from prior runs pile up.
  if (tables.FinishedCompetition) {
    for await (const raw of scanAll(tables.FinishedCompetition, { ProjectionExpression: 'id, createdBy' })) {
      const c = unmarshall(raw);
      if (c.createdBy === CREATED_BY) { compIds.add(c.id); if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.FinishedCompetition, Key: marshall({ id: c.id }) })); }
    }
  }
  let entries = 0, payouts = 0;
  for await (const raw of scanAll(tables.CompetitionEntry, { ProjectionExpression: 'id, competitionId' })) {
    const e = unmarshall(raw);
    if (compIds.has(e.competitionId)) { if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.CompetitionEntry, Key: marshall({ id: e.id }) })); entries++; }
  }
  // Match payouts by competitionId OR by name prefix — a prior run may have
  // deleted the parent contest already, orphaning its payouts beyond compId reach.
  for await (const raw of scanAll(tables.Payout, { ProjectionExpression: 'id, competitionId, competitionName' })) {
    const p = unmarshall(raw);
    if (compIds.has(p.competitionId) || String(p.competitionName || '').startsWith(NAME_PREFIX)) {
      if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.Payout, Key: marshall({ id: p.id }) }));
      payouts++;
    }
  }
  console.log(`  cleared ${compIds.size} prior payout-contest(s), ${entries} entr${entries === 1 ? 'y' : 'ies'}, ${payouts} payout row(s)`);
}

async function put(table, item) {
  if (DRY) return;
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

const BOTS = ['AvaWhale', 'MaxLeverage', 'DiamondHan', 'SatoshiJr', 'MoonLisa', 'ByteBaron', 'HodlQueen', 'GasFeeGary', 'PumpPriya', 'BearBetty'];

async function main() {
  console.log(`Region: ${REGION}${DRY ? '  ** DRY RUN **' : ''}`);
  const tables = await findTables();

  const me = await resolveUser(tables.UserProfile);
  console.log(`Winner: ${me.handle}  (owner ${me.owner.split('::')[0]}…)`);

  await clearPriorSeed(tables);

  const now = Date.now();
  const startAt = now - 60 * 1000;                                  // started a minute ago → 'live'
  const endAt = NOW_SETTLE ? now - 60 * 1000 : now + MINUTES * 60 * 1000;
  const nowIso = new Date(now).toISOString();
  const compId = randomUUID();
  const prizeSum = PRIZES.reduce((s, v) => s + v, 0);

  await put(tables.Competition, {
    __typename: 'Competition',
    id: compId,
    name: `💸 Payout Contest ($${prizeSum})`,
    type: 'featured',
    status: 'live',
    prizePool: `$${prizeSum}`,
    maxPlayers: MAX_PLAYERS,
    stake: 'Free',
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    entryCount: 1 + BOTS.length,
    numberOfPrizes: PRIZES.length,                 // ranks 1-3 paid
    prizesJson: JSON.stringify(PRIZES),
    cashPrize: true,                               // real-money contest → hidden on payments-off builds
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
    bankroll: Number((STARTING_CASH * 1.8).toFixed(2)),
    pnlPct: 80,
    rank: 1,
    joinedAt: nowIso,
    isActive: true,
    cash: Number((STARTING_CASH * 1.8).toFixed(2)),
    holdingsJson: '[]',
    tradesJson: '[]',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // 10 bots, ranks 2-11, descending bankroll (ranks 2 & 3 also get a prize row,
  // but bots never onboard so those just sit unclaimed — harmless).
  for (let i = 0; i < BOTS.length; i++) {
    const bankroll = Number((STARTING_CASH * (1.6 - i * 0.12)).toFixed(2));
    await put(tables.CompetitionEntry, {
      __typename: 'CompetitionEntry',
      id: randomUUID(),
      competitionId: compId,
      handle: BOTS[i],
      // Unique synthetic sub per bot — owner is "<sub>::<name>" and settlement
      // derives userId = owner.split('::')[0]. Using the same prefix for every
      // bot collapsed them to one userId, so the payout id "<comp>#<sub>"
      // collided and only one bot prize survived the idempotent insert.
      owner: `${CREATED_BY}-${i}-${BOTS[i]}::${BOTS[i]}`,
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

  const when = NOW_SETTLE
    ? 'already ended — settles on the next close-competition run (≤10 min)'
    : `live for ${MINUTES} min, then settles ≤10 min after`;
  console.log(`\n${DRY ? 'Would create' : 'Created'} "💸 Payout Contest ($${prizeSum})" — prizes $${PRIZES.join('/$')}, cap ${MAX_PLAYERS}, you rank #1 (+${BOTS.length} bots).`);
  console.log(`${when}.`);
  console.log('Next: wait for settlement → Compete → Unclaimed → Claim → Profile balance → Withdraw.');
  console.log('Verify any step with: npm run diag:payouts' + (EMAIL ? ` -- --email ${EMAIL}` : HANDLE !== 'chrisf' ? ` -- --handle ${HANDLE}` : ''));
}

main().catch(e => { console.error(e); process.exit(1); });
