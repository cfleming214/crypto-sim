import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../store/AuthContext';

type AuthMode = 'signin' | 'signup' | 'confirm';

export function AuthScreen() {
  const { colors } = useTheme();
  const { signIn, signUp, confirmSignUp, resendCode } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else if (mode === 'signup') {
        const { nextStep } = await signUp(email.trim(), password);
        if (nextStep === 'CONFIRM_SIGN_UP') setMode('confirm');
      } else {
        const { autoSignedIn } = await confirmSignUp(email.trim(), code.trim());
        if (!autoSignedIn) {
          // Email confirmed but Cognito didn't auto-sign-in (e.g. account was
          // created before autoSignIn was enabled). Send the user to sign-in.
          setMode('signin');
          setCode('');
          Alert.alert('Email confirmed', 'Sign in with your password to continue.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const headline =
    mode === 'confirm' ? 'Check your email' :
    mode === 'signin'  ? 'Welcome back' :
    'Create account';

  const subtitle =
    mode === 'confirm'
      ? `We sent a 6-digit code to ${email}`
      : 'Trade crypto. Win prizes. Risk nothing.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 28, gap: 24 }} keyboardShouldPersistTaps="handled">

          <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 8, gap: 16 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Trophy color={colors.brandOn} size={36} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brandOn, letterSpacing: -0.7, textAlign: 'center' }}>
              {headline}
            </Text>
            <Text style={{ fontSize: 14, color: `${colors.brandOn}CC`, textAlign: 'center', lineHeight: 20 }}>
              {subtitle}
            </Text>
          </View>

          <Card style={{ gap: 12 }}>
            {mode !== 'confirm' ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Email</Text>
                <TextInput
                  style={inputStyle}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.ink4}
                />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Password</Text>
                <TextInput
                  style={inputStyle}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  placeholderTextColor={colors.ink4}
                />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Verification code</Text>
                <TextInput
                  style={inputStyle}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  placeholderTextColor={colors.ink4}
                />
                <TouchableOpacity onPress={() => resendCode(email.trim())}>
                  <Text style={{ fontSize: 13, color: colors.brand, fontWeight: '600' }}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            <Button variant="brand" onPress={handleSubmit} disabled={loading} style={{ marginTop: 4 }}>
              {loading
                ? 'Please wait…'
                : mode === 'signin'  ? 'Sign in'
                : mode === 'signup'  ? 'Create account'
                : 'Verify email'}
            </Button>
          </Card>

          {mode !== 'confirm' && (
            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={{ textAlign: 'center', fontSize: 14, color: `${colors.brandOn}CC` }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={{ fontWeight: '700', color: colors.brandOn }}>
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
