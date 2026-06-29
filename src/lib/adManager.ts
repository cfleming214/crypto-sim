import { isMoneySurface, type ContestLane } from './contestLane';
import { AD_UNITS } from '../constants/adUnits';
import { isNoAds } from './purchases';

// Central in-app ad-firing gatekeeper. ALL interstitial/rewarded ads go through
// here — call sites never touch the SDK directly — so the compliance rules live
// in exactly one place:
//   • never on a money surface (entry/prize/balance/withdraw/payout),
//   • Lane B (cash contests) gets only a passive banner + results-exit interstitial,
//     never a rewarded ad,
//   • interstitials are frequency-capped (AdMob: ≤1 per 2 actions, plus a time gap
//     and a per-session cap) so we never trip "recurring interstitials".
//
// The SDK is lazy-required and guarded, so everything no-ops cleanly in Expo Go /
// web where the native module is absent.

export type AdPlacement =
  | 'bannerPassive'
  // interstitials (capped, at natural transitions only):
  | 'resultsExit' // leaving a finished contest's results
  | 'replayEnd' // after a replay finishes playing
  // rewarded (opt-in, Lane A only) — one per virtual reward:
  | 'rewardedPass'
  | 'rewardedReset'
  | 'rewardedPrediction'
  | 'rewardedQuestReroll'
  | 'rewardedDailyDouble'
  | 'rewardedTopup'
  | 'rewardedBalanceBoost'
  | 'rewardedBonusXp';

export interface AdContext {
  lane: ContestLane;
  surface: string;
}

// AdMob: place no more than one interstitial per two user actions; we layer a time
// gap and a session cap on top to keep the experience (and policy standing) safe.
const MIN_GAP_MS = 90_000;
const MAX_PER_SESSION = 4;
const MIN_ACTIONS_BETWEEN = 2;

let lastInterstitialAt = 0;
let sessionInterstitialCount = 0;
let actionsSinceInterstitial = MIN_ACTIONS_BETWEEN; // allow the first interstitial

// Only ONE full-screen ad may present at a time. Set synchronously before any
// await so a rapid double-tap (or any concurrent trigger) can't open two ads.
let adPresenting = false;

// Call on meaningful user actions (screen transitions, contest joins, etc.) so the
// "1 per 2 actions" rule has something to count.
export function noteAction(): void {
  actionsSinceInterstitial += 1;
}

function isRewarded(p: AdPlacement): boolean {
  return p.startsWith('rewarded');
}
function isInterstitial(p: AdPlacement): boolean {
  return p === 'resultsExit' || p === 'replayEnd';
}

// The single source of truth for "may this ad fire right now?". Pure + synchronous
// so it's trivially testable. `now` is injectable for tests.
export function canShowAd(placement: AdPlacement, ctx: AdContext, now: number = Date.now()): boolean {
  // Hard wall: never on a real-money surface, regardless of lane.
  if (isMoneySurface(ctx.surface)) return false;

  // No-Ads / Premium entitlement suppresses FORCED formats (passive banner +
  // interstitials). Opt-in rewarded ads still run — the user explicitly tapped
  // "watch" for a virtual reward, which no-ads doesn't take away.
  if (isNoAds() && !isRewarded(placement)) return false;

  // Lane B (cash): only a passive lobby banner or the results-exit interstitial.
  // Never a rewarded ad — a watched ad can't earn anything tied to cash.
  if (ctx.lane === 'B') {
    if (isRewarded(placement)) return false;
    if (placement !== 'bannerPassive' && placement !== 'resultsExit') return false;
  }

  // Rewarded ads are opt-in (the user tapped "watch"), so no frequency cap.
  if (isRewarded(placement)) return true;

  // Passive banners are always allowed (subject to the lane rule above).
  if (placement === 'bannerPassive') return true;

  // Interstitial frequency caps.
  if (isInterstitial(placement)) {
    if (sessionInterstitialCount >= MAX_PER_SESSION) return false;
    if (now - lastInterstitialAt < MIN_GAP_MS) return false;
    if (actionsSinceInterstitial < MIN_ACTIONS_BETWEEN) return false;
    return true;
  }

  return false;
}

async function loadSdk(): Promise<any | null> {
  try {
    return await import('react-native-google-mobile-ads');
  } catch {
    return null; // native module absent (Expo Go / web)
  }
}

// Show an interstitial if policy allows. Resolves when the ad closes (or never
// shows). Counters update only when an ad actually loads, so a no-fill doesn't
// burn the session cap.
export async function showInterstitial(placement: AdPlacement, ctx: AdContext): Promise<void> {
  if (!canShowAd(placement, ctx)) return;
  if (adPresenting) { console.warn('[ads] interstitial ignored — an ad is already presenting'); return; }
  adPresenting = true; // set synchronously before any await (no double-open race)
  try {
    const sdk = await loadSdk();
    if (!sdk) return;
    const { InterstitialAd, AdEventType, TestIds } = sdk;
    const unitId = AD_UNITS.interstitial ?? TestIds.INTERSTITIAL;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try {
        const ad = InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: false });
        const subs: Array<() => void> = [];
        const cleanup = () => subs.forEach((u) => { try { u(); } catch { /* noop */ } });
        subs.push(ad.addAdEventListener(AdEventType.LOADED, () => {
          lastInterstitialAt = Date.now();
          sessionInterstitialCount += 1;
          actionsSinceInterstitial = 0;
          try { ad.show(); } catch { cleanup(); finish(); }
        }));
        subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => { cleanup(); finish(); }));
        subs.push(ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
          console.warn('[ads] interstitial failed to load/show:', error?.message ?? error);
          cleanup();
          finish();
        }));
        ad.load();
      } catch (e) {
        console.warn('[ads] interstitial threw', e);
        finish();
      }
    });
  } finally {
    adPresenting = false;
  }
}

// Run one rewarded-style ad (RewardedAd or RewardedInterstitialAd — same event
// API) to completion. Returns { earned, shown }: shown=false means no ad was
// available (no-fill/error), so the caller can chain or fall back.
function runRewardedUnit(
  AdClass: any,
  RewardedAdEventType: any,
  AdEventType: any,
  unitId: string,
  label: string,
): Promise<{ earned: boolean; shown: boolean }> {
  return new Promise((resolve) => {
    let earned = false;
    let shown = false;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve({ earned, shown }); } };
    try {
      const ad = AdClass.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: false });
      const subs: Array<() => void> = [];
      const cleanup = () => subs.forEach((u) => { try { u(); } catch { /* noop */ } });
      subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        try { ad.show(); shown = true; } catch (e) { console.warn(`[ads] ${label} show() threw`, e); cleanup(); finish(); }
      }));
      subs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
      subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => { cleanup(); finish(); }));
      subs.push(ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn(`[ads] ${label} failed to load/show:`, error?.message ?? error);
        cleanup();
        finish();
      }));
      ad.load();
    } catch (e) {
      console.warn(`[ads] ${label} threw`, e);
      finish();
    }
  });
}

// Show a rewarded ad, with a fallback chain:
//   1. Try a Rewarded ad. If it shows (earned OR dismissed), that's the result.
//   2. If no rewarded ad was available (no-fill), try a Rewarded Interstitial.
//   3. If that also has no ad, return shown=false so the caller's graceful
//      fallback (grantOnUnavailable) can decide.
// Returns { earned, shown, blocked } — shown=false only when NEITHER format had an
// ad; blocked=true means another ad was already presenting (a duplicate trigger),
// which callers must treat as "do nothing" (no grant, no fallback, no alert).
// (earned=false, shown=true) means the user dismissed an ad early — a real decline.
export async function showRewarded(placement: AdPlacement, ctx: AdContext): Promise<{ earned: boolean; shown: boolean; blocked?: boolean }> {
  if (!canShowAd(placement, ctx)) {
    console.warn(`[ads] rewarded blocked by canShowAd: ${placement} lane=${ctx.lane} surface=${ctx.surface}`);
    return { earned: false, shown: false };
  }
  if (adPresenting) {
    console.warn('[ads] rewarded ignored — an ad is already presenting');
    return { earned: false, shown: false, blocked: true };
  }
  adPresenting = true; // set synchronously before any await (no double-open race)
  try {
    const sdk = await loadSdk();
    if (!sdk) {
      console.warn('[ads] rewarded: native module unavailable (Expo Go / web)');
      return { earned: false, shown: false };
    }
    const { RewardedAd, RewardedInterstitialAd, RewardedAdEventType, AdEventType, TestIds } = sdk;

    // 1) Rewarded first.
    console.log(`[ads] rewarded loading: ${placement} unit=${AD_UNITS.rewarded ? 'REAL' : 'TEST'}`);
    const r = await runRewardedUnit(RewardedAd, RewardedAdEventType, AdEventType, AD_UNITS.rewarded ?? TestIds.REWARDED, 'rewarded');
    if (r.shown) return r; // shown (earned or dismissed) — don't chain

    // 2) No rewarded fill → try a rewarded interstitial.
    if (RewardedInterstitialAd) {
      console.log(`[ads] no rewarded fill → trying rewarded interstitial: ${placement} unit=${AD_UNITS.rewardedInterstitial ? 'REAL' : 'TEST'}`);
      const ri = await runRewardedUnit(
        RewardedInterstitialAd, RewardedAdEventType, AdEventType,
        AD_UNITS.rewardedInterstitial ?? TestIds.REWARDED_INTERSTITIAL, 'rewarded-interstitial',
      );
      return ri; // if still !shown, caller's grantOnUnavailable handles the graceful fallback
    }
    return r; // { earned:false, shown:false }
  } finally {
    adPresenting = false;
  }
}
