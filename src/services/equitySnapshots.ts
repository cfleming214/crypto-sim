import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchOhlc } from './priceService';
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

// Tiered retention so the series can't grow unbounded: full 1-min resolution
// for the last 24h, one point per hour out to 30d, one per day beyond. A year
// of history is then only a few hundred points. Within a bucket the LATEST
// point wins (overwrite), so the most recent value in each window survives.
export function downsample(points: EquityPoint[], now: number): EquityPoint[] {
  const sorted = [...points].filter(p => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  const out: EquityPoint[] = [];
  const bucketIdx = new Map<string, number>();
  for (const p of sorted) {
    const age = now - p.t;
    const bucket = age <= DAY
      ? `m:${p.t}`                              // recent: keep every distinct point
      : age <= 30 * DAY
        ? `h:${Math.floor(p.t / HOUR)}`         // mid: hourly
        : `d:${Math.floor(p.t / DAY)}`;         // old: daily
    const idx = bucketIdx.get(bucket);
    if (idx === undefined) { bucketIdx.set(bucket, out.length); out.push(p); }
    else out[idx] = p;                          // latest in bucket wins
  }
  return out;
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

export async function loadSnapshots(portfolioId: string): Promise<EquityPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY(portfolioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

// Append one live-balance reading. Coalesces sub-minute repeats (the capture
// timer fires ~1/min, but a foreground/blur burst could fire sooner) by
// overwriting the last point when it's <~minute old, so we keep ~1 point/min.
export async function appendSnapshot(portfolioId: string, point: EquityPoint): Promise<EquityPoint[]> {
  if (!Number.isFinite(point.v) || point.v <= 0) return loadSnapshots(portfolioId);
  const points = await loadSnapshots(portfolioId);
  const last = points[points.length - 1];
  if (last && point.t - last.t < 0.9 * MINUTE) points[points.length - 1] = point;
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
  const merged = downsample([...existing, ...incoming], now);
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
  if (toT - fromT < HOUR) return existing;   // nothing meaningful to fill

  const tradable = slice.holdings.filter(h => h.symbol !== 'USDC' && h.units > 0);

  // No positions → the balance is pure cash and can't have moved while closed.
  if (tradable.length === 0) {
    const flat: EquityPoint[] = [];
    for (let t = Math.ceil(fromT / HOUR) * HOUR; t < toT; t += HOUR) flat.push({ t, v: slice.cash });
    return mergeSnapshots(portfolioId, flat);
  }

  const tfKey = tfKeyForSpan(toT - fromT);
  const series = new Map<string, { t: number; p: number }[]>();
  await Promise.all(tradable.map(async h => {
    const candles = await fetchOhlc(h.symbol, tfKey);
    series.set(
      h.symbol,
      candles.map(c => ({ t: c.timestamp, p: c.close })).sort((a, b) => a.t - b.t),
    );
  }));

  // Forward price cursor per symbol → O(grid + Σcandles), no per-point search.
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
  for (let t = Math.ceil(fromT / HOUR) * HOUR; t < toT; t += HOUR) {
    let v = slice.cash;
    for (const h of tradable) v += h.units * priceAt(h.symbol, t);
    if (v > 0) filled.push({ t, v });
  }

  return mergeSnapshots(portfolioId, filled);
}
