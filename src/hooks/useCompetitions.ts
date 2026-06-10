import { useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  joinCompetition as joinCloud,
  leaveCompetition as leaveCloud,
  fetchCompetitionLeaderboard,
  fetchCompetitions,
  fetchFinishedCompetitions,
} from '../services/competitionService';
import type { Competition } from '../store/types';

export function useCompetitions() {
  const { state, dispatch } = useApp();

  const isJoined = useCallback(
    (competitionId: string) => state.joinedTournamentIds.includes(competitionId),
    [state.joinedTournamentIds],
  );

  const getLive = useCallback(
    () => state.competitions.filter(c => c.status === 'live'),
    [state.competitions],
  );

  const getOpen = useCallback(
    () => state.competitions.filter(c => c.status === 'open'),
    [state.competitions],
  );

  const getById = useCallback(
    (id: string): Competition | undefined =>
      state.competitions.find(c => c.id === id) ?? state.finishedCompetitions.find(c => c.id === id),
    [state.competitions, state.finishedCompetitions],
  );

  const join = useCallback(async (competitionId: string) => {
    // Defensive backstop: never enroll into an ended contest, even if a stale
    // screen slipped past the UI guards (e.g. it ended between render and tap).
    const comp = state.competitions.find(c => c.id === competitionId)
      ?? state.finishedCompetitions.find(c => c.id === competitionId);
    if (comp && (comp.status === 'finished' || Date.now() >= comp.endAt)) return;
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: competitionId });
    dispatch({ type: 'ADD_XP', amount: 10 });
    // Persist to cloud if configured (no-op in offline mode)
    await joinCloud(competitionId, state.user.handle, state.bankroll);
  }, [state.competitions, state.finishedCompetitions, state.user.handle, state.bankroll, dispatch]);

  const leave = useCallback(async (competitionId: string, entryId?: string) => {
    dispatch({ type: 'LEAVE_TOURNAMENT', tournamentId: competitionId });
    if (entryId) await leaveCloud(entryId);
  }, [dispatch]);

  // Manual re-fetch for pull-to-refresh. Only replaces the list when the fetch
  // returns rows, so a transient network error doesn't wipe the contests already
  // on screen — the user can just pull again to recover.
  const refresh = useCallback(async () => {
    const [list, finished] = await Promise.all([fetchCompetitions(), fetchFinishedCompetitions()]);
    if (list.length > 0) dispatch({ type: 'SET_COMPETITIONS', competitions: list });
    if (finished.length > 0) dispatch({ type: 'SET_FINISHED_COMPETITIONS', competitions: finished });
  }, [dispatch]);

  const refreshLeaderboard = useCallback(async (competitionId: string) => {
    const entries = await fetchCompetitionLeaderboard(competitionId);
    if (entries.length > 0) {
      dispatch({ type: 'SET_LEADERBOARD', competitionId, entries });
    }
  }, [dispatch]);

  const timeRemaining = useCallback((competition: Competition): string => {
    const ms = competition.endAt - Date.now();
    if (ms <= 0) return 'Ended';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const d = Math.floor(h / 24);
    if (d >= 1) return `${d}d left`;
    if (h >= 1) return `${h}h ${m}m left`;
    // Under a minute → count down in seconds instead of showing "0m left".
    if (ms < 60000) return `${Math.ceil(ms / 1000)}s left`;
    return `${m}m left`;
  }, []);

  return {
    competitions: state.competitions,
    finishedCompetitions: state.finishedCompetitions,
    joinedTournamentIds: state.joinedTournamentIds,
    leaderboard: state.leaderboard,
    isJoined,
    getLive,
    getOpen,
    getById,
    join,
    leave,
    refresh,
    refreshLeaderboard,
    timeRemaining,
  };
}
