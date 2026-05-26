export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  marketCapRaw: number;
  volumeRaw: number;
}

const COINGECKO_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  DOGE: 'dogecoin',
  PEPE: 'pepe',
};

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
