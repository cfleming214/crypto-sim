import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
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

  // Blocked users are removed from the leaderboard instantly.
  const visible = rows.filter(r => !isBlocked(r.owner));

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
        <Card variant="noPad">
          {visible.map((r, i) => {
            const isMe = !!userId && subOf(r.owner) === userId;
            return (
              <TouchableOpacity
                key={r.id}
                testID={`leaderboard-row-${r.rank}`}
                onPress={() => openTrader(r.owner)}
                activeOpacity={0.7}
              >
                <CardSection last={i === visible.length - 1}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: isMe ? `${colors.brand}0F` : undefined,
                    marginHorizontal: isMe ? -16 : 0, paddingHorizontal: isMe ? 16 : 0,
                  }}>
                    <Text style={{
                      width: 24, textAlign: 'center',
                      fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 13,
                      color: r.rank <= 3 ? colors.up : colors.ink3,
                    }}>
                      {r.rank}
                    </Text>
                    <Avatar
                      initials={r.handle.slice(0, 2).toUpperCase()}
                      size="default"
                      style={r.avatarColor ? { backgroundColor: r.avatarColor } : undefined}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }}>
                          @{r.handle}
                        </Text>
                        {isMe && <Chip variant="brand">You</Chip>}
                        {!!r.league && !isMe && <LeagueBadge league={r.league} />}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                        ${Math.round(r.value).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={{
                      fontWeight: '700', fontVariant: ['tabular-nums'],
                      color: r.pnlPct >= 0 ? colors.up : colors.down,
                    }}>
                      {r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(1)}%
                    </Text>
                    {!isMe && (
                      <TouchableOpacity
                        testID={`leaderboard-menu-${r.rank}`}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => openMenu({ owner: r.owner, handle: r.handle, context: 'leaderboard' })}
                        style={{ paddingLeft: 6, paddingVertical: 4 }}
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
      )}
    </ScreenShell>
  );
}
