import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W5'>;

export function W5Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <ScreenShell eyebrow="Buy BTC" title="Set your amount" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <ProgressBar step={4} total={6} />

          <View style={{ opacity: 0.5, marginTop: 14 }}>
            <Chip variant="up">+2.41% · 24h</Chip>
          </View>

          {/* Amount card */}
          <Card style={{ padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>You spend</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                $100<Text style={{ color: colors.ink3 }}>.00</Text>
              </Text>
              <Chip variant="outline">USD</Chip>
            </View>
            <View style={{ height: 1, backgroundColor: colors.hairline }} />
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>You get</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>0.001558</Text>
              <Chip variant="outline">BTC</Chip>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['$50', '$100', '$250', 'MAX'].map((x, i) => (
                <Chip key={x} variant={i === 1 ? 'brand' : 'outline'} style={{ flex: 1, justifyContent: 'center' }}>{x}</Chip>
              ))}
            </View>
          </Card>

          <Card variant="compact" style={{ opacity: 0.4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>Order type</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Market</Text>
            </View>
          </Card>
        </View>

        {/* Overlay */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,11,0.55)' }} pointerEvents="none" />

        {/* Coach popover */}
        <View style={{
          position: 'absolute', top: 420, left: 24, right: 24,
          backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 6,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>3</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3 }}>How buying works</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink, lineHeight: 20 }}>
            You spend <Text style={{ fontWeight: '700' }}>dollars</Text> and receive <Text style={{ fontWeight: '700' }}>BTC</Text>. The conversion uses the current market price.
          </Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>
            For your first trade we've set it to $100 of your $100,000 bankroll.
          </Text>
        </View>

        {/* Coach bar */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" style={{ flex: 1 }} onPress={() => navigation.goBack()}>Back</Button>
            <Button variant="brand" style={{ flex: 1 }} onPress={() => navigation.navigate('W6')}>Next: review</Button>
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}
