import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { RiskMeter } from '../components/ui/RiskMeter';
import { CoinGlyph, Avatar } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { Shield } from 'lucide-react-native';

export function PortfolioScreen() {
  const { colors } = useTheme();
  const { state, getCoin, getHolding, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [tf, setTf] = useState('7D');
  const [view, setView] = useState('List');

  const totalEquity = state.bankroll;
  const startEquity = 10000;
  const pnl = totalEquity - startEquity;
  const pnlPct = (pnl / startEquity) * 100;
  const pnlPositive = pnl >= 0;

  const holdingRows = [
    ...state.holdings.map(h => {
      const coin = getCoin(h.symbol);
      const data = getHolding(h.symbol);
      const pct = data ? (data.value / totalEquity) * 100 : 0;
      return {
        symbol: h.symbol,
        name: coin?.name ?? h.symbol,
        value: data?.value.toFixed(2) ?? '0.00',
        change: data ? `${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(1)}%` : '—',
        down: (data?.pnlPct ?? 0) < 0,
        pct: Math.round(pct),
        units: h.units < 1 ? h.units.toFixed(4) : h.units.toFixed(2),
      };
    }),
    {
      symbol: 'USDC',
      name: 'Cash',
      value: state.cash.toFixed(2),
      change: '—',
      down: false,
      pct: Math.round((state.cash / totalEquity) * 100),
      units: state.cash.toFixed(2),
    },
  ];

  const handleHoldingTap = (symbol: string) => {
    if (symbol === 'USDC') return;
    dispatch({ type: 'SET_TRADE_SYMBOL', symbol });
    nav.navigate('Trade');
  };

  const handleRebalance = () => {
    const top5 = state.holdings.slice(0, 5);
    if (top5.length === 0) {
      Alert.alert('Nothing to rebalance', 'Add some holdings first.');
      return;
    }

    const holdingValues = top5.map(h => {
      const coin = getCoin(h.symbol)!;
      return { symbol: h.symbol, currentValue: h.units * coin.price, price: coin.price };
    });
    const totalInvested = holdingValues.reduce((s, h) => s + h.currentValue, 0);
    const targetPerCoin = totalInvested / top5.length;

    const lines: string[] = [];
    for (const h of holdingValues) {
      const diff = h.currentValue - targetPerCoin;
      if (diff > 5)  lines.push(`Sell $${diff.toFixed(0)} of ${h.symbol}`);
      if (diff < -5) lines.push(`Buy $${Math.abs(diff).toFixed(0)} of ${h.symbol}`);
    }

    if (lines.length === 0) {
      Alert.alert('Already balanced', 'Each position is within 5% of equal weight.');
      return;
    }

    Alert.alert(
      'Rebalance to Equal Weight',
      `Target: 20% per coin ($${targetPerCoin.toFixed(0)} each)\n\n${lines.join('\n')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rebalance', onPress: () => dispatch({ type: 'REBALANCE' }) },
      ],
    );
  };

  const handleSetStops = () => {
    Alert.alert(
      'Set Stop-Loss',
      'Trailing stops automatically sell a position if it falls by a set percentage, locking in gains.\n\nExample: Set a 5% trailing stop on BTC to sell if price drops 5% from its peak.\n\nStop-loss orders are coming in Season 4!',
      [{ text: 'Got it' }],
    );
  };

  return (
    <ScreenShell
      eyebrow="Weekend Warriors · Day 4"
      title={`$${totalEquity.toFixed(2)}`}
      rightActions={<Avatar initials={state.user.handle.slice(0, 2).toUpperCase()} size="sm" brand />}
    >
      {/* P&L */}
      <Chip variant={pnlPositive ? 'up' : 'down'}>
        {pnlPositive ? '↑' : '↓'} {pnlPositive ? '+' : ''}${pnl.toFixed(2)} · {pnlPct.toFixed(2)}%
      </Chip>

      {/* Chart */}
      <View style={{ marginHorizontal: -20 }}>
        <AreaChart height={170} timeframe={tf} baseValue={totalEquity} />
      </View>

      <Segmented
        options={['1H', '1D', '7D', '30D', 'SEA', 'ALL']}
        value={tf}
        onChange={setTf}
        style={{ alignSelf: 'center' }}
      />

      {/* Risk health */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Shield color={colors.warn} size={18} strokeWidth={1.75} />
            <Text style={{ fontWeight: '600', color: colors.ink }}>Risk health</Text>
          </View>
          <Chip variant="warn">Caution · {state.riskScore}</Chip>
        </View>
        <RiskMeter score={state.riskScore} />
        <Text style={{ fontSize: 12, color: colors.ink3 }}>
          BTC concentration high · no stop-loss set · low cash buffer
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" style={{ flex: 1 }} onPress={handleRebalance}>Rebalance</Button>
          <Button variant="brand" size="sm" style={{ flex: 1 }} onPress={handleSetStops}>Set stops</Button>
        </View>
      </Card>

      {/* Holdings */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Holdings</Text>
        <Segmented options={['List', 'Allocation']} value={view} onChange={setView} />
      </View>

      <Card variant="noPad">
        {holdingRows.map((h, i) => (
          <TouchableOpacity
            key={h.symbol}
            onPress={() => handleHoldingTap(h.symbol)}
            activeOpacity={h.symbol === 'USDC' ? 1 : 0.75}
          >
            <CardSection last={i === holdingRows.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CoinGlyph symbol={h.symbol} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{h.symbol}</Text>
                    <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${h.value}</Text>
                  </View>
                  {view === 'List' ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ fontSize: 12, color: colors.ink3 }}>{h.units} {h.symbol}</Text>
                      <Text style={{ fontSize: 12, color: h.down ? colors.down : colors.up, fontVariant: ['tabular-nums'] }}>
                        {h.change} · {h.pct}%
                      </Text>
                    </View>
                  ) : (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      <View style={{ height: 4, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${h.pct}%`, backgroundColor: h.down ? colors.down : colors.brand, borderRadius: 999 }} />
                      </View>
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>{h.pct}% of portfolio</Text>
                    </View>
                  )}
                </View>
              </View>
            </CardSection>
          </TouchableOpacity>
        ))}
      </Card>
    </ScreenShell>
  );
}
