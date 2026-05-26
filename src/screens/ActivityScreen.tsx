import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { ArrowUp, ArrowDown, Shield, User } from 'lucide-react-native';

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

export function ActivityScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
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

      {state.trades.length === 0 ? (
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
        </>
      )}
    </ScreenShell>
  );
}
