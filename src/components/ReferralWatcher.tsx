import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { ensureMyReferralCode, recordReferral, countMyActivatedReferrals } from '../services/referralService';
import { getPendingReferralCode, clearPendingReferralCode } from '../lib/referralLink';
import { track } from '../lib/analytics';

// Owns the referral bookkeeping that needs an authenticated session (renders
// nothing, like the other watchers):
//   1. Ensure the signed-in user has a permanent referral code → mirror it into
//      AppState so the Profile card can show/share it.
//   2. If the user arrived with a pending invite code (deep link or typed) and
//      isn't already attributed, record the pending referral server-side once.
export function ReferralWatcher() {
  const { state, dispatch } = useApp();
  const { status } = useAuth();
  const handle = state.user.handle;

  // 1. Ensure my own code exists once signed in (idempotent service call).
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    ensureMyReferralCode(handle).then(code => {
      if (!cancelled && code) dispatch({ type: 'SET_REFERRAL_CODE', code });
    });
    return () => { cancelled = true; };
  }, [status, handle, dispatch]);

  // 2. Record a pending referral code (from a deep link / typed entry) once.
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (state.referral.referredByCode) return;          // already attributed
    const pending = getPendingReferralCode();
    if (!pending) return;
    let cancelled = false;
    recordReferral(pending, handle).then(ok => {
      if (cancelled) return;
      // Attribute locally even if the row already existed, so we stop retrying.
      dispatch({ type: 'SET_REFERRED_BY', code: pending });
      clearPendingReferralCode();
      if (ok) track('referral_code_entered', { code: pending });
    });
    return () => { cancelled = true; };
  }, [status, state.referral.referredByCode, handle, dispatch]);

  // 3. Referrer reward: grant +2 passes + 750 XP for each of MY referrals that
  // have activated since I was last paid. Polled on launch + every few minutes.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const sweep = () => {
      countMyActivatedReferrals().then(count => {
        if (!cancelled && count > state.referral.referrerRewardedCount) {
          dispatch({ type: 'CLAIM_REFERRER_REWARDS', count, passesEach: 2, xpEach: 750 });
        }
      }).catch(() => {});
    };
    sweep();
    const id = setInterval(sweep, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [status, state.referral.referrerRewardedCount, dispatch]);

  return null;
}
