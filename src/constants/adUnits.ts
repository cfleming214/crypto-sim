import { Platform } from 'react-native';

// AdMob ad unit IDs. Real units come from build-time env (EXPO_PUBLIC_ADMOB_*),
// inlined by Expo. When unset (dev, or before real units exist), adManager falls
// back to Google's official TEST ids resolved from the native module's TestIds.
//
// NEVER ship real units without testing first — clicking a live ad on your own
// device can get the AdMob account banned. Keep production builds pointed at real
// units only once they're created in the AdMob console.
//
// This file is import-safe in Expo Go / web: it only reads env strings and never
// touches the native module.

function pick(ios?: string, android?: string): string | undefined {
  const v = Platform.OS === 'ios' ? ios : android;
  return v && v.length > 0 ? v : undefined;
}

export const AD_UNITS = {
  banner: pick(process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS, process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID),
  interstitial: pick(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS, process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID),
  rewarded: pick(process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS, process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID),
};
