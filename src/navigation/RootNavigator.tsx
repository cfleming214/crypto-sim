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

export type RootStackParamList = {
  Walkthrough: undefined;
  MainTabs: undefined;
  TradeDetail: { symbol: string };
  TournamentDetail: { id: string };
  League: undefined;
  CopyTrade: { traderId: string };
  Replay: { eraId: string };
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  hasOnboarded: boolean;
}

export function RootNavigator({ hasOnboarded }: RootNavigatorProps) {
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
    </Stack.Navigator>
  );
}
