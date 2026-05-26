import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { MarketsScreen } from '../screens/MarketsScreen';
import { TradeScreen } from '../screens/TradeScreen';
import { CompeteScreen } from '../screens/CompeteScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { Home, BarChart2, ArrowLeftRight, Trophy, User, Bell, Search } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

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
        options={{ tabBarIcon: ({ color }) => <Home color={color} size={22} strokeWidth={1.75} /> }}
      />
      <Tab.Screen
        name="Markets"
        component={MarketsScreen}
        options={{ tabBarIcon: ({ color }) => <BarChart2 color={color} size={22} strokeWidth={1.75} /> }}
      />
      <Tab.Screen
        name="Trade"
        component={TradeScreen}
        options={{ tabBarIcon: ({ color }) => <ArrowLeftRight color={color} size={22} strokeWidth={1.75} /> }}
      />
      <Tab.Screen
        name="Compete"
        component={CompeteScreen}
        options={{
          tabBarIcon: ({ color }) => <Trophy color={color} size={22} strokeWidth={1.75} />,
          headerShown: false,
          tabBarBadge: hasCompeteDot ? '' : undefined,
          tabBarBadgeStyle: { minWidth: 8, height: 8, borderRadius: 4, fontSize: 0, top: 2, right: 2 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => <User color={color} size={22} strokeWidth={1.75} />,
          tabBarBadge: hasProfileDot ? '' : undefined,
          tabBarBadgeStyle: { minWidth: 8, height: 8, borderRadius: 4, fontSize: 0, top: 2, right: 2 },
        }}
      />
    </Tab.Navigator>
  );
}
