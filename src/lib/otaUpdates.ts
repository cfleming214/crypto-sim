import * as Updates from 'expo-updates';
import { AppState, type AppStateStatus } from 'react-native';

// Production-safe OTA delivery via EAS Update (expo-updates). On a real build it
// checks the project's update channel for a newer JS bundle and DOWNLOADS it; the
// update is applied automatically on the next natural cold launch.
//
// We deliberately DO NOT call Updates.reloadAsync() to force an in-session
// relaunch. On iOS 26 that path creates an expo-updates `RelaunchProcedure`
// whose deallocation segfaults — EXC_BAD_ACCESS dereferencing null while
// destroying the JavaScriptPromise in expo-modules-core (captured in Sentry as
// JAVASCRIPT-REACT-1, fatal, build 1.3.3+109). Downloading + applying-on-next-
// launch avoids the relaunch procedure entirely and is the standard, less
// disruptive behaviour anyway.
//
// IMPORTANT: this can only ship JS + asset changes. Native changes still need a
// fresh `eas build` + store submission. Publish with:
//   eas update --branch production --message "..."   (matching the build channel)
//
// No-ops in Expo Go / dev client (Updates.isEnabled === false), and never throws.

let checking = false;
let lastCheck = 0;
// Throttle: never run the update flow more than once per window, so foregrounding
// repeatedly can't churn expo-updates' native procedures (the source of the crash).
const MIN_INTERVAL_MS = 15 * 60 * 1000;

async function checkForOtaUpdate(): Promise<void> {
  if (!Updates.isEnabled || checking) return;
  if (Date.now() - lastCheck < MIN_INTERVAL_MS) return;
  lastCheck = Date.now();
  checking = true;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      // Download only. Applied on the next cold launch — NO reloadAsync() (see top).
      await Updates.fetchUpdateAsync();
    }
  } catch {
    // offline / transient — retry on a later foreground
  } finally {
    checking = false;
  }
}

// Call once at app start. Checks on launch and on foreground (throttled). Returns
// a cleanup function.
export function startOtaUpdates(): () => void {
  checkForOtaUpdate();
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') checkForOtaUpdate();
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
