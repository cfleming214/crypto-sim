#!/usr/bin/env node
/**
 * End-to-end load test: spin up N synthetic users (default 50), each trading
 * randomly for M minutes (default 10). Each bot keeps its own portfolio (cash +
 * holdings), and every trade flows through the real data paths:
 *   - a LiveTrade row  → shows in the Compete "Live trades" ticker
 *   - a UserProfile update (cash / bankroll / holdings / xp) → the
 *     tick-global-leaderboard cron re-ranks them into the global board
 * So it exercises the live feed AND the leaderboard recompute under continuous
 * write load. Bots are owner-prefixed "loadtest::" so cleanup is exact.
 *
 *   node scripts/loadtest-trades.mjs                 # 50 users, 10 min
 *   node scripts/loadtest-trades.mjs --users 50 --minutes 10 --rate 12
 *   node scripts/loadtest-trades.mjs --clean         # remove all loadtest data
 *
 * Requires AWS creds in env (or ~/.aws). Reads region from amplify_outputs.json.
 */
import { DynamoDBClient, ListTablesCommand, ScanCommand, PutItemCommand, DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const argVal = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const USERS = Math.max(1, Number(argVal('--users', '50')));
const MINUTES = Math.max(1, Number(argVal('--minutes', '10')));
const RATE = Math.max(2, Number(argVal('--rate', '12')));   // avg seconds between a bot's trades
const CLEAN = process.argv.includes('--clean');
const OWNER_PREFIX = 'loadtest';
const STARTING_CASH = 100_000;

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTables() {
  const want = ['UserProfile', 'LiveTrade', 'Token'];
  const out = {};
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) for (const m of want) if (n.startsWith(`${m}-`) && n.endsWith('-NONE')) out[m] = n;
    next = res.LastEvaluatedTableName;
  } while (next);
  for (const m of ['UserProfile', 'LiveTrade']) if (!out[m]) throw new Error(`table for ${m} not found — deploy the backend first`);
  return out;
}
async function* scanAll(table, extra = {}) {
  let k;
  do { const o = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k, ...extra })); for (const it of o.Items ?? []) yield it; k = o.LastEvaluatedKey; } while (k);
}

async function clean(tables) {
  let profiles = 0, trades = 0;
  for await (const raw of scanAll(tables.UserProfile, { ProjectionExpression: 'id, #o', ExpressionAttributeNames: { '#o': 'owner' } })) {
    const p = unmarshall(raw);
    if (String(p.owner || '').startsWith(`${OWNER_PREFIX}::`)) { await ddb.send(new DeleteItemCommand({ TableName: tables.UserProfile, Key: marshall({ id: p.id }) })); profiles++; }
  }
  if (tables.LiveTrade) for await (const raw of scanAll(tables.LiveTrade, { ProjectionExpression: 'id, #o', ExpressionAttributeNames: { '#o': 'owner' } })) {
    const t = unmarshall(raw);
    if (String(t.owner || '').startsWith(`${OWNER_PREFIX}::`)) { await ddb.send(new DeleteItemCommand({ TableName: tables.LiveTrade, Key: marshall({ id: t.id }) })); trades++; }
  }
  console.log(`Cleaned ${profiles} loadtest profiles + ${trades} live trades.`);
}

async function loadCoins(tables) {
  const coins = [];
  if (tables.Token) for await (const raw of scanAll(tables.Token)) {
    const t = unmarshall(raw);
    if (t.symbol && t.symbol !== 'USDC' && Number(t.lastPrice) > 0) coins.push({ s: t.symbol, p: Number(t.lastPrice) });
  }
  if (coins.length >= 4) return coins;
  return [{ s: 'BTC', p: 71000 }, { s: 'ETH', p: 3800 }, { s: 'SOL', p: 190 }, { s: 'DOGE', p: 0.16 }, { s: 'BNB', p: 600 }, { s: 'XRP', p: 0.62 }, { s: 'AVAX', p: 38 }, { s: 'LINK', p: 18 }];
}

const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function main() {
  console.log(`Region: ${REGION}`);
  const tables = await findTables();
  if (CLEAN) { await clean(tables); return; }

  const coins = await loadCoins(tables);
  const now = Date.now();
  console.log(`Using ${coins.length} coins. Creating ${USERS} bots…`);

  const bots = [];
  for (let i = 0; i < USERS; i++) {
    const handle = `LoadBot${String(i + 1).padStart(2, '0')}`;
    const bot = { id: randomUUID(), owner: `${OWNER_PREFIX}::${handle}`, handle, color: pick(COLORS), cash: STARTING_CASH, holdings: new Map(), xp: Math.floor(rnd(0, 40000)), nextAt: now + rnd(0, RATE * 1000) };
    bots.push(bot);
    await ddb.send(new PutItemCommand({
      TableName: tables.UserProfile, Item: marshall({
        id: bot.id, __typename: 'UserProfile', owner: bot.owner, handle, xp: bot.xp, league: pick(LEAGUES), division: Math.ceil(rnd(1, 3)), streak: Math.floor(rnd(0, 10)),
        cash: STARTING_CASH, bankroll: STARTING_CASH, riskScore: Math.floor(rnd(40, 100)), holdingsJson: '[]', avatarColor: bot.color, leaderboardVisible: true,
        createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
      }, { removeUndefinedValues: true }),
    }));
  }
  console.log(`Created ${bots.length} bots. Trading randomly for ${MINUTES} min (≈1 trade / ${RATE}s per bot)…`);

  const endAt = Date.now() + MINUTES * 60_000;
  let total = 0, lastLog = Date.now();
  while (Date.now() < endAt) {
    const t = Date.now();
    for (const bot of bots) {
      if (t < bot.nextAt) continue;
      bot.nextAt = t + rnd(RATE * 0.4, RATE * 1.6) * 1000;
      const coin = pick(coins);
      const has = bot.holdings.get(coin.s) || 0;
      const buy = has <= 0 ? true : Math.random() > 0.4;
      let amountUsd, units, side;
      if (buy) {
        const spend = Math.min(bot.cash, Math.round(rnd(0.05, 0.25) * bot.cash));
        if (spend < 10) continue;
        units = spend / coin.p; amountUsd = spend; side = 'buy';
        bot.cash -= spend; bot.holdings.set(coin.s, has + units);
      } else {
        const sellUnits = has * rnd(0.2, 1.0); const proceeds = sellUnits * coin.p;
        units = sellUnits; amountUsd = proceeds; side = 'sell';
        bot.cash += proceeds; const left = has - sellUnits; if (left <= 1e-9) bot.holdings.delete(coin.s); else bot.holdings.set(coin.s, left);
      }
      bot.xp += Math.floor(rnd(5, 30));
      const bankroll = bot.cash + [...bot.holdings].reduce((s, [sym, u]) => { const c = coins.find(x => x.s === sym); return s + (c ? c.p * u : 0); }, 0);
      const iso = new Date().toISOString();
      await ddb.send(new PutItemCommand({
        TableName: tables.LiveTrade, Item: marshall({
          id: randomUUID(), __typename: 'LiveTrade', owner: bot.owner, feed: 'global', handle: bot.handle, symbol: coin.s, side,
          amountUsd: Math.round(amountUsd * 100) / 100, units: Number(units.toFixed(6)), price: coin.p, avatarColor: bot.color,
          tradedAt: iso, expiresAt: Math.floor(Date.now() / 1000) + 2 * 86400, createdAt: iso, updatedAt: iso,
        }, { removeUndefinedValues: true }),
      }));
      const holdingsArr = [...bot.holdings].map(([symbol, u]) => ({ symbol, units: u, avgCost: coins.find(x => x.s === symbol)?.p || 0 }));
      await ddb.send(new UpdateItemCommand({
        TableName: tables.UserProfile, Key: marshall({ id: bot.id }),
        UpdateExpression: 'SET cash = :c, bankroll = :b, holdingsJson = :h, xp = :x, updatedAt = :u',
        ExpressionAttributeValues: marshall({ ':c': Math.round(bot.cash * 100) / 100, ':b': Math.round(bankroll * 100) / 100, ':h': JSON.stringify(holdingsArr), ':x': bot.xp, ':u': iso }),
      }));
      total++;
    }
    if (Date.now() - lastLog > 30_000) { console.log(`  …${total} trades so far, ${Math.round((endAt - Date.now()) / 1000)}s left`); lastLog = Date.now(); }
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(`\nDone. ${total} trades by ${bots.length} bots over ${MINUTES} min.`);
  console.log('Compete → "Live trades" shows the activity; the global leaderboard re-ranks within ~5 min.');
  console.log('Clean up when finished:  node scripts/loadtest-trades.mjs --clean');
}

main().catch(e => { console.error(e); process.exit(1); });
