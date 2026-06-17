import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from './ui/Button';
import { FeatureHero } from './FeatureHero';

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

interface AuthWallProps {
  /** Icon rendered in the badge — pass a lucide-react-native icon component. */
  icon: IconComponent;
  title: string;
  subtitle: string;
}

/**
 * Login/signup splash shown in place of an auth-gated screen (Profile,
 * Compete) when the user is browsing as a guest. The main app + demo
 * portfolio stay usable without an account; these screens prompt sign-up.
 * The CTA pushes the `Auth` modal, which pops back here on success — at
 * which point the host screen re-renders with real content.
 */
export function AuthWall({ icon: Icon, title, subtitle }: AuthWallProps) {
  const { colors } = useTheme();
  const nav = useNavigation<any>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
        <View style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon color={colors.brandOn} size={36} strokeWidth={1.75} />
        </View>

        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.brandOn, letterSpacing: -0.6, textAlign: 'center' }}>
          {title}
        </Text>
        <Text style={{ fontSize: 14, color: `${colors.brandOn}CC`, textAlign: 'center', lineHeight: 21, maxWidth: 300 }}>
          {subtitle}
        </Text>

        {/* Auto-scrolling hero — what you get once you sign in */}
        <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
          <FeatureHero colors={colors} />
        </View>

        <View style={{ alignSelf: 'stretch', gap: 12, marginTop: 8 }}>
          <Button
            testID="authwall-signup-btn"
            variant="surface"
            onPress={() => nav.navigate('Auth', { mode: 'signup' })}
          >
            Create account
          </Button>
          <Button
            testID="authwall-signin-btn"
            variant="ghost"
            onPress={() => nav.navigate('Auth', { mode: 'signin' })}
            textStyle={{ color: colors.brandOn }}
            style={{ borderColor: `${colors.brandOn}55` }}
          >
            I already have an account
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
