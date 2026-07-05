// Build-time feature flags.
//
// PAYOUTS_ENABLED gates every real-money surface (the Stripe payout onboarding
// entry in Profile, and the Earnings claim list in Activity). It is OFF for the
// current App Store submission so the build stays a pure play-money simulator —
// matching the approved "no real money ever leaves the app" framing and the
// Terms. The Stripe backend + screens stay in the codebase; they're just not
// reachable from the UI.
//
// ENV-GATED for Stripe TEST mode: the flag is driven by EXPO_PUBLIC_PAYOUTS_ENABLED,
// which Expo inlines at build time. Production builds (where the var is unset)
// stay false; a preview/test build set to "true" (see eas.json `preview.env`, or
// a local .env) turns the full payout flow on against Stripe TEST keys. Flip the
// hard default to true only alongside the real-money launch work (17+ age rating,
// Terms rewrite disclosing cash prizes, LIVE Stripe keys).
export const PAYOUTS_ENABLED = process.env.EXPO_PUBLIC_PAYOUTS_ENABLED === 'true';

// APPLE_SIGNIN_ENABLED gates the "Continue with Apple" button. OFF by default so
// the button never appears until the Cognito Apple provider + hosted-UI OAuth are
// configured and a native build ships — otherwise it would open a broken flow.
// Flip via EXPO_PUBLIC_APPLE_SIGNIN_ENABLED once that setup is done.
export const APPLE_SIGNIN_ENABLED = process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';

// CONTEST_CASH_PRIZES gates whether contests advertise/award real cash. When OFF
// (the production default), contests reward XP instead — the prize is shown as XP
// and the winner claims XP, with no cash settlement surfaced. Tied to the same
// env gate as PAYOUTS_ENABLED so a test build gets the full cash-prize → payout
// path end-to-end; production stays XP-only.
export const CONTEST_CASH_PRIZES = process.env.EXPO_PUBLIC_PAYOUTS_ENABLED === 'true';

// USER_ESCROW_CONTESTS_ENABLED gates a FUTURE feature: letting USERS create a
// contest or 1v1 duel with a real dollar prize they fund themselves — charged up
// front and held in Stripe escrow until settlement. HARD OFF (not built): this is
// a user-funded prize pool, which is materially different from the app's current
// free-entry, sponsor-funded sweepstakes model and carries real gambling/licensing
// exposure. Any create-contest/duel UI must NOT expose a dollar-prize input while
// this is false. Do not flip without the escrow build + legal sign-off — see
// future-fixes.md ("User-funded escrow contests").
export const USER_ESCROW_CONTESTS_ENABLED =
  process.env.EXPO_PUBLIC_USER_ESCROW_CONTESTS === 'true';

// Headline XP a contest awards its winner when cash prizes are off. Used as the
// fallback when a Competition row has no prizeXp set yet (e.g. before the
// backend field is redeployed). The podium splits this 100/50/25% (see
// contestXpForRank in services/gamification.ts).
export const DEFAULT_PRIZE_XP = 5000;

// Simulated starting bankroll for every fresh portfolio — the main practice
// account and each contest you join. Also the baseline all P&L percentages are
// measured against, so changing it here keeps returns consistent everywhere.
export const STARTING_CASH = 100_000;

// IAP (offline-portfolio) economics. The $5M consumable + the Premium monthly
// grant both credit this much VIRTUAL play money. These are practice-only and
// isolated from cash contests (which always start at STARTING_CASH).
export const OFFLINE_BALANCE_GRANT = 5_000_000;
// Hard cap on total extra offline portfolios a device can hold (beyond 'main').
export const MAX_OFFLINE_PORTFOLIOS = 12;
// New offline portfolios a Premium subscriber may create per calendar month.
export const PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH = 3;
