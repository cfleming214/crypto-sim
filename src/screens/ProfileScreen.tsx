import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useNavigation } from '@react-navigation/native';
import { MoreHorizontal, Star, Flame, Trophy, Shield, User, ArrowLeftRight, BarChart2, Moon, Bell, Activity } from 'lucide-react-native';

const achievements = [
  { Icon: Star,           name: 'First $',      earned: true  },
  { Icon: Flame,          name: '7-day streak', earned: true  },
  { Icon: Trophy,         name: 'Top 50',       earned: true  },
  { Icon: Shield,         name: 'Safe trader',  earned: true  },
  { Icon: User,           name: 'Copycat',      earned: true  },
  { Icon: ArrowLeftRight, name: '100 trades',   earned: true  },
  { Icon: BarChart2,      name: 'Diamond hands',earned: false },
  { Icon: Trophy,         name: 'Win bracket',  earned: false },
];

const seasons = [
  ['Season 3 · Bull Run', 'In progress · Diamond III', '+$847',  'up'],
  ['Season 2 · Sideways', 'Finished · Platinum I',     '+$420',  'up'],
  ['Season 1 · Genesis',  'Finished · Gold II',         '−$180', 'down'],
];

export function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();

  const stats = [
    ['All-time P&L', `+$${(state.bankroll - 10000).toFixed(0)}`, state.bankroll >= 10000 ? 'up' : 'down'],
    ['Tournaments', '17',     null],
    ['Win rate', '64%',       'up'],
    ['Followers', '128',      null],
    ['Copying', '3',          null],
    ['Best rank', '#4',       null],
  ];

  return (
    <ScreenShell
      title="Profile"
      rightActions={
        <TouchableOpacity style={{ padding: 8 }}>
          <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials={state.user.handle.slice(0, 2).toUpperCase()} size="xl" brand />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>@{state.user.handle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Chip variant="brand">{state.user.league} {state.user.division > 0 ? `${['', 'I', 'II', 'III', 'IV'][state.user.division]}` : ''}</Chip>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>Joined Mar '26</Text>
          </View>
        </View>
        <Button variant="ghost" size="sm">Edit</Button>
      </View>

      {/* Stat grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline }}>
        {stats.map(([label, value, type], i) => (
          <View
            key={label}
            style={{
              width: '33.33%',
              padding: 14,
              backgroundColor: colors.surface,
              alignItems: 'center',
              borderRightWidth: i % 3 !== 2 ? 1 : 0,
              borderRightColor: colors.hairline,
              borderTopWidth: i >= 3 ? 1 : 0,
              borderTopColor: colors.hairline,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
            <Text style={{ fontWeight: '700', fontSize: 15, color: type === 'up' ? colors.up : type === 'down' ? colors.down : colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* Quick links */}
      <Card variant="noPad">
        <TouchableOpacity onPress={() => nav.navigate('Notifications')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Bell color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Notifications</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </View>
          </CardSection>
        </TouchableOpacity>

        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Moon color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>Dark mode</Text>
            </View>
            <Switch value={isDark} onValueChange={toggle} trackColor={{ true: colors.brand, false: colors.surface2 }} />
          </View>
        </CardSection>

        <CardSection last>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Activity color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>XP this season</Text>
            </View>
            <Text style={{ fontWeight: '700', color: colors.up, fontVariant: ['tabular-nums'] }}>
              {state.user.xp.toLocaleString()} XP
            </Text>
          </View>
        </CardSection>
      </Card>

      {/* Achievements */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Achievements</Text>
        <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>12 / 48</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {achievements.map(({ Icon, name, earned }) => (
          <View key={name} style={{ width: '22%', alignItems: 'center', opacity: earned ? 1 : 0.35 }}>
            <View style={{
              width: '100%', aspectRatio: 1, borderRadius: 14,
              backgroundColor: earned ? colors.surface2 : 'transparent',
              borderWidth: 1,
              borderColor: earned ? colors.hairline : colors.hairlineStrong,
              borderStyle: earned ? 'solid' : 'dashed',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon color={earned ? colors.ink : colors.ink3} size={22} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6, textAlign: 'center' }}>{name}</Text>
          </View>
        ))}
      </View>

      {/* Season history */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Season history</Text>
      <Card variant="noPad">
        {seasons.map(([name, sub, pnl, type], i) => (
          <CardSection key={name as string} last={i === seasons.length - 1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{name}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
              </View>
              <Text style={{ fontWeight: '700', color: type === 'up' ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                {pnl}
              </Text>
            </View>
          </CardSection>
        ))}
      </Card>
    </ScreenShell>
  );
}
