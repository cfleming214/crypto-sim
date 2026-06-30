import { isAmplifyConfigured } from '../lib/amplify';
import type { Coin } from '../store/types';
import { formatLargeNumber, setCoingeckoIds, fetchPrices, type PriceData } from './priceService';

// The Token catalog is owned by the crypto-dashboard admin and lives in the
// Token DynamoDB table. The app reads it on cold start and rebuilds both the
// in-memory coin list and the CoinGecko id → symbol map used by priceService.
// Writes here would not be authorized for end-users — they happen from the
// dashboard server directly against DynamoDB. NOTE: trade-time enforcement
// against `enabledForPractice` / `Competition.allowedTokenSymbols` is not yet
// implemented in `execute-trade`; this catalog only drives the read path.

let clientPromise: Promise<any> | null = null;

async function getClient() {
  if (!isAmplifyConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { generateClient } = await import('aws-amplify/data');
      return generateClient();
    })();
  }
  return clientPromise;
}

function parseSpark(json: any): number[] {
  if (!json) return [];
  try { const a = JSON.parse(json); return Array.isArray(a) ? a.filter((n: any) => typeof n === 'number') : []; }
  catch { return []; }
}

function mapToken(t: any): Coin {
  return {
    symbol:    String(t.symbol || '').toUpperCase(),
    name:      t.name || t.symbol,
    price:     Number(t.lastPrice || 0),
    change24h: Number(t.change24h || 0),
    marketCap: formatLargeNumber(Number(t.marketCapRaw || 0)),
    volume:    formatLargeNumber(Number(t.volumeRaw || 0)),
    history:   parseSpark(t.sparklineJson),
  };
}

// Pulls the full enabled-for-practice catalog. Returns [] when Amplify is not
// configured (unit tests, web preview without auth). Callers should treat an
// empty result as "fall back to whatever's already in state.coins".
export async function fetchTokenCatalog(): Promise<Coin[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const res = await client.models.Token.list({
      filter: { enabledForPractice: { eq: true } },
    });
    const rows = (res?.data ?? []) as any[];
    const coins = rows
      .filter(r => r?.symbol && r?.coingeckoId)
      .map(mapToken)
      // Sort by rank if available — keep market-cap ordering in the UI.
      .sort((a, b) => {
        const ar = rows.find(r => r.symbol?.toUpperCase() === a.symbol)?.rank ?? 9999;
        const br = rows.find(r => r.symbol?.toUpperCase() === b.symbol)?.rank ?? 9999;
        return ar - br;
      });

    // Build the symbol → coingeckoId map and push it into priceService so the
    // existing fetchPrices() call picks up new IDs on the next tick.
    const idMap: Record<string, string> = {};
    for (const r of rows) {
      if (r?.symbol && r?.coingeckoId) idMap[String(r.symbol).toUpperCase()] = String(r.coingeckoId);
    }
    setCoingeckoIds(idMap);

    return coins;
  } catch (e) {
    console.warn('fetchTokenCatalog failed:', e);
    return [];
  }
}

// Read live prices from OUR backend (the Token table, refreshed every minute by
// the tick-prices Lambda) instead of calling CoinGecko from every device. This
// is what lets the app scale past the shared CoinGecko demo key. Returns [] when
// Amplify is unconfigured or the catalog has no fresh prices yet, so callers can
// fall back to CoinGecko (see fetchLivePrices).
export async function fetchTokenPrices(): Promise<PriceData[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const res = await client.models.Token.list({ filter: { enabledForPractice: { eq: true } } });
    const rows = (res?.data ?? []) as any[];
    // Only trust prices the tick-prices Lambda refreshed recently. Without this
    // freshness gate the app would serve STALE seed `lastPrice` values (and never
    // fall back to CoinGecko) on a backend where tick-prices isn't running yet —
    // i.e. frozen "mock" prices. No fresh row → [] → fetchLivePrices uses CoinGecko.
    const FRESH_MS = 15 * 60 * 1000;
    const now = Date.now();
    const isFresh = (r: any) => {
      const t = r?.priceUpdatedAt ? Date.parse(r.priceUpdatedAt) : NaN;
      return Number.isFinite(t) && now - t < FRESH_MS;
    };
    return rows
      .filter(r => r?.symbol && Number(r.lastPrice) > 0 && isFresh(r))
      .map(r => {
        const price = Number(r.lastPrice);
        return {
          symbol:       String(r.symbol).toUpperCase(),
          price,
          change24h:    Number(r.change24h || 0),
          marketCapRaw: Number(r.marketCapRaw || 0),
          volumeRaw:    Number(r.volumeRaw || 0),
          sparkline24h: parseSpark(r.sparklineJson),
          // Send 0 when absent (not spot price) so the UPDATE_PRICES reducer's
          // `>0` guard keeps the previously-known 24h high/low instead of
          // collapsing the range to the current price each tick.
          high24h:      Number(r.high24h) > 0 ? Number(r.high24h) : 0,
          low24h:       Number(r.low24h)  > 0 ? Number(r.low24h)  : 0,
        } as PriceData;
      });
  } catch (e) {
    console.warn('fetchTokenPrices failed:', e);
    return [];
  }
}

// Raw [[ms, price], ...] series cached server-side by the tick-ohlc Lambda.
export interface TokenHistorySeries {
  hourly: Array<[number, number]>;  // ~90 days hourly (serves 7D/30D/90D)
  daily:  Array<[number, number]>;  // ~365 days daily (serves 1Y)
}

function parsePairs(json: any): Array<[number, number]> {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a)
      ? a.filter((p: any) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
      : [];
  } catch { return []; }
}

// Read ONE coin's cached chart history from the TokenHistory table (refreshed by
// the tick-ohlc Lambda). Returns null when Amplify is unconfigured, the row is
// missing, or both streams are empty — callers fall back to CoinGecko directly.
export async function fetchTokenHistory(symbol: string): Promise<TokenHistorySeries | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const res = await client.models.TokenHistory.get({ symbol: symbol.toUpperCase() });
    const row = res?.data as any;
    if (!row) return null;
    const hourly = parsePairs(row.hourlyJson);
    const daily  = parsePairs(row.dailyJson);
    if (hourly.length < 2 && daily.length < 2) return null;
    return { hourly, daily };
  } catch (e) {
    console.warn('fetchTokenHistory failed:', e);
    return null;
  }
}

// Backend-first price source: signed-in users read the centrally-fetched prices
// from the Token table (no per-device CoinGecko call); guests / unconfigured
// builds / a not-yet-warmed catalog fall back to CoinGecko directly.
export async function fetchLivePrices(): Promise<PriceData[]> {
  const fromBackend = await fetchTokenPrices();
  if (fromBackend.length > 0) return fromBackend;
  return fetchPrices();
}
