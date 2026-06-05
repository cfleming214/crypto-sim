import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Chip } from '../components/ui/Chip';
import { CoinGlyph } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { ArrowUp, ArrowDown, Shield, User, Clock, Gift } from 'lucide-react-native';

// A reward/cash-injection event (e.g. daily-reward bonus) is recorded as a
// sentinel trade with symbol 'USD' / kind 'reward' — not a coin trade.
const isReward = (t: { symbol: string; kind?: string }) => t.kind === 'reward' || t.symbol === 'USD';

function TradeIcon({ side, type }: { side: 'buy' | 'sell'; type?: string }) {
  const { colors } = useTheme();
  if (type === 'reward') return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.upSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Gift color={colors.up} size={18} strokeWidth={1.75} />
    </View>
  );
  if (type === 'stop') return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Shield color={colors.warn} size={18} strokeWidth={1.75} />
    </View>
  );
  if (type === 'copy') return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <User color={colors.ink2} size={18} strokeWidth={1.75} />
    </View>
  );
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: side === 'buy' ? colors.upSoft : colors.downSoft, alignItems: 'center', justifyContent: 'center' }}>
      {side === 'buy'
        ? <ArrowUp color={colors.up} size={18} strokeWidth={1.75} />
        : <ArrowDown color={colors.down} size={18} strokeWidth={1.75} />}
    </View>
  );
}


export function ActivityScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [tab, setTab] = useState('Trades');

  const today = state.trades.filter(t => Date.now() - t.timestamp < 24 * 60 * 60 * 1000);
  const earlier = state.trades.filter(t => Date.now() - t.timestamp >= 24 * 60 * 60 * 1000);

  // 7D P&L: sell proceeds minus buy costs in last 7 days
  const week7 = state.trades.filter(t => Date.now() - t.timestamp < 7 * 86400000);
  const weekSellProceeds = week7.filter(t => t.side === 'sell' && !isReward(t)).reduce((s, t) => s + t.amount, 0);
  // Exclude reward cash-injections — a bonus isn't a buy cost, so counting it
  // would understate the week's P&L.
  const weekBuyCost = week7.filter(t => t.side === 'buy' && !isReward(t)).reduce((s, t) => s + t.amount, 0);
  const totalPnl = weekSellProceeds - weekBuyCost;

  // Win rate: sell trades where slippage is positive (proxy for profitable exit)
  const allSells = state.trades.filter(t => t.side === 'sell');
  const wins = allSells.filter(t => {
    // Prefer the realized P&L recorded at sell time (exact); fall back to the
    // old heuristic for legacy rows that predate realizedPnl.
    if (typeof t.realizedPnl === 'number') return t.realizedPnl > 0;
    const h = state.holdings.find(x => x.symbol === t.symbol);
    return h ? t.price > h.avgCost : t.slippage >= 0;
  });
  const winRate = allSells.length > 0 ? Math.round((wins.length / allSells.length) * 100) : 0;

  return (
    <ScreenShell title="Activity">
      <Segmented options={['Trades', 'Orders', 'Earnings', 'XP log']} value={tab} onChange={setTab} variant="tabs" />

      {/* Summary */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          ['7D P&L', `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, totalPnl >= 0 ? 'up' : 'down'],
          ['Trades', String(state.trades.length), null],
          ['Win rate', `${winRate}%`, winRate >= 50 ? 'up' : 'down'],
        ].map(([k, v, c], i) => (
          <View key={k} style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
            <Text style={{ fontWeight: '700', fontSize: 15, color: c === 'up' ? colors.up : c === 'down' ? colors.down : colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </Card>

      {tab === 'Trades' && (
        state.trades.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Text style={{ fontSize: 16, color: colors.ink3 }}>No trades yet</Text>
            <Text style={{ fontSize: 13, color: colors.ink4 }}>Head to the Trade tab to make your first trade</Text>
          </View>
        ) : (
          <>
            {today.length > 0 && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Today</Text>
                <Card variant="noPad">
                  {today.map((t, i) => (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.75}
                      onPress={() => nav.navigate('TradeDetail', { tradeId: t.id })}
                    >
                      <CardSection last={i === today.length - 1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TradeIcon side={t.side} type={isReward(t) ? 'reward' : undefined} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontWeight: '600', color: colors.ink }}>{isReward(t) ? 'Daily reward' : `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}`}</Text>
                              <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${t.amount.toFixed(2)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              <Text style={{ fontSize: 12, color: colors.ink3 }}>
                                {isReward(t) ? 'Bonus cash' : `${t.units.toFixed(4)} ${t.symbol}`} · {new Date(t.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.up, fontVariant: ['tabular-nums'] }}>+{t.xpEarned} XP</Text>
                            </View>
                          </View>
                        </View>
                      </CardSection>
                    </TouchableOpacity>
                  ))}
                </Card>
              </>
            )}
            {earlier.length > 0 && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Earlier</Text>
                <Card variant="noPad">
                  {earlier.map((t, i) => (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.75}
                      onPress={() => nav.navigate('TradeDetail', { tradeId: t.id })}
                    >
                      <CardSection last={i === earlier.length - 1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TradeIcon side={t.side} type={isReward(t) ? 'reward' : undefined} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontWeight: '600', color: colors.ink }}>{isReward(t) ? 'Daily reward' : `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}`}</Text>
                              <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${t.amount.toFixed(2)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              <Text style={{ fontSize: 12, color: colors.ink3 }}>
                                {isReward(t) ? 'Bonus cash' : `${t.units.toFixed(4)} ${t.symbol}`} · {new Date(t.timestamp).toLocaleDateString()}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.up, fontVariant: ['tabular-nums'] }}>+{t.xpEarned} XP</Text>
                            </View>
                          </View>
                        </View>
                      </CardSection>
                    </TouchableOpacity>
                  ))}
                </Card>
              </>
            )}
          </>
        )
      )}

      {tab === 'Orders' && (
        state.pendingOrders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Text style={{ fontSize: 16, color: colors.ink3 }}>No open orders</Text>
            <Text style={{ fontSize: 13, color: colors.ink4 }}>Limit orders placed in Trade will appear here</Text>
          </View>
        ) : (
          <Card variant="noPad">
            {state.pendingOrders.map((order, i) => (
              <CardSection key={order.id} last={i === state.pendingOrders.length - 1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Clock color={colors.ink2} size={18} strokeWidth={1.75} />
                  </View>
                  <CoinGlyph symbol={order.symbol} size={28} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '600', color: colors.ink }}>
                        {order.side === 'buy' ? 'Buy' : 'Sell'} {order.symbol}
                      </Text>
                      <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                        ${order.amount.toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ fontSize: 12, color: colors.ink3 }}>
                        Limit @ ${order.limitPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </Text>
                      <TouchableOpacity onPress={() => {
                        Alert.alert('Cancel order?', `Cancel ${order.side} ${order.symbol} limit @ $${order.limitPrice}?`, [
                          { text: 'Keep', style: 'cancel' },
                          { text: 'Cancel order', style: 'destructive', onPress: () => dispatch({ type: 'CANCEL_LIMIT_ORDER', orderId: order.id }) },
                        ]);
                      }}>
                        <Text style={{ fontSize: 12, color: colors.down }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </CardSection>
            ))}
          </Card>
        )
      )}

      {tab === 'Earnings' && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 16, color: colors.ink3 }}>No earnings yet</Text>
          <Text style={{ fontSize: 13, color: colors.ink4, textAlign: 'center', paddingHorizontal: 40 }}>
            Finish a contest in the prize positions to see your payouts here.
          </Text>
        </View>
      )}

      {tab === 'XP log' && (() => {
        const xpEvents: { Icon: React.ComponentType<any>; label: string; xp: string; time: string }[] = [];
        for (const t of state.trades) {
          const reward = isReward(t);
          const label = reward
            ? 'Daily reward'
            : t.side === 'buy' ? `Bought ${t.symbol}` : `Sold ${t.symbol}`;
          const Icon = reward ? Gift : t.side === 'buy' ? ArrowUp : ArrowDown;
          const d = new Date(t.timestamp);
          const isToday = Date.now() - t.timestamp < 24 * 60 * 60 * 1000;
          const time = isToday
            ? `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : d.toLocaleDateString();
          xpEvents.push({ Icon, label, xp: `+${t.xpEarned} XP`, time });
        }
        if (xpEvents.length === 0) {
          return (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
              <Text style={{ fontSize: 16, color: colors.ink3 }}>No XP events yet</Text>
              <Text style={{ fontSize: 13, color: colors.ink4 }}>Make trades and keep your streak to earn XP</Text>
            </View>
          );
        }
        return (
          <Card variant="noPad">
            {xpEvents.map(({ Icon, label, xp, time }, i) => (
              <CardSection key={`${label}-${i}`} last={i === xpEvents.length - 1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon color={colors.ink2} size={18} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{label}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{time}</Text>
                  </View>
                  <Chip variant="up" style={{ paddingVertical: 2 }}>{xp}</Chip>
                </View>
              </CardSection>
            ))}
          </Card>
        );
      })()}
    </ScreenShell>
  );
}
