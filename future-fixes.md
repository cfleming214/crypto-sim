# Crypto Comp — Security & Hardening Backlog (`future-fixes.md`)

Findings from a defensive security audit (3 parallel reviewers + manual verification of the auth
model). **Nothing here has been implemented** — this is the prioritized backlog for a future session.

## How to read this
- **Nothing is at real-money risk today** because contest prizes are **XP-only**
  (`EXPO_PUBLIC_PAYOUTS_ENABLED` is off). Most economic issues are "leaderboard/tier gaming" now.
- **Section 2 is a HARD BLOCKER:** the client-authoritative economic model is safe for XP but becomes
  **direct theft** once cash contests are enabled. Everything in Section 2 must ship **before**
  `EXPO_PUBLIC_PAYOUTS_ENABLED` / `CONTEST_CASH_PRIZES` is ever set to `true`.

## Verified auth facts (what's already sound — don't "fix" these)
From `amplify/data/resource.ts`:
- Amplify **`allow.owner()` blocks cross-user writes** server-side — a user CANNOT edit another user's
  row. (Audit claims of "edit another user's CompetitionEntry/Payout" are **false**.) The real gap is
  **self-forgery** (a modified client forging *its own* numbers) + missing server validation.
- `UserProfile`, `Trade`, `Mirror`, `PushDevice`, `PriceAlert`, `LimitOrder`, `TaxForm` = owner-only.
- `Payout`, `StripeAccount`, `WithdrawalRequest`, `AnnualWinnings` = **owner read-only, Lambda-written**
  → clients cannot forge payouts or flip payout status.
- **Secrets are properly gated:** Stripe/Resend via `secret()`; only public keys in `EXPO_PUBLIC_*`
  (RevenueCat `appl_`, Stripe `pk_`, AdMob unit IDs, PostHog, CoinGecko demo); `.gitignore` covers
  `.env*.local` + `amplify_outputs.json`. No real secret is committed or shipped in the bundle.
- Lane-A (virtual) / Lane-B (cash) firewall is correctly enforced (`src/lib/contestLane.ts`): passes /
  rewarded ads / IAP never gate or grant cash-contest entry. No compliance violation observed.

---

## Section 1 — Fix soon (real today, low-risk changes; not money-critical)

### 1.1 [HIGH · privacy] Opponent portfolios are fully readable
`CompetitionEntry` / `ReplayEntry` are `allow.authenticated().to(['read'])`, exposing every player's
`cash`, `holdingsJson`, and full `tradesJson` to any signed-in user (strategy + activity leak).
- **Files:** `amplify/data/resource.ts` (models ~L175-192, ~L224-238); readers in
  `src/services/competitionService.ts` (`fetchCompetitionLeaderboard`, `fetchEntryPortfolio`) + the
  contest leaderboard/balance popup.
- **Fix:** field-level authorization — mark `cash`/`holdingsJson`/`tradesJson` `allow.owner()` while
  keeping leaderboard-safe fields (handle, bankroll, pnlPct, rank, isActive, joinedAt) authenticated-read.
  Downgrade any opponent-holdings UI to bankroll/pnl only. (Schema deploy + `amplify_outputs.json` resync.)

### 1.2 [HIGH · abuse] Referral self-activation farming
`Referral.status` is owner(referee)-writable, so a modified client can call `activateMyReferral()`
(`src/services/referralService.ts`) **without finishing a contest** to farm referrer tiers/passes/XP
(and Recruiter Cup cash once enabled).
- **Fix:** don't trust client-set `status`. In `amplify/functions/settle-recruiter-cup/handler.ts`, only
  count a referral activated when the referee **independently** has a finished `CompetitionEntry`
  (server-verified); grant that Lambda a `CompetitionEntry` read in `amplify/backend.ts`. (The legit
  invitee path already only activates after a real finish via `ContestRewardWatcher`.)

### 1.3 [HIGH · infra/DoS] Unbounded Scan on the public Stripe webhook
`amplify/functions/stripe-webhook/handler.ts` (~L39-44): on a lookup miss it runs a full-table
`ScanCommand` with no `Limit`. The Function URL is public (`authType: NONE`), so crafted events can
trigger repeated full scans (DoS-by-cost).
- **Fix:** add `Limit`, prefer a Query/GSI on `stripeAccountId`, and no-op when `metadata.userId` is
  absent. Add **replay protection**: reject events with `created` older than ~5 min and make
  `syncTransfer` idempotent on `transfer.id`.

### 1.4 [MEDIUM · privacy] `leaderboardVisible` opt-out ignored on PublicProfile write
`src/services/portfolioService.ts` `saveProfile` (~L450-518) writes/updates `PublicProfile`
unconditionally, so an opted-out user is still discoverable unless the server leaderboard filter catches
it.
- **Fix:** gate the PublicProfile create/update on `state.user.leaderboardVisible !== false`, and delete
  the existing PublicProfile row when a user opts out.

### 1.5 [LOW · robustness / PII]
- **Division-by-zero:** `price / (1 + change24h/100)` → `Infinity` at a −100% change. Guard in
  `src/screens/MarketsScreen.tsx` and `src/screens/TradeScreen.tsx` (24h-move formatter).
- **Lambda fetch timeouts:** add `AbortSignal.timeout(10_000)` to external `fetch()` in
  `amplify/functions/{tick-prices,tick-ohlc,price-watch}/handler.ts` (a hung API burns the Lambda timeout).
- **Sentry scrub:** add a `beforeSend` in `App.tsx` to strip URLs / obvious PII from crash events.
- **Dev-tooling hygiene:** move hardcoded seed/stress-bot passwords in `scripts/*.mjs`
  (`OnlineSeed!2026`, `SeedBot!2026`, `StressBot!2026`, `Test1234!`) to env vars.
- **Deps:** document *why* the `zod@3.25.17` override exists (Amplify data-construct compat) and monitor
  for security bumps.

---

## Section 2 — Server-authoritative refactor (HARD BLOCKER before cash prizes)

The app is intentionally **client-authoritative**: the client trades locally and writes its own
`cash`/`holdings`/`bankroll`/`pnlPct` (`saveContestPortfolio`, `saveProfile`) and its own XP
(`ADD_XP`/`CLAIM_*` → `UserProfile.xp`). `execute-trade` exists but the client does **not** use it.
Fine for XP; **theft once money is on**. Do ALL of the following before flipping
`EXPO_PUBLIC_PAYOUTS_ENABLED=true`:

1. **[CRITICAL] Server-recomputed contest standings before settlement.** `close-competition` must
   re-rank from server-revalued holdings (× `Token` price) immediately before creating `Payout` rows —
   never settle on client-written `bankroll`/`pnlPct`. Ensure `tick-leaderboard` runs (or is invoked)
   pre-settlement. Files: `amplify/functions/close-competition/handler.ts`, `tick-leaderboard/handler.ts`.
2. **[CRITICAL] Validated contest trades.** ✅ SERVER SIDE DONE (PR5): `executeContestTrade` mutation
   validates the caller's own `CompetitionEntry` cash/holdings at the SERVER price (client price never
   trusted) and writes the ledger back; client wrapper is `competitionService.executeContestTrade`.
   ⏳ REMAINING (cash-enable step): route `TradeScreen.handleConfirm` contest BUY/SELL through the wrapper
   when `CONTEST_CASH_PRIZES` is on + apply the returned cash/holdings into AppContext (XP contests keep
   trading locally). Until then `saveContestPortfolio` still persists unvalidated client holdings.
3. **[CRITICAL] Server-derived XP for anything that converts to money.** XP is fully client-trusted.
   Recruiter Cup cash + cash prizes must derive rank/XP server-side (e.g. a `Trade` DynamoDB-stream
   Lambda), not from client-written `UserProfile.xp`.
4. **[HIGH] Invitee referral reward server-verification.** The invitee's welcome passes/XP are
   self-granted client-side (`CLAIM_REFERRAL_REWARD`); grant them server-side on verified first-contest
   finish.
5. **[HIGH] Payout claim/withdraw idempotency + amount re-validation.** Harden `stripe-connect`
   `claimPrize` against double-credit (strict conditional / claim-request dedupe) and re-validate
   `Payout.amountCents` against the contest's `prizesJson` + rank in `process-withdrawals`.
6. **[MEDIUM] Portfolio reconciliation job.** Periodic server check that a profile's cash/holdings
   reconcile with its `Trade` ledger; alert on drift.

---

## Cash-enable checklist (gate for `EXPO_PUBLIC_PAYOUTS_ENABLED=true`)
- [ ] Section 2 items 1–6 shipped + verified in Stripe test mode.
- [ ] Section 1.2 (referral server-verify) + 1.3 (webhook hardening) shipped.
- [ ] Legal: sweepstakes registration, 1099/$600 process, `docs/official-contest-rules.html` current,
      `$4,999` prize-pool cap enforced (already in `contestCompliance.ts`).
- [ ] Load/QA: a modified client cannot inflate a contest result that survives settlement.
