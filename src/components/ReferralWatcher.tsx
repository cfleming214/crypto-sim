import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { ensureMyReferralCode, recordReferral } from '../services/referralService';
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

  return null;
}
