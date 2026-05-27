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
import { Shield, X, ArrowUpRight, ArrowDownLeft, Lightbulb } from 'lucide-react-native';

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
  const isContest = state.activePortfolioId !== 'main';
  const tfOptions = isContest
    ? ['Live', '1H', '24H', '7D']
    : ['Live', '1H', '24H', '7D', '30D', 'MAX'];
  const [tf, setTf] = useState(isContest ? '1H' : '7D');
  // If the user switches to/from a contest, clamp the timeframe into the new list.
  React.useEffect(() => {
    if (!tfOptions.includes(tf)) setTf(tfOptions[tfOptions.length - 1]);
  }, [isContest]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Derive real portfolio history by walking trades chronologically. At each
  // trade we know cash, holdings, and the trade's own price for that symbol.
  // For other coins, use the last seen trade price for that symbol (or fall
  // back to the current state.coins price). Produces one snapshot per trade
  // plus a final current-state snapshot.
  const historySnapshots = React.useMemo(() => {
    const sorted = [...state.trades].sort((a, b) => a.timestamp - b.timestamp);
    let cash = startEquity;
    const holdings = new Map<string, { units: number; avgCost: number }>();
    const lastPrice = new Map<string, number>();
    const snaps: { t: number; v: number }[] = [{ t: sorted[0]?.timestamp ?? Date.now() - 1, v: startEquity }];

    for (const tr of sorted) {
      lastPrice.set(tr.symbol, tr.price);
      if (tr.side === 'buy') {
        cash -= tr.amount;
        const ex = holdings.get(tr.symbol);
        if (ex) {
          const u = ex.units + tr.units;
          holdings.set(tr.symbol, { units: u, avgCost: (ex.avgCost * ex.units + tr.amount) / u });
        } else {
          holdings.set(tr.symbol, { units: tr.units, avgCost: tr.price });
        }
      } else {
        cash += tr.amount;
        const ex = holdings.get(tr.symbol);
        if (ex) {
          const u = ex.units - tr.units;
          if (u <= 1e-6) holdings.delete(tr.symbol);
          else holdings.set(tr.symbol, { units: u, avgCost: ex.avgCost });
        }
      }
      let bankroll = cash;
      for (const [sym, h] of holdings) {
        const price = lastPrice.get(sym) ?? getCoin(sym)?.price ?? 0;
        bankroll += h.units * price;
      }
      snaps.push({ t: tr.timestamp, v: bankroll });
    }
    snaps.push({ t: Date.now(), v: totalEquity });
    return snaps;
  }, [state.trades, totalEquity, getCoin]);

  // Filter snapshots to the selected timeframe window. AreaChart wants a flat
  // number[]; we resample if too few/too many points.
  const TF_WINDOW_MS: Record<string, number> = {
    'Live': 15 * 60 * 1000,
    '1H':   60 * 60 * 1000,
    '24H':  24 * 60 * 60 * 1000,
    '7D':   7 * 24 * 60 * 60 * 1000,
    '30D':  30 * 24 * 60 * 60 * 1000,
    'MAX':  Number.MAX_SAFE_INTEGER,
  };
  const { chartData, chartTimestamps } = React.useMemo(() => {
    const cutoff = Date.now() - (TF_WINDOW_MS[tf] ?? TF_WINDOW_MS['7D']);
    const windowed = historySnapshots.filter(s => s.t >= cutoff);
    // Guarantee a starting anchor: if the first snapshot is after cutoff,
    // prepend the latest pre-cutoff value so the line starts inside the window.
    if (windowed.length > 0 && historySnapshots[0].t < cutoff) {
      const pre = historySnapshots.filter(s => s.t < cutoff).slice(-1)[0];
      if (pre) windowed.unshift({ t: cutoff, v: pre.v });
    }
    const series = windowed.length >= 2 ? windowed : historySnapshots;
    if (series.length >= 2) {
      return { chartData: series.map(s => s.v), chartTimestamps: series.map(s => s.t) };
    }
    return {
      chartData:       [startEquity, totalEquity],
      chartTimestamps: [Date.now() - (TF_WINDOW_MS[tf] ?? 0), Date.now()],
    };
  }, [historySnapshots, tf]);

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
    // Only re-fetch coin prices. Profile (cash, holdings, trades, joined
    // comps) is kept in sync by the UserProfile real-time subscription, so
    // re-dispatching LOAD_PROFILE here just causes a redundant merge that
    // can flash a stale bankroll until the next TICK_PRICES recomputes.
    try {
      const prices = await fetchPrices();
      dispatch({ type: 'UPDATE_PRICES', prices });
    } catch {
      // Silent — simulated tick keeps prices alive
    }
  };

  const handleHoldingTap = (symbol: string) => {
    if (symbol === 'USDC') return;
    dispatch({ type: 'SET_TRADE_SYMBOL', symbol });
    nav.navigate('Trade');
  };

  const handleRebalance = () => {
    const top5 = state.holdings.slice(0, 5);

    // Cold-start: no holdings yet → propose buying a balanced basket from cash.
    if (top5.length === 0) {
      const targetCoins = state.coins.filter(c => c.symbol !== 'USDC').slice(0, 5);
      if (targetCoins.length === 0 || state.cash < 50) {
        Alert.alert('Not enough cash', 'You need at least $50 cash to build a balanced portfolio.');
        return;
      }
      const investable = state.cash * 0.95;
      const perCoin    = investable / targetCoins.length;
      const lines: RebalanceLine[] = targetCoins.map(c => ({
        symbol:     c.symbol,
        side:       'buy',
        amount:     perCoin,
        currentPct: 0,
        targetPct:  Math.round(95 / targetCoins.length),
      }));
      setRebalanceLines(lines);
      setRebalanceTarget(perCoin);
      setRebalanceVisible(true);
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

  const activeContest = state.competitions.find(c => c.id === state.activePortfolioId);
  const eyebrowLabel = state.activePortfolioId === 'main' ? 'Main portfolio' : (activeContest?.name ?? 'Contest');

  const portfolioOptions: { id: string; label: string }[] = [
    { id: 'main', label: 'Main' },
    ...state.joinedTournamentIds.map(id => {
      const comp = state.competitions.find(c => c.id === id);
      return { id, label: comp?.name ?? 'Contest' };
    }),
  ];

  return (
    <ScreenShell
      eyebrow={eyebrowLabel}
      title={`$${totalEquity.toFixed(2)}`}
      onRefresh={handleRefresh}
      rightActions={
        <TouchableOpacity onPress={() => nav.navigate('Profile')}>
          <Avatar
            initials={state.user.handle.slice(0, 2).toUpperCase() || '??'}
            size="sm"
            uri={state.user.avatarUri}
            style={{ backgroundColor: state.user.avatarColor }}
          />
        </TouchableOpacity>
      }
    >
      {/* Portfolio selector — Main vs. each joined contest */}
      {portfolioOptions.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {portfolioOptions.map(opt => {
            const active = opt.id === state.activePortfolioId;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => dispatch({ type: 'SWITCH_PORTFOLIO', portfolioId: opt.id })}
                activeOpacity={0.75}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.brand : colors.hairline,
                  backgroundColor: active ? colors.brand : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: active ? colors.brandOn : colors.ink,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* P&L */}
      <Chip variant={pnlPositive ? 'up' : 'down'}>
        {pnlPositive ? '↑' : '↓'} {pnlPositive ? '+' : ''}${pnl.toFixed(2)} · {pnlPct.toFixed(2)}%
      </Chip>

      {/* Chart */}
      <View style={{ marginHorizontal: -20 }}>
        <AreaChart height={170} data={chartData} timestamps={chartTimestamps} down={!pnlPositive} />
      </View>

      <Segmented
        options={tfOptions}
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

      {/* Coach nudges */}
      {state.coachNudges.filter(n => !state.dismissedNudgeIds.includes(n.id)).slice(0, 2).map(nudge => {
        const nudgeColor = nudge.severity === 'warn' ? colors.warn : nudge.severity === 'info' ? colors.up : colors.brand;
        const nudgeBg = nudge.severity === 'warn' ? colors.warnSoft : nudge.severity === 'info' ? colors.upSoft : `${colors.brand}12`;
        return (
          <View key={nudge.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: nudgeBg, borderRadius: 14, padding: 14 }}>
            <Lightbulb color={nudgeColor} size={16} strokeWidth={1.75} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.ink, lineHeight: 18 }}>{nudge.message}</Text>
            <TouchableOpacity onPress={() => dispatch({ type: 'DISMISS_NUDGE', nudgeId: nudge.id })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X color={colors.ink3} size={14} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        );
      })}

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
