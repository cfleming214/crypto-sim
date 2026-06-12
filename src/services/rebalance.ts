import type { Holding } from '../store/types';

// ---------------------------------------------------------------------------
// Rebalance planner — pure, framework-free, so the SAME math drives the
// PortfolioScreen preview sheet AND the AppContext REBALANCE reducer. Keeping a
// single source of truth avoids the preview/apply drift that previously let a
// "reset → rebalance" land on a stale "already balanced" path.
//
// Two modes, chosen automatically:
//   • DEPLOY   — the portfolio is mostly idle cash (e.g. right after a reset,
//                where only the 0.01-BTC starter seed is held). Build an
//                equal-weight basket of the top-N coins, FOLDING any existing
//                position in a target coin into its target (so the seed BTC is
//                topped up, not double-bought). Keeps a small cash buffer.
//   • EQUALIZE — already a multi-coin basket. Level the top-N held coins to
//                their mutual average (sells fund buys, cash-neutral).
// ---------------------------------------------------------------------------

export interface RebalanceCoin { symbol: string; price: number; }

export interface RebalancePlanLine {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;        // dollar size of the trade
  price: number;
  units: number;         // amount / price
  currentValue: number;  // position value before the trade
  targetValue: number;   // position value after the trade
  currentPct: number;    // currentValue as % of total equity
  targetPct: number;     // targetValue as % of total equity
}

export interface RebalancePlan {
  lines: RebalancePlanLine[];
  targetPerCoin: number;
  mode: 'deploy' | 'equalize';
}

const MIN_DELTA = 5;       // ignore sub-$5 drift (and dust holdings)
const CASH_BUFFER = 0.05;  // leave 5% in cash when deploying

export function planRebalance(
  holdings: Holding[],
  cash: number,
  coins: RebalanceCoin[],
  opts?: { topN?: number },
): RebalancePlan {
  const topN = opts?.topN ?? 5;
  const priceOf = (sym: string) => coins.find(c => c.symbol === sym)?.price ?? 0;

  // USDC is the cash anchor, never a position; only priced coins count.
  const held = holdings
    .filter(h => h.symbol !== 'USDC')
    .map(h => ({ symbol: h.symbol, units: h.units, price: priceOf(h.symbol) }))
    .filter(h => h.price > 0);
  const investedValue = held.reduce((s, h) => s + h.units * h.price, 0);
  const equity = cash + investedValue;
  const curVal = (sym: string) => {
    const h = held.find(x => x.symbol === sym);
    return h ? h.units * h.price : 0;
  };
  const pct = (v: number) => (equity > 0 ? (v / equity) * 100 : 0);

  // Fewer than a full basket of meaningful positions + spare cash → DEPLOY.
  const meaningful = held.filter(h => h.units * h.price > MIN_DELTA);
  const deploy = meaningful.length < topN && cash > 50;

  if (deploy) {
    const targetCoins = coins
      .filter(c => c.symbol !== 'USDC' && c.price > 0)
      .slice(0, topN);
    if (targetCoins.length === 0) return { lines: [], targetPerCoin: 0, mode: 'deploy' };

    const targetSet = new Set(targetCoins.map(c => c.symbol));
    const valueInTargets = held
      .filter(h => targetSet.has(h.symbol))
      .reduce((s, h) => s + h.units * h.price, 0);
    const investable = (cash + valueInTargets) * (1 - CASH_BUFFER);
    const perCoin = investable / targetCoins.length;

    const lines: RebalancePlanLine[] = [];
    for (const c of targetCoins) {
      const current = curVal(c.symbol);
      const delta = perCoin - current;
      if (Math.abs(delta) <= MIN_DELTA) continue;
      lines.push({
        symbol: c.symbol,
        side: delta > 0 ? 'buy' : 'sell',
        amount: Math.abs(delta),
        price: c.price,
        units: Math.abs(delta) / c.price,
        currentValue: current,
        targetValue: perCoin,
        currentPct: pct(current),
        targetPct: pct(perCoin),
      });
    }
    return { lines, targetPerCoin: perCoin, mode: 'deploy' };
  }

  // EQUALIZE — level the top-N held coins to their mutual average.
  const top = held.slice(0, topN);
  const totalInvested = top.reduce((s, h) => s + h.units * h.price, 0);
  const perCoin = top.length ? totalInvested / top.length : 0;

  const lines: RebalancePlanLine[] = [];
  for (const h of top) {
    const current = h.units * h.price;
    const delta = perCoin - current;
    if (Math.abs(delta) <= MIN_DELTA) continue;
    lines.push({
      symbol: h.symbol,
      side: delta > 0 ? 'buy' : 'sell',
      amount: Math.abs(delta),
      price: h.price,
      units: Math.abs(delta) / h.price,
      currentValue: current,
      targetValue: perCoin,
      currentPct: pct(current),
      targetPct: pct(perCoin),
    });
  }
  return { lines, targetPerCoin: perCoin, mode: 'equalize' };
}

// ---------------------------------------------------------------------------
// Copy-portfolio planner — produce the buy/sell trades that move MY portfolio to
// match a target allocation (a trader's weights, % of equity per coin). Same
// pure-function contract + RebalancePlanLine shape as planRebalance, so it can
// drive both a preview sheet and the COPY_ALLOCATION reducer. Sizes everything
// to MY equity, so I end with the same MIX (not the same dollars). Symbols I
// hold that aren't in the target are sold out (target 0%).
// ---------------------------------------------------------------------------
export function planCopyAllocation(
  holdings: Holding[],
  cash: number,
  coins: RebalanceCoin[],
  target: { symbol: string; pct: number }[],
): RebalancePlan {
  const priceOf = (sym: string) => coins.find(c => c.symbol === sym)?.price ?? 0;
  const held = holdings
    .filter(h => h.symbol !== 'USDC')
    .map(h => ({ symbol: h.symbol, units: h.units, price: priceOf(h.symbol) }))
    .filter(h => h.price > 0);
  const equity = cash + held.reduce((s, h) => s + h.units * h.price, 0);
  const curVal = (sym: string) => {
    const h = held.find(x => x.symbol === sym);
    return h ? h.units * h.price : 0;
  };
  const pct = (v: number) => (equity > 0 ? (v / equity) * 100 : 0);

  // Target value per symbol (only priced, non-USDC, positive weight).
  const targetVal = new Map<string, number>();
  for (const t of target) {
    if (t.symbol === 'USDC' || priceOf(t.symbol) <= 0 || !(t.pct > 0)) continue;
    targetVal.set(t.symbol, (targetVal.get(t.symbol) ?? 0) + (equity * t.pct) / 100);
  }

  const symbols = new Set<string>([...held.map(h => h.symbol), ...targetVal.keys()]);
  const lines: RebalancePlanLine[] = [];
  for (const sym of symbols) {
    const price = priceOf(sym);
    if (price <= 0) continue;
    const current = curVal(sym);
    const tv = targetVal.get(sym) ?? 0;   // 0 = sell the whole position
    const delta = tv - current;
    if (Math.abs(delta) <= MIN_DELTA) continue;
    lines.push({
      symbol: sym,
      side: delta > 0 ? 'buy' : 'sell',
      amount: Math.abs(delta),
      price,
      units: Math.abs(delta) / price,
      currentValue: current,
      targetValue: tv,
      currentPct: pct(current),
      targetPct: pct(tv),
    });
  }
  // Sells first so the preview/apply pass funds the buys.
  lines.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { lines, targetPerCoin: 0, mode: 'equalize' };
}
