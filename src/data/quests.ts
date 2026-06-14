// Daily Quests — a rotating set of small daily goals that pay XP. The set is
// chosen deterministically from the UTC day, so every device shows the same
// quests with no server. Progress is derived from existing app state (trades,
// predictions, lessons, etc.) — see computeQuestMetrics.
import type { LucideIcon } from 'lucide-react-native';
import { Repeat, Coins, Brain, GraduationCap, Gift, TrendingUp, Eye } from 'lucide-react-native';
import { todayKey } from '../services/gamification';
import type { AppState } from '../store/types';

export type QuestMetric =
  | 'tradesToday'
  | 'distinctCoinsToday'
  | 'buysToday'
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

export const QUEST_CATALOG: QuestDef[] = [
  { id: 'trade-3',     title: 'Make 3 trades',            icon: Repeat,        metric: 'tradesToday',        target: 3, xp: 60 },
  { id: 'diversify-2', title: 'Trade 2 different coins',  icon: Coins,         metric: 'distinctCoinsToday', target: 2, xp: 50 },
  { id: 'predict-1',   title: 'Make a price prediction',  icon: Brain,         metric: 'predictionsToday',   target: 1, xp: 40 },
  { id: 'lesson-1',    title: 'Finish an Academy lesson', icon: GraduationCap, metric: 'lessonsToday',       target: 1, xp: 50 },
  { id: 'claim-daily', title: 'Claim your daily reward',  icon: Gift,          metric: 'dailyClaimed',       target: 1, xp: 30 },
  { id: 'buy-2',       title: 'Open 2 positions',         icon: TrendingUp,    metric: 'buysToday',          target: 2, xp: 40 },
  { id: 'watchlist-1', title: 'Add a coin to your watchlist', icon: Eye,       metric: 'watchlistToday',     target: 1, xp: 30 },
];

// Deterministic daily pick: hash the UTC day-key, then take a rotating window of
// the catalog. Same day → same quests for everyone, no backend.
export function dailyQuests(dayKey: string): QuestDef[] {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  const start = h % QUEST_CATALOG.length;
  const out: QuestDef[] = [];
  for (let i = 0; i < DAILY_QUEST_COUNT; i++) out.push(QUEST_CATALOG[(start + i) % QUEST_CATALOG.length]);
  return out;
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
    predictionsToday: Math.max(0, (state.predictionWins + state.predictionLosses) - b.predictionsTotal),
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
