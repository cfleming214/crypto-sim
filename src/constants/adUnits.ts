import { Platform } from 'react-native';

// AdMob ad unit IDs. Real units come from build-time env (EXPO_PUBLIC_ADMOB_*),
// inlined by Expo and set in eas.json (production + preview env blocks). When
// unset (dev, or before real units exist), adManager falls back to Google's
// official TEST ids resolved from the native module's TestIds.
//
// WHERE TO GET THE IDS (AdMob console — https://apps.admob.com):
//   1. App ID (2, one per platform): Apps → (your app) → App settings → "App ID"
//      (looks like ca-app-pub-XXXX~XXXX, note the "~"). These go in app.json under
//      the react-native-google-mobile-ads plugin (androidAppId / iosAppId), NOT here.
//   2. Ad unit IDs (the 6 below): Apps → (your app) → Ad units → Add ad unit →
//      pick the format, then copy the "Ad unit ID" (ca-app-pub-XXXX/XXXX, note "/").
//      Create one per format PER PLATFORM and paste into the matching eas.json key:
//        Banner       -> EXPO_PUBLIC_ADMOB_BANNER_IOS      / _BANNER_ANDROID
//        Interstitial -> EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS / _INTERSTITIAL_ANDROID
//        Rewarded     -> EXPO_PUBLIC_ADMOB_REWARDED_IOS    / _REWARDED_ANDROID
//
// NEVER ship real units without testing first — clicking a live ad on your own
// device can get the AdMob account banned. Keep production builds pointed at real
// units only once they're created in the AdMob console.
//
// This file is import-safe in Expo Go / web: it only reads env strings and never
// touches the native module.
//
// OTA TEST MODE: set EXPO_PUBLIC_ADMOB_TEST_MODE="true" to force Google's TEST
// units app-wide (every format falls back to TestIds). Because it's a JS flag,
// you can flip it WITHOUT a rebuild: change the EAS env var and run
// `eas update --environment <env>` — the re-bundled JS carries the new value.
// Real ads ↔ test ads with no store submission. (Test ads work fine with the real
// App ID, so nothing native changes.)

export const ADMOB_TEST_MODE = process.env.EXPO_PUBLIC_ADMOB_TEST_MODE === 'true';

function pick(ios?: string, android?: string): string | undefined {
  if (ADMOB_TEST_MODE) return undefined; // force TestIds everywhere (OTA-toggleable)
  const v = Platform.OS === 'ios' ? ios : android;
  return v && v.length > 0 ? v : undefined;
}

export const AD_UNITS = {
  banner: pick(process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS, process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID),
  interstitial: pick(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS, process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID),
  rewarded: pick(process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS, process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID),
  rewardedInterstitial: pick(process.env.EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_IOS, process.env.EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_ANDROID),
  native: pick(process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS, process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID),
};
