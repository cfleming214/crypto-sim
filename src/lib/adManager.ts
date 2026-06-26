import { isMoneySurface, type ContestLane } from './contestLane';
import { AD_UNITS } from '../constants/adUnits';

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
  | 'rewardedTopup';

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
}

// Show a rewarded ad. Resolves { earned: true } only if the user watched to the
// reward callback. Caller grants the (always-virtual) reward on earned === true.
export async function showRewarded(placement: AdPlacement, ctx: AdContext): Promise<{ earned: boolean }> {
  if (!canShowAd(placement, ctx)) {
    console.warn(`[ads] rewarded blocked by canShowAd: ${placement} lane=${ctx.lane} surface=${ctx.surface}`);
    return { earned: false };
  }
  const sdk = await loadSdk();
  if (!sdk) {
    console.warn('[ads] rewarded: native module unavailable (Expo Go / web)');
    return { earned: false };
  }
  const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = sdk;
  const unitId = AD_UNITS.rewarded ?? TestIds.REWARDED;
  console.log(`[ads] rewarded loading: ${placement} unit=${AD_UNITS.rewarded ? 'REAL' : 'TEST'}`);

  return await new Promise<{ earned: boolean }>((resolve) => {
    let earned = false;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve({ earned }); } };
    try {
      const ad = RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: false });
      const subs: Array<() => void> = [];
      const cleanup = () => subs.forEach((u) => { try { u(); } catch { /* noop */ } });
      subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        try { ad.show(); } catch (e) { console.warn('[ads] rewarded show() threw', e); cleanup(); finish(); }
      }));
      subs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
      subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => { cleanup(); finish(); }));
      subs.push(ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn('[ads] rewarded failed to load/show:', error?.message ?? error);
        cleanup();
        finish();
      }));
      ad.load();
    } catch (e) {
      console.warn('[ads] rewarded threw', e);
      finish();
    }
  });
}
