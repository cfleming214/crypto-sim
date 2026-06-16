import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar, CoinGlyph } from '../components/ui/Avatar';
import { LeagueBadge } from '../components/ui/LeagueBadge';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { fetchTraderByHandle, subscribeToTrader, type PublicTrader } from '../services/portfolioService';
import { presenceStatus } from '../services/presence';
import { useModeration } from '../hooks/useModeration';
import { MoreHorizontal, PieChart } from 'lucide-react-native';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// Read-only public profile for another trader, reached by tapping a name on a
// contest leaderboard (or anywhere a handle is shown). Mirrors the CopyTrade
// trader view but without the mirror machinery; offers a Copy-trade shortcut.
export function PublicProfileScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { openMenu } = useModeration();
  const handle = route.params?.handle as string | undefined;

  const [trader, setTrader] = useState<PublicTrader | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) { setLoading(false); return; }
    let unsub: () => void = () => {};
    fetchTraderByHandle(handle).then(t => {
      setTrader(t);
      setLoading(false);
      // Once resolved to a PublicProfile id, subscribe for live updates.
      if (t) subscribeToTrader(t.id, next => setTrader(next)).then(u => { unsub = u; });
    });
    return () => unsub();
  }, [handle]);

  const traderName = trader?.handle ?? handle ?? '—';
  const traderHandle = `@${traderName}`;

  if (loading) {
    return (
      <ScreenShell title="Loading…">
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </ScreenShell>
    );
  }

  // No PublicProfile for this handle (e.g. a bot, or a player who hasn't traded
  // enough to publish one). Show a minimal identity card rather than an error.
  if (!trader) {
    return (
      <ScreenShell eyebrow="Trader" title={traderHandle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar initials={traderName.slice(0, 2).toUpperCase()} size="lg" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>{traderName}</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>No public profile yet</Text>
          </View>
        </View>
        <Card variant="tinted">
          <Text style={{ fontSize: 13, color: colors.ink3 }}>
            This trader hasn't published a public profile. You'll see their stats here once they've traded enough.
          </Text>
        </Card>
      </ScreenShell>
    );
  }

  const allocation = [...(trader.allocation ?? [])].sort((a, b) => b.pct - a.pct).slice(0, 8);

  return (
    <ScreenShell
      eyebrow="Trader profile"
      title={traderHandle}
      rightActions={
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => openMenu(
            { owner: trader.owner, handle: trader.handle, context: 'trader_profile' },
            () => nav.goBack(),
          )}
        >
          <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar
          initials={traderName.slice(0, 2).toUpperCase()}
          size="lg"
          uri={trader.avatarUrl}
          status={presenceStatus(trader.lastActiveAt)}
          style={trader.avatarColor && !trader.avatarUrl ? { backgroundColor: trader.avatarColor } : undefined}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.ink }}>{traderName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {!!trader.league && <LeagueBadge league={trader.league} />}
            <Text style={{ fontSize: 12, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
              ${Math.round(trader.bankroll).toLocaleString()} bankroll
            </Text>
          </View>
        </View>
      </View>

      {/* Performance */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {[
          { k: 'All-time P&L', v: `${trader.pnlPct >= 0 ? '+' : ''}${trader.pnlPct.toFixed(1)}%`, type: trader.pnlPct >= 0 ? 'up' : 'down' },
          { k: 'Win rate',     v: trader.tradeCount > 0 ? `${trader.winRate.toFixed(0)}%` : '—', type: trader.winRate >= 50 ? 'up' : null },
          { k: 'Trades',       v: trader.tradeCount.toLocaleString(), type: null },
        ].map((row, i, arr) => (
          <View
            key={row.k}
            style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: colors.hairline }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{row.k}</Text>
            <Text style={{
              fontWeight: '700', fontSize: 15, marginTop: 2, fontVariant: ['tabular-nums'],
              color: row.type === 'up' ? colors.up : row.type === 'down' ? colors.down : colors.ink,
            }}>{row.v}</Text>
          </View>
        ))}
      </Card>

      {/* Equity curve */}
      <Card variant="noPad">
        <CardSection>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {traderHandle} equity
          </Text>
          <View style={{ marginTop: 10 }}>
            {trader.equityHistory.length >= 2 ? (
              <AreaChart height={120} data={trader.equityHistory} down={trader.pnlPct < 0} />
            ) : (
              <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>Not enough history yet.</Text>
              </View>
            )}
          </View>
        </CardSection>
      </Card>

      {/* Allocation */}
      <Card variant="noPad">
        <CardSection last>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PieChart color={colors.ink} size={16} strokeWidth={1.75} />
            <Text style={{ fontWeight: '700', color: colors.ink }}>{traderHandle}'s portfolio</Text>
          </View>
          {allocation.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 8 }}>
              Allocation isn't available for this trader yet.
            </Text>
          ) : (
            <View style={{ gap: 10, marginTop: 12 }}>
              {allocation.map(a => (
                <View key={a.symbol} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CoinGlyph symbol={a.symbol} size={20} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{a.pct.toFixed(1)}%</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2 }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, a.pct)}%`, backgroundColor: colors.brand }} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardSection>
      </Card>

      {/* Recent trades */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{traderHandle}'s recent trades</Text>
      {trader.recentTrades.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ fontSize: 13, color: colors.ink3 }}>No trades yet.</Text>
        </Card>
      ) : (
        <Card variant="noPad">
          {trader.recentTrades.map((t, i, arr) => (
            <CardSection key={`${t.t}-${i}`} last={i === arr.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CoinGlyph symbol={t.symbol} size={32} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{t.symbol}</Text>
                    <Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'], color: t.side === 'buy' ? colors.up : colors.down }}>
                      {t.side === 'buy' ? '+' : '−'}${t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.ink3, textTransform: 'capitalize' }}>
                      {t.side} · ${t.price.toLocaleString('en-US', { maximumFractionDigits: t.price < 0.01 ? 8 : 2 })}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>{relTime(t.t)}</Text>
                  </View>
                </View>
              </View>
            </CardSection>
          ))}
        </Card>
      )}

      {/* Copy-trade shortcut */}
      <Button variant="brand" onPress={() => nav.navigate('CopyTrade', { traderId: trader.id })}>
        Copy this trader
      </Button>
    </ScreenShell>
  );
}
