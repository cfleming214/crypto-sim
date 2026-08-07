// Execution cost, server side.
//
// Must stay identical to src/constants/trading.ts. Functions don't import from
// src/ (they're bundled separately), so the value is duplicated rather than
// shared — but it must not drift: if a server-filled limit order were cheaper
// than the same order filled in the app, the fill venue would change the price
// you pay, which is both wrong and exploitable.
//
// execute-trade carried its own copy of this for a long time, with a comment
// claiming it "matches the client sim" while the client sim charged nothing at
// all (CRYP-64). One constant, referenced everywhere, is what stops that.

/** Half-spread applied to every market fill. 0.001 = 0.10%. */
export const SLIPPAGE_RATE = 0.001;

/** What the trader actually pays per unit when buying — worse than mid. */
export const buyFillPrice = (marketPrice: number): number =>
  marketPrice * (1 + SLIPPAGE_RATE);

/** What the trader actually receives per unit when selling — worse than mid. */
export const sellFillPrice = (marketPrice: number): number =>
  marketPrice * (1 - SLIPPAGE_RATE);
