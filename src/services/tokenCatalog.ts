import { isAmplifyConfigured } from '../lib/amplify';
import type { Coin } from '../store/types';
import { formatLargeNumber, setCoingeckoIds } from './priceService';

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

function mapToken(t: any): Coin {
  return {
    symbol:    String(t.symbol || '').toUpperCase(),
    name:      t.name || t.symbol,
    price:     Number(t.lastPrice || 0),
    change24h: 0,
    marketCap: formatLargeNumber(Number(t.marketCapRaw || 0)),
    volume:    formatLargeNumber(Number(t.volumeRaw || 0)),
    history:   [],
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
