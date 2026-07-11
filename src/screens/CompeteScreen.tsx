import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, Alert, Modal, TextInput, Share, ScrollView, PanResponder, Animated, Dimensions, Easing } from 'react-native';
import { Text } from '../components/ui/Text';
import { ConfettiBurst } from '../components/ui/ConfettiBurst';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar, CoinGlyph } from '../components/ui/Avatar';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { AuthWall } from '../components/AuthWall';
import { AdBanner } from '../components/AdBanner';
import { watchForReward } from '../lib/rewardedRewards';
import { track } from '../lib/analytics';
import { RecruiterCupBoard } from '../components/RecruiterCupBoard';
import { TradeMix24h } from '../components/TradeMix24h';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { leagueColor } from '../components/ui/LeagueBadge';
import { levelForXp } from '../services/gamification';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { createDuel, acceptDuel, isJoinLocked, DUEL_DURATION_OPTIONS, DAY_MS } from '../services/competitionService';
import { fetchGlobalLeaderboard, subscribeToGlobalLeaderboard, type LeaderboardRow } from '../services/leaderboardService';
import { fetchUnclaimed, claimPrize, type UnclaimedPrize } from '../services/walletService';
import { fetchLiveTrades, type LiveTradeRow } from '../services/liveTradeService';
import { CONTEST_CASH_PRIZES, STARTING_CASH, USER_ESCROW_CONTESTS_ENABLED } from '../constants/featureFlags';
import { createEscrowHold } from '../services/escrowService';
import { presentEscrowPayment } from '../lib/escrowPayment';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Clock, Flame, Bell, Trophy, Target, Swords, X, Rewind, ChevronRight, Users } from 'lucide-react-native';
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

// "12s" / "5m" / "2h" / "3d" since a trade executed.
function tradeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
  { label: 'Cup',      type: null },     // Recruiter Cup standings (referral leaderboard)
  { label: 'Past',     type: null },     // shows finished contests (separate table)
];

export function CompeteScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const { getLive, isJoined, join, timeRemaining, refresh, passes } = useCompetitions();
  // A replay contest: play the scenario on the Replay screen; your final result
  // is submitted as your entry. Open to all until the end date.
  const openReplay = (id: string) => {
    const summary = state.replayContests.find(c => c.id === id);
    if (summary && (summary.status === 'finished' || Date.now() >= summary.endAt)) return;
    nav.navigate('Replay', { contestId: id });
  };
  const { emailVerified, status, userId, refreshAttributes } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const pendingJoin = useRef<Competition | null>(null);
  const [duelModalOpen, setDuelModalOpen] = useState(false);
  const [duelCode, setDuelCode] = useState('');
  const [duelBusy, setDuelBusy] = useState(false);
  const [moneyDuelCents, setMoneyDuelCents] = useState(500); // gated escrow duel entry

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

  // Live-tournament carousel rendered as a real card DECK: the next contests sit
  // DIRECTLY BEHIND the top card (same footprint, fully covered at rest), so the
  // one underneath is only seen where the top card isn't covering it. The top card
  // tracks your finger (dragX); release past a threshold flings it off-screen and
  // recycles it to the bottom (revealing the card beneath as the new top), else it
  // springs back. liveLenRef holds the count so the once-created PanResponder wraps
  // against the latest length; animatingRef blocks input during the fling; `swiping`
  // hard-disables the page's vertical scroll during a horizontal drag.
  const [liveIdx, setLiveIdx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const liveLenRef = useRef(0);
  const dragX = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);
  const livePan = useRef(
    PanResponder.create({
      // Grab an early, clearly-horizontal drag so the card tracks the finger; leave
      // up/down motion to the outer vertical ScrollView.
      onMoveShouldSetPanResponder: (_, g) =>
        !animatingRef.current &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.8 &&
        Math.abs(g.dy) < 22,
      onPanResponderGrant: () => setSwiping(true),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (!animatingRef.current) dragX.setValue(g.dx); // follow the finger
      },
      onPanResponderTerminate: () => {
        setSwiping(false);
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
      onPanResponderRelease: (_, g) => {
        setSwiping(false);
        const n = liveLenRef.current;
        const commit = Math.abs(g.dx) >= 80 || Math.abs(g.vx) > 0.4;
        if (n < 2 || !commit || animatingRef.current) {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
          return;
        }
        const dir = (g.dx < 0 || g.vx < 0) ? -1 : 1; // continue off the swiped side
        animatingRef.current = true;
        Animated.timing(dragX, { toValue: dir * SCREEN_W * 1.25, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          setLiveIdx(i => (i + 1) % n);
          dragX.setValue(0); // the revealed card is already centred → becomes the new top
          animatingRef.current = false;
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

  // Unclaimed cash prizes (Payout rows not yet claimed into the balance). Drives
  // the "Unclaimed" pill + claim cards. Reloaded on focus so a freshly-settled
  // win appears when the user returns to the tab.
  const [unclaimed, setUnclaimed] = useState<UnclaimedPrize[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [prizeConfetti, setPrizeConfetti] = useState(0);
  const reloadUnclaimed = useCallback(() => {
    if (CONTEST_CASH_PRIZES) fetchUnclaimed().then(setUnclaimed).catch(() => {});
  }, []);
  useFocusEffect(reloadUnclaimed);

  // The pill tabs — inject "Unclaimed" right after "All" when cash prizes are on.
  const contestTabs = useMemo(() => {
    if (!CONTEST_CASH_PRIZES) return CONTEST_TABS;
    const base = [...CONTEST_TABS];
    base.splice(1, 0, { label: 'Unclaimed', type: null });
    return base;
  }, []);

  // Global live-trades ticker — latest 25 across all users. To keep a burst (e.g.
  // many bots trading at once) from flooding the feed all at once, fetched trades
  // are pushed to a queue and REVEALED one per second, so the feed reads as a
  // steady stream instead of dumping 25 rows every poll.
  const [liveTrades, setLiveTrades] = useState<LiveTradeRow[]>([]);
  const tradeQueueRef = useRef<LiveTradeRow[]>([]);   // unseen, oldest-first, awaiting reveal
  const seenTradeIds = useRef<Set<string>>(new Set()); // already shown or queued
  const tickerPrimed = useRef(false);
  const reloadLiveTrades = useCallback(() => {
    fetchLiveTrades(25).then(rows => {
      const fresh = rows.filter(r => !seenTradeIds.current.has(r.id));
      if (!fresh.length) return;
      fresh.forEach(r => seenTradeIds.current.add(r.id));
      // Bound the seen-set so a long session can't grow it unbounded.
      if (seenTradeIds.current.size > 1000) {
        seenTradeIds.current = new Set([...seenTradeIds.current].slice(-500));
      }
      if (!tickerPrimed.current) {
        // First load: show immediately so the feed isn't empty while it drips.
        tickerPrimed.current = true;
        setLiveTrades(rows.slice(0, 25));
      } else {
        // Subsequent polls: enqueue oldest-first so the newest ends up on top
        // after the per-second reveal.
        tradeQueueRef.current.push(...fresh.reverse());
      }
    }).catch(() => {});
  }, []);
  // Poll the live-trade feed every 2s, but only while this screen is focused.
  useFocusEffect(useCallback(() => {
    reloadLiveTrades();
    const id = setInterval(reloadLiveTrades, 2_000);
    return () => clearInterval(id);
  }, [reloadLiveTrades]));
  // Reveal one queued trade per second — the "drip" that prevents flooding.
  useFocusEffect(useCallback(() => {
    const id = setInterval(() => {
      const next = tradeQueueRef.current.shift();
      if (next) setLiveTrades(prev => [next, ...prev].slice(0, 25));
    }, 1_000);
    return () => clearInterval(id);
  }, []));

  const handleClaimPrize = async (p: UnclaimedPrize) => {
    if (claimingId) return;
    setClaimingId(p.payoutId);
    const res = await claimPrize(p.payoutId);
    setClaimingId(null);
    if (res.ok) {
      setUnclaimed(prev => prev.filter(x => x.payoutId !== p.payoutId));
      setPrizeConfetti(t => t + 1);
      Alert.alert('Prize claimed 🎉', `$${(p.amountCents / 100).toFixed(2)} was added to your balance. Withdraw it from your Profile.`);
    } else {
      Alert.alert('Could not claim', res.error ?? 'Please try again in a moment.');
    }
  };

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

  // Create a user-funded ESCROW duel: create the contest, place the creator's
  // hold, and confirm it with the native PaymentSheet. Gated + sandbox-testable.
  const handleCreateMoneyDuel = async () => {
    if (duelBusy) return;
    setDuelBusy(true);
    try {
      const nextNumber = state.duelsCreated + 1;
      const res = await createDuel(state.user.handle, STARTING_CASH, duelDays * DAY_MS, nextNumber, moneyDuelCents);
      if (!res) { Alert.alert('Could not create duel', 'Please try again in a moment.'); return; }
      const hold = await createEscrowHold(res.competition.id, moneyDuelCents);
      if (!hold.ok || !hold.clientSecret) { Alert.alert('Payment setup failed', hold.error ?? 'Please try again.'); return; }
      const pay = await presentEscrowPayment(hold.clientSecret);
      if (!pay.ok) {
        if (!pay.canceled) Alert.alert('Payment failed', pay.error ?? 'Please try again.');
        return; // hold unconfirmed → contest left unfunded; the settle sweep skips it
      }
      dispatch({ type: 'INCREMENT_DUELS_CREATED' });
      dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: res.competition.id });
      const code = res.competition.inviteCode ?? '';
      try { await Share.share({ message: `I challenge you to a $${(moneyDuelCents / 100).toFixed(0)} crypto duel — winner takes the pot! Open the app → Compete → 1v1, enter code ${code}.` }); } catch {}
      nav.navigate('TournamentDetail', { id: res.competition.id });
    } finally {
      setDuelBusy(false);
    }
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

  // Replay contests (separate table/shape). Rendered both under the dedicated
  // "Replay" tab and — for discoverability — under "All". `mode` decides the
  // empty state: the tab shows a placeholder card; "All" simply omits the
  // section when there are none.
  const renderReplayContests = (mode: 'tab' | 'all') => {
    const replays = state.replayContests.filter(r => r.status !== 'finished').sort((a, b) => a.startAt - b.startAt);
    if (replays.length === 0) {
      return mode === 'tab' ? (
        <Card variant="tinted">
          <Text style={{ color: colors.ink3, fontSize: 13 }}>No replay contests right now — check back soon.</Text>
        </Card>
      ) : null;
    }
    // Under "All" the replay cards are brand-bordered so they stand out among
    // the regular contests; under their own tab they don't need the accent.
    const highlight = mode === 'all';
    return (
      <View style={{ gap: 10 }}>
        {mode === 'all' && (
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 4 }}>Replay contests</Text>
        )}
        {replays.map(r => {
          const endsMs = r.endAt - Date.now();
          const endLabel = endsMs <= 0 ? 'Ended' : endsMs < DAY_MS ? `${Math.ceil(endsMs / (60 * 60 * 1000))}h left` : `${Math.ceil(endsMs / DAY_MS)}d left`;
          return (
            <PressableScale key={r.id} testID={`replay-card-${r.id}`} onPress={() => openReplay(r.id)}>
              <Card variant="compact" style={{ gap: 6, ...(highlight ? { borderWidth: 1, borderColor: colors.brand } : {}) }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Replay contest · {r.coin}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.up, textTransform: 'uppercase', letterSpacing: 0.5 }}>Play to enter</Text>
                </View>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{r.eventTitle}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>
                    Play the scenario, submit your score · {endLabel}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{r.entryCount.toLocaleString()} entries</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{r.prizeXp.toLocaleString()} XP</Text>
                </View>
              </Card>
            </PressableScale>
          );
        })}
      </View>
    );
  };

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

  // The player's live standing in a joined contest, derived from the subscribed
  // leaderboard (state.leaderboard[id], kept fresh by subscribeToLeaderboard).
  // Sorted by bankroll so the rank matches what the leaderboard shows. Returns
  // null until the board has loaded / the player's entry appears.
  const contestStanding = (id: string): { rank: number; total: number } | null => {
    const entries = state.leaderboard[id];
    if (!entries || entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    const idx = sorted.findIndex(e => e.handle === state.user.handle);
    if (idx < 0) return null;
    return { rank: idx + 1, total: sorted.length };
  };

  // Joined-contest summary shown on the contest card: live leaderboard rank +
  // current portfolio balance and P&L. Returns null until either is known.
  const renderJoinedStanding = (id: string) => {
    const bal = contestBalance(id);
    const standing = contestStanding(id);
    if (bal == null && !standing) return null;
    const pnlPct = bal != null ? ((bal - STARTING_CASH) / STARTING_CASH) * 100 : null;
    const up = (pnlPct ?? 0) >= 0;
    const rankText = standing ? `#${standing.rank} of ${standing.total}` : '—';
    const balText = bal != null ? `$${fmtBalance(bal)}` : '—';
    const pnlText = pnlPct != null ? ` ${up ? '+' : ''}${pnlPct.toFixed(1)}%` : '';
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }}>
        <View>
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 1 }}>{rankText}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Balance</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 1 }}>
            {balText}
            <Text style={{ fontSize: 11, fontWeight: '700', color: up ? colors.up : colors.down }}>{pnlText}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const finalizeJoin = async (comp: Competition) => {
    const res = await join(comp.id);
    if (res.ok) {
      track('contest_joined', { contestId: comp.id, contestType: comp.type, prizeXp: comp.prizeXp });
      Alert.alert('Joined!', `You're now in ${comp.name}. +10 XP`, [
        { text: 'Let\'s go!', onPress: () => nav.navigate('TournamentDetail', { id: comp.id }) },
      ]);
      return;
    }
    // Out of passes — Lane A (virtual) contests cost an entry pass. Offer to earn
    // one via a rewarded ad (never sold), then retry the join. Lane B never lands
    // here: cash-contest entry is free and join() returns ok without a pass.
    // The durable cloud entry couldn't be created (network/auth) — no pass was
    // spent. Tell the user to retry rather than silently doing nothing.
    if (res.reason === 'failed') {
      Alert.alert("Couldn't join", `We couldn't enroll you in ${comp.name} just now — your pass wasn't used. Check your connection and try again.`);
      return;
    }
    if (res.reason === 'needs-pass') {
      Alert.alert(
        'Out of contest passes',
        `You get free passes each week. Watch a short video to earn another and join ${comp.name} now?`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Watch & earn a pass',
            onPress: async () => {
              const { granted, blocked } = await watchForReward('rewardedPass', dispatch, { grantOnUnavailable: true });
              if (blocked) return; // duplicate trigger while an ad is up — ignore
              if (granted) finalizeJoin(comp);
              else Alert.alert('No pass earned', "The video didn't finish, so no pass was added.");
            },
          },
        ],
      );
    }
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
    // Joining closes once the contest locks at start or passes its join cutoff
    // (e.g. only 10% of the duration left). Contests can otherwise be joined live
    // or pre-joined before they open.
    if (isJoinLocked(comp)) {
      Alert.alert(`${comp.name} — joining closed`, 'This contest is no longer accepting new players.');
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
              track('email_verification_required');
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

      {/* Season Pass — directly under the level card for quick access to tier rewards */}
      <TouchableOpacity testID="compete-season-pass" onPress={() => nav.navigate('Season')} activeOpacity={0.85}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.brand}14`, alignItems: 'center', justifyContent: 'center' }}>
            <Trophy color={colors.brand} size={22} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>Season Pass</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }} numberOfLines={1}>Claim tier rewards as you level up</Text>
          </View>
          <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
        </Card>
      </TouchableOpacity>

      {/* Live tournaments — a card deck; drag the top card off to reveal the next. */}
      {currentLive && (() => {
        const n = liveComps.length;
        const at = (k: number) => liveComps[(safeLiveIdx + k) % n];
        // Slight tilt as the top card tracks the finger, for a natural throw feel.
        const topRotate = dragX.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-7deg', '0deg', '7deg'] });
        const renderLiveCard = (comp: typeof currentLive, interactive: boolean) => (
          <TouchableOpacity
            testID={interactive ? `compete-live-${comp.id}` : undefined}
            onPress={() => nav.navigate('TournamentDetail', { id: comp.id })}
            activeOpacity={0.85}
            disabled={!interactive}
          >
            <Card variant="noPad">
              <CardSection last>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.down }} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Live · {timeRemaining(comp)}
                    </Text>
                  </View>
                  <Button variant="ghost" size="sm" onPress={() => nav.navigate('TournamentDetail', { id: comp.id })}>
                    {isJoined(comp.id) ? 'Live Details' : 'View'}
                  </Button>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{comp.name}</Text>
                    {isJoined(comp.id) && contestBalance(comp.id) != null ? (
                      <Text style={{ fontSize: 12, color: colors.ink2, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                        Your balance: ${fmtBalance(contestBalance(comp.id)!)}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>${(STARTING_CASH / 1000).toFixed(0)}K bankroll · No leverage</Text>
                    )}
                  </View>
                  {isJoined(comp.id) && state.activeTournament && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>#{state.activeTournament.userRank}</Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>
                    {comp.entryCount === 0
                      ? 'Be the first to join'
                      : `${comp.entryCount.toLocaleString()} ${comp.entryCount === 1 ? 'player' : 'players'}`}
                  </Text>
                  <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(comp)}</Text>
                </View>
              </CardSection>
            </Card>
          </TouchableOpacity>
        );
        return (
          <View {...livePan.panHandlers}>
            <View>
              {/* Card directly BEHIND the top (same footprint) — only seen where the
                  top card isn't covering it, i.e. revealed as you swipe the top off. */}
              {n > 1 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
                  {renderLiveCard(at(1), false)}
                </View>
              )}
              {/* Top card — tracks the finger (dragX) with a slight tilt; in-flow so it
                  sets the deck height; the tappable one. */}
              <Animated.View style={{ zIndex: 2, transform: [{ translateX: dragX }, { rotate: topRotate }] }}>
                {renderLiveCard(at(0), true)}
              </Animated.View>
            </View>

            {/* Page dots (few) or an "n / total" counter (many), like a card deck. */}
            {n > 1 && (
              n <= 6 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 }}>
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
              ) : (
                <View style={{ alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                    {safeLiveIdx + 1} / {liveComps.length}
                  </Text>
                </View>
              )
            )}
          </View>
        );
      })()}

      {/* Contests — pill-tab filtered list */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Contests</Text>
        <TouchableOpacity onPress={() => nav.navigate('Brackets')}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}>See all →</Text>
        </TouchableOpacity>
      </View>

      {/* Contest passes — one free each week; watch a rewarded ad to earn more.
          Passes gate entry to virtual (XP) contests only; cash contests are free. */}
      <Card variant="tinted">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>🎟️</Text>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                {passes.balance} contest {passes.balance === 1 ? 'pass' : 'passes'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>Free passes weekly · watch to earn more</Text>
            </View>
          </View>
          <Button
            size="sm"
            variant="surface"
            onPress={async () => {
              const { granted, blocked } = await watchForReward('rewardedPass', dispatch, { grantOnUnavailable: true });
              if (blocked) return; // duplicate trigger while an ad is up — ignore
              if (!granted) Alert.alert('No pass earned', "The video didn't finish, so no pass was added.");
            }}
          >
            Watch +1
          </Button>
        </View>
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {contestTabs.map(t => {
          const active = contestTab === t.label;
          const badge = t.label === 'Unclaimed' && unclaimed.length > 0 ? unclaimed.length : null;
          return (
            <TouchableOpacity
              key={t.label}
              testID={`contest-tab-${t.label}`}
              onPress={() => setContestTab(t.label)}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
                borderColor: active ? colors.brand : colors.hairline,
                backgroundColor: active ? colors.brand : 'transparent',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.brandOn : colors.ink }}>{t.label}</Text>
              {badge != null && (
                <View style={{ minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.brandOn : colors.up }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: active ? colors.brand : colors.brandOn }}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Replay contests are featured at the top of "All" (highlighted) so they
          surface without hunting for the dedicated Replay tab. */}
      {contestTab === 'All' && renderReplayContests('all')}

      <ConfettiBurst trigger={prizeConfetti} />

      {contestTab === 'Unclaimed' ? (
        unclaimed.length === 0 ? (
          <Card variant="tinted">
            <Text style={{ color: colors.ink3, fontSize: 13 }}>
              No unclaimed prizes. Win a cash contest and your prize shows up here to claim.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {unclaimed.map(p => {
              const place = p.rank === 1 ? '1st place' : p.rank === 2 ? '2nd place' : p.rank === 3 ? '3rd place' : `Rank #${p.rank ?? '?'}`;
              return (
                <Card key={p.payoutId} variant="compact" style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.upSoft }}>
                      <Trophy color={colors.up} size={20} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={1}>{p.competitionName || 'Contest prize'}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{place} · prize to claim</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.up, fontVariant: ['tabular-nums'] }}>
                      ${(p.amountCents / 100).toFixed(2)}
                    </Text>
                  </View>
                  <Button
                    testID={`claim-prize-${p.payoutId}`}
                    variant="brand"
                    fullWidth
                    loading={claimingId === p.payoutId}
                    disabled={claimingId === p.payoutId}
                    onPress={() => handleClaimPrize(p)}
                  >
                    {claimingId === p.payoutId ? 'Claiming…' : 'Claim to balance'}
                  </Button>
                </Card>
              );
            })}
            <Text style={{ fontSize: 12, color: colors.ink4, textAlign: 'center', paddingHorizontal: 16 }}>
              Claimed prizes land in your balance — withdraw them from Profile once your Stripe payout details are set up.
            </Text>
          </View>
        )
      ) : contestTab === 'Replay' ? renderReplayContests('tab')
      : contestTab === 'Cup' ? <RecruiterCupBoard />
      : listComps.length === 0 ? (
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
                // Finished, already joined, or join-locked → open the detail
                // screen read-only (the join CTA is hidden there). Only an open,
                // joinable contest routes through handleJoin's prompt.
                const isLocked = isJoinLocked(comp);
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
                    {comp.startAt > Date.now() && comp.lockAfterStart ? ' · 🔒 locks at start'
                      : isJoinLocked(comp) ? ' · 🔒 joining closed' : ''}
                  </Text>
                </View>
                {isJoined(comp.id) && renderJoinedStanding(comp.id)}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{comp.stake}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Users color={colors.ink3} size={12} strokeWidth={1.75} />
                    <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>
                      {comp.entryCount.toLocaleString()}{comp.maxPlayers > 0 ? `/${comp.maxPlayers.toLocaleString()}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(comp)}</Text>
                </View>
              </Card>
            </PressableScale>
          ))}
        </Wrapper>
        );
      })()}

      {/* Live trades — the last 25 trades executed across all players. Always
          rendered so the feature never silently vanishes when the feed is empty. */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.up }} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Live trades</Text>
        </View>
        {liveTrades.length === 0 ? (
          <Card variant="tinted">
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              No trades yet — be the first to trade and you'll show up here.
            </Text>
          </Card>
        ) : (
          <Card variant="noPad">
            <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {liveTrades.map((t, i) => {
                const buy = t.side === 'buy';
                const units = t.units < 1 ? t.units.toFixed(4) : t.units.toFixed(2);
                return (
                  <CardSection key={t.id} last={i === liveTrades.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <CoinGlyph symbol={t.symbol} size={30} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                          {t.handle}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }} numberOfLines={1}>
                          {buy ? 'Bought' : 'Sold'} {units} {t.symbol}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: buy ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                          {buy ? '+' : '−'}${t.amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.ink4, marginTop: 1 }}>{tradeAgo(t.tradedAt)} ago</Text>
                      </View>
                    </View>
                  </CardSection>
                );
              })}
            </ScrollView>
          </Card>
        )}
      </View>

      {/* Top-5 most-traded coins over the last 24h (share of all trades). */}
      <TradeMix24h />

      {/* AdMob banner — real unit in production (AD_UNITS.banner), test ad in dev.
          No-ops in Expo Go / web. */}
      <AdBanner />

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
                  {(myBoardRow?.xp ?? state.user.xp).toLocaleString()} XP · {myBoardRow?.contestsWon ?? state.myContestWins}W
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

        {/* Gated user-funded money duel (escrow). Only shows when the flag is on. */}
        {USER_ESCROW_CONTESTS_ENABLED && (
          <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Money duel · winner takes the pot
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {[500, 1000, 2500].map(c => {
                const active = moneyDuelCents === c;
                return (
                  <TouchableOpacity
                    key={c}
                    testID={`duel-money-${c}`}
                    onPress={() => setMoneyDuelCents(c)}
                    activeOpacity={0.8}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: active ? colors.up : colors.hairline, backgroundColor: active ? colors.up : 'transparent' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.ink }}>${c / 100}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button testID="duel-money-btn" variant="brand" size="sm" style={{ marginTop: 10 }} loading={duelBusy} onPress={handleCreateMoneyDuel}>
              Create ${(moneyDuelCents / 100).toFixed(0)} duel — pot ${(moneyDuelCents * 2 / 100).toFixed(0)}
            </Button>
            <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6 }}>
              Sandbox test — use Stripe test card 4242 4242 4242 4242, any future expiry/CVC.
            </Text>
          </View>
        )}
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

      {/* Solo replay — opens the eras page (pick a scenario + your replay history) */}
      <TouchableOpacity testID="compete-solo-replay-link" onPress={() => nav.navigate('Replay')} activeOpacity={0.85}>
        <Card variant="tinted">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.brand}14`, alignItems: 'center', justifyContent: 'center' }}>
                <Rewind color={colors.brand} size={20} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Time machine</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }}>Solo replay</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Trade a real historical scenario at your own pace</Text>
              </View>
            </View>
            <ChevronRight color={colors.ink3} size={20} strokeWidth={1.75} />
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
