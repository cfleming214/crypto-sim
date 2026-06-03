import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Mail, X } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from './ui/Button';
import { useAuth } from '../store/AuthContext';

type Step = 'enter-email' | 'enter-code';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after the email attribute is confirmed verified. */
  onVerified: () => void;
  /** Optional context line, e.g. "Verify your email to join this contest." */
  reason?: string;
}

export function EmailVerificationModal({ visible, onClose, onVerified, reason }: Props) {
  const { colors } = useTheme();
  const { email, emailVerified, startEmailVerification, confirmEmail } = useAuth();
  const [step, setStep] = useState<Step>('enter-email');
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // When the modal opens, decide which step to show based on current state.
  useEffect(() => {
    if (!visible) return;
    if (emailVerified) {
      onVerified();
      onClose();
      return;
    }
    if (email) {
      setEmailInput(email);
      setStep('enter-code');
    } else {
      setEmailInput('');
      setStep('enter-email');
    }
    setCode('');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputStyle = {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 14,
    fontSize: 15 as const,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.hairline,
  };

  const handleSendCode = async () => {
    if (loading) return;
    const value = emailInput.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await startEmailVerification(value);
      setStep('enter-code');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? "Couldn't send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await confirmEmail(code.trim());
      onVerified();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!emailInput.trim()) return;
    try {
      await startEmailVerification(emailInput.trim());
      Alert.alert('Code sent', `We sent a new code to ${emailInput.trim()}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? "Couldn't resend code.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{
          backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 24, gap: 16, paddingBottom: 40,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: `${colors.brand}22`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Mail color={colors.brand} size={18} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
                {step === 'enter-email' ? 'Verify your email' : 'Enter the code'}
              </Text>
            </View>
            <TouchableOpacity testID="email-verify-close" onPress={onClose} style={{ padding: 4 }}>
              <X color={colors.ink3} size={20} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 14, color: colors.ink3, lineHeight: 20 }}>
            {reason ?? 'Add a verified email to your account.'}
          </Text>

          {step === 'enter-email' ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Email</Text>
              <TextInput
                testID="email-verify-email-input"
                style={inputStyle}
                value={emailInput}
                onChangeText={setEmailInput}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={colors.ink4}
              />
              <Button testID="email-verify-send-btn" variant="brand" onPress={handleSendCode} disabled={loading}>
                {loading ? 'Sending…' : 'Send code'}
              </Button>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: colors.ink2 }}>
                Sent to <Text style={{ fontWeight: '600', color: colors.ink }}>{emailInput.trim()}</Text>
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Verification code</Text>
              <TextInput
                testID="email-verify-code-input"
                style={inputStyle}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor={colors.ink4}
              />
              <Button testID="email-verify-confirm-btn" variant="brand" onPress={handleConfirm} disabled={loading}>
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity testID="email-verify-change-email" onPress={() => setStep('enter-email')}>
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>Change email</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="email-verify-resend" onPress={handleResend}>
                  <Text style={{ fontSize: 13, color: colors.brand, fontWeight: '600' }}>Resend code</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
