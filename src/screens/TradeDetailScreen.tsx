import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { useTheme } from '../theme/ThemeContext';
import { Check, Shield } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

const receipt = [
  ['Order ID',   'SIM-A82F1',   false],
  ['Type',       'Market buy',  false],
  ['Spent',      '$1,000.00',   false],
  ['Received',   '0.01558 BTC', false],
  ['Slippage',   '0.04%',       false],
  ['XP earned',  '+25 XP',      true],
];

export function TradeDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Success hero */}
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 16 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.upSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={colors.up} size={44} strokeWidth={2} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.up, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order filled</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 }}>Bought 0.01558 BTC</Text>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>at $64,210.48 average · just now</Text>
          </View>
        </View>

        {/* Receipt */}
        <Card style={{ gap: 8 }}>
          {receipt.map(([label, value, isUp], i) => (
            <View key={label as string}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', fontSize: 13, color: isUp ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
              </View>
              {i < receipt.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8 }} />}
            </View>
          ))}
        </Card>

        {/* Risk nudge */}
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Shield color={colors.warn} size={18} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Risk score 62 → 67</Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>Consider a 5% trailing stop to lock in gains.</Text>
          </View>
        </Card>

        {/* Footer */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={() => navigation.goBack()}>
            View portfolio
          </Button>
          <Button variant="brand" style={{ flex: 1 }} onPress={() => navigation.goBack()}>
            Trade more
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
