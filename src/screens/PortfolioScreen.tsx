import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView, ActivityIndicator } from 'react-native';
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
import { computePortfolioHistory, type EquityPoint, type PortfolioHistoryResult } from '../services/portfolioHistory';
import { Shield, X, ArrowUpRight, ArrowDownLeft, Lightbulb } from 'lucide-react-native';

// Cache of reconstructed value series, keyed `${portfolioId}:${tf}:${tradesSig}`.
// Module-level so flipping timeframes (or returning to the tab) is instant; a
// new trade changes tradesSig and naturally invalidates the relevant entries.
const HISTORY_CACHE = new Map<string, PortfolioHistoryResult>();

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
            <Button testID="rebalance-confirm-btn" variant="brand" onPress={handleConfirm}>Rebalance now</Button>
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

  // Real historical portfolio value, reconstructed from the trade ledger × real
  // historical coin prices (src/services/portfolioHistory.ts) — NOT by valuing
  // past holdings at today's price. This keeps past points fixed when you trade
  // now and fills in periods the app was closed. Fetching per-coin history is
  // async, so it lives in state behind an effect rather than a useMemo.
  const TF_WINDOW_MS: Record<string, number> = {
    'Live': 15 * 60 * 1000,
    '1H':   60 * 60 * 1000,
    '24H':  24 * 60 * 60 * 1000,
    '7D':   7 * 24 * 60 * 60 * 1000,
    '30D':  30 * 24 * 60 * 60 * 1000,
    'MAX':  Number.MAX_SAFE_INTEGER,
  };

  const [history, setHistory] = useState<EquityPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPartial, setHistoryPartial] = useState(false);

  // Recompute only when the portfolio, timeframe, or trade ledger changes — NOT
  // on the 2s price tick (state.coins/bankroll churn constantly). The live right
  // edge is patched into chartData below without refetching. `state.cash`/
  // `holdings` only change via trades (ticks move prices, not units), so reading
  // them at fire time yields the correct reverse-replay baseline.
  const tradesSig = `${state.trades.length}:${state.trades[0]?.id ?? ''}`;
  React.useEffect(() => {
    const token = { cancelled: false };
    const key = `${state.activePortfolioId}:${tf}:${tradesSig}`;
    const cached = HISTORY_CACHE.get(key);
    if (cached) {
      setHistory(cached.points);
      setHistoryPartial(cached.partial);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    computePortfolioHistory(
      state.trades,
      { cash: state.cash, holdings: state.holdings },
      tf,
      {
        nowValue: state.bankroll,
        currentPrices: new Map(state.coins.map(c => [c.symbol, c.price])),
        createdAt: isContest ? undefined : state.user.createdAt,
        signal: token,
      },
    )
      .then(res => {
        if (token.cancelled) return;
        HISTORY_CACHE.set(key, res);
        setHistory(res.points);
        setHistoryPartial(res.partial);
        setHistoryLoading(false);
      })
      .catch(() => { if (!token.cancelled) setHistoryLoading(false); });
    return () => { token.cancelled = true; };
  }, [tf, state.activePortfolioId, tradesSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const { chartData, chartTimestamps } = React.useMemo(() => {
    if (history.length >= 2) {
      const vals = history.map(p => p.v);
      vals[vals.length - 1] = totalEquity; // live right edge — matches the header $
      return { chartData: vals, chartTimestamps: history.map(p => p.t) };
    }
    return {
      chartData:       [startEquity, totalEquity],
      chartTimestamps: [Date.now() - (TF_WINDOW_MS[tf] ?? 0), Date.now()],
    };
  }, [history, totalEquity, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  const holdingRows = state.holdings.map(h => {
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
  });
  // Cash is shown as its own "Available cash" line above the holdings list
  // (not a row in it), but still appears as a slice in the allocation donut.
  const cashPct = Math.round((state.cash / totalEquity) * 100);
  const cashDisplay = state.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    dispatch({ type: 'SET_TRADE_SYMBOL', symbol });
    nav.navigate('Trade');
  };

  const handleResetPortfolio = () => {
    Alert.alert(
      'Reset portfolio?',
      'This clears your holdings and trade history and starts you over with $10,000 cash and 0.01 BTC.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => dispatch({ type: 'RESET_DEMO' }) },
      ],
    );
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

    const holdingValues = top5.flatMap(h => {
      const coin = getCoin(h.symbol);
      if (!coin) return [];
      const currentValue = h.units * coin.price;
      return [{ symbol: h.symbol, currentValue, price: coin.price }];
    });
    if (holdingValues.length === 0) {
      Alert.alert('Cannot rebalance', 'Your holdings are not currently priced. Try again in a moment.');
      return;
    }
    const totalInvested = holdingValues.reduce((s, h) => s + h.currentValue, 0);
    const targetPerCoin = totalInvested / holdingValues.length;

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
                testID={`portfolio-selector-${opt.id}`}
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
        {historyLoading && history.length === 0 && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.ink3} />
          </View>
        )}
      </View>
      {historyPartial && (
        <Text style={{ fontSize: 10, color: colors.ink3, textAlign: 'center', marginTop: -6 }}>
          Some history estimated
        </Text>
      )}

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
          <Button testID="portfolio-rebalance-btn" variant="ghost" size="sm" style={{ flex: 1 }} onPress={handleRebalance}>Rebalance</Button>
          <Button testID="portfolio-stop-loss-btn" variant="brand" size="sm" style={{ flex: 1 }} onPress={() => setStopSheetVisible(true)}>Set stops</Button>
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
            <TouchableOpacity testID={`nudge-dismiss-${nudge.id}`} onPress={() => dispatch({ type: 'DISMISS_NUDGE', nudgeId: nudge.id })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X color={colors.ink3} size={14} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Available cash — shown above holdings, not as a row inside the list */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>Available cash</Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{cashPct}% of portfolio</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
            ${cashDisplay}
          </Text>
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
            segments={[
              ...holdingRows.map((h, i) => ({
                label: h.symbol,
                pct: h.pct,
                color: DONUT_COLORS[i % DONUT_COLORS.length],
              })),
              { label: 'Cash', pct: cashPct, color: '#94A3B8' },
            ]}
          />
        </Card>
      )}

      <Card variant="noPad">
        {holdingRows.length === 0 && (
          <CardSection last>
            <Text style={{ fontSize: 13, color: colors.ink3, textAlign: 'center', paddingVertical: 8 }}>
              No holdings yet — tap a coin in Markets to start trading.
            </Text>
          </CardSection>
        )}
        {holdingRows.map((h, i) => (
          <TouchableOpacity
            key={h.symbol}
            testID={`portfolio-holding-row-${h.symbol}`}
            onPress={() => handleHoldingTap(h.symbol)}
            activeOpacity={0.75}
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

      {!isContest && (
        <Button
          testID="portfolio-reset-btn"
          variant="ghost"
          size="sm"
          onPress={handleResetPortfolio}
          style={{ alignSelf: 'center' }}
        >
          Reset portfolio
        </Button>
      )}

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
