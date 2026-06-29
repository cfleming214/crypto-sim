import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { monthKey } from '../services/gamification';
import { configurePurchases, fetchEntitlements, addEntitlementListener, setEntitlements } from '../lib/purchases';

// Owns the RevenueCat ↔ app-state bridge and the Premium monthly grants. Renders
// nothing (mirrors the other watchers).
//
//  1. Configures the SDK, pulls the current entitlements, and subscribes to
//     customerInfo updates → dispatches SET_ENTITLEMENTS (the single source of
//     truth in AppState). A failed/offline fetch returns null and is ignored, so
//     the cached entitlement (iap.v1) survives.
//  2. Mirrors AppState entitlements into the runtime store (lib/purchases) so the
//     non-React ad gate (adManager.isNoAds) and the ad components read them.
//  3. Resets the "3 new offline portfolios / month" allowance on each new month
//     while Premium is active. (The monthly $5M is surfaced as a claim in the
//     PurchaseModal — it needs the new-or-add choice, so it's never auto-granted.)
export function PremiumWatcher() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    configurePurchases();
    fetchEntitlements().then(e => {
      if (e) dispatch({ type: 'SET_ENTITLEMENTS', noAds: e.noAds, premium: e.premium });
    });
    const unsub = addEntitlementListener(e => dispatch({ type: 'SET_ENTITLEMENTS', noAds: e.noAds, premium: e.premium }));
    return unsub;
  }, [dispatch]);

  // Keep the runtime entitlement store in sync with AppState (the ad gate reads it).
  useEffect(() => {
    setEntitlements({ noAds: state.noAds, premium: state.isSubscriber });
  }, [state.noAds, state.isSubscriber]);

  // Reset the monthly new-portfolio allowance on a new calendar month.
  useEffect(() => {
    if (!state.isSubscriber) return;
    const check = () => {
      const mk = monthKey(Date.now());
      if (state.premiumGrants.portfolioMonthKey !== mk) dispatch({ type: 'GRANT_PREMIUM_MONTH', monthKey: mk });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [state.isSubscriber, state.premiumGrants.portfolioMonthKey, dispatch]);

  return null;
}
