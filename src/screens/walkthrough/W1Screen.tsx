import React from 'react';
import { View } from 'react-native';
import { Text } from '../../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WalkthroughParamList } from '../../navigation/WalkthroughNavigator';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../theme/ThemeContext';
import { Trophy } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../store/AppContext';

type Props = NativeStackScreenProps<WalkthroughParamList, 'W1'>;

export function W1Screen({ navigation }: Props) {
  const { colors } = useTheme();
  const { dispatch } = useApp();

  // Flip the onboarding gate → RootNavigator re-renders into the main app.
  const skipToApp = async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    dispatch({ type: 'SET_ONBOARDED' });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, padding: 28, justifyContent: 'flex-end', gap: 0 }}>
        <View style={{ flex: 1 }} />

        {/* Icon */}
        <View style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
        }}>
          <Trophy color={colors.brandOn} size={36} strokeWidth={1.75} />
        </View>

        {/* Headline */}
        <Text style={{ fontSize: 32, fontWeight: '700', color: colors.brandOn, letterSpacing: -0.8, lineHeight: 40 }}>
          Trade crypto.{'\n'}Win prizes.{'\n'}Risk nothing.
        </Text>

        <Text style={{ fontSize: 15, color: `${colors.brandOn}CC`, marginTop: 12, marginBottom: 28, lineHeight: 22 }}>
          Practice with $100,000 simulated. Compete in daily tournaments. Real cash payouts for top finishers.
        </Text>

        {/* CTAs */}
        <View style={{ gap: 10 }}>
          <Button
            variant="surface"
            style={{ backgroundColor: colors.brandOn, borderColor: colors.brandOn }}
            textStyle={{ color: colors.brand }}
            onPress={() => navigation.navigate('W2')}
          >
            Get my $100,000 bankroll
          </Button>
          <Button
            variant="ghost"
            style={{ borderColor: 'rgba(255,255,255,0.25)' }}
            textStyle={{ color: colors.brandOn }}
            onPress={skipToApp}
          >
            I already have an account
          </Button>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 11, color: `${colors.brandOn}88`, marginTop: 18 }}>
          No card required · No real money ever leaves the app
        </Text>
      </View>
    </SafeAreaView>
  );
}
