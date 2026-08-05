// ---------------------------------------------------------------------------
// The single definition of what a portfolio is worth.
//
//   value(t) = Σ_coin  units_held(coin, t) × price(coin, t)
//
// with CASH treated as a coin whose price is always 1.0. That removes the
// special case: an all-cash, partly-invested and fully-invested portfolio are
// the same expression, and no caller has to remember to add `cash +` first.
//
// This exists because the same sum was written out four times — the live tick,
// LOAD_PROFILE, the offline gap backfill and the ledger rebuild — and they had
// already drifted. Three valued an unpriceable coin at 0 and carried on; the
// fourth rejected the whole data point. Both behaviours are legitimate, so
// `strict` selects between them explicitly instead of it being an accident of
// which copy you happened to be reading.
// ---------------------------------------------------------------------------

/** Sentinel for the synthetic cash position. Not a tradeable coin. */
export const CASH_SYMBOL = 'USD';

export interface ValuedHolding { symbol: string; units: number; }

// USDC is the $1 cash anchor, never a position — healHoldings folds any stranded
// USDC back into `cash`, and buying it is blocked in the UI. Filtered here too so
// a legacy row can't be counted twice: once as a holding and again inside cash.
const isCashAnchor = (symbol: string) => symbol === 'USDC' || symbol === CASH_SYMBOL;

/**
 * Portfolio value at a point in time.
 *
 * `priceOf` returns the price of a symbol at whatever instant the caller cares
 * about — the live poll, an OHLC candle at t, whatever. Cash is added as a $1
 * position, so it never needs a branch.
 *
 * strict=false (default): an unpriceable coin contributes 0, matching the live
 *   path, where a coin briefly missing from the catalog shouldn't blank the
 *   header.
 * strict=true: returns null if ANY held coin is unpriceable. Reconstruction uses
 *   this — a point that silently omits a holding is worse than no point, because
 *   it gets persisted and read back as fact (see CRYP-45).
 */
export function portfolioValue(
  holdings: ValuedHolding[],
  cash: number,
  priceOf: (symbol: string) => number | undefined,
  opts: { strict?: boolean } = {},
): number | null {
  let total = Number.isFinite(cash) ? cash : 0;   // cash × 1.0
  for (const h of holdings ?? []) {
    if (isCashAnchor(h.symbol) || !(h.units > 0)) continue;
    const p = priceOf(h.symbol);
    if (!(typeof p === 'number' && p > 0)) {
      if (opts.strict) return null;
      continue;                                    // lenient: contributes 0
    }
    total += h.units * p;
  }
  return total;
}
