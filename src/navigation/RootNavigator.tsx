import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { TradeDetailScreen } from '../screens/TradeDetailScreen';
import { TournamentDetailScreen } from '../screens/TournamentDetailScreen';
import { LeagueScreen } from '../screens/LeagueScreen';
import { BracketsScreen } from '../screens/BracketsScreen';
import { CopyTradeScreen } from '../screens/CopyTradeScreen';
import { TopTradersScreen } from '../screens/TopTradersScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { useAuth } from '../store/AuthContext';

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: { screen?: string; params?: any } | undefined;
  TradeDetail: { tradeId?: string; symbol?: string };
  TournamentDetail: { id: string };
  League: undefined;
  Brackets: undefined;
  CopyTrade: { traderId: string };
  TopTraders: undefined;
  Replay: { eraId?: string };
  Notifications: undefined;
  Activity: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
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
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <Stack.Screen name="League" component={LeagueScreen} />
      <Stack.Screen name="Brackets" component={BracketsScreen} />
      <Stack.Screen name="CopyTrade" component={CopyTradeScreen} />
      <Stack.Screen name="TopTraders" component={TopTradersScreen} />
      <Stack.Screen name="Replay" component={ReplayScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
    </Stack.Navigator>
  );
}
