import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Card, CardSection } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CoinGlyph } from '../../components/ui/Avatar';
import { AreaChart } from '../../components/charts/AreaChart';
import { useTheme } from '../../theme/ThemeContext';
import { Star } from 'lucide-react-native';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W3'>;

const alts = [
  { symbol: 'ETH',  name: 'Ethereum', price: '3,180', change: '+1.1%', down: false },
  { symbol: 'SOL',  name: 'Solana',   price: '182.40', change: '−0.8%', down: true  },
  { symbol: 'DOGE', name: 'Dogecoin', price: '0.160',  change: '+5.7%', down: false },
];

export function W3Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <ScreenShell eyebrow="Step 1 of 4" title="Pick what to buy" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
        <ProgressBar step={2} total={6} />

        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 14 }}>
          For your first trade, the coach suggests something steady. You can always pick something else.
        </Text>

        {/* Coach pick — BTC */}
        <Card style={{ borderWidth: 2, borderColor: colors.brand }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
              <Star color={colors.brandOn} size={12} strokeWidth={2} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.brandOn }}>Coach pick</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Why? →</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <CoinGlyph symbol="BTC" size={48} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Bitcoin · BTC</Text>
                <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>$64,210</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>Largest by market cap</Text>
                <Text style={{ fontSize: 12, color: colors.up, fontVariant: ['tabular-nums'] }}>+2.4%</Text>
              </View>
            </View>
          </View>
          <View style={{ marginHorizontal: -16, marginBottom: -4 }}>
            <AreaChart height={90} showDot={false} />
          </View>
        </Card>

        <Text style={{ fontSize: 13, color: colors.ink3 }}>Or pick something else</Text>

        <Card variant="noPad">
          {alts.map((a, i) => (
            <CardSection key={a.symbol} last={i === alts.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CoinGlyph symbol={a.symbol} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                    <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${a.price}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>{a.name}</Text>
                    <Text style={{ fontSize: 12, color: a.down ? colors.down : colors.up, fontVariant: ['tabular-nums'] }}>{a.change}</Text>
                  </View>
                </View>
              </View>
            </CardSection>
          ))}
        </Card>

        <View style={{ marginTop: 'auto', paddingBottom: 20 }}>
          <Button variant="brand" onPress={() => navigation.navigate('W4')} style={{ width: '100%' }}>
            Continue with BTC
          </Button>
        </View>
      </View>
    </ScreenShell>
  );
}
