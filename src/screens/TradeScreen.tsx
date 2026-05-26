import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { CandleChart } from '../components/charts/CandleChart';
import { useTheme } from '../theme/ThemeContext';
import { Star, MoreHorizontal, Shield } from 'lucide-react-native';

export function TradeScreen() {
  const { colors } = useTheme();
  const [tf, setTf] = useState('5M');
  const [symbol] = useState('BTC');

  return (
    <ScreenShell
      eyebrow="Trade"
      title={`${symbol} / USD`}
      scrollable={false}
      style={{ flex: 1 }}
      rightActions={
        <>
          <TouchableOpacity style={{ padding: 8 }}>
            <Star color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 8 }}>
            <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
        </>
      }
    >
      <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
        {/* Price block */}
        <View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.7 }}>
            $64,210.48
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Chip variant="up">↑ +$1,510.20 · 2.41%</Chip>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>24h</Text>
          </View>
        </View>

        {/* Chart */}
        <View style={{ marginHorizontal: -20 }}>
          <CandleChart height={220} />
        </View>

        {/* Timeframe + Indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Segmented options={['1M', '5M', '1H', '1D', '1W']} value={tf} onChange={setTf} />
          <Button variant="ghost" size="sm">Indicators</Button>
        </View>

        {/* Stats grid */}
        <Card variant="compact" style={{ display: 'flex' } as any}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {[
              ['24h High', '$64,890'],
              ['24h Low', '$62,400'],
              ['Volume', '$1.24B'],
              ['Mkt Cap', '$1.26T'],
              ['RSI 14', '64.2'],
              ['Your pos.', '+$320'],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '30%' }}>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', color: label === 'Your pos.' ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Risk impact */}
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Shield color={colors.warn} size={16} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 12, color: colors.ink }}>
              A $1,000 buy raises your risk score 62 → 67
            </Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
              BTC would be 43% of portfolio · still within bracket limits
            </Text>
          </View>
        </Card>

        {/* Sticky buy/sell */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
          <Button variant="down" style={{ flex: 1 }}>Sell</Button>
          <Button variant="up" style={{ flex: 1 }}>Buy</Button>
        </View>
      </View>
    </ScreenShell>
  );
}
