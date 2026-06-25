#!/usr/bin/env node
/**
 * End-to-end multi-portfolio stress test.
 *
 * Creates 20 real Cognito users + two XP contests (1h / 5k XP, 24h / 10k XP, cap
 * 30, joinable until 10% of the duration remains → joinCutoffPct 0.9). Each user
 * then LOGS IN (USER_PASSWORD_AUTH) and drives everything through the real
 * authenticated AppSync path (owner-auth): creates its profile, joins BOTH
 * contests, and for 10 minutes makes random trades on one of its THREE portfolios
 * (offline/main, 1h contest, 24h contest) on a staggered, random 15–30s timer.
 *
 * Each action picks a portfolio at random and a random trade type:
 *   - sell-one-buy-another ×N  (random count; never re-touches a coin already
 *                               traded within the same action)
 *   - sell-all                 (liquidate every holding to cash)
 *   - rebalance                (real planRebalance, ported from the app)
 * Main-portfolio trades write Trade rows + update UserProfile; contest trades
 * update the CompetitionEntry so the contest leaderboards rerank.
 *
 * Requires admin AWS creds (creates Cognito users + Competition rows). Reads
 * region / pool / client / AppSync url from amplify_outputs.json.
 *
 * Usage:
 *   npm run stress:multi
 *   node scripts/stress-multi-contest.mjs --users 20 --minutes 10
 *   node scripts/stress-multi-contest.mjs --clean      # tear everything down
 *   node scripts/stress-multi-contest.mjs --dry-run
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBClient,
  ListTablesCommand,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ── flags ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const CLEAN = argv.includes('--clean');
const flag = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = parseInt(argv[i + 1] ?? '', 10);
  return Number.isFinite(v) ? v : def;
};
const USERS = Math.max(1, Math.min(30, flag('--users', 20)));
const MINUTES = Math.max(1, flag('--minutes', 10));

// ── config ────────────────────────────────────────────────────────────────────
const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
const CLIENT_ID = outputs.auth?.user_pool_client_id;
const APPSYNC = outputs.data?.url;
if (!USER_POOL || !CLIENT_ID) throw new Error('Missing auth pool/client in amplify_outputs.json');
if (!APPSYNC) throw new Error('Missing data.url (AppSync endpoint) in amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

// ── constants ─────────────────────────────────────────────────────────────────
const STARTING_CASH = 100_000;
const PASSWORD = 'StressBot!2026';
const CREATED_BY = 'stress-multi';
const HANDLE_PREFIX = 'StressBot';
const HOUR = 60 * 60 * 1000;
const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B'];
const bots = Array.from({ length: USERS }, (_, i) => {
  const nn = String(i + 1).padStart(2, '0');
  return { email: `stressbot${nn}@cryptocomp.app`, handle: `${HANDLE_PREFIX}${nn}`, color: COLORS[i % COLORS.length] };
});

const FALLBACK_COINS = [
  { symbol: 'BTC', price: 71000 }, { symbol: 'ETH', price: 3800 }, { symbol: 'SOL', price: 190 },
  { symbol: 'BNB', price: 600 }, { symbol: 'XRP', price: 0.62 }, { symbol: 'DOGE', price: 0.16 },
  { symbol: 'ADA', price: 0.45 }, { symbol: 'AVAX', price: 38 }, { symbol: 'LINK', price: 18 },
  { symbol: 'DOT', price: 7 }, { symbol: 'LTC', price: 95 }, { symbol: 'UNI', price: 12 },
];

// ── helpers ───────────────────────────────────────────────────────────────────
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[randi(0, arr.length - 1)];
const round2 = (n) => Math.round(n * 100) / 100;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { __error: e }; }
    }
  }));
  return out;
}

async function findTables() {
  const want = ['Competition', 'FinishedCompetition', 'CompetitionEntry', 'UserProfile', 'Trade', 'LiveTrade', 'Token'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) for (const m of want) if (!out[m] && n.startsWith(`${m}-`) && n.endsWith('-NONE')) out[m] = n;
    next = res.LastEvaluatedTableName;
  } while (next);
  return out;
}
async function* scanAll(table, extra = {}) {
  let k;
  do { const o = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k, ...extra })); for (const it of o.Items ?? []) yield unmarshall(it); k = o.LastEvaluatedKey; } while (k);
}
async function put(table, item) {
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

// ── Cognito ───────────────────────────────────────────────────────────────────
async function ensureUser(bot) {
  if (DRY) return { ...bot, sub: 'DRY', owner: `DRY::${bot.email}` };
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL, Username: bot.email, MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'email', Value: bot.email }, { Name: 'email_verified', Value: 'true' }],
    }));
    await cog.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL, Username: bot.email, Password: PASSWORD, Permanent: true }));
  } catch (e) { if (e.name !== 'UsernameExistsException') throw e; }
  const got = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: bot.email }));
  const sub = got.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error(`no sub for ${bot.email}`);
  return { ...bot, sub, owner: `${sub}::${bot.email}` };
}
async function signIn(email) {
  const out = await cog.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: PASSWORD },
  }));
  const r = out.AuthenticationResult;
  if (!r?.IdToken) throw new Error(`sign-in failed for ${email}`);
  return r.IdToken;
}

// ── AppSync ───────────────────────────────────────────────────────────────────
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
// Run a mutation; on an auth error refresh the bot's token once and retry.
async function gqlRetry(s, query, variables) {
  try { return await gql(s.idToken, query, variables); }
  catch (e) {
    if (!e.unauthorized) throw e;
    s.idToken = await signIn(s.bot.email);
    return gql(s.idToken, query, variables);
  }
}

const Q_MY_PROFILE = `query { listUserProfiles(limit: 1) { items { id } } }`;
const M_CREATE_PROFILE = `mutation P($input: CreateUserProfileInput!) { createUserProfile(input: $input) { id } }`;
const M_UPDATE_PROFILE = `mutation P($input: UpdateUserProfileInput!) { updateUserProfile(input: $input) { id } }`;
const M_CREATE_ENTRY = `mutation E($input: CreateCompetitionEntryInput!) { createCompetitionEntry(input: $input) { id } }`;
const M_UPDATE_ENTRY = `mutation E($input: UpdateCompetitionEntryInput!) { updateCompetitionEntry(input: $input) { id } }`;
const M_CREATE_TRADE = `mutation T($input: CreateTradeInput!) { createTrade(input: $input) { id } }`;
const M_CREATE_LIVE_TRADE = `mutation L($input: CreateLiveTradeInput!) { createLiveTrade(input: $input) { id } }`;

// ── coins ─────────────────────────────────────────────────────────────────────
async function loadCoins(tokenTable) {
  if (!tokenTable) return FALLBACK_COINS.map((c) => ({ ...c }));
  const coins = [];
  for await (const t of scanAll(tokenTable)) {
    if (t.symbol && t.symbol !== 'USDC' && Number(t.lastPrice) > 0 && t.enabledForPractice !== false) coins.push({ symbol: t.symbol, price: Number(t.lastPrice) });
  }
  return coins.length >= 4 ? coins : FALLBACK_COINS.map((c) => ({ ...c }));
}

// ── portfolio simulation (mirrors AppContext BUY/SELL/REBALANCE + rebalance.ts) ─
const priceOf = (coins, sym) => coins.find((c) => c.symbol === sym)?.price ?? 0;
function recompute(p, coins) {
  const val = p.holdings.reduce((s, h) => s + h.units * (priceOf(coins, h.symbol) || h.avgCost), 0);
  p.bankroll = p.cash + val;
  p.pnlPct = ((p.bankroll - STARTING_CASH) / STARTING_CASH) * 100;
}
function applyBuy(p, coins, symbol, amount) {
  const price = priceOf(coins, symbol);
  if (!(price > 0) || amount < 1 || amount > p.cash + 1e-6) return;
  const units = amount / price;
  const ex = p.holdings.find((h) => h.symbol === symbol);
  if (ex) { ex.avgCost = (ex.avgCost * ex.units + amount) / (ex.units + units); ex.units += units; }
  else p.holdings.push({ symbol, units, avgCost: price });
  p.cash -= amount;
  p.trades.push({ symbol, side: 'buy', amount: round2(amount), units: round6(units), price, t: Date.now(), kind: p._kind });
}
function applySell(p, coins, symbol, units) {
  const h = p.holdings.find((x) => x.symbol === symbol);
  if (!h) return;
  const u = Math.min(units, h.units);
  if (u <= 1e-9) return;
  const price = priceOf(coins, symbol) || h.avgCost;
  const proceeds = u * price;
  h.units -= u;
  if (h.units < 1e-9) p.holdings = p.holdings.filter((x) => x !== h);
  p.cash += proceeds;
  p.trades.push({ symbol, side: 'sell', amount: round2(proceeds), units: round6(u), price, t: Date.now(), kind: p._kind });
}
// Sell one held coin → cash, buy another — repeated a random number of times,
// never re-touching a coin already traded within THIS action.
function doSwaps(p, coins, n) {
  const traded = new Set();
  for (let i = 0; i < n; i++) {
    const sellable = p.holdings.filter((h) => h.units > 1e-9 && !traded.has(h.symbol));
    if (sellable.length) {
      const h = pick(sellable);
      applySell(p, coins, h.symbol, h.units * rand(0.25, 1.0));
      traded.add(h.symbol);
    }
    const buyable = coins.filter((c) => c.symbol !== 'USDC' && !traded.has(c.symbol));
    if (p.cash >= 50 && buyable.length) {
      const c = pick(buyable);
      applyBuy(p, coins, c.symbol, Math.min(p.cash, Math.max(50, p.cash * rand(0.1, 0.6))));
      traded.add(c.symbol);
    }
  }
}
function sellAll(p, coins) {
  for (const h of [...p.holdings]) applySell(p, coins, h.symbol, h.units);
}
// Ported planRebalance (deploy / equalize) — same math as src/services/rebalance.ts.
function planRebalance(holdings, cash, coins, topN = 5) {
  const px = (sym) => coins.find((c) => c.symbol === sym)?.price ?? 0;
  const MIN = 5, BUF = 0.05;
  const held = holdings.filter((h) => h.symbol !== 'USDC').map((h) => ({ symbol: h.symbol, units: h.units, price: px(h.symbol) })).filter((h) => h.price > 0);
  const curVal = (sym) => { const h = held.find((x) => x.symbol === sym); return h ? h.units * h.price : 0; };
  const meaningful = held.filter((h) => h.units * h.price > MIN);
  const lines = [];
  if (meaningful.length < topN && cash > 50) {
    const targets = coins.filter((c) => c.symbol !== 'USDC' && c.price > 0).slice(0, topN);
    if (!targets.length) return lines;
    const inTargets = held.filter((h) => targets.some((t) => t.symbol === h.symbol)).reduce((s, h) => s + h.units * h.price, 0);
    const perCoin = ((cash + inTargets) * (1 - BUF)) / targets.length;
    for (const c of targets) {
      const delta = perCoin - curVal(c.symbol);
      if (Math.abs(delta) <= MIN) continue;
      lines.push({ symbol: c.symbol, side: delta > 0 ? 'buy' : 'sell', amount: Math.abs(delta), units: Math.abs(delta) / c.price });
    }
    return lines;
  }
  const top = held.slice(0, topN);
  const perCoin = top.length ? top.reduce((s, h) => s + h.units * h.price, 0) / top.length : 0;
  for (const h of top) {
    const delta = perCoin - h.units * h.price;
    if (Math.abs(delta) <= MIN) continue;
    lines.push({ symbol: h.symbol, side: delta > 0 ? 'buy' : 'sell', amount: Math.abs(delta), units: Math.abs(delta) / h.price });
  }
  return lines;
}
function applyRebalance(p, coins) {
  const lines = planRebalance(p.holdings, p.cash, coins);
  for (const l of lines) if (l.side === 'sell') applySell(p, coins, l.symbol, l.units);
  for (const l of lines) if (l.side === 'buy' && p.cash >= l.amount) applyBuy(p, coins, l.symbol, l.amount);
}
const holdingsJson = (p) => JSON.stringify(p.holdings.map((h) => ({ symbol: h.symbol, units: round6(h.units), avgCost: round2(h.avgCost) })));

// Mirror each executed trade into the global "Live trades" feed (the Compete
// card reads liveTradesByFeed). Goes through the SAME path the app uses —
// the createLiveTrade AppSync mutation with the bot's JWT (owner-auth), exactly
// like recordLiveTrade() — so it load-tests the real resolver, not a raw DDB
// write. feed:'global' is what the Compete card queries. Best-effort.
async function writeLiveTrades(s, fresh) {
  const ttl = Math.floor(Date.now() / 1000) + 2 * 86400;
  for (const tr of fresh) {
    try {
      await gqlRetry(s, M_CREATE_LIVE_TRADE, { input: {
        feed: 'global', handle: s.bot.handle, symbol: tr.symbol, side: tr.side,
        amountUsd: tr.amount, units: tr.units, price: tr.price, avatarColor: s.bot.color,
        tradedAt: new Date(tr.t).toISOString(), expiresAt: ttl,
      } });
    } catch { /* feed write is best-effort */ }
  }
}

// One action: pick a portfolio + a random trade type, apply it, persist.
async function doAction(s, coins, totals) {
  const key = pick(['main', 'h1', 'h24']);
  const p = s.ports[key];
  const type = pick(['swaps', 'swaps', 'swaps', 'sellall', 'rebalance']); // weight swaps
  const before = p.trades.length;
  p._kind = type === 'rebalance' ? 'rebalance' : undefined;
  if (type === 'swaps') doSwaps(p, coins, randi(1, 4));
  else if (type === 'sellall') sellAll(p, coins);
  else applyRebalance(p, coins);
  recompute(p, coins);
  const fresh = p.trades.slice(before);
  totals.actions++;
  if (fresh.length === 0) return; // nothing changed (e.g. already balanced) — skip the write

  const t0 = Date.now();
  try {
    if (key === 'main') {
      for (const tr of fresh) {
        await gqlRetry(s, M_CREATE_TRADE, { input: {
          tradeId: randomUUID(), symbol: tr.symbol, side: tr.side, amount: tr.amount,
          units: tr.units, price: tr.price, xpEarned: tr.side === 'buy' ? 25 : 10, slippage: 0.001, timestamp: tr.t,
        } });
        totals.trades++;
      }
      await gqlRetry(s, M_UPDATE_PROFILE, { input: { id: s.profileId, cash: round2(p.cash), bankroll: round2(p.bankroll), holdingsJson: holdingsJson(p) } });
    } else {
      if (p.trades.length > 50) p.trades = p.trades.slice(-50);
      await gqlRetry(s, M_UPDATE_ENTRY, { input: {
        id: key === 'h1' ? s.entry1 : s.entry24, cash: round2(p.cash), holdingsJson: holdingsJson(p),
        tradesJson: JSON.stringify(p.trades), bankroll: round2(p.bankroll), pnlPct: round2(p.pnlPct),
      } });
      totals.trades += fresh.length;
    }
    await writeLiveTrades(s, fresh); // surface in the Compete "Live trades" feed
    totals.ok++; totals.lat.push(Date.now() - t0);
  } catch (e) {
    totals.fail++; const m = (e.message || 'error').slice(0, 48); totals.errs[m] = (totals.errs[m] || 0) + 1;
  }
}

function freshPort() { return { cash: STARTING_CASH, holdings: [], trades: [], bankroll: STARTING_CASH, pnlPct: 0 }; }
function contestItem(id, name, endAt, prizeXp) {
  const now = Date.now();
  return {
    __typename: 'Competition', id, name, type: 'featured', status: 'live',
    prizePool: `${prizeXp.toLocaleString()} XP`, maxPlayers: 30, stake: 'Free',
    startAt: new Date(now).toISOString(), endAt: new Date(endAt).toISOString(),
    entryCount: 0, numberOfPrizes: 3, prizesJson: '[]', prizeXp,
    lockAfterStart: false, joinCutoffPct: 0.9, createdBy: CREATED_BY,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
}

// ── teardown ──────────────────────────────────────────────────────────────────
async function cleanup(tables) {
  console.log('Cleaning up stress-multi data…');
  // Resolve the 20 bot subs (best-effort) to match owner-scoped rows.
  const subs = new Set();
  for (const b of bots) {
    try { const g = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: b.email })); const sub = g.UserAttributes?.find((a) => a.Name === 'sub')?.Value; if (sub) subs.add(sub); } catch { /* gone */ }
  }
  const ownedByBot = (owner) => owner && subs.has(String(owner).split('::')[0]);
  // Contests by marker (live + archived).
  const compIds = new Set();
  for (const m of ['Competition', 'FinishedCompetition']) {
    if (!tables[m]) continue;
    for await (const c of scanAll(tables[m])) if (c.createdBy === CREATED_BY) { compIds.add(c.id); await ddb.send(new DeleteItemCommand({ TableName: tables[m], Key: marshall({ id: c.id }) })); }
  }
  let entries = 0, profiles = 0, trades = 0, live = 0;
  for await (const e of scanAll(tables.CompetitionEntry)) if (compIds.has(e.competitionId) || ownedByBot(e.owner)) { await ddb.send(new DeleteItemCommand({ TableName: tables.CompetitionEntry, Key: marshall({ id: e.id }) })); entries++; }
  for await (const p of scanAll(tables.UserProfile)) if (String(p.handle || '').startsWith(HANDLE_PREFIX) || ownedByBot(p.owner)) { await ddb.send(new DeleteItemCommand({ TableName: tables.UserProfile, Key: marshall({ id: p.id }) })); profiles++; }
  if (tables.Trade) for await (const t of scanAll(tables.Trade)) if (ownedByBot(t.owner)) { await ddb.send(new DeleteItemCommand({ TableName: tables.Trade, Key: marshall({ id: t.id }) })); trades++; }
  if (tables.LiveTrade) for await (const t of scanAll(tables.LiveTrade)) if (String(t.handle || '').startsWith(HANDLE_PREFIX) || ownedByBot(t.owner)) { await ddb.send(new DeleteItemCommand({ TableName: tables.LiveTrade, Key: marshall({ id: t.id }) })); live++; }
  let users = 0;
  for (const b of bots) { try { await cog.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL, Username: b.email })); users++; } catch { /* gone */ } }
  console.log(`  deleted ${compIds.size} contests · ${entries} entries · ${profiles} profiles · ${trades} trades · ${live} live-feed rows · ${users} users`);
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Stress-multi → ${USERS} users · 2 XP contests · ${MINUTES} min${DRY ? '  (dry-run)' : ''}`);
  const tables = await findTables();
  for (const m of ['Competition', 'CompetitionEntry', 'UserProfile', 'Trade']) if (!tables[m]) throw new Error(`table for ${m} not found — deploy the backend first`);
  if (CLEAN) { await cleanup(tables); return; }

  // Clear any prior stress-multi contests so runs don't accumulate.
  for (const m of ['Competition', 'FinishedCompetition']) { if (!tables[m]) continue; for await (const c of scanAll(tables[m])) if (c.createdBy === CREATED_BY && !DRY) await ddb.send(new DeleteItemCommand({ TableName: tables[m], Key: marshall({ id: c.id }) })); }

  const coins = await loadCoins(tables.Token);
  console.log(`Loaded ${coins.length} coins (${tables.Token ? 'Token table' : 'fallback'}).`);

  // Two XP contests.
  const now = Date.now();
  const c1 = contestItem(randomUUID(), '⚡ Stress 1h (5k XP)', now + HOUR, 5000);
  const c24 = contestItem(randomUUID(), '⚡ Stress 24h (10k XP)', now + 24 * HOUR, 10000);
  console.log('Creating contests: ⚡ Stress 1h (5k XP) + ⚡ Stress 24h (10k XP), cap 30, joinCutoffPct 0.9…');
  if (!DRY) { await put(tables.Competition, c1); await put(tables.Competition, c24); }

  // Cognito users.
  console.log(`Provisioning ${USERS} Cognito users…`);
  const ready = (await mapLimit(bots, 5, ensureUser)).filter((b) => !b.__error);
  console.log(`  ${ready.length}/${USERS} ready.`);
  if (DRY) { console.log('Dry-run: skipping login / join / trading.'); return; }

  // Login + profile + join both contests.
  console.log('Logging in, creating profiles, joining both contests…');
  const states = (await mapLimit(ready, 8, async (b) => {
    const idToken = await signIn(b.email);
    const s = { bot: b, idToken, ports: { main: freshPort(), h1: freshPort(), h24: freshPort() } };
    // Profile (reuse if one already exists for this owner).
    const mine = await gql(idToken, Q_MY_PROFILE, {});
    s.profileId = mine?.listUserProfiles?.items?.[0]?.id
      ?? (await gql(idToken, M_CREATE_PROFILE, { input: { handle: b.handle, xp: 0, cash: STARTING_CASH, bankroll: STARTING_CASH, holdingsJson: '[]', leaderboardVisible: false, riskScore: 100, avatarColor: b.color } })).createUserProfile.id;
    const joinInput = (competitionId) => ({ competitionId, handle: b.handle, cash: STARTING_CASH, holdingsJson: '[]', tradesJson: '[]', bankroll: STARTING_CASH, pnlPct: 0, rank: 999, isActive: true, joinedAt: new Date().toISOString() });
    s.entry1 = (await gql(idToken, M_CREATE_ENTRY, { input: joinInput(c1.id) })).createCompetitionEntry.id;
    s.entry24 = (await gql(idToken, M_CREATE_ENTRY, { input: joinInput(c24.id) })).createCompetitionEntry.id;
    return s;
  })).filter((s) => s && !s.__error);
  console.log(`  ${states.length}/${ready.length} users joined both contests.`);
  if (!states.length) { console.error('No users joined — aborting.'); return; }

  // Staggered start: each bot's first action lands at a random 0–30s offset.
  for (const s of states) s.nextAt = Date.now() + rand(0, 30) * 1000;

  const endAt = Date.now() + MINUTES * 60_000;
  const totals = { actions: 0, trades: 0, ok: 0, fail: 0, lat: [], errs: {} };
  let stopped = false, lastLog = Date.now(), lastWalk = Date.now();
  process.on('SIGINT', () => { stopped = true; console.log('\nStopping…'); });
  console.log(`\nTrading for ${MINUTES} min (random 15–30s per bot, staggered). Ctrl-C to stop early.\n`);

  while (!stopped && Date.now() < endAt) {
    const t = Date.now();
    if (t - lastWalk > 8000) { for (const c of coins) c.price = Math.max(1e-9, c.price * (1 + rand(-0.006, 0.006))); lastWalk = t; }
    const due = states.filter((s) => t >= s.nextAt);
    if (due.length) {
      await Promise.allSettled(due.map((s) => doAction(s, coins, totals)));
      for (const s of due) s.nextAt = Date.now() + rand(15, 30) * 1000;
    }
    if (t - lastLog > 30_000) {
      const lat = totals.lat.slice().sort((a, b) => a - b);
      const p50 = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
      console.log(`  +${Math.round((t - (endAt - MINUTES * 60_000)) / 1000)}s · ${totals.actions} actions · ${totals.trades} trades · ${totals.ok} ok / ${totals.fail} fail · p50 ${p50}ms`);
      lastLog = t;
    }
    await sleep(400);
  }

  const errStr = Object.keys(totals.errs).length ? `\n  errors: ${Object.entries(totals.errs).map(([m, n]) => `${n}×${m}`).join(', ')}` : '';
  console.log(`\nDone. ${totals.actions} actions · ${totals.trades} trades · ${totals.ok} ok · ${totals.fail} failed.${errStr}`);
  console.log('Contest leaderboards rerank within ~5 min. Tear down with:  npm run stress:multi -- --clean');
}

main().catch((e) => { console.error(e); process.exit(1); });
