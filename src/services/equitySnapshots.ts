import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchOhlc } from './priceService';
import { STARTING_CASH } from '../constants/featureFlags';
import type { Holding } from '../store/types';

// ---------------------------------------------------------------------------
// Recorded portfolio-balance history.
//
// The chart is driven by ACTUAL recorded balances, not reconstruction. While
// the app is foregrounded we append the live bankroll every ~60s (capture, in
// AppContext). The only thing this can't observe is price movement while the
// app was CLOSED — but during a closed gap there are no trades, so cash and
// holdings are constant. So on open we backfill the gap by valuing the (fixed)
// current holdings at historical prices: value(t) = cash + Σ units × price(t).
// That's the reliable slice of reconstruction — no ledger replay, no
// trade-vertex price mismatch — because the basket doesn't change mid-gap.
//
// Source of truth is local (AsyncStorage), keyed per portfolio. A cloud backup
// (UserProfile.equityHistoryJson) is layered on top for cross-device/reinstall.
// ---------------------------------------------------------------------------

export interface EquityPoint { t: number; v: number; }

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const KEY = (portfolioId: string) => `equitySnapshots.v1:${portfolioId}`;

// Keep every point only for the last 3h — that's all the Live (15m) and 1H
// windows ever read at full fidelity. Anything we keep beyond that is purely for
// the wider 24H/7D/30D zooms, which are massively oversampled, so coarser buckets
// look identical there.
const RECENT_FULL = 3 * HOUR;
// Absolute backstop on the local series length. The tiers below already bound a
// year of use to ~2k points; this guarantees the array (which is serialized to
// native storage every 30s) can never blow up from clock skew / corruption.
const MAX_POINTS = 2500;

// Tiered retention so the series can't grow unbounded: full 30s resolution for
// the last 3h, 2-min out to 24h, hourly out to 30d, daily beyond. A year of
// history is then ~2k points. Within a bucket the LATEST point wins (overwrite),
// so the most recent value in each window survives.
export function downsample(points: EquityPoint[], now: number): EquityPoint[] {
  const sorted = [...points].filter(p => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  const out: EquityPoint[] = [];
  const bucketIdx = new Map<string, number>();
  for (const p of sorted) {
    const age = now - p.t;
    const bucket = age <= RECENT_FULL
      ? `m:${p.t}`                                  // last 3h: every distinct point
      : age <= DAY
        ? `f:${Math.floor(p.t / (2 * MINUTE))}`     // 3-24h: 2-min
        : age <= 30 * DAY
          ? `h:${Math.floor(p.t / HOUR)}`           // mid: hourly
          : `d:${Math.floor(p.t / DAY)}`;           // old: daily
    const idx = bucketIdx.get(bucket);
    if (idx === undefined) { bucketIdx.set(bucket, out.length); out.push(p); }
    else out[idx] = p;                              // latest in bucket wins
  }
  // Hard backstop — keep only the most recent MAX_POINTS (out is ascending by t).
  return out.length > MAX_POINTS ? out.slice(out.length - MAX_POINTS) : out;
}

// Cloud backup is a coarser copy than the local store — drop the 1-min recent
// tier and keep hourly out to 30d, daily beyond. A year is then ~1k points
// (~32KB), which keeps the throttled DynamoDB write cheap. The local store
// stays full-fidelity; on a fresh device this coarser series seeds it and new
// 1-min points accrue from there.
export function downsampleForCloud(points: EquityPoint[], now: number): EquityPoint[] {
  const sorted = [...points].filter(p => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  const out: EquityPoint[] = [];
  const bucketIdx = new Map<string, number>();
  for (const p of sorted) {
    const bucket = now - p.t <= 30 * DAY
      ? `h:${Math.floor(p.t / HOUR)}`
      : `d:${Math.floor(p.t / DAY)}`;
    const idx = bucketIdx.get(bucket);
    if (idx === undefined) { bucketIdx.set(bucket, out.length); out.push(p); }
    else out[idx] = p;
  }
  return out;
}

// Strip spurious "$100k dip" points. A snapshot can be recorded while bankroll
// is still the INITIAL_STATE placeholder (exactly STARTING_CASH) during the
// launch window before the real profile loads — an artifact that shows as a dip
// to $100k between real points. Real balances are computed (cash + Σ units×price)
// and are essentially never EXACTLY STARTING_CASH, so once an account has any
// point that isn't exactly STARTING_CASH (i.e. it has moved off 100k), every
// remaining exact-STARTING_CASH point except the earliest (the legit account-
// creation origin) is the placeholder artifact and is dropped. A genuinely fresh
// all-cash account (every point exactly STARTING_CASH) is left untouched.
function sanitizeSnapshots(points: EquityPoint[]): EquityPoint[] {
  if (points.length < 2) return points;
  const movedOff = points.some(p => p.v !== STARTING_CASH);
  if (!movedOff) return points;
  let earliestT = Infinity;
  for (const p of points) if (p.t < earliestT) earliestT = p.t;
  return points.filter(p => p.v !== STARTING_CASH || p.t === earliestT);
}

// Resample an (unevenly spaced) equity series onto a uniform time grid of
// `count` points spaced `stepMs` apart and ending at `endT`, linearly
// interpolating between recorded points and holding the edge values flat
// outside the recorded range. The AreaChart distributes points evenly along X,
// so feeding it a uniform-time grid keeps the time axis honest — e.g. the 1H
// window becomes 60 one-minute points instead of whatever uneven mix of 60s
// captures and gap-backfill happened to land in the hour. Returns [] when there
// are no source points, so the caller keeps its own sparse fallback.
export function resampleSeries(points: EquityPoint[], endT: number, stepMs: number, count: number): EquityPoint[] {
  if (!(stepMs > 0) || count < 2) return [];
  const src = [...points].filter(p => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (src.length === 0) return [];
  const out: EquityPoint[] = [];
  let i = 0; // forward cursor: grid times are monotonic, so it only advances → O(count + src)
  for (let k = 0; k < count; k++) {
    const gt = endT - (count - 1 - k) * stepMs;
    while (i + 1 < src.length && src[i + 1].t <= gt) i++;
    let v: number;
    if (gt <= src[0].t) v = src[0].v;                 // before first reading → flat
    else if (i + 1 >= src.length) v = src[src.length - 1].v; // after last reading → flat
    else {
      const a = src[i], b = src[i + 1];               // bracketing readings → linear
      v = b.t > a.t ? a.v + (b.v - a.v) * ((gt - a.t) / (b.t - a.t)) : a.v;
    }
    out.push({ t: gt, v });
  }
  return out;
}

// Remove isolated single-point spikes from an equity series. A recorded balance
// can momentarily spike when a snapshot is captured against a transiently bad
// price (a CoinGecko outlier, an app-open before live prices settle, a stale
// tick) — it shows as a thin vertical spike on the chart even though the real
// portfolio didn't move. A point that deviates from BOTH of its time-neighbors
// in the SAME direction by more than `tol` (relative) is such an artifact, so we
// snap it onto the line between them. Genuine sustained moves aren't isolated
// (their neighbors moved the same way), so they survive untouched. Display-only:
// the stored series keeps the raw points; we just don't draw the spikes.
export function despikeSeries(points: EquityPoint[], tol = 0.015): EquityPoint[] {
  if (points.length < 3) return points;
  const out = points.slice();
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], c = points[i + 1], cur = points[i];
    const dPrev = (cur.v - a.v) / Math.max(1, Math.abs(a.v));
    const dNext = (cur.v - c.v) / Math.max(1, Math.abs(c.v));
    if (Math.sign(dPrev) === Math.sign(dNext) && Math.min(Math.abs(dPrev), Math.abs(dNext)) > tol) {
      const span = c.t - a.t;
      const interp = span > 0 ? a.v + (c.v - a.v) * ((cur.t - a.t) / span) : (a.v + c.v) / 2;
      out[i] = { ...cur, v: interp };
    }
  }
  return out;
}

export async function loadSnapshots(portfolioId: string): Promise<EquityPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY(portfolioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeSnapshots(parsed) : [];
  } catch {
    return [];
  }
}

async function saveSnapshots(portfolioId: string, points: EquityPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(portfolioId), JSON.stringify(points));
  } catch {
    // Storage full / unavailable — the in-memory series the caller holds is
    // still fine for this session; next successful write reconciles.
  }
}

// Wipe a portfolio's local equity history. Used when the demo portfolio is
// reset, so the graph re-anchors at the reset moment instead of showing the
// stale pre-reset curve.
export async function clearSnapshots(portfolioId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY(portfolioId));
  } catch {
    // Ignore — a failed clear just leaves the old series, which the reset's
    // fresh seed point will sit alongside until the next successful write.
  }
}

// Append one live-balance reading. Coalesces near-duplicate readings (a
// foreground/blur burst can fire sooner than the capture timer) by overwriting
// the last point when it's under CAPTURE_COALESCE_MS old. The threshold sits
// just under the 4s capture cadence so genuine 4s-apart readings are KEPT (the
// Live window gets many inputs) while sub-cadence bursts still collapse.
const CAPTURE_COALESCE_MS = 3_000;
export async function appendSnapshot(portfolioId: string, point: EquityPoint): Promise<EquityPoint[]> {
  if (!Number.isFinite(point.v) || point.v <= 0) return loadSnapshots(portfolioId);
  const points = await loadSnapshots(portfolioId);
  const last = points[points.length - 1];
  if (last && point.t - last.t < CAPTURE_COALESCE_MS) points[points.length - 1] = point;
  else points.push(point);
  const trimmed = downsample(points, point.t);
  await saveSnapshots(portfolioId, trimmed);
  return trimmed;
}

// Replace the whole series (used when seeding from the cloud backup on load).
export async function mergeSnapshots(portfolioId: string, incoming: EquityPoint[]): Promise<EquityPoint[]> {
  const existing = await loadSnapshots(portfolioId);
  const now = Math.max(
    existing[existing.length - 1]?.t ?? 0,
    incoming[incoming.length - 1]?.t ?? 0,
  ) || Date.now();
  // Sanitize the combined set: `incoming` (e.g. the cloud backup) may carry a
  // placeholder $100k point that `existing` was already cleaned of on load.
  const merged = sanitizeSnapshots(downsample([...existing, ...incoming], now));
  await saveSnapshots(portfolioId, merged);
  return merged;
}

function tfKeyForSpan(spanMs: number): string {
  const days = spanMs / DAY;
  if (days <= 1) return '24H';
  if (days <= 7) return '7D';
  if (days <= 30) return '30D';
  if (days <= 90) return '90D';
  return '1Y';
}

// Fill [fromT, toT] — time the app was closed — by valuing the CURRENT holdings
// at historical prices. Safe because no trades happen while closed, so the
// basket is constant across the gap. Returns the merged+persisted series.
export async function backfillGap(
  portfolioId: string,
  slice: { cash: number; holdings: Holding[] },
  fromT: number,
  toT: number,
  currentPrices: Map<string, number>,
): Promise<EquityPoint[]> {
  const existing = await loadSnapshots(portfolioId);
  const span = toT - fromT;
  if (span < 5 * MINUTE) return existing;   // nothing meaningful to fill

  // Build a NON-UNIFORM time grid: 5-min resolution for the most recent 3h,
  // hourly for anything older. The fine recent tail is what keeps the Live (15m)
  // and 1H windows honest — they get ~12 real points across the hour instead of
  // collapsing to a single point that the chart draws as a straight interpolated
  // ramp. Previously the WHOLE gap was hourly once it exceeded 3h, so a normal
  // daily user reopened to one point in the last hour → the straight-line-up bug.
  const FINE = 5 * MINUTE;
  const fineStart = Math.max(fromT, toT - 3 * HOUR);
  const grid: number[] = [];
  for (let t = Math.ceil(fromT / HOUR) * HOUR; t < fineStart; t += HOUR) grid.push(t);
  for (let t = Math.ceil(fineStart / FINE) * FINE; t < toT; t += FINE) grid.push(t);
  if (grid.length === 0) return existing;

  const tradable = slice.holdings.filter(h => h.symbol !== 'USDC' && h.units > 0);

  // No positions → the balance is pure cash and can't have moved while closed.
  if (tradable.length === 0) {
    const flat: EquityPoint[] = grid.map(t => ({ t, v: slice.cash }));
    return mergeSnapshots(portfolioId, flat);
  }

  // Price history per symbol. The coarse series (sized to the whole gap) values
  // the old hourly points; but for a gap longer than a day it only carries
  // hourly/daily closes, so the 5-min recent tail would read the SAME daily
  // close at every point and flatten back into a straight line. So when the gap
  // is long, ALSO pull the 24H series (5-min closes) and splice it in for the
  // recent window. (For gaps ≤ 24h the coarse key already IS '24H' = 5-min.)
  const coarseKey = tfKeyForSpan(span);
  const needFine = coarseKey !== '24H';
  const series = new Map<string, { t: number; p: number }[]>();
  await Promise.all(tradable.map(async h => {
    const coarse = await fetchOhlc(h.symbol, coarseKey);
    let pts = coarse.map(c => ({ t: c.timestamp, p: c.close }));
    if (needFine) {
      const fine = await fetchOhlc(h.symbol, '24H');
      pts = [
        ...pts.filter(x => x.t < fineStart),
        ...fine.map(c => ({ t: c.timestamp, p: c.close })).filter(x => x.t >= fineStart),
      ];
    }
    series.set(h.symbol, pts.sort((a, b) => a.t - b.t));
  }));

  // Forward price cursor per symbol → O(grid + Σcandles), no per-point search.
  // The grid is monotonic (hourly old points then 5-min recent ones), so the
  // cursor only ever advances.
  const cursor = new Map<string, number>();
  const priceAt = (sym: string, gt: number): number => {
    const s = series.get(sym);
    if (!s || s.length === 0) return currentPrices.get(sym) ?? 0;
    let idx = cursor.get(sym) ?? 0;
    while (idx + 1 < s.length && s[idx + 1].t <= gt) idx++;
    cursor.set(sym, idx);
    return s[idx].p;
  };

  const filled: EquityPoint[] = [];
  for (const t of grid) {
    let v = slice.cash;
    for (const h of tradable) v += h.units * priceAt(h.symbol, t);
    if (v > 0) filled.push({ t, v });
  }

  return mergeSnapshots(portfolioId, filled);
}
