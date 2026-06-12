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
import { useApp } from '../store/AppContext';
import { fetchGlobalLeaderboard, subscribeToGlobalLeaderboard, type LeaderboardRow } from '../services/leaderboardService';
import { presenceStatus } from '../services/presence';
import { fetchTraderByOwner } from '../services/portfolioService';
import { isAmplifyConfigured } from '../lib/amplify';
import { useModeration } from '../hooks/useModeration';

// Bare sub from an Amplify owner field ("sub" or "sub::username").
const subOf = (owner: string) => (owner ? owner.split('::')[0] : '');

export function TopTradersScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const { userId } = useAuth();
  const { state } = useApp();
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

  // The signed-in user's own standing for the summary card. Their rank reflects
  // the active sort; XP/wins come from their leaderboard row when ranked, else
  // fall back to local state (XP) so the card is still useful off the board.
  const myIndex = sorted.findIndex(r => !!userId && subOf(r.owner) === userId);
  const meRow = myIndex >= 0 ? sorted[myIndex] : null;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myXp = meRow?.xp ?? state.user.xp;
  const myWins = meRow?.contestsWon ?? 0;

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
          {/* Your standing summary — rank (in the active sort) + XP + wins */}
          <Card variant="tinted">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar
                initials={state.user.handle.slice(0, 2).toUpperCase()}
                size="default"
                uri={state.user.avatarUri}
                style={state.user.avatarColor && !state.user.avatarUri ? { backgroundColor: state.user.avatarColor } : undefined}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Your standing
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={1}>
                  @{state.user.handle}
                </Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                  {myXp.toLocaleString()} XP · {myWins} {myWins === 1 ? 'win' : 'wins'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                  {myRank ? `#${myRank}` : '—'}
                </Text>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>
                  {myRank ? `by ${sortBy.toLowerCase()}` : 'Unranked'}
                </Text>
              </View>
            </View>
          </Card>

          {/* Sort the board by lifetime XP or contests won. */}
          <Segmented options={['XP', 'Wins']} value={sortBy} onChange={(v) => setSortBy(v as 'XP' | 'Wins')} />
          {/* overflow:hidden clips each row's highlight tint to the card's rounded
              corners, so the top (and bottom) row's background fills the rounded
              corners instead of leaving square-rectangle gaps. */}
          <Card variant="noPad" style={{ overflow: 'hidden' }}>
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
                  <CardSection
                    last={i === sorted.length - 1}
                    style={isMe ? { backgroundColor: `${colors.brand}0F` } : undefined}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                        status={presenceStatus(r.lastActiveAt)}
                        style={r.avatarColor ? { backgroundColor: r.avatarColor } : undefined}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {/* flexShrink lets a long handle truncate instead of pushing
                              the league badge into the XP column. */}
                          <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                            @{r.handle}
                          </Text>
                          {isMe && <View style={{ flexShrink: 0 }}><Chip variant="brand">You</Chip></View>}
                          {!!r.league && !isMe && <View style={{ flexShrink: 0 }}><LeagueBadge league={r.league} /></View>}
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
                      {/* The ⋯ menu always renders so every row's XP/wins column
                          lines up identically; on your own row it's just made
                          invisible + non-interactive (an empty fixed-width View
                          didn't reliably reserve the column). */}
                      <TouchableOpacity
                        testID={isMe ? undefined : `leaderboard-menu-${rank}`}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={isMe}
                        onPress={isMe ? undefined : () => openMenu({ owner: r.owner, handle: r.handle, context: 'leaderboard' })}
                        style={{ paddingVertical: 4, paddingLeft: 4, opacity: isMe ? 0 : 1 }}
                      >
                        <MoreHorizontal color={colors.ink3} size={18} strokeWidth={1.75} />
                      </TouchableOpacity>
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
