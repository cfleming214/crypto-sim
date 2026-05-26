import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../theme/ThemeContext';
import { Check, Star } from 'lucide-react-native';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W7'>;

export function W7Screen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Success hero */}
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 14 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.upSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={colors.up} size={52} strokeWidth={2} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.up, textTransform: 'uppercase', letterSpacing: 0.5 }}>You did it</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.75 }}>First trade complete</Text>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              You now own{' '}
              <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>0.001558 BTC</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip variant="up">+25 XP</Chip>
            <Chip variant="brand">
              <Star size={12} color={colors.brandOn} strokeWidth={2} />
              Achievement unlocked
            </Chip>
          </View>
        </View>

        {/* Receipt */}
        <Card variant="compact" style={{ gap: 8 }}>
          {[
            ['Order',    'SIM-A82F1',           false],
            ['Filled at','$64,210.48',           false],
            ['Now worth','$100.04 · +0.04%',     true],
          ].map(([label, value, isUp], i, arr) => (
            <View key={label as string}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', fontSize: 13, color: isUp ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
              </View>
              {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.hairline, marginTop: 8 }} />}
            </View>
          ))}
        </Card>

        {/* Coach next card */}
        <View style={{ backgroundColor: colors.brand, borderRadius: 18, padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: `${colors.brandOn}99`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Coach · step 5/6
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.brandOn }}>Now keep an eye on it.</Text>
          <Text style={{ fontSize: 13, color: `${colors.brandOn}CC`, lineHeight: 20 }}>
            We'll set a 5% trailing stop so you lock in gains if it dips. You can always change it.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button
              variant="ghost"
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' }}
              textStyle={{ color: colors.brandOn }}
              onPress={() => navigation.navigate('W8')}
            >
              Not now
            </Button>
            <Button
              variant="surface"
              style={{ flex: 1, backgroundColor: colors.brandOn, borderColor: 'transparent' }}
              textStyle={{ color: colors.brand }}
              onPress={() => navigation.navigate('W8')}
            >
              Set 5% stop
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
