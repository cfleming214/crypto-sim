# Changelog

All notable changes to Crypto Comp. Dates are UTC; PR numbers link to the merge on GitHub.

## [1.3.5] — 2026-06-30 → 07-01

### Charts & trading
- **Server-side OHLC history cache.** New `TokenHistory` model + `tick-ohlc` Lambda (hourly 90d / daily
  365d streams, keyless-throttle-resilient); `fetchOhlc` is now backend-first with a CoinGecko fallback,
  so charts stop hitting the shared key per-device. (#30, #31)
- **Trade screen:** `$ / %` preset toggle; percent selections derive their dollar amount live so the
  confirm button no longer greys out on a price tick; removed the dead chart **MAX** button (CoinGecko
  Demo caps history at 365 days). (#30)

### Coins
- **+40 tradeable coins → 65 total** (curated, verified CoinGecko IDs; stablecoins/wrapped/RWA excluded)
  across the seed list, `DEFAULT_COINGECKO_IDS`, and `INITIAL_COINS`. (#34)

### UX & reliability
- Logged-out **profile shows a generic person icon**, and **ads are re-enabled for logged-out** users. (#32)
- **Centered walkthrough CTA** on the first and every page. (#32)
- **Onboarding no longer reappears** on relaunch when logged out (`hasOnboarded` preserved across
  `CLEAR_USER_DATA`). (#33)
- **"Reset graph"** button — re-baselines the equity chart for the active portfolio only; confirm names
  the exact portfolio. (#42, #44)
- **Win-rate** calculation fixed (closed profitable trades now count; rebalance/copy sells record P&L). (#46)
- **Live-trades feed** drips one trade/second (anti-flood) + a **top-5 most-traded-coins (24h)** graph
  under it on Compete. (#38, #52)

### Contests & gamification
- **Auto-grant podium XP** at settlement (no claim tap). (#35)
- **Find-or-create on contest join** — no more duplicate leaderboard entries. (#41)

### Phantom-bot tooling (dev)
- Command renamed **`bots:online` → `bots:phantoms`**. (#36)
- Bots now trade in **every** joined contest; idempotent re-run. (#37)
- **Stable reusable cohort** by default (`--fresh` to add a new group). (#39)
- **Never leave a phantom all-cash** in a contest (retry-on-throttle + churn clamp). (#40)

### IAP
- **RevenueCat entitlements scoped per account** (logIn/logOut) — fixes Premium leaking to a new
  account on the same device/Apple ID. (#43)

### Growth engine (from `docs/launch-growth-plan.md`)
- **WS1 — PostHog analytics:** funnel events (install→signup→onboarding→first trade→first contest),
  identify/reset. Inert until `EXPO_PUBLIC_POSTHOG_KEY` is set. (#47)
- **WS4 — "Recruit & Rise" referral:** `Referral`/`ReferralCode` models, codes, scheme deep-link capture,
  activation on first contest, invitee reward, Profile referral card. (#48)
- **WS4b — Recruiter Cup:** `RecruiterCupLeaderboard` + `settle-recruiter-cup` Lambda, Compete-tab
  standings, referrer reward, milestone tiers. (#49)
- **WS6 — cup cash-prize wiring:** top-5 settle through the existing Stripe Connect payout rail; **gated
  off** (`CONTEST_CASH_PRIZES`), $4,999 cap enforced. (#50)
- **WS18 — Branch attribution:** built **guarded and off** (no native dep; flag-gated). (#51)
- **WS19 — auth:** explicit **"Continue as guest"** CTA + **Sign in with Apple** built guarded/off
  (behind `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` + Cognito hosted-UI). (#53)

### Release & ops
- App **version 1.3.4 → 1.3.5**. (#45)
- Multiple production OTAs (iOS) across the above.
- Data ops (no PR): created 1-hour + 30-minute XP contests; seeded 25 phantom bots; cleaned up
  StressBot/LoadBot/payout-test leftovers; removed a duplicate `chrisf` weekly entry.

### Docs
- `docs/launch-growth-plan.md` exported to PDF; **`future-fixes.md`** security-audit backlog created;
  security-hardening implementation plan authored.

> Full history: `gh pr list --state merged`.
