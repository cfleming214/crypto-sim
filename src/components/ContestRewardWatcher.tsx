import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { loadFinishedContestResults } from '../services/portfolioService';
import { activateMyReferral } from '../services/referralService';
import { contestXpForRank } from '../services/gamification';
import { CONTEST_CASH_PRIZES, DEFAULT_PRIZE_XP } from '../constants/featureFlags';

// Auto-grants contest XP at settlement so winners no longer have to tap "Claim".
// Renders nothing (mirrors the other watchers).
//
// Reuses the existing CLAIM_CONTEST_XP path, which is idempotent (guarded by
// state.claimedContestIds), so this can fire repeatedly and never double-grants —
// it's the single source of truth, which is also why XP is NOT granted server-side
// in close-competition (that would double-count against this).
//
// Pulls the user's finished podium finishes (rank) and credits each contest's
// rank-share of its prizeXp, resolved from the loaded contest metadata (XP-prize
// mode only — cash contests pay out server-side instead).
export function ContestRewardWatcher() {
  const { state, dispatch } = useApp();
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const tick = async () => {
      const results = await loadFinishedContestResults();
      if (cancelled) return;
      // 1. Auto-grant contest podium XP (XP-prize mode only; cash settles server-side).
      if (!CONTEST_CASH_PRIZES) {
        for (const r of results) {
          if (state.claimedContestIds.includes(r.competitionId)) continue;
          const comp = state.finishedCompetitions.find(c => c.id === r.competitionId)
            ?? state.competitions.find(c => c.id === r.competitionId);
          const xp = contestXpForRank(comp?.prizeXp ?? DEFAULT_PRIZE_XP, r.rank);
          // The reducer is the real idempotency guard; the includes() check above is
          // just an optimization, so a stale closure can't cause a double-grant.
          if (xp > 0) dispatch({ type: 'CLAIM_CONTEST_XP', contestId: r.competitionId, xp });
        }
      }
      // 2. Referral activation: finishing the FIRST contest activates the invitee's
      // referral (server status flip → referrer credited by settle-recruiter-cup)
      // and grants the invitee's one-time welcome reward. Both idempotent.
      if (results.length > 0 && state.referral.referredByCode && !state.referral.rewardClaimed) {
        activateMyReferral().finally(() => {
          if (!cancelled) dispatch({ type: 'CLAIM_REFERRAL_REWARD', passes: 3, xp: 1000 });
        });
      }
    };

    tick();
    // Re-check periodically so a contest that settles while the app is open
    // is handled without needing a relaunch.
    const id = setInterval(tick, 3 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
    // finishedCompetitions in deps: when the launch fetch populates contest
    // metadata, re-run so prizeXp resolves to the real value (not the fallback).
  }, [status, state.finishedCompetitions, state.referral.referredByCode, state.referral.rewardClaimed, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
