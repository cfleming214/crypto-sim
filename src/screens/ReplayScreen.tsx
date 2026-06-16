import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { AreaChart } from '../components/charts/AreaChart';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { REPLAY_ERAS, type ReplayEraId } from '../data/replayHistory';
import { Filter, Plus, ChevronRight, Pause, SkipBack, SkipForward } from 'lucide-react-native';

const SPEED_DELAYS: Record<string, number> = { '1×': 500, '5×': 100, '60×': 20 };

// Compact dollar label: $13.8K / $360 / $1.2K.
function fmtK(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// Display metadata derived from each era's REAL price series (oldest → newest).
const ERA_LIST = REPLAY_ERAS.map(e => {
  const start = e.prices[0];
  const end = e.prices[e.prices.length - 1];
  const pct = start > 0 ? ((end - start) / start) * 100 : 0;
  return {
    ...e,
    down: end < start,
    pct,
    tag: `${pct >= 0 ? '+' : ''}${Math.round(pct)}% ${e.coin}`,
    sub: `${e.dateLabel} · ${fmtK(start)} → ${fmtK(end)}`,
  };
});

const FEATURED = ERA_LIST.find(e => e.id === 'bull-run-2021') ?? ERA_LIST[0];

export function ReplayScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const [activeEraId, setActiveEraId] = useState<ReplayEraId | null>(route.params?.eraId ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('5×');
  const [day, setDay] = useState(0);
  const [replayCash, setReplayCash] = useState(10000);
  const [replayUnits, setReplayUnits] = useState(0);

  const dayRef = useRef(day);
  dayRef.current = day;

  const activeEra = ERA_LIST.find(e => e.id === activeEraId) ?? null;
  const priceSeries = activeEra?.prices ?? [];
  const days = Math.max(0, priceSeries.length - 1);

  // Reset replay state whenever the era changes, then auto-play.
  useEffect(() => {
    if (!activeEraId) return;
    setDay(0);
    setReplayCash(10000);
    setReplayUnits(0);
    setIsPlaying(true);
  }, [activeEraId]);

  // Playback: advance one step per tick at the chosen speed.
  useEffect(() => {
    if (!isPlaying || days === 0) return;
    const delay = SPEED_DELAYS[speed] ?? 100;
    const id = setInterval(() => {
      const next = dayRef.current + 1;
      if (next > days) setIsPlaying(false);
      else setDay(next);
    }, delay);
    return () => clearInterval(id);
  }, [isPlaying, speed, days]);

  const currentPrice = priceSeries[day] ?? priceSeries[0] ?? 0;
  const holdingsValue = replayUnits * currentPrice;
  const bankroll = replayCash + holdingsValue;
  const pnl = bankroll - 10000;
  const pnlPct = (pnl / 10000) * 100;

  const handleBuy = () => {
    if (!activeEra) return;
    if (replayCash < 50) {
      Alert.alert('Insufficient cash', `You only have $${replayCash.toFixed(0)} left.`);
      return;
    }
    const price = currentPrice;
    const options = [50, 200, 500].filter(a => a <= replayCash);
    Alert.alert(
      `Buy ${activeEra.coin}`,
      `Day ${day} · Price: $${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...options.map(a => ({
          text: `$${a}`,
          onPress: () => { setReplayCash(c => c - a); setReplayUnits(u => u + a / price); },
        })),
        {
          text: `All-in ($${replayCash.toFixed(0)})`,
          onPress: () => { setReplayUnits(u => u + replayCash / price); setReplayCash(0); },
        },
      ],
    );
  };

  const handleSell = () => {
    if (!activeEra || replayUnits <= 0) {
      Alert.alert('No holdings', `You don't hold any ${activeEra?.coin ?? 'coin'} to sell.`);
      return;
    }
    const price = currentPrice;
    const totalValue = replayUnits * price;
    Alert.alert(
      `Sell ${activeEra.coin}`,
      `Day ${day} · Holdings: $${totalValue.toFixed(0)} · Price: $${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Sell half ($${(totalValue / 2).toFixed(0)})`,
          onPress: () => {
            const half = replayUnits / 2;
            setReplayUnits(u => u - half);
            setReplayCash(c => c + half * price);
          },
        },
        {
          text: `Sell all ($${totalValue.toFixed(0)})`,
          onPress: () => { setReplayCash(c => c + replayUnits * price); setReplayUnits(0); },
        },
      ],
    );
  };

  const handleReset = () => {
    setActiveEraId(null);
    setIsPlaying(false);
    setDay(0);
    setReplayCash(10000);
    setReplayUnits(0);
  };

  if (activeEra) {
    const progress = days > 0 ? day / days : 0;
    const finished = day >= days;

    return (
      <ScreenShell
        eyebrow="Time Machine · Replay"
        title={activeEra.title}
        rightActions={<Chip variant={activeEra.down ? 'down' : 'up'}>{activeEra.tag}</Chip>}
      >
        <Text style={{ fontSize: 13, color: colors.ink3 }}>{activeEra.sub}</Text>

        {/* Playback controls */}
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>
              Day {day} of {days}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {finished && <Chip variant="up">Finished</Chip>}
              {!finished && <Chip variant={isPlaying ? 'up' : 'outline'}>{isPlaying ? '▶ Playing' : '⏸ Paused'}</Chip>}
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ height: 4, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: colors.brand, borderRadius: 999 }} />
          </View>

          {/* Transport */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <TouchableOpacity
              style={{ padding: 8 }}
              onPress={() => { setDay(0); setIsPlaying(false); setReplayCash(10000); setReplayUnits(0); }}
            >
              <SkipBack color={colors.ink} size={22} strokeWidth={1.75} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => finished ? null : setIsPlaying(p => !p)}
              disabled={finished}
            >
              {isPlaying
                ? <Pause color={colors.brandOn} size={22} strokeWidth={1.75} />
                : <Text style={{ color: colors.brandOn, fontSize: 20 }}>▶</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 8 }}
              onPress={() => setDay(d => Math.min(d + 10, days))}
            >
              <SkipForward color={colors.ink} size={22} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>

          {/* Speed */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Speed</Text>
            <Segmented options={['1×', '5×', '60×']} value={speed} onChange={setSpeed} />
          </View>
        </Card>

        {/* Chart — the REAL price history, revealed up to the current day */}
        <View style={{ marginHorizontal: -20 }}>
          <AreaChart
            height={180}
            data={priceSeries.slice(0, Math.max(2, day + 1))}
            down={activeEra.down}
            crosshair={false}
          />
        </View>

        {/* Current price */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, color: colors.ink3 }}>{activeEra.coin} price · day {day}</Text>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: currentPrice < 100 ? 2 : 0 })}
          </Text>
        </View>

        {/* Stats */}
        <Card variant="noPad" style={{ flexDirection: 'row' }}>
          {[
            ['Bankroll', `$${bankroll.toFixed(0)}`],
            ['P&L', `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`],
            ['Holdings', replayUnits > 0 ? `${replayUnits.toFixed(4)} ${activeEra.coin}` : 'None'],
          ].map(([k, v], i) => (
            <View key={k} style={{ flex: 1, padding: 12, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
              <Text style={{
                fontWeight: '700', fontSize: k === 'P&L' ? 12 : 14, marginTop: 2,
                fontVariant: ['tabular-nums'],
                color: k === 'P&L' ? (pnl >= 0 ? colors.up : colors.down) : colors.ink,
              }}>{v}</Text>
            </View>
          ))}
        </Card>

        {/* Trade buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="down" style={{ flex: 1 }} onPress={handleSell} disabled={replayUnits <= 0}>
            Sell {activeEra.coin}
          </Button>
          <Button variant="up" style={{ flex: 1 }} onPress={handleBuy} disabled={replayCash < 50}>
            Buy {activeEra.coin}
          </Button>
        </View>

        {finished && pnl !== 0 && (
          <Card variant="tinted">
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink }}>
              Replay complete {pnl >= 0 ? '🎉' : ''}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 4 }}>
              You turned $10,000 into ${bankroll.toFixed(0)} — a {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% return over {days} days.
            </Text>
          </Card>
        )}

        <Button variant="ghost" onPress={handleReset}>← Back to eras</Button>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      eyebrow="Time Machine"
      title="Trade the past"
      rightActions={
        <TouchableOpacity onPress={() => Alert.alert('Filter', 'Filter eras by market condition, date range, or volatility.', [{ text: 'OK' }])}>
          <Filter color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      <Text style={{ fontSize: 13, color: colors.ink3, lineHeight: 20 }}>
        Step into a real market moment with $10K. See how you would have played it — on actual historical prices.
      </Text>

      {/* Hero card — the featured era, on its real curve */}
      {FEATURED && (
        <View style={{ backgroundColor: colors.brand, borderRadius: 18, overflow: 'hidden' }}>
          <View style={{ padding: 18, paddingBottom: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}A5`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Featured · {FEATURED.dateLabel}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, marginTop: 6, letterSpacing: -0.7 }}>
              {FEATURED.title}
            </Text>
            <Text style={{ fontSize: 13, color: `${colors.brandOn}CC`, marginTop: 4 }}>
              {FEATURED.coin} {fmtK(FEATURED.prices[0])} → {fmtK(FEATURED.prices[FEATURED.prices.length - 1])} · {FEATURED.prices.length} days · {FEATURED.tag}
            </Text>
          </View>
          <View style={{ marginVertical: 8 }}>
            <AreaChart height={110} data={FEATURED.prices} down={FEATURED.down} showDot={false} crosshair={false} style={{ opacity: 0.9 }} />
          </View>
          <View style={{ padding: 6, paddingHorizontal: 18, paddingBottom: 18, alignItems: 'flex-end' }}>
            <Button
              variant="surface"
              size="sm"
              style={{ backgroundColor: colors.brandOn, borderColor: 'transparent' }}
              textStyle={{ color: colors.brand }}
              onPress={() => setActiveEraId(FEATURED.id as ReplayEraId)}
            >
              ▶ Start
            </Button>
          </View>
        </View>
      )}

      {/* More eras */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>More eras</Text>
      <Card variant="noPad">
        {ERA_LIST.map((e, i) => (
          <TouchableOpacity key={e.id} onPress={() => setActiveEraId(e.id as ReplayEraId)} activeOpacity={0.75}>
            <CardSection last={i === ERA_LIST.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{e.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{e.sub}</Text>
                </View>
                <AreaChart height={28} data={e.prices} down={e.down} showDot={false} crosshair={false} style={{ width: 64 }} />
                <Chip variant={e.down ? 'down' : 'up'} style={{ paddingVertical: 2, paddingHorizontal: 8 }}>{e.tag}</Chip>
                <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
              </View>
            </CardSection>
          </TouchableOpacity>
        ))}
      </Card>

      {/* Custom range */}
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => Alert.alert('Custom Range', 'Pick any historical date range. This feature unlocks at Level 15!', [{ text: 'OK' }])}
      >
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, backgroundColor: colors.surface, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Plus color={colors.ink} size={16} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Custom range</Text>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Pick any historical date range · unlocks at Level 15</Text>
          </View>
        </Card>
      </TouchableOpacity>
    </ScreenShell>
  );
}
