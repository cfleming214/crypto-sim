import type { ReplayMeta } from '../store/types';

// Deterministic replay clock: elapsed real time maps 1:1 to historical time.
// These functions are the single source of truth for a replay's price/date, and
// the tick-replay-leaderboard Lambda re-implements the SAME `execPrice` formula
// so the server and every device always agree to the minute.

export function replayIndex(meta: ReplayMeta, now: number): number {
  const i = Math.floor((now - meta.startAt) / (meta.intervalMs || 60000));
  return Math.max(0, Math.min(meta.prices.length - 1, i));
}

// Authoritative price: the close at the current historical minute. Trades fill
// at this, and bankroll-of-record + the leaderboard use it.
export function replayPriceAt(meta: ReplayMeta, now: number): number {
  if (!meta.prices.length) return 0;
  return meta.prices[replayIndex(meta, now)];
}

// Cosmetic per-second smoothing: linearly interpolate between the current minute
// close and the next by the fractional minute. Used ONLY for the chart line +
// on-screen price number — NEVER for execution or ranking.
export function replayDisplayPrice(meta: ReplayMeta, now: number): number {
  const len = meta.prices.length;
  if (!len) return 0;
  const raw = (now - meta.startAt) / (meta.intervalMs || 60000);
  const i = Math.max(0, Math.min(len - 1, Math.floor(raw)));
  const next = Math.min(len - 1, i + 1);
  const frac = Math.max(0, Math.min(1, raw - Math.floor(raw)));
  return meta.prices[i] + (meta.prices[next] - meta.prices[i]) * frac;
}

// The real calendar date the current step represents, e.g. "September 13, 2020".
// Uses histStepMs (historical time per step), which differs from intervalMs
// (real time per step) for accelerated solo replays.
export function replayDateAt(meta: ReplayMeta, now: number): Date {
  const histStep = meta.histStepMs ?? meta.intervalMs ?? 60000;
  return new Date(Date.parse(meta.histStartIso) + replayIndex(meta, now) * histStep);
}

export function replayDateLabel(meta: ReplayMeta, now: number): string {
  return replayDateAt(meta, now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// 0..1 progress through the contest's real-time window.
export function replayProgress(meta: ReplayMeta, now: number): number {
  const span = meta.endAt - meta.startAt;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (now - meta.startAt) / span));
}
