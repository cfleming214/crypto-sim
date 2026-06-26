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

// UTC week key — whole 7-day periods since the Unix epoch ("W2901"). Drives the
// free weekly contest-pass grant: exactly once per week, timezone-independent.
export function weekKey(now: number): string {
  return `W${Math.floor(now / (7 * DAY_MS))}`;
}

// Free Lane-A contest passes granted at the start of each week.
export const WEEKLY_PASS_GRANT = 1;

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

// ---------------------------------------------------------------------------
// Achievements (Phase 3). Data-driven defs + a pure evaluator. Icons are string
// keys mapped to lucide components in the UI layer (this file stays React-free).
// ---------------------------------------------------------------------------

export type AchievementId =
  | 'first-trade' | 'trades-10' | 'trades-100' | 'trades-500'
  | 'streak-7' | 'streak-30' | 'diamond-hands' | 'safe-trader'
  | 'copycat' | 'top-50' | 'win-bracket' | 'big-winner'
  | 'first-10x' | 'predictor' | 'graduate';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;   // lucide key, see ACHIEVEMENT_ICONS in the UI layer
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-trade',   name: 'First trade',    description: 'Make your first trade',                 icon: 'Star' },
  { id: 'trades-10',     name: '10 trades',      description: 'Complete 10 trades',                    icon: 'ArrowLeftRight' },
  { id: 'trades-100',    name: '100 trades',     description: 'Complete 100 trades',                   icon: 'ArrowLeftRight' },
  { id: 'trades-500',    name: '500 trades',     description: 'Complete 500 trades',                   icon: 'ArrowLeftRight' },
  { id: 'streak-7',      name: '7-day streak',   description: 'Claim the daily reward 7 days running', icon: 'Flame' },
  { id: 'streak-30',     name: '30-day streak',  description: 'Claim the daily reward 30 days running', icon: 'Flame' },
  { id: 'diamond-hands', name: 'Diamond hands',  description: 'Hold 4 or more coins at once',          icon: 'Gem' },
  { id: 'safe-trader',   name: 'Safe trader',    description: 'Set a stop-loss order',                 icon: 'Shield' },
  { id: 'copycat',       name: 'Copycat',        description: 'Mirror another trader',                 icon: 'Users' },
  { id: 'top-50',        name: 'Top 50',         description: 'Reach the top 50 of a contest',         icon: 'Trophy' },
  { id: 'win-bracket',   name: 'Win bracket',    description: 'Finish #1 in a contest',                icon: 'Crown' },
  { id: 'big-winner',    name: 'Big winner',     description: 'Realize a $1,000+ profit on one sell',  icon: 'TrendingUp' },
  { id: 'first-10x',     name: 'First 10x',      description: 'Sell a position up 10x (900%+)',        icon: 'Rocket' },
  { id: 'predictor',     name: 'Predictor',      description: 'Win 5 price predictions',               icon: 'Target' },
  { id: 'graduate',      name: 'Graduate',       description: 'Complete every Crypto Academy lesson',  icon: 'GraduationCap' },
];

export interface AchievementInput {
  coinTradeCount: number;        // trades excluding reward/seed events
  streak: number;
  holdingsCount: number;
  stopLossCount: number;
  mirrorCount: number;
  bestRank: number;              // Infinity if never ranked
  wonBracket: boolean;
  bestRealizedPnl: number;       // largest single-sell realized $ profit
  bestRealizedReturnPct: number; // largest single-sell realized return %
  predictionWins: number;
}

// The set of achievement ids currently earned given the input snapshot. Pure +
// monotonic in practice (conditions only become true) — the watcher diffs this
// against the persisted unlock map to detect *new* unlocks.
export function evaluateAchievements(s: AchievementInput): Set<AchievementId> {
  const e = new Set<AchievementId>();
  if (s.coinTradeCount >= 1) e.add('first-trade');
  if (s.coinTradeCount >= 10) e.add('trades-10');
  if (s.coinTradeCount >= 100) e.add('trades-100');
  if (s.coinTradeCount >= 500) e.add('trades-500');
  if (s.streak >= 7) e.add('streak-7');
  if (s.streak >= 30) e.add('streak-30');
  if (s.holdingsCount >= 4) e.add('diamond-hands');
  if (s.stopLossCount > 0) e.add('safe-trader');
  if (s.mirrorCount > 0) e.add('copycat');
  if (s.bestRank <= 50) e.add('top-50');
  if (s.wonBracket) e.add('win-bracket');
  if (s.bestRealizedPnl >= 1000) e.add('big-winner');
  if (s.bestRealizedReturnPct >= 900) e.add('first-10x');
  if (s.predictionWins >= 5) e.add('predictor');
  return e;
}

// ---------------------------------------------------------------------------
// Price-prediction mini-game (Phase 5). Lock a price, pick a direction, and
// after PREDICTION_SECONDS compare against the live price.
// ---------------------------------------------------------------------------

export type PredictionDirection = 'up' | 'down';
export type PredictionOutcome = 'win' | 'loss' | 'push';

export const PREDICTION_SECONDS = 60;
export const PREDICTION_XP = 1000;   // base XP awarded on a win
// Per-step streak bonus: each consecutive correct call adds this × the streak
// length on top of PREDICTION_XP (1st in a row +500, 2nd +1000, 3rd +1500…).
// A loss resets the streak to 0.
export const PREDICTION_STREAK_XP = 500;

// Resolve a prediction. An exact tie (no move) is a push (no win/loss recorded).
export function resolvePrediction(
  dir: PredictionDirection,
  lockedPrice: number,
  finalPrice: number,
): PredictionOutcome {
  if (finalPrice === lockedPrice) return 'push';
  const movedUp = finalPrice > lockedPrice;
  return (dir === 'up') === movedUp ? 'win' : 'loss';
}

// ---------------------------------------------------------------------------
// Contest prizes (XP). When cash prizes are off (CONTEST_CASH_PRIZES), winning a
// contest awards XP instead. Each contest carries a headline `prizeXp` (the
// winner's award, default DEFAULT_PRIZE_XP); the podium splits it 100/50/25%.
// ---------------------------------------------------------------------------

// XP a given finishing rank earns from a contest's prizeXp. 1st takes it all,
// 2nd half, 3rd a quarter; everyone else nothing.
export function contestXpForRank(prizeXp: number, rank: number): number {
  if (!(prizeXp > 0) || rank < 1) return 0;
  const split = [1, 0.5, 0.25];
  const weight = split[rank - 1] ?? 0;
  return Math.round(prizeXp * weight);
}

// ---------------------------------------------------------------------------
// Seasons (Season Pass). Time is divided into fixed-length windows from a fixed
// anchor, so the season id + its start/end are pure functions of the clock —
// every device agrees with no server. Season XP = lifetime XP earned since the
// season started; the client snapshots a baseline when it first sees a new id.
// ---------------------------------------------------------------------------
export const SEASON_LENGTH_DAYS = 28;
const SEASON_MS = SEASON_LENGTH_DAYS * DAY_MS;
const SEASON_ANCHOR = Date.UTC(2026, 0, 5); // Mon 2026-01-05 00:00 UTC

export function seasonId(now: number): number {
  return Math.floor((now - SEASON_ANCHOR) / SEASON_MS);
}
export function seasonStartAt(now: number): number {
  return SEASON_ANCHOR + seasonId(now) * SEASON_MS;
}
export function seasonEndsAt(now: number): number {
  return seasonStartAt(now) + SEASON_MS;
}

// Weekly League settle boundary — 7-day windows from the same anchor. Used for
// the "league resets in …" countdown (the settle-season Lambda runs ~weekly).
const WEEK_MS = 7 * DAY_MS;
export function weekEndsAt(now: number): number {
  const since = now - SEASON_ANCHOR;
  return SEASON_ANCHOR + (Math.floor(since / WEEK_MS) + 1) * WEEK_MS;
}

// ---------------------------------------------------------------------------
// Tier ladder (Phase 9). Players climb 10 levels across 5 tiers, 2 levels each:
// Bronze 1, Bronze 2, Silver 1, … Platinum 2. XP is spent per level — clearing a
// level resets the bar and any leftover XP carries into the next level (this is
// implicit: progress is always measured against the *current* level's band, so
// crossing a threshold zeroes the visible bar and the overflow shows up as the
// next level's starting fill). The cost to clear a level grows 1.5× per level
// within a tier and 2× when crossing into a new tier. Pure + shared so the
// client and the settle-season Lambda agree. `division` = level-within-tier
// (1 = entry of the tier, 2 = top); higher is always better.
// ---------------------------------------------------------------------------

export const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Platinum'] as const;
export type League = typeof LEAGUES[number];

export const LEVELS_PER_TIER = 2;
export const MAX_LEVEL = LEAGUES.length * LEVELS_PER_TIER; // 10 named levels (index 0..9)

// XP to clear the very first level (Bronze 1 → Bronze 2). Every later level
// scales off this.
const BASE_LEVEL_XP = 500;

// Cost to clear each level (index 0 = Bronze 1). LEVEL_COSTS[i] is the XP that
// must be earned while *at* level i to advance to level i+1. Within a tier each
// step is 1.5× the previous; the step that crosses into a new tier is 2×. The
// final level (Platinum 2) is the cap and has no cost. Length = MAX_LEVEL - 1.
export const LEVEL_COSTS: number[] = (() => {
  const costs = [BASE_LEVEL_XP];
  for (let i = 1; i < MAX_LEVEL - 1; i++) {
    const crossesTier = (i + 1) % LEVELS_PER_TIER === 0; // level i → i+1 enters a new tier
    costs.push(Math.round(costs[i - 1] * (crossesTier ? 2 : 1.5)));
  }
  return costs;
})();

// Cumulative lifetime XP needed to *reach* the bottom of each level.
// LEVEL_THRESHOLDS[k] = total XP at which a player sits at the start of level k.
// Length = MAX_LEVEL.
export const LEVEL_THRESHOLDS: number[] = (() => {
  const t = [0];
  for (let i = 0; i < LEVEL_COSTS.length; i++) t.push(t[i] + LEVEL_COSTS[i]);
  return t;
})();

export interface LevelProgress {
  index: number;        // 0-based level index (0 = Bronze 1 … MAX_LEVEL-1 = Platinum 2)
  league: League;       // tier name
  division: number;     // level within the tier (1 = entry, 2 = top)
  label: string;        // e.g. "Bronze 1"
  xpIntoLevel: number;  // XP earned toward the current level (resets each level-up)
  xpForLevel: number;   // XP needed to clear the current level (Infinity at the cap)
  fraction: number;     // xpIntoLevel / xpForLevel in [0,1] (1 at the cap)
  isMax: boolean;       // true once at Platinum 2
}

// Resolve total lifetime XP into a level + in-level progress.
export function levelForXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, totalXp);
  let index = 0;
  for (let i = MAX_LEVEL - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { index = i; break; }
  }
  const league = LEAGUES[Math.floor(index / LEVELS_PER_TIER)];
  const division = (index % LEVELS_PER_TIER) + 1;
  const isMax = index >= MAX_LEVEL - 1;
  const xpIntoLevel = xp - LEVEL_THRESHOLDS[index];
  const xpForLevel = isMax ? Infinity : LEVEL_COSTS[index];
  const fraction = isMax ? 1 : Math.min(1, Math.max(0, xpIntoLevel / xpForLevel));
  return { index, league, division, label: `${league} ${division}`, xpIntoLevel, xpForLevel, fraction, isMax };
}

// Back-compat shim: callers that only need the tier/level pair (the promotion
// sync, the settle-season Lambda). Tier = league, level-within-tier = division.
export function assignLeague(totalXp: number): { league: League; division: number } {
  const p = levelForXp(totalXp);
  return { league: p.league, division: p.division };
}

// Higher = better, for comparing two tier/level pairs. Mirrors the flat level
// index: tier dominates, and within a tier the higher level wins.
export function leagueRank(league: string, division: number): number {
  const li = LEAGUES.indexOf(league as League);
  const idx = li >= 0 ? li : 0;
  return idx * LEVELS_PER_TIER + (division - 1); // e.g. Gold 2 = 2*2 + 1 = 5
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
