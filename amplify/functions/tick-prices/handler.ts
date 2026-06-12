import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

interface Market {
  id?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  high_24h?: number;
  low_24h?: number;
  market_cap?: number;
  total_volume?: number;
  sparkline_in_7d?: { price?: number[] };
}

// Refreshes Token.lastPrice (+ 24h stats + sparkline) for every catalogued token
// from a single CoinGecko request. Runs on a 1-minute EventBridge schedule.
export const handler = async (): Promise<void> => {
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  if (!tokenTable) throw new Error('TOKEN_TABLE_NAME not set');

  // 1. Read the catalog: coingeckoId → list of row ids (a coin can appear once,
  // but be defensive about duplicate symbols).
  const idsByGecko: Record<string, string[]> = {};
  const geckoSet = new Set<string>();
  for await (const row of scanAll(tokenTable)) {
    const t = unmarshall(row) as { id?: string; coingeckoId?: string };
    if (!t.id || !t.coingeckoId) continue;
    (idsByGecko[t.coingeckoId] ||= []).push(t.id);
    geckoSet.add(t.coingeckoId);
  }
  if (geckoSet.size === 0) return;

  // 2. One batched CoinGecko request for every catalogued coin.
  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
  const ids = [...geckoSet].join(',');
  let markets: Market[] = [];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h&sparkline=true`,
      { headers },
    );
    if (!res.ok) { console.error('CoinGecko markets', res.status); return; }
    markets = (await res.json()) as Market[];
  } catch (err) {
    console.error('tick-prices fetch failed', err);
    return;
  }

  // 3. Write the live values back onto each matching Token row.
  const now = new Date().toISOString();
  const writes: Promise<unknown>[] = [];
  for (const m of markets) {
    if (!m?.id || typeof m.current_price !== 'number' || !(m.current_price > 0)) continue;
    const rowIds = idsByGecko[m.id];
    if (!rowIds) continue;
    const spark = (m.sparkline_in_7d?.price ?? []).slice(-24);
    const values = marshall({
      ':p': m.current_price,
      ':c': m.price_change_percentage_24h ?? 0,
      ':h': typeof m.high_24h === 'number' && m.high_24h > 0 ? m.high_24h : m.current_price,
      ':l': typeof m.low_24h === 'number' && m.low_24h > 0 ? m.low_24h : m.current_price,
      ':mc': m.market_cap ?? 0,
      ':v': m.total_volume ?? 0,
      ':s': JSON.stringify(spark),
      ':u': now,
    });
    for (const id of rowIds) {
      writes.push(ddb.send(new UpdateItemCommand({
        TableName: tokenTable,
        Key: marshall({ id }),
        UpdateExpression:
          'SET lastPrice = :p, change24h = :c, high24h = :h, low24h = :l, marketCapRaw = :mc, volumeRaw = :v, sparklineJson = :s, priceUpdatedAt = :u, updatedAt = :u',
        ExpressionAttributeValues: values,
      })).catch(err => console.error('token price write failed', id, err)));
    }
  }
  await Promise.all(writes);
};

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
