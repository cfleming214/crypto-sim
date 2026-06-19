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
import { PublicProfileScreen } from '../screens/PublicProfileScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { ReplayHistoryScreen } from '../screens/ReplayHistoryScreen';
import { PredictionScreen } from '../screens/PredictionScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { QuestsScreen } from '../screens/QuestsScreen';
import { SeasonScreen } from '../screens/SeasonScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { PayoutSetupScreen } from '../screens/PayoutSetupScreen';
import { WithdrawScreen } from '../screens/WithdrawScreen';
import { NewsDetailScreen } from '../screens/NewsDetailScreen';
import { BlockedUsersScreen } from '../screens/BlockedUsersScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { SplashLogo } from '../components/SplashLogo';
import { OnboardingWalkthrough } from '../screens/OnboardingWalkthrough';
import { OldWalkthroughScreen } from '../screens/OldWalkthroughScreen';
import type { NewsArticle } from '../services/newsService';
import { useAuth } from '../store/AuthContext';
import { useApp } from '../store/AppContext';

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
  PublicProfile: { handle: string };
  OldWalkthrough: undefined;
  Replay: { eraId?: string; contestId?: string };
  ReplayHistory: { sessionId: string };
  Predict: undefined;
  Notifications: undefined;
  Learn: undefined;
  Lesson: { lessonId: string };
  Quests: undefined;
  Season: undefined;
  Activity: undefined;
  PayoutSetup: undefined;
  Withdraw: undefined;
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
  const { state } = useApp();

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
  // Hard timeout so the splash can NEVER hang forever: if auth/onboarding hasn't
  // resolved within 6s (e.g. a network/session stall), proceed anyway as a guest
  // rather than leaving the user stuck on the logo.
  const [splashTimedOut, setSplashTimedOut] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setSplashTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, []);
  // Hold the splash until auth AND the onboarding flag are resolved (both finish
  // during the 1.4s splash), so a returning user never flashes the walkthrough.
  if (!splashTimedOut && (status === 'loading' || minSplash || !state.onboardingChecked)) return <SplashLogo />;

  // First run → the new feature walkthrough; it flips `hasOnboarded` when
  // finished (Start Trading / Skip), which re-renders this into the main app.
  // The original W1–W8 tour stays available from Profile → "Old walkthrough".
  if (!state.hasOnboarded) return <OnboardingWalkthrough />;

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
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="OldWalkthrough" component={OldWalkthroughScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Replay" component={ReplayScreen} />
      <Stack.Screen name="ReplayHistory" component={ReplayHistoryScreen} />
      <Stack.Screen name="Predict" component={PredictionScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Learn" component={LearnScreen} />
      <Stack.Screen name="Lesson" component={LessonScreen} />
      <Stack.Screen name="Quests" component={QuestsScreen} />
      <Stack.Screen name="Season" component={SeasonScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
      <Stack.Screen name="PayoutSetup" component={PayoutSetupScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
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
