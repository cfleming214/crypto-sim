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

configureAmplify();

export default function App() {
  // Production-safe OTA "hot reload": pull the latest JS bundle on launch +
  // foreground (no-op in dev / Expo Go). See src/lib/otaUpdates.ts.
  React.useEffect(() => startOtaUpdates(), []);

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
                <AchievementWatcher />
                <QuestWatcher />
                <EventWatcher />
                <PredictionWatcher />
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
    </GestureHandlerRootView>
  );
}
