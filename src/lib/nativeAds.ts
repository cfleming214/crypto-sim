import { AD_UNITS } from '../constants/adUnits';

// Load one native ad and log its CONTENT (headline, body, advertiser, CTA, media
// type, images). Native ad content is served at runtime per-impression and varies
// by user / device / live demand — it can't be inspected outside a running build,
// so call this ON-DEVICE to see what your unit actually serves. Best-effort; never
// throws. Each call uses one ad impression, so only run it for diagnostics.
export async function inspectNativeAd(): Promise<void> {
  try {
    const sdk: any = await import('react-native-google-mobile-ads');
    const { NativeAd, TestIds } = sdk;
    if (!NativeAd) { console.warn('[ads] native: SDK/module unavailable (Expo Go / web)'); return; }
    const unitId = AD_UNITS.native ?? TestIds.NATIVE;
    console.log(`[ads] native loading: unit=${AD_UNITS.native ? 'REAL' : 'TEST'} ${unitId}`);
    const ad = await NativeAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: false });
    console.log('[ads] native loaded — content:', JSON.stringify({
      unit: AD_UNITS.native ? 'REAL' : 'TEST',
      headline: ad.headline,
      body: ad.body,
      advertiser: ad.advertiser,
      callToAction: ad.callToAction,
      hasVideo: ad.mediaContent?.hasVideoContent ?? false,
      iconUrl: ad.icon?.url,
      imageUrls: (ad.images ?? []).map((i: any) => i.url),
      store: ad.store,
      price: ad.price,
      starRating: ad.starRating,
    }, null, 2));
    ad.destroy?.();
  } catch (e: any) {
    console.warn('[ads] native failed to load:', e?.code ?? '', e?.message ?? e);
  }
}
