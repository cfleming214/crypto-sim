import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeContext';
import { Trophy, Shield, User, Flame, Star } from 'lucide-react-native';

const newNotifs = [
  { Icon: Trophy, color: 'up',   title: 'You moved up to #43',           sub: 'Weekend Warriors · 4 spots gained',       time: '2m', unread: true },
  { Icon: Shield, color: 'warn', title: 'Trailing stop hit on ETH',       sub: 'Sold 0.4 ETH at $3,180 · locked +12%',   time: '11m', unread: true },
  { Icon: User,   color: null,   title: '@degenking opened a new position',sub: 'Bought 2.4 BTC · you mirrored $200',      time: '24m', unread: true },
];

const earlierNotifs = [
  { Icon: Flame, color: 'down', title: 'PEPE +18% in 1h',                sub: 'On your watchlist · tap to trade',       time: '3h' },
  { Icon: Trophy, color: null,  title: 'Memecoin Madness starts in 5h',   sub: '412 players already joined',             time: '5h' },
  { Icon: Star,  color: null,   title: 'Achievement unlocked: First profit', sub: 'Sold a position above your entry',    time: '1d' },
  { Icon: User,  color: null,   title: '@chartist started following you', sub: 'Tap to view profile',                    time: '2d' },
];

function NotifRow({ Icon, color, title, sub, time, unread, last }: {
  Icon: any; color: string | null; title: string; sub: string; time: string; unread?: boolean; last?: boolean;
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
    <CardSection last={last}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={iconColor} size={18} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink, flex: 1 }}>{title}</Text>
            <Text style={{ fontSize: 11, color: colors.ink3, marginLeft: 8 }}>{time}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
        </View>
        {unread && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
        )}
      </View>
    </CardSection>
  );
}

export function NotificationsScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState('All');

  return (
    <ScreenShell
      title="Notifications"
      rightActions={<Button variant="ghost" size="sm">Mark read</Button>}
    >
      <Segmented options={['All', 'Trades', 'Compete', 'Social']} value={tab} onChange={setTab} />

      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>New</Text>
      <Card variant="noPad">
        {newNotifs.map((n, i) => (
          <NotifRow key={i} {...n} last={i === newNotifs.length - 1} />
        ))}
      </Card>

      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Earlier</Text>
      <Card variant="noPad">
        {earlierNotifs.map((n, i) => (
          <NotifRow key={i} {...n} last={i === earlierNotifs.length - 1} />
        ))}
      </Card>
    </ScreenShell>
  );
}
