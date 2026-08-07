import { defineFunction, secret } from '@aws-amplify/backend';

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
// long timeout. Authenticated via the COINGECKO_API_KEY secret below.
export const tickOhlc = defineFunction({
  name: 'tick-ohlc',
  entry: './handler.ts',
  // Keyless CoinGecko is rate-limited, so a full catalog walk with retry-on-429
  // backoff can take several minutes. 900s (the Lambda max) leaves ample room.
  environment: {
    // CoinGecko Demo key. Load-bearing, not an optimisation: keyless days=1
    // requests from Lambda's datacenter IPs get HTTP 200 with an EMPTY prices
    // array (verified 2026-08-06 — the identical request succeeds from a
    // residential IP), so the fiveMin walk wrote nothing while logging nothing.
    // With the key the request is authenticated and the shaping goes away; the
    // handler also drops its spacing 12s -> 2.5s when the key is present.
    // Set with: npx ampx sandbox secret set COINGECKO_API_KEY --identifier cflem
    COINGECKO_API_KEY: secret('COINGECKO_API_KEY'),
  },
  timeoutSeconds: 900,
});
