import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, Modal, TextInput, ScrollView, Image, Share } from 'react-native';
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
import { MoreHorizontal, Star, Flame, Trophy, Shield, User, ArrowLeftRight, BarChart2, Moon, Bell, Activity, X, Camera, LogOut } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadAvatarPhoto, fetchActiveMirrorCount } from '../services/portfolioService';
import { isAmplifyConfigured } from '../lib/amplify';

const AVATAR_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B',
];

function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [handle, setHandle] = useState(state.user.handle);
  const [avatarColor, setAvatarColor] = useState(state.user.avatarColor);
  const [photoUri, setPhotoUri] = useState<string | null>(state.user.avatarUri ?? null);
  const [pickedLocalUri, setPickedLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set your avatar.', [{ text: 'OK' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
      setPickedLocalUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    dispatch({ type: 'SET_HANDLE', handle });
    dispatch({ type: 'SET_AVATAR_COLOR', color: avatarColor });

    // If the user picked a new local photo this session, upload it to S3
    if (pickedLocalUri) {
      if (isAmplifyConfigured) {
        const result = await uploadAvatarPhoto(pickedLocalUri);
        if (result) {
          dispatch({ type: 'SET_AVATAR', uri: result.url, key: result.key });
        } else {
          // Upload failed — fall back to local URI for this session
          dispatch({ type: 'SET_AVATAR_URI', uri: pickedLocalUri });
          Alert.alert('Upload failed', 'Your photo will only be visible on this device until you try again.', [{ text: 'OK' }]);
        }
      } else {
        // Offline mode — keep the local URI
        dispatch({ type: 'SET_AVATAR_URI', uri: pickedLocalUri });
      }
    }
    setSaving(false);
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
            <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8} style={{ position: 'relative' }}>
              {photoUri ? (
                <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden' }}>
                  <Image source={{ uri: photoUri }} style={{ width: 80, height: 80 }} />
                </View>
              ) : (
                <Avatar
                  initials={handle.slice(0, 2).toUpperCase() || '??'}
                  size="xl"
                  style={{ backgroundColor: avatarColor }}
                />
              )}
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: colors.brand,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: colors.surface,
              }}>
                <Camera color={colors.brandOn} size={13} strokeWidth={2} />
              </View>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>
              {photoUri ? 'Tap to change photo · or choose a color below' : 'Tap to upload photo · or choose a color'}
            </Text>
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

          <Button variant="brand" onPress={handleSave} disabled={saving} loading={saving}>
            Save changes
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


export function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const { state, dispatch } = useApp();
  const [editVisible, setEditVisible] = useState(false);
  const [activeMirrorCount, setActiveMirrorCount] = useState(0);

  // Refresh active mirror count on mount + whenever the user adds/removes one.
  // Mirror is owner-scoped so list() already returns only this user's rows.
  useEffect(() => {
    fetchActiveMirrorCount().then(setActiveMirrorCount);
  }, [state.joinedTournamentIds.length]); // re-fetch on join/leave as a cheap heuristic

  // "Win bracket" — any finished joined competition where the user ranked #1
  // on the live leaderboard.
  const hasWonBracket = state.joinedTournamentIds.some(cid => {
    const comp = state.competitions.find(c => c.id === cid);
    if (!comp || comp.status !== 'finished') return false;
    const entries = state.leaderboard[cid] ?? [];
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    return sorted[0]?.handle === state.user.handle;
  });

  // "Top 50" — best rank across joined competitions, computed live (no longer
  // depends on the removed activeTournament summary).
  const topRanks = state.joinedTournamentIds
    .map(cid => {
      const entries = state.leaderboard[cid] ?? [];
      const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
      const idx = sorted.findIndex(e => e.handle === state.user.handle);
      return idx >= 0 ? idx + 1 : null;
    })
    .filter((r): r is number => r !== null);
  const bestLiveRank = topRanks.length > 0 ? Math.min(...topRanks) : Infinity;

  const achievements = [
    { Icon: Star,           name: 'First $',       earned: state.trades.length > 0 },
    { Icon: Flame,          name: '7-day streak',  earned: state.user.streak >= 7 },
    { Icon: Trophy,         name: 'Top 50',        earned: bestLiveRank <= 50 },
    { Icon: Shield,         name: 'Safe trader',   earned: Object.keys(state.stopLosses).length > 0 },
    { Icon: User,           name: 'Copycat',       earned: activeMirrorCount > 0 },
    { Icon: ArrowLeftRight, name: '100 trades',    earned: state.trades.length >= 100 },
    { Icon: BarChart2,      name: 'Diamond hands', earned: state.holdings.length >= 4 },
    { Icon: Trophy,         name: 'Win bracket',   earned: hasWonBracket },
  ];
  const earnedCount = achievements.filter(a => a.earned).length;
  const { signOut, status } = useAuth();
  const nav = useNavigation<any>();

  const pnl = state.bankroll - 10000;
  const sellTrades = state.trades.filter(t => t.side === 'sell');
  const winRate = sellTrades.length > 0
    ? Math.round(sellTrades.filter(t => t.price > (state.holdings.find(h => h.symbol === t.symbol)?.avgCost ?? t.price)).length / sellTrades.length * 100)
    : 0;
  // Best rank across all joined contests: find this user's rank in each
  // live leaderboard, take the lowest (best) number.
  const myRanks: number[] = [];
  for (const cid of state.joinedTournamentIds) {
    const entries = state.leaderboard[cid] ?? [];
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    const idx = sorted.findIndex(e => e.handle === state.user.handle);
    if (idx >= 0) myRanks.push(idx + 1);
  }
  const bestRank = myRanks.length > 0 ? `#${Math.min(...myRanks)}` : '—';

  // Contest history: every contest the user has joined, with current bankroll,
  // P&L, live rank, and the prize they'd win if it ended right now.
  const contestHistory = state.joinedTournamentIds
    .map(id => {
      const comp = state.competitions.find(c => c.id === id);
      if (!comp) return null;
      const portfolio = state.portfolios[id];
      const slice = state.activePortfolioId === id
        ? { cash: state.cash, holdings: state.holdings }
        : (portfolio ?? { cash: 10000, holdings: [] });
      const bankroll = slice.cash + slice.holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const contestPnl = bankroll - 10000;
      const entries = state.leaderboard[id] ?? [];
      const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
      const myIdx = sorted.findIndex(e => e.handle === state.user.handle);
      const myRank = myIdx >= 0 ? myIdx + 1 : null;
      const prize = myRank && myRank <= comp.prizes.length ? comp.prizes[myRank - 1] : 0;
      return { comp, bankroll, pnl: contestPnl, myRank, prize };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.comp.startAt - a.comp.startAt);

  const handleShareProfile = async () => {
    const pnlStr = `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`;
    const divLabel = state.user.division > 0 ? ['', 'I', 'II', 'III', 'IV'][state.user.division] : '';
    const message =
      `@${state.user.handle} on Crypto Sim — ${pnlStr} all-time · ${state.user.league} ${divLabel}`.trim() +
      `\n${winRate}% win rate · ${state.user.xp.toLocaleString()} XP · ${state.user.streak}-day streak`;
    try {
      await Share.share({ message });
    } catch {
      // User cancelled or share unavailable — silent
    }
  };

  const stats = [
    ['All-time P&L', `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`, pnl >= 0 ? 'up' : 'down'],
    ['Tournaments', String(state.joinedTournamentIds.length), null],
    ['Win rate',    sellTrades.length > 0 ? `${winRate}%` : '—', sellTrades.length > 0 ? (winRate >= 50 ? 'up' : 'down') : null],
    ['Trades',      String(state.trades.length), null],
    ['XP',          state.user.xp.toLocaleString(), null],
    ['Best rank',   bestRank, null],
  ];

  return (
    <ScreenShell
      title="Profile"
      rightActions={
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => Alert.alert('More options', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share profile', onPress: handleShareProfile },
            {
              text: 'Reset demo ($10K)',
              onPress: () => Alert.alert(
                'Reset demo?',
                'Your bankroll and trades will be reset to $10,000. Profile settings are kept.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reset', style: 'destructive', onPress: () => dispatch({ type: 'RESET_DEMO' }) },
                ]
              ),
            },
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
        <Avatar initials={state.user.handle.slice(0, 2).toUpperCase() || '??'} size="xl" uri={state.user.avatarUri} style={{ backgroundColor: state.user.avatarColor }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>@{state.user.handle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Chip variant="brand">{state.user.league} {state.user.division > 0 ? `${['', 'I', 'II', 'III', 'IV'][state.user.division]}` : ''}</Chip>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>
              {state.user.createdAt
                ? `Joined ${new Date(state.user.createdAt).toLocaleDateString([], { month: 'short', year: '2-digit' })}`
                : 'New trader'}
            </Text>
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

      {/* Contest history */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Contest history</Text>
      {contestHistory.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ fontSize: 13, color: colors.ink3 }}>
            You haven't joined any contests yet. Head to Compete to find one.
          </Text>
        </Card>
      ) : (
        <Card variant="noPad">
          {contestHistory.map((row, i) => {
            const finished = row.comp.status === 'finished';
            const live = row.comp.status === 'live';
            return (
              <TouchableOpacity
                key={row.comp.id}
                activeOpacity={0.7}
                onPress={() => nav.navigate('TournamentDetail', { id: row.comp.id })}
              >
                <CardSection last={i === contestHistory.length - 1}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }}>
                          {row.comp.name}
                        </Text>
                        <View style={{
                          paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
                          backgroundColor: finished ? colors.surface2 : (live ? colors.upSoft : colors.surface2),
                        }}>
                          <Text style={{
                            fontSize: 10, fontWeight: '700', letterSpacing: 0.3,
                            color: finished ? colors.ink3 : (live ? colors.up : colors.ink3),
                            textTransform: 'uppercase',
                          }}>
                            {finished ? 'Finished' : (live ? 'Live' : 'Open')}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3, fontVariant: ['tabular-nums'] }}>
                        {row.myRank ? `#${row.myRank}` : 'Unranked'} · ${Math.round(row.bankroll).toLocaleString()} bankroll
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontWeight: '700', fontSize: 13,
                        color: row.pnl >= 0 ? colors.up : colors.down,
                        fontVariant: ['tabular-nums'],
                      }}>
                        {row.pnl >= 0 ? '+' : ''}${Math.abs(row.pnl).toFixed(0)}
                      </Text>
                      <Text style={{
                        fontSize: 11,
                        color: row.prize > 0 ? colors.up : colors.ink3,
                        fontVariant: ['tabular-nums'],
                        marginTop: 2,
                      }}>
                        {row.prize > 0
                          ? (finished ? `Won $${row.prize}` : `~$${row.prize} if ends now`)
                          : (finished ? 'No prize' : 'Out of money')}
                      </Text>
                    </View>
                  </View>
                </CardSection>
              </TouchableOpacity>
            );
          })}
        </Card>
      )}

      {/* Sign out */}
      {status !== 'unauthenticated' && (
        <TouchableOpacity
          onPress={() => Alert.alert(
            'Sign out?',
            `You'll be signed out of @${state.user.handle}. Your portfolio is saved in the cloud.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ],
          )}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, paddingVertical: 14, marginTop: 8,
            borderRadius: 12, borderWidth: 1, borderColor: colors.hairline,
            backgroundColor: colors.surface,
          }}
          activeOpacity={0.7}
        >
          <LogOut color={colors.down} size={18} strokeWidth={1.75} />
          <Text style={{ fontWeight: '600', color: colors.down }}>Sign out</Text>
        </TouchableOpacity>
      )}

      <EditProfileModal visible={editVisible} onClose={() => setEditVisible(false)} />
    </ScreenShell>
  );
}
