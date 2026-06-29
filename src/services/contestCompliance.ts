// Client mirror of the cash-contest compliance helpers (authoritative copy lives
// server-side in amplify/functions/lib/contestCompliance.ts). Used for display and
// pre-submit guards; the server enforces the real cap on create.

export const PRIZE_POOL_CAP_CENTS = 499_900; // just under $5,000 (NY/FL reg. threshold)

// Sum a prizes array (per-rank dollar amounts) into total cents. Accepts the
// store's number[] (Competition.prizes) or a JSON string.
export function aggregatePrizeCents(prizes: number[] | string | undefined | null): number {
  let arr: unknown = prizes;
  if (typeof prizes === 'string') {
    try { arr = JSON.parse(prizes); } catch { return 0; }
  }
  if (!Array.isArray(arr)) return 0;
  return arr.reduce<number>((sum, v) => {
    const dollars = typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
    return sum + Math.round(dollars * 100);
  }, 0);
}

export function isWithinPrizeCap(prizes: number[] | string | undefined | null): boolean {
  return aggregatePrizeCents(prizes) < PRIZE_POOL_CAP_CENTS;
}
