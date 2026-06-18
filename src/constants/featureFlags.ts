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

// CONTEST_CASH_PRIZES gates whether contests advertise/award real cash. When OFF
// (the production default), contests reward XP instead — the prize is shown as XP
// and the winner claims XP, with no cash settlement surfaced. Tied to the same
// env gate as PAYOUTS_ENABLED so a test build gets the full cash-prize → payout
// path end-to-end; production stays XP-only.
export const CONTEST_CASH_PRIZES = process.env.EXPO_PUBLIC_PAYOUTS_ENABLED === 'true';

// Headline XP a contest awards its winner when cash prizes are off. Used as the
// fallback when a Competition row has no prizeXp set yet (e.g. before the
// backend field is redeployed). The podium splits this 100/50/25% (see
// contestXpForRank in services/gamification.ts).
export const DEFAULT_PRIZE_XP = 5000;

// Simulated starting bankroll for every fresh portfolio — the main practice
// account and each contest you join. Also the baseline all P&L percentages are
// measured against, so changing it here keeps returns consistent everywhere.
export const STARTING_CASH = 100_000;
