import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { fetchGlobalLeaderboard, subscribeToGlobalLeaderboard, type LeaderboardRow } from '../services/leaderboardService';
import { Filter } from 'lucide-react-native';

const DIVISION_LABELS = ['', 'I', 'II', 'III', 'IV'];

const DIVISION_PLAYERS = [
  { rank: 1,  handle: '@orca',      name: 'Diana K.',    pnl: '+71.4%', xpRaw: 12840, trend: 'up',   tag: 'promo' },
  { rank: 2,  handle: '@vega',      name: 'Marcus L.',   pnl: '+64.2%', xpRaw: 11210, trend: 'up',   tag: 'promo' },
  { rank: 3,  handle: '@bytestorm', name: 'Aliyah P.',   pnl: '+44.8%', xpRaw: 9820,  trend: 'up',   tag: 'promo' },
  { rank: 4,  handle: '@kestrel',   name: 'Theo R.',     pnl: '+29.0%', xpRaw: 8140,  trend: 'flat', tag: 'promo' },
  { rank: 5,  handle: '@quanto',    name: 'J. Sato',     pnl: '+22.3%', xpRaw: 7310,  trend: 'up',   tag: 'promo' },
  { rank: 6,  handle: '@mira',      name: 'Mira F.',     pnl: '+17.6%', xpRaw: 6490,  trend: 'flat', tag: null },
  { rank: 7,  handle: '@laserpat',  name: 'Pat A.',      pnl: '+12.1%', xpRaw: 5810,  trend: 'down', tag: null },
  { rank: 8,  handle: null,         name: null,          pnl: null,     xpRaw: null,  trend: 'flat', tag: 'you' },
  { rank: 9,  handle: '@nakamoto',  name: 'Sam G.',      pnl: '+7.0%',  xpRaw: 4610,  trend: 'down', tag: null },
  { rank: 10, handle: '@moonlord',  name: 'Casey T.',    pnl: '+4.1%',  xpRaw: 3870,  trend: 'flat', tag: null },
];

function PlayerRow({ rank, handle, name, pnl, xpRaw, trend, tag, last, userHandle, userXp, userPnlPct, userAvatarUri, userAvatarColor }: {
  rank: number; handle: string | null; name: string | null; pnl: string | null;
  xpRaw: number | null; trend: string; tag: string | null; last?: boolean;
  userHandle: string; userXp: number; userPnlPct: number;
  userAvatarUri?: string; userAvatarColor?: string;
}) {
  const { colors } = useTheme();
  const isMe = tag === 'you';
  const isPromo = tag === 'promo';

  const displayName = isMe ? userHandle : (name ?? '—');
  const displayHandle = isMe ? `@${userHandle}` : (handle ?? '');
  const displayXp = isMe ? userXp.toLocaleString() : (xpRaw?.toLocaleString() ?? '—');
  const displayPnl = isMe ? `${userPnlPct >= 0 ? '+' : ''}${userPnlPct.toFixed(1)}%` : (pnl ?? '—');
  const pnlPositive = displayPnl.startsWith('+');

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: isMe ? colors.surface2 : 'transparent',
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.hairline,
    }}>
      <Text style={{ width: 28, fontWeight: '700', color: rank <= 5 ? colors.up : colors.ink3, fontVariant: ['tabular-nums'], fontSize: 13 }}>
        {rank}
      </Text>
      <Avatar
        initials={displayName[0]?.toUpperCase() ?? '?'}
        size="sm"
        brand={isMe && !userAvatarUri && !userAvatarColor}
        uri={isMe ? userAvatarUri : undefined}
        style={isMe && userAvatarColor && !userAvatarUri ? { backgroundColor: userAvatarColor } : undefined}
      />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{displayName}</Text>
          {isPromo && <Chip variant="up" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>Promo</Chip>}
          {isMe && <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>You</Chip>}
        </View>
        <Text style={{ fontSize: 11, color: colors.ink3 }}>{displayHandle} · {displayXp} XP</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontWeight: '700', color: pnlPositive ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
          {displayPnl}
        </Text>
        <Text style={{ fontSize: 11, color: colors.ink3 }}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
        </Text>
      </View>
    </View>
  );
}

export function LeagueScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const [tab, setTab] = useState('Your division');
  const [globalTraders, setGlobalTraders] = useState<LeaderboardRow[]>([]);

  // Global tab: the precomputed GlobalLeaderboard (server-ranked by live value).
  // Same source as the Leaderboard screen — a cheap read of a bounded table,
  // not the per-trade PublicProfile fan-out.
  useEffect(() => {
    fetchGlobalLeaderboard().then(setGlobalTraders);
    let unsub: () => void = () => {};
    subscribeToGlobalLeaderboard(setGlobalTraders).then(u => { unsub = u; });
    return () => unsub();
  }, []);

  const pnlPct = ((state.bankroll - 10000) / 10000) * 100;
  const league = state.user.league;
  const div = DIVISION_LABELS[state.user.division] ?? '';
  const divisionLabel = `${league} ${div}`.trim();

  // "Your division" pulls live entries from the most recently joined
  // competition's leaderboard (subscribed real-time by AppContext).
  // Hide blocked users from every ranking. Leaderboard entries only carry a
  // handle, so match on that (BlockedUser stores both owner + handle).
  const isBlockedHandle = (handle: string) =>
    state.blockedUsers.some(b => b.handle === handle);

  const liveCompId = state.joinedTournamentIds[state.joinedTournamentIds.length - 1];
  const liveEntries = (liveCompId ? state.leaderboard[liveCompId] ?? [] : [])
    .filter(e => !isBlockedHandle(e.handle));
  const livePlayers = liveEntries.map(e => ({
    rank: e.rank,
    handle: e.handle.startsWith('@') ? e.handle : `@${e.handle}`,
    name: e.handle,
    pnl: `${e.pnlPct >= 0 ? '+' : ''}${e.pnlPct.toFixed(1)}%`,
    xpRaw: Math.max(0, Math.round(e.bankroll)),
    trend: e.pnlPct >= 0 ? 'up' : 'down',
    tag: e.handle === state.user.handle ? 'you' : null,
  }));

  // Global from real PublicProfile rows. Already sorted by pnlPct desc.
  const globalPlayers = globalTraders
    .filter(t => !state.blockedUsers.some(b => b.owner === t.owner || b.handle === t.handle))
    .map((t, idx) => ({
    rank: idx + 1,
    handle: `@${t.handle}`,
    name: t.handle,
    pnl: `${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%`,
    xpRaw: Math.round(t.value),
    trend: t.pnlPct >= 0 ? 'up' : 'down',
    tag: t.handle === state.user.handle ? 'you' : null,
  }));

  const players = tab === 'Friends' ? []
    : tab === 'Global' ? globalPlayers
    : (livePlayers.length > 0 ? livePlayers : DIVISION_PLAYERS);

  const liveYouEntry = liveEntries.find(e => e.handle === state.user.handle);
  const myGlobalIdx = globalTraders.findIndex(t => t.handle === state.user.handle);
  const userRank = tab === 'Global' ? (myGlobalIdx >= 0 ? myGlobalIdx + 1 : 0)
    : tab === 'Friends' ? 0
    : (liveYouEntry?.rank ?? 8);
  const totalPlayers = tab === 'Global' ? globalTraders.length
    : tab === 'Friends' ? 0
    : (liveEntries.length > 0 ? liveEntries.length : 30);
  const promoteCount = tab === 'Global' ? 0 : tab === 'Friends' ? 0 : 5;
  const demoteCount = tab === 'Global' ? 0 : tab === 'Friends' ? 0 : 5;

  return (
    <ScreenShell
      eyebrow={divisionLabel}
      title="League"
      rightActions={<Filter color={colors.ink} size={20} strokeWidth={1.75} />}
    >
      {/* Division banner */}
      <Card variant="tinted">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {tab === 'Global' ? 'Global ranking' : `Promotes in 2 · ends Sunday`}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 }}>
              {totalPlayers.toLocaleString()} players{promoteCount > 0 ? ` · top ${promoteCount} promote` : ''}
            </Text>
          </View>
          {tab !== 'Global' && (
            <View style={{ flexDirection: 'row' }}>
              {['O', 'V', 'B'].map((l, i) => (
                <Avatar key={l} initials={l} size="sm" style={{ marginLeft: i === 0 ? 0 : -8 }} />
              ))}
            </View>
          )}
        </View>

        {/* Ladder */}
        {tab !== 'Global' && (
          <>
            <View style={{ flexDirection: 'row', gap: 2, height: 8 }}>
              {Array.from({ length: Math.min(totalPlayers, 30) }).map((_, i) => {
                const pos = Math.round((userRank - 1) / (totalPlayers - 1) * (Math.min(totalPlayers, 30) - 1));
                let bg = colors.surface;
                if (i < promoteCount) bg = colors.up;
                else if (i === pos) bg = colors.brand;
                else if (demoteCount > 0 && i >= Math.min(totalPlayers, 30) - demoteCount) bg = colors.down;
                return (
                  <View key={i} style={{ flex: 1, height: 8, backgroundColor: bg, borderRadius: 2 }} />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>↑ Promote</Text>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>You · #{userRank}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>↓ Demote</Text>
            </View>
          </>
        )}

        {tab === 'Global' && (
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>You · #{userRank.toLocaleString()} of {totalPlayers.toLocaleString()}</Text>
          </View>
        )}
      </Card>

      {/* Tabs */}
      <Segmented
        options={['Your division', 'Friends', 'Global']}
        value={tab}
        onChange={setTab}
        variant="tabs"
      />

      {/* Rankings */}
      {tab === 'Friends' && players.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 16, color: colors.ink3 }}>No friends yet</Text>
          <Text style={{ fontSize: 13, color: colors.ink4, textAlign: 'center', paddingHorizontal: 40 }}>
            Friends-only rankings will appear once you connect with other traders.
          </Text>
        </View>
      ) : tab === 'Global' && players.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 16, color: colors.ink3 }}>No traders yet</Text>
          <Text style={{ fontSize: 13, color: colors.ink4 }}>Make a trade to appear on the global ranking</Text>
        </View>
      ) : (
        <Card variant="noPad">
          {players.map((p, i) => (
            <PlayerRow
              key={`${tab}-${p.rank}`}
              {...p}
              last={i === players.length - 1}
              userHandle={state.user.handle}
              userXp={state.user.xp}
              userPnlPct={pnlPct}
              userAvatarUri={state.user.avatarUri}
              userAvatarColor={state.user.avatarColor}
            />
          ))}
        </Card>
      )}
    </ScreenShell>
  );
}
