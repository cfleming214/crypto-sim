import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from './ui/Toast';
import { achievementIcon } from './ui/achievementIcons';
import { fetchActiveMirrorCount } from '../services/portfolioService';
import {
  ACHIEVEMENTS, evaluateAchievements, type AchievementId, type AchievementInput,
} from '../services/gamification';

const DEFS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// Watches app state, evaluates the achievement engine, persists new unlocks, and
// fires a toast + confetti for each. Renders nothing. The FIRST evaluation after
// mount/hydration is a silent seed (no toast) so already-earned achievements
// don't pop on every launch — only genuinely new unlocks celebrate.
export function AchievementWatcher() {
  const { state, dispatch } = useApp();
  const { show, celebrate } = useToast();
  const [mirrorCount, setMirrorCount] = useState(0);
  // Celebrations are "armed" a few seconds after mount. Anything detected during
  // the initial load window (hydration + cloud profile fetch) is merged silently
  // so a fresh device doesn't toast the user's entire back-catalogue at once.
  const armedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => { armedRef.current = true; }, 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetchActiveMirrorCount().then(setMirrorCount).catch(() => {});
  }, [state.joinedTournamentIds.length]);

  // bestRank + wonBracket from the live leaderboards (mirrors ProfileScreen).
  let bestRank = Infinity;
  let wonBracket = false;
  for (const cid of state.joinedTournamentIds) {
    const entries = state.leaderboard[cid] ?? [];
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    const idx = sorted.findIndex(e => e.handle === state.user.handle);
    if (idx >= 0) bestRank = Math.min(bestRank, idx + 1);
    const comp = state.competitions.find(c => c.id === cid);
    if (comp?.status === 'finished' && sorted[0]?.handle === state.user.handle) wonBracket = true;
  }

  // Trade-derived inputs (exclude reward cash-injection events).
  let coinTradeCount = 0;
  let bestRealizedPnl = 0;
  let bestRealizedReturnPct = 0;
  for (const t of state.trades) {
    if (t.kind === 'reward' || t.symbol === 'USD') continue;
    coinTradeCount++;
    if (t.side === 'sell' && typeof t.realizedPnl === 'number' && t.realizedPnl > 0) {
      bestRealizedPnl = Math.max(bestRealizedPnl, t.realizedPnl);
      const cost = t.amount - t.realizedPnl;       // amount = proceeds for sells
      if (cost > 0) bestRealizedReturnPct = Math.max(bestRealizedReturnPct, (t.realizedPnl / cost) * 100);
    }
  }

  const input: AchievementInput = {
    coinTradeCount,
    streak: state.user.streak,
    holdingsCount: state.holdings.length,
    stopLossCount: Object.keys(state.stopLosses).length,
    mirrorCount,
    bestRank,
    wonBracket,
    bestRealizedPnl,
    bestRealizedReturnPct,
    predictionWins: state.predictionWins ?? 0,
  };

  // Single dependency: a signature of every input field, so this only runs when
  // an input actually changes (not on every 2s price tick).
  const sig = JSON.stringify(input);

  useEffect(() => {
    const earned = evaluateAchievements(input);
    const newIds: AchievementId[] = [];
    for (const id of earned) if (!(id in state.achievements)) newIds.push(id);
    if (newIds.length === 0) return;

    const now = Date.now();
    const merged = { ...state.achievements };
    for (const id of newIds) merged[id] = now;
    dispatch({ type: 'SET_ACHIEVEMENTS', achievements: merged });

    // Celebrate only genuine, in-session unlocks: after the warm-up window and
    // only a small batch (1–3). A larger batch means an initial reconciliation
    // (fresh device / first run after this feature shipped) — merge silently.
    if (armedRef.current && newIds.length <= 3) {
      for (const id of newIds) {
        const def = DEFS_BY_ID[id];
        if (!def) continue;
        show({ title: 'Achievement unlocked', subtitle: def.name, icon: achievementIcon(def.icon), variant: 'up' });
      }
      celebrate();
    }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
