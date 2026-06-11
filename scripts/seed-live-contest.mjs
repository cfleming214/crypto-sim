#!/usr/bin/env node
/**
 * Seeds the live Amplify sandbox with believable "other players" so you can log
 * in on your phone and see contests that look busy.
 *
 * Every run it:
 *   1. Ensures 10 fixed test users exist in Cognito (created once, then reused —
 *      it never makes new accounts on later runs).
 *   2. Removes the contests + entries it created on a previous run (matched by
 *      createdBy = "seed-script"), so reruns don't pile up.
 *   3. Creates three fresh contests:
 *        A) "🔥 10-Minute Sprint"  — live now, 10 min long, 15 spots (10 bots
 *           join → 5 left for YOU), join-live allowed.
 *        B) "📈 3-Day Showdown"    — live now, 3 days long, all 10 bots join.
 *        C) "⏳ Tomorrow's Lockout" — opens in 24h, lockAfterStart=true (you can
 *           join during the countdown, but nobody can join once it starts).
 *   4. For A and B, gives each of the 10 bots a random portfolio of available
 *      coins and a CompetitionEntry so they show on the contest leaderboard.
 *      It also writes each bot a UserProfile so they surface on the global
 *      leaderboard once the tick-global-leaderboard Lambda next runs (~5 min).
 *
 * Requires AWS credentials in env (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_REGION) or a configured ~/.aws profile. Reads table names + the Cognito
 * user pool id from amplify_outputs.json.
 *
 * Usage:
 *   node scripts/seed-live-contest.mjs
 *   node scripts/seed-live-contest.mjs --dry-run    # show what it would do
 *   node scripts/seed-live-contest.mjs --append     # ADD a fresh batch, keep
 *                                                   # everything already seeded
 *                                                   # (load-test the AWS stack
 *                                                   # by piling contests up)
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
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

const DRY = process.argv.includes('--dry-run');
// --append keeps every prior seed batch and adds a fresh one on top, so contests
// accumulate run-over-run for load-testing the AWS stack. Without it, each run
// wipes the previous seed batch first (the default "stay clean" behaviour).
const APPEND = process.argv.includes('--append');

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION    = outputs.auth?.aws_region ?? 'us-east-1';
const USER_POOL = outputs.auth?.user_pool_id;
if (!USER_POOL) throw new Error('Could not read user_pool_id from amplify_outputs.json');

const cog = new CognitoIdentityProviderClient({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });

// ── Tunables ────────────────────────────────────────────────────────────────
const STARTING_CASH = 100_000;           // must match the app's STARTING_CASH
const SEED_PASSWORD = 'SeedBot!2026';    // fixed password for every bot account
const CREATED_BY    = 'seed-script';     // marker so reruns can find + replace
const MINUTE = 60 * 1000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

// The 10 fixed bots. Emails never change → accounts are reused across runs.
const BOTS = [
  { email: 'seedbot01@cryptocomp.app', handle: 'AvaWhale',    color: '#6366F1', league: 'Gold' },
  { email: 'seedbot02@cryptocomp.app', handle: 'MaxLeverage', color: '#EC4899', league: 'Silver' },
  { email: 'seedbot03@cryptocomp.app', handle: 'DiamondHan',  color: '#10B981', league: 'Diamond' },
  { email: 'seedbot04@cryptocomp.app', handle: 'SatoshiJr',   color: '#F59E0B', league: 'Platinum' },
  { email: 'seedbot05@cryptocomp.app', handle: 'MoonLina',    color: '#3B82F6', league: 'Bronze' },
  { email: 'seedbot06@cryptocomp.app', handle: 'HodlKing',    color: '#8B5CF6', league: 'Gold' },
  { email: 'seedbot07@cryptocomp.app', handle: 'PaperCutz',   color: '#EF4444', league: 'Silver' },
  { email: 'seedbot08@cryptocomp.app', handle: 'GweiGuru',    color: '#14B8A6', league: 'Platinum' },
  { email: 'seedbot09@cryptocomp.app', handle: 'AlphaSeeka',  color: '#F97316', league: 'Bronze' },
  { email: 'seedbot10@cryptocomp.app', handle: 'NakamotoZ',   color: '#0EA5E9', league: 'Diamond' },
];

// Fallback coin universe if the Token catalog table is empty.
const FALLBACK_COINS = [
  { symbol: 'BTC', price: 68000 }, { symbol: 'ETH', price: 3500 },
  { symbol: 'SOL', price: 165 },   { symbol: 'BNB', price: 600 },
  { symbol: 'XRP', price: 0.62 },  { symbol: 'DOGE', price: 0.15 },
  { symbol: 'ADA', price: 0.45 },  { symbol: 'AVAX', price: 36 },
  { symbol: 'LINK', price: 18 },   { symbol: 'MATIC', price: 0.72 },
];

// ── helpers ───────────────────────────────────────────────────────────────
const rand  = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick  = (arr) => arr[randi(0, arr.length - 1)];

async function findTables() {
  const want = ['Competition', 'CompetitionEntry', 'UserProfile', 'Token'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      for (const m of want) {
        // exact model prefix ("Competition-" must not swallow "CompetitionEntry-")
        if (name.startsWith(`${m}-`) && name.endsWith('-NONE')) out[m] = name;
      }
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  for (const m of want) if (!out[m]) console.warn(`  ! table for ${m} not found`);
  return out;
}

// Create the bot in Cognito if missing; return its sub. Idempotent.
async function ensureUser(bot) {
  // In dry-run, don't create accounts — just look up an existing sub if present.
  if (DRY) {
    try {
      const got = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: bot.email }));
      const sub = got.UserAttributes?.find(a => a.Name === 'sub')?.Value ?? 'DRY-SUB';
      console.log(`  · ${bot.email} (exists)`);
      return { sub, owner: `${sub}::${bot.email}` };
    } catch {
      console.log(`  + ${bot.email} (would create)`);
      return { sub: 'DRY-SUB', owner: `DRY-SUB::${bot.email}` };
    }
  }
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL,
      Username: bot.email,
      MessageAction: 'SUPPRESS', // never email the fake users
      UserAttributes: [
        { Name: 'email', Value: bot.email },
        { Name: 'email_verified', Value: 'true' },
      ],
    }));
    await cog.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL,
      Username: bot.email,
      Password: SEED_PASSWORD,
      Permanent: true,
    }));
    console.log(`  + created ${bot.email}`);
  } catch (e) {
    if (e.name !== 'UsernameExistsException') throw e;
    console.log(`  · reuse  ${bot.email}`);
  }
  const got = await cog.send(new AdminGetUserCommand({ UserPoolId: USER_POOL, Username: bot.email }));
  const sub = got.UserAttributes?.find(a => a.Name === 'sub')?.Value;
  if (!sub) throw new Error(`no sub for ${bot.email}`);
  // Amplify Gen2 owner is "{sub}::{username}"; this pool's username is the email.
  return { sub, owner: `${sub}::${bot.email}` };
}

async function loadCoins(tokenTable) {
  if (!tokenTable) return FALLBACK_COINS;
  const coins = [];
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tokenTable,
      ExclusiveStartKey: start,
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
  return coins.length >= 4 ? coins : FALLBACK_COINS;
}

// A random portfolio funded with STARTING_CASH; returns { cash, holdings, bankroll, pnlPct }.
function randomPortfolio(coins) {
  const n = randi(2, 5);
  const chosen = [];
  const pool = [...coins];
  for (let i = 0; i < n && pool.length; i++) chosen.push(pool.splice(randi(0, pool.length - 1), 1)[0]);

  let invested = 0, currentValue = 0;
  const holdings = chosen.map(c => {
    const alloc = STARTING_CASH * rand(0.08, 0.22);   // 8–22% of stack per position
    const gain  = rand(0.78, 1.45);                   // pretend the price has moved since entry
    const units = alloc / c.price;
    invested += alloc;
    currentValue += alloc * gain;
    return { symbol: c.symbol, units: Number(units.toFixed(6)), avgCost: c.price };
  });
  const cash = Math.max(0, STARTING_CASH - invested);
  const bankroll = cash + currentValue;
  const pnlPct = ((bankroll - STARTING_CASH) / STARTING_CASH) * 100;
  return { cash, holdings, bankroll, pnlPct };
}

function competitionItem({ id, name, startAt, endAt, maxPlayers, lockAfterStart }) {
  const now = Date.now();
  const status = startAt <= now ? 'live' : 'open';
  return {
    __typename: 'Competition',
    id, name,
    type: 'featured',
    status,
    prizePool: '5,000 XP',
    maxPlayers,
    stake: 'Free',
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    entryCount: 0,
    numberOfPrizes: 3,
    prizesJson: '[]',
    prizeXp: 5000,
    lockAfterStart: !!lockAfterStart,
    createdBy: CREATED_BY,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

async function put(table, item) {
  if (DRY) return;
  await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
}

// Delete prior seed contests + their entries so reruns stay clean.
async function clearPriorSeed(tables) {
  // 1. find seed competitions
  const seedCompIds = new Set();
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tables.Competition, ExclusiveStartKey: start,
      ProjectionExpression: '#id, createdBy',
      ExpressionAttributeNames: { '#id': 'id' },
    }));
    for (const it of res.Items ?? []) {
      if (it.createdBy?.S === CREATED_BY) seedCompIds.add(it.id.S);
    }
    start = res.LastEvaluatedKey;
  } while (start);

  // 2. delete their entries
  let entriesDeleted = 0;
  if (tables.CompetitionEntry && seedCompIds.size) {
    let s2;
    do {
      const res = await ddb.send(new ScanCommand({
        TableName: tables.CompetitionEntry, ExclusiveStartKey: s2,
        ProjectionExpression: '#id, competitionId',
        ExpressionAttributeNames: { '#id': 'id' },
      }));
      for (const it of res.Items ?? []) {
        if (seedCompIds.has(it.competitionId?.S)) {
          if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.CompetitionEntry, Key: marshall({ id: it.id.S }) }));
          entriesDeleted++;
        }
      }
      s2 = res.LastEvaluatedKey;
    } while (s2);
  }

  // 3. delete the competitions
  for (const id of seedCompIds) {
    if (!DRY) await ddb.send(new DeleteItemCommand({ TableName: tables.Competition, Key: marshall({ id }) }));
  }
  console.log(`  cleared ${seedCompIds.size} prior seed contest(s) + ${entriesDeleted} entr${entriesDeleted === 1 ? 'y' : 'ies'}`);
}

async function main() {
  console.log(`Region: ${REGION}`);
  console.log(`User pool: ${USER_POOL}`);
  if (DRY) console.log('** DRY RUN — no writes **');

  console.log('\nDiscovering tables…');
  const tables = await findTables();
  for (const [m, t] of Object.entries(tables)) console.log(`  ${m} → ${t}`);
  if (!tables.Competition || !tables.CompetitionEntry) throw new Error('Missing Competition/CompetitionEntry tables');

  console.log('\nEnsuring 10 bot accounts…');
  const bots = [];
  for (const b of BOTS) bots.push({ ...b, ...(await ensureUser(b)) });

  console.log('\nLoading coin universe…');
  const coins = await loadCoins(tables.Token);
  console.log(`  ${coins.length} coins available`);

  if (APPEND) {
    console.log('\n(--append) keeping all prior seed data — adding a fresh batch on top.');
  } else {
    console.log('\nClearing prior seed data…');
    await clearPriorSeed(tables);
  }

  // Build the contests. When appending, tag each name with a short run id so
  // accumulated batches are distinguishable on screen (and don't look like
  // duplicates). All batches stay tagged createdBy=seed-script, so a later
  // default (non-append) run still cleans every one of them up.
  const now = Date.now();
  const tag = APPEND ? ` #${new Date(now).toISOString().slice(11, 19)}` : '';
  const contests = [
    { item: competitionItem({ id: randomUUID(), name: `🔥 10-Minute Sprint${tag}`, startAt: now, endAt: now + 10 * MINUTE, maxPlayers: 15, lockAfterStart: false }), joinAll: true },
    { item: competitionItem({ id: randomUUID(), name: `📈 3-Day Showdown${tag}`,   startAt: now, endAt: now + 3 * DAY,    maxPlayers: 20, lockAfterStart: false }), joinAll: true },
    // 1-hour, 20-player cap, 5,000 XP, $100K starting portfolio (the default).
    // All 10 bots join → 10 spots left for real players.
    { item: competitionItem({ id: randomUUID(), name: `⚡ 1-Hour Dash${tag}`, startAt: now, endAt: now + HOUR, maxPlayers: 20, lockAfterStart: false }), joinAll: true },
    { item: competitionItem({ id: randomUUID(), name: `⏳ Tomorrow's Lockout${tag}`, startAt: now + 24 * HOUR, endAt: now + 24 * HOUR + 2 * DAY, maxPlayers: 50, lockAfterStart: true }), joinAll: false },
  ];

  console.log('\nCreating contests + entries…');
  for (const { item, joinAll } of contests) {
    const entries = joinAll ? bots.length : 0;
    item.entryCount = entries;
    await put(tables.Competition, item);
    console.log(`  ${item.name}  [${item.status}${item.lockAfterStart ? ', 🔒 lock-after-start' : ''}]  cap ${item.maxPlayers}  ${entries} bot entries`);
    if (!joinAll) continue;
    for (const bot of bots) {
      const pf = randomPortfolio(coins);
      await put(tables.CompetitionEntry, {
        __typename: 'CompetitionEntry',
        id: randomUUID(),
        competitionId: item.id,
        handle: bot.handle,
        bankroll: Number(pf.bankroll.toFixed(2)),
        pnlPct: Number(pf.pnlPct.toFixed(2)),
        rank: 999,
        joinedAt: new Date(now).toISOString(),
        isActive: true,
        cash: Number(pf.cash.toFixed(2)),
        holdingsJson: JSON.stringify(pf.holdings),
        tradesJson: '[]',
        owner: bot.owner,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      });
    }
  }

  // Give each bot a UserProfile so they appear on the global leaderboard too.
  console.log('\nWriting bot UserProfiles (for the global leaderboard)…');
  if (tables.UserProfile) {
    for (const bot of bots) {
      const pf = randomPortfolio(coins);
      await put(tables.UserProfile, {
        __typename: 'UserProfile',
        id: randomUUID(),
        handle: bot.handle,
        xp: randi(500, 8000),
        league: bot.league,
        division: randi(1, 2),
        streak: randi(0, 12),
        cash: Number(pf.cash.toFixed(2)),
        bankroll: Number(pf.bankroll.toFixed(2)),
        riskScore: randi(20, 100),
        holdingsJson: JSON.stringify(pf.holdings),
        avatarColor: bot.color,
        leaderboardVisible: true,
        gamificationJson: '{}',
        owner: bot.owner,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      });
    }
    console.log(`  wrote ${bots.length} profiles`);
  }

  console.log('\n✅ Done.');
  console.log('   • Open the app → Compete. Join "🔥 10-Minute Sprint" (5 spots left) to play against the bots.');
  console.log('   • "📈 3-Day Showdown" has all 10 bots already in it.');
  console.log('   • "⚡ 1-Hour Dash" — 1h, 20-player cap, 5,000 XP, all 10 bots in (10 spots left).');
  console.log("   • \"⏳ Tomorrow's Lockout\" starts in 24h and locks at start (try joining before vs after).");
  console.log('   • Global leaderboard fills in within ~5 min (after tick-global-leaderboard runs).');
  if (DRY) console.log('\n(With --dry-run nothing was written.)');
}

main().catch(e => { console.error(e); process.exit(1); });
