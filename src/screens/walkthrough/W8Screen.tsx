import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '../../components/ui/Text';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useTheme } from '../../theme/ThemeContext';
import { Trophy, User, Clock, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../store/AppContext';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W8'>;

const actions = [
  { icon: Trophy,  title: 'Join a free daily tournament', sub: '5h left · 412 players · 500 XP for top 50', brand: true },
  { icon: User,    title: 'Copy a top trader',           sub: 'Mirror their moves with a slice of your bankroll', brand: false },
  { icon: Clock,   title: 'Replay the 2021 Bull Run',   sub: 'Trade through famous market moments at 60× speed',  brand: false },
];

export function W8Screen({ navigation }: Props) {
  const { colors } = useTheme();
  const { dispatch } = useApp();

  const finish = async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    // Make the "+25 XP" the walkthrough promised real — once, so replaying the
    // tutorial from Settings can't farm it.
    const rewarded = await AsyncStorage.getItem('onboardingRewarded');
    if (!rewarded) {
      dispatch({ type: 'ADD_XP', amount: 50 });
      await AsyncStorage.setItem('onboardingRewarded', '1');
    }
    dispatch({ type: 'SET_ONBOARDED' });
  };

  return (
    <ScreenShell eyebrow="You're ready" title="What's next?" scrollable={false} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
        <ProgressBar step={6} total={6} />

        <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 14 }}>
          You've made your first trade. Here are a few ways to keep going — pick one (or skip and explore on your own).
        </Text>

        <View style={{ gap: 10 }}>
          {actions.map(({ icon: Icon, title, sub, brand }) => (
            <TouchableOpacity key={title} onPress={finish} activeOpacity={0.75}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: brand ? colors.brand : colors.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon color={brand ? colors.brandOn : colors.ink} size={22} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{title}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
                </View>
                <ChevronRight color={colors.ink3} size={18} strokeWidth={1.75} />
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        <Card variant="tinted">
          <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Coach tip</Text>
          <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 2, lineHeight: 20 }}>
            Tournaments are free — and the best way to learn. You can always paper-trade alone too.
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto', paddingBottom: 20 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={finish}>Explore on my own</Button>
          <Button variant="brand" style={{ flex: 1 }} onPress={finish}>Join tournament</Button>
        </View>
      </View>
    </ScreenShell>
  );
}
