import { useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { STARTING_CASH } from '../constants/featureFlags';
import {
  joinReplayContest as joinCloud,
  leaveReplayForUser as leaveCloud,
  fetchReplayContests,
  fetchReplayContestMeta,
  fetchReplayLeaderboard,
} from '../services/replayService';
import type { ReplayContestSummary, ReplayMeta } from '../store/types';

// Mirrors useCompetitions for replay contests (separate tables/Lambdas).
export function useReplayContests() {
  const { state, dispatch } = useApp();

  const isJoined = useCallback(
    (id: string) => state.joinedReplayIds.includes(id),
    [state.joinedReplayIds],
  );

  const getById = useCallback(
    (id: string): ReplayContestSummary | undefined => state.replayContests.find(c => c.id === id),
    [state.replayContests],
  );

  // Joining needs the full config (incl. the minute series) to drive the local
  // deterministic price, so fetch the contest meta before spawning the slice.
  const join = useCallback(async (id: string): Promise<boolean> => {
    const comp = state.replayContests.find(c => c.id === id);
    if (comp && (comp.status === 'finished' || Date.now() >= comp.endAt)) return false;
    const meta: ReplayMeta | null = await fetchReplayContestMeta(id);
    if (!meta || !meta.prices.length) return false;
    dispatch({ type: 'JOIN_REPLAY', replayContestId: id, meta });
    dispatch({ type: 'ADD_XP', amount: 10 });
    await joinCloud(id, state.user.handle, STARTING_CASH);
    return true;
  }, [state.replayContests, state.user.handle, dispatch]);

  const leave = useCallback(async (id: string) => {
    dispatch({ type: 'LEAVE_REPLAY', replayContestId: id });
    await leaveCloud(id, state.user.handle);
  }, [dispatch, state.user.handle]);

  const refresh = useCallback(async () => {
    const list = await fetchReplayContests();
    if (list.length > 0) dispatch({ type: 'SET_REPLAY_CONTESTS', contests: list });
  }, [dispatch]);

  const refreshLeaderboard = useCallback(async (id: string) => {
    const entries = await fetchReplayLeaderboard(id);
    if (entries.length > 0) dispatch({ type: 'SET_LEADERBOARD', competitionId: id, entries });
  }, [dispatch]);

  return {
    replayContests: state.replayContests,
    leaderboard: state.leaderboard,
    isJoined,
    getById,
    join,
    leave,
    refresh,
    refreshLeaderboard,
  };
}
