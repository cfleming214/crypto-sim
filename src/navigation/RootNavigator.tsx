import React from 'react';
import { Platform } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
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
import { PayoutSetupScreen } from '../screens/PayoutSetupScreen';
import { NewsDetailScreen } from '../screens/NewsDetailScreen';
import { BlockedUsersScreen } from '../screens/BlockedUsersScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { SplashLogo } from '../components/SplashLogo';
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
  PayoutSetup: undefined;
  NewsDetail: { article: NewsArticle };
  BlockedUsers: undefined;
};

// Imperative navigation handle so push-notification taps (handled outside the
// React tree, in EventWatcher) can route to a screen. Attached to the
// NavigationContainer in App.tsx.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  // Show the animated glowing-logo splash until the session check resolves, with
  // a short minimum so the glow animation is actually seen on a fast cold start.
  // After that the app is always reachable as a guest — the $10k demo portfolio
  // lives in AppContext and works without an account. Auth-gated areas (Profile,
  // Compete) render their own sign-up wall and push the Auth modal below.
  const [minSplash, setMinSplash] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setMinSplash(false), 1400);
    return () => clearTimeout(t);
  }, []);
  if (status === 'loading' || minSplash) return <SplashLogo />;

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
      <Stack.Screen name="PayoutSetup" component={PayoutSetupScreen} />
      <Stack.Screen name="NewsDetail" component={NewsDetailScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        // On iPhone a sheet-style modal is fine. On iPad, React Navigation's
        // 'modal' renders a short, centered page-sheet that can clip the form
        // behind the keyboard and is swipe-dismissible — exactly the "login
        // page with nothing else" an iPad reviewer can get stuck on. Force a
        // full-screen modal on iPad so the whole sign-in form is always
        // reachable.
        options={{ presentation: Platform.OS === 'ios' && Platform.isPad ? 'fullScreenModal' : 'modal' }}
      />
    </Stack.Navigator>
  );
}
