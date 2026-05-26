import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeContext';
import { Trophy, Shield, User, Flame, Star } from 'lucide-react-native';

type NotifType = 'compete' | 'trade' | 'social';

const allNotifs = [
  { Icon: Trophy, color: 'up',   title: 'You moved up to #43',             sub: 'Weekend Warriors · 4 spots gained',       time: '2m',  unread: true,  type: 'compete' as NotifType },
  { Icon: Shield, color: 'warn', title: 'Trailing stop hit on ETH',         sub: 'Sold 0.4 ETH at $3,180 · locked +12%',   time: '11m', unread: true,  type: 'trade' as NotifType   },
  { Icon: User,   color: null,   title: '@degenking opened a new position', sub: 'Bought 2.4 BTC · you mirrored $200',      time: '24m', unread: true,  type: 'trade' as NotifType   },
  { Icon: Flame,  color: 'down', title: 'PEPE +18% in 1h',                  sub: 'On your watchlist · tap to trade',        time: '3h',  unread: false, type: 'trade' as NotifType   },
  { Icon: Trophy, color: null,   title: 'Memecoin Madness starts in 5h',    sub: '412 players already joined',              time: '5h',  unread: false, type: 'compete' as NotifType },
  { Icon: Star,   color: null,   title: 'Achievement unlocked: First profit',sub: 'Sold a position above your entry',       time: '1d',  unread: false, type: 'social' as NotifType  },
  { Icon: User,   color: null,   title: '@chartist started following you',  sub: 'Tap to view profile',                     time: '2d',  unread: false, type: 'social' as NotifType  },
];

function NotifRow({ Icon, color, title, sub, time, unread, last, onPress }: {
  Icon: any; color: string | null; title: string; sub: string; time: string; unread?: boolean; last?: boolean; onPress?: () => void;
}) {
  const { colors } = useTheme();

  const bgMap: Record<string, string> = {
    up: colors.upSoft, warn: colors.warnSoft, down: colors.downSoft,
  };
  const colorMap: Record<string, string> = {
    up: colors.up, warn: colors.warn, down: colors.down,
  };
  const bg = color ? bgMap[color] : colors.surface2;
  const iconColor = color ? colorMap[color] : colors.ink2;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1}>
      <CardSection last={last}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon color={iconColor} size={18} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontWeight: unread ? '700' : '600', fontSize: 13, color: colors.ink, flex: 1 }}>{title}</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginLeft: 8 }}>{time}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
          </View>
          {unread && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          )}
        </View>
      </CardSection>
    </TouchableOpacity>
  );
}

export function NotificationsScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const [tab, setTab] = useState('All');
  const [readIds, setReadIds] = useState<Set<number>>(new Set());

  const markAllRead = () => {
    setReadIds(new Set(allNotifs.map((_, i) => i)));
  };

  const markRead = (idx: number) => {
    setReadIds(prev => new Set([...prev, idx]));
  };

  const filtered = tab === 'All'
    ? allNotifs
    : allNotifs.filter(n => {
        if (tab === 'Trades') return n.type === 'trade';
        if (tab === 'Compete') return n.type === 'compete';
        if (tab === 'Social') return n.type === 'social';
        return true;
      });

  const getOnPress = (n: typeof allNotifs[0]) => {
    if (n.type === 'compete') return () => nav.navigate('TournamentDetail', { id: 'ww-1' });
    if (n.type === 'trade') return () => nav.navigate('MainTabs', { screen: 'Trade' });
    return undefined;
  };

  const newNotifs = filtered.filter((_, i) => allNotifs.indexOf(allNotifs[i]) < 3);
  const earlierNotifs = filtered.filter((_, i) => allNotifs.indexOf(allNotifs[i]) >= 3);

  const newItems = filtered.filter(n => allNotifs.slice(0, 3).includes(n));
  const earlierItems = filtered.filter(n => allNotifs.slice(3).includes(n));

  return (
    <ScreenShell
      title="Notifications"
      rightActions={<Button variant="ghost" size="sm" onPress={markAllRead}>Mark read</Button>}
    >
      <Segmented options={['All', 'Trades', 'Compete', 'Social']} value={tab} onChange={setTab} />

      {newItems.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>New</Text>
          <Card variant="noPad">
            {newItems.map((n, i) => {
              const globalIdx = allNotifs.indexOf(n);
              return (
                <NotifRow
                  key={globalIdx}
                  {...n}
                  unread={n.unread && !readIds.has(globalIdx)}
                  last={i === newItems.length - 1}
                  onPress={() => { markRead(globalIdx); getOnPress(n)?.(); }}
                />
              );
            })}
          </Card>
        </>
      )}

      {earlierItems.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Earlier</Text>
          <Card variant="noPad">
            {earlierItems.map((n, i) => {
              const globalIdx = allNotifs.indexOf(n);
              return (
                <NotifRow
                  key={globalIdx}
                  {...n}
                  unread={n.unread && !readIds.has(globalIdx)}
                  last={i === earlierItems.length - 1}
                  onPress={() => { markRead(globalIdx); getOnPress(n)?.(); }}
                />
              );
            })}
          </Card>
        </>
      )}

      {filtered.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 16, color: colors.ink3 }}>No {tab.toLowerCase()} notifications</Text>
        </View>
      )}
    </ScreenShell>
  );
}
