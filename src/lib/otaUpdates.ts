import * as Updates from 'expo-updates';
import { AppState, type AppStateStatus } from 'react-native';

// Production-safe "hot reload" via EAS Update (expo-updates). On a real build it
// checks the project's update channel for a newer JS bundle, downloads it, and
// relaunches into it — so JS/asset fixes reach installed apps (TestFlight /
// App Store / Play) without a native rebuild or store review.
//
// IMPORTANT: this can only ship JS + asset changes. Anything that touches native
// code (a new native module, app.json native config, permissions) still needs a
// fresh `eas build` + store submission. Publish with:
//   eas update --branch production --message "..."   (matching the build channel)
//
// No-ops in Expo Go / dev client (Updates.isEnabled === false) where Fast Refresh
// already handles reloading, and never throws.

let applying = false;

async function checkForOtaUpdate(): Promise<void> {
  if (!Updates.isEnabled || applying) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;
    applying = true;                 // guard against concurrent checks / reload loops
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();      // relaunch into the new bundle
  } catch {
    applying = false;                // offline / transient — retry on next foreground
  }
}

// Call once at app start. Checks on launch and whenever the app returns to the
// foreground (a natural, low-disruption point to pick up a published update).
// Returns a cleanup function.
export function startOtaUpdates(): () => void {
  checkForOtaUpdate();
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') checkForOtaUpdate();
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
