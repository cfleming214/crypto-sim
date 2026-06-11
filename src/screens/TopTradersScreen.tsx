import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { LeagueBadge } from '../components/ui/LeagueBadge';
import { Avatar } from '../components/ui/Avatar';
import { MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { fetchGlobalLeaderboard, subscribeToGlobalLeaderboard, type LeaderboardRow } from '../services/leaderboardService';
import { fetchTraderByOwner } from '../services/portfolioService';
import { isAmplifyConfigured } from '../lib/amplify';
import { useModeration } from '../hooks/useModeration';

// Bare sub from an Amplify owner field ("sub" or "sub::username").
const subOf = (owner: string) => (owner ? owner.split('::')[0] : '');

export function TopTradersScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const { userId } = useAuth();
  const { isBlocked, openMenu } = useModeration();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'XP' | 'Wins'>('XP');

  // Blocked users are removed from the leaderboard instantly, then sorted by the
  // active metric. Rank is the position in this sorted list, so it always matches
  // what's on screen (and has no gaps from filtered-out blocked users).
  const visible = rows.filter(r => !isBlocked(r.owner));
  const sorted = [...visible].sort((a, b) =>
    sortBy === 'Wins'
      ? (b.contestsWon - a.contestsWon) || (b.xp - a.xp)
      : (b.xp - a.xp) || (b.contestsWon - a.contestsWon),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setRows(await fetchGlobalLeaderboard());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Cheap live updates: the leaderboard table is tiny and only the Lambda
    // writes it (~every 5 min), so this is a handful of events per refresh.
    let unsub: () => void = () => {};
    subscribeToGlobalLeaderboard(list => {
      setRows(list);
      setLoading(false);
    }).then(u => { unsub = u; });
    return () => unsub();
  }, [refresh]);

  // A leaderboard row carries the owner, not the PublicProfile id — resolve it
  // to open the trader's copy-trade detail.
  const openTrader = useCallback(async (owner: string) => {
    const trader = await fetchTraderByOwner(owner);
    if (trader) nav.navigate('CopyTrade', { traderId: trader.id });
  }, [nav]);

  return (
    <ScreenShell title="Leaderboard" eyebrow="Global" onRefresh={refresh}>
      {!isAmplifyConfigured && (
        <Card variant="tinted">
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            Sign in to a deployed sandbox to see the live leaderboard.
          </Text>
        </Card>
      )}

      {loading && rows.length === 0 && (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}

      {!loading && visible.length === 0 && isAmplifyConfigured && (
        <Card variant="tinted">
          <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 4 }}>No rankings yet</Text>
          <Text style={{ color: colors.ink3, fontSize: 13 }}>
            The leaderboard refreshes every few minutes. Make some trades and you'll show up here.
          </Text>
        </Card>
      )}

      {visible.length > 0 && (
        <>
          {/* Sort the board by lifetime XP or contests won. */}
          <Segmented options={['XP', 'Wins']} value={sortBy} onChange={(v) => setSortBy(v as 'XP' | 'Wins')} />
          <Card variant="noPad">
            {sorted.map((r, i) => {
              const isMe = !!userId && subOf(r.owner) === userId;
              const rank = i + 1;
              return (
                <TouchableOpacity
                  key={r.id}
                  testID={`leaderboard-row-${rank}`}
                  onPress={() => openTrader(r.owner)}
                  activeOpacity={0.7}
                >
                  <CardSection last={i === sorted.length - 1}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: isMe ? `${colors.brand}0F` : undefined,
                      marginHorizontal: isMe ? -16 : 0, paddingHorizontal: isMe ? 16 : 0,
                    }}>
                      {/* Rank (in the active sort) + name on the left */}
                      <Text style={{
                        width: 26, textAlign: 'center',
                        fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: 15,
                        color: rank <= 3 ? colors.up : colors.ink3,
                      }}>
                        {rank}
                      </Text>
                      <Avatar
                        initials={r.handle.slice(0, 2).toUpperCase()}
                        size="default"
                        style={r.avatarColor ? { backgroundColor: r.avatarColor } : undefined}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }} numberOfLines={1}>
                            @{r.handle}
                          </Text>
                          {isMe && <Chip variant="brand">You</Chip>}
                          {!!r.league && !isMe && <LeagueBadge league={r.league} />}
                        </View>
                      </View>
                      {/* XP + wins on the right; the active sort metric is emphasized */}
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{
                          fontVariant: ['tabular-nums'], fontSize: 14,
                          fontWeight: sortBy === 'XP' ? '800' : '500',
                          color: sortBy === 'XP' ? colors.ink : colors.ink3,
                        }}>
                          {r.xp.toLocaleString()} XP
                        </Text>
                        <Text style={{
                          fontVariant: ['tabular-nums'], fontSize: 12, marginTop: 1,
                          fontWeight: sortBy === 'Wins' ? '800' : '500',
                          color: sortBy === 'Wins' ? colors.ink : colors.ink3,
                        }}>
                          {r.contestsWon} {r.contestsWon === 1 ? 'win' : 'wins'}
                        </Text>
                      </View>
                      {!isMe && (
                        <TouchableOpacity
                          testID={`leaderboard-menu-${rank}`}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => openMenu({ owner: r.owner, handle: r.handle, context: 'leaderboard' })}
                          style={{ paddingLeft: 4, paddingVertical: 4 }}
                        >
                          <MoreHorizontal color={colors.ink3} size={18} strokeWidth={1.75} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </CardSection>
                </TouchableOpacity>
              );
            })}
          </Card>
        </>
      )}
    </ScreenShell>
  );
}
