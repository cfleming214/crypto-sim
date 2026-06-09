// Build-time feature flags.
//
// PAYOUTS_ENABLED gates every real-money surface (the Stripe payout onboarding
// entry in Profile, and the Earnings claim list in Activity). It is OFF for the
// current App Store submission so the build stays a pure play-money simulator —
// matching the approved "no real money ever leaves the app" framing and the
// Terms. The Stripe backend + screens stay in the codebase; they're just not
// reachable from the UI. Flip this to true only alongside the real-money launch
// work (17+ age rating, Terms rewrite disclosing cash prizes, live Stripe keys).
export const PAYOUTS_ENABLED = false;
