import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from './ui/Text';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

// Catches render crashes anywhere below it so a bug can never leave the app
// frozen on the splash (the last committed frame). Shows the actual error and a
// couple of recovery actions instead. Uses plain styles — it sits above the
// theme/safe-area providers so it can render even if those are the problem.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surfaces in Metro / device logs for diagnosis.
    console.error('App crash caught by ErrorBoundary:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0B', paddingHorizontal: 24, paddingTop: 80, paddingBottom: 32 }}>
        <Text style={{ color: '#FF6F61', fontSize: 20, fontWeight: '800', marginBottom: 10 }}>Something went wrong</Text>
        <Text style={{ color: '#88868A', fontSize: 13, marginBottom: 14 }}>
          The app hit an error while loading this screen. Details below.
        </Text>
        <ScrollView style={{ maxHeight: 280, backgroundColor: '#141416', borderRadius: 12, padding: 14 }}>
          <Text style={{ color: '#F5F4EF', fontSize: 12, lineHeight: 18 }}>
            {String(error?.message || error)}
            {error?.stack ? `\n\n${error.stack}` : ''}
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ marginTop: 20, backgroundColor: '#3DD68C', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#04130a', fontWeight: '800', fontSize: 15 }}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await AsyncStorage.setItem('hasOnboarded', 'true');
            // Reload so AppContext re-reads the flag and skips the (crashing)
            // walkthrough. Falls back to clearing the boundary if reload is
            // unavailable (e.g. Expo Go without updates).
            try { const U = await import('expo-updates'); await U.reloadAsync(); }
            catch { this.setState({ error: null }); }
          }}
          style={{ marginTop: 10, paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#88868A', fontSize: 14 }}>Skip walkthrough &amp; continue</Text>
        </Pressable>
      </View>
    );
  }
}
