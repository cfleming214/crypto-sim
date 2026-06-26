// Shared cash-contest compliance helpers (server-side, authoritative).
//
// Prize-pool cap: NY/FL require sweepstakes registration + bonding once the total
// prize value of a single contest exceeds $5,000. We keep every cash contest under
// that line so the registration/bonding burden never triggers. The cap is the
// hard ceiling; creation is rejected at or above it.

export const PRIZE_POOL_CAP_CENTS = 499_900; // just under $5,000

// Sum a prizesJson array (JSON array of per-rank DOLLAR amounts) into total cents.
// Tolerant of malformed input: non-arrays / non-numbers contribute 0.
export function aggregatePrizeCents(prizesJson: string | undefined | null): number {
  if (!prizesJson) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(prizesJson);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  return parsed.reduce<number>((sum, v) => {
    const dollars = typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
    return sum + Math.round(dollars * 100);
  }, 0);
}

// True if the contest awards any positive cash prize (→ Lane B / cashPrize).
export function hasCashPrize(prizesJson: string | undefined | null): boolean {
  return aggregatePrizeCents(prizesJson) > 0;
}

// Throws if a cash contest's total prize pool meets/exceeds the registration cap.
export function assertPrizePoolWithinCap(prizesJson: string | undefined | null): void {
  const total = aggregatePrizeCents(prizesJson);
  if (total >= PRIZE_POOL_CAP_CENTS) {
    throw new Error(
      `Prize pool $${(total / 100).toFixed(2)} meets/exceeds the $${(PRIZE_POOL_CAP_CENTS / 100).toFixed(2)} cap ` +
      `(NY/FL sweepstakes registration threshold). Lower the prizes or split into separate contests.`,
    );
  }
}
