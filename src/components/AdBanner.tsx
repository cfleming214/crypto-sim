import React from 'react';
import { View } from 'react-native';
import { AD_UNITS } from '../constants/adUnits';

// A single AdMob banner. Uses the real banner unit from AD_UNITS (set per build
// via EXPO_PUBLIC_ADMOB_BANNER_* in eas.json) and falls back to Google's TEST
// unit when that env is unset (dev / Expo Go) — so production serves real ads and
// dev stays on test ads. NEVER tap a live ad on your own device (ban risk).
//
// The native module only exists in a dev/production build. We require it behind
// a try/catch so the component degrades to rendering nothing in Expo Go / web
// instead of crashing on a missing TurboModule.

let BannerAd: any, BannerAdSize: any, TestIds: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ads = require('react-native-google-mobile-ads');
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
  TestIds = ads.TestIds;
} catch {
  // native module absent — AdBanner renders null
}

export function AdBanner({ unitId }: { unitId?: string }) {
  if (!BannerAd) return null;
  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={unitId ?? AD_UNITS.banner ?? TestIds.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
