import { Platform } from 'react-native';
import { md5 } from './md5';

// The AdMob TEST DEVICE ID for this install.
//
// Registering it in the AdMob console makes live ad units serve TEST ads to this
// device — which matters because testing against live units from a developer
// device is itself an invalid-traffic vector (CRYP-60).
//
// The SDK has setRequestConfiguration but no getter, and it only prints the ID
// to the native console on the first ad request. So we derive it the same way
// Google's iOS SDK does: MD5 of the IDFV, lowercase hex.
//
// The ID changes on reinstall (the IDFV does), so it must be re-registered after
// a fresh install — which is exactly why this is worth surfacing in-app rather
// than leaving people to grep Xcode logs each time.
export async function getAdTestDeviceId(): Promise<{ id: string | null; reason?: string }> {
  if (Platform.OS !== 'ios') {
    // Android derives its ID differently (and the SDK logs it); not worth a
    // second derivation path for a platform this app doesn't ship.
    return { id: null, reason: 'iOS only — on Android, read it from the SDK log line.' };
  }
  try {
    const Application = await import('expo-application');
    const idfv = await Application.getIosIdForVendorAsync();
    if (!idfv) return { id: null, reason: 'The system returned no IDFV for this app.' };
    return { id: md5(idfv) };
  } catch {
    // expo-application is a native module — absent in Expo Go / web.
    return { id: null, reason: 'Needs a dev or production build (native module unavailable here).' };
  }
}
