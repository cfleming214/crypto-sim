import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { AreaChart } from '../components/charts/AreaChart';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { MoreHorizontal, Pause } from 'lucide-react-native';

const tags = ['Day trader', 'High risk', 'Memecoins', '+2'];
const perf = [
  ['30D return', '+52.1%', 'up'],
  ['Win rate', '68%', null],
  ['Max DD', '−18%', 'down'],
];
// mirrorSettings derived dynamically in component

export function CopyTradeScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const nav = useNavigation<any>();
  const [paused, setPaused] = useState(false);
  const [allocation] = useState(2000);

  const pnlPct = ((state.bankroll - 10000) / 10000) * 100;

  const handleEdit = () => {
    Alert.alert(
      'Edit Mirror Settings',
      'Adjust your allocation, position limits, and stop conditions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save changes', onPress: () => {} },
      ],
    );
  };

  const handleTogglePause = () => {
    const next = !paused;
    setPaused(next);
    Alert.alert(
      next ? 'Copy trading paused' : 'Copy trading resumed',
      next
        ? '@degenking\'s new trades will not be mirrored until you resume.'
        : 'You are now mirroring @degenking with $2,000.',
      [{ text: 'OK' }],
    );
  };

  return (
    <ScreenShell
      eyebrow="Copy trade"
      title="@degenking"
      rightActions={
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => Alert.alert('More options', 'Block trader · Report · Share profile', [{ text: 'Close' }])}
        >
          <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      {/* Profile head */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials="JK" size="lg" style={{ backgroundColor: '#E8DCC4' }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>Jordan K.</Text>
            <Chip variant="up">Diamond II</Chip>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
            14,210 followers · 92 copying · $48K AUM
          </Text>
        </View>
      </View>

      {/* Status banner when paused */}
      {paused && (
        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pause color={colors.warn} size={16} strokeWidth={1.75} />
          <Text style={{ fontWeight: '600', color: colors.ink, flex: 1 }}>
            Copy trading paused — new trades won't be mirrored
          </Text>
        </Card>
      )}

      {/* Tags */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(t => <Chip key={t} variant="outline">{t}</Chip>)}
      </View>

      {/* Performance */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        {perf.map(([k, v, type], i) => (
          <View
            key={k}
            style={{ flex: 1, padding: 14, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.hairline }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{k}</Text>
            <Text style={{
              fontWeight: '700', fontSize: 15, marginTop: 2, fontVariant: ['tabular-nums'],
              color: type === 'up' ? colors.up : type === 'down' ? colors.down : colors.ink,
            }}>{v}</Text>
          </View>
        ))}
      </Card>

      {/* Chart vs you */}
      <Card variant="noPad">
        <CardSection>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Equity · 30D vs you</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 2, backgroundColor: colors.up }} />
              <Text style={{ fontSize: 11 }}>@degenking +52%</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 2, backgroundColor: colors.ink3 }} />
              <Text style={{ fontSize: 11, color: colors.ink3 }}>@{state.user.handle} {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</Text>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <AreaChart height={120} />
          </View>
        </CardSection>
      </Card>

      {/* Mirror settings */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Mirror settings</Text>
          <Button variant="ghost" size="sm" onPress={handleEdit}>Edit</Button>
        </View>
        {[
          ['Allocation', `$${allocation.toLocaleString()} / $${state.bankroll.toFixed(0)}`],
          ['Max single position', '20%'],
          ['Stop copying at', '−10%'],
          ['Copy fee', '5% of profit'],
        ].map(([label, value], i, arr) => (
          <View key={label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: label === 'Stop copying at' ? colors.down : colors.ink, fontVariant: ['tabular-nums'] }}>
                {value}
              </Text>
            </View>
            {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8, marginBottom: 8 }} />}
          </View>
        ))}
      </Card>

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="ghost" style={{ flex: 1 }} onPress={handleTogglePause}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          variant={paused ? 'surface' : 'brand'}
          style={{ flex: 1 }}
          onPress={() => {
            if (paused) {
              Alert.alert('Paused', 'Resume copy trading to mirror new positions.', [{ text: 'OK' }]);
            } else {
              Alert.alert('Active mirror', `You are mirroring $${allocation.toLocaleString()} across @degenking's positions.\n\nYour funds are automatically allocated proportionally to their trades.`, [{ text: 'OK' }]);
            }
          }}
        >
          {paused ? 'Paused' : `Mirroring · $${allocation.toLocaleString()}`}
        </Button>
      </View>
    </ScreenShell>
  );
}
