import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { Filter } from 'lucide-react-native';

const players = [
  { rank: 1,  handle: '@orca',     name: 'Diana K.',   pnl: '+71.4%', xp: '12,840', trend: 'up',   tag: 'promo' },
  { rank: 2,  handle: '@vega',     name: 'Marcus L.',  pnl: '+64.2%', xp: '11,210', trend: 'up',   tag: 'promo' },
  { rank: 3,  handle: '@bytestorm',name: 'Aliyah P.',  pnl: '+44.8%', xp: '9,820',  trend: 'up',   tag: 'promo' },
  { rank: 4,  handle: '@kestrel',  name: 'Theo R.',    pnl: '+29.0%', xp: '8,140',  trend: 'flat', tag: 'promo' },
  { rank: 5,  handle: '@quanto',   name: 'J. Sato',    pnl: '+22.3%', xp: '7,310',  trend: 'up',   tag: 'promo' },
  { rank: 6,  handle: '@mira',     name: 'Mira F.',    pnl: '+17.6%', xp: '6,490',  trend: 'flat', tag: null },
  { rank: 7,  handle: '@laserpat', name: 'Pat A.',     pnl: '+12.1%', xp: '5,810',  trend: 'down', tag: null },
  { rank: 8,  handle: '@you',      name: 'You',        pnl: '+8.4%',  xp: '4,920',  trend: 'flat', tag: 'you' },
  { rank: 9,  handle: '@nakamoto', name: 'Sam G.',     pnl: '+7.0%',  xp: '4,610',  trend: 'down', tag: null },
];

export function LeagueScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState('Your division');

  return (
    <ScreenShell
      eyebrow="Diamond III"
      title="League"
      rightActions={
        <Filter color={colors.ink} size={20} strokeWidth={1.75} />
      }
    >
      {/* Division banner */}
      <Card variant="tinted">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Promotes in 2 · ends Sunday
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4 }}>
              30 players · top 5 promote
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {['O', 'V', 'B'].map((l, i) => (
              <Avatar key={l} initials={l} size="sm" style={{ marginLeft: i === 0 ? 0 : -8 }} />
            ))}
          </View>
        </View>

        {/* Ladder visualization */}
        <View style={{ flexDirection: 'row', gap: 2, height: 8 }}>
          {Array.from({ length: 30 }).map((_, i) => {
            let bg = colors.surface;
            if (i < 5) bg = colors.up;
            else if (i === 7) bg = colors.brand;
            else if (i >= 25) bg = colors.down;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  backgroundColor: bg,
                  borderRadius: 2,
                  borderWidth: i === 7 ? 2 : 0,
                  borderColor: colors.brand,
                }}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>↑ Promote to Master</Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>You · #8</Text>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>↓ Demote to Plat</Text>
        </View>
      </Card>

      {/* Tabs */}
      <Segmented
        options={['Your division', 'Friends', 'Global']}
        value={tab}
        onChange={setTab}
        variant="tabs"
      />

      {/* Rankings */}
      <Card variant="noPad">
        {players.map((p, i) => {
          const isMe = p.tag === 'you';
          const isPromo = p.tag === 'promo';
          return (
            <View
              key={p.rank}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: isMe ? colors.surface2 : 'transparent',
                borderBottomWidth: i < players.length - 1 ? 1 : 0,
                borderBottomColor: colors.hairline,
              }}
            >
              <Text style={{ width: 22, fontWeight: '700', color: p.rank <= 5 ? colors.up : colors.ink3, fontVariant: ['tabular-nums'] }}>
                {p.rank}
              </Text>
              <Avatar initials={p.name[0]} size="sm" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{p.name}</Text>
                  {isPromo && <Chip variant="up" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>Promo</Chip>}
                  {isMe && <Chip variant="brand" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>You</Chip>}
                </View>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{p.handle} · {p.xp} XP</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '700', color: p.pnl.startsWith('+') ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                  {p.pnl}
                </Text>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>
                  {p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '—'} 24h
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </ScreenShell>
  );
}
