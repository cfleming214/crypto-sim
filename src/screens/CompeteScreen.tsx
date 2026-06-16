import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, TextInput, Share, ScrollView, PanResponder, Animated, Dimensions, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar } from '../components/ui/Avatar';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { AuthWall } from '../components/AuthWall';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { leagueColor } from '../components/ui/LeagueBadge';
import { levelForXp } from '../services/gamification';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { useReplayContests } from '../hooks/useReplayContests';
import { createDuel, acceptDuel, DUEL_DURATION_OPTIONS, DAY_MS } from '../services/competitionService';
import { fetchGlobalLeaderboard, subscribeToGlobalLeaderboard, type LeaderboardRow } from '../services/leaderboardService';
import { CONTEST_CASH_PRIZES, STARTING_CASH } from '../constants/featureFlags';
import { useNavigation } from '@react-navigation/native';
import { Clock, Flame, Bell, Trophy, Target, Swords, X } from 'lucide-react-native';
import type { Competition } from '../store/types';

const SEASON_DURATION = 30;
const SEASON_START = new Date('2026-05-01T00:00:00Z').getTime();
// Slide distance for the live-contest carousel transition (full screen width so
// the outgoing card clears the frame before the next one slides in).
const SCREEN_W = Dimensions.get('window').width;

function computeSeasonDay(): number {
  const elapsed = Date.now() - SEASON_START;
  return Math.min(SEASON_DURATION, Math.max(1, Math.ceil(elapsed / 86400000)));
}

// "in 7d" / "in 5h" / "in 12m" until an upcoming contest's startAt.
function startsInLabel(startAt: number): string {
  const ms = startAt - Date.now();
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `in ${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `in ${h}h`;
  return `in ${Math.max(1, Math.floor(ms / 60000))}m`;
}

const TYPE_LABEL: Record<string, string> = {
  daily: 'Daily',
  featured: 'Featured',
  replay: 'Replay',
  '1v1': '1v1',
};

// Pill-tab filters for the contest list. `type: null` = all types.
const CONTEST_TABS: { label: string; type: string | null }[] = [
  { label: 'All',      type: null },
  { label: 'Daily',    type: 'daily' },
  { label: 'Featured', type: 'featured' },
  { label: '1v1',      type: '1v1' },
  { label: 'Replay',   type: 'replay' },
  { label: 'Past',     type: null },     // shows finished contests (separate table)
];

export function CompeteScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const { getLive, isJoined, join, timeRemaining, refresh } = useCompetitions();
  const { join: joinReplay, isJoined: isReplayJoined } = useReplayContests();
  // Enter a replay contest: join it (creates the $100K portfolio + cloud entry)
  // if needed, then switch into its portfolio and jump to the Portfolio tab.
  const openReplay = async (id: string) => {
    const summary = state.replayContests.find(c => c.id === id);
    if (summary && (summary.status === 'finished' || Date.now() >= summary.endAt)) return;
    if (!isReplayJoined(id)) {
      const ok = await joinReplay(id);
      if (!ok) { Alert.alert('Could not join', 'This replay is no longer available.'); return; }
    }
    dispatch({ type: 'SWITCH_PORTFOLIO', portfolioId: id });
    nav.navigate('MainTabs', { screen: 'Portfolio' });
  };
  const { emailVerified, status, userId, refreshAttributes } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const pendingJoin = useRef<Competition | null>(null);
  const [duelModalOpen, setDuelModalOpen] = useState(false);
  const [duelCode, setDuelCode] = useState('');
  const [duelBusy, setDuelBusy] = useState(false);

  // Pending price-prediction status for the mini-game card. Tick once a second
  // while a round is live so the countdown updates.
  const activePrediction = state.activePrediction ?? null;
  const [, setPredTick] = useState(0);
  useEffect(() => {
    if (!activePrediction) return;
    const id = setInterval(() => setPredTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activePrediction?.expiresAt]);
  const predRemaining = activePrediction
    ? Math.max(0, Math.ceil((activePrediction.expiresAt - Date.now()) / 1000))
    : 0;
  const predLive = !!activePrediction && predRemaining > 0;
  const predExpired = !!activePrediction && predRemaining <= 0;
  const predMmss = `${Math.floor(predRemaining / 60)}:${String(predRemaining % 60).padStart(2, '0')}`;

  // While a round is live, glow the card green/red by whether the pick is
  // currently winning. Recomputed every render — the 1s tick above keeps this
  // refreshing against the latest price. Flat (no move yet) → no glow.
  const predLivePrice = predLive
    ? (state.coins.find(c => c.symbol === activePrediction!.symbol)?.price ?? 0)
    : 0;
  const predWinning = predLive && predLivePrice > 0
    ? (activePrediction!.direction === 'up'
        ? predLivePrice > activePrediction!.lockedPrice
        : predLivePrice < activePrediction!.lockedPrice)
    : false;
  const predFlat = predLive && predLivePrice === activePrediction!.lockedPrice;
  const predGlow = predLive && !predFlat ? (predWinning ? colors.up : colors.down) : null;

  // Pulse the prediction card's background the whole time a round is live (even
  // before the price moves), so it reads as "in play". Opacity loops 0↔1 and the
  // tint overlay interpolates it to a subtle range.
  const predPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!predLive) { predPulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(predPulse, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(predPulse, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [predLive]);
  // While live but flat (no winning colour yet), pulse a neutral brand tint.
  const predPulseColor = predGlow ?? (predLive ? colors.brand : null);

  // Global leaderboard, previewed on the Leaderboard card below (your standing
  // + the top 3). Kept whole so we can find the player's own rank.
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  useEffect(() => {
    fetchGlobalLeaderboard().then(setBoard);
    let unsub: () => void = () => {};
    subscribeToGlobalLeaderboard(setBoard).then(u => { unsub = u; });
    return () => unsub();
  }, []);
  const top3 = board.slice(0, 3);
  const myBoardIdx = board.findIndex(r => !!userId && (r.owner ? r.owner.split('::')[0] : '') === userId);
  const myBoardRow = myBoardIdx >= 0 ? board[myBoardIdx] : null;

  // Live-tournament carousel: one card at a time, swipe left/right to cycle with
  // wraparound, with a sliding transition. The card tracks the finger (slideX),
  // then on release either snaps back or slides fully out while the next card
  // slides in from the opposite edge. liveLenRef holds the current count so the
  // once-created PanResponder always wraps against the latest length. animatingRef
  // blocks a new swipe mid-transition.
  const [liveIdx, setLiveIdx] = useState(0);
  // True while a horizontal carousel swipe is in progress. Used to hard-disable
  // the screen's vertical scroll for the duration, so an in-flight left/right
  // swipe can't also scroll the page up/down.
  const [swiping, setSwiping] = useState(false);
  const liveLenRef = useRef(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);
  const livePan = useRef(
    PanResponder.create({
      // Only grab the gesture once it's a deliberate, clearly-horizontal swipe —
      // a larger dx threshold plus a strong horizontal-over-vertical ratio (and a
      // hard cap on vertical travel) keeps the outer vertical ScrollView in charge
      // of any up/down motion, so scrolling no longer snags the live cards.
      onMoveShouldSetPanResponder: (_, g) =>
        !animatingRef.current &&
        Math.abs(g.dx) > 24 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2.5 &&
        Math.abs(g.dy) < 18,
      // Once we've grabbed a horizontal swipe, lock it: don't hand the gesture
      // back to the vertical ScrollView (which is also disabled via `swiping`),
      // so you can't start scrolling up/down mid-swipe.
      onPanResponderGrant: () => setSwiping(true),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (!animatingRef.current) slideX.setValue(g.dx);
      },
      onPanResponderTerminate: () => {
        setSwiping(false);
        if (!animatingRef.current) Animated.spring(slideX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
      onPanResponderRelease: (_, g) => {
        setSwiping(false);
        const n = liveLenRef.current;
        // Commit on distance OR a quick flick (velocity), so a fast short swipe
        // still pages — a deliberate slow drag needs the 40px travel. vx is in
        // px/ms, same units as the web velocity threshold.
        const dir = (g.dx <= -40 || g.vx < -0.3) ? 1 : (g.dx >= 40 || g.vx > 0.3) ? -1 : 0;   // +1 = next, -1 = prev
        if (n < 2 || dir === 0) {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
          return;
        }
        animatingRef.current = true;
        // Slide the current card off in the swipe direction… strong ease-out
        // (cubic-bezier(0.23,1,0.32,1)) so the motion reads as responsive.
        Animated.timing(slideX, { toValue: -dir * SCREEN_W, duration: 160, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start(() => {
          // …swap to the neighbour, drop the incoming card just off the opposite
          // edge, then slide it into place.
          setLiveIdx(i => (i + dir + n) % n);
          slideX.setValue(dir * SCREEN_W);
          Animated.timing(slideX, { toValue: 0, duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start(() => {
            animatingRef.current = false;
          });
        });
      },
    }),
  ).current;

  // Prize label for a contest card — cash pool text, or the XP prize when cash
  // prizes are off.
  const prizeLabel = (c: Competition) =>
    CONTEST_CASH_PRIZES ? c.prizePool : `${c.prizeXp.toLocaleString()} XP`;

  // Selected duel length (default 1 day).
  const [duelDays, setDuelDays] = useState(1);
  // Selected contest-list pill tab.
  const [contestTab, setContestTab] = useState('All');

  const handleChallenge = async () => {
    if (duelBusy) return;
    // Dedupe: if I already have a duel waiting for an opponent (only me joined),
    // re-share its code instead of creating another contest.
    const pending = state.competitions.find(
      c => c.type === '1v1' && c.challengerHandle === state.user.handle && c.entryCount < 2,
    );
    if (pending) {
      const code = pending.inviteCode ?? '';
      try {
        await Share.share({ message: `Join my crypto trading duel! Open the app → Compete → 1v1, and enter code ${code}.` });
      } catch {}
      nav.navigate('TournamentDetail', { id: pending.id });
      return;
    }
    setDuelBusy(true);
    const nextNumber = state.duelsCreated + 1;
    const res = await createDuel(state.user.handle, STARTING_CASH, duelDays * DAY_MS, nextNumber);
    setDuelBusy(false);
    if (!res) { Alert.alert('Could not create duel', 'Please try again in a moment.'); return; }
    dispatch({ type: 'INCREMENT_DUELS_CREATED' });
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: res.competition.id });
    const code = res.competition.inviteCode ?? '';
    try {
      await Share.share({ message: `I challenge you to a ${duelDays}-day crypto trading duel! Open the app → Compete → 1v1, and enter code ${code}.` });
    } catch {}
    nav.navigate('TournamentDetail', { id: res.competition.id });
  };

  // Duel record from finished 1v1 contests I joined (win = I finished #1).
  const duelRecord = state.joinedTournamentIds.reduce(
    (acc, id) => {
      const comp = state.competitions.find(c => c.id === id);
      if (!comp || comp.type !== '1v1' || comp.status !== 'finished') return acc;
      const entries = [...(state.leaderboard[id] ?? [])].sort((a, b) => b.bankroll - a.bankroll);
      const myIdx = entries.findIndex(e => e.handle === state.user.handle);
      if (myIdx < 0) return acc;
      return myIdx === 0 ? { ...acc, wins: acc.wins + 1 } : { ...acc, losses: acc.losses + 1 };
    },
    { wins: 0, losses: 0 },
  );

  const handleAcceptDuel = async () => {
    if (duelBusy || !duelCode.trim()) return;
    setDuelBusy(true);
    const comp = await acceptDuel(duelCode, state.user.handle, STARTING_CASH);
    setDuelBusy(false);
    if (!comp) { Alert.alert('Invalid code', 'That duel code wasn’t found, or the duel is already full.'); return; }
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: comp.id });
    setDuelModalOpen(false);
    setDuelCode('');
    nav.navigate('TournamentDetail', { id: comp.id });
  };

  // Level-based XP bar: progress is measured against the current level only, so
  // it visibly resets on each level-up and shows the carried-over overflow.
  const lvl = levelForXp(state.user.xp);
  const xpInto = Math.round(lvl.xpIntoLevel);
  const xpForLevel = lvl.isMax ? xpInto : lvl.xpForLevel;
  const xpPct = lvl.fraction * 100;
  const seasonDay = computeSeasonDay();
  // Persisted daily-claim streak (updated by CLAIM_DAILY_REWARD, synced via
  // UserProfile.streak), so it's consistent with the Home reward card.
  const streak = state.user.streak;
  // The rank banner is tinted with the player's league colour (Bronze → Diamond).
  const lc = leagueColor(state.user.league);

  const liveComps = getLive();
  liveLenRef.current = liveComps.length;
  const safeLiveIdx = liveComps.length ? liveIdx % liveComps.length : 0;
  const currentLive = liveComps[safeLiveIdx];

  // Re-render once a second while a contest is in its final minute so the
  // "Ns left" countdown actually ticks down on screen.
  const [, setNowTick] = useState(0);
  const endingSoon = liveComps.some(c => { const ms = c.endAt - Date.now(); return ms > 0 && ms < 90_000; });
  useEffect(() => {
    if (!endingSoon) return;
    const id = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [endingSoon]);

  // Contest list filtered by the selected pill tab. The "Past" tab shows the
  // archived finished contests (their own table); every other tab shows the
  // live/open contests filtered by type.
  const isPastTab = contestTab === 'Past';
  const activeTabType = CONTEST_TABS.find(t => t.label === contestTab)?.type ?? null;
  const listComps = isPastTab
    ? state.finishedCompetitions
    : state.competitions
        .filter(c => c.status !== 'finished')
        .filter(c => !activeTabType || c.type === activeTabType)
        .sort((a, b) => a.endAt - b.endAt);

  // Current balance of the player's portfolio for a joined contest: cash + live
  // value of its holdings. The active contest's data lives at the top level of
  // state; the others are stashed in state.portfolios. Returns null if there's
  // no portfolio for it (i.e. not joined).
  const contestBalance = (id: string): number | null => {
    const slice = id === state.activePortfolioId
      ? { cash: state.cash, holdings: state.holdings }
      : state.portfolios[id];
    if (!slice) return null;
    const held = slice.holdings.reduce((sum, h) => {
      const price = state.coins.find(c => c.symbol === h.symbol)?.price ?? 0;
      return sum + h.units * price;
    }, 0);
    return slice.cash + held;
  };
  const fmtBalance = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const finalizeJoin = async (comp: Competition) => {
    await join(comp.id);
    Alert.alert('Joined!', `You're now in ${comp.name}. +10 XP`, [
      { text: 'Let\'s go!', onPress: () => nav.navigate('TournamentDetail', { id: comp.id }) },
    ]);
  };

  const handleJoin = async (comp: Competition) => {
    if (isJoined(comp.id)) {
      nav.navigate('TournamentDetail', { id: comp.id });
      return;
    }
    // Can't join a contest that's already over.
    if (comp.status === 'finished' || Date.now() >= comp.endAt) {
      Alert.alert(`${comp.name} has ended`, 'This contest is over — you can no longer join it.');
      return;
    }
    // Locked contests stop accepting players once they've started. (Other
    // contests can be joined live, and any contest can be pre-joined before it
    // opens.)
    if (comp.lockAfterStart && Date.now() >= comp.startAt) {
      Alert.alert(`${comp.name} is locked`, 'This contest already started and isn’t accepting new players.');
      return;
    }
    Alert.alert(
      `Join ${comp.name}`,
      `Stake: ${comp.stake}\n${CONTEST_CASH_PRIZES ? 'Prize pool' : 'Top prize'}: ${prizeLabel(comp)}\n\nYou'll start with a $${STARTING_CASH.toLocaleString()} simulated bankroll.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            // Re-check live before gating: the cached flag can lag a server-side
            // change (e.g. verified in another session), which would wrongly
            // pop the verify sheet at an already-verified user.
            const verified = emailVerified || (await refreshAttributes());
            if (!verified) {
              pendingJoin.current = comp;
              setVerifyOpen(true);
              return;
            }
            finalizeJoin(comp);
          },
        },
      ],
    );
  };

  // Contests are account-bound (entries, leaderboards, prizes all key off a
  // user). Guests get a sign-up wall instead of the live contest list.
  if (status === 'unauthenticated') {
    return (
      <AuthWall
        icon={Trophy}
        title="Enter the arena"
        subtitle="Create a free account to join daily contests, climb the leaderboard, and compete for prizes — all with simulated money."
      />
    );
  }

  return (
    <ScreenShell
      eyebrow="Contests"
      title="Compete"
      back={false}
      scrollEnabled={!swiping}
      onRefresh={refresh}
      rightActions={
        <TouchableOpacity style={{ padding: 8 }} onPress={() => nav.navigate('Notifications')}>
          <View style={{ position: 'relative' }}>
            <Bell color={colors.ink} size={20} strokeWidth={1.75} />
            <View style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.down }} />
          </View>
        </TouchableOpacity>
      }
    >
      {/* Season XP banner — tinted to the player's league */}
      <View style={{ backgroundColor: lc.bg, borderRadius: 18, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: `${lc.fg}99`, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {state.user.league} {state.user.division} · Day {seasonDay} of {SEASON_DURATION}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: lc.fg, fontVariant: ['tabular-nums'], marginTop: 4 }}>
              {xpInto.toLocaleString()} <Text style={{ fontSize: 13, fontWeight: '400', opacity: 0.6 }}>{lvl.isMax ? '/ MAX XP' : `/ ${xpForLevel.toLocaleString()} XP`}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: `${lc.fg}22`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 6, alignItems: 'center' }}>
            <Flame color={lc.fg} size={14} strokeWidth={1.75} />
            <Text style={{ color: lc.fg, fontSize: 12, fontWeight: '600' }}>{streak}d</Text>
          </View>
        </View>
        <View style={{ height: 6, backgroundColor: `${lc.fg}26`, borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${xpPct}%`, backgroundColor: lc.fg, borderRadius: 999 }} />
        </View>
      </View>

      {/* Live tournaments — one at a time; swipe left/right to cycle (wraps). */}
      {currentLive && (
        <View {...livePan.panHandlers}>
          <View style={{ overflow: 'hidden' }}>
          <Animated.View style={{ transform: [{ translateX: slideX }] }}>
          <TouchableOpacity
            key={currentLive.id}
            testID={`compete-live-${currentLive.id}`}
            onPress={() => nav.navigate('TournamentDetail', { id: currentLive.id })}
            activeOpacity={0.85}
          >
            <Card variant="noPad">
              <CardSection>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.down }} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Live · {timeRemaining(currentLive)}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => nav.navigate('TournamentDetail', { id: currentLive.id })}
                  >
                    {isJoined(currentLive.id) ? 'Live Details' : 'View'}
                  </Button>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{currentLive.name}</Text>
                    {isJoined(currentLive.id) && contestBalance(currentLive.id) != null ? (
                      <Text style={{ fontSize: 12, color: colors.ink2, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                        Your balance: ${fmtBalance(contestBalance(currentLive.id)!)}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>${(STARTING_CASH / 1000).toFixed(0)}K bankroll · No leverage</Text>
                    )}
                  </View>
                  {isJoined(currentLive.id) && state.activeTournament && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>#{state.activeTournament.userRank}</Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>
                    {currentLive.entryCount === 0
                      ? 'Be the first to join'
                      : `${currentLive.entryCount.toLocaleString()} ${currentLive.entryCount === 1 ? 'player' : 'players'}`}
                  </Text>
                  <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(currentLive)}</Text>
                </View>
              </CardSection>
            </Card>
          </TouchableOpacity>
          </Animated.View>
          </View>

          {/* Page dots — only when there's more than one live contest. */}
          {liveComps.length > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              {liveComps.map((c, i) => (
                <View
                  key={c.id}
                  style={{
                    width: i === safeLiveIdx ? 18 : 6, height: 6, borderRadius: 3,
                    backgroundColor: i === safeLiveIdx ? colors.brand : colors.hairline,
                  }}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Contests — pill-tab filtered list */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Contests</Text>
        <TouchableOpacity onPress={() => nav.navigate('Brackets')}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}>See all →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {CONTEST_TABS.map(t => {
          const active = contestTab === t.label;
          return (
            <TouchableOpacity
              key={t.label}
              testID={`contest-tab-${t.label}`}
              onPress={() => setContestTab(t.label)}
              activeOpacity={0.8}
              style={{
                paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
                borderColor: active ? colors.brand : colors.hairline,
                backgroundColor: active ? colors.brand : 'transparent',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.brandOn : colors.ink }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {contestTab === 'Replay' ? (() => {
        const replays = state.replayContests.filter(r => r.status !== 'finished').sort((a, b) => a.startAt - b.startAt);
        if (replays.length === 0) {
          return (
            <Card variant="tinted">
              <Text style={{ color: colors.ink3, fontSize: 13 }}>No replay contests right now — check back soon.</Text>
            </Card>
          );
        }
        return (
          <View style={{ gap: 10 }}>
            {replays.map(r => {
              const joined = isReplayJoined(r.id);
              const starts = r.startAt > Date.now();
              const dateLabel = new Date(r.histStartIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <PressableScale key={r.id} testID={`replay-card-${r.id}`} onPress={() => openReplay(r.id)}>
                  <Card variant="compact" style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Replay · {r.coin}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {r.status === 'live' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.down }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>Live</Text>
                          </View>
                        )}
                        {joined && <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 5 }}>Joined</Chip>}
                      </View>
                    </View>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{r.eventTitle}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>
                        {starts ? `Starts ${startsInLabel(r.startAt)}` : '7-day replay'} · from {dateLabel}
                        {r.lockAfterStart ? (starts ? ' · 🔒 locks at start' : ' · 🔒 locked') : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>{r.entryCount.toLocaleString()} / {r.maxPlayers.toLocaleString()} players</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{r.prizeXp.toLocaleString()} XP</Text>
                    </View>
                  </Card>
                </PressableScale>
              );
            })}
          </View>
        );
      })() : listComps.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            No {contestTab === 'All' ? '' : `${contestTab.toLowerCase()} `}contests right now — check back soon.
          </Text>
        </Card>
      ) : (() => {
        // Show 3 contests at a glance; once there are more, cap the height to ~3
        // cards and let the rest scroll inside their own area (nestedScrollEnabled
        // so it cooperates with ScreenShell's outer vertical ScrollView).
        const many = listComps.length > 3;
        const Wrapper: any = many ? ScrollView : View;
        const wrapperProps: any = many
          ? { style: { maxHeight: 360 }, nestedScrollEnabled: true, showsVerticalScrollIndicator: true, contentContainerStyle: { gap: 10 } }
          : { style: { gap: 10 } };
        return (
        <Wrapper {...wrapperProps}>
          {listComps.map(comp => (
            <PressableScale
              key={comp.id}
              testID={`compete-card-${comp.id}`}
              onPress={() => {
                // Finished, already joined, or locked-after-start → open the
                // detail screen read-only (the join CTA is hidden there). Only an
                // open, joinable contest routes through handleJoin's prompt.
                const isLocked = comp.lockAfterStart && Date.now() >= comp.startAt;
                if (comp.status === 'finished' || isJoined(comp.id) || isLocked) {
                  nav.navigate('TournamentDetail', { id: comp.id });
                } else {
                  handleJoin(comp);
                }
              }}
            >
              <Card variant="compact" style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {TYPE_LABEL[comp.type] ?? comp.type}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {comp.status === 'live' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.down }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>Live</Text>
                      </View>
                    )}
                    {isJoined(comp.id) && (
                      <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 5 }}>Joined</Chip>
                    )}
                  </View>
                </View>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{comp.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>
                    {comp.startAt > Date.now() ? `Starts ${startsInLabel(comp.startAt)}` : timeRemaining(comp)}
                    {comp.lockAfterStart ? (comp.startAt > Date.now() ? ' · 🔒 locks at start' : ' · 🔒 locked') : ''}
                  </Text>
                </View>
                {isJoined(comp.id) && contestBalance(comp.id) != null && (
                  <Text style={{ fontSize: 11, color: colors.ink2, fontVariant: ['tabular-nums'] }}>
                    Your balance: ${fmtBalance(contestBalance(comp.id)!)}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{comp.stake}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(comp)}</Text>
                </View>
              </Card>
            </PressableScale>
          ))}
        </Wrapper>
        );
      })()}

      {/* Top traders entry point — previews the leaderboard's top 3 */}
      <TouchableOpacity testID="compete-top-traders-link" onPress={() => nav.navigate('TopTraders')} activeOpacity={0.85}>
        <Card variant="tinted">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Global
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }}>
                Leaderboard
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.ink3 }}>›</Text>
          </View>

          {board.length > 0 ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              {/* Your position */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 26, textAlign: 'center', fontWeight: '800', fontSize: 13, color: colors.brand, fontVariant: ['tabular-nums'] }}>
                  {myBoardIdx >= 0 ? `#${myBoardIdx + 1}` : '—'}
                </Text>
                <Text style={{ flex: 1, fontWeight: '700', fontSize: 13, color: colors.ink }} numberOfLines={1}>
                  You · @{state.user.handle}
                </Text>
                <Text style={{ fontSize: 12, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                  {(myBoardRow?.xp ?? state.user.xp).toLocaleString()} XP · {myBoardRow?.contestsWon ?? 0}W
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.hairline }} />
              {/* Top 3 */}
              {top3.map((r, i) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 26, textAlign: 'center', fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'], color: i === 0 ? colors.up : colors.ink3 }}>
                    {i + 1}
                  </Text>
                  <Avatar
                    initials={r.handle.slice(0, 2).toUpperCase()}
                    size="sm"
                    style={r.avatarColor ? { backgroundColor: r.avatarColor } : undefined}
                  />
                  <Text style={{ flex: 1, fontWeight: '600', fontSize: 13, color: colors.ink }} numberOfLines={1}>
                    @{r.handle}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                    {r.xp.toLocaleString()} XP · {r.contestsWon}W
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              Live portfolio rankings — see where you stand
            </Text>
          )}
        </Card>
      </TouchableOpacity>
      {/* 1v1 Duel */}
      <Card variant="tinted">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.brand}14`, alignItems: 'center', justifyContent: 'center' }}>
            <Swords color={colors.brand} size={20} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Head-to-head
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }}>1v1 Duel</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              Challenge a friend — highest P&L over the duel wins
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Record</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              <Text style={{ color: colors.up }}>{duelRecord.wins}W</Text>
              {' · '}
              <Text style={{ color: colors.down }}>{duelRecord.losses}L</Text>
            </Text>
          </View>
        </View>

        {/* Duel length */}
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>
          Duel length
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {DUEL_DURATION_OPTIONS.map(opt => {
            const active = duelDays === opt.days;
            return (
              <TouchableOpacity
                key={opt.days}
                testID={`duel-length-${opt.days}`}
                onPress={() => setDuelDays(opt.days)}
                activeOpacity={0.8}
                style={{
                  flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: 'center',
                  borderWidth: 1,
                  borderColor: active ? colors.brand : colors.hairline,
                  backgroundColor: active ? colors.brand : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? colors.brandOn : colors.ink }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button testID="duel-challenge-btn" variant="brand" size="sm" style={{ flex: 1 }} loading={duelBusy} onPress={handleChallenge}>
            Challenge a friend
          </Button>
          <Button testID="duel-enter-code-btn" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => setDuelModalOpen(true)}>
            Enter a code
          </Button>
        </View>
      </Card>

      {/* Price-prediction mini-game */}
      <TouchableOpacity testID="compete-prediction-link" onPress={() => nav.navigate('Predict')} activeOpacity={0.85}>
        <Card
          variant="tinted"
          style={predGlow ? {
            borderWidth: 1.5,
            borderColor: predGlow,
            shadowColor: predGlow,
            shadowOpacity: 0.45,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          } : undefined}
        >
          {/* Pulsing background while a round is live (green/red winning, brand if flat). */}
          {predPulseColor && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: radius.lg,
                backgroundColor: predPulseColor,
                opacity: predPulse.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.25] }),
              }}
            />
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.brand}14`, alignItems: 'center', justifyContent: 'center' }}>
                <Target color={colors.brand} size={20} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: predLive ? colors.brand : colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {predLive ? 'Prediction live' : predExpired ? 'Prediction done' : 'Mini-game'}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }}>
                  Price prediction
                </Text>
                <Text style={{ fontSize: 12, color: predLive ? colors.brand : colors.ink3, marginTop: 2, fontWeight: predLive ? '700' : '400', fontVariant: ['tabular-nums'] }}>
                  {predLive
                    ? `${activePrediction!.symbol} ${activePrediction!.direction === 'up' ? '↑ Higher' : '↓ Lower'} · ${predMmss} left`
                    : predExpired
                      ? 'Tap to see your result'
                      : 'Higher or lower in 60s? Win XP'}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Record</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 }}>
                <Text style={{ color: colors.up }}>{state.predictionWins}W</Text>
                <Text style={{ color: colors.ink3 }}>{' · '}</Text>
                <Text style={{ color: colors.down }}>{state.predictionLosses}L</Text>
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Enter-a-duel-code modal */}
      <Modal visible={duelModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDuelModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Enter duel code</Text>
            <TouchableOpacity onPress={() => setDuelModalOpen(false)} style={{ padding: 6 }}>
              <X color={colors.ink} size={22} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              Paste the 6-character code your friend shared to join their duel.
            </Text>
            <TextInput
              testID="duel-code-input"
              value={duelCode}
              onChangeText={t => setDuelCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={colors.ink4}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={{
                backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
                fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center', color: colors.ink,
              }}
            />
            <Button variant="brand" loading={duelBusy} disabled={duelCode.trim().length < 4} onPress={handleAcceptDuel}>
              Join duel
            </Button>
          </View>
        </SafeAreaView>
      </Modal>

      <EmailVerificationModal
        visible={verifyOpen}
        reason="Verify your email to join this contest. We use it for prize notifications and account recovery."
        onClose={() => { setVerifyOpen(false); pendingJoin.current = null; }}
        onVerified={() => {
          setVerifyOpen(false);
          const comp = pendingJoin.current;
          pendingJoin.current = null;
          if (comp) finalizeJoin(comp);
        }}
      />
    </ScreenShell>
  );
}
