import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { TradeScreen } from '../screens/TradeScreen';
import { TradeDetailScreen } from '../screens/TradeDetailScreen';
import { TournamentDetailScreen } from '../screens/TournamentDetailScreen';
import { LeagueScreen } from '../screens/LeagueScreen';
import { BracketsScreen } from '../screens/BracketsScreen';
import { CopyTradeScreen } from '../screens/CopyTradeScreen';
import { TopTradersScreen } from '../screens/TopTradersScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { PredictionScreen } from '../screens/PredictionScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { NewsDetailScreen } from '../screens/NewsDetailScreen';
import { AuthScreen } from '../screens/AuthScreen';
import type { NewsArticle } from '../services/newsService';
import { useAuth } from '../store/AuthContext';

export type RootStackParamList = {
  Auth: { mode?: 'signin' | 'signup' } | undefined;
  MainTabs: { screen?: string; params?: any } | undefined;
  Trade: { symbol?: string } | undefined;
  TradeDetail: { tradeId?: string; symbol?: string };
  TournamentDetail: { id: string };
  League: undefined;
  Brackets: undefined;
  CopyTrade: { traderId: string };
  TopTraders: undefined;
  Replay: { eraId?: string };
  Predict: undefined;
  Notifications: undefined;
  Activity: undefined;
  NewsDetail: { article: NewsArticle };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  // Hold on the splash until the session check resolves. After that the app
  // is always reachable as a guest — the $10k demo portfolio lives in
  // AppContext and works without an account. Auth-gated areas (Profile,
  // Compete) render their own sign-up wall and push the Auth modal below.
  if (status === 'loading') return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="Trade" component={TradeScreen} />
      <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <Stack.Screen name="League" component={LeagueScreen} />
      <Stack.Screen name="Brackets" component={BracketsScreen} />
      <Stack.Screen name="CopyTrade" component={CopyTradeScreen} />
      <Stack.Screen name="TopTraders" component={TopTradersScreen} />
      <Stack.Screen name="Replay" component={ReplayScreen} />
      <Stack.Screen name="Predict" component={PredictionScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="NewsDetail" component={NewsDetailScreen} />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
