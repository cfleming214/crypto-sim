import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { todayKey, nextClaimAt, seasonId, weekKey, weeklyPassGrant } from '../services/gamification';
import { scheduleAt } from '../lib/notifications';

// Rolls the Daily Quests over at UTC midnight (re-snapshots baselines, clears
// claims) and the Season Pass over at each season boundary, and schedules the
// "new quests" reminder. Renders nothing — mirrors AchievementWatcher. No haptics.
export function QuestWatcher() {
  const { state, dispatch } = useApp();
  const dayKey = state.quests.dayKey;

  // Keep the quest day + season current — on mount and once a minute (catches a
  // rollover while the app sits open).
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const k = todayKey(now);
      if (state.quests.dayKey !== k) dispatch({ type: 'ROLL_QUEST_DAY', dayKey: k });
      const sid = seasonId(now);
      if (state.season.id !== sid) dispatch({ type: 'ROLL_SEASON', id: sid, baselineXp: state.user.xp });
      // Free weekly Lane-A contest passes — lands once per week (idempotent on
      // weekKey). Subscribers get the larger grant (20 vs 5).
      const wk = weekKey(now);
      if (state.passes.lastWeeklyGrantKey !== wk) {
        dispatch({ type: 'GRANT_WEEKLY_PASSES', weekKey: wk, amount: weeklyPassGrant(state.isSubscriber) });
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [state.quests.dayKey, state.season.id, state.user.xp, state.passes.lastWeeklyGrantKey, state.isSubscriber, dispatch]);

  // (Re)schedule the next-day reminder whenever the quest day changes.
  useEffect(() => {
    scheduleAt('quests-daily', nextClaimAt(Date.now()), 'New quests ready 🎯', 'Fresh daily quests are waiting — earn XP.').catch(() => {});
  }, [dayKey]);

  return null;
}
