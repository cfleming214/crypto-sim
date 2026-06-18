import React from 'react';
import { View } from 'react-native';
import { Text } from '../../components/ui/Text';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Card, CardSection } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CoinGlyph } from '../../components/ui/Avatar';
import { useTheme } from '../../theme/ThemeContext';
import { Shield, Check } from 'lucide-react-native';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W6'>;

export function W6Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <ScreenShell eyebrow="Step 4 of 4" title="Review your order" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
        <ProgressBar step={5} total={6} />

        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 14 }}>
          Last check before you press buy. Always read this before confirming.
        </Text>

        {/* Order summary */}
        <Card variant="noPad">
          <CardSection>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CoinGlyph symbol="BTC" />
              <View>
                <Text style={{ fontWeight: '600', color: colors.ink }}>Buy Bitcoin</Text>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>Market order · executes instantly</Text>
              </View>
            </View>
          </CardSection>
          <CardSection last style={{ gap: 10 }}>
            {[
              ['Spending',       '$100.00',       false],
              ['Receiving',      '~0.001558 BTC', false],
              ['Price',          '$64,210.48',    false],
              ['Slippage (max)', '0.10%',         false],
              ['Fee',            'Free',          true],
            ].map(([label, value, isUp]) => (
              <View key={label as string} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', color: isUp ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
              </View>
            ))}
          </CardSection>
        </Card>

        {/* Coach risk note */}
        <View style={{ backgroundColor: colors.warnSoft, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Shield color={colors.warn} size={18} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>Coach note · risk impact</Text>
            <Text style={{ fontSize: 11, color: colors.ink2, marginTop: 2, lineHeight: 18 }}>
              Buying $100 of BTC puts <Text style={{ fontWeight: '600' }}>1% of your bankroll</Text> in a single coin. That's well within healthy limits for a first trade.
            </Text>
          </View>
        </View>

        {/* Reassurance */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check color={colors.up} size={14} strokeWidth={2} />
          <Text style={{ fontSize: 12, color: colors.ink3 }}>You can sell anytime</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto', paddingBottom: 20 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={() => navigation.goBack()}>Back</Button>
          <Button variant="up" style={{ flex: 1 }} onPress={() => navigation.navigate('W7')}>
            Hold to confirm buy
          </Button>
        </View>
      </View>
    </ScreenShell>
  );
}
