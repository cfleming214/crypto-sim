import { defineFunction } from '@aws-amplify/backend';

// Server-side price-watch: every minute it values the symbols referenced by
// active PriceAlert / LimitOrder rows against live CoinGecko prices, pushes
// alerts, and fills triggered limit orders authoritatively (mutating the
// owner's UserProfile + writing a Trade row), so they work while the app is
// closed.
//
// Runs keyless against CoinGecko (one /coins/markets request per minute is well
// under the keyless rate limit). If a COINGECKO_API_KEY env/secret is wired in
// later, the handler will use it automatically for higher limits.
export const priceWatch = defineFunction({
  name: 'price-watch',
  entry: './handler.ts',
  timeoutSeconds: 120,
});
