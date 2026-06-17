import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { AreaChart } from '../components/charts/AreaChart';
import type { ChartMarker } from '../components/charts/CandleChart';
import { useTheme } from '../theme/ThemeContext';
import { STARTING_CASH } from '../constants/featureFlags';
import { REPLAY_ERAS } from '../data/replayHistory';
import { getReplaySession, type ReplaySession } from '../services/replayHistoryStore';
import { Pause, SkipBack, SkipForward, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';

const SPEED_DELAYS: Record<string, number> = { '1×': 600, '5×': 140, '20×': 40 };

// A "video replay" of your portfolio through a past solo run: scrub/play the
// equity curve (reconstructed from the era prices + your trades), with trade
// markers on the graph and a clickable, date-stamped trade list.
export function ReplayHistoryScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = route.params?.sessionId as string | undefined;

  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!sessionId) { setLoaded(true); return; }
    getReplaySession(sessionId).then(s => { setSession(s); setLoaded(true); });
  }, [sessionId]);

  const era = session ? REPLAY_ERAS.find(e => e.id === session.eraId) : null;
  const prices = era?.prices ?? [];
  const days = Math.max(0, prices.length - 1);

  // Reconstruct the equity curve + holdings/cash at each day from the trades.
  const { equity, holdingsAt, cashAt } = useMemo(() => {
    const eq: number[] = []; const held: number[] = []; const csh: number[] = [];
    if (!session || !prices.length) return { equity: eq, holdingsAt: held, cashAt: csh };
    const byDay = new Map<number, typeof session.trades>();
    for (const t of session.trades) { const a = byDay.get(t.day) ?? []; a.push(t); byDay.set(t.day, a); }
    let cash = STARTING_CASH, units = 0;
    for (let d = 0; d <= days; d++) {
      for (const t of (byDay.get(d) ?? [])) {
        if (t.side === 'buy') { cash -= t.amount; units += t.units; }
        else { cash += t.amount; units -= t.units; }
      }
      csh[d] = cash; held[d] = units; eq[d] = cash + units * prices[d];
    }
    return { equity: eq, holdingsAt: held, cashAt: csh };
  }, [session, days]);

  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('5×');
  const [detail, setDetail] = useState<ChartMarker[] | null>(null);
  const headRef = useRef(0);
  headRef.current = playhead;

  // Start at the end (final result) once loaded; user can rewind/play.
  useEffect(() => { if (days > 0) { setPlayhead(days); } }, [days]);

  useEffect(() => {
    if (!isPlaying || days === 0) return;
    const delay = SPEED_DELAYS[speed] ?? 140;
    const id = setInterval(() => {
      const next = headRef.current + 1;
      if (next > days) { setIsPlaying(false); } else setPlayhead(next);
    }, delay);
    return () => clearInterval(id);
  }, [isPlaying, speed, days]);

  const play = () => {
    if (playhead >= days) setPlayhead(0); // replay from the start
    setIsPlaying(p => !p);
  };

  if (!loaded) return <ScreenShell title="Loading…"><View /></ScreenShell>;
  if (!session || !era) {
    return (
      <ScreenShell eyebrow="Replay history" title="Not found">
        <Card variant="tinted"><Text style={{ color: colors.ink3, fontSize: 13 }}>This replay is no longer saved on this device.</Text></Card>
      </ScreenShell>
    );
  }

  const bal = equity[playhead] ?? STARTING_CASH;
  const pnl = bal - STARTING_CASH;
  const pnlPct = (pnl / STARTING_CASH) * 100;
  const dateAt = (d: number) => new Date(Date.parse(era.startDate) + d * (era.intervalMs || 86400000));
  const progress = days > 0 ? playhead / days : 0;

  // Markers up to the playhead, positioned on the equity curve by day.
  const markers: ChartMarker[] = session.trades
    .filter(t => t.day <= playhead)
    .map((t, i) => ({ id: `${t.day}-${i}`, timestamp: t.day, side: t.side, price: t.price, units: t.units, amount: t.amount, symbol: session.coin }));
  const chartData = equity.slice(0, Math.max(2, playhead + 1));
  const chartTimestamps = Array.from({ length: chartData.length }, (_, i) => i);

  return (
    <ScreenShell
      eyebrow={`Replay · ${session.title}`}
      title={`$${bal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
      subtitle={`(${dateAt(playhead).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`}
      animateTitle
    >
      {/* P&L at the playhead */}
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: (pnl >= 0 ? colors.up : colors.down) + '1A', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: pnl >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)} · {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
        </Text>
      </View>

      {/* Equity chart with trade markers */}
      <View style={{ marginHorizontal: -20 }}>
        <AreaChart
          height={190}
          data={chartData}
          timestamps={chartTimestamps}
          markers={markers}
          down={pnl < 0}
          crosshair={false}
          onMarkerGroupPress={setDetail}
        />
      </View>

      {/* Transport — video-replay your portfolio */}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>Day {playhead} of {days}</Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>{holdingsAt[playhead] > 0 ? `${holdingsAt[playhead].toFixed(4)} ${session.coin}` : 'All cash'}</Text>
        </View>
        <View style={{ height: 4, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: colors.brand, borderRadius: 999 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
          <TouchableOpacity style={{ padding: 8 }} onPress={() => { setIsPlaying(false); setPlayhead(0); }}>
            <SkipBack color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
            onPress={play}
          >
            {isPlaying ? <Pause color={colors.brandOn} size={22} strokeWidth={1.75} /> : <Text style={{ color: colors.brandOn, fontSize: 20 }}>▶</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 8 }} onPress={() => setPlayhead(d => Math.min(d + 10, days))}>
            <SkipForward color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Speed</Text>
          <Segmented options={['1×', '5×', '20×']} value={speed} onChange={setSpeed} />
        </View>
      </Card>

      {/* Trade history — clickable, jumps the playhead to that day */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Trades</Text>
      {session.trades.length === 0 ? (
        <Card variant="tinted"><Text style={{ fontSize: 13, color: colors.ink3 }}>You didn't trade in this replay — your $100K rode it out flat.</Text></Card>
      ) : (
        <Card variant="noPad">
          {session.trades.map((t, i) => {
            const buy = t.side === 'buy';
            const col = buy ? colors.up : colors.down;
            const atHead = t.day === playhead;
            return (
              <TouchableOpacity
                key={`${t.day}-${i}`}
                activeOpacity={0.75}
                onPress={() => { setIsPlaying(false); setPlayhead(t.day); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < session.trades.length - 1 ? 1 : 0, borderBottomColor: colors.hairline, backgroundColor: atHead ? colors.surface2 : 'transparent' }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${col}1A`, alignItems: 'center', justifyContent: 'center' }}>
                  {buy ? <ArrowDownLeft color={col} size={17} /> : <ArrowUpRight color={col} size={17} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{buy ? 'Bought' : 'Sold'} {session.coin}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 1, fontVariant: ['tabular-nums'] }}>
                    {dateAt(t.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} · {t.units < 1 ? t.units.toFixed(4) : t.units.toFixed(2)} @ ${t.price.toLocaleString('en-US', { maximumFractionDigits: t.price < 100 ? 2 : 0 })}
                  </Text>
                </View>
                <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>${t.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
              </TouchableOpacity>
            );
          })}
        </Card>
      )}

      {/* Marker tap → trade detail */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setDetail(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 28 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>
                {detail ? `${detail.length} ${detail.length === 1 ? 'transaction' : 'transactions'}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setDetail(null)} hitSlop={8}><X color={colors.ink3} size={20} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
              {(detail ?? []).map((m, i) => {
                const buy = m.side === 'buy';
                const col = buy ? colors.up : colors.down;
                return (
                  <View key={m.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < (detail!.length - 1) ? 1 : 0, borderBottomColor: colors.hairline }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${col}1A`, alignItems: 'center', justifyContent: 'center' }}>
                      {buy ? <ArrowDownLeft color={col} size={17} /> : <ArrowUpRight color={col} size={17} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: colors.ink }}>{buy ? 'Bought' : 'Sold'} {m.symbol}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 1, fontVariant: ['tabular-nums'] }}>{dateAt(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} @ ${m.price.toLocaleString('en-US', { maximumFractionDigits: m.price < 100 ? 2 : 0 })}</Text>
                    </View>
                    <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>${m.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenShell>
  );
}
