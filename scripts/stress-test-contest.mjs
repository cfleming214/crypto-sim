#!/usr/bin/env node
/**
 * Backend stress test: 50 bots join a fresh 1-hour, $100k contest ("stress test",
 * 60 spots) and each makes a NEW RANDOM TRADE EVERY MINUTE through the real
 * authenticated API path — Cognito sign-in → AppSync `updateCompetitionEntry`
 * (owner-auth) → DynamoDB. This exercises AppSync + Cognito + DynamoDB + the
 * leaderboard crons under sustained load, not just the database.
 *
 * Reuses the bot pool + helpers from seed-live-contest.mjs. The contest is tagged
 * createdBy="seed-script", so `npm run seed:contests:clean` tears it (and the
 * bots) down. `--clean` here removes just the "stress test" contest + its entries.
 *
 * Requires AWS credentials in env / ~/.aws (admin: creates Cognito users + the
 * Competition row). Reads region, pool id, app-client id and the AppSync URL from
 * amplify_outputs.json.
 *
 * Usage:
 *   npm run stress:contest
 *   node scripts/stress-test-contest.mjs --users 50 --spots 60 --interval 60
 *   node scripts/stress-test-contest.mjs --users 5 --duration-min 2   # smoke run
 *   node scripts/stress-test-contest.mjs --dry-run
 *   node scripts/stress-test-contest.mjs --clean
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBClient,
  ListTablesCommand,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ── flags ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY   = argv.includes('--dry-run');
const CLEAN = argv.includes('--clean');
const flag = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = parseInt(argv[i + 1] ?? '', 10);
  return Number.isFinite(v) ? v : def;
};
const USERS       = Math.max(1, flag('--users', 50));
const SPOTS       = Math.max(USERS, flag('--spots', 60));
const INTERVAL_MS = Math.max(5, flag('--interval', 60)) * 1000;
const DURATION_MS = Math.max(1, flag('--duration-min', 60)) * 60 * 1000;

// ── config from amplify_outputs.json ─────────────────────────────────────────
const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION    = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
const CLIENT_ID = outputs.auth?.user_pool_client_id;
const APPSYNC   = outputs.data?.url;
if (!USER_POOL || !CLIENT_ID) throw new Error('Missing auth.user_pool_id / user_pool_client_id in amplify_outputs.json');
if (!APPSYNC) throw new Error('Missing data.url (AppSync endpoint) in amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

// ── tunables (must match the app + the seed scripts) ─────────────────────────
const STARTING_CASH = 100_000;
const SEED_PASSWORD = process.env.BOT_SEED_PASSWORD || 'SeedBot!2026'; // override via env; default = throwaway bots
const CREATED_BY    = 'seed-script';   // so seed:contests:clean removes it too
const CONTEST_NAME  = 'stress test';
const HOUR = 60 * 60 * 1000;

// ── bot pool (mirror of seed-live-contest.mjs) ───────────────────────────────
const NAMED_BOTS = [
  { email: 'seedbot01@cryptocomp.app', handle: 'AvaWhale' },
  { email: 'seedbot02@cryptocomp.app', handle: 'MaxLeverage' },
  { email: 'seedbot03@cryptocomp.app', handle: 'DiamondHan' },
  { email: 'seedbot04@cryptocomp.app', handle: 'SatoshiJr' },
  { email: 'seedbot05@cryptocomp.app', handle: 'MoonLina' },
  { email: 'seedbot06@cryptocomp.app', handle: 'HodlKing' },
  { email: 'seedbot07@cryptocomp.app', handle: 'PaperCutz' },
  { email: 'seedbot08@cryptocomp.app', handle: 'GweiGuru' },
  { email: 'seedbot09@cryptocomp.app', handle: 'AlphaSeeka' },
  { email: 'seedbot10@cryptocomp.app', handle: 'NakamotoZ' },
];
const EXTRA_BOTS = Array.from({ length: 990 }, (_, i) => {
  const n = i + 11;
  return { email: `seedbot${String(n).padStart(2, '0')}@cryptocomp.app`, handle: `LoadBot${n}` };
});
const BOTS = [...NAMED_BOTS, ...EXTRA_BOTS];

const FALLBACK_COINS = [
  { symbol: 'BTC', price: 65000 },     { symbol: 'ETH', price: 3500 },
  { symbol: 'SOL', price: 150 },       { symbol: 'BNB', price: 600 },
  { symbol: 'XRP', price: 0.60 },      { symbol: 'DOGE', price: 0.15 },
  { symbol: 'ADA', price: 0.45 },      { symbol: 'AVAX', price: 35 },
  { symbol: 'LINK', price: 18 },       { symbol: 'DOT', price: 7 },
  { symbol: 'TRX', price: 0.27 },      { symbol: 'TON', price: 7.5 },
  { symbol: 'SHIB', price: 0.000025 }, { symbol: 'LTC', price: 95 },
  { symbol: 'BCH', price: 480 },       { symbol: 'UNI', price: 12 },
  { symbol: 'ATOM', price: 9.5 },      { symbol: 'XLM', price: 0.13 },
  { symbol: 'NEAR', price: 6.0 },      { symbol: 'APT', price: 11 },
  { symbol: 'ARB', price: 1.10 },      { symbol: 'OP', price: 2.20 },
  { symbol: 'FIL', price: 6.0 },       { symbol: 'ICP', price: 13 },
  { symbol: 'AAVE', price: 110 },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const rand   = (a, b) => a + Math.random() * (b - a);
const randi  = (a, b) => Math.floor(rand(a, b + 1));
const pick   = (arr) => arr[randi(0, arr.length - 1)];
const round2 = (n) => Math.round(n * 100) / 100;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

// Run fn over items with bounded concurrency; never rejects (errors land in the result).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (e) { out[idx] = { __error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

async function findTables() {
  const want = ['Competition', 'CompetitionEntry', 'Token'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      for (const m of want) if (name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  for (const m of want) if (!out[m]) console.warn(`  ! table for ${m} not found`);
  return out;
}

// Idempotent Cognito bot create + sub lookup → { sub, owner: "<sub>::<email>" }.
async function ensureUser(bot) {
  if (DRY) return { sub: 'DRY-SUB', owner: `DRY-SUB::${bot.email}` };
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL,
      Username: bot.email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'email', Value: bot.email }, { Name: 'email_verified', Value: 'true' }],
    }));
    await cog.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL, Username: bot.email, Password: SEED_PASSWORD, Permanent: true }));
  } catch (e) {
    if (e.name !== 'UsernameExistsException') throw e;
  }
  const got = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: bot.email }));
  const sub = got.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error(`no sub for ${bot.email}`);
  return { sub, owner: `${sub}::${bot.email}` };
}

async function loadCoins(tokenTable) {
  if (!tokenTable) return FALLBACK_COINS.map((c) => ({ ...c }));
  const coins = [];
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tokenTable, ExclusiveStartKey: start,
      ProjectionExpression: '#s, lastPrice, enabledForPractice',
      ExpressionAttributeNames: { '#s': 'symbol' },
    }));
    for (const it of res.Items ?? []) {
      const symbol = it.symbol?.S;
      const price = it.lastPrice?.N ? Number(it.lastPrice.N) : 0;
      const enabled = it.enabledForPractice?.BOOL !== false;
      if (symbol && price > 0 && enabled) coins.push({ symbol, price });
    }
    start = res.LastEvaluatedKey;
  } while (start);
  return coins.length >= 4 ? coins : FALLBACK_COINS.map((c) => ({ ...c }));
}

// ── Cognito sign-in (USER_PASSWORD_AUTH; public client, no secret) ───────────
async function signIn(email) {
  const out = await cog.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: SEED_PASSWORD },
  }));
  const r = out.AuthenticationResult;
  if (!r?.IdToken) throw new Error(`sign-in failed for ${email}`);
  return { idToken: r.IdToken, refreshToken: r.RefreshToken };
}

// ── AppSync GraphQL (Cognito user-pool auth: raw JWT in Authorization) ────────
async function gql(idToken, query, variables) {
  const res = await fetch(APPSYNC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: idToken },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);
  if (json?.errors?.length) {
    const err = new Error(json.errors.map((e) => e.errorType || e.message).join('; '));
    err.unauthorized = json.errors.some((e) => /Unauthorized|token|expired|JWT/i.test(`${e.errorType} ${e.message}`));
    throw err;
  }
  if (!res.ok) throw new Error(`AppSync HTTP ${res.status}`);
  return json?.data;
}

const CREATE_ENTRY = `mutation Join($input: CreateCompetitionEntryInput!) {
  createCompetitionEntry(input: $input) { id }
}`;
const UPDATE_ENTRY = `mutation Trade($input: UpdateCompetitionEntryInput!) {
  updateCompetitionEntry(input: $input) { id }
}`;

// ── portfolio + trade simulation (in memory; we push absolute values) ────────
function priceOf(coins, sym) {
  const c = coins.find((x) => x.symbol === sym);
  return c ? c.price : 0;
}

function makeTrade(s, coins) {
  const held = s.holdings.filter((h) => h.units > 1e-9);
  const sell = held.length > 0 && (s.cash < 50 || Math.random() < 0.4);
  const t = Date.now();
  if (sell) {
    const h = pick(held);
    const price = priceOf(coins, h.symbol) || h.avgCost;
    const units = h.units * rand(0.25, 1.0);
    const proceeds = units * price;
    h.units -= units;
    if (h.units < 1e-9) s.holdings = s.holdings.filter((x) => x !== h);
    s.cash += proceeds;
    s.trades.push({ symbol: h.symbol, side: 'sell', amount: round2(proceeds), units: round6(units), price, t });
  } else {
    const c = pick(coins);
    const amount = Math.min(s.cash, Math.max(50, s.cash * rand(0.02, 0.15)));
    if (amount >= 1) {
      const units = amount / c.price;
      const ex = s.holdings.find((h) => h.symbol === c.symbol);
      if (ex) { ex.avgCost = (ex.avgCost * ex.units + amount) / (ex.units + units); ex.units += units; }
      else s.holdings.push({ symbol: c.symbol, units, avgCost: c.price });
      s.cash -= amount;
      s.trades.push({ symbol: c.symbol, side: 'buy', amount: round2(amount), units: round6(units), price: c.price, t });
    }
  }
  if (s.trades.length > 50) s.trades = s.trades.slice(-50);
  const value = s.holdings.reduce((sum, h) => sum + h.units * (priceOf(coins, h.symbol) || h.avgCost), 0);
  s.bankroll = s.cash + value;
  s.pnlPct = ((s.bankroll - STARTING_CASH) / STARTING_CASH) * 100;
}

// One trade for one bot via AppSync; refreshes the token + retries once on auth error.
async function tradeOnce(s, coins) {
  makeTrade(s, coins);
  const input = {
    id: s.entryId,
    cash: round2(s.cash),
    holdingsJson: JSON.stringify(s.holdings.map((h) => ({ symbol: h.symbol, units: round6(h.units), avgCost: round2(h.avgCost) }))),
    tradesJson: JSON.stringify(s.trades),
    bankroll: round2(s.bankroll),
    pnlPct: round2(s.pnlPct),
  };
  const t0 = Date.now();
  try {
    await gql(s.idToken, UPDATE_ENTRY, { input });
  } catch (e) {
    if (e.unauthorized) {
      const a = await signIn(s.bot.email);
      s.idToken = a.idToken; s.refreshToken = a.refreshToken;
      await gql(s.idToken, UPDATE_ENTRY, { input });
    } else { throw e; }
  }
  return Date.now() - t0;
}

function competitionItem(id, name, startAt, endAt, maxPlayers) {
  const now = Date.now();
  return {
    __typename: 'Competition', id, name, type: 'featured',
    status: startAt <= now ? 'live' : 'open',
    prizePool: '5,000 XP', maxPlayers, stake: 'Free',
    startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
    entryCount: USERS, numberOfPrizes: 3, prizesJson: '[]', prizeXp: 5000,
    lockAfterStart: false, createdBy: CREATED_BY,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
}

async function put(table, item) {
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

// ── teardown of just the "stress test" contest(s) + their entries ────────────
async function cleanup(tables) {
  console.log(`Cleaning up "${CONTEST_NAME}" contests…`);
  const ids = new Set();
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tables.Competition, ExclusiveStartKey: start,
      FilterExpression: '#n = :n AND createdBy = :c',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: marshall({ ':n': CONTEST_NAME, ':c': CREATED_BY }),
    }));
    for (const it of res.Items ?? []) ids.add(it.id.S);
    start = res.LastEvaluatedKey;
  } while (start);

  let entries = 0; start = undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: tables.CompetitionEntry, ExclusiveStartKey: start }));
    for (const it of res.Items ?? []) {
      if (ids.has(it.competitionId?.S)) {
        if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.CompetitionEntry, Key: marshall({ id: it.id.S }) }));
        entries++;
      }
    }
    start = res.LastEvaluatedKey;
  } while (start);

  for (const id of ids) if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.Competition, Key: marshall({ id }) }));
  console.log(`  ${DRY ? 'would delete' : 'deleted'} ${ids.size} contest(s) + ${entries} entries`);
  console.log('  (bot Cognito accounts are shared with the seed pool — remove with `npm run seed:contests:clean`)');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Stress test → ${USERS} bots · "${CONTEST_NAME}" · ${SPOTS} spots · trade every ${INTERVAL_MS / 1000}s${DRY ? '  (dry-run)' : ''}`);
  const tables = await findTables();
  if (CLEAN) { await cleanup(tables); return; }

  const coins = await loadCoins(tables.Token);
  console.log(`Loaded ${coins.length} coins (${tables.Token ? 'Token table' : 'fallback'}).`);

  const bots = BOTS.slice(0, USERS);
  console.log('Ensuring bot accounts…');
  const ensured = await mapLimit(bots, 5, async (b) => ({ ...b, ...(await ensureUser(b)) }));
  const ready = ensured.filter((b) => !b.__error);
  if (ready.length < ensured.length) console.warn(`  ! ${ensured.length - ready.length} bot account(s) failed to provision`);

  const contestId = randomUUID();
  const now = Date.now();
  const item = competitionItem(contestId, CONTEST_NAME, now, now + HOUR, SPOTS);
  console.log(`Creating contest "${CONTEST_NAME}" [${item.status}] cap ${SPOTS}, ends ${item.endAt}…`);
  if (!DRY) await put(tables.Competition, item);

  if (DRY) { console.log('Dry-run: skipping sign-in, join, and the trade loop.'); return; }

  // Sign in + join (createCompetitionEntry — AppSync sets the owner field).
  console.log('Signing in + joining via AppSync…');
  const states = (await mapLimit(ready, 8, async (b) => {
    const { idToken, refreshToken } = await signIn(b.email);
    const input = {
      competitionId: contestId, handle: b.handle,
      cash: STARTING_CASH, holdingsJson: '[]', tradesJson: '[]',
      bankroll: STARTING_CASH, pnlPct: 0, rank: 999, isActive: true,
      joinedAt: new Date().toISOString(),
    };
    const data = await gql(idToken, CREATE_ENTRY, { input });
    return { bot: b, idToken, refreshToken, entryId: data.createCompetitionEntry.id, cash: STARTING_CASH, holdings: [], trades: [], bankroll: STARTING_CASH, pnlPct: 0 };
  })).filter((s) => s && !s.__error);
  console.log(`  ${states.length}/${ready.length} bots joined.`);
  if (states.length === 0) { console.error('No bots joined — aborting.'); return; }

  // Trade loop.
  const endAt = now + HOUR;
  const stopAt = Math.min(endAt, Date.now() + DURATION_MS);
  let stopped = false;
  process.on('SIGINT', () => { stopped = true; console.log('\nStopping after this round…'); });

  const totals = { rounds: 0, ok: 0, fail: 0 };
  console.log(`\nTrading every ${INTERVAL_MS / 1000}s until ${new Date(stopAt).toISOString()} (Ctrl-C to stop early)…\n`);
  while (!stopped && Date.now() < stopAt) {
    totals.rounds++;
    // small per-round price walk so portfolio values move between rounds
    for (const c of coins) c.price = Math.max(1e-9, c.price * (1 + rand(-0.01, 0.01)));

    const t0 = Date.now();
    const results = await Promise.allSettled(states.map((s) => tradeOnce(s, coins)));
    const lat = [];
    let ok = 0, fail = 0;
    const errs = {};
    for (const r of results) {
      if (r.status === 'fulfilled') { ok++; lat.push(r.value); }
      else { fail++; const m = (r.reason?.message || 'error').slice(0, 60); errs[m] = (errs[m] || 0) + 1; }
    }
    totals.ok += ok; totals.fail += fail;
    lat.sort((a, b) => a - b);
    const p50 = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
    const max = lat.length ? lat[lat.length - 1] : 0;
    const errStr = Object.keys(errs).length ? ` · errs: ${Object.entries(errs).map(([m, n]) => `${n}×${m}`).join(', ')}` : '';
    console.log(`round ${totals.rounds} · ${ok}/${states.length} ok · p50 ${p50}ms · max ${max}ms · ${Date.now() - t0}ms wall${errStr}`);

    if (stopped || Date.now() >= stopAt) break;
    // Interruptible wait so Ctrl-C (SIGINT) responds within ~0.5s, not a full interval.
    for (let waited = 0; waited < INTERVAL_MS && !stopped && Date.now() < stopAt; waited += 500) {
      await sleep(Math.min(500, INTERVAL_MS - waited));
    }
  }

  console.log(`\nDone. ${totals.rounds} rounds · ${totals.ok} ok · ${totals.fail} failed.`);
  console.log('Teardown: `npm run seed:contests:clean`  (or `--clean` to drop just this contest).');
}

main().catch((e) => { console.error(e); process.exit(1); });
