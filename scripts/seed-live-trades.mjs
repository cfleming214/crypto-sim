#!/usr/bin/env node
// Seeds demo rows into the global LiveTrade feed so the Compete "Live trades"
// card has content. Rows carry a DynamoDB TTL (expiresAt) so they self-prune.
//   node scripts/seed-live-trades.mjs [count]
import { DynamoDBClient, ListTablesCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const COUNT = Math.max(1, Number(process.argv[2] ?? '16'));
const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

async function findTable(model) {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const n of res.TableNames ?? []) if (n.startsWith(`${model}-`) && n.endsWith('-NONE')) return n;
    next = res.LastEvaluatedTableName;
  } while (next);
  throw new Error(`table for ${model} not found — deploy the backend first`);
}

const BOTS = ['AvaWhale', 'MaxLeverage', 'DiamondHan', 'SatoshiJr', 'MoonLisa', 'ByteBaron', 'HodlQueen', 'GasFeeGary', 'PumpPriya', 'BearBetty'];
const COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
const COINS = [
  { s: 'BTC', p: 71000 }, { s: 'ETH', p: 3800 }, { s: 'SOL', p: 190 }, { s: 'DOGE', p: 0.16 },
  { s: 'BNB', p: 600 }, { s: 'XRP', p: 0.62 }, { s: 'AVAX', p: 38 }, { s: 'LINK', p: 18 },
];
const pick = (a, i) => a[i % a.length];
const rand = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

const table = await findTable('LiveTrade');
const now = Date.now();
let written = 0;
for (let i = 0; i < COUNT; i++) {
  const bot = pick(BOTS, i);
  const coin = pick(COINS, Math.floor(rand(i + 1) * COINS.length));
  const buy = rand(i + 7) > 0.45;
  const amountUsd = Math.round((200 + rand(i + 3) * 9800) / 10) * 10;
  const tradedAt = new Date(now - Math.floor(rand(i + 5) * 55 * 60_000)).toISOString(); // within last 55 min
  await ddb.send(new PutItemCommand({
    TableName: table,
    Item: marshall({
      id: randomUUID(),
      __typename: 'LiveTrade',
      owner: `live-trade-seed::${bot}`,
      feed: 'global',
      handle: bot,
      symbol: coin.s,
      side: buy ? 'buy' : 'sell',
      amountUsd,
      units: Number((amountUsd / coin.p).toFixed(6)),
      price: coin.p,
      avatarColor: pick(COLORS, i),
      tradedAt,
      expiresAt: Math.floor(now / 1000) + 2 * 86400,
      createdAt: tradedAt,
      updatedAt: tradedAt,
    }, { removeUndefinedValues: true }),
  }));
  written++;
}
console.log(`Seeded ${written} live trades into ${table}. Open Compete → "Live trades".`);
