import { defineFunction } from '@aws-amplify/backend';

// Fetches live prices from CoinGecko ONCE for the whole user base and writes
// them into the Token table, so the app reads prices from our backend instead
// of every device hitting CoinGecko with the shared demo key (which saturates
// at a handful of concurrent users). Also keeps Token.lastPrice fresh for the
// valuation crons (tick-leaderboard, tick-global-leaderboard, price-watch).
//
// Runs keyless (one /coins/markets request per minute is well under the limit);
// set a COINGECKO_API_KEY env/secret later for higher limits.
export const tickPrices = defineFunction({
  name: 'tick-prices',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
