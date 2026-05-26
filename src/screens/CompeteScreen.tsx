import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useNavigation } from '@react-navigation/native';
import { Clock, Flame, Search, Bell } from 'lucide-react-native';

const tournaments = [
  { eyebrow: 'Daily',    title: 'Quick Sprint',   time: '5h left',  stake: 'Free',   prize: '500 XP' },
  { eyebrow: 'Featured', title: 'Memecoin Mania', time: '2d left',  stake: '100 XP', prize: '$500' },
  { eyebrow: 'Replay',   title: "Bull Run '21",   time: '7d',       stake: '500 XP', prize: '$2,000' },
  { eyebrow: '1v1',      title: 'Quick Match',    time: 'Instant',  stake: 'Free',   prize: 'XP' },
];

export function CompeteScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();

  const xp = state.user.xp;
  const xpGoal = 6000;
  const xpPct = Math.min(100, (xp / xpGoal) * 100);

  return (
    <ScreenShell
      eyebrow="Season 3 · Bull Run"
      title="Compete"
      rightActions={
        <>
          <TouchableOpacity style={{ padding: 8 }} onPress={() => nav.navigate('Notifications')}>
            <View style={{ position: 'relative' }}>
              <Bell color={colors.ink} size={20} strokeWidth={1.75} />
              <View style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.down }} />
            </View>
          </TouchableOpacity>
        </>
      }
    >
      {/* Season XP banner */}
      <View style={{ backgroundColor: colors.brand, borderRadius: 18, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}99`, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {state.user.league} {['', 'I', 'II', 'III'][state.user.division] ?? ''} · Day 12 of 30
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, fontVariant: ['tabular-nums'], marginTop: 4 }}>
              {xp.toLocaleString()} <Text style={{ fontSize: 13, fontWeight: '400', opacity: 0.6 }}>/ {xpGoal.toLocaleString()} XP</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 6, alignItems: 'center' }}>
            <Flame color={colors.brandOn} size={14} strokeWidth={1.75} />
            <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '600' }}>{state.user.streak}d</Text>
          </View>
        </View>
        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${xpPct}%`, backgroundColor: colors.brandOn, borderRadius: 999 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, color: `${colors.brandOn}99` }}>Promote to Master in 2 wins</Text>
          <Text style={{ fontSize: 11, color: `${colors.brandOn}99` }}>Top 8%</Text>
        </View>
      </View>

      {/* Live tournament */}
      <TouchableOpacity onPress={() => nav.navigate('TournamentDetail', { id: 'ww-1' })} activeOpacity={0.85}>
        <Card variant="noPad">
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.down }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.down, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Live · ends in 2h 14m
                </Text>
              </View>
              <Button variant="ghost" size="sm">Resume</Button>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>Weekend Warriors</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>$10K bankroll · No leverage</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your rank</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>#47</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {['JK', 'MA', 'TR', 'SP'].map((i, idx) => (
                  <Avatar key={i} initials={i} size="sm" style={{ marginLeft: idx === 0 ? 0 : -10, borderWidth: 1.5, borderColor: colors.surface }} />
                ))}
                <Text style={{ fontSize: 12, color: colors.ink3, marginLeft: 10 }}>+1,280 playing</Text>
              </View>
              <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>$5,000</Text>
            </View>
          </CardSection>
        </Card>
      </TouchableOpacity>

      {/* Brackets */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Open brackets</Text>
        <TouchableOpacity onPress={() => nav.navigate('League')}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}>See all →</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tournaments.map(t => (
          <TouchableOpacity key={t.title} style={{ width: '47.5%' }} onPress={() => nav.navigate('TournamentDetail', { id: t.title })} activeOpacity={0.85}>
            <Card variant="compact" style={{ gap: 6, flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.eyebrow}</Text>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{t.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock color={colors.ink3} size={12} strokeWidth={1.75} />
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{t.time}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{t.stake}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{t.prize}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </View>
    </ScreenShell>
  );
}
