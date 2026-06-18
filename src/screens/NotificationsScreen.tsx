import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '../components/ui/Text';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { CONTEST_CASH_PRIZES } from '../constants/featureFlags';
import { contestXpForRank } from '../services/gamification';
import { Trophy, Shield, Flame, Star, ArrowUp, ArrowDown, Bell } from 'lucide-react-native';

type NotifType = 'compete' | 'trade' | 'social';

interface Notif {
  Icon: any;
  color: string | null;
  title: string;
  sub: string;
  time: string;
  unread: boolean;
  type: NotifType;
  onPress?: () => void;
  key: string;
}

function relTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function NotifRow({ Icon, color, title, sub, time, unread, last, onPress }: {
  Icon: any; color: string | null; title: string; sub: string;
  time: string; unread?: boolean; last?: boolean; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const bgMap: Record<string, string> = { up: colors.upSoft, warn: colors.warnSoft, down: colors.downSoft };
  const colorMap: Record<string, string> = { up: colors.up, warn: colors.warn, down: colors.down };
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
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [tab, setTab] = useState('All');
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  // Derive trade notifications from real coin trades (exclude reward
  // cash-injection events, which use the sentinel 'USD' symbol).
  const tradeNotifs: Notif[] = state.trades
    .filter(t => t.kind !== 'reward' && t.symbol !== 'USD')
    .slice(0, 5)
    .map(t => ({
    key: t.id,
    Icon: t.side === 'buy' ? ArrowUp : ArrowDown,
    color: null,
    title: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}`,
    sub: `${t.units.toFixed(4)} ${t.symbol} at $${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · +${t.xpEarned} XP`,
    time: relTime(t.timestamp),
    unread: Date.now() - t.timestamp < 10 * 60 * 1000,
    type: 'trade' as NotifType,
  }));

  // Achievement notification if earned any
  const earnedStops = Object.keys(state.stopLosses).length > 0;
  const achievementNotifs: Notif[] = [
    ...(state.trades.length === 1 ? [{
      key: 'ach-first',
      Icon: Star, color: 'up' as string | null,
      title: 'Achievement unlocked: First $',
      sub: 'You made your first trade!',
      time: relTime(state.trades[0]?.timestamp ?? Date.now()),
      unread: false, type: 'social' as NotifType,
    }] : []),
    ...(earnedStops ? [{
      key: 'ach-safe',
      Icon: Shield, color: 'warn' as string | null,
      title: 'Achievement unlocked: Safe Trader',
      sub: 'You set your first stop-loss order',
      time: '1h', unread: false, type: 'social' as NotifType,
    }] : []),
    ...(state.user.streak >= 7 ? [{
      key: 'ach-streak',
      Icon: Flame, color: null as string | null,
      title: `${state.user.streak}-day streak bonus`,
      sub: `Keep it up! +50 XP awarded`,
      time: 'Today', unread: false, type: 'social' as NotifType,
    }] : []),
  ];

  // Price alert notifications (triggered alerts surfaced as unread)
  const alertNotifs: Notif[] = state.triggeredAlerts.slice(0, 8).map(a => {
    const coin = state.coins.find(c => c.symbol === a.symbol);
    const priceStr = a.targetPrice < 0.01
      ? `$${a.targetPrice.toFixed(8)}`
      : `$${a.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      key: a.id,
      Icon: Bell,
      color: 'warn' as const,
      title: `${a.symbol} alert triggered`,
      sub: `Price ${a.direction === 'above' ? 'rose above' : 'fell below'} ${priceStr}`,
      time: a.triggeredAt ? relTime(a.triggeredAt) : 'just now',
      unread: true,
      type: 'trade' as NotifType,
      onPress: () => {
        dispatch({ type: 'DISMISS_PRICE_ALERT', alertId: a.id });
        dispatch({ type: 'SET_TRADE_SYMBOL', symbol: a.symbol });
        nav.navigate('Trade');
      },
    };
  });

  // Derive contest-status notifications from real Competition data.
  // - Joined contests that just finished (last 24h)
  // - Joined contests starting within the next hour
  const contestNotifs: Notif[] = [];
  for (const cid of state.joinedTournamentIds) {
    const comp = state.competitions.find(c => c.id === cid);
    if (!comp) continue;
    const now = Date.now();
    if (comp.status === 'finished' && now - comp.endAt < 24 * 60 * 60 * 1000) {
      const entries = state.leaderboard[cid] ?? [];
      const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
      const myIdx = sorted.findIndex(e => e.handle === state.user.handle);
      const myRank = myIdx >= 0 ? myIdx + 1 : null;
      const wonXp = myRank ? contestXpForRank(comp.prizeXp, myRank) : 0;
      const wonCash = myRank && myRank <= comp.prizes.length ? comp.prizes[myRank - 1] : 0;
      const won = CONTEST_CASH_PRIZES ? wonCash > 0 : wonXp > 0;
      contestNotifs.push({
        key: `comp-finished-${cid}`,
        Icon: Trophy,
        color: won ? 'up' : null,
        title: `${comp.name} finished${myRank ? ` · #${myRank}` : ''}`,
        sub: !won
          ? 'Out of the prize positions'
          : CONTEST_CASH_PRIZES
            ? `You won $${wonCash.toLocaleString()}`
            : `You won ${wonXp.toLocaleString()} XP — tap to claim`,
        time: relTime(comp.endAt),
        unread: true,
        type: 'compete' as NotifType,
        onPress: () => nav.navigate('TournamentDetail', { id: cid }),
      });
    } else if (comp.status !== 'finished' && comp.startAt > now && comp.startAt - now < 60 * 60 * 1000) {
      const minsLeft = Math.max(1, Math.floor((comp.startAt - now) / 60000));
      contestNotifs.push({
        key: `comp-starting-${cid}`,
        Icon: Trophy,
        color: null,
        title: `${comp.name} starts in ${minsLeft}m`,
        sub: `${comp.entryCount} ${comp.entryCount === 1 ? 'player' : 'players'} joined`,
        time: relTime(now),
        unread: false,
        type: 'compete' as NotifType,
        onPress: () => nav.navigate('TournamentDetail', { id: cid }),
      });
    }
  }

  const allNotifs: Notif[] = [
    ...alertNotifs,
    ...contestNotifs,
    ...tradeNotifs,
    ...achievementNotifs,
  ];

  const markRead = (key: string) => setReadKeys(prev => new Set([...prev, key]));
  const markAllRead = () => setReadKeys(new Set(allNotifs.map(n => n.key)));

  const filtered = tab === 'All'
    ? allNotifs
    : allNotifs.filter(n => {
        if (tab === 'Trades') return n.type === 'trade';
        if (tab === 'Compete') return n.type === 'compete';
        if (tab === 'Social') return n.type === 'social';
        return true;
      });

  // Split into new (<1h) and earlier
  const newItems = filtered.filter(n => {
    if (n.time.endsWith('m') || n.time === 'Today') return true;
    const h = parseInt(n.time);
    return n.time.endsWith('h') && h <= 1;
  });
  const earlierItems = filtered.filter(n => !newItems.includes(n));

  const unreadCount = allNotifs.filter(n => n.unread && !readKeys.has(n.key)).length;

  return (
    <ScreenShell
      title={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
      rightActions={<Button variant="ghost" size="sm" onPress={markAllRead}>Mark all read</Button>}
    >
      <Segmented options={['All', 'Trades', 'Compete', 'Social']} value={tab} onChange={setTab} />

      {newItems.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>New</Text>
          <Card variant="noPad">
            {newItems.map((n, i) => (
              <NotifRow
                {...n}
                key={n.key}
                unread={n.unread && !readKeys.has(n.key)}
                last={i === newItems.length - 1}
                onPress={() => { markRead(n.key); n.onPress?.(); }}
              />
            ))}
          </Card>
        </>
      )}

      {earlierItems.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Earlier</Text>
          <Card variant="noPad">
            {earlierItems.map((n, i) => (
              <NotifRow
                {...n}
                key={n.key}
                unread={n.unread && !readKeys.has(n.key)}
                last={i === earlierItems.length - 1}
                onPress={() => { markRead(n.key); n.onPress?.(); }}
              />
            ))}
          </Card>
        </>
      )}

      {filtered.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 16, color: colors.ink3 }}>No {tab.toLowerCase()} notifications</Text>
          <Text style={{ fontSize: 13, color: colors.ink4 }}>You're all caught up</Text>
        </View>
      )}
    </ScreenShell>
  );
}
