import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '../../components/ui/Text';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CandleChart } from '../../components/charts/CandleChart';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W4'>;

export function W4Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <ScreenShell eyebrow="BTC" title="$64,210.48" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Chip variant="up">↑ +2.41%</Chip>
        </View>

        <View style={{ marginTop: 8 }}>
          <CandleChart height={220} />
        </View>

        {/* Dim overlay covering the whole screen except chart */}
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10,10,11,0.55)',
        }} pointerEvents="none" />

        {/* Spotlight cutout */}
        <View style={{
          position: 'absolute', top: 130, left: 8, right: 8, height: 230,
          borderRadius: 14, backgroundColor: 'transparent',
          shadowColor: 'rgba(10,10,11,0.55)',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
          elevation: 0,
        }} pointerEvents="none" />

        {/* Coach popover */}
        <View style={{
          position: 'absolute', top: 380, left: 24, right: 24,
          backgroundColor: colors.surface, borderRadius: 14,
          padding: 16, gap: 6,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08, shadowRadius: 24, elevation: 10,
        }}>
          <ProgressBar step={3} total={6} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>2</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.ink3 }}>Reading the chart</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink, lineHeight: 20 }}>
            <Text style={{ fontWeight: '700' }}>Green</Text> bars mean the price closed higher than it opened.{' '}
            <Text style={{ fontWeight: '700' }}>Red</Text> means it dropped.
          </Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>
            The line through each bar shows the high and low for that period.
          </Text>
        </View>

        {/* Coach bar */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colors.surface, padding: 16, gap: 10,
          borderTopWidth: 1, borderTopColor: colors.hairline,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Tip 1 of 2 on this screen</Text>
            <Button variant="ghost" size="sm" onPress={() => navigation.navigate('W5')}>Skip</Button>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" style={{ flex: 1 }} onPress={() => navigation.goBack()}>Back</Button>
            <Button variant="brand" style={{ flex: 1 }} onPress={() => navigation.navigate('W5')}>
              Next: how to buy
            </Button>
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}
