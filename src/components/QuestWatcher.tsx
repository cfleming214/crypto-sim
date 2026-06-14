import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { todayKey, nextClaimAt } from '../services/gamification';
import { scheduleAt } from '../lib/notifications';

// Rolls the Daily Quests over at UTC midnight (re-snapshots baselines, clears
// claims) and schedules the "new quests" reminder. Renders nothing — mirrors
// AchievementWatcher. No haptics.
export function QuestWatcher() {
  const { state, dispatch } = useApp();
  const dayKey = state.quests.dayKey;

  // Keep the quest day current — on mount and once a minute (catches a rollover
  // while the app sits open).
  useEffect(() => {
    const check = () => {
      const k = todayKey(Date.now());
      if (state.quests.dayKey !== k) dispatch({ type: 'ROLL_QUEST_DAY', dayKey: k });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [state.quests.dayKey, dispatch]);

  // (Re)schedule the next-day reminder whenever the quest day changes.
  useEffect(() => {
    scheduleAt('quests-daily', nextClaimAt(Date.now()), 'New quests ready 🎯', 'Fresh daily quests are waiting — earn XP.').catch(() => {});
  }, [dayKey]);

  return null;
}
