import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView, Linking } from 'react-native';
import { Text } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X, Check } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FeatureHero } from '../components/FeatureHero';
import { useAuth } from '../store/AuthContext';
import { LEGAL_URLS } from '../constants/legal';
import { openExternal } from '../lib/linking';

type AuthMode = 'signin' | 'signup';

export function AuthScreen() {
  const { colors } = useTheme();
  const { signIn, signUp } = useAuth();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [mode, setMode] = useState<AuthMode>(route.params?.mode ?? 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);

  // Sign-up requires both the 18+ age confirmation and the Terms/Privacy consent.
  const signupGateOk = acceptedTerms && confirmedAge;

  // A checkbox + tappable label row for the sign-up Terms/Privacy consent.
  const CheckRow = ({ checked, onToggle, testID, children }: {
    checked: boolean; onToggle: () => void; testID: string; children: React.ReactNode;
  }) => (
    <TouchableOpacity
      testID={testID}
      onPress={onToggle}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 }}
    >
      <View style={{
        width: 22, height: 22, borderRadius: 6, marginTop: 1,
        borderWidth: 1.5,
        borderColor: checked ? colors.brand : colors.hairline,
        backgroundColor: checked ? colors.brand : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <Check color={colors.brandOn} size={15} strokeWidth={3} />}
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 19 }}>
        {children}
      </Text>
    </TouchableOpacity>
  );

  const inputStyle = {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 14,
    fontSize: 15 as const,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.hairline,
  };

  const handleSubmit = async () => {
    if (loading) return;
    // Hard gate: account creation requires confirming 18+ and accepting the
    // Terms & Privacy Policy (App Store guideline 1.2 EULA + 5.1.2 consent; the
    // 18+ confirmation gates the real-money contest features). The button is
    // also disabled, but guard here too.
    if (mode === 'signup' && !signupGateOk) {
      Alert.alert(
        'Please confirm to continue',
        'You must confirm you are 18 or older and accept the Terms of Use and Privacy Policy to create an account.',
      );
      return;
    }
    setLoading(true);
    try {
      const u = username.trim();
      if (mode === 'signin') {
        await signIn(u, password);
      } else {
        await signUp(u, password);
        // Record the age confirmation locally (timestamped) for our own records.
        try { await AsyncStorage.setItem('ageConfirmed.v1', new Date().toISOString()); } catch { /* non-fatal */ }
      }
      // Auth flipped to authenticated — dismiss the modal so the gated
      // screen underneath re-renders with real content. goBack is a no-op
      // if this screen was somehow the root.
      if (nav.canGoBack()) nav.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const headline = mode === 'signin' ? 'Welcome back' : 'Create account';
  const subtitle = 'Trade crypto. Win prizes. Risk nothing.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand }}>
      <StatusBar style="light" />
      {nav.canGoBack() && (
        <TouchableOpacity
          testID="auth-close-btn"
          onPress={() => nav.goBack()}
          style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, padding: 12 }}
        >
          <X color={colors.brandOn} size={26} strokeWidth={2} />
        </TouchableOpacity>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 28, gap: 24 }} keyboardShouldPersistTaps="handled">

          <View style={{ alignItems: 'center', paddingTop: 28, gap: 6 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: colors.brandOn, letterSpacing: -0.6, textAlign: 'center' }}>
              {headline}
            </Text>
            <Text style={{ fontSize: 14, color: `${colors.brandOn}CC`, textAlign: 'center', lineHeight: 20 }}>
              {subtitle}
            </Text>
          </View>

          {/* Auto-scrolling hero — what you get when you sign up / sign in */}
          <FeatureHero colors={colors} />

          <Card style={{ gap: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Email</Text>
            <TextInput
              testID="auth-username-input"
              style={inputStyle}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@email.com"
              placeholderTextColor={colors.ink4}
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Password</Text>
            <TextInput
              testID="auth-password-input"
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              placeholderTextColor={colors.ink4}
            />

            {mode === 'signup' ? (
              <>
              <CheckRow testID="auth-age-checkbox" checked={confirmedAge} onToggle={() => setConfirmedAge(v => !v)}>
                I confirm I am 18 years of age or older.
              </CheckRow>
              <CheckRow testID="auth-terms-checkbox" checked={acceptedTerms} onToggle={() => setAcceptedTerms(v => !v)}>
                I agree to the{' '}
                <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => openExternal(LEGAL_URLS.terms)}>Terms of Use</Text>
                {' '}and{' '}
                <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => openExternal(LEGAL_URLS.privacy)}>Privacy Policy</Text>.
              </CheckRow>
              </>
            ) : (
              <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 18, marginTop: 2 }}>
                By signing in you agree to the{' '}
                <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => openExternal(LEGAL_URLS.terms)}>Terms of Use</Text>
                {' '}and{' '}
                <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => openExternal(LEGAL_URLS.privacy)}>Privacy Policy</Text>.
              </Text>
            )}

            <Button
              testID="auth-submit-btn"
              variant="brand"
              onPress={handleSubmit}
              disabled={loading || (mode === 'signup' && !signupGateOk)}
              style={{ marginTop: 4 }}
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </Card>

          <TouchableOpacity testID="auth-toggle-mode" onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={{ textAlign: 'center', fontSize: 14, color: `${colors.brandOn}CC` }}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ fontWeight: '700', color: colors.brandOn }}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
