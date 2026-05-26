import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { CandleChart } from '../components/charts/CandleChart';
import { AreaChart } from '../components/charts/AreaChart';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { Filter, Plus, ChevronRight, Pause, SkipBack, SkipForward } from 'lucide-react-native';

const eras = [
  { id: 'bull-run-2021',      title: 'The 2021 Bull Run',   sub: 'Nov 2020 → May 2021 · BTC $13K → $64K', tag: '+393% BTC',  down: false },
  { id: 'crypto-winter-2022', title: 'Crypto Winter 2022',  sub: 'LUNA · FTX collapse · May → Nov 2022',  tag: '−65% market', down: true },
  { id: 'defi-summer',        title: 'DeFi Summer',         sub: 'YFI · UNI launch · May → Sep 2020',     tag: '+180% market', down: false },
  { id: 'covid-crash',        title: 'COVID Crash',         sub: '5 days · −50% · March 2020',            tag: 'Extreme vol', down: true },
  { id: 'ico-boom-2017',      title: '2017 ICO Boom',       sub: 'Jul → Dec 2017',                        tag: '+420% market', down: false },
];

type EraId = 'bull-run-2021' | 'crypto-winter-2022' | 'defi-summer' | 'covid-crash' | 'ico-boom-2017';

const ERA_DATA: Record<EraId, { days: number; startPrice: number; endPrice: number; vol: number; coin: string }> = {
  'bull-run-2021':      { days: 182, startPrice: 13000, endPrice: 64000, vol: 0.04, coin: 'BTC' },
  'crypto-winter-2022': { days: 180, startPrice: 47000, endPrice: 16000, vol: 0.05, coin: 'BTC' },
  'defi-summer':        { days: 120, startPrice: 200,   endPrice: 520,   vol: 0.06, coin: 'ETH' },
  'covid-crash':        { days: 5,   startPrice: 9200,  endPrice: 4500,  vol: 0.12, coin: 'BTC' },
  'ico-boom-2017':      { days: 180, startPrice: 2500,  endPrice: 19000, vol: 0.07, coin: 'BTC' },
};

const SPEED_DELAYS: Record<string, number> = { '1×': 500, '5×': 100, '60×': 20 };

function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = ((s * 1664525 + 1013904223) >>> 0); return s / 4294967295; };
}

function genPriceSeries(eraId: string, days: number, startPrice: number, endPrice: number, vol: number): number[] {
  const seedVal = Array.from(eraId).reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const rng = makeRng(seedVal);
  const prices: number[] = [startPrice];
  let p = startPrice;
  for (let d = 1; d <= days; d++) {
    const noise = (rng() - 0.5) * 2 * vol;
    const remaining = days - d + 1;
    const pull = (endPrice - p) / remaining;
    p = Math.max(1, p * (1 + noise) + pull * 0.6);
    prices.push(p);
  }
  return prices;
}

export function ReplayScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const [activeEraId, setActiveEraId] = useState<EraId | null>(route.params?.eraId ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('5×');
  const [day, setDay] = useState(0);
  const [priceSeries, setPriceSeries] = useState<number[]>([]);
  const [replayCash, setReplayCash] = useState(10000);
  const [replayUnits, setReplayUnits] = useState(0);

  const dayRef = useRef(day);
  dayRef.current = day;

  const activeEra = eras.find(e => e.id === activeEraId) ?? null;
  const eraData = activeEraId ? ERA_DATA[activeEraId] : null;

  // Generate price series when era changes
  useEffect(() => {
    if (!activeEraId || !eraData) return;
    const prices = genPriceSeries(activeEraId, eraData.days, eraData.startPrice, eraData.endPrice, eraData.vol);
    setPriceSeries(prices);
    setDay(0);
    setReplayCash(10000);
    setReplayUnits(0);
    setIsPlaying(true);
  }, [activeEraId]);

  // Playback interval
  useEffect(() => {
    if (!isPlaying || !eraData || priceSeries.length === 0) return;
    const delay = SPEED_DELAYS[speed] ?? 100;
    const id = setInterval(() => {
      const next = dayRef.current + 1;
      if (next > eraData.days) {
        setIsPlaying(false);
      } else {
        setDay(next);
      }
    }, delay);
    return () => clearInterval(id);
  }, [isPlaying, speed, eraData, priceSeries.length]);

  const currentPrice = priceSeries[day] ?? eraData?.startPrice ?? 0;
  const holdingsValue = replayUnits * currentPrice;
  const bankroll = replayCash + holdingsValue;
  const pnl = bankroll - 10000;
  const pnlPct = (pnl / 10000) * 100;

  const handleBuy = () => {
    if (!eraData) return;
    if (replayCash < 50) {
      Alert.alert('Insufficient cash', `You only have $${replayCash.toFixed(0)} left.`);
      return;
    }
    const price = currentPrice;
    const options = [50, 200, 500].filter(a => a <= replayCash);
    Alert.alert(
      `Buy ${eraData.coin}`,
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
    if (!eraData || replayUnits <= 0) {
      Alert.alert('No holdings', `You don't hold any ${eraData?.coin ?? 'coin'} to sell.`);
      return;
    }
    const price = currentPrice;
    const totalValue = replayUnits * price;
    Alert.alert(
      `Sell ${eraData.coin}`,
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
    setPriceSeries([]);
    setReplayCash(10000);
    setReplayUnits(0);
  };

  if (activeEra && eraData) {
    const progress = eraData.days > 0 ? day / eraData.days : 0;
    const finished = day >= eraData.days;

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
              Day {day} of {eraData.days}
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
              onPress={() => setDay(d => Math.min(d + 10, eraData.days))}
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

        {/* Chart — driven by current replay price */}
        <View style={{ marginHorizontal: -20 }}>
          <CandleChart height={180} basePrice={currentPrice} timeframe="1D" />
        </View>

        {/* Current price */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, color: colors.ink3 }}>{eraData.coin} price · day {day}</Text>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </Text>
        </View>

        {/* Stats */}
        <Card variant="noPad" style={{ flexDirection: 'row' }}>
          {[
            ['Bankroll', `$${bankroll.toFixed(0)}`],
            ['P&L', `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`],
            ['Holdings', replayUnits > 0 ? `${replayUnits.toFixed(4)} ${eraData.coin}` : 'None'],
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
            Sell {eraData.coin}
          </Button>
          <Button variant="up" style={{ flex: 1 }} onPress={handleBuy} disabled={replayCash < 50}>
            Buy {eraData.coin}
          </Button>
        </View>

        {finished && pnl !== 0 && (
          <Card variant="tinted">
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink }}>
              Replay complete {pnl >= 0 ? '🎉' : ''}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 4 }}>
              You turned $10,000 into ${bankroll.toFixed(0)} — a {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% return in {eraData.days} days.
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
        Step into a real market moment with $10K. See how you would have played it.
      </Text>

      {/* Hero card */}
      <View style={{ backgroundColor: colors.brand, borderRadius: 18, overflow: 'hidden' }}>
        <View style={{ padding: 18, paddingBottom: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}A5`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Featured · Nov 2020 → May 2021
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, marginTop: 6, letterSpacing: -0.7 }}>
            The 2021 Bull Run
          </Text>
          <Text style={{ fontSize: 13, color: `${colors.brandOn}CC`, marginTop: 4 }}>
            BTC $13K → $64K · 182 days · 5,640 players
          </Text>
        </View>
        <View style={{ marginVertical: 8 }}>
          <AreaChart height={110} style={{ opacity: 0.9 }} />
        </View>
        <View style={{ padding: 6, paddingHorizontal: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {['M', 'S', 'K', 'L'].map((l, i) => (
              <Avatar
                key={l}
                initials={l}
                size="sm"
                style={{ marginLeft: i === 0 ? 0 : -8, backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'transparent' }}
              />
            ))}
            <Text style={{ fontSize: 11, color: `${colors.brandOn}A5`, marginLeft: 10 }}>3 friends played</Text>
          </View>
          <Button
            variant="surface"
            size="sm"
            style={{ backgroundColor: colors.brandOn, borderColor: 'transparent' }}
            textStyle={{ color: colors.brand }}
            onPress={() => setActiveEraId('bull-run-2021')}
          >
            ▶ Start
          </Button>
        </View>
      </View>

      {/* More eras */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>More eras</Text>
      <Card variant="noPad">
        {eras.map((e, i) => (
          <TouchableOpacity key={e.id} onPress={() => setActiveEraId(e.id as EraId)} activeOpacity={0.75}>
            <CardSection last={i === eras.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{e.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{e.sub}</Text>
                </View>
                <AreaChart height={28} down={e.down} showDot={false} style={{ width: 64 }} />
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
