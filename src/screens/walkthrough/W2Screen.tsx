import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useTheme } from '../../theme/ThemeContext';
import { Shield } from 'lucide-react-native';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W2'>;

const steps = [
  ['1', 'Pick what to buy',  'Browse markets or follow a coach suggestion'],
  ['2', 'Read the chart',    'A quick tour of price + volume'],
  ['3', 'Place the order',   'Set the amount, review impact, confirm'],
  ['4', 'Watch it fill',     'See your new position in your portfolio'],
];

export function W2Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <ScreenShell eyebrow="Welcome, @you" title="Make your first trade" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
        <ProgressBar step={1} total={6} />

        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 14, lineHeight: 20 }}>
          We'll do a quick{' '}
          <Text style={{ fontWeight: '600', color: colors.ink }}>$100 practice trade</Text>
          {' '}together so you see how the app works. Takes about 60 seconds.
        </Text>

        <Card style={{ gap: 14 }}>
          {steps.map(([n, title, sub]) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: colors.ink }}>{n}</Text>
              </View>
              <View>
                <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{title}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{sub}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Shield color={colors.ink3} size={18} strokeWidth={1.75} />
          <Text style={{ fontSize: 13, color: colors.ink2, flex: 1, lineHeight: 20 }}>
            Everything's <Text style={{ fontWeight: '600' }}>simulated</Text>. You can't lose real money here — but the prices and market are real-time.
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto', paddingBottom: 20 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={() => navigation.navigate('W8')}>
            Skip tour
          </Button>
          <Button variant="brand" style={{ flex: 1 }} onPress={() => navigation.navigate('W3')}>
            Start →
          </Button>
        </View>
      </View>
    </ScreenShell>
  );
}
