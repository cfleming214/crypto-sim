import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../components/ui/Text';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AuthWall } from '../components/AuthWall';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { StripeOnboarding } from '../components/StripeOnboarding';
import { refreshStatus, startOnboarding, type PayoutAccount } from '../services/stripeService';
import { Banknote, CheckCircle2, AlertCircle } from 'lucide-react-native';

// Lets a user connect a Stripe payout account so contest prizes can be sent to
// their bank. Onboarding itself runs in the native embedded Stripe component;
// this screen wraps it with status + entry/return handling.
export function PayoutSetupScreen() {
  const { colors } = useTheme();
  const { status: authStatus } = useAuth();
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // refreshStatus is authoritative: the Lambda looks up the account by id (the
  // Cognito sub) via GetItem, so it doesn't depend on the owner-auth read path.
  const load = useCallback(async () => {
    setLoading(true);
    setAccount(await refreshStatus());
    setLoading(false);
  }, []);

  useEffect(() => { if (authStatus === 'authenticated') load(); }, [authStatus, load]);

  // Mint an Account Session and hand its client secret to the WebView. In mock
  // mode there's no secret — the backend already flipped the account to enabled,
  // so just reload status (which shows "Payouts active") instead of erroring.
  const beginOnboarding = useCallback(async () => {
    setStarting(true);
    const { clientSecret: cs, mock, error } = await startOnboarding();
    setStarting(false);
    if (cs) setClientSecret(cs);
    else if (mock) await load();
    else Alert.alert('Could not start setup', error ?? 'Please try again later.');
  }, [load]);

  const handleExit = useCallback(async () => {
    setClientSecret(null);
    // Pull fresh capability state from Stripe (also updates our StripeAccount row).
    await load();
  }, [load]);

  if (authStatus !== 'authenticated') {
    return <AuthWall icon={Banknote} title="Sign in to set up payouts" subtitle="Connect a bank account to receive contest prizes." />;
  }

  const enabled = account?.payoutsEnabled;

  return (
    <ScreenShell title="Prize payouts">
      {clientSecret ? (
        <StripeOnboarding clientSecret={clientSecret} onExit={handleExit} />
      ) : loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <>
          <Card variant="noPad">
            <CardSection last>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled ? colors.upSoft : colors.warnSoft }}>
                  {enabled
                    ? <CheckCircle2 color={colors.up} size={22} strokeWidth={1.75} />
                    : <AlertCircle color={colors.warn} size={22} strokeWidth={1.75} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink }}>
                    {enabled ? 'Payouts active' : account?.detailsSubmitted ? 'Almost there' : 'Not set up yet'}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
                    {enabled
                      ? 'Contest prizes will be sent to your connected account automatically.'
                      : account?.detailsSubmitted
                        ? 'Stripe is still verifying your details. Check back shortly.'
                        : 'Connect a bank account so we can pay out the prizes you win.'}
                  </Text>
                </View>
              </View>
            </CardSection>
          </Card>

          <Button variant="brand" fullWidth loading={starting} disabled={starting} onPress={beginOnboarding}>
            {enabled ? 'Update payout details' : account?.detailsSubmitted ? 'Continue setup' : 'Set up payouts'}
          </Button>

          <Text style={{ fontSize: 12, color: colors.ink4, textAlign: 'center', paddingHorizontal: 20 }}>
            Payouts are handled securely by Stripe. We never see your bank details.
          </Text>
        </>
      )}
    </ScreenShell>
  );
}
