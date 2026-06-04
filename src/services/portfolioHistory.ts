import { fetchOhlc } from './priceService';
import type { Trade, Holding } from '../store/types';

// ---------------------------------------------------------------------------
// Historical portfolio value reconstruction.
//
// value(t) = cash(t) + Σ units_held(sym, t) × historicalPrice(sym, t)
//
// cash(t)/units_held(t) come from replaying the trade ledger up to t; the
// per-coin historical price comes from CoinGecko via fetchOhlc(). This is
// inherently STABLE — a past point depends only on trades with timestamp ≤ t
// plus immutable historical prices, so buying/selling now never shifts history
// — and it FILLS GAPS for periods the app was closed (prices are fetched for
// the whole window regardless of whether the app was running).
// ---------------------------------------------------------------------------

export interface EquityPoint { t: number; v: number; }

export interface PortfolioHistoryResult {
  points: EquityPoint[];
  partial: boolean;   // true if any coin's history had to be flat-estimated
}

export interface ComputeOpts {
  nowValue: number;                     // live bankroll — anchors the final point exactly
  currentPrices: Map<string, number>;   // symbol → current price (fallback for missing series)
  createdAt?: number;                   // account/portfolio start (ms epoch)
  signal?: { cancelled: boolean };      // cooperative cancellation
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// PortfolioScreen timeframe label → window length. MAX = full lifetime.
const TF_WINDOW_MS: Record<string, number> = {
  Live: 15 * MINUTE,
  '1H': HOUR,
  '24H': DAY,
  '7D': 7 * DAY,
  '30D': 30 * DAY,
  MAX: Infinity,
};

// Pick the smallest priceService timeframe bucket whose range covers `spanMs`,
// so fetchOhlc's per-(symbol,timeframe) cache is reused. CoinGecko demo tier
// caps historical data at 365 days, so '1Y' is the ceiling — accounts older
// than a year show their most recent 365 days on MAX.
function pickTfKey(spanMs: number): string {
  const days = spanMs / DAY;
  if (days <= 1) return '24H';
  if (days <= 7) return '7D';
  if (days <= 30) return '30D';
  if (days <= 90) return '90D';
  return '1Y';
}

function lastTradePrice(tradesAsc: Trade[], sym: string): number | undefined {
  for (let i = tradesAsc.length - 1; i >= 0; i--) {
    if (tradesAsc[i].symbol === sym) return tradesAsc[i].price;
  }
  return undefined;
}

export async function computePortfolioHistory(
  trades: Trade[],
  current: { cash: number; holdings: Holding[] },
  timeframe: string,
  opts: ComputeOpts,
): Promise<PortfolioHistoryResult> {
  const now = Date.now();
  const tradesAsc = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  // 1) Derive the starting baseline by REVERSE-replaying the ledger from the
  // current (authoritative) state. Whatever can't be explained by trades is the
  // starting grant. This is robust to the un-traded 0.01 BTC seed on older
  // accounts (→ baseline holds it) and to the recorded seed trade on new ones
  // (→ baseline is pure cash). No per-account migration needed. USDC is cash,
  // never a position.
  let cash0 = current.cash;
  const units0 = new Map<string, number>();
  for (const h of current.holdings) {
    if (h.symbol === 'USDC') continue;
    units0.set(h.symbol, (units0.get(h.symbol) ?? 0) + h.units);
  }
  for (let i = tradesAsc.length - 1; i >= 0; i--) {
    const tr = tradesAsc[i];
    if (tr.symbol === 'USDC') continue;
    if (tr.side === 'buy') {
      cash0 += tr.amount;
      units0.set(tr.symbol, (units0.get(tr.symbol) ?? 0) - tr.units);
    } else {
      cash0 -= tr.amount;
      units0.set(tr.symbol, (units0.get(tr.symbol) ?? 0) + tr.units);
    }
  }
  const holdings0 = new Map<string, number>();
  for (const [sym, u] of units0) if (Math.abs(u) > 1e-9) holdings0.set(sym, u);

  // 2) Window + CoinGecko granularity.
  const earliestTrade = tradesAsc.length ? tradesAsc[0].timestamp : now;
  const t0 = opts.createdAt ?? earliestTrade;
  const windowMs = TF_WINDOW_MS[timeframe] ?? TF_WINDOW_MS['7D'];
  const windowStart = windowMs === Infinity ? t0 : Math.max(t0, now - windowMs);
  const spanMs = Math.max(now - windowStart, HOUR);
  const tfKey = pickTfKey(spanMs);

  // 3) Every symbol ever held in the window = baseline holdings + traded symbols.
  const symbols = new Set<string>();
  for (const sym of holdings0.keys()) symbols.add(sym);
  for (const tr of tradesAsc) if (tr.symbol !== 'USDC') symbols.add(tr.symbol);

  // 4) Fetch each coin's historical close series in parallel. A missing series
  // (no geckoId / delisted / rate-limited) becomes a flat line at the last-known
  // price so one coin can't zero or cliff the whole curve — flagged `partial`.
  let partial = false;
  const seriesBySymbol = new Map<string, { t: number; p: number }[]>();
  const symArr = [...symbols];
  const fetched = await Promise.all(
    symArr.map(async sym => ({ sym, candles: await fetchOhlc(sym, tfKey) })),
  );
  if (opts.signal?.cancelled) return { points: [], partial: false };
  for (const { sym, candles } of fetched) {
    if (candles.length > 0) {
      seriesBySymbol.set(
        sym,
        candles.map(c => ({ t: c.timestamp, p: c.close })).sort((a, b) => a.t - b.t),
      );
    } else {
      const flat = opts.currentPrices.get(sym) ?? lastTradePrice(tradesAsc, sym) ?? 0;
      seriesBySymbol.set(sym, [{ t: windowStart, p: flat }]);
      partial = true;
    }
  }

  // 5) Unified, sorted time grid: candle timestamps + every trade vertex (so a
  // trade shows as an exact step) + the window endpoints. Capped to keep the
  // AreaChart bezier path cheap, always preserving trade vertices + endpoints.
  const gridSet = new Set<number>([windowStart, now]);
  for (const series of seriesBySymbol.values()) {
    for (const pt of series) if (pt.t >= windowStart && pt.t <= now) gridSet.add(pt.t);
  }
  for (const tr of tradesAsc) {
    if (tr.timestamp >= windowStart && tr.timestamp <= now) gridSet.add(tr.timestamp);
  }
  let grid = [...gridSet].sort((a, b) => a - b);

  const MAX_POINTS = 150;
  if (grid.length > MAX_POINTS) {
    const tradeTs = new Set(tradesAsc.map(t => t.timestamp));
    const keep = new Set<number>([grid[0], grid[grid.length - 1]]);
    for (const g of grid) if (tradeTs.has(g)) keep.add(g);
    const budget = MAX_POINTS - keep.size;
    if (budget > 0) {
      const stride = Math.max(1, Math.ceil(grid.length / budget));
      for (let i = 0; i < grid.length; i += stride) keep.add(grid[i]);
    }
    grid = [...keep].sort((a, b) => a - b);
  }

  // 6) Forward replay with a single advancing trade pointer + one forward price
  // cursor per symbol → O(grid + Σcandles + trades), no per-point binary search.
  let cash = cash0;
  const units = new Map<string, number>(holdings0);
  let ti = 0;
  const cursor = new Map<string, number>();

  const stepPrice = (sym: string, gt: number): number => {
    const series = seriesBySymbol.get(sym);
    if (!series || series.length === 0) return opts.currentPrices.get(sym) ?? 0;
    let idx = cursor.get(sym) ?? 0;
    while (idx + 1 < series.length && series[idx + 1].t <= gt) idx++;
    cursor.set(sym, idx);
    return series[idx].p; // last close at-or-before gt (or the first close if gt precedes it)
  };

  const points: EquityPoint[] = [];
  for (const gt of grid) {
    while (ti < tradesAsc.length && tradesAsc[ti].timestamp <= gt) {
      const tr = tradesAsc[ti++];
      if (tr.symbol === 'USDC') continue;
      if (tr.side === 'buy') {
        cash -= tr.amount;
        units.set(tr.symbol, (units.get(tr.symbol) ?? 0) + tr.units);
      } else {
        cash += tr.amount;
        const u = (units.get(tr.symbol) ?? 0) - tr.units;
        if (u <= 1e-9) units.delete(tr.symbol);
        else units.set(tr.symbol, u);
      }
    }
    let v = cash;
    for (const [sym, u] of units) {
      if (u <= 0) continue;
      v += u * stepPrice(sym, gt);
    }
    points.push({ t: gt, v });
  }

  // 7) Anchor the final point to the live bankroll so the chart's right edge
  // matches the header $ value exactly (reconstruction at `now` uses the latest
  // candle, which can be a few minutes stale).
  if (points.length > 0) points[points.length - 1] = { t: now, v: opts.nowValue };

  return { points, partial };
}
