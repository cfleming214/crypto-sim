import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { WalkthroughNavigator } from './WalkthroughNavigator';
import { TradeDetailScreen } from '../screens/TradeDetailScreen';
import { TournamentDetailScreen } from '../screens/TournamentDetailScreen';
import { LeagueScreen } from '../screens/LeagueScreen';
import { CopyTradeScreen } from '../screens/CopyTradeScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { useAuth } from '../store/AuthContext';

export type RootStackParamList = {
  Auth: undefined;
  Walkthrough: undefined;
  MainTabs: { screen?: string; params?: any } | undefined;
  TradeDetail: { symbol: string };
  TournamentDetail: { id: string };
  League: undefined;
  CopyTrade: { traderId: string };
  Replay: { eraId?: string };
  Notifications: undefined;
  Activity: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  hasOnboarded: boolean;
}

export function RootNavigator({ hasOnboarded }: RootNavigatorProps) {
  const { status } = useAuth();

  if (status === 'loading') return null;

  if (status === 'unauthenticated') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasOnboarded ? (
        <Stack.Screen name="Walkthrough" component={WalkthroughNavigator} />
      ) : null}
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <Stack.Screen name="League" component={LeagueScreen} />
      <Stack.Screen name="CopyTrade" component={CopyTradeScreen} />
      <Stack.Screen name="Replay" component={ReplayScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
    </Stack.Navigator>
  );
}
