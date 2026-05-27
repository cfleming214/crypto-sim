# Maestro E2E Conventions

Every flow under `.maestro/` follows the same handful of rules. Stick to them and the suite will scale to many more flows without becoming brittle.

## testID naming

Convention: **`{screen}-{element}[-{specifier}]`**, lowercase kebab-case.

Stable across copy edits, locale changes, and visual refactors — that's the whole point.

### Examples by surface

| Surface | testIDs |
| --- | --- |
| Auth | `auth-email-input`, `auth-password-input`, `auth-code-input`, `auth-submit-btn`, `auth-toggle-mode`, `auth-resend-code-btn` |
| Trade | `trade-buy-btn`, `trade-sell-btn`, `trade-amount-input`, `trade-quick-amount-50`, `trade-limit-toggle`, `trade-place-order-btn`, `trade-more-btn`, `trade-watchlist-star`, `trade-indicators-toggle` |
| Portfolio | `portfolio-rebalance-btn`, `portfolio-stop-loss-btn`, `portfolio-holding-row-BTC`, `portfolio-selector-main`, `portfolio-selector-{competitionId}`, `nudge-dismiss-{nudgeId}` |
| NumPad | `numpad-key-1`, `numpad-key-2` … `numpad-key-0`, `numpad-key-dot`, `numpad-key-del` |
| Markets | `markets-search-input`, `markets-filter-btn`, `markets-coin-row-BTC`, `markets-watchlist-star-BTC` |
| Compete | `compete-card-{competitionId}`, `compete-top-traders-link`, `compete-see-all-link` |
| Tournament | `tournament-join-btn`, `tournament-leave-btn`, `tournament-leaderboard-row-{handle}` |
| Copy trade | `copytrade-mirror-btn`, `copytrade-pause-btn`, `copytrade-edit-mirror-btn`, `mirror-allocation-input`, `mirror-save-btn` |
| TopTraders | `top-traders-row-{traderId}` |
| Profile | `profile-edit-btn`, `profile-handle-input`, `profile-save-btn`, `profile-color-{hex}`, `profile-photo-picker`, `profile-signout-btn`, `profile-reset-demo-btn` |
| Notifications | `notif-row-{key}`, `notif-mark-read-btn` |

## Flow file structure

Every `.yaml` flow:

```yaml
appId: com.cfleming.cryptosim
tags:
  - smoke   # or - full
---
- launchApp
- runFlow:
    file: ../helpers/sign-in.yaml
    env:
      EMAIL: returning-user@example.com
      PASSWORD: Test1234!
- tapOn: { id: "trade-buy-btn" }
# ...
- assertVisible: { id: "portfolio-holding-row-BTC" }
```

Notes:
- `appId` lives in `config.yaml` already, but each flow re-declares it so flows are runnable in isolation (`maestro test .maestro/trading/01-market-buy.yaml`).
- `tags:` is required. `smoke` for the 5 PR-gating flows; `full` for everything else. A flow tagged `smoke` is implicitly also part of the full suite — the CLI selects union.
- Compose with `runFlow: file: ../helpers/<name>.yaml` for shared setup. Pass parameters with `env:`.

## Assertion strategy

- **Always finish with at least one `assertVisible`** on a stable element that proves the goal state.
- **Never assert on dynamic numbers** like bankroll, prices, or ranks directly — those change every test run. Instead assert on a testID being present, a chip (`Live`, `Joined`, `+`), or a screen title.
- **Prefer `assertVisible: { id: ... }` over text matches.** Text changes break flows.

## Test data isolation

- New accounts are created via `helpers/sign-up-fresh.yaml` which generates a fresh `test-{8-char-uuid}@example.com` per run.
- Password is always `Test1234!` (meets the Cognito policy: 8+ chars, lower, upper, digit, symbol).
- All test data is cleaned up by `scripts/cleanup-test-data.mjs` — run via `npm run test:e2e:cleanup` after a local run or `--yes` in CI.

## When you add a new feature

Drop a new flow under the right domain folder. Smoke tag only if it's truly load-bearing (the user can't use the app without it). Most new flows are `full`-only.
