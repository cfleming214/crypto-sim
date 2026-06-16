#!/usr/bin/env node
/**
 * Seeds replay contests into the Amplify sandbox. Each contest is a 7-day,
 * single-coin replay of a REAL historical window at 1-minute resolution, played
 * back real-time 1:1 (one real minute = one historical minute).
 *
 * For each configured window it:
 *   1. Fetches ~10,080 real 1-minute closes from Coinbase for the coin + range.
 *   2. Writes a ReplayContest row (status live, startAt now) with the series in
 *      pricesJson — the deterministic price = prices[floor((now-startAt)/60000)].
 *   3. Seeds a handful of bot ReplayEntry rows (random allocation of the event
 *      coin at the opening price) so the leaderboard looks alive; the
 *      tick-replay-leaderboard Lambda reprices + ranks them as the replay runs.
 *
 * Requires AWS creds in env (or ~/.aws). Reads region from amplify_outputs.json.
 *
 *   node scripts/seed-replay-contests.mjs              # clean prior seed, reseed
 *   node scripts/seed-replay-contests.mjs --append     # keep prior, add more
 *   node scripts/seed-replay-contests.mjs --dry-run    # fetch + print, no writes
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
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY = 86400 * 1000;

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Full historical eras (DAILY data). A contest replays the whole era quickly on
// the Replay screen; your final result is your submission. Open until endAt.
const WINDOWS = [
  { eventId: 'bull-run-2021',      eventTitle: 'The 2021 Bull Run', coin: 'BTC', product: 'BTC-USD', weekIndex: 0, start: '2020-11-01', end: '2021-05-01' },
  { eventId: 'covid-crash',        eventTitle: 'COVID Crash',       coin: 'BTC', product: 'BTC-USD', weekIndex: 0, start: '2020-02-15', end: '2020-04-15' },
  { eventId: 'crypto-winter-2022', eventTitle: 'Crypto Winter 2022',coin: 'BTC', product: 'BTC-USD', weekIndex: 0, start: '2022-05-01', end: '2022-11-13' },
];

const BOT_HANDLES = ['AvaWhale', 'MaxLeverage', 'DiamondHan', 'SatoshiJr', 'MoonLina', 'HodlKing', 'PaperHandPat'];

// Coinbase DAILY closes for a range (≤300 candles/request → a couple of calls).
async function fetchDailyCloses(product, startISO, endISO) {
  const startMs = Date.parse(startISO), endMs = Date.parse(endISO);
  const byDay = new Map();
  for (let from = startMs; from < endMs; from += 290 * DAY) {
    const to = Math.min(from + 290 * DAY, endMs);
    const url = `https://api.exchange.coinbase.com/products/${product}/candles`
      + `?granularity=86400&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}`;
    let rows;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': 'crypto-sim-replay-seed' } });
      if (res.ok) { rows = await res.json(); break; }
      await sleep(700 * (attempt + 1));
    }
    if (!Array.isArray(rows)) throw new Error(`fetch failed ${product} ${startISO}`);
    for (const r of rows) byDay.set(r[0], r[4]); // time → close
    await sleep(220);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => Math.round(c * 100) / 100);
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
  const tables = await findTables();
  if (!APPEND) await cleanPriorSeed(tables);

  const nowMs = Date.now();
  const startAt = Math.floor(nowMs / 60000) * 60000; // align to the current minute → live now
  const nowIso = new Date(nowMs).toISOString();

  for (const w of WINDOWS) {
    process.stdout.write(`Fetching ${w.eventTitle} (${w.product} ${w.start}..${w.end}) daily… `);
    const prices = await fetchDailyCloses(w.product, w.start, w.end);
    if (prices.length < 10) throw new Error(`${w.eventId}: only ${prices.length} daily points`);
    const histStartIso = new Date(w.start + 'T00:00:00Z').toISOString();
    const open = prices[0], close = prices[prices.length - 1];
    const pct = ((close - open) / open) * 100;
    console.log(`${prices.length} days, $${open.toLocaleString()} → $${close.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`);

    const contestId = randomUUID();
    await put(tables.ReplayContest, {
      __typename: 'ReplayContest',
      id: contestId,
      eventId: w.eventId,
      eventTitle: w.eventTitle,
      coin: w.coin,
      weekIndex: w.weekIndex,
      histStartIso,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(startAt + WEEK_MS).toISOString(),   // open to play for 7 days
      status: 'live',
      intervalMs: DAY,
      pricesJson: JSON.stringify(prices),
      maxPlayers: 100000,
      prizeXp: 5000,
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
    console.log(`  wrote contest ${contestId} + ${BOT_HANDLES.length} bot submissions`);
  }

  console.log(DRY ? '\nDry run — no writes.' : '\nDone. Play a contest from Compete → Replay; your final result is submitted.');
}

main().catch(e => { console.error(e); process.exit(1); });
