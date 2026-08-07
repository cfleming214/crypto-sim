// ---------------------------------------------------------------------------
// Execution cost.
//
// Market orders in the real world don't fill at the mid price — you cross the
// spread, so you buy a little above and sell a little below. The app has always
// advertised "Slippage (max) 0.10%" on the trade ticket, but for a long time
// nothing applied it: buys filled at `amount / price` and sells at
// `units * price`, making a round trip free. That misstated the product and it
// sent people looking for a fee to explain ordinary price movement (CRYP-64).
//
// So the advertised rate is now the charged rate. A $1,000 round trip costs
// about $2.00 (0.20%), and a portfolio dips slightly on trade.
// ---------------------------------------------------------------------------

/** Half-spread applied to every market fill. 0.001 = 0.10%, matching the UI. */
export const SLIPPAGE_RATE = 0.001;

/** What you actually pay per unit when buying — worse than mid. */
export const buyFillPrice = (marketPrice: number): number =>
  marketPrice * (1 + SLIPPAGE_RATE);

/** What you actually receive per unit when selling — worse than mid. */
export const sellFillPrice = (marketPrice: number): number =>
  marketPrice * (1 - SLIPPAGE_RATE);
