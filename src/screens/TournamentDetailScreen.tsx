import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { Bell, MoreHorizontal } from 'lucide-react-native';
import { Alert } from 'react-native';

const rules = [
  ['Starting bankroll', '$10,000'],
  ['Leverage', 'Off'],
  ['Eligible markets', 'BTC, ETH, SOL +18'],
  ['Entry fee', 'Free'],
  ['Final standing', 'Highest equity wins'],
];

const payouts = [
  ['#1', '$2,000'],
  ['#2', '$1,000'],
  ['#3', '$500'],
  ['#4–10', '$100'],
  ['#11–50', '$25'],
];

export function TournamentDetailScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();

  return (
    <ScreenShell
      eyebrow="Weekend Warriors"
      title="Live · 2h 14m left"
      rightActions={
        <>
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => Alert.alert('Alerts', 'You will be notified when the tournament ends and when your rank changes significantly.', [{ text: 'OK' }])}
          >
            <Bell color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => Alert.alert('Share Tournament', 'Share this tournament with friends to invite them to compete!', [{ text: 'Close' }])}
          >
            <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
        </>
      }
    >
      {/* Stats row */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[['Prize pool', '$5,000'], ['Players', '1,284'], ['Your rank', '#47']].map(([label, value], i) => (
          <View
            key={label}
            style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{value}</Text>
          </View>
        ))}
      </Card>

      {/* Equity chart */}
      <Card variant="noPad">
        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Equity since start</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 2, backgroundColor: colors.ink }} />
                  <Text style={{ fontSize: 11 }}>You +8.4%</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 2, backgroundColor: colors.up }} />
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>Leader +52%</Text>
                </View>
              </View>
            </View>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}>$10,847</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <AreaChart height={110} />
          </View>
        </CardSection>
      </Card>

      {/* Rules */}
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Rules</Text>
        {rules.map(([k, v], i) => (
          <View key={k}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>{k}</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{v}</Text>
            </View>
            {i < rules.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8, opacity: 0.6 }} />}
          </View>
        ))}
      </Card>

      {/* Payouts */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Payouts</Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Top 50 paid</Text>
        </View>
        {payouts.map(([rank, amount]) => (
          <View key={rank} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <Text style={{ fontSize: 13, color: colors.ink }}>{rank}</Text>
            <Text style={{ fontWeight: '700', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>{amount}</Text>
          </View>
        ))}
      </Card>

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="ghost" style={{ flex: 1 }} onPress={() => nav.navigate('League')}>Leaderboard</Button>
        <Button variant="brand" style={{ flex: 1 }} onPress={() => nav.navigate('MainTabs', { screen: 'Trade' })}>Trade now</Button>
      </View>
    </ScreenShell>
  );
}
