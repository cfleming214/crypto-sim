import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { RiskMeter } from '../components/ui/RiskMeter';
import { CoinGlyph, Avatar } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { Shield } from 'lucide-react-native';

const holdings = [
  { symbol: 'BTC', name: 'Bitcoin',   value: '4,210.48', change: '+2.4%', down: false, pct: 39, units: '0.0656' },
  { symbol: 'ETH', name: 'Ethereum',  value: '3,180.12', change: '+1.1%', down: false, pct: 29, units: '1.0001' },
  { symbol: 'SOL', name: 'Solana',    value: '980.65',   change: '−0.8%', down: true,  pct: 18, units: '5.382' },
  { symbol: 'DOGE', name: 'Dogecoin', value: '312.40',   change: '+5.7%', down: false, pct: 8,  units: '1,952' },
  { symbol: 'USDC', name: 'Cash',     value: '1,163.67', change: '—',     down: false, pct: 11, units: '1,163.67' },
];

export function PortfolioScreen() {
  const { colors } = useTheme();
  const [tf, setTf] = useState('7D');
  const [view, setView] = useState('List');

  return (
    <ScreenShell
      eyebrow="Weekend Warriors · Day 4"
      title="$10,847.32"
      rightActions={
        <>
          <Avatar initials="JS" size="sm" brand />
        </>
      }
    >
      {/* P&L */}
      <Chip variant="up">↑ +$847.21 · 8.45%</Chip>

      {/* Chart */}
      <View style={{ marginHorizontal: -20 }}>
        <AreaChart height={170} />
      </View>

      <Segmented
        options={['1H', '1D', '7D', '30D', 'SEA', 'ALL']}
        value={tf}
        onChange={setTf}
        style={{ alignSelf: 'center' }}
      />

      {/* Risk health card */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Shield color={colors.warn} size={18} strokeWidth={1.75} />
            <Text style={{ fontWeight: '600', color: colors.ink }}>Risk health</Text>
          </View>
          <Chip variant="warn">Caution · 62</Chip>
        </View>
        <RiskMeter score={62} />
        <Text style={{ fontSize: 12, color: colors.ink3 }}>
          BTC concentration high · no stop-loss set · low cash buffer
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" style={{ flex: 1 }}>Rebalance</Button>
          <Button variant="brand" size="sm" style={{ flex: 1 }}>Set stops</Button>
        </View>
      </Card>

      {/* Holdings */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Holdings</Text>
        <Segmented options={['List', 'Allocation']} value={view} onChange={setView} />
      </View>

      <Card variant="noPad">
        {holdings.map((h, i) => (
          <CardSection key={h.symbol} last={i === holdings.length - 1}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CoinGlyph symbol={h.symbol} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{h.symbol}</Text>
                  <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${h.value}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>{h.units} {h.symbol}</Text>
                  <Text style={{ fontSize: 12, color: h.down ? colors.down : colors.up, fontVariant: ['tabular-nums'] }}>
                    {h.change} · {h.pct}%
                  </Text>
                </View>
              </View>
            </View>
          </CardSection>
        ))}
      </Card>
    </ScreenShell>
  );
}
