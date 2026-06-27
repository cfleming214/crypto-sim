import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Text } from './ui/Text';
import { useTheme } from '../theme/ThemeContext';
import { AD_UNITS } from '../constants/adUnits';

// A native AdMob ad rendered to match the news article card. AdMob delivers raw
// assets (headline/body/advertiser/media/CTA) and we lay them out ourselves; an
// "Ad" label is required by policy. Loads its own ad on mount, logs the served
// content (so you can see what your unit returns), and renders nothing until/
// unless an ad loads — so a no-fill just leaves the feed as articles.
//
// The native module only exists in a dev/production build; we require it behind a
// try/catch so this degrades to null in Expo Go / web.

let NativeAd: any, NativeAdView: any, NativeAsset: any, NativeAssetType: any, NativeMediaView: any, TestIds: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ads = require('react-native-google-mobile-ads');
  NativeAd = ads.NativeAd;
  NativeAdView = ads.NativeAdView;
  NativeAsset = ads.NativeAsset;
  NativeAssetType = ads.NativeAssetType;
  NativeMediaView = ads.NativeMediaView;
  TestIds = ads.TestIds;
} catch {
  // native module absent — NativeAdCard renders null
}

// variant 'card' = standalone bordered card (news feed); 'row' = seamless list
// row to sit inside a noPad Card among CardSections (markets / live-trades).
export function NativeAdCard({ variant = 'card' }: { variant?: 'card' | 'row' }) {
  const { colors } = useTheme();
  const [ad, setAd] = useState<any>(null);

  useEffect(() => {
    if (!NativeAd) return;
    let loaded: any = null;
    let cancelled = false;
    const unitId = AD_UNITS.native ?? TestIds?.NATIVE;
    NativeAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: false })
      .then((a: any) => {
        loaded = a;
        if (cancelled) { a.destroy?.(); return; }
        setAd(a);
        // Surface what content the unit served (answers "what kind of ad is it").
        console.log('[ads] native loaded — content:', JSON.stringify({
          unit: AD_UNITS.native ? 'REAL' : 'TEST',
          headline: a.headline,
          body: a.body,
          advertiser: a.advertiser,
          callToAction: a.callToAction,
          hasVideo: a.mediaContent?.hasVideoContent ?? false,
          store: a.store,
          price: a.price,
        }));
      })
      .catch((e: any) => console.warn('[ads] native failed to load:', e?.code ?? '', e?.message ?? e));
    return () => { cancelled = true; loaded?.destroy?.(); };
  }, []);

  if (!NativeAdView || !ad) return null;

  const AdBadge = (
    <View style={{ backgroundColor: `${colors.brand}1A`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brand }}>Ad</Text>
    </View>
  );
  const iconUrl = ad.icon?.url;

  // ----- Compact row (markets / live-trades): single line, icon + text + CTA.
  // Everything is one row that self-sizes, so nothing can run off the bottom.
  if (variant === 'row') {
    return (
      <NativeAdView
        nativeAd={ad}
        style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {iconUrl ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: iconUrl }} style={{ width: 40, height: 40, borderRadius: 9, backgroundColor: colors.surface2 }} />
            </NativeAsset>
          ) : (
            <NativeMediaView style={{ width: 40, height: 40, borderRadius: 9, backgroundColor: colors.surface2 }} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {AdBadge}
              {!!ad.advertiser && (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brand }} numberOfLines={1}>{ad.advertiser}</Text>
                </NativeAsset>
              )}
            </View>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }} numberOfLines={1}>{ad.headline}</Text>
            </NativeAsset>
            {!!ad.body && (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={{ fontSize: 11, color: colors.ink3 }} numberOfLines={1}>{ad.body}</Text>
              </NativeAsset>
            )}
          </View>
          {!!ad.callToAction && (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={{ backgroundColor: colors.brand, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brandOn }} numberOfLines={1}>{ad.callToAction}</Text>
              </View>
            </NativeAsset>
          )}
        </View>
      </NativeAdView>
    );
  }

  // ----- Article-style card (news): media banner on top, then text stacked.
  // Vertical flow auto-sizes to content — no fixed-height media beside the text.
  return (
    <NativeAdView
      nativeAd={ad}
      style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, padding: 12, gap: 8 }}
    >
      <NativeMediaView style={{ width: '100%', aspectRatio: 1.91, borderRadius: 12, backgroundColor: colors.surface2 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {AdBadge}
        {!!ad.advertiser && (
          <NativeAsset assetType={NativeAssetType.ADVERTISER}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brand }} numberOfLines={1}>{ad.advertiser}</Text>
          </NativeAsset>
        )}
      </View>
      <NativeAsset assetType={NativeAssetType.HEADLINE}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 19 }} numberOfLines={2}>{ad.headline}</Text>
      </NativeAsset>
      {!!ad.body && (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 16 }} numberOfLines={2}>{ad.body}</Text>
        </NativeAsset>
      )}
      {!!ad.callToAction && (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.brandOn }}>{ad.callToAction}</Text>
          </View>
        </NativeAsset>
      )}
    </NativeAdView>
  );
}
