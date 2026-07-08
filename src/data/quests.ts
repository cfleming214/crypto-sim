// Daily Quests — a rotating set of small daily goals that pay XP. The set is
// chosen deterministically from the UTC day, so every device shows the same
// quests with no server. Progress is derived from existing app state (trades,
// predictions, lessons, etc.) — see computeQuestMetrics.
import type { LucideIcon } from 'lucide-react-native';
import { Repeat, Coins, Brain, GraduationCap, Gift, TrendingUp, TrendingDown, Eye, Zap, Layers } from 'lucide-react-native';
import { todayKey } from '../services/gamification';
import type { AppState } from '../store/types';

export type QuestMetric =
  | 'tradesToday'
  | 'distinctCoinsToday'
  | 'buysToday'
  | 'sellsToday'
  | 'predictionsToday'
  | 'lessonsToday'
  | 'watchlistToday'
  | 'dailyClaimed';

export interface QuestDef {
  id: string;
  title: string;
  icon: LucideIcon;
  metric: QuestMetric;
  target: number;
  xp: number;
}

export const DAILY_QUEST_COUNT = 3;
export const QUEST_CHEST_XP = 100;   // bonus for completing all of today's quests
export const QUEST_CHEST_CASH = 50;

// Pool of 10 possible daily quests; 3 are picked per day (see dailyQuests).
export const QUEST_CATALOG: QuestDef[] = [
  { id: 'trade-3',     title: 'Make 3 trades',            icon: Repeat,        metric: 'tradesToday',        target: 3, xp: 60 },
  { id: 'trade-5',     title: 'Make 5 trades',            icon: Zap,           metric: 'tradesToday',        target: 5, xp: 90 },
  { id: 'diversify-2', title: 'Trade 2 different coins',  icon: Coins,         metric: 'distinctCoinsToday', target: 2, xp: 50 },
  { id: 'diversify-3', title: 'Trade 3 different coins',  icon: Layers,        metric: 'distinctCoinsToday', target: 3, xp: 70 },
  { id: 'predict-1',   title: 'Make a price prediction',  icon: Brain,         metric: 'predictionsToday',   target: 1, xp: 40 },
  { id: 'lesson-1',    title: 'Finish an Academy lesson', icon: GraduationCap, metric: 'lessonsToday',       target: 1, xp: 50 },
  { id: 'claim-daily', title: 'Claim your daily reward',  icon: Gift,          metric: 'dailyClaimed',       target: 1, xp: 30 },
  { id: 'buy-2',       title: 'Open 2 positions',         icon: TrendingUp,    metric: 'buysToday',          target: 2, xp: 40 },
  { id: 'sell-1',      title: 'Close a position',         icon: TrendingDown,  metric: 'sellsToday',         target: 1, xp: 40 },
  { id: 'watchlist-1', title: 'Add a coin to your watchlist', icon: Eye,       metric: 'watchlistToday',     target: 1, xp: 30 },
];

// Small seeded PRNG (mulberry32) → a repeatable shuffle from a numeric seed.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic daily pick: seed a PRNG from the UTC day-key, shuffle the 10-quest
// pool (Fisher–Yates), and take the first DAILY_QUEST_COUNT. Same day → same quests
// for everyone (no backend); genuinely varied across days; all 10 surface over time.
export function dailyQuests(dayKey: string): QuestDef[] {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  const rng = mulberry32(h);
  const pool = [...QUEST_CATALOG];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DAILY_QUEST_COUNT);
}

// Start of the current UTC day (ms epoch) — the boundary for "today's" trades.
export function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Live progress value for every quest metric, derived from app state. Counters
// that lack per-event timestamps (predictions, lessons, watchlist) measure from
// the day's baseline snapshot stored in state.quests.baseline.
export function computeQuestMetrics(state: AppState, now: number): Record<QuestMetric, number> {
  const dayStart = startOfUtcDay(now);
  const today = state.trades.filter(t => t.kind !== 'reward' && t.symbol !== 'USD' && t.timestamp >= dayStart);
  const b = state.quests.baseline;
  return {
    tradesToday: today.length,
    distinctCoinsToday: new Set(today.map(t => t.symbol)).size,
    buysToday: today.filter(t => t.side === 'buy').length,
    sellsToday: today.filter(t => t.side === 'sell').length,
    // "Make a price prediction" must complete the moment one is STARTED. The
    // win/loss counters only move when a round RESOLVES — and only if the resolver
    // fires — which previously left the quest (and the bonus chest) stuck after the
    // user clearly made a prediction. Count a prediction started today (live or
    // not) on top of any resolved today; the quest target caps it downstream.
    predictionsToday: Math.max(0, (state.predictionWins + state.predictionLosses) - b.predictionsTotal)
      + (state.activePrediction && state.activePrediction.startedAt >= dayStart ? 1 : 0),
    lessonsToday: Math.max(0, state.academyCompleted.length - b.lessonsTotal),
    watchlistToday: Math.max(0, state.watchlist.length - b.watchlistCount),
    dailyClaimed: state.lastClaimDay === todayKey(now) ? 1 : 0,
  };
}

export interface QuestView {
  def: QuestDef;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

// Today's quests resolved against live metrics + claim state — the shape the UI renders.
export function questViews(state: AppState, now: number): QuestView[] {
  const metrics = computeQuestMetrics(state, now);
  const claimed = new Set(state.quests.claimedIds);
  return dailyQuests(todayKey(now)).map(def => {
    const progress = Math.min(def.target, metrics[def.metric]);
    return { def, progress, complete: progress >= def.target, claimed: claimed.has(def.id) };
  });
}
