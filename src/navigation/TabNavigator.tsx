import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, View, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { MarketsScreen } from '../screens/MarketsScreen';
import { CompeteScreen } from '../screens/CompeteScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Home, BarChart2, Trophy, User, Bell, Search, Newspaper, LucideIcon } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

// Tab icon that springs up slightly when its tab becomes active — a small,
// frequent-but-pleasant cue. Skipped under Reduce Motion.
function TabIcon({ Icon, color, focused }: { Icon: LucideIcon; color: string; focused: boolean }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(focused ? 1.12 : 1)).current;
  useEffect(() => {
    if (reduced) { scale.setValue(focused ? 1.12 : 1); return; }
    Animated.spring(scale, { toValue: focused ? 1.12 : 1, useNativeDriver: true, speed: 40, bounciness: 12 }).start();
  }, [focused, reduced, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon color={color} size={22} strokeWidth={1.75} />
    </Animated.View>
  );
}

function BellButton() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  return (
    <TouchableOpacity onPress={() => nav.navigate('Notifications')} style={{ marginRight: 8, padding: 8 }}>
      <View style={{ position: 'relative' }}>
        <Bell color={colors.ink} size={20} strokeWidth={1.75} />
        <View style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.down }} />
      </View>
    </TouchableOpacity>
  );
}

export function TabNavigator() {
  const { colors } = useTheme();
  const { state } = useApp();
  const { bottom } = useSafeAreaInsets();

  // Compete dot: user is in a live competition
  const hasCompeteDot = state.joinedTournamentIds.some(id =>
    state.competitions.find(c => c.id === id && c.status === 'live')
  );

  // Profile dot: there are triggered price alerts or a new achievement
  const hasProfileDot = state.triggeredAlerts.length > 0 ||
    (state.trades.length === 1) ||
    (state.user.streak >= 7 && state.trades.length > 0);

  return (
    <Tab.Navigator
      // Each tab in its own boundary — a crash in one tab shows a recoverable
      // fallback there while the tab bar and other tabs keep working.
      screenLayout={({ children }) => <ErrorBoundary>{children}</ErrorBoundary>}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          paddingBottom: 14 + bottom,
          paddingTop: 8,
          height: 64 + bottom,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink4,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={PortfolioScreen}
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={Home} color={color} focused={focused} /> }}
      />
      <Tab.Screen
        name="Markets"
        component={MarketsScreen}
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={BarChart2} color={color} focused={focused} /> }}
      />
      <Tab.Screen
        name="News"
        component={NewsScreen}
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={Newspaper} color={color} focused={focused} /> }}
      />
      <Tab.Screen
        name="Compete"
        component={CompeteScreen}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Trophy} color={color} focused={focused} />,
          headerShown: false,
          tabBarBadge: hasCompeteDot ? '' : undefined,
          tabBarBadgeStyle: { minWidth: 8, height: 8, borderRadius: 4, fontSize: 0, top: 2, right: 2 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={User} color={color} focused={focused} />,
          tabBarBadge: hasProfileDot ? '' : undefined,
          tabBarBadgeStyle: { minWidth: 8, height: 8, borderRadius: 4, fontSize: 0, top: 2, right: 2 },
        }}
      />
    </Tab.Navigator>
  );
}
