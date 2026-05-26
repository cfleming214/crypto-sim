import { useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  joinCompetition as joinCloud,
  leaveCompetition as leaveCloud,
  fetchCompetitionLeaderboard,
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
    (id: string): Competition | undefined => state.competitions.find(c => c.id === id),
    [state.competitions],
  );

  const join = useCallback(async (competitionId: string) => {
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: competitionId });
    dispatch({ type: 'ADD_XP', amount: 10 });
    // Persist to cloud if configured (no-op in offline mode)
    await joinCloud(competitionId, state.user.handle, state.bankroll);
  }, [state.user.handle, state.bankroll, dispatch]);

  const leave = useCallback(async (competitionId: string, entryId?: string) => {
    dispatch({ type: 'LEAVE_TOURNAMENT', tournamentId: competitionId });
    if (entryId) await leaveCloud(entryId);
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
    return `${m}m left`;
  }, []);

  return {
    competitions: state.competitions,
    joinedTournamentIds: state.joinedTournamentIds,
    leaderboard: state.leaderboard,
    isJoined,
    getLive,
    getOpen,
    getById,
    join,
    leave,
    refreshLeaderboard,
    timeRemaining,
  };
}
