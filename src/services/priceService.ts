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

// Map UI timeframe labels to CoinGecko's `days` parameter for the OHLC endpoint.
// Allowed days: 1, 7, 14, 30, 90, 180, 365.
// Granularity returned: days=1 -> 30-min, days<=90 -> 4-hour, days>=180 -> 4-day.
const TIMEFRAME_DAYS: Record<string, number> = {
  '24H': 1,
  '7D':  7,
  '30D': 30,
  '90D': 90,
  '1Y':  365,
};

// Simple in-memory cache so changing timeframes doesn't hammer CoinGecko's
// free 30-req/min rate limit. Keyed by symbol+timeframe.
const ohlcCache = new Map<string, { fetchedAt: number; candles: OhlcCandle[] }>();
const OHLC_TTL_MS = 60 * 1000;

export async function fetchOhlc(symbol: string, timeframe: string): Promise<OhlcCandle[]> {
  const geckoId = COINGECKO_IDS[symbol];
  if (!geckoId) return [];
  const days = TIMEFRAME_DAYS[timeframe] ?? 1;
  const cacheKey = `${symbol}:${timeframe}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_TTL_MS) {
    return cached.candles;
  }
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`CoinGecko OHLC ${res.status}`);
    const raw = await res.json();
    const candles: OhlcCandle[] = (raw as unknown[]).map(arr => {
      const a = arr as [number, number, number, number, number];
      return { timestamp: a[0], open: a[1], high: a[2], low: a[3], close: a[4] };
    });
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
