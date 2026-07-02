#!/usr/bin/env node
/**
 * Seed N "online" players (default 25, configurable) that look like real users.
 *
 * Each player:
 *   • is a real Cognito user with a UNIQUE, human-style handle (no "bot" in it),
 *   • logs in (USER_PASSWORD_AUTH) and drives everything through the real
 *     authenticated AppSync path (owner-auth), exactly like the app,
 *   • creates its profile (leaderboard-visible so it's discoverable),
 *   • joins the N contests ending SOONEST (default 5) — current live/open ones,
 *   • churns a random 1–4 positions (configurable) in EACH joined contest,
 *     updating every entry and mirroring a sample to the Live-trades feed,
 *   • sets its presence (UserProfile + PublicProfile lastActiveAt = now) so it
 *     shows as ONLINE to other users; optionally kept fresh for --online-minutes.
 *
 * Every handle/email is written to a roster file for your records.
 *
 * Requires admin AWS creds (creates Cognito users). Reads region/pool/client/
 * AppSync url from amplify_outputs.json.
 *
 * Usage:
 *   node scripts/seed-online-bots.mjs                       # 25 users, 5 contests, random 1–4 trades/contest
 *   node scripts/seed-online-bots.mjs --users 50
 *   node scripts/seed-online-bots.mjs --users 25 --contests 5 --trades 3  # fixed 3 trades/contest
 *   node scripts/seed-online-bots.mjs --fresh               # add a NEW random group instead of reusing
 *   node scripts/seed-online-bots.mjs --online-minutes 30   # keep them "online" 30 min
 *   node scripts/seed-online-bots.mjs --dry-run
 *   node scripts/seed-online-bots.mjs --clean               # delete this cohort (by email domain)
 *
 * By DEFAULT the cohort is STABLE (deterministic slots phantom-NNN@…): a second
 * run reuses the same bots + their contest entries and tops up trades. Pass
 * --fresh to mint an additional brand-new random group to grow the crowd.
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, ListTablesCommand, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// ── flags ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const CLEAN = argv.includes('--clean');
const ROSTER = argv.includes('--roster'); // re-dump the live cohort to a roster file
const FRESH = argv.includes('--fresh');   // mint a NEW random group instead of reusing the stable cohort
const flag = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = parseInt(argv[i + 1] ?? '', 10);
  return Number.isFinite(v) ? v : def;
};
const USERS = Math.max(1, Math.min(500, flag('--users', 25)));      // configurable count
const CONTESTS = Math.max(1, Math.min(20, flag('--contests', 5)));  // soonest-ending to join
const TRADES = Math.max(0, Math.min(20, flag('--trades', 0)));      // 0 = random 1–4 per contest; >0 = fixed
const tradesFor = () => (TRADES > 0 ? TRADES : randi(1, 4));        // per-contest churn size
const ONLINE_MINUTES = Math.max(0, flag('--online-minutes', 0));    // keep presence fresh

// ── config ──────────────────────────────────────────────────────────────────
const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
const CLIENT_ID = outputs.auth?.user_pool_client_id;
const APPSYNC = outputs.data?.url;
if (!USER_POOL || !CLIENT_ID) throw new Error('Missing auth pool/client in amplify_outputs.json');
if (!APPSYNC) throw new Error('Missing data.url (AppSync endpoint) in amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

const STARTING_CASH = 100_000;
const PASSWORD = process.env.BOT_SEED_PASSWORD || 'OnlineSeed!2026'; // override via env; default = throwaway bots
// Distinct email domain so this cohort is identifiable later (handles are random
// and have no "bot"). The handle — the only user-visible name — never says "bot".
const EMAIL_DOMAIN = 'sim.cryptocomp.app';
const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B'];
const ADJ = ['Swift', 'Nova', 'Lunar', 'Solar', 'Crimson', 'Golden', 'Silent', 'Rapid', 'Cosmic', 'Iron', 'Mighty', 'Wild', 'Frost', 'Shadow', 'Electric', 'Turbo', 'Quantum', 'Stellar', 'Vivid', 'Bold', 'Prime', 'Hyper', 'Neon', 'Atlas', 'Zen'];
const NOUN = ['Falcon', 'Whale', 'Bull', 'Tiger', 'Comet', 'Trader', 'Hawk', 'Wolf', 'Drake', 'Lynx', 'Orca', 'Raven', 'Viper', 'Phoenix', 'Otter', 'Panda', 'Maple', 'River', 'Summit', 'Ace', 'Pilot', 'Nomad', 'Ranger', 'Sage', 'Voyager'];

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
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { __error: e }; } }
  }));
  return out;
}

// Unique, human-style handle with no "bot" in it.
function makeRoster(n) {
  if (FRESH) {
    // --fresh: a one-off RANDOM group (grow the crowd). New unique handles +
    // random emails each run, so these are always brand-new bots.
    const handles = new Set();
    const roster = [];
    let guard = 0;
    while (roster.length < n && guard++ < n * 80) {
      // Mix: ~half the handles get a number suffix, ~half are word-only.
      const handle = `${pick(ADJ)}${pick(NOUN)}${Math.random() < 0.5 ? randi(2, 999) : ''}`;
      if (handles.has(handle) || /bot/i.test(handle)) continue;
      handles.add(handle);
      const email = `${handle.toLowerCase()}.${randomBytes(3).toString('hex')}@${EMAIL_DOMAIN}`;
      roster.push({ handle, email, color: COLORS[roster.length % COLORS.length] });
    }
    return roster;
  }
  // DEFAULT: a STABLE cohort keyed by slot, so re-running reuses the SAME bots
  // (Cognito user + profile + contest entries) instead of minting new ones —
  // that's what lets a second run top up trades in contests they're already in.
  // Handles are deterministic, varied (some numbered), unique, and never "bot".
  // adj index = i (distinct for the first 25); a coprime noun stride + a dedup
  // guard keep handles unique past 25 too.
  const seen = new Set();
  const roster = [];
  for (let i = 0; i < n; i++) {
    const a = ADJ[i % ADJ.length];
    const no = NOUN[(i * 7) % NOUN.length];
    const num = i % 2 === 0 ? '' : String(100 + (i * 37) % 900);
    let handle = `${a}${no}${num}`;
    if (seen.has(handle) || /bot/i.test(handle)) handle = `${a}${no}${i + 1}`;
    seen.add(handle);
    const email = `phantom-${String(i + 1).padStart(3, '0')}@${EMAIL_DOMAIN}`;
    roster.push({ handle, email, color: COLORS[i % COLORS.length] });
  }
  return roster;
}

async function findTable(prefix) {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) if (n.startsWith(`${prefix}-`) && n.endsWith('-NONE')) return n;
    next = res.LastEvaluatedTableName;
  } while (next);
  return null;
}
async function* scanAll(table) {
  let k;
  do { const o = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); for (const it of o.Items ?? []) yield unmarshall(it); k = o.LastEvaluatedKey; } while (k);
}

// ── Cognito ───────────────────────────────────────────────────────────────────
async function ensureUser(b) {
  if (DRY) return { ...b, sub: 'DRY', owner: `DRY::${b.email}` };
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL, Username: b.email, MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'email', Value: b.email }, { Name: 'email_verified', Value: 'true' }],
    }));
    await cog.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL, Username: b.email, Password: PASSWORD, Permanent: true }));
  } catch (e) { if (e.name !== 'UsernameExistsException') throw e; }
  const got = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: b.email }));
  const sub = got.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error(`no sub for ${b.email}`);
  return { ...b, sub, owner: `${sub}::${b.email}` };
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
// Retry on expired token (re-sign-in) AND on transient errors (AppSync throttle /
// 5xx / network). The latter matters a lot here: 8 bots writing entries + trades
// concurrently routinely trips throttling, and a swallowed failure used to leave
// a bot sitting all-cash in a contest. Up to 4 attempts with backoff + jitter.
async function gqlRetry(s, query, variables) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await gql(s.idToken, query, variables); }
    catch (e) {
      lastErr = e;
      if (e.unauthorized) { s.idToken = await signIn(s.bot.email); continue; }
      // Transient — back off and retry (250ms, 600ms, 1.2s + jitter).
      await sleep([250, 600, 1200][Math.min(attempt, 2)] + randi(0, 200));
    }
  }
  throw lastErr;
}

const Q_MY_PROFILE = `query { listUserProfiles(limit: 1) { items { id } } }`;
const M_CREATE_PROFILE = `mutation P($input: CreateUserProfileInput!) { createUserProfile(input: $input) { id } }`;
const M_UPDATE_PROFILE = `mutation P($input: UpdateUserProfileInput!) { updateUserProfile(input: $input) { id } }`;
const Q_MY_PUBLIC = `query Q($owner: String!) { listPublicProfiles(filter: { owner: { eq: $owner } }, limit: 1) { items { id } } }`;
const M_CREATE_PUBLIC = `mutation P($input: CreatePublicProfileInput!) { createPublicProfile(input: $input) { id } }`;
const M_UPDATE_PUBLIC = `mutation P($input: UpdatePublicProfileInput!) { updatePublicProfile(input: $input) { id } }`;
const Q_MY_ENTRIES = `query { listCompetitionEntries(limit: 200) { items { id competitionId } } }`;
const M_CREATE_ENTRY = `mutation E($input: CreateCompetitionEntryInput!) { createCompetitionEntry(input: $input) { id } }`;
const M_UPDATE_ENTRY = `mutation E($input: UpdateCompetitionEntryInput!) { updateCompetitionEntry(input: $input) { id } }`;
const M_CREATE_LIVE_TRADE = `mutation L($input: CreateLiveTradeInput!) { createLiveTrade(input: $input) { id } }`;

// ── coins + trade sim ─────────────────────────────────────────────────────────
async function loadCoins() {
  const tokenTable = await findTable('Token');
  if (!tokenTable) return FALLBACK_COINS.map((c) => ({ ...c }));
  const coins = [];
  for await (const t of scanAll(tokenTable)) {
    if (t.symbol && t.symbol !== 'USDC' && Number(t.lastPrice) > 0 && t.enabledForPractice !== false) coins.push({ symbol: t.symbol, price: Number(t.lastPrice) });
  }
  return coins.length >= 4 ? coins : FALLBACK_COINS.map((c) => ({ ...c }));
}
const priceOf = (coins, sym) => coins.find((c) => c.symbol === sym)?.price ?? 0;
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
// Churn a portfolio: SELL `n` coins it already holds, then REBUY `n` NEW coins —
// never re-buying a coin it just sold, and never selling a coin it just bought.
// The starting holdings are INITIALIZED (a pre-existing portfolio), NOT recorded
// as trades, so the only recorded trades are the n sells + n buys (the churn).
function churnPortfolio(coins, n) {
  const tradeable = shuffle(coins.filter((c) => c.symbol !== 'USDC' && c.price > 0));
  if (tradeable.length < 2) return { trades: [] };  // truly nothing to trade
  // Clamp the churn size to what's tradeable so a small coin list still produces
  // a real (never all-cash) portfolio instead of bailing out.
  n = Math.max(1, Math.min(n, tradeable.length - 1));
  // Starting basket bigger than n (so selling n doesn't empty it), leaving room
  // for n brand-new coins afterwards: basket B in [n, min(n+3, len-n)].
  const B = Math.max(n, Math.min(n + randi(0, 3), tradeable.length - n));
  const basket = tradeable.slice(0, B);
  const p = { cash: STARTING_CASH, holdings: [], trades: [] };
  // Pre-existing holdings (no trade rows — we must not "sell what we just bought").
  const per = (STARTING_CASH * rand(0.5, 0.75)) / B;
  for (const c of basket) {
    const units = per / c.price;
    p.holdings.push({ symbol: c.symbol, units, avgCost: c.price });
    p.cash -= per;
  }
  let ts = Date.now();
  // SELL n held coins.
  const sold = new Set();
  for (const c of basket.slice(0, n)) {
    const h = p.holdings.find((x) => x.symbol === c.symbol);
    if (!h) continue;
    const proceeds = h.units * c.price;
    p.cash += proceeds;
    p.holdings = p.holdings.filter((x) => x !== h);
    sold.add(c.symbol);
    p.trades.push({ symbol: c.symbol, side: 'sell', amount: round2(proceeds), units: round6(h.units), price: c.price, t: ts++ });
  }
  // BUY n NEW coins — not currently held, not just sold.
  const held = new Set(p.holdings.map((h) => h.symbol));
  const fresh = tradeable.filter((c) => !held.has(c.symbol) && !sold.has(c.symbol)).slice(0, n);
  const per2 = (p.cash * rand(0.4, 0.7)) / Math.max(1, fresh.length);
  for (const c of fresh) {
    const amount = Math.max(50, Math.min(p.cash, per2));
    if (amount < 50 || amount > p.cash) continue;
    const units = amount / c.price;
    p.holdings.push({ symbol: c.symbol, units, avgCost: c.price });
    p.cash -= amount;
    p.trades.push({ symbol: c.symbol, side: 'buy', amount: round2(amount), units: round6(units), price: c.price, t: ts++ });
  }
  const val = p.holdings.reduce((s, h) => s + h.units * (priceOf(coins, h.symbol) || h.avgCost), 0);
  p.bankroll = round2(p.cash + val);
  p.pnlPct = round2(((p.bankroll - STARTING_CASH) / STARTING_CASH) * 100);
  p.churn = { sold: [...sold], bought: fresh.map((c) => c.symbol) };
  return p;
}
const holdingsJson = (p) => JSON.stringify(p.holdings.map((h) => ({ symbol: h.symbol, units: round6(h.units), avgCost: round2(h.avgCost) })));

// ── presence ────────────────────────────────────────────────────────────────
async function touchPresence(s) {
  const nowIso = new Date().toISOString();
  if (s.profileId) await gqlRetry(s, M_UPDATE_PROFILE, { input: { id: s.profileId, lastActiveAt: nowIso } }).catch(() => {});
  if (s.publicId) await gqlRetry(s, M_UPDATE_PUBLIC, { input: { id: s.publicId, lastActiveAt: nowIso } }).catch(() => {});
}

// ── teardown ──────────────────────────────────────────────────────────────────
// Identify the cohort by their email domain (no roster file needed), then delete
// their owner-scoped rows across the data tables + the Cognito users.
async function listCohort() {
  const users = [];
  let token;
  do {
    const res = await cog.send(new ListUsersCommand({ UserPoolId: USER_POOL, Limit: 60, PaginationToken: token }));
    for (const u of res.Users ?? []) {
      const email = u.Attributes?.find((a) => a.Name === 'email')?.Value;
      const sub = u.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (email && email.endsWith(`@${EMAIL_DOMAIN}`)) users.push({ email, sub, username: u.Username });
    }
    token = res.PaginationToken;
  } while (token);
  return users;
}
const ownerSub = (owner) => (typeof owner === 'string' ? owner.split('::')[0] : null);
async function delById(table, id) {
  if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: table, Key: marshall({ id }) })).catch(() => {});
}
async function clean() {
  console.log(`Tearing down @${EMAIL_DOMAIN} players${DRY ? '  (dry-run)' : ''}…`);
  const cohort = await listCohort();
  const subs = new Set(cohort.map((u) => u.sub).filter(Boolean));
  console.log(`  found ${cohort.length} users.`);
  if (!cohort.length) return;

  // CONTEST HISTORY IS PRESERVED. A CompetitionEntry is the record of a player's
  // result in a contest (rank, final bankroll) — the leaderboard/winner of a
  // FINISHED contest is read from it. So we:
  //   • keep every FINISHED entry (isActive === false) — never wipe a result/winner,
  //   • delete only ACTIVE entries (ongoing participation),
  //   • and for any bot that HAS a finished entry, keep its UserProfile +
  //     PublicProfile + Cognito user too, so the winner stays a real, viewable
  //     record. Everything else (non-historical bots, the live feed) is removed.
  const entryTable = await findTable('CompetitionEntry');
  const historySubs = new Set();   // cohort subs with ≥1 finished contest entry
  const cohortEntries = [];
  if (entryTable) for await (const row of scanAll(entryTable)) {
    const s = ownerSub(row.owner);
    if (!s || !subs.has(s)) continue;
    cohortEntries.push({ table: entryTable, row });
    if (row.isActive === false) historySubs.add(s);
  }
  let entDel = 0, entKept = 0;
  for (const { table, row } of cohortEntries) {
    if (row.isActive === false) { entKept++; continue; } // finished → contest history, keep
    await delById(table, row.id); entDel++;              // active → remove participation
  }
  console.log(`  CompetitionEntry: ${DRY ? 'would delete' : 'deleted'} ${entDel} active · KEPT ${entKept} finished (history)`);

  // UserProfile / PublicProfile: keep the ones backing a contest result.
  for (const name of ['UserProfile', 'PublicProfile']) {
    const table = await findTable(name);
    if (!table) continue;
    let del = 0, kept = 0;
    for await (const row of scanAll(table)) {
      const s = ownerSub(row.owner);
      if (!s || !subs.has(s)) continue;
      if (historySubs.has(s)) { kept++; continue; }      // backs a result → keep viewable
      await delById(table, row.id); del++;
    }
    console.log(`  ${name}: ${DRY ? 'would delete' : 'deleted'} ${del} · kept ${kept} (history)`);
  }

  // Live feed + personal trade rows: never contest history → remove all cohort.
  for (const name of ['LiveTrade', 'Trade']) {
    const table = await findTable(name);
    if (!table) continue;
    let del = 0;
    for await (const row of scanAll(table)) {
      const s = ownerSub(row.owner);
      if (s && subs.has(s)) { await delById(table, row.id); del++; }
    }
    console.log(`  ${name}: ${DRY ? 'would delete' : 'deleted'} ${del}`);
  }

  // Cognito: delete only bots with NO contest history (keep the accounts behind
  // preserved results so the winner's profile/owner stays intact).
  let du = 0, ku = 0;
  for (const u of cohort) {
    if (u.sub && historySubs.has(u.sub)) { ku++; continue; }
    if (DRY) { du++; continue; }
    try { await cog.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL, Username: u.username })); du++; } catch { /* ignore */ }
  }
  console.log(`  Cognito: ${DRY ? 'would delete' : 'deleted'} ${du} users · kept ${ku} (history)`);
  console.log('Teardown done — contest results/winners preserved.');
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Seeding ${USERS} online players · join ${CONTESTS} soonest contests · ${TRADES > 0 ? `${TRADES}` : 'random 1–4'} churn trades each${DRY ? '  (dry-run)' : ''}`);
  const roster = makeRoster(USERS);
  if (roster.length < USERS) console.warn(`  (could only generate ${roster.length} unique handles)`);

  // Pick the N contests ending soonest (current live/open, XP/Lane-A only).
  const compTable = await findTable('Competition');
  const now = Date.now();
  const all = [];
  if (compTable) for await (const c of scanAll(compTable)) all.push(c);
  const soonest = all
    .filter((c) => c.status !== 'finished' && c.cashPrize !== true && new Date(c.endAt).getTime() > now)
    .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())
    .slice(0, CONTESTS)
    .map((c) => ({ id: c.id, name: c.name ?? 'Contest', endAt: c.endAt, prizeXp: Number(c.prizeXp) || 0 }));
  console.log(`Contests to join (${soonest.length}): ${soonest.map((c) => `${c.name} (ends ${c.endAt})`).join(', ') || 'none found'}`);
  if (!soonest.length) console.warn('  No joinable contests found — players will still be created + online.');

  console.log(`Provisioning ${roster.length} Cognito users…`);
  const ready = (await mapLimit(roster, 6, ensureUser)).filter((b) => !b.__error);
  console.log(`  ${ready.length}/${roster.length} ready.`);
  if (DRY) {
    writeRoster(ready.map((b) => ({ handle: b.handle, email: b.email, owner: b.owner, contests: soonest.map((c) => c.name) })), soonest);
    console.log('Dry-run: skipped login / join / trade / presence.');
    return;
  }

  console.log('Logging in, creating profiles, joining contests, trading, going online…');
  const states = (await mapLimit(ready, 8, async (b) => {
    const idToken = await signIn(b.email);
    const s = { bot: b, idToken };

    // Profile (leaderboard-visible so the player is discoverable + shows online).
    const mine = await gql(idToken, Q_MY_PROFILE, {});
    s.profileId = mine?.listUserProfiles?.items?.[0]?.id
      ?? (await gql(idToken, M_CREATE_PROFILE, { input: { handle: b.handle, xp: 0, cash: STARTING_CASH, bankroll: STARTING_CASH, holdingsJson: '[]', leaderboardVisible: true, riskScore: 100, avatarColor: b.color, lastActiveAt: new Date().toISOString() } })).createUserProfile.id;

    // Join the soonest contests. Reuse an existing entry if this bot is already
    // in the contest (owner-auth read returns only its own rows), so a second
    // run trades into the SAME entries instead of creating duplicates.
    const existingEntries = {};
    try {
      const er = await gqlRetry(s, Q_MY_ENTRIES, {});
      for (const it of er?.listCompetitionEntries?.items ?? []) existingEntries[it.competitionId] = it.id;
    } catch { /* no existing entries / first run */ }
    s.joined = [];
    for (const c of soonest) {
      try {
        const id = existingEntries[c.id]
          ?? (await gqlRetry(s, M_CREATE_ENTRY, { input: { competitionId: c.id, handle: b.handle, cash: STARTING_CASH, holdingsJson: '[]', tradesJson: '[]', bankroll: STARTING_CASH, pnlPct: 0, rank: 999, isActive: true, joinedAt: new Date().toISOString() } })).createCompetitionEntry.id;
        s.joined.push({ ...c, entryId: id });
      } catch { /* skip a contest that won't accept the entry */ }
    }

    // Trades: in EVERY joined contest the bot churns its OWN random 1–4 positions
    // — sell N held coins, rebuy N NEW ones — updating that contest's entry, so
    // each contest the bot is in shows real activity (not just one). A modest
    // sample is mirrored to the global Live-trades feed so it doesn't flood.
    s.tradeCount = 0;
    s.churns = [];                 // per-contest { contest, n, trades }
    s.recentTrades = [];
    const ttl = Math.floor(Date.now() / 1000) + 30 * 86400;
    let mirrored = false;
    for (const target of s.joined) {
      const n = tradesFor();       // independent random 1–4 per contest
      const p = churnPortfolio(coins, n);
      if (!p.trades.length) continue;
      await gqlRetry(s, M_UPDATE_ENTRY, { input: { id: target.entryId, cash: round2(p.cash), holdingsJson: holdingsJson(p), tradesJson: JSON.stringify(p.trades), bankroll: p.bankroll, pnlPct: p.pnlPct, isActive: true } }).catch(() => {});
      s.tradeCount += p.trades.length;
      s.churns.push({ contest: target.name, n, trades: p.trades.length });
      // Mirror only the first contest's churn to the global feed (keeps the live
      // ticker believable instead of flooding it with every bot×contest trade).
      if (!mirrored) {
        for (const tr of p.trades) {
          await gqlRetry(s, M_CREATE_LIVE_TRADE, { input: { feed: 'global', handle: b.handle, symbol: tr.symbol, side: tr.side, amountUsd: tr.amount, units: tr.units, price: tr.price, avatarColor: b.color, tradedAt: new Date(tr.t).toISOString(), expiresAt: ttl } }).catch(() => {});
        }
        s.recentTrades = p.trades.map((t) => ({ symbol: t.symbol, side: t.side, amount: t.amount, units: t.units, price: t.price, t: t.t }));
        mirrored = true;
      }
    }

    // Presence: create/refresh the PublicProfile (discoverable) + lastActiveAt now.
    const owned = await gql(s.idToken, Q_MY_PUBLIC, { owner: b.owner }).catch(() => null);
    const pubPayload = {
      handle: b.handle, league: 'Bronze', bankroll: STARTING_CASH, pnlPct: 0, winRate: 0,
      tradeCount: s.tradeCount, avatarColor: b.color,
      equityHistoryJson: JSON.stringify([{ t: Date.now(), v: STARTING_CASH }]),
      recentTradesJson: JSON.stringify(s.recentTrades ?? []), allocationJson: '[]',
      lastActiveAt: new Date().toISOString(),
    };
    s.publicId = owned?.listPublicProfiles?.items?.[0]?.id;
    if (s.publicId) await gqlRetry(s, M_UPDATE_PUBLIC, { input: { id: s.publicId, ...pubPayload } }).catch(() => {});
    else { try { s.publicId = (await gqlRetry(s, M_CREATE_PUBLIC, { input: pubPayload })).createPublicProfile.id; } catch { /* best effort */ } }

    return s;
  })).filter((s) => s && !s.__error);

  console.log(`  ${states.length}/${ready.length} players set up.`);

  // Roster file for the user's records.
  writeRoster(states.map((s) => ({
    handle: s.bot.handle, email: s.bot.email, owner: s.bot.owner,
    contests: s.joined?.map((c) => c.name) ?? [], trades: s.tradeCount ?? 0, perContest: s.churns ?? [],
  })), soonest);

  // Optionally keep them "online" by refreshing presence every 60s.
  if (ONLINE_MINUTES > 0 && states.length) {
    console.log(`\nKeeping ${states.length} players online for ${ONLINE_MINUTES} min (refreshing presence every 60s). Ctrl-C to stop.`);
    let stop = false;
    process.on('SIGINT', () => { stop = true; console.log('\nStopping presence refresh…'); });
    const until = Date.now() + ONLINE_MINUTES * 60_000;
    while (!stop && Date.now() < until) {
      await sleep(60_000);
      if (stop) break;
      await mapLimit(states, 8, touchPresence);
      console.log(`  presence refreshed (${new Date().toLocaleTimeString()})`);
    }
  }

  const totalTrades = states.reduce((a, s) => a + (s.tradeCount || 0), 0);
  console.log(`\nDone. ${states.length} players online, joined ${soonest.length} contest(s), traded ${totalTrades} positions across all joined contests (random 1–4 per contest, sell+rebuy). Leaderboards rerank within ~5 min.`);
}

let coins = [];
function writeRoster(rows, contests) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `online-bots-${stamp}.json`;
  const doc = {
    createdAt: new Date().toISOString(),
    count: rows.length,
    password: PASSWORD,
    emailDomain: EMAIL_DOMAIN,
    contestsJoined: contests.map((c) => ({ id: c.id, name: c.name, endAt: c.endAt })),
    players: rows,
  };
  writeFileSync(file, JSON.stringify(doc, null, 2));
  console.log(`\nRoster written to ${file} (${rows.length} players).`);
  console.log('Handles: ' + rows.map((r) => r.handle).join(', '));
}

// Re-dump the current @EMAIL_DOMAIN cohort (handles + emails) to a roster file,
// reconstructing handles from their UserProfile rows. Use when the original
// roster file was lost.
async function dumpRoster() {
  const cohort = await listCohort();
  const upTable = await findTable('UserProfile');
  const handleBySub = {};
  if (upTable) for await (const row of scanAll(upTable)) { const s = ownerSub(row.owner); if (s) handleBySub[s] = row.handle; }
  const rows = cohort.map((u) => ({ handle: handleBySub[u.sub] ?? '(unknown)', email: u.email, owner: u.sub ? `${u.sub}::${u.email}` : null }));
  console.log(`Re-dumping roster for ${rows.length} live players…`);
  writeRoster(rows, []);
}

(async () => {
  if (ROSTER) { await dumpRoster(); return; }
  if (CLEAN) { await clean(); return; }
  coins = await loadCoins();
  await main();
})().catch((e) => { console.error(e); process.exit(1); });
