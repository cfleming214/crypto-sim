import React from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';

const stats = [
  ['Season P&L', '+$847', 'up'],
  ['Tournaments', '14', null],
  ['Win rate', '58%', null],
  ['Best finish', '#3', null],
  ['Total XP', '2,340', null],
  ['Streak', '12d', 'up'],
];

export function ProfileScreen() {
  const { colors } = useTheme();

  return (
    <ScreenShell eyebrow="Season 3" title="Your profile">
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials="JS" size="xl" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 18, color: colors.ink }}>@you</Text>
          <Chip variant="brand" style={{ marginTop: 4 }}>Diamond III</Chip>
        </View>
      </View>

      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: colors.hairline, borderRadius: 12, overflow: 'hidden' }}>
        {stats.map(([label, value, type]) => (
          <View key={label} style={{ width: '33.33%', backgroundColor: colors.surface, padding: 14 }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
            <Text style={{ fontWeight: '700', color: type === 'up' ? colors.up : colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* Season history */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Season history</Text>
      <Card variant="noPad">
        {['Season 2 · Gold II', 'Season 1 · Silver III'].map((s, i, arr) => (
          <CardSection key={s} last={i === arr.length - 1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{s}</Text>
              <Chip variant={i === 0 ? 'up' : 'default'}>+24.1%</Chip>
            </View>
          </CardSection>
        ))}
      </Card>
    </ScreenShell>
  );
}
