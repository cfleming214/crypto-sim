export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  marketCapRaw: number;
  volumeRaw: number;
  sparkline24h: number[];  // hourly closes for the last ~24 hours
  high24h: number;
  low24h: number;
}

export interface GlobalMarketStats {
  totalMarketCap: number;
  change24h: number;
}

export interface FearGreedReading {
  value: number;   // 0..100
  label: string;   // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Symbol → CoinGecko id. Mutable so the live Token catalog (populated from
// the crypto-dashboard admin) can rebuild it at runtime via setCoingeckoIds().
//
// These defaults cover USDC (the tick simulator's stability anchor) plus the
// built-in seed coins (see INITIAL_COINS) using their canonical CoinGecko ids.
// Without an id a coin gets no live price and no real chart history — fetchOhlc
// bails and the chart silently shows fabricated candles. Seeding the well-known
// ids here means every default coin has real prices + history out of the box,
// before (or entirely without) the dashboard catalog; the catalog merges on top.
const DEFAULT_COINGECKO_IDS: Record<string, string> = {
  USDC: 'usd-coin',
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  BNB:  'binancecoin',
  XRP:  'ripple',
  DOGE: 'dogecoin',
  ADA:  'cardano',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  DOT:  'polkadot',
  TRX:  'tron',
  TON:  'the-open-network',
  SHIB: 'shiba-inu',
  LTC:  'litecoin',
  BCH:  'bitcoin-cash',
  UNI:  'uniswap',
  ATOM: 'cosmos',
  XLM:  'stellar',
  NEAR: 'near',
  APT:  'aptos',
  ARB:  'arbitrum',
  OP:   'optimism',
  FIL:  'filecoin',
  ICP:  'internet-computer',
  AAVE: 'aave',
};

let COINGECKO_IDS: Record<string, string> = { ...DEFAULT_COINGECKO_IDS };

// CoinGecko Demo (free) API key, read from EXPO_PUBLIC_COINGECKO_API_KEY (kept
// in gitignored .env.local for local builds; set it as an EAS env var for cloud
// builds — never committed to source). It is attached to EVERY CoinGecko request
// via cgHeaders() (fetchOhlc / fetchPrices / fetchGlobalMarketStats) as the
// `x-cg-demo-api-key` header against api.coingecko.com. The keyless tier 429s
// after ~5 burst requests, which starves the charts and the 10s price poll, so
// the key matters; absent key → no header → keyless fallback (rate-limited).
// (A Pro key would use pro-api.coingecko.com + x-cg-pro-api-key.)
const COINGECKO_API_KEY = process.env.EXPO_PUBLIC_COINGECKO_API_KEY;

function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
  return headers;
}

export function setCoingeckoIds(map: Record<string, string>) {
  // Merge the catalog over the built-in defaults: catalog coins are added and
  // may override an id, but the seed coins keep real price/history support even
  // when the catalog omits them. USDC stays present as the stability anchor —
  // the price tick logic assumes USDC sits in state.coins at all times.
  COINGECKO_IDS = { ...DEFAULT_COINGECKO_IDS, ...map };
}

// Map UI timeframe labels to CoinGecko's `days` parameter for the
// market_chart endpoint. Granularity is auto-determined by days:
//   days=1   -> 5-minute close prices  (~288 points)
//   days<=90 -> hourly close prices
//   days>90  -> daily close prices
//   days=max -> daily close prices back to the coin's listing date
const TIMEFRAME_DAYS: Record<string, number | string> = {
  '24H': 1,
  '7D':  7,
  '30D': 30,
  '90D': 90,
  '1Y':  365,
  // The Demo/public plan rejects days>365 (and days=max) with a 401, which left
  // the chart empty. Cap at 365 so a stray "MAX" still loads the full allowed
  // range instead of failing. True all-time history needs a CoinGecko paid plan.
  'MAX': 365,
};

// 5-min cache so flipping timeframes / coming back to a coin doesn't burn
// the free-tier rate budget. Keyed by symbol+timeframe.
const ohlcCache = new Map<string, { fetchedAt: number; candles: OhlcCandle[] }>();
const OHLC_TTL_MS = 5 * 60 * 1000;

// Most recent rate-limit hit timestamp — prevents a flurry of follow-up
// requests after one 429.
let rateLimitedUntil = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

// Synthesize candles from a [[ms, price], ...] close series: each entry becomes
// a candle where open = previous close, close = this close, high/low = min/max of
// the pair. Honest price-action bars with no wicks (the close series carries no
// real intra-bar high/low). Shared by the backend and CoinGecko paths.
function candlesFromCloses(prices: Array<[number, number]>): OhlcCandle[] {
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
  return candles;
}

// Backend-first: serve the chart from our server-cached TokenHistory (refreshed
// by the tick-ohlc Lambda) so devices stop hitting the shared CoinGecko key. The
// 90-day hourly stream covers 7D/30D/90D by timestamp-slicing; the 365-day daily
// stream covers 1Y. Returns null on any miss so the CoinGecko path takes over.
async function fetchOhlcFromBackend(symbol: string, timeframe: string): Promise<OhlcCandle[] | null> {
  try {
    const { fetchTokenHistory } = await import('./tokenCatalog');
    const series = await fetchTokenHistory(symbol);
    if (!series) return null;
    const long = timeframe === '1Y' || timeframe === 'MAX';
    const source = long ? series.daily : series.hourly;
    if (!source || source.length < 2) return null;
    // Slice the hourly stream down to the requested window; the daily stream is
    // already the full 1Y so it's used whole.
    const days = TIMEFRAME_DAYS[timeframe];
    const nDays = typeof days === 'number' ? days : 365;
    const cutoff = Date.now() - nDays * DAY_MS;
    const sliced = source.filter(p => p[0] >= cutoff);
    const use = sliced.length >= 2 ? sliced : source;
    return candlesFromCloses(use);
  } catch {
    return null;
  }
}

export async function fetchOhlc(symbol: string, timeframe: string): Promise<OhlcCandle[]> {
  const geckoId = COINGECKO_IDS[symbol];
  if (!geckoId) return [];
  const days = TIMEFRAME_DAYS[timeframe] ?? 1;
  const cacheKey = `${symbol}:${timeframe}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_TTL_MS) {
    return cached.candles;
  }

  // 1. Our backend cache first (one shared fetch for the whole user base).
  const fromBackend = await fetchOhlcFromBackend(symbol, timeframe);
  if (fromBackend && fromBackend.length > 0) {
    ohlcCache.set(cacheKey, { fetchedAt: Date.now(), candles: fromBackend });
    return fromBackend;
  }

  // 2. CoinGecko direct (guests, an un-warmed cache, or a missing symbol).
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
      { headers: cgHeaders() },
    );
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + 60 * 1000;
      console.warn('CoinGecko market_chart 429 — backing off 60s');
      return cached?.candles ?? [];
    }
    if (!res.ok) throw new Error(`CoinGecko market_chart ${res.status}`);
    const json = await res.json();
    const prices: Array<[number, number]> = json.prices ?? [];
    const candles = candlesFromCloses(prices);
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
  // Honor the shared 429 backoff so the guest fallback path doesn't hammer a
  // rate-limited key every poll (returns [] → caller keeps last prices).
  if (Date.now() < rateLimitedUntil) return [];
  const ids = Object.values(COINGECKO_IDS).join(',');
  // /coins/markets returns prices, market cap, volume, AND a 7-day hourly
  // sparkline for every coin in a single request — same rate-limit cost as
  // /simple/price but with the sparkline series included for free.
  let json: any[];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h&sparkline=true`,
      { headers: cgHeaders() },
    );
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + 60 * 1000;
      console.warn('CoinGecko markets 429 — backing off 60s');
      return [];
    }
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    json = await res.json() as any[];
  } catch (e) {
    console.warn('fetchPrices failed:', e);
    return [];
  }

  // Build lookup by gecko id
  const byId: Record<string, any> = {};
  for (const c of json) {
    if (c?.id) byId[c.id] = c;
  }

  return Object.entries(COINGECKO_IDS)
    .filter(([, geckoId]) => typeof byId[geckoId]?.current_price === 'number' && byId[geckoId].current_price > 0)
    .map(([symbol, geckoId]) => {
      const c = byId[geckoId];
      const spark: number[] = c.sparkline_in_7d?.price ?? [];
      // Take the most recent 24 hourly points for the 24-hour mini chart.
      const sparkline24h = spark.slice(-24);
      return {
        symbol,
        price:        c.current_price,
        change24h:    c.price_change_percentage_24h ?? 0,
        marketCapRaw: c.market_cap ?? 0,
        volumeRaw:    c.total_volume ?? 0,
        sparkline24h,
        high24h:      typeof c.high_24h === 'number' && c.high_24h > 0 ? c.high_24h : c.current_price,
        low24h:       typeof c.low_24h  === 'number' && c.low_24h  > 0 ? c.low_24h  : c.current_price,
      };
    });
}

// 5-minute cache for the global aggregate. Hammering /global on every 30s
// price poll would burn the rate budget; once every few polls is plenty since
// the total market cap barely moves second-to-second.
let globalCache: { fetchedAt: number; data: GlobalMarketStats } | null = null;
const GLOBAL_TTL_MS = 5 * 60 * 1000;

export async function fetchGlobalMarketStats(): Promise<GlobalMarketStats | null> {
  if (globalCache && Date.now() - globalCache.fetchedAt < GLOBAL_TTL_MS) {
    return globalCache.data;
  }
  if (Date.now() < rateLimitedUntil) return globalCache?.data ?? null;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: cgHeaders(),
    });
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + 60 * 1000;
      return globalCache?.data ?? null;
    }
    if (!res.ok) throw new Error(`CoinGecko global ${res.status}`);
    const json = await res.json();
    const totalMarketCap = json?.data?.total_market_cap?.usd;
    const change24h      = json?.data?.market_cap_change_percentage_24h_usd;
    if (typeof totalMarketCap !== 'number' || typeof change24h !== 'number') return globalCache?.data ?? null;
    const data: GlobalMarketStats = { totalMarketCap, change24h };
    globalCache = { fetchedAt: Date.now(), data };
    return data;
  } catch (e) {
    console.warn('fetchGlobalMarketStats failed:', e);
    return globalCache?.data ?? null;
  }
}

// Fear & Greed index from alternative.me — free, no key, ~hourly updates.
let fearGreedCache: { fetchedAt: number; data: FearGreedReading } | null = null;
const FNG_TTL_MS = 30 * 60 * 1000;   // updates ~hourly upstream

export async function fetchFearGreedIndex(): Promise<FearGreedReading | null> {
  if (fearGreedCache && Date.now() - fearGreedCache.fetchedAt < FNG_TTL_MS) {
    return fearGreedCache.data;
  }
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`alternative.me fng ${res.status}`);
    const json = await res.json();
    const row = json?.data?.[0];
    const value = row?.value ? parseInt(row.value, 10) : NaN;
    const label = row?.value_classification as string | undefined;
    if (!Number.isFinite(value) || !label) return fearGreedCache?.data ?? null;
    const data: FearGreedReading = { value, label };
    fearGreedCache = { fetchedAt: Date.now(), data };
    return data;
  } catch (e) {
    console.warn('fetchFearGreedIndex failed:', e);
    return fearGreedCache?.data ?? null;
  }
}
