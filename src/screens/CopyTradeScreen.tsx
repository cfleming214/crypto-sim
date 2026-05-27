import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { CoinGlyph } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { fetchTrader, subscribeToTrader, createOrUpdateMirror, pauseMirror, type PublicTrader } from '../services/portfolioService';
import { MoreHorizontal, Pause, X } from 'lucide-react-native';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function EditMirrorModal({ visible, allocation, onSave, onClose }: {
  visible: boolean; allocation: number; onSave: (a: number) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const { state } = useApp();
  const [alloc, setAlloc] = useState(String(allocation));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Mirror settings</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 20, paddingBottom: 40 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Allocation (USD)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontSize: 16, color: colors.ink3 }}>$</Text>
              <TextInput
                value={alloc}
                onChangeText={setAlloc}
                keyboardType="number-pad"
                style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.ink, marginLeft: 4 }}
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>
              Available: ${state.cash.toFixed(2)} cash
            </Text>
          </View>

          {[
            { label: 'Max single position', value: '20%', note: 'of your allocation per trade' },
          ].map(row => (
            <View key={row.label} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{row.label}</Text>
                <Text style={{ fontWeight: '600', color: colors.ink3 }}>{row.value}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>{row.note}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Button variant="brand" onPress={() => { onSave(parseFloat(alloc) || allocation); onClose(); }}>
            Save changes
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function CopyTradeScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const traderId = route.params?.traderId as string | undefined;

  const [trader, setTrader] = useState<PublicTrader | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [allocation, setAllocation] = useState(2000);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!traderId) { setLoading(false); return; }
    fetchTrader(traderId).then(t => {
      setTrader(t);
      setLoading(false);
    });
    // Live update this trader's row as they trade.
    let unsub: () => void = () => {};
    subscribeToTrader(traderId, t => setTrader(t)).then(u => { unsub = u; });
    return () => unsub();
  }, [traderId]);

  const pnlPct = ((state.bankroll - 10000) / 10000) * 100;
  const traderHandle = trader ? `@${trader.handle}` : '@trader';
  const traderName   = trader?.handle ?? '—';

  // Derive "mirrored positions" from the user's holdings intersected with the
  // symbols the trader has actually traded recently. Falls back to all your
  // holdings until the trader's recentTrades feed has at least one entry.
  const traderSymbols = new Set((trader?.recentTrades ?? []).map(t => t.symbol));
  const mirroredHoldings = traderSymbols.size > 0
    ? state.holdings.filter(h => traderSymbols.has(h.symbol))
    : [];

  const handleTogglePause = async () => {
    const next = !paused;
    setPaused(next);
    if (trader) {
      if (next) await pauseMirror(trader.owner);
      else await createOrUpdateMirror(trader.owner, allocation);
    }
    Alert.alert(
      next ? 'Copy trading paused' : 'Copy trading resumed',
      next
        ? `${traderHandle}'s new trades will not be mirrored until you resume.`
        : `You are now mirroring ${traderHandle} with $${allocation.toLocaleString()}.`,
      [{ text: 'OK' }],
    );
  };

  const handleSaveAllocation = async (newAlloc: number) => {
    setAllocation(newAlloc);
    if (trader) await createOrUpdateMirror(trader.owner, newAlloc);
  };

  if (loading) {
    return (
      <ScreenShell title="Loading…">
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </ScreenShell>
    );
  }

  if (!trader) {
    return (
      <ScreenShell title="Trader not found">
        <Card variant="tinted">
          <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 4 }}>
            Couldn't load this trader
          </Text>
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            They may have removed their public profile. Go back to Top traders and pick another.
          </Text>
        </Card>
      </ScreenShell>
    );
  }

  return (
    <>
      <ScreenShell
        eyebrow="Copy trade"
        title={traderHandle}
        rightActions={
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => Alert.alert('More options', 'Block trader · Report · Share profile', [{ text: 'Close' }])}
          >
            <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
          </TouchableOpacity>
        }
      >
        {/* Profile head */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar
            initials={traderName.slice(0, 2).toUpperCase()}
            size="lg"
            uri={trader.avatarUrl}
            style={trader.avatarColor && !trader.avatarUrl ? { backgroundColor: trader.avatarColor } : undefined}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>{traderName}</Text>
              <Chip variant="up">{trader.league}</Chip>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              {trader.tradeCount} trades · {trader.winRate.toFixed(0)}% win rate · ${Math.round(trader.bankroll).toLocaleString()} bankroll
            </Text>
          </View>
        </View>

        {/* Status banner when paused */}
        {paused && (
          <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pause color={colors.warn} size={16} strokeWidth={1.75} />
            <Text style={{ fontWeight: '600', color: colors.ink, flex: 1 }}>
              Copy trading paused — new trades won't be mirrored
            </Text>
          </Card>
        )}

        {/* Performance — derived from PublicProfile data */}
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

        {/* Trader equity curve */}
        <Card variant="noPad">
          <CardSection>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {traderHandle} equity
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: colors.ink }}>
                {trader.equityHistory.length > 1
                  ? `${trader.equityHistory.length} hourly snapshots`
                  : 'Not enough history yet'}
              </Text>
              <Text style={{ fontSize: 11, color: trader.pnlPct >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                {trader.pnlPct >= 0 ? '+' : ''}{trader.pnlPct.toFixed(1)}%
              </Text>
            </View>
            <View style={{ marginTop: 10 }}>
              {trader.equityHistory.length >= 2 ? (
                <AreaChart height={120} data={trader.equityHistory} down={trader.pnlPct < 0} />
              ) : (
                <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>
                    Trader hasn't accumulated enough trades for a chart yet.
                  </Text>
                </View>
              )}
            </View>
          </CardSection>
        </Card>

        {/* Mirror settings */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Mirror settings</Text>
            <Button variant="ghost" size="sm" onPress={() => setEditOpen(true)}>Edit</Button>
          </View>
          {[
            ['Allocation', `$${allocation.toLocaleString()} / $${state.bankroll.toFixed(0)}`],
            ['Max single position', '20%'],
          ].map(([label, value], i, arr) => (
            <View key={label}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                  {value}
                </Text>
              </View>
              {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8, marginBottom: 8 }} />}
            </View>
          ))}
        </Card>

        {/* Recent activity */}
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{traderHandle}'s recent trades</Text>
        {trader.recentTrades.length === 0 ? (
          <Card variant="tinted">
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              No trades yet. Once {traderHandle} places a trade, it'll show up here.
            </Text>
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

        {/* Mirrored positions */}
        {mirroredHoldings.length > 0 && (
          <>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Your mirrored positions</Text>
            <Card variant="noPad">
              {mirroredHoldings.map((h, i) => {
                const coin = state.coins.find(c => c.symbol === h.symbol);
                const value = coin ? h.units * coin.price : 0;
                const pnl = coin ? (coin.price - h.avgCost) * h.units : 0;
                const pnlPct = h.avgCost > 0 ? ((coin?.price ?? h.avgCost) - h.avgCost) / h.avgCost * 100 : 0;
                return (
                  <CardSection key={h.symbol} last={i === mirroredHoldings.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <CoinGlyph symbol={h.symbol} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontWeight: '600', color: colors.ink }}>{h.symbol}</Text>
                          <Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.ink }}>${value.toFixed(2)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                          <Text style={{ fontSize: 12, color: colors.ink3 }}>{h.units.toFixed(4)} units</Text>
                          <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: pnlPct >= 0 ? colors.up : colors.down }}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </CardSection>
                );
              })}
            </Card>
          </>
        )}

        {/* Footer */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={handleTogglePause}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant={paused ? 'surface' : 'brand'}
            style={{ flex: 1 }}
            onPress={() => {
              if (paused) {
                Alert.alert('Paused', 'Resume copy trading to mirror new positions.', [{ text: 'OK' }]);
              } else {
                Alert.alert('Active mirror', `You are mirroring $${allocation.toLocaleString()} across ${traderHandle}'s positions.\n\nYour funds are automatically allocated proportionally to their trades.`, [{ text: 'OK' }]);
              }
            }}
          >
            {paused ? 'Paused' : `Mirroring · $${allocation.toLocaleString()}`}
          </Button>
        </View>
      </ScreenShell>

      <EditMirrorModal
        visible={editOpen}
        allocation={allocation}
        onSave={handleSaveAllocation}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
