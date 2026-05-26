import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Chip } from '../components/ui/Chip';
import { CoinGlyph } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { ArrowUp, ArrowDown, Shield, User, Flame, Clock } from 'lucide-react-native';

function TradeIcon({ side, type }: { side: 'buy' | 'sell'; type?: string }) {
  const { colors } = useTheme();
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


const earnings = [
  { label: 'Tournament prize — Quick Sprint',  amount: '+$0',   time: '3 days ago', type: 'neutral' },
  { label: 'Referral bonus',                   amount: '+$5',   time: '1 week ago', type: 'up' },
  { label: 'Season 2 — Platinum I finish',     amount: '+$420', time: 'Last season', type: 'up' },
];

export function ActivityScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('Trades');

  const today = state.trades.filter(t => Date.now() - t.timestamp < 24 * 60 * 60 * 1000);
  const earlier = state.trades.filter(t => Date.now() - t.timestamp >= 24 * 60 * 60 * 1000);
  const totalPnl = state.trades.reduce((sum, t) => sum + (t.side === 'sell' ? t.amount - t.units * t.price : 0), 0);

  return (
    <ScreenShell title="Activity">
      <Segmented options={['Trades', 'Orders', 'Earnings', 'XP log']} value={tab} onChange={setTab} variant="tabs" />

      {/* Summary */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          ['7D P&L', `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, totalPnl >= 0 ? 'up' : 'down'],
          ['Trades', String(state.trades.length), null],
          ['Win rate', '71%', 'up'],
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
                    <CardSection key={t.id} last={i === today.length - 1}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <TradeIcon side={t.side} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: '600', color: colors.ink }}>{t.side === 'buy' ? 'Bought' : 'Sold'} {t.symbol}</Text>
                            <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${t.amount.toFixed(2)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={{ fontSize: 12, color: colors.ink3 }}>
                              {t.units.toFixed(4)} {t.symbol} · {new Date(t.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.up, fontVariant: ['tabular-nums'] }}>+{t.xpEarned} XP</Text>
                          </View>
                        </View>
                      </View>
                    </CardSection>
                  ))}
                </Card>
              </>
            )}
            {earlier.length > 0 && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Earlier</Text>
                <Card variant="noPad">
                  {earlier.map((t, i) => (
                    <CardSection key={t.id} last={i === earlier.length - 1}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <TradeIcon side={t.side} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: '600', color: colors.ink }}>{t.side === 'buy' ? 'Bought' : 'Sold'} {t.symbol}</Text>
                            <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${t.amount.toFixed(2)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={{ fontSize: 12, color: colors.ink3 }}>
                              {t.units.toFixed(4)} {t.symbol} · {new Date(t.timestamp).toLocaleDateString()}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.up, fontVariant: ['tabular-nums'] }}>+{t.xpEarned} XP</Text>
                          </View>
                        </View>
                      </View>
                    </CardSection>
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
        <Card variant="noPad">
          {earnings.map((e, i) => (
            <CardSection key={e.label} last={i === earnings.length - 1}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{e.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{e.time}</Text>
                </View>
                <Text style={{ fontWeight: '700', color: e.type === 'up' ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>
                  {e.amount}
                </Text>
              </View>
            </CardSection>
          ))}
        </Card>
      )}

      {tab === 'XP log' && (() => {
        const xpEvents: { Icon: React.ComponentType<any>; label: string; xp: string; time: string }[] = [];
        if (state.user.streak >= 1) {
          xpEvents.push({ Icon: Flame, label: `${state.user.streak}-day streak bonus`, xp: '+50 XP', time: 'Today · 12:00 AM' });
        }
        for (const t of state.trades) {
          const label = t.side === 'buy' ? `Bought ${t.symbol}` : `Sold ${t.symbol}`;
          const Icon = t.side === 'buy' ? ArrowUp : ArrowDown;
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
