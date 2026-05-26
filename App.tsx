import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('hasOnboarded').then(val => {
      setHasOnboarded(val === 'true');
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <NavigationContainer>
          <RootNavigator hasOnboarded={hasOnboarded} />
        </NavigationContainer>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
