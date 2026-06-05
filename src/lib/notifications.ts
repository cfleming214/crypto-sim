import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Thin, fully-guarded wrapper over expo-notifications. expo-notifications is a
// NATIVE module: until the app is rebuilt (EAS / `expo prebuild`) with it
// included, the native side is absent and these calls throw — every call is
// wrapped so it no-ops cleanly on the current build. After a rebuild they fire
// real OS notifications (including from the background/lock screen).
//
// Note on scope: the price simulation + limit-order fills run only while the
// app is foregrounded, so a fill "while fully closed" can't be detected client
// side — that needs server push (a later backend phase). What works today: an
// immediate notification when an event is detected in-app (notifyNow), and a
// pre-scheduled daily-reward reminder that fires even when the app is closed
// (scheduleAt), since it's registered with the OS ahead of time.

let configured = false;
let permissionGranted = false;

export function configureNotifications() {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }
  } catch {
    // Native module not present in this build — ignore.
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    permissionGranted = status === 'granted';
    return permissionGranted;
  } catch {
    return false;
  }
}

// Present an immediate local notification (fires now; lands in the tray if
// backgrounded). No-ops if permission isn't granted or the module is absent.
export async function notifyNow(title: string, body: string) {
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {}
}

// Schedule a local notification for a future moment (ms epoch), replacing any
// prior one with the same id. Fires even if the app is closed (the OS holds it).
export async function scheduleAt(id: string, date: number, title: string, body: string) {
  if (!permissionGranted) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    const seconds = Math.max(1, Math.round((date - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: { seconds } as any,
    } as any);
  } catch {}
}
