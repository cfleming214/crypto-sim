import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { MoreHorizontal, Star, Flame, Trophy, Shield, User, ArrowLeftRight, BarChart2, Moon, Bell, Activity, X } from 'lucide-react-native';

const AVATAR_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B',
];

function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [handle, setHandle] = useState(state.user.handle);
  const [avatarColor, setAvatarColor] = useState(state.user.avatarColor);

  const handleSave = () => {
    dispatch({ type: 'SET_HANDLE', handle });
    dispatch({ type: 'SET_AVATAR_COLOR', color: avatarColor });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Edit profile</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}>
          {/* Avatar preview */}
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Avatar
              initials={handle.slice(0, 2).toUpperCase() || '??'}
              size="xl"
              style={{ backgroundColor: avatarColor }}
            />
            <Text style={{ fontSize: 12, color: colors.ink3 }}>Choose a color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setAvatarColor(c)}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: c,
                    borderWidth: 3,
                    borderColor: avatarColor === c ? colors.ink : 'transparent',
                  }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Handle input */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Handle</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <Text style={{ fontSize: 15, color: colors.ink3 }}>@</Text>
              <TextInput
                value={handle}
                onChangeText={t => setHandle(t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="yourhandle"
                placeholderTextColor={colors.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' }}
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Letters, numbers, underscores only · max 20 chars</Text>
          </View>

          <Button variant="brand" onPress={handleSave}>Save changes</Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


const seasons = [
  ['Season 3 · Bull Run', 'In progress · Diamond III', '+$847',  'up'],
  ['Season 2 · Sideways', 'Finished · Platinum I',     '+$420',  'up'],
  ['Season 1 · Genesis',  'Finished · Gold II',         '−$180', 'down'],
];

export function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const { state } = useApp();
  const [editVisible, setEditVisible] = useState(false);

  const achievements = [
    { Icon: Star,           name: 'First $',       earned: state.trades.length > 0 },
    { Icon: Flame,          name: '7-day streak',  earned: state.user.streak >= 7 },
    { Icon: Trophy,         name: 'Top 50',        earned: !!(state.activeTournament && state.activeTournament.userRank <= 50) },
    { Icon: Shield,         name: 'Safe trader',   earned: Object.keys(state.stopLosses).length > 0 },
    { Icon: User,           name: 'Copycat',       earned: false },
    { Icon: ArrowLeftRight, name: '100 trades',    earned: state.trades.length >= 100 },
    { Icon: BarChart2,      name: 'Diamond hands', earned: state.holdings.length >= 4 },
    { Icon: Trophy,         name: 'Win bracket',   earned: false },
  ];
  const earnedCount = achievements.filter(a => a.earned).length;
  const { signOut, status } = useAuth();
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
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => Alert.alert('More options', 'Share profile · Export trading history · Sign out', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share profile', onPress: () => Alert.alert('Share', 'Sharing coming soon!') },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => status !== 'unauthenticated' && signOut(),
            },
          ])}
        >
          <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials={state.user.handle.slice(0, 2).toUpperCase() || '??'} size="xl" style={{ backgroundColor: state.user.avatarColor }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>@{state.user.handle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Chip variant="brand">{state.user.league} {state.user.division > 0 ? `${['', 'I', 'II', 'III', 'IV'][state.user.division]}` : ''}</Chip>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>Joined Mar '26</Text>
          </View>
        </View>
        <Button variant="ghost" size="sm" onPress={() => setEditVisible(true)}>Edit</Button>
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

        <TouchableOpacity onPress={() => nav.navigate('Activity')}>
          <CardSection last>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Activity color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>XP this season</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', color: colors.up, fontVariant: ['tabular-nums'] }}>
                  {state.user.xp.toLocaleString()} XP
                </Text>
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </View>
          </CardSection>
        </TouchableOpacity>
      </Card>

      {/* Achievements */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Achievements</Text>
        <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>{earnedCount} / {achievements.length}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {achievements.map(({ Icon, name, earned }) => (
          <TouchableOpacity
            key={name}
            style={{ width: '22%', alignItems: 'center', opacity: earned ? 1 : 0.35 }}
            onPress={() => earned
              ? Alert.alert(name, 'Achievement unlocked! You earned this badge for your progress.', [{ text: 'Nice!' }])
              : Alert.alert(name, 'Keep trading to unlock this achievement!', [{ text: 'OK' }])
            }
            activeOpacity={0.75}
          >
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
          </TouchableOpacity>
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

      <EditProfileModal visible={editVisible} onClose={() => setEditVisible(false)} />
    </ScreenShell>
  );
}
