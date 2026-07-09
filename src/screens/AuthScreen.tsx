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
import { APPLE_SIGNIN_ENABLED } from '../constants/featureFlags';
import { LEGAL_URLS } from '../constants/legal';
import { openExternal } from '../lib/linking';

type AuthMode = 'signin' | 'signup';

export function AuthScreen() {
  const { colors } = useTheme();
  const { signIn, signUp, confirmSignUp, resendSignUpCode, signInWithApple } = useAuth();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [mode, setMode] = useState<AuthMode>(route.params?.mode ?? 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  // Sign-up email-verification step: once Cognito emails a code we show the
  // code-entry card; the account isn't usable until the code is confirmed.
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [code, setCode] = useState('');

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
        const res = await signUp(u, password);
        // Record the age confirmation locally (timestamped) for our own records.
        try { await AsyncStorage.setItem('ageConfirmed.v1', new Date().toISOString()); } catch { /* non-fatal */ }
        if (res.needsConfirmation) {
          // Cognito emailed a code — show the verify step; don't close or sign in.
          setPendingConfirm(true);
          return;
        }
      }
      // Auth flipped to authenticated — dismiss the modal so the gated
      // screen underneath re-renders with real content. goBack is a no-op
      // if this screen was somehow the root.
      if (nav.canGoBack()) nav.goBack();
    } catch (e: any) {
      // A prior unconfirmed sign-up for this email → jump to the code step and
      // resend, rather than dead-ending on "user already exists".
      if (mode === 'signup' && e?.name === 'UsernameExistsException') {
        try {
          await resendSignUpCode(username.trim());
          setPendingConfirm(true);
          return;
        } catch {
          Alert.alert('Account already exists', 'That email is already registered. Try signing in instead.');
          return;
        }
      }
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Verify the emailed code — this is when the account actually becomes usable.
  const handleConfirmCode = async () => {
    if (loading) return;
    if (code.trim().length < 4) { Alert.alert('Enter the code', 'Please enter the verification code we emailed you.'); return; }
    setLoading(true);
    try {
      await confirmSignUp(username.trim(), code, password);
      if (nav.canGoBack()) nav.goBack();
    } catch (e: any) {
      Alert.alert('Verification failed', e?.message ?? 'That code was incorrect or expired. Try again or resend.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await resendSignUpCode(username.trim());
      Alert.alert('Code sent', `We emailed a new verification code to ${username.trim()}.`);
    } catch (e: any) {
      Alert.alert('Could not resend', e?.message ?? 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // "Wrong email?" — go back to the form so they can fix it, then re-submit.
  const handleBackToForm = () => {
    setPendingConfirm(false);
    setCode('');
  };

  const handleApple = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signInWithApple();
      if (nav.canGoBack()) nav.goBack();
    } catch (e: any) {
      Alert.alert('Apple sign-in unavailable', e?.message ?? 'Please try email for now.');
    } finally {
      setLoading(false);
    }
  };

  const confirming = mode === 'signup' && pendingConfirm;
  const headline = confirming ? 'Verify your email' : mode === 'signin' ? 'Welcome back' : 'Create account';
  const subtitle = confirming
    ? `Enter the code we sent to ${username.trim()}`
    : 'Trade crypto. Win prizes. Risk nothing.';

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

          {confirming ? (
          <Card style={{ gap: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Verification code</Text>
            <TextInput
              testID="auth-code-input"
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              placeholder="123456"
              placeholderTextColor={colors.ink4}
              maxLength={10}
            />
            <Button testID="auth-verify-btn" variant="brand" onPress={handleConfirmCode} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Please wait…' : 'Verify & create account'}
            </Button>
            <Button testID="auth-resend-btn" variant="surface" onPress={handleResendCode} disabled={loading}>
              Resend code
            </Button>
            <TouchableOpacity testID="auth-change-email-btn" onPress={handleBackToForm} disabled={loading} style={{ paddingVertical: 6 }}>
              <Text style={{ textAlign: 'center', fontSize: 14, color: colors.ink2 }}>← Wrong email? Change it</Text>
            </TouchableOpacity>
          </Card>
          ) : (<>
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

            {/* Sign in with Apple — gated behind APPLE_SIGNIN_ENABLED so it only
                appears once the Cognito Apple provider + OAuth are configured. */}
            {APPLE_SIGNIN_ENABLED && (
              <Button
                testID="auth-apple-btn"
                variant="surface"
                onPress={handleApple}
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                 Continue with Apple
              </Button>
            )}
          </Card>

          <TouchableOpacity testID="auth-toggle-mode" onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={{ textAlign: 'center', fontSize: 14, color: `${colors.brandOn}CC` }}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ fontWeight: '700', color: colors.brandOn }}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
          </>)}

          {/* Explicit guest path — the demo portfolio + markets work without an
              account, so let people in rather than dead-ending at the wall. */}
          <TouchableOpacity
            testID="auth-continue-guest"
            onPress={() => { if (nav.canGoBack()) nav.goBack(); }}
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ textAlign: 'center', fontSize: 14, color: `${colors.brandOn}AA` }}>
              Continue as guest
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
