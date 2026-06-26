// Two-lane contest classification — the compliance backbone for ads + contests.
//
// Lane A (virtual): cashPrize !== true. No real-money prize, so no lottery risk.
//   We monetize players here — rewarded ads, interstitials, banners, and the
//   entry-pass system (free weekly grant + watch-ad-for-passes).
// Lane B (cash): cashPrize === true. Real money is on the line, so entry MUST be
//   free (zero consideration) and ads are tightly restricted. No rewarded ads, no
//   pass gating, nothing in the money flow.
//
// The unbreakable rule this encodes: nothing a player pays or watches can ever buy
// more or better chances at real cash. Ads/passes live entirely in Lane A.

export type ContestLane = 'A' | 'B';

// A contest is Lane B iff it awards real cash. Everything else (XP/virtual, legacy
// rows with no flag, replay contests) is Lane A.
export function contestLane(c: { cashPrize?: boolean } | null | undefined): ContestLane {
  return c?.cashPrize === true ? 'B' : 'A';
}

// Whether joining this contest may be gated behind a pass / rewarded ad. Lane A
// only — Lane B entry must always stay free (consideration = 0).
export function requiresPassToJoin(c: { cashPrize?: boolean } | null | undefined): boolean {
  return contestLane(c) === 'A';
}

// Surfaces that touch real money. Ads are NEVER allowed on these, regardless of
// lane — entry/eligibility/odds, prize reveal, balance, withdrawal, payout setup.
// Keep these keys in sync with the surface strings passed to adManager.canShowAd.
export type MoneySurface =
  | 'contest-entry'
  | 'prize-reveal'
  | 'balance'
  | 'withdraw'
  | 'payout-setup'
  | 'claim';

const MONEY_SURFACES = new Set<string>([
  'contest-entry',
  'prize-reveal',
  'balance',
  'withdraw',
  'payout-setup',
  'claim',
]);

export function isMoneySurface(surface: string): boolean {
  return MONEY_SURFACES.has(surface);
}
