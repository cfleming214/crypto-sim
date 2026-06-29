import { useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  joinCompetition as joinCloud,
  leaveCompetition as leaveCloud,
  leaveCompetitionForUser as leaveCloudByComp,
  fetchCompetitionLeaderboard,
  fetchCompetitions,
  fetchFinishedCompetitions,
} from '../services/competitionService';
import type { Competition } from '../store/types';
import { STARTING_CASH } from '../constants/featureFlags';
import { requiresPassToJoin } from '../lib/contestLane';

export type JoinResult = { ok: boolean; reason?: 'ended' | 'needs-pass' | 'failed' };

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

  const join = useCallback(async (competitionId: string): Promise<JoinResult> => {
    // Defensive backstop: never enroll into an ended contest, even if a stale
    // screen slipped past the UI guards (e.g. it ended between render and tap).
    const comp = state.competitions.find(c => c.id === competitionId)
      ?? state.finishedCompetitions.find(c => c.id === competitionId);
    if (comp && (comp.status === 'finished' || Date.now() >= comp.endAt)) return { ok: false, reason: 'ended' };
    // Lane A (virtual) contests cost an entry pass; Lane B (cash) entry is ALWAYS
    // free — zero consideration, the compliance firewall. Gate on the pass now,
    // but DON'T spend it until the durable cloud entry is confirmed (below).
    const needsPass = requiresPassToJoin(comp);
    if (needsPass && state.passes.balance <= 0) return { ok: false, reason: 'needs-pass' };

    // Create the cloud CompetitionEntry FIRST — it's the source of truth that
    // loadJoinedCompetitions rehydrates from on the next launch. If this fails
    // (network/auth), we must NOT spend the pass or mark the user joined, or they
    // end up "pass spent but not in any contest" after a restart. Enroll at
    // STARTING_CASH (not state.bankroll, which is the active portfolio's balance).
    const entry = await joinCloud(competitionId, state.user.handle, STARTING_CASH);
    if (!entry) return { ok: false, reason: 'failed' };

    // Durable entry confirmed → now spend the pass and enroll locally (the local
    // slice spawned by JOIN_TOURNAMENT mirrors the cloud entry).
    if (needsPass) dispatch({ type: 'SPEND_PASS' });
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: competitionId });
    dispatch({ type: 'ADD_XP', amount: 10 });
    return { ok: true };
  }, [state.competitions, state.finishedCompetitions, state.passes.balance, state.user.handle, dispatch]);

  const leave = useCallback(async (competitionId: string, entryId?: string) => {
    dispatch({ type: 'LEAVE_TOURNAMENT', tournamentId: competitionId });
    // Delete the cloud entry too. With an explicit id, delete that row; without
    // one, remove ALL of the user's entries for the contest (also cleans up any
    // duplicate rows a past leave-without-delete left behind).
    if (entryId) await leaveCloud(entryId);
    else await leaveCloudByComp(competitionId, state.user.handle);
  }, [dispatch, state.user.handle]);

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
    passes: state.passes,
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
