#!/usr/bin/env node
/**
 * Seeds the Amplify Token catalog with the 25 tradeable coins the app ships with.
 *
 * Why this exists: the app boots on INITIAL_COINS (src/store/AppContext.tsx) but,
 * once online, fetchTokenCatalog() loads the Token table and SET_COINS REPLACES
 * the list with whatever the catalog returns (plus USDC + coins you hold). So a
 * coin only stays visible in the live app if it's enabled here. This script makes
 * the catalog match the 25-coin in-app fallback.
 *
 * It upserts by symbol (scans the table first, reuses the existing row id), so
 * reruns update rows in place instead of duplicating. USDC is intentionally NOT
 * seeded — it's the cash anchor, never a tradeable catalog entry.
 *
 * Requires AWS credentials in env (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_REGION) or a configured ~/.aws profile. Reads the region from
 * amplify_outputs.json and discovers the Token table by name.
 *
 * Usage:
 *   node scripts/seed-tokens.mjs
 *   node scripts/seed-tokens.mjs --dry-run    # show what it would write
 */
import {
  DynamoDBClient,
  ListTablesCommand,
  ScanCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');

const outputs = JSON.parse(readFileSync('./amplify_outputs.json', 'utf8'));
const REGION = outputs.auth?.aws_region ?? outputs.data?.aws_region ?? 'us-east-1';
const ddb = new DynamoDBClient({ region: REGION });

// The 25 tradeable coins — keep symbol + coingeckoId in sync with the app's
// INITIAL_COINS (src/store/AppContext.tsx) and DEFAULT_COINGECKO_IDS
// (src/services/priceService.ts). price/marketCap/volume are last-seed snapshots;
// the app's 10s CoinGecko poll provides live values on top.
const TOKENS = [
  { symbol: 'BTC',  name: 'Bitcoin',           coingeckoId: 'bitcoin',          rank: 1,  price: 65000,    marketCap: 1.28e12, volume: 28e9 },
  { symbol: 'ETH',  name: 'Ethereum',          coingeckoId: 'ethereum',         rank: 2,  price: 3500,     marketCap: 420e9,   volume: 15e9 },
  { symbol: 'BNB',  name: 'BNB',               coingeckoId: 'binancecoin',      rank: 4,  price: 600,      marketCap: 88e9,    volume: 2e9 },
  { symbol: 'SOL',  name: 'Solana',            coingeckoId: 'solana',           rank: 5,  price: 150,      marketCap: 70e9,    volume: 4e9 },
  { symbol: 'XRP',  name: 'XRP',               coingeckoId: 'ripple',           rank: 6,  price: 0.60,     marketCap: 33e9,    volume: 1.5e9 },
  { symbol: 'TRX',  name: 'TRON',              coingeckoId: 'tron',             rank: 8,  price: 0.27,     marketCap: 24e9,    volume: 0.7e9 },
  { symbol: 'DOGE', name: 'Dogecoin',          coingeckoId: 'dogecoin',         rank: 9,  price: 0.15,     marketCap: 21e9,    volume: 1.2e9 },
  { symbol: 'ADA',  name: 'Cardano',           coingeckoId: 'cardano',          rank: 10, price: 0.45,     marketCap: 16e9,    volume: 0.6e9 },
  { symbol: 'TON',  name: 'Toncoin',           coingeckoId: 'the-open-network', rank: 11, price: 7.5,      marketCap: 19e9,    volume: 0.4e9 },
  { symbol: 'AVAX', name: 'Avalanche',         coingeckoId: 'avalanche-2',      rank: 12, price: 35,       marketCap: 14e9,    volume: 0.5e9 },
  { symbol: 'SHIB', name: 'Shiba Inu',         coingeckoId: 'shiba-inu',        rank: 13, price: 0.000025, marketCap: 15e9,    volume: 0.5e9 },
  { symbol: 'LINK', name: 'Chainlink',         coingeckoId: 'chainlink',        rank: 14, price: 18,       marketCap: 11e9,    volume: 0.45e9 },
  { symbol: 'DOT',  name: 'Polkadot',          coingeckoId: 'polkadot',         rank: 15, price: 7,        marketCap: 10e9,    volume: 0.3e9 },
  { symbol: 'LTC',  name: 'Litecoin',          coingeckoId: 'litecoin',         rank: 16, price: 95,       marketCap: 7e9,     volume: 0.35e9 },
  { symbol: 'BCH',  name: 'Bitcoin Cash',      coingeckoId: 'bitcoin-cash',     rank: 17, price: 480,      marketCap: 9e9,     volume: 0.3e9 },
  { symbol: 'UNI',  name: 'Uniswap',           coingeckoId: 'uniswap',          rank: 18, price: 12,       marketCap: 9e9,     volume: 0.25e9 },
  { symbol: 'XLM',  name: 'Stellar',           coingeckoId: 'stellar',          rank: 19, price: 0.13,     marketCap: 4e9,     volume: 0.15e9 },
  { symbol: 'NEAR', name: 'NEAR Protocol',     coingeckoId: 'near',             rank: 20, price: 6.0,      marketCap: 7e9,     volume: 0.3e9 },
  { symbol: 'ICP',  name: 'Internet Computer', coingeckoId: 'internet-computer', rank: 21, price: 13,      marketCap: 6e9,     volume: 0.14e9 },
  { symbol: 'ATOM', name: 'Cosmos',            coingeckoId: 'cosmos',           rank: 22, price: 9.5,      marketCap: 4e9,     volume: 0.18e9 },
  { symbol: 'APT',  name: 'Aptos',             coingeckoId: 'aptos',            rank: 24, price: 11,       marketCap: 6e9,     volume: 0.25e9 },
  { symbol: 'AAVE', name: 'Aave',              coingeckoId: 'aave',             rank: 25, price: 110,      marketCap: 2e9,     volume: 0.2e9 },
  { symbol: 'FIL',  name: 'Filecoin',          coingeckoId: 'filecoin',         rank: 27, price: 6.0,      marketCap: 4e9,     volume: 0.16e9 },
  { symbol: 'OP',   name: 'Optimism',          coingeckoId: 'optimism',         rank: 28, price: 2.20,     marketCap: 3e9,     volume: 0.18e9 },
  { symbol: 'ARB',  name: 'Arbitrum',          coingeckoId: 'arbitrum',         rank: 30, price: 1.10,     marketCap: 4e9,     volume: 0.2e9 },
];

async function findTokenTable() {
  let next;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: next }));
    for (const name of res.TableNames ?? []) {
      if (name.startsWith('Token-') && name.endsWith('-NONE')) return name;
    }
    next = res.LastEvaluatedTableName;
  } while (next);
  return null;
}

// Map existing symbol → row id so reruns update in place instead of duplicating.
async function existingIdsBySymbol(table) {
  const map = new Map();
  let start;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table, ExclusiveStartKey: start,
      ProjectionExpression: '#id, #s',
      ExpressionAttributeNames: { '#id': 'id', '#s': 'symbol' },
    }));
    for (const it of res.Items ?? []) {
      if (it.symbol?.S) map.set(it.symbol.S.toUpperCase(), it.id.S);
    }
    start = res.LastEvaluatedKey;
  } while (start);
  return map;
}

async function main() {
  console.log(`Region: ${REGION}`);
  if (DRY) console.log('** DRY RUN — no writes **');

  console.log('\nDiscovering Token table…');
  const table = await findTokenTable();
  if (!table) throw new Error('Token table not found (looked for Token-*-NONE)');
  console.log(`  Token → ${table}`);

  const existing = DRY ? new Map() : await existingIdsBySymbol(table);
  console.log(`  ${existing.size} token row(s) already present`);

  const now = new Date().toISOString();
  let created = 0, updated = 0;
  console.log(`\nUpserting ${TOKENS.length} tokens…`);
  for (const t of TOKENS) {
    const id = existing.get(t.symbol) ?? randomUUID();
    const isUpdate = existing.has(t.symbol);
    const item = {
      __typename: 'Token',
      id,
      symbol: t.symbol,
      name: t.name,
      coingeckoId: t.coingeckoId,
      rank: t.rank,
      enabledForPractice: true,
      lastPrice: t.price,
      marketCapRaw: t.marketCap,
      volumeRaw: t.volume,
      lastSeededAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (!DRY) {
      await ddb.send(new PutItemCommand({ TableName: table, Item: marshall(item, { removeUndefinedValues: true }) }));
    }
    if (isUpdate) updated++; else created++;
    console.log(`  ${isUpdate ? '·' : '+'} ${t.symbol.padEnd(5)} ${t.name}`);
  }

  console.log(`\n✅ ${DRY ? 'Would upsert' : 'Upserted'} ${TOKENS.length} tokens (${created} new, ${updated} updated).`);
  console.log('   Open the app → Markets to see all 25 (live prices arrive within ~10s).');
  if (DRY) console.log('\n(With --dry-run nothing was written.)');
}

main().catch(e => { console.error(e); process.exit(1); });
