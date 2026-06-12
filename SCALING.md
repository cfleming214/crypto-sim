# Scaling & Future Scope

Engineering notes on how far the backend scales and the highest-leverage work to
push the ceiling higher. The managed AWS layer (Cognito, DynamoDB on-demand,
AppSync, Lambda, S3) scales to millions when access is **key-based**; the limits
below are self-imposed by this codebase's access patterns. Numbers are
architecture estimates, not load tests — use `npm run seed:contests` /
`scripts/seed-live-contest.mjs --players N` to find the real cliffs.

## Status of the known ceilings

| Ceiling | Was | Status |
|---|---|---|
| Shared CoinGecko demo key (per-device price polling) | ~dozens of concurrent users | **Fixed** — see below |
| Scan-based cron Lambdas (full-table scans) | ~tens of thousands of users | Open — see Future Scope |
| Managed services (Cognito / DynamoDB / AppSync / Lambda) | millions | Fine while access stays key-based |

### Fixed: server-side price aggregation
Previously every device called CoinGecko every 10s using one demo key baked into
the bundle (`EXPO_PUBLIC_COINGECKO_API_KEY`), shared across all installs — so ~5
concurrent users saturated the ~30 req/min tier.

Now `amplify/functions/tick-prices` makes **one** CoinGecko request per minute for
the whole user base and writes live prices onto the `Token` table; the app reads
prices from the backend (`fetchLivePrices()` in `src/services/tokenCatalog.ts`,
backend-first with a CoinGecko fallback for guests). Signed-in devices make zero
CoinGecko calls for the price poll. This also keeps the valuation crons
(`tick-leaderboard`, `tick-global-leaderboard`, `price-watch`) reading fresh
prices instead of stale seed snapshots.

## Future Scope (ordered by leverage)

### 1. Key `UserProfile` by Cognito `sub` (biggest lever)
`UserProfile` uses a random `id`, so every server-side per-user lookup must
**scan-by-owner**. This is the root cause of the scan-based cron ceiling.
`StripeAccount`/`Payout` already key by `sub` (single `GetItem`). Re-keying
`UserProfile` the same way converts most cron scans into O(1) reads and raises
the ceiling by orders of magnitude.
- Touches: `amplify/data/resource.ts` (UserProfile identifier), every Lambda that
  reads profiles (`price-watch`, `tick-global-leaderboard`, `settle-season`,
  `notification-dispatcher`, `execute-trade`, `reset-demo`), and the client
  `saveProfile`/`loadProfile` in `src/services/portfolioService.ts`. Needs a
  migration for existing rows.

### 2. Replace full-table scans with queries / GSIs
- `price-watch` (`amplify/functions/price-watch/handler.ts`) scans **all**
  `UserProfile` every minute whenever any limit order is active. With (1) done,
  load only the owners with *triggered* orders via `BatchGetItem` instead.
- Add GSIs: `PushDevice` on `userId`, `PriceAlert`/`LimitOrder` on `active`
  (and/or `symbol`) so the crons query just the relevant rows.
- `tick-global-leaderboard` rebuilds the board by scanning all profiles every
  5 min — move to incremental updates driven by DynamoDB Streams, or a streaming
  aggregation, rather than a full rebuild.

### 3. Cache the price read path for very high scale
Devices still poll the `Token` table (~26 rows) every 10s. Cheap into the
hundreds of thousands; at millions it's real DynamoDB/AppSync cost.
- Put a **CloudFront-cached public prices endpoint** in front (a Lambda Function
  URL like `stripe-webhook`, returning cached prices JSON, `Cache-Control` ~10s).
  One cached origin serves everyone, guests included, and removes the AppSync
  auth requirement for guest price reads.
- Cheap interim win: slow the client price poll from 10s toward ~30s (the backend
  only refreshes every 60s, and the 2s in-app simulation fills visual gaps).
  Set in `src/store/AppContext.tsx` (`priceRef` interval in the price-sim effect).

### 4. Other external dependencies (per-device, lower volume)
- `fetchGlobalMarketStats` (CoinGecko `/global`, cached 5 min) and
  `fetchFearGreedIndex` (alternative.me, cached 30 min) still run per-device.
  Low volume, but at scale move them server-side too (same pattern as prices).
- `fetchOhlc` (Trade-screen chart history) is user-triggered + cached 5 min;
  lowest priority. Could be served from a backend cache if chart traffic grows.

## Quick reference: which crons scan what

| Cron | Cadence | Full scans |
|---|---|---|
| `tick-prices` | 1 min | Token (small) |
| `price-watch` | 1 min | PriceAlert, LimitOrder, **UserProfile** (when an order is active), Token |
| `notification-dispatcher` | 1 min | NotificationCampaign, **UserProfile** or CompetitionEntry (audience) |
| `tick-leaderboard` | 5 min | CompetitionEntry, Token |
| `tick-global-leaderboard` | 5 min | **UserProfile**, CompetitionEntry, Token, GlobalLeaderboard |
| `close-competition` | 10 min | Competition, CompetitionEntry (per contest) |
| `settle-season` | 7 days | **UserProfile** |

The **bold** ones are the scaling-sensitive scans; items (1) and (2) above target them.
