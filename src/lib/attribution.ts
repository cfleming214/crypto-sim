// Install attribution + referral links (Branch) — GUARDED and OFF by default.
//
// This module is intentionally inert until Branch is set up: it is gated behind
// EXPO_PUBLIC_BRANCH_ENABLED (default off) and does NOT import react-native-branch
// at all, so no native dependency ships and nothing can break a build. Today it
// only produces the app's own scheme link (works for already-installed users);
// once Branch is enabled it will produce a Branch link with DEFERRED install
// attribution (a fresh install gets credited to the referrer).
//
// ── To turn Branch ON later (needs a native rebuild, not OTA) ───────────────────
//   1. Create a Branch account → get the Branch key(s).
//   2. `npm i react-native-branch` and add its Expo config plugin + keys to app.json.
//   3. Set EXPO_PUBLIC_BRANCH_ENABLED=true (eas env).
//   4. Fill in the two marked blocks below (subscribe + generate link).
//   5. `eas build` + submit.
// Until all of that, every export here is a safe no-op / scheme fallback.

const BRANCH_ENABLED = process.env.EXPO_PUBLIC_BRANCH_ENABLED === 'true';

/** Whether Branch attribution is active (account + native build + flag all set). */
export function attributionReady(): boolean {
  return BRANCH_ENABLED;
}

/** Subscribe to install/open attribution. Returns an unsubscribe fn. No-op when
 *  Branch is off, so callers can wire it unconditionally. */
export function initAttribution(_onReferral?: (code: string) => void): () => void {
  if (!BRANCH_ENABLED) return () => {};
  // --- Branch activation block (see header) ---
  // (async () => {
  //   try {
  //     const branch = (await import('react-native-branch')).default;
  //     const unsub = branch.subscribe(({ params }) => {
  //       const code = params?.referral_code ?? params?.$referral_code;
  //       if (code) _onReferral?.(String(code).toUpperCase());
  //     });
  //     cleanup = unsub;
  //   } catch { /* native module absent — stay off */ }
  // })();
  return () => {};
}

/** A shareable referral link for `code`. Scheme link today (opens the app if
 *  installed → ReferralWatcher records the code); a Branch link with deferred
 *  install attribution once Branch is enabled. */
export function buildReferralLink(code: string): string {
  const c = code.trim().toUpperCase();
  // When BRANCH_ENABLED, this would return a generated Branch short URL (async);
  // until then the scheme link is the honest, working option.
  return `cryptocomp://r/${c}`;
}
