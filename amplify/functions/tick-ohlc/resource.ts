import { defineFunction } from '@aws-amplify/backend';

// Server-side OHLC history cache. Fetches per-coin price history from CoinGecko
// ONCE for the whole user base and writes it onto the TokenHistory table, so the
// Trade-screen chart reads history from our backend instead of every device
// hitting the shared CoinGecko key (the same scaling fix as tick-prices, but for
// charts). Invoked by TWO EventBridge schedules (see backend.ts), differentiated
// by the `mode` event field:
//   mode: 'hourly' (every hour) -> days=90  hourly stream  (serves 7D/30D/90D)
//   mode: 'daily'  (once a day)  -> days=365 daily stream   (serves 1Y)
//
// market_chart is per-coin (not batchable), so it walks the catalog issuing one
// request per coin, spaced out to stay under CoinGecko's rate limit — hence the
// long timeout. Runs keyless by default; set COINGECKO_API_KEY for higher limits.
export const tickOhlc = defineFunction({
  name: 'tick-ohlc',
  entry: './handler.ts',
  timeoutSeconds: 300,
});
