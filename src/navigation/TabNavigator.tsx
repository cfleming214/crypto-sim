import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { MarketsScreen } from '../screens/MarketsScreen';
import { TradeScreen } from '../screens/TradeScreen';
import { CompeteScreen } from '../screens/CompeteScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import {
  Home,
  BarChart2,
  ArrowLeftRight,
  Trophy,
  User,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          paddingBottom: 14,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink4,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      })}
    >
      <Tab.Screen
        name="Home"
        component={PortfolioScreen}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={22} strokeWidth={1.75} /> }}
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
        options={{ tabBarIcon: ({ color }) => <Trophy color={color} size={22} strokeWidth={1.75} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <User color={color} size={22} strokeWidth={1.75} /> }}
      />
    </Tab.Navigator>
  );
}
