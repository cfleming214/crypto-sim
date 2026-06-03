import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { EmailVerificationModal } from '../components/EmailVerificationModal';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useCompetitions } from '../hooks/useCompetitions';
import { useNavigation } from '@react-navigation/native';
import { Clock, Flame, Bell } from 'lucide-react-native';
import type { Competition } from '../store/types';

const SEASON_DURATION = 30;
const SEASON_START = new Date('2026-05-01T00:00:00Z').getTime();

function computeSeasonDay(): number {
  const elapsed = Date.now() - SEASON_START;
  return Math.min(SEASON_DURATION, Math.max(1, Math.ceil(elapsed / 86400000)));
}

function computeStreak(tradeTimes: number[]): number {
  if (tradeTimes.length === 0) return 0;
  const days = new Set(
    tradeTimes.map(t => {
      const d = new Date(t);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    })
  );
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (days.has(key)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

const TYPE_LABEL: Record<string, string> = {
  daily: 'Daily',
  featured: 'Featured',
  replay: 'Replay',
  '1v1': '1v1',
};

export function CompeteScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();
  const { getLive, getOpen, isJoined, join, timeRemaining } = useCompetitions();
  const { emailVerified } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const pendingJoin = useRef<Competition | null>(null);

  const xp = state.user.xp;
  const xpGoal = 6000;
  const xpPct = Math.min(100, (xp / xpGoal) * 100);
  const seasonDay = computeSeasonDay();
  const derivedStreak = computeStreak(state.trades.map(t => t.timestamp)) || state.user.streak;

  const liveComps = getLive();
  const openComps = getOpen();
  const activeLive = liveComps[0];

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
      `Stake: ${comp.stake}\nPrize pool: ${comp.prizePool}\n\nYou'll start with a $10,000 simulated bankroll.`,
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

  return (
    <ScreenShell
      eyebrow="Contests"
      title="Compete"
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
            <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '600' }}>{derivedStreak}d</Text>
          </View>
        </View>
        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${xpPct}%`, backgroundColor: colors.brandOn, borderRadius: 999 }} />
        </View>
      </View>

      {/* Live tournament */}
      {activeLive && (
        <TouchableOpacity onPress={() => nav.navigate('TournamentDetail', { id: activeLive.id })} activeOpacity={0.85}>
          <Card variant="noPad">
            <CardSection>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.down }} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Live · {timeRemaining(activeLive)}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => nav.navigate('TournamentDetail', { id: activeLive.id })}
                >
                  {isJoined(activeLive.id) ? 'Resume' : 'View'}
                </Button>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
                <View>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{activeLive.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>$10K bankroll · No leverage</Text>
                </View>
                {isJoined(activeLive.id) && state.activeTournament && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>#{state.activeTournament.userRank}</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>
                  {activeLive.entryCount === 0
                    ? 'Be the first to join'
                    : `${activeLive.entryCount.toLocaleString()} ${activeLive.entryCount === 1 ? 'player' : 'players'}`}
                </Text>
                <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{activeLive.prizePool}</Text>
              </View>
            </CardSection>
          </Card>
        </TouchableOpacity>
      )}

      {/* Open brackets */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Open brackets</Text>
        <TouchableOpacity onPress={() => nav.navigate('Brackets')}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}>See all →</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {openComps.map(comp => (
          <TouchableOpacity
            key={comp.id}
            testID={`compete-card-${comp.id}`}
            style={{ width: '47.5%' }}
            onPress={() => handleJoin(comp)}
            activeOpacity={0.85}
          >
            <Card variant="compact" style={{ gap: 6, flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {TYPE_LABEL[comp.type] ?? comp.type}
                </Text>
                {isJoined(comp.id) && (
                  <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 5 }}>Joined</Chip>
                )}
              </View>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{comp.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{timeRemaining(comp)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{comp.stake}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{comp.prizePool}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      {/* Top traders entry point */}
      <TouchableOpacity testID="compete-top-traders-link" onPress={() => nav.navigate('TopTraders')} activeOpacity={0.85}>
        <Card variant="tinted">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Discover
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }}>
                Top traders
              </Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                Browse and copy the best performers
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.ink3 }}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>
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
