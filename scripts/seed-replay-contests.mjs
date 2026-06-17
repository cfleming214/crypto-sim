#!/usr/bin/env node
/**
 * Seeds replay contests into the Amplify sandbox. One contest per historical
 * era (see src/data/replayHistory.ts). A replay contest is play-through-and-
 * submit: you play the whole era on the Replay screen and your final portfolio
 * value is your submission. The contest stays joinable until endAt.
 *
 * Each contest is created with:
 *   - the era's REAL daily close series in pricesJson (read straight from
 *     src/data/replayHistory.ts, so the contest playthrough matches the app's
 *     era page exactly — no network/Coinbase dependency),
 *   - a 1-HOUR submission window (endAt = startAt + 1h),
 *   - a 20-player cap, 5,000 XP prize,
 *   - a handful of bot ReplayEntry rows (already-submitted scores) so the
 *     leaderboard looks alive.
 *
 * Requires AWS creds in env (or ~/.aws). Reads region from amplify_outputs.json.
 *
 *   node scripts/seed-replay-contests.mjs              # clean prior seed, reseed
 *   node scripts/seed-replay-contests.mjs --append     # keep prior, add more
 *   node scripts/seed-replay-contests.mjs --dry-run    # print plan, no writes
 */
import {
  DynamoDBClient, ListTablesCommand, ScanCommand, PutItemCommand, DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');
const APPEND = process.argv.includes('--append');
const CREATED_BY = 'replay-seed';
const STARTING_CASH = 100_000;
const HOUR_MS = 60 * 60 * 1000;     // contest submission window
const MAX_PLAYERS = 20;
const PRIZE_XP = 5000;

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

const BOT_HANDLES = ['AvaWhale', 'MaxLeverage', 'DiamondHan', 'SatoshiJr', 'MoonLina', 'HodlKing', 'PaperHandPat'];

// Read REPLAY_ERAS straight out of the (auto-generated) data file. The array
// body is plain JSON — quoted keys + numeric arrays — so we slice it out and
// parse it. This keeps the contest prices identical to the in-app era page.
function loadEras() {
  const srcText = readFileSync('./src/data/replayHistory.ts', 'utf8');
  const eq = srcText.indexOf('=', srcText.indexOf('REPLAY_ERAS'));
  const start = srcText.indexOf('[', eq);
  const end = srcText.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error('could not locate REPLAY_ERAS array in replayHistory.ts');
  return JSON.parse(srcText.slice(start, end + 2)); // include the closing ']'
}

async function findTables() {
  const want = ['ReplayContest', 'ReplayEntry'];
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

async function* scanAll(table) {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const it of out.Items ?? []) yield it;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function cleanPriorSeed(tables) {
  const contestIds = new Set();
  for await (const raw of scanAll(tables.ReplayContest)) {
    const c = unmarshall(raw);
    if (c.createdBy === CREATED_BY) { contestIds.add(c.id); if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.ReplayContest, Key: marshall({ id: c.id }) })); }
  }
  for await (const raw of scanAll(tables.ReplayEntry)) {
    const e = unmarshall(raw);
    if (contestIds.has(e.replayContestId)) { if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.ReplayEntry, Key: marshall({ id: e.id }) })); }
  }
  console.log(`  cleaned ${contestIds.size} prior replay contest(s)`);
}

async function put(table, item) {
  if (DRY) return;
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

async function main() {
  const eras = loadEras();
  const tables = await findTables();
  if (!APPEND) await cleanPriorSeed(tables);

  const nowMs = Date.now();
  const startAt = Math.floor(nowMs / 60000) * 60000; // align to the current minute → live now
  const nowIso = new Date(nowMs).toISOString();

  for (const era of eras) {
    const prices = era.prices;
    if (!Array.isArray(prices) || prices.length < 10) throw new Error(`${era.id}: only ${prices?.length} points`);
    const histStartIso = new Date(era.startDate + 'T00:00:00Z').toISOString();
    const open = prices[0], close = prices[prices.length - 1];
    const pct = ((close - open) / open) * 100;
    console.log(`${era.title} (${era.coin}) — ${prices.length} days, $${open.toLocaleString()} → $${close.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`);

    const contestId = randomUUID();
    await put(tables.ReplayContest, {
      __typename: 'ReplayContest',
      id: contestId,
      eventId: era.id,
      eventTitle: era.title,
      coin: era.coin,
      weekIndex: 0,
      histStartIso,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(startAt + HOUR_MS).toISOString(),   // open to play for 1 hour
      status: 'live',
      intervalMs: era.intervalMs,
      pricesJson: JSON.stringify(prices),
      maxPlayers: MAX_PLAYERS,
      prizeXp: PRIZE_XP,
      lockAfterStart: false,
      entryCount: BOT_HANDLES.length,
      createdBy: CREATED_BY,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Seed bots with a SUBMITTED final score (holdings empty so the tick Lambda's
    // reprice is a no-op and the score stands), so the leaderboard looks alive.
    for (const handle of BOT_HANDLES) {
      const score = Math.round(STARTING_CASH * (0.7 + Math.random() * 1.3)); // 70K–200K
      const pnlPct = ((score - STARTING_CASH) / STARTING_CASH) * 100;
      await put(tables.ReplayEntry, {
        __typename: 'ReplayEntry',
        id: randomUUID(),
        replayContestId: contestId,
        handle,
        owner: `replay-seed::${handle}`,
        cash: score,
        holdingsJson: '[]',
        tradesJson: '[]',
        bankroll: score,
        pnlPct: Number(pnlPct.toFixed(2)),
        rank: 999,
        joinedAt: nowIso,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    console.log(`  wrote contest ${contestId} + ${BOT_HANDLES.length} bot submissions (cap ${MAX_PLAYERS}, ${PRIZE_XP} XP, 1h window)`);
  }

  console.log(DRY ? '\nDry run — no writes.' : '\nDone. Play a contest from Compete → Replay; your final result is submitted.');
}

main().catch(e => { console.error(e); process.exit(1); });
