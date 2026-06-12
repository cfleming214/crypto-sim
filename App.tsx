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
import { EventWatcher } from './src/components/EventWatcher';

configureAmplify();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppProvider>
            <ThemeProvider>
              <ToastProvider>
                <AchievementWatcher />
                <EventWatcher />
                <NavigationContainer ref={navigationRef}>
                  <RootNavigator />
                </NavigationContainer>
              </ToastProvider>
            </ThemeProvider>
          </AppProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
