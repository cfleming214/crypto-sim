import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { STARTING_CASH } from '../constants/featureFlags';
import { useApp } from '../store/AppContext';
import { fetchReplayContestScenario, submitReplayScore, fetchReplayLeaderboard } from '../services/replayService';
import { loadReplaySessions, saveReplaySession, type ReplaySession, type ReplaySessionTrade } from '../services/replayHistoryStore';
import type { CompetitionEntry } from '../store/types';
import { Filter, Plus, ChevronRight, Pause, SkipBack, SkipForward, Trophy } from 'lucide-react-native';

// A playable scenario — either a bundled free-play era or a fetched contest.
interface Scenario { id: string; title: string; coin: string; prices: number[]; down: boolean; tag: string; sub: string; }

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
  const { state } = useApp();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const contestId = route.params?.contestId as string | undefined;

  const [activeEraId, setActiveEraId] = useState<ReplayEraId | null>(route.params?.eraId ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('5×');
  const [day, setDay] = useState(0);
  const [replayCash, setReplayCash] = useState(STARTING_CASH);
  const [replayUnits, setReplayUnits] = useState(0);
  const [tradesLog, setTradesLog] = useState<ReplaySessionTrade[]>([]);
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const savedRef = useRef(false);
  useEffect(() => { loadReplaySessions().then(setSessions); }, []);

  // Contest mode: load the contest scenario, then submit the result on finish.
  const [contestRaw, setContestRaw] = useState<{ id: string; title: string; coin: string; prices: number[]; histStartIso: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [board, setBoard] = useState<CompetitionEntry[]>([]);
  useEffect(() => {
    if (!contestId) return;
    fetchReplayContestScenario(contestId).then(setContestRaw);
  }, [contestId]);

  const dayRef = useRef(day);
  dayRef.current = day;

  // Unify a fetched contest and a bundled era into one Scenario shape.
  const contestScenario: Scenario | null = useMemo(() => {
    if (!contestRaw || !contestRaw.prices.length) return null;
    const start = contestRaw.prices[0], end = contestRaw.prices[contestRaw.prices.length - 1];
    const pct = start > 0 ? ((end - start) / start) * 100 : 0;
    return {
      id: contestRaw.id, title: contestRaw.title, coin: contestRaw.coin, prices: contestRaw.prices,
      down: end < start, tag: `${pct >= 0 ? '+' : ''}${Math.round(pct)}% ${contestRaw.coin}`,
      sub: `${new Date(contestRaw.histStartIso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · ${fmtK(start)} → ${fmtK(end)}`,
    };
  }, [contestRaw]);

  const activeScenario: Scenario | null = contestScenario ?? (ERA_LIST.find(e => e.id === activeEraId) ?? null);
  const priceSeries = activeScenario?.prices ?? [];
  const days = Math.max(0, priceSeries.length - 1);
  const scenarioId = activeScenario?.id;

  // Reset + auto-play whenever the scenario changes.
  useEffect(() => {
    if (!scenarioId) return;
    setDay(0);
    setReplayCash(STARTING_CASH);
    setReplayUnits(0);
    setTradesLog([]);
    savedRef.current = false;
    setSubmitted(false);
    setBoard([]);
    setIsPlaying(true);
  }, [scenarioId]);

  // Record each executed trade (keyed by the current step) for the history.
  const recordTrade = (side: 'buy' | 'sell', amount: number, units: number, price: number) => {
    setTradesLog(prev => [...prev, { day: dayRef.current, side, amount, units, price }]);
  };

  // Free-play era replays: save a local history session when the run completes.
  useEffect(() => {
    if (contestId || !activeEraId || days === 0 || day < days || savedRef.current) return;
    savedRef.current = true;
    const era = ERA_LIST.find(e => e.id === activeEraId);
    if (!era) return;
    const session: ReplaySession = {
      id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eraId: activeEraId, title: era.title, coin: era.coin,
      playedAt: Date.now(), finalBankroll: bankroll, pnlPct, trades: tradesLog,
    };
    saveReplaySession(session).then(setSessions);
  }, [activeEraId, day, days, contestId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const pnl = bankroll - STARTING_CASH;
  const pnlPct = (pnl / STARTING_CASH) * 100;

  // Contest mode: when the playthrough reaches the end, submit the final result
  // as the user's entry and load the standings.
  useEffect(() => {
    if (!contestScenario || days === 0 || day < days || submitted) return;
    setSubmitted(true);
    (async () => {
      await submitReplayScore(contestScenario.id, state.user.handle, bankroll, pnlPct);
      setBoard(await fetchReplayLeaderboard(contestScenario.id));
    })();
  }, [contestScenario, day, days, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBuy = () => {
    if (!activeScenario) return;
    if (replayCash < 50) {
      Alert.alert('Insufficient cash', `You only have $${replayCash.toFixed(0)} left.`);
      return;
    }
    const price = currentPrice;
    const options = [50, 200, 500].filter(a => a <= replayCash);
    Alert.alert(
      `Buy ${activeScenario.coin}`,
      `Day ${day} · Price: $${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...options.map(a => ({
          text: `$${a}`,
          onPress: () => { setReplayCash(c => c - a); setReplayUnits(u => u + a / price); recordTrade('buy', a, a / price, price); },
        })),
        {
          text: `All-in ($${replayCash.toFixed(0)})`,
          onPress: () => { const amt = replayCash; setReplayUnits(u => u + amt / price); setReplayCash(0); recordTrade('buy', amt, amt / price, price); },
        },
      ],
    );
  };

  const handleSell = () => {
    if (!activeScenario || replayUnits <= 0) {
      Alert.alert('No holdings', `You don't hold any ${activeScenario?.coin ?? 'coin'} to sell.`);
      return;
    }
    const price = currentPrice;
    const totalValue = replayUnits * price;
    Alert.alert(
      `Sell ${activeScenario.coin}`,
      `Day ${day} · Holdings: $${totalValue.toFixed(0)} · Price: $${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Sell half ($${(totalValue / 2).toFixed(0)})`,
          onPress: () => {
            const half = replayUnits / 2;
            setReplayUnits(u => u - half);
            setReplayCash(c => c + half * price);
            recordTrade('sell', half * price, half, price);
          },
        },
        {
          text: `Sell all ($${totalValue.toFixed(0)})`,
          onPress: () => { const all = replayUnits; setReplayCash(c => c + all * price); setReplayUnits(0); recordTrade('sell', all * price, all, price); },
        },
      ],
    );
  };

  const handleReset = () => {
    if (contestId) { nav.goBack(); return; }   // contest mode → back to Compete
    setActiveEraId(null);
    setIsPlaying(false);
    setDay(0);
    setReplayCash(STARTING_CASH);
    setReplayUnits(0);
  };

  const playAgain = () => {
    setDay(0);
    setReplayCash(STARTING_CASH);
    setReplayUnits(0);
    setSubmitted(false);
    setBoard([]);
    setIsPlaying(true);
  };

  if (activeScenario) {
    const progress = days > 0 ? day / days : 0;
    const finished = day >= days;

    return (
      <ScreenShell
        eyebrow="Time Machine · Replay"
        title={activeScenario.title}
        rightActions={<Chip variant={activeScenario.down ? 'down' : 'up'}>{activeScenario.tag}</Chip>}
      >
        <Text style={{ fontSize: 13, color: colors.ink3 }}>{activeScenario.sub}</Text>

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
              onPress={() => { setDay(0); setIsPlaying(false); setReplayCash(STARTING_CASH); setReplayUnits(0); }}
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
            down={activeScenario.down}
            crosshair={false}
          />
        </View>

        {/* Current price */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, color: colors.ink3 }}>{activeScenario.coin} price · day {day}</Text>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: currentPrice < 100 ? 2 : 0 })}
          </Text>
        </View>

        {/* Stats */}
        <Card variant="noPad" style={{ flexDirection: 'row' }}>
          {[
            ['Bankroll', `$${bankroll.toFixed(0)}`],
            ['P&L', `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`],
            ['Holdings', replayUnits > 0 ? `${replayUnits.toFixed(4)} ${activeScenario.coin}` : 'None'],
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
            Sell {activeScenario.coin}
          </Button>
          <Button variant="up" style={{ flex: 1 }} onPress={handleBuy} disabled={replayCash < 50}>
            Buy {activeScenario.coin}
          </Button>
        </View>

        {finished && contestScenario ? (
          <Card variant="tinted">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Trophy color={colors.up} size={18} strokeWidth={2} />
              <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>{submitted ? 'Score submitted!' : 'Submitting…'}</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 4 }}>
              You turned $100,000 into ${bankroll.toFixed(0)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%){submitted ? " — it's on the contest leaderboard." : '.'}
            </Text>
            {board.length > 0 && (() => {
              const sorted = [...board].sort((a, b) => b.bankroll - a.bankroll);
              const myRank = sorted.findIndex(e => e.handle === state.user.handle) + 1;
              const top = sorted.slice(0, 8);
              return (
                <View style={{ marginTop: 12 }}>
                  {myRank > 0 && (
                    <Text style={{ fontSize: 12, color: colors.brand, fontWeight: '700', marginBottom: 6 }}>You're #{myRank} of {sorted.length}</Text>
                  )}
                  {top.map((e, i) => {
                    const me = e.handle === state.user.handle;
                    return (
                      <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: i < top.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                        <Text style={{ width: 20, fontWeight: '700', fontSize: 13, color: i < 3 ? colors.up : colors.ink3, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: me ? colors.brand : colors.ink }} numberOfLines={1}>@{e.handle}{me ? ' (you)' : ''}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${Math.round(e.bankroll).toLocaleString()}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </Card>
        ) : finished && pnl !== 0 ? (
          <Card variant="tinted">
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink }}>
              Replay complete {pnl >= 0 ? '🎉' : ''}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 4 }}>
              You turned $100,000 into ${bankroll.toFixed(0)} — a {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% return over {days} days.
            </Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {finished && (
            <Button variant="ghost" style={{ flex: 1 }} onPress={playAgain}>Play again</Button>
          )}
          <Button variant="ghost" style={{ flex: 1 }} onPress={handleReset}>{contestId ? '← Back to contests' : '← Back to eras'}</Button>
        </View>
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

      {/* Your replay history */}
      {sessions.length > 0 && (
        <>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Your replays</Text>
          <Card variant="noPad">
            {sessions.map((s, i) => {
              const up = s.pnlPct >= 0;
              return (
                <TouchableOpacity key={s.id} testID={`replay-history-${s.id}`} activeOpacity={0.75} onPress={() => nav.navigate('ReplayHistory', { sessionId: s.id })}>
                  <CardSection last={i === sessions.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', color: colors.ink }}>{s.title}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                          {new Date(s.playedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {s.trades.length} trade{s.trades.length === 1 ? '' : 's'} · ${Math.round(s.finalBankroll).toLocaleString()}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: up ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                        {up ? '+' : ''}{s.pnlPct.toFixed(1)}%
                      </Text>
                      <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
                    </View>
                  </CardSection>
                </TouchableOpacity>
              );
            })}
          </Card>
        </>
      )}

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
