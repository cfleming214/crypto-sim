// ---------------------------------------------------------------------------
// Gamification logic — PURE functions only (no React, no Amplify, no native
// modules) so it can be unit-tested with `tsx` the same way portfolioHistory
// is. Persistence and UI live in AppContext / screens; this file is just math.
//
// Grows across phases. Phase 1: daily-reward streak + payout.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// Sentinel symbol for a cash-injection event (e.g. a daily-reward bonus). It is
// NOT a tradeable coin and NOT 'USDC' (the cash anchor) — using a distinct
// symbol lets the equity-history reconstruction treat it as a pure cash delta
// (see portfolioHistory.ts) and survives a cloud round-trip without needing a
// new `kind` column on the Trade model.
export const CASH_EVENT_SYMBOL = 'USD';

// UTC calendar-day key, e.g. "2026-06-04". Day boundaries are UTC so the streak
// is deterministic regardless of device timezone (and matches the server later).
export function todayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// Difference in whole UTC days between two day-keys (b - a). Both are
// "YYYY-MM-DD". Returns a signed integer.
function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / DAY_MS);
}

export interface DailyClaimState {
  streak: number;
  lastClaimDay: string | null;
}

export interface DailyClaimResult {
  claimed: boolean;        // false = already claimed today (caller should no-op)
  streak: number;          // new streak (unchanged if not claimed)
  lastClaimDay: string;    // today's key
  xp: number;              // XP granted this claim (0 if not claimed)
  cash: number;            // cash bonus granted this claim (0 if not claimed)
}

// Reward economics. Streak 1 → base; each consecutive day adds a step, capped so
// it can't run away. Kept modest — this is a sim, the fun is the streak, not the
// payout. Pure of Date so it's trivially testable.
const XP_BASE = 50;
const XP_STEP = 25;
const XP_CAP = 300;
const CASH_BASE = 25;
const CASH_STEP = 15;
const CASH_CAP = 150;

export function dailyXp(streak: number): number {
  return Math.min(XP_CAP, XP_BASE + Math.max(0, streak - 1) * XP_STEP);
}
export function dailyCash(streak: number): number {
  return Math.min(CASH_CAP, CASH_BASE + Math.max(0, streak - 1) * CASH_STEP);
}

// Whether the daily reward can be claimed right now (i.e. not already claimed
// today, UTC).
export function canClaim(lastClaimDay: string | null, now: number): boolean {
  return lastClaimDay !== todayKey(now);
}

// Next UTC midnight (ms epoch) — used for the "come back in HH:MM:SS" countdown.
export function nextClaimAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

// Apply a claim. Idempotent within a UTC day: claiming twice the same day is a
// no-op (claimed:false). A consecutive day continues the streak; any gap resets
// it to 1. The first claim ever (lastClaimDay null) starts the streak at 1.
// ---------------------------------------------------------------------------
// Trade economics (Phase 2): realized P&L on a sell + XP scaled by it.
// ---------------------------------------------------------------------------

// Realized P&L in dollars: proceeds (units × sellPrice) − cost basis
// (units × avgCost). Positive = profit on the units sold.
export function realizedPnl(avgCost: number, units: number, sellPrice: number): number {
  return units * (sellPrice - avgCost);
}

// XP awarded for a sell. Every exit earns a base; a profitable exit adds a bonus
// of ~1 XP per 1% return on cost basis (capped), so winning trades feel good
// while losses still earn the base "lesson" XP. `proceeds` = units × sellPrice.
const SELL_XP_BASE = 10;
const SELL_XP_BONUS_CAP = 120;
export function sellXp(pnl: number, proceeds: number): number {
  if (pnl <= 0) return SELL_XP_BASE;
  const cost = proceeds - pnl;                 // units × avgCost
  const returnPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const bonus = Math.min(SELL_XP_BONUS_CAP, Math.max(0, Math.round(returnPct)));
  return SELL_XP_BASE + bonus;
}

export function applyDailyClaim(prev: DailyClaimState, now: number): DailyClaimResult {
  const today = todayKey(now);
  if (prev.lastClaimDay === today) {
    return { claimed: false, streak: prev.streak, lastClaimDay: today, xp: 0, cash: 0 };
  }
  const continues = prev.lastClaimDay != null && dayDiff(prev.lastClaimDay, today) === 1;
  const streak = continues ? prev.streak + 1 : 1;
  return {
    claimed: true,
    streak,
    lastClaimDay: today,
    xp: dailyXp(streak),
    cash: dailyCash(streak),
  };
}
