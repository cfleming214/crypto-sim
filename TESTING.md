# Testing Cheat Sheet

All the commands for running, testing, load-testing, and tearing down crypto-sim.

> **Needs AWS creds** for anything that touches the backend (seed/stress/deploy/cleanup): set
> `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` in your env, or a `~/.aws` profile.
> The scripts read endpoints from `amplify_outputs.json`.

---

## Run the app
| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server (Metro). Press `i`/`a`/`w` for iOS sim / Android / web. |
| `npm run ios` | Build + run a native debug build on the iOS simulator (needed for native modules: push, updates). |
| `npm run android` | Same for Android emulator. |
| `npm run web` | Run in the browser (limited — no native modules). |

## Typecheck (fast sanity, no backend)
| Command | What it does |
|---|---|
| `npx tsc --noEmit` | Typecheck the app (client). Run before every commit. |
| `npx tsc -p amplify/tsconfig.json` | Typecheck the Amplify backend (Lambdas, schema, `backend.ts`). |

## Deploy the backend
| Command | What it does |
|---|---|
| `npx ampx sandbox --identifier cflem` | Deploy the Amplify backend (this is the **live/prod** backend). Provisions tables, Lambdas, crons. Run after any `amplify/` change. Leave running to watch/hot-deploy. |

**Secrets: none required.** The backend deploys + runs with no secrets — Stripe stays in **mock mode**
(payouts simulated) and the price crons (`tick-prices`/`price-watch`) run **keyless** against CoinGecko.
All secrets are optional and currently commented out:
| Secret | Only needed for | Note |
|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Real Stripe prize payouts | Must first **uncomment the `secret()` block** in `amplify/functions/{stripe-connect,stripe-webhook,close-competition}/resource.ts`, then set + redeploy. |
| `COINGECKO_API_KEY` | Higher CoinGecko rate limits | Not wired yet — must add an `environment` block to `tick-prices`/`price-watch` `resource.ts` first. |
> `npx ampx sandbox secret set <NAME> <value>` only takes effect **after** the matching `secret()` wiring exists in that function's `resource.ts`.

---

## Seed data
| Command | What it does |
|---|---|
| `npm run seed:tokens` | Upsert the 25-coin catalog into the `Token` table (`enabledForPractice=true`). |
| `npm run seed:contests` | Spawn ~10 bots + 3 demo contests so the app looks busy. |
| `npm run seed:contests:clean` | **Teardown:** delete all seed contests/entries + bot rows + bot Cognito accounts. |

**`seed:contests` flags** (`node scripts/seed-live-contest.mjs …`):
| Flag | Effect |
|---|---|
| `--dry-run` | Show what it would do; write nothing. |
| `--append` | Add a fresh batch without wiping prior seeds (pile up load). |
| `--players N` | Grow the "1-Hour Dash" cap to N (>20) and run N bots. |

**`seed:contests:clean` flags:** `--dry-run` (list only), `--keep-users` (delete contests/rows but keep bot accounts).

---

## Load / stress testing
| Command | What it does |
|---|---|
| `npm run stress:contest` | **Backend stress test.** 50 bots join a fresh 1-hr $100k "stress test" contest (60 spots) and make a random trade every minute via the **real authenticated AppSync path** (Cognito sign-in → `updateCompetitionEntry`). Logs per-round ok/latency/errors. |

**`stress:contest` flags** (`node scripts/stress-test-contest.mjs …`):
| Flag (default) | Effect |
|---|---|
| `--users N` (50) | Number of bots trading. |
| `--spots N` (60) | Contest player cap. |
| `--interval SEC` (60) | Seconds between trade rounds. Lower = heavier load. |
| `--duration-min M` (60) | How long the loop runs (matches the 1-hr contest). |
| `--dry-run` | Resolve config + would-create; no auth/writes. |
| `--clean` | Delete just the "stress test" contest + its entries. |

Examples:
```bash
node scripts/stress-test-contest.mjs --users 5 --duration-min 2     # quick smoke run
node scripts/stress-test-contest.mjs --users 200 --interval 20      # heavier load
node scripts/stress-test-contest.mjs --clean                        # tear down just this contest
```
Watch it land: open the **"stress test"** contest in the app / crypto-dashboard, and check AppSync +
`tick-leaderboard` metrics in CloudWatch. Full teardown: `npm run seed:contests:clean`.

---

## End-to-end UI tests (Maestro)
Requires a running build on a booted simulator/emulator + Maestro installed (`maestro` CLI).
| Command | What it does |
|---|---|
| `npm run test:e2e` | Run the full Maestro suite (`smoke` + `full` tags) in `.maestro/`. |
| `npm run test:e2e:smoke` | Run only the fast `smoke` flows. |
| `npm run test:e2e:lint` | Lint the Maestro flow files (no device needed). |
| `npm run test:e2e:multi-user` | Drive 5 real user sessions through the backend (`--users 5 --cleanup`). |
| `npm run test:e2e:cleanup` | Delete leftover e2e test data. |

**`run-multi-user-e2e` flags:** `--users N` (default 5), `--cleanup` (wipe data after).
**`cleanup-test-data` flags:** `--dry-run` (list only), `--yes` (skip prompt, for CI).

Target a specific device when running flows manually:
```bash
maestro --device <udid-or-serial> test .maestro/<flow>.yaml
```

---

## Tutorial: onboarding, Academy & coachmarks
Reset the teaching flows so you can re-test them as a fresh user:
| To re-test… | How |
|---|---|
| First-run **walkthrough** (W1–W8) | In-app: **Profile → Replay onboarding**. Or clear the flag: `AsyncStorage.removeItem('hasOnboarded')` (delete the `hasOnboarded` key) and relaunch. |
| **Crypto Academy** progress | Clear the gamification blob to wipe completed lessons + XP: delete the `gamification.v1` AsyncStorage key (also resets streak/achievements), then relaunch. |
| **Coachmark** tips (show again) | In-app: **Profile → In-app tips → "Reset — show all tips again."** Or clear the `coachmarksSeen` key. Toggle the whole system with the **In-app tips** switch (`coachmarksEnabled` key). |

- The full app reset (**Profile → Reset demo**, or the `reset-demo` Lambda) clears trades/portfolio but **not** `hasOnboarded` / Academy progress — use the keys above for those.
- Onboarding XP is one-time (guarded by the `onboardingRewarded` key); replaying the walkthrough won't re-award it.
- Quick AsyncStorage wipe in a dev build: shake → **Clear AsyncStorage** (Expo dev menu), then relaunch to hit a truly first-run state.

---

## Multiple simulators (UI load)
| Command | What it does |
|---|---|
| `xcrun simctl list devices` | List iOS simulators + UDIDs (and which are Booted). |
| `xcrun simctl boot "iPhone 15"` | Boot an iOS simulator (repeat for several). |
| `xcrun simctl install <udid> /path/App.app` | Install a built `.app` on a simulator. |
| `xcrun simctl launch <udid> com.simpledesignllc.cryptocomp` | Launch the app on a simulator. |
| `emulator -avd <name> &` | Boot an Android emulator (each in its own process). |
| `adb devices` | List running Android emulators/devices. |
| `adb -s <serial> shell monkey -p com.simpledesignllc.cryptocomp -v 10000` | Random-event UI fuzz (Android stress). |

Run parallel Maestro loops across devices for combined UI load (see `maestro --device` above).

---

## Builds & OTA updates (EAS)
| Command | What it does |
|---|---|
| `eas build -p ios --profile development` | Cloud build a dev client (needed for push/updates testing). `--profile preview`/`production` for others. |
| `eas build -p ios --profile development --local` | Build on your Mac instead of the cloud. |
| `eas update --branch production --message "…"` | Push an OTA JS update to installed builds (no rebuild). Match the build's channel (`development`/`preview`/`production`). |
| `eas credentials` | Inspect/manage Apple/Google signing creds (run in the app dir). |

> OTA ships JS/assets only; native changes (new modules, app.json native config) need a fresh `eas build`.
> Bump `expo.runtimeVersion` in `app.json` when shipping native changes.

---

## Quick recipes
```bash
# Full backend load test, start to finish
npx ampx sandbox --identifier cflem          # 1. ensure backend is deployed
npm run seed:tokens                          # 2. (once) populate the coin catalog
npm run stress:contest                       # 3. run the load
npm run seed:contests:clean                  # 4. tear everything down

# Pre-commit sanity
npx tsc --noEmit && npx tsc -p amplify/tsconfig.json

# Quick UI smoke on a sim (build running)
npm run test:e2e:smoke
```
