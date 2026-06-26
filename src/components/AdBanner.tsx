import React from 'react';
import { View } from 'react-native';

// A single AdMob banner. Uses Google's TEST ad unit (TestIds.BANNER) so it's
// always safe to render in development — clicking real ads on your own device
// can get an AdMob account banned. Swap to a real ad unit id via the `unitId`
// prop (or the default below) when going live.
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
        unitId={unitId ?? TestIds.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
