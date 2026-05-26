import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { RiskMeter } from '../components/ui/RiskMeter';
import { CoinGlyph, Avatar } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { DonutChart } from '../components/charts/DonutChart';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { fetchPrices } from '../services/priceService';
import { loadProfile } from '../services/portfolioService';
import { Shield, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';

const STOP_OPTIONS = [5, 10, 15];

const DONUT_COLORS = ['#F7931A', '#627EEA', '#9945FF', '#BA9F33', '#2775CA', '#00D632'];

interface RebalanceLine {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  currentPct: number;
  targetPct: number;
}

function RebalanceSheet({ visible, onClose, lines, targetPerCoin, onConfirm }: {
  visible: boolean;
  onClose: () => void;
  lines: RebalanceLine[];
  targetPerCoin: number;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Rebalance</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              Equal weight · ${targetPerCoin.toFixed(0)} per coin
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}>
          {lines.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ color: colors.ink3 }}>Already balanced — each position within 5%</Text>
            </View>
          ) : lines.map(line => (
            <View
              key={line.symbol}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: colors.surface2,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <CoinGlyph symbol={line.symbol} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{line.symbol}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>
                    {line.currentPct.toFixed(0)}% → {line.targetPct.toFixed(0)}%
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: line.side === 'sell' ? colors.downSoft ?? `${colors.down}18` : colors.upSoft ?? `${colors.up}18`,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                }}>
                  {line.side === 'sell'
                    ? <ArrowUpRight color={colors.down} size={13} strokeWidth={2} />
                    : <ArrowDownLeft color={colors.up} size={13} strokeWidth={2} />}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: line.side === 'sell' ? colors.down : colors.up }}>
                    ${line.amount.toFixed(0)}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>
                  {line.side === 'sell' ? 'Sell' : 'Buy'}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {lines.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, textAlign: 'center' }}>
              {lines.length} trade{lines.length > 1 ? 's' : ''} will execute at current market price
            </Text>
            <Button variant="brand" onPress={handleConfirm}>Rebalance now</Button>
          </View>
        )}
        {lines.length === 0 && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <Button variant="ghost" onPress={onClose}>Close</Button>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function StopSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { state, dispatch, getCoin } = useApp();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Stop-loss orders</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Auto-sell if price drops by selected %</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}>
          {state.holdings.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ color: colors.ink3 }}>No holdings to protect</Text>
            </View>
          ) : state.holdings.map(h => {
            const coin = getCoin(h.symbol);
            const activePct = state.stopLosses[h.symbol] ?? 0;
            return (
              <Card key={h.symbol} variant="compact" style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <CoinGlyph symbol={h.symbol} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{h.symbol}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink3 }}>
                      {coin ? `$${(h.units * coin.price).toFixed(2)}` : '—'}
                    </Text>
                  </View>
                  {activePct > 0 && (
                    <Chip variant="warn" style={{ paddingVertical: 2, paddingHorizontal: 8 }}>−{activePct}%</Chip>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {STOP_OPTIONS.map(pct => (
                    <TouchableOpacity
                      key={pct}
                      style={{ flex: 1 }}
                      onPress={() => dispatch({ type: 'SET_STOP_LOSS', symbol: h.symbol, pct: activePct === pct ? 0 : pct })}
                    >
                      <View style={{
                        paddingVertical: 8,
                        borderRadius: 999,
                        alignItems: 'center',
                        backgroundColor: activePct === pct ? colors.warnSoft : colors.surface2,
                        borderWidth: 1,
                        borderColor: activePct === pct ? colors.warn : 'transparent',
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: activePct === pct ? colors.warn : colors.ink2 }}>
                          −{pct}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => dispatch({ type: 'SET_STOP_LOSS', symbol: h.symbol, pct: 0 })}
                    disabled={activePct === 0}
                  >
                    <View style={{
                      paddingVertical: 8,
                      borderRadius: 999,
                      alignItems: 'center',
                      backgroundColor: colors.surface2,
                      opacity: activePct === 0 ? 0.4 : 1,
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}>Clear</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Button variant="brand" onPress={onClose}>Done</Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function PortfolioScreen() {
  const { colors } = useTheme();
  const { state, getCoin, getHolding, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [tf, setTf] = useState('7D');
  const [view, setView] = useState('List');
  const [stopSheetVisible, setStopSheetVisible] = useState(false);
  const [rebalanceVisible, setRebalanceVisible] = useState(false);
  const [rebalanceLines, setRebalanceLines] = useState<RebalanceLine[]>([]);
  const [rebalanceTarget, setRebalanceTarget] = useState(0);

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
        stopPct: state.stopLosses[h.symbol] ?? 0,
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
      stopPct: 0,
    },
  ];

  const handleRefresh = async () => {
    try {
      const prices = await fetchPrices();
      dispatch({ type: 'UPDATE_PRICES', prices });
    } catch {}
    try {
      const profile = await loadProfile();
      if (profile) dispatch({ type: 'LOAD_PROFILE', profile });
    } catch {}
  };

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
      const currentValue = h.units * coin.price;
      return { symbol: h.symbol, currentValue, price: coin.price };
    });
    const totalInvested = holdingValues.reduce((s, h) => s + h.currentValue, 0);
    const targetPerCoin = totalInvested / top5.length;

    const lines: RebalanceLine[] = [];
    for (const h of holdingValues) {
      const diff = h.currentValue - targetPerCoin;
      if (diff > 5) {
        lines.push({
          symbol: h.symbol,
          side: 'sell',
          amount: diff,
          currentPct: Math.round((h.currentValue / totalEquity) * 100),
          targetPct: Math.round((targetPerCoin / totalEquity) * 100),
        });
      } else if (diff < -5) {
        lines.push({
          symbol: h.symbol,
          side: 'buy',
          amount: Math.abs(diff),
          currentPct: Math.round((h.currentValue / totalEquity) * 100),
          targetPct: Math.round((targetPerCoin / totalEquity) * 100),
        });
      }
    }

    setRebalanceLines(lines);
    setRebalanceTarget(targetPerCoin);
    setRebalanceVisible(true);
  };

  // Dynamic risk card
  const riskVariant = state.riskScore >= 80 ? 'up' : state.riskScore >= 50 ? 'warn' : 'down';
  const riskLabel = state.riskScore >= 80 ? 'Healthy' : state.riskScore >= 50 ? 'Caution' : 'High risk';
  const riskShieldColor = state.riskScore >= 80 ? colors.up : state.riskScore >= 50 ? colors.warn : colors.down;

  const riskWarnings: string[] = [];
  for (const h of state.holdings) {
    const coin = getCoin(h.symbol);
    if (coin && (h.units * coin.price) / totalEquity > 0.4) {
      riskWarnings.push(`${h.symbol} concentration high (${Math.round((h.units * coin.price) / totalEquity * 100)}%)`);
      break;
    }
  }
  if (state.holdings.length > 0 && state.cash / totalEquity < 0.1) riskWarnings.push('Low cash buffer');
  if (state.holdings.length > 0 && Object.keys(state.stopLosses).length === 0) riskWarnings.push('No stop-loss orders set');

  return (
    <ScreenShell
      eyebrow="Weekend Warriors · Day 4"
      title={`$${totalEquity.toFixed(2)}`}
      onRefresh={handleRefresh}
      rightActions={
        <TouchableOpacity onPress={() => nav.navigate('Profile')}>
          <Avatar initials={state.user.handle.slice(0, 2).toUpperCase() || '??'} size="sm" style={{ backgroundColor: state.user.avatarColor }} />
        </TouchableOpacity>
      }
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
            <Shield color={riskShieldColor} size={18} strokeWidth={1.75} />
            <Text style={{ fontWeight: '600', color: colors.ink }}>Risk health</Text>
          </View>
          <Chip variant={riskVariant}>{riskLabel} · {state.riskScore}</Chip>
        </View>
        <RiskMeter score={state.riskScore} />
        <Text style={{ fontSize: 12, color: colors.ink3 }}>
          {riskWarnings.length > 0 ? riskWarnings.join(' · ') : 'Portfolio risk looks good'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" style={{ flex: 1 }} onPress={handleRebalance}>Rebalance</Button>
          <Button variant="brand" size="sm" style={{ flex: 1 }} onPress={() => setStopSheetVisible(true)}>Set stops</Button>
        </View>
      </Card>

      {/* Holdings */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Holdings</Text>
        <Segmented options={['List', 'Allocation']} value={view} onChange={setView} />
      </View>

      {view === 'Allocation' && (
        <Card>
          <DonutChart
            size={180}
            centerLabel={`$${Math.round(totalEquity).toLocaleString()}`}
            centerSub="Total"
            segments={holdingRows.map((h, i) => ({
              label: h.symbol,
              pct: h.pct,
              color: DONUT_COLORS[i % DONUT_COLORS.length],
            }))}
          />
        </Card>
      )}

      <Card variant="noPad">
        {holdingRows.map((h, i) => (
          <TouchableOpacity
            key={h.symbol}
            onPress={() => handleHoldingTap(h.symbol)}
            activeOpacity={h.symbol === 'USDC' ? 1 : 0.75}
          >
            <CardSection last={i === holdingRows.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View>
                  <CoinGlyph symbol={h.symbol} />
                  {h.stopPct > 0 && (
                    <View style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 14, height: 14, borderRadius: 7,
                      backgroundColor: colors.warnSoft,
                      borderWidth: 1.5, borderColor: colors.surface,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Shield color={colors.warn} size={8} strokeWidth={2.5} />
                    </View>
                  )}
                </View>
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
          </TouchableOpacity>
        ))}
      </Card>

      <StopSheet visible={stopSheetVisible} onClose={() => setStopSheetVisible(false)} />
      <RebalanceSheet
        visible={rebalanceVisible}
        onClose={() => setRebalanceVisible(false)}
        lines={rebalanceLines}
        targetPerCoin={rebalanceTarget}
        onConfirm={() => dispatch({ type: 'REBALANCE' })}
      />
    </ScreenShell>
  );
}
