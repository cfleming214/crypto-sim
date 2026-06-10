import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, TextInput, Share, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { AuthWall } from '../components/AuthWall';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { createDuel, acceptDuel, DUEL_DURATION_OPTIONS, DAY_MS } from '../services/competitionService';
import { CONTEST_CASH_PRIZES } from '../constants/featureFlags';
import { useNavigation } from '@react-navigation/native';
import { Clock, Flame, Bell, Trophy, Target, Swords, X } from 'lucide-react-native';
import type { Competition } from '../store/types';

const SEASON_DURATION = 30;
const SEASON_START = new Date('2026-05-01T00:00:00Z').getTime();
// Width of a live-tournament card in its swipe carousel (small peek of the next).
const LIVE_CARD_W = Math.round(Dimensions.get('window').width * 0.86);

function computeSeasonDay(): number {
  const elapsed = Date.now() - SEASON_START;
  return Math.min(SEASON_DURATION, Math.max(1, Math.ceil(elapsed / 86400000)));
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
];

export function CompeteScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const { getLive, isJoined, join, timeRemaining, refresh } = useCompetitions();
  const { emailVerified, status } = useAuth();
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
    const res = await createDuel(state.user.handle, 10000, duelDays * DAY_MS, nextNumber);
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
    const comp = await acceptDuel(duelCode, state.user.handle, 10000);
    setDuelBusy(false);
    if (!comp) { Alert.alert('Invalid code', 'That duel code wasn’t found, or the duel is already full.'); return; }
    dispatch({ type: 'JOIN_TOURNAMENT', tournamentId: comp.id });
    setDuelModalOpen(false);
    setDuelCode('');
    nav.navigate('TournamentDetail', { id: comp.id });
  };

  const xp = state.user.xp;
  const xpGoal = 6000;
  const xpPct = Math.min(100, (xp / xpGoal) * 100);
  const seasonDay = computeSeasonDay();
  // Persisted daily-claim streak (updated by CLAIM_DAILY_REWARD, synced via
  // UserProfile.streak), so it's consistent with the Home reward card.
  const streak = state.user.streak;

  const liveComps = getLive();

  // Contest list (live + open, not finished) filtered by the selected pill tab.
  const activeTabType = CONTEST_TABS.find(t => t.label === contestTab)?.type ?? null;
  const listComps = state.competitions
    .filter(c => c.status !== 'finished')
    .filter(c => !activeTabType || c.type === activeTabType)
    .sort((a, b) => a.endAt - b.endAt);

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
    Alert.alert(
      `Join ${comp.name}`,
      `Stake: ${comp.stake}\n${CONTEST_CASH_PRIZES ? 'Prize pool' : 'Top prize'}: ${prizeLabel(comp)}\n\nYou'll start with a $10,000 simulated bankroll.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: () => {
            if (!emailVerified) {
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
      {/* Season XP banner */}
      <View style={{ backgroundColor: colors.brand, borderRadius: 18, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}99`, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {state.user.league} {['', 'I', 'II', 'III'][state.user.division] ?? ''} · Day {seasonDay} of {SEASON_DURATION}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, fontVariant: ['tabular-nums'], marginTop: 4 }}>
              {xp.toLocaleString()} <Text style={{ fontSize: 13, fontWeight: '400', opacity: 0.6 }}>/ {xpGoal.toLocaleString()} XP</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 6, alignItems: 'center' }}>
            <Flame color={colors.brandOn} size={14} strokeWidth={1.75} />
            <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '600' }}>{streak}d</Text>
          </View>
        </View>
        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${xpPct}%`, backgroundColor: colors.brandOn, borderRadius: 999 }} />
        </View>
      </View>

      {/* Live tournaments — swipe horizontally to cycle through them */}
      {liveComps.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={liveComps.length > 1 ? LIVE_CARD_W + 10 : undefined}
          decelerationRate="fast"
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        >
          {liveComps.map(live => (
            <TouchableOpacity
              key={live.id}
              testID={`compete-live-${live.id}`}
              style={{ width: liveComps.length > 1 ? LIVE_CARD_W : Dimensions.get('window').width - 40 }}
              onPress={() => nav.navigate('TournamentDetail', { id: live.id })}
              activeOpacity={0.85}
            >
              <Card variant="noPad">
                <CardSection>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.down }} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Live · {timeRemaining(live)}
                      </Text>
                    </View>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => nav.navigate('TournamentDetail', { id: live.id })}
                    >
                      {isJoined(live.id) ? 'Live Details' : 'View'}
                    </Button>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{live.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>$10K bankroll · No leverage</Text>
                    </View>
                    {isJoined(live.id) && state.activeTournament && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>#{state.activeTournament.userRank}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>
                      {live.entryCount === 0
                        ? 'Be the first to join'
                        : `${live.entryCount.toLocaleString()} ${live.entryCount === 1 ? 'player' : 'players'}`}
                    </Text>
                    <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(live)}</Text>
                  </View>
                </CardSection>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
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

      {listComps.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            No {contestTab === 'All' ? '' : `${contestTab.toLowerCase()} `}contests right now — check back soon.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {listComps.map(comp => (
            <TouchableOpacity
              key={comp.id}
              testID={`compete-card-${comp.id}`}
              onPress={() => isJoined(comp.id) ? nav.navigate('TournamentDetail', { id: comp.id }) : handleJoin(comp)}
              activeOpacity={0.85}
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
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{timeRemaining(comp)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{comp.stake}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{prizeLabel(comp)}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Top traders entry point */}
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
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                Live portfolio rankings — see where you stand
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.ink3 }}>›</Text>
          </View>
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
        <Card variant="tinted">
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
