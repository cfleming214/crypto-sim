import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Two granularity tiers (see resource.ts / data schema). CoinGecko's market_chart
// auto-granularity ties resolution to the day range: days<=90 => hourly closes,
// days>90 => daily closes. So the 90-day hourly stream covers 7D/30D/90D and the
// 365-day daily stream covers 1Y. The Demo/public plan caps history at 365 days,
// so 'daily' uses exactly 365 (a larger value 401s).
const MODES = {
  hourly: { days: 90,  field: 'hourlyJson', tsField: 'hourlyUpdatedAt' },
  daily:  { days: 365, field: 'dailyJson',  tsField: 'dailyUpdatedAt'  },
} as const;

// Space requests so the catalog walk stays under CoinGecko's keyless BURST
// throttle. Keyless tolerates only a short burst before it 429s everything for a
// while, so coins late in a fast walk starve — 12s (~5/min) keeps us under it for
// the whole walk. With a demo key we can go much faster.
const SPACING_MS = process.env.COINGECKO_API_KEY ? 2500 : 12000;
// On a 429 we RETRY the same coin (rather than skip it) with escalating backoff,
// so one run actually populates the whole catalog instead of leaving gaps for the
// next run. Bounded so a coin that's persistently failing can't stall forever.
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [15000, 30000, 45000];

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface OhlcEvent { mode?: 'hourly' | 'daily' }

// Fetch one coin's market_chart, retrying on 429. Returns the prices array, or
// null if it never succeeded within MAX_ATTEMPTS.
async function fetchPrices(geckoId: string, days: number, headers: Record<string, string>): Promise<Array<[number, number]> | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`,
      { headers },
    );
    if (res.status === 429) {
      await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
      continue;
    }
    if (!res.ok) { console.error('tick-ohlc http', geckoId, res.status); return null; }
    const json = await res.json();
    const prices: Array<[number, number]> = Array.isArray(json?.prices) ? json.prices : [];
    return prices;
  }
  console.warn('tick-ohlc gave up after 429s', geckoId);
  return null;
}

// Scheduled by EventBridge (hourly + daily, see backend.ts). Refreshes one
// granularity tier per invocation based on event.mode (defaults to hourly).
export const handler = async (event: OhlcEvent = {}): Promise<{ mode: string; written: number }> => {
  const tokenTable = process.env.TOKEN_TABLE_NAME;
  const histTable = process.env.TOKEN_HISTORY_TABLE_NAME;
  if (!tokenTable || !histTable) throw new Error('TOKEN_TABLE_NAME / TOKEN_HISTORY_TABLE_NAME not set');

  const mode = event?.mode === 'daily' ? 'daily' : 'hourly';
  const { days, field, tsField } = MODES[mode];

  // 1. Catalog: symbol -> coingeckoId for every catalogued coin.
  const coins: Array<{ symbol: string; geckoId: string }> = [];
  for await (const row of scanAll(tokenTable)) {
    const t = unmarshall(row) as { symbol?: string; coingeckoId?: string };
    if (!t.symbol || !t.coingeckoId) continue;
    const symbol = t.symbol.toUpperCase();
    // USDC is the cash anchor (~$1, no meaningful chart) — skip to save a call.
    if (symbol === 'USDC') continue;
    coins.push({ symbol, geckoId: t.coingeckoId });
  }

  // Shuffle so that if the keyless throttle ever does bite mid-walk, the coins
  // left unfilled differ each run — across the hourly schedule every coin gets
  // covered instead of the same tail (in stable scan order) starving forever.
  for (let i = coins.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [coins[i], coins[j]] = [coins[j], coins[i]];
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;

  // 2. One market_chart request per coin, spaced out, written straight back onto
  // that symbol's TokenHistory row. A failed coin is skipped — the next run of
  // this cadence fills it in (the chart falls back to CoinGecko meanwhile).
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    try {
      const prices = await fetchPrices(c.geckoId, days, headers);
      if (!prices || prices.length < 2) { await sleep(SPACING_MS); continue; }

      await ddb.send(new UpdateItemCommand({
        TableName: histTable,
        Key: marshall({ symbol: c.symbol }),
        // Update only THIS tier's stream so the hourly and daily runs don't
        // clobber each other. __typename/createdAt are Amplify-managed non-null
        // fields the AppSync read path needs — set them on first create only.
        UpdateExpression:
          `SET ${field} = :h, ${tsField} = :u, coingeckoId = :g, updatedAt = :u, ` +
          '#tn = if_not_exists(#tn, :tn), createdAt = if_not_exists(createdAt, :u)',
        ExpressionAttributeNames: { '#tn': '__typename' },
        ExpressionAttributeValues: marshall({
          ':h': JSON.stringify(prices),
          ':u': now,
          ':g': c.geckoId,
          ':tn': 'TokenHistory',
        }),
      }));
      written++;
    } catch (err) {
      console.error('tick-ohlc fetch failed', c.symbol, err);
    }
    if (i < coins.length - 1) await sleep(SPACING_MS);
  }

  return { mode, written };
};

async function* scanAll(table: string) {
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    for (const item of out.Items ?? []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
