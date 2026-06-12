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
    return rows
      .filter(r => r?.symbol && Number(r.lastPrice) > 0)
      .map(r => {
        const price = Number(r.lastPrice);
        return {
          symbol:       String(r.symbol).toUpperCase(),
          price,
          change24h:    Number(r.change24h || 0),
          marketCapRaw: Number(r.marketCapRaw || 0),
          volumeRaw:    Number(r.volumeRaw || 0),
          sparkline24h: parseSpark(r.sparklineJson),
          high24h:      Number(r.high24h) > 0 ? Number(r.high24h) : price,
          low24h:       Number(r.low24h)  > 0 ? Number(r.low24h)  : price,
        } as PriceData;
      });
  } catch (e) {
    console.warn('fetchTokenPrices failed:', e);
    return [];
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
