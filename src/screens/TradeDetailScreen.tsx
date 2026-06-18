import React from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { Check, Shield, AlertCircle } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function TradeDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { state } = useApp();
  const tradeId: string | undefined = route.params?.tradeId;
  const symbolHint: string | undefined = route.params?.symbol;

  // Prefer a direct id match. Falls back to the most recent trade for the
  // given symbol (useful when nav was triggered without a specific id).
  const trade =
    (tradeId && state.trades.find(t => t.id === tradeId)) ||
    (symbolHint && state.trades.find(t => t.symbol === symbolHint)) ||
    null;

  if (!trade) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 16 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle color={colors.ink3} size={44} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Trade not found</Text>
            <Text style={{ fontSize: 13, color: colors.ink3, textAlign: 'center', paddingHorizontal: 40 }}>
              This trade may have been removed. Go back to Activity to see your full trade history.
            </Text>
          </View>
          <Button variant="brand" onPress={() => navigation.goBack()}>Back</Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isBuy = trade.side === 'buy';
  const sideVerb = isBuy ? 'Bought' : 'Sold';
  const priceFmt = trade.price < 0.01 ? trade.price.toFixed(8) : trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const slippagePct = (trade.slippage * 100).toFixed(2);
  const unitsFmt = trade.units < 1 ? trade.units.toFixed(6) : trade.units.toFixed(4);

  const receipt: Array<[string, string, boolean]> = [
    ['Order ID',   trade.id, false],
    ['Type',       `Market ${trade.side}`, false],
    [isBuy ? 'Spent' : 'Received', `$${trade.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, false],
    [isBuy ? 'Received' : 'Sold',  `${unitsFmt} ${trade.symbol}`, false],
    ['Price',      `$${priceFmt}`, false],
    ['Slippage',   `${slippagePct}%`, false],
    ['XP earned',  `+${trade.xpEarned} XP`, true],
    ['Time',       relTime(trade.timestamp), false],
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Success hero */}
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 16 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: isBuy ? colors.upSoft : colors.downSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={isBuy ? colors.up : colors.down} size={44} strokeWidth={2} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: isBuy ? colors.up : colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order filled</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 }}>
              {sideVerb} {unitsFmt} {trade.symbol}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>at ${priceFmt} · {relTime(trade.timestamp)}</Text>
          </View>
        </View>

        {/* Receipt */}
        <Card style={{ gap: 8 }}>
          {receipt.map(([label, value, isUp], i) => (
            <View key={label}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', fontSize: 13, color: isUp ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
              </View>
              {i < receipt.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8 }} />}
            </View>
          ))}
        </Card>

        {/* Current risk score reflects the live state, not a synthetic delta */}
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Shield color={colors.warn} size={18} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>
              Current risk score: {state.riskScore}
            </Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
              {state.riskScore >= 80 ? 'Looking healthy. Keep diversifying.' :
               state.riskScore >= 50 ? 'Some concentration risk — consider stop-losses.' :
                                       'High concentration — set stop-losses to protect gains.'}
            </Text>
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
