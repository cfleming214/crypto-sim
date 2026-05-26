export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  marketCapRaw: number;
  volumeRaw: number;
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const COINGECKO_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  DOGE: 'dogecoin',
  PEPE: 'pepe',
};

// Map UI timeframe labels to CoinGecko's `days` parameter for the
// market_chart endpoint. Granularity is auto-determined by days:
//   days=1   -> 5-minute close prices  (~288 points)
//   days<=90 -> hourly close prices
//   days>90  -> daily close prices
const TIMEFRAME_DAYS: Record<string, number> = {
  '24H': 1,
  '7D':  7,
  '30D': 30,
  '90D': 90,
  '1Y':  365,
};

// 5-min cache so flipping timeframes / coming back to a coin doesn't burn
// the free-tier rate budget. Keyed by symbol+timeframe.
const ohlcCache = new Map<string, { fetchedAt: number; candles: OhlcCandle[] }>();
const OHLC_TTL_MS = 5 * 60 * 1000;

// Most recent rate-limit hit timestamp — prevents a flurry of follow-up
// requests after one 429.
let rateLimitedUntil = 0;

export async function fetchOhlc(symbol: string, timeframe: string): Promise<OhlcCandle[]> {
  const geckoId = COINGECKO_IDS[symbol];
  if (!geckoId) return [];
  const days = TIMEFRAME_DAYS[timeframe] ?? 1;
  const cacheKey = `${symbol}:${timeframe}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_TTL_MS) {
    return cached.candles;
  }
  // If a recent request got 429'd, don't issue another for 60s — just return
  // whatever cache we have (possibly empty) and let the chart show empty.
  if (Date.now() < rateLimitedUntil) {
    return cached?.candles ?? [];
  }
  try {
    // market_chart returns close prices at fine granularity and is much more
    // forgiving rate-limit-wise than the /ohlc endpoint.
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`,
      { headers: { Accept: 'application/json' } },
    );
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + 60 * 1000;
      console.warn('CoinGecko market_chart 429 — backing off 60s');
      return cached?.candles ?? [];
    }
    if (!res.ok) throw new Error(`CoinGecko market_chart ${res.status}`);
    const json = await res.json();
    const prices: Array<[number, number]> = json.prices ?? [];

    // Synthesize candles from close prices: each entry becomes a candle where
    // open = previous close, close = this close, high/low = min/max of the
    // pair. This produces honest price-action bars with no wicks (no real
    // intra-bar high/low data from this endpoint).
    const candles: OhlcCandle[] = [];
    for (let i = 1; i < prices.length; i++) {
      const open  = prices[i - 1][1];
      const close = prices[i][1];
      candles.push({
        timestamp: prices[i][0],
        open,
        high: Math.max(open, close),
        low:  Math.min(open, close),
        close,
      });
    }
    ohlcCache.set(cacheKey, { fetchedAt: Date.now(), candles });
    return candles;
  } catch (e) {
    console.warn('fetchOhlc failed:', e);
    return cached?.candles ?? [];
  }
}

export function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

export async function fetchPrices(): Promise<PriceData[]> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();

  // Drop entries CoinGecko didn't return a real price for. Falling back to 0
  // would zero out the user's holdings in that coin and crash their bankroll
  // on the next UPDATE_PRICES.
  return Object.entries(COINGECKO_IDS)
    .filter(([, geckoId]) => typeof json[geckoId]?.usd === 'number' && json[geckoId].usd > 0)
    .map(([symbol, geckoId]) => ({
      symbol,
      price:        json[geckoId].usd,
      change24h:    json[geckoId].usd_24h_change   ?? 0,
      marketCapRaw: json[geckoId].usd_market_cap   ?? 0,
      volumeRaw:    json[geckoId].usd_24h_vol      ?? 0,
    }));
}
