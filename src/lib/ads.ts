import { Platform } from 'react-native';

// Google Mobile Ads (AdMob) initialization. Call once at app start.
//
// On iOS we first show the App Tracking Transparency prompt and pass the result
// to the SDK as the request-configuration, so personalized ads are only served
// when the user consents (App Store requirement). Then mobileAds().initialize()
// boots the SDK + mediation adapters.
//
// The native module only exists in a dev/production build — never in Expo Go or
// on web — so everything is behind a lazy require in try/catch and is a silent
// no-op when the module is absent. Never throws into app startup.

let started = false;

export async function initAds(): Promise<void> {
  if (started) return;
  started = true;
  try {
    // iOS ATT prompt before init so the SDK picks up the consent state.
    if (Platform.OS === 'ios') {
      try {
        const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
        await requestTrackingPermissionsAsync();
      } catch {
        // tracking-transparency unavailable (Expo Go) — proceed with non-personalized ads
      }
    }
    const mobileAds = (await import('react-native-google-mobile-ads')).default;
    await mobileAds().initialize();
  } catch {
    // native module not present (Expo Go / web) or init failed — ads just won't show
  }
}
