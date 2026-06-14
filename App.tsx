import React from 'react';
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
import { CoachmarkProvider } from './src/components/coachmarks/CoachmarkProvider';
import { startOtaUpdates } from './src/lib/otaUpdates';

configureAmplify();

export default function App() {
  // Production-safe OTA "hot reload": pull the latest JS bundle on launch +
  // foreground (no-op in dev / Expo Go). See src/lib/otaUpdates.ts.
  React.useEffect(() => startOtaUpdates(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppProvider>
            <ThemeProvider>
              <ToastProvider>
                <AchievementWatcher />
                <QuestWatcher />
                <EventWatcher />
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
    </GestureHandlerRootView>
  );
}
