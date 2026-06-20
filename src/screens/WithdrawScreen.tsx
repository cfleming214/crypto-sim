import React, { useCallback, useState } from 'react';
import { View, ActivityIndicator, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Text } from '../components/ui/Text';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { AuthWall } from '../components/AuthWall';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { refreshStatus, type PayoutAccount } from '../services/stripeService';
import {
  fetchWithdrawals, requestWithdrawal, listPayoutMethods, setPayoutMethod,
  fetchPayoutHistory, claimPrize,
  type WithdrawalRow, type PayoutMethod, type PayoutHistoryRow,
} from '../services/walletService';
import { Banknote, Building2, CreditCard, CheckCircle2, Clock, AlertCircle, Trophy } from 'lucide-react-native';

// Status → chip variant + label for a withdrawal request.
function statusChip(status: string): { variant: 'up' | 'warn' | 'down'; label: string } {
  switch (status) {
    case 'paid':       return { variant: 'up', label: 'Paid' };
    case 'pending':    return { variant: 'warn', label: 'Pending' };
    case 'processing': return { variant: 'warn', label: 'Processing' };
    case 'failed':     return { variant: 'down', label: 'Failed' };
    case 'rejected':   return { variant: 'down', label: 'Rejected' };
    default:           return { variant: 'warn', label: status };
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function WithdrawScreen() {
  const { colors } = useTheme();
  const { status: authStatus } = useAuth();
  const nav = useNavigation<any>();

  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [prizes, setPrizes] = useState<PayoutHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [acct, rows, prizeRows] = await Promise.all([refreshStatus(), fetchWithdrawals(), fetchPayoutHistory()]);
      if (cancelled) return;
      setAccount(acct);
      setWithdrawals(rows);
      setPrizes(prizeRows);
      setPreferredId(acct?.preferredMethodId ?? null);
      // Methods only exist once a Connect account is created.
      if (acct?.payoutsEnabled) {
        const m = await listPayoutMethods();
        if (!cancelled) {
          setMethods(m.methods);
          setPreferredId(prev => prev ?? m.preferredMethodId ?? null);
        }
      } else {
        setMethods([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);
  useFocusEffect(load);

  const onboarded = !!account?.payoutsEnabled;
  const balanceCents = account?.balanceCents ?? 0;

  const handleRequest = async () => {
    if (requesting) return;
    if (!onboarded) { nav.navigate('PayoutSetup'); return; }
    if (balanceCents <= 0) return;
    setRequesting(true);
    const res = await requestWithdrawal();
    setRequesting(false);
    if (res.ok) {
      Alert.alert('Withdrawal requested', `$${((res.amountCents ?? 0) / 100).toFixed(2)} will be paid to your account on the next daily payout run.`);
      load();
    } else if (res.needsOnboarding) {
      Alert.alert('Verify your details', 'Finish setting up your Stripe payout account before withdrawing.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set up', onPress: () => nav.navigate('PayoutSetup') },
      ]);
    } else {
      Alert.alert('Could not withdraw', res.error ?? 'Please try again later.');
    }
  };

  const handlePickMethod = async (m: PayoutMethod) => {
    if (settingId) return;
    setSettingId(m.id);
    const res = await setPayoutMethod(m.id);
    setSettingId(null);
    if (res.ok) setPreferredId(res.preferredMethodId ?? m.id);
    else Alert.alert('Could not set method', res.error ?? 'Please try again.');
  };

  const handleClaim = async (p: PayoutHistoryRow) => {
    if (claimingId) return;
    setClaimingId(p.payoutId);
    const res = await claimPrize(p.payoutId);
    setClaimingId(null);
    if (res.ok) {
      Alert.alert('Prize claimed 🎉', `$${(p.amountCents / 100).toFixed(2)} was added to your balance.`);
      load();
    } else {
      Alert.alert('Could not claim', res.error ?? 'Please try again in a moment.');
    }
  };

  // Status chip for a prize's lifecycle.
  const prizeChip = (p: PayoutHistoryRow): { variant: 'up' | 'brand' | 'warn'; label: string } =>
    p.withdrawn ? { variant: 'up', label: 'Withdrawn' }
      : p.claimed ? { variant: 'brand', label: 'In balance' }
      : { variant: 'warn', label: 'Unclaimed' };

  if (authStatus !== 'authenticated') {
    return <AuthWall icon={Banknote} title="Sign in to withdraw" subtitle="Claim contest prizes and withdraw them to your bank." />;
  }

  return (
    <ScreenShell title="Withdraw">
      {loading && !account ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <>
          {/* Balance + request */}
          <Card>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>Available balance</Text>
            <Text style={{ fontSize: 34, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              ${(balanceCents / 100).toFixed(2)}
            </Text>
            <Button
              testID="withdraw-request-btn"
              variant="brand"
              fullWidth
              loading={requesting}
              disabled={requesting || (onboarded && balanceCents <= 0)}
              onPress={handleRequest}
              style={{ marginTop: 12 }}
            >
              {!onboarded ? 'Set up payouts to withdraw' : balanceCents <= 0 ? 'No balance to withdraw' : `Withdraw $${(balanceCents / 100).toFixed(2)}`}
            </Button>
            <Text style={{ fontSize: 12, color: colors.ink4, textAlign: 'center', marginTop: 8 }}>
              Withdrawals are reviewed and paid out once a day. You'll see the status below.
            </Text>
          </Card>

          {/* Payout method picker */}
          {onboarded && (
            <Card variant="noPad">
              <CardSection>
                <Text style={{ fontWeight: '700', color: colors.ink }}>Payout method</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Where your withdrawals are sent.</Text>
              </CardSection>
              {methods.length === 0 ? (
                <CardSection last>
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>
                    No payout methods yet — add a bank in Stripe onboarding.
                  </Text>
                </CardSection>
              ) : methods.map((m, i) => {
                const selected = preferredId === m.id;
                const Icon = m.type === 'card' ? CreditCard : Building2;
                return (
                  <TouchableOpacity key={m.id} testID={`payout-method-${m.id}`} onPress={() => handlePickMethod(m)} disabled={!!settingId}>
                    <CardSection last={i === methods.length - 1}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Icon color={selected ? colors.brand : colors.ink3} size={20} strokeWidth={1.75} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600', color: colors.ink }}>{m.label}</Text>
                          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 1 }}>{m.currency.toUpperCase()}</Text>
                        </View>
                        {settingId === m.id
                          ? <ActivityIndicator color={colors.brand} />
                          : selected
                            ? <Chip variant="brand">Default</Chip>
                            : <Text style={{ fontSize: 12, color: colors.ink3 }}>Set default</Text>}
                      </View>
                    </CardSection>
                  </TouchableOpacity>
                );
              })}
            </Card>
          )}

          {/* Not onboarded → explain the gate */}
          {!onboarded && (
            <Card variant="tinted" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle color={colors.warn} size={18} strokeWidth={1.75} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 19 }}>
                You can win and claim prizes without connecting Stripe, but you must verify your
                identity and bank details with Stripe before withdrawing.
              </Text>
            </Card>
          )}

          {/* Prize history — every win with its lifecycle status, claim inline */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 4 }}>Prizes</Text>
          {prizes.length === 0 ? (
            <Card variant="tinted">
              <Text style={{ color: colors.ink3, fontSize: 13 }}>
                No prizes yet — finish a cash contest in the prize positions and it shows up here.
              </Text>
            </Card>
          ) : (
            <Card variant="noPad">
              {prizes.map((p, i) => {
                const pc = prizeChip(p);
                return (
                  <CardSection key={p.payoutId} last={i === prizes.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.withdrawn ? colors.upSoft : p.claimed ? `${colors.brand}1A` : colors.warnSoft }}>
                        <Trophy color={p.withdrawn ? colors.up : p.claimed ? colors.brand : colors.warn} size={18} strokeWidth={1.75} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>{p.competitionName || 'Contest prize'}</Text>
                          <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>${(p.amountCents / 100).toFixed(2)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: colors.ink3 }}>
                            {p.rank ? `Rank #${p.rank}` : 'Prize'} · {fmtDate(p.createdAt)}
                          </Text>
                          {p.claimed || p.withdrawn ? (
                            <Chip variant={pc.variant}>{pc.label}</Chip>
                          ) : (
                            <TouchableOpacity testID={`withdraw-claim-${p.payoutId}`} disabled={claimingId === p.payoutId} onPress={() => handleClaim(p)}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brand }}>
                                {claimingId === p.payoutId ? 'Claiming…' : 'Claim'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  </CardSection>
                );
              })}
            </Card>
          )}

          {/* Withdrawal history */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 4 }}>Withdrawal requests</Text>
          {withdrawals.length === 0 ? (
            <Card variant="tinted">
              <Text style={{ color: colors.ink3, fontSize: 13 }}>No withdrawals yet.</Text>
            </Card>
          ) : (
            <Card variant="noPad">
              {withdrawals.map((w, i) => {
                const sc = statusChip(w.status);
                const StatusIcon = sc.variant === 'up' ? CheckCircle2 : sc.variant === 'down' ? AlertCircle : Clock;
                return (
                  <CardSection key={w.id} last={i === withdrawals.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <StatusIcon color={sc.variant === 'up' ? colors.up : sc.variant === 'down' ? colors.down : colors.warn} size={20} strokeWidth={1.75} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                          ${(w.amountCents / 100).toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 1 }} numberOfLines={1}>
                          {fmtDate(w.processedAt || w.createdAt)}{w.methodLabel ? ` · ${w.methodLabel}` : ''}
                          {w.status === 'rejected' || w.status === 'failed' ? (w.failureReason ? ` · ${w.failureReason}` : '') : ''}
                        </Text>
                      </View>
                      <Chip variant={sc.variant}>{sc.label}</Chip>
                    </View>
                  </CardSection>
                );
              })}
            </Card>
          )}
        </>
      )}
    </ScreenShell>
  );
}
