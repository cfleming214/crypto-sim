import React from 'react';
import { View, Appearance } from 'react-native';
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureAmplify } from './src/lib/amplify';
import { ThemeProvider } from './src/theme/ThemeContext';
import { AppProvider } from './src/store/AppContext';
import { AuthProvider } from './src/store/AuthContext';
import { RootNavigator, navigationRef } from './src/navigation/RootNavigator';
import { ToastProvider } from './src/components/ui/Toast';
import { AchievementWatcher } from './src/components/AchievementWatcher';
import { QuestWatcher } from './src/components/QuestWatcher';
import { EventWatcher } from './src/components/EventWatcher';
import { PredictionWatcher } from './src/components/PredictionWatcher';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { CoachmarkProvider } from './src/components/coachmarks/CoachmarkProvider';
import { startOtaUpdates } from './src/lib/otaUpdates';
import { initAds } from './src/lib/ads';
import { loadAdTestMode } from './src/lib/adTestMode';
import { AdsTestBadge } from './src/components/AdsTestBadge';
import * as Sentry from '@sentry/react-native';

configureAmplify();

// Crash + error reporting. DSN comes from EXPO_PUBLIC_SENTRY_DSN (inlined at
// build time via eas.json), so it only activates in real builds — never in dev /
// Expo Go where the env is unset. Errors-only (no perf tracing) to stay within
// the free tier; native crash handling is on by default.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
  });
}

function App() {
  // Production-safe OTA "hot reload": pull the latest JS bundle on launch +
  // foreground (no-op in dev / Expo Go). See src/lib/otaUpdates.ts.
  React.useEffect(() => startOtaUpdates(), []);

  // Boot the AdMob SDK (+ iOS ATT prompt) once at launch. No-op in Expo Go / web.
  React.useEffect(() => { initAds(); }, []);

  // Load the persisted AdMob test-mode override (QA dev toggle).
  React.useEffect(() => { loadAdTestMode(); }, []);

  // Load Geist (the app typeface) before first paint so text never flashes in a
  // system fallback. The faces are bundled assets, so they load near-instantly
  // and ship over OTA. Hold a themed blank frame until they're ready — but if
  // loading ERRORS, render anyway: the Text wrapper's Geist families fall back
  // to the system font, so a font failure degrades gracefully instead of
  // leaving the user on a permanent blank screen.
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: Appearance.getColorScheme() === 'dark' ? '#0A0A0B' : '#F7F6F2' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppProvider>
            <ThemeProvider>
              <ToastProvider>
                {/* The watchers run effects on every state change but render
                    nothing — isolate them so a gamification bug disables just the
                    watchers (and reports to Sentry) instead of blanking the app. */}
                <ErrorBoundary fallback={null} label="watchers">
                  <AchievementWatcher />
                  <QuestWatcher />
                  <EventWatcher />
                  <PredictionWatcher />
                </ErrorBoundary>
                <CoachmarkProvider>
                  <NavigationContainer ref={navigationRef}>
                    <RootNavigator />
                  </NavigationContainer>
                </CoachmarkProvider>
              </ToastProvider>
            </ThemeProvider>
          </AppProvider>
        </AuthProvider>
      </SafeAreaProvider>
      </ErrorBoundary>
      {/* QA overlay — only visible when AdMob test mode is on. */}
      <AdsTestBadge />
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the error boundary + touch/navigation context to crash reports.
export default Sentry.wrap(App);
