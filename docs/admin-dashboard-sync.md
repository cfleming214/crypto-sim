# Admin Dashboard — Sync Spec

The admin dashboard is a **separate project** (`crypto-dashboard`) that writes some tables directly to
DynamoDB via the AWS SDK (bypassing AppSync), the same way it already manages `Token` and
`NotificationCampaign`. This doc lists everything the dashboard must adopt to stay current with the
`crypto-sim` backend (`amplify/data/resource.ts`) after this session's work. **Apply top-to-bottom.**

---

## ⚠️ 0. BREAKING — read this first
Field-level authorization now protects **`CompetitionEntry`** and **`ReplayEntry`**: the fields
`cash`, `holdingsJson`, `tradesJson` are **owner-only**. The model still allows authenticated reads of
the leaderboard-safe fields (`handle`, `bankroll`, `pnlPct`, `rank`, `isActive`, `joinedAt`).

**Impact:** any dashboard query that reads `cash`/`holdingsJson`/`tradesJson` **using a Cognito user
credential** now gets `null` for those fields. To view player portfolios/trades, the dashboard must read
these tables via **direct DynamoDB SDK / admin IAM credentials** (the pattern it already uses for
`Token`/`GlobalLeaderboard`), NOT AppSync-with-a-user. Leaderboard-safe fields are unaffected.

---

## 1. New models needing dashboard views
All four are **Lambda/SDK-written** (no AppSync write path) — the dashboard reads them directly.

| Model | Fields | Dashboard needs |
|---|---|---|
| **Referral** | code, referrerUserId, referrerHandle, refereeUserId, refereeHandle, status, createdAt, activatedAt | Referral audit trail; per-referrer activation counts. **Read/audit only — do NOT let the dashboard edit `status`** (activation is server-verified against a finished contest; see §4). |
| **ReferralCode** | code (id), referrerUserId, referrerHandle | Code → referrer lookup. |
| **RecruiterCupLeaderboard** | rank, owner, handle, seasonActivated, totalActivated, seasonId | Seasonal "Top Recruiters" board + top-5 cash-prize breakdown when cash is on. Rebuilt every 5 min by `settle-recruiter-cup`. |
| **TokenHistory** | symbol (id), hourlyJson (~90d), dailyJson (~365d), hourlyUpdatedAt, dailyUpdatedAt | Price-history viewer + last-refresh timestamps. Written only by `tick-ohlc`; backfill via `scripts/fetch-replay-data.mjs`. Read-only. |

## 2. UserProfile — new fields (read-only in the user detail view)
`referralCode` (the user's permanent invite code), `referredByCode` (code they signed up with),
`activatedReferrals` (lifetime verified activations, written by `settle-recruiter-cup`).

## 3. Contests — new cadences
Contests are auto-created by `create-rolling-contest` (2h/3h/6h) and `create-weekly-contest`, plus
one-off seed scripts for 1-hour / 30-minute sprints. Add cadence filters to the contest list; nothing
about the `Competition` schema itself changed.

## 4. Payouts / compliance
- **Recruiter Cup cash settlement** creates `Payout` rows with id `recruiter-cup-<season>#<userId>` when
  `CONTEST_CASH_PRIZES` is enabled (gated OFF today). Surface them alongside contest payouts; they flow
  through the same claim → `process-withdrawals` → Stripe rail.
- Keep the `$4,999` prize-pool cap (`contestCompliance.ts`) + `AnnualWinnings`/1099 ($600) views current.
- **Referral.status is server-authoritative** — the dashboard must not offer an edit control for it.

## 5. Script → dashboard parity gaps
These admin actions exist today **only** as `scripts/*.mjs`; decide which to promote to dashboard UI:
`seed-tokens` (catalog upsert — 65 coins now), contest seeding/cleanup (`seed-live-contest`,
`seed-contests-clean`, `flag-cash-contests`), `seed-online-bots` (phantom cohort; env
`BOT_SEED_PASSWORD`), `export-1099`, `diag-payouts` / `diag-leaderboard`.

## 6. Auth for the dashboard
The scripts use raw admin AWS credentials. A web dashboard should use either a Cognito user in an
**admin group** (add via `amplify/backend.ts`) or a service role — and MUST use direct-DynamoDB/admin
creds (not a plain user token) for the owner-only fields in §0 and the SDK-written tables in §1.

---

*Source of truth: `amplify/data/resource.ts`. Cross-check this doc against it before implementing.*
