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

  const iconUrl = ad.icon?.url;
  // 'row' (markets / live-trades) insets the card slightly so it reads as a
  // distinct block inside the seamless list; 'card' (news) sits flush in the feed.
  const outerMargin = variant === 'row' ? { marginHorizontal: 12, marginVertical: 8 } : {};

  // ONE contained layout for every placement: a bordered card with the media at a
  // FIXED height (native media views ignore aspectRatio/%, which caused the giant
  // overflow), overflow clipped, and all assets nested inside the NativeAdView so
  // the AdMob validator's "assets inside the ad view" check passes.
  return (
    <NativeAdView
      nativeAd={ad}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.hairline,
        overflow: 'hidden',
        ...outerMargin,
      }}
    >
      {/* Header: icon + headline + (Ad · advertiser) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        {!!iconUrl && (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: iconUrl }} style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface2 }} />
          </NativeAsset>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{ad.headline}</Text>
          </NativeAsset>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${colors.brand}1A`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brand }}>Ad</Text>
            </View>
            {!!ad.advertiser && (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={{ fontSize: 11, color: colors.ink3 }} numberOfLines={1}>{ad.advertiser}</Text>
              </NativeAsset>
            )}
          </View>
        </View>
      </View>

      {/* Media — FIXED height so it can't balloon. */}
      <NativeMediaView style={{ width: '100%', height: 150, backgroundColor: colors.surface2 }} />

      {/* Body + CTA */}
      <View style={{ padding: 12, gap: 8 }}>
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
      </View>
    </NativeAdView>
  );
}
