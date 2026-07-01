import React, { useEffect, useState } from 'react';
import { View, Share, TextInput, Alert } from 'react-native';
import { Text } from './ui/Text';
import { Card, CardSection } from './ui/Card';
import { Button } from './ui/Button';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { countMyActivatedReferrals, referralTier, recordReferral } from '../services/referralService';
import { buildReferralLink } from '../lib/attribution';

// Profile referral surface for "Recruit & Rise": shows the user's invite code
// (share), their activated-referral count + milestone tier, and a field to enter
// a code if they didn't arrive via a link. The referee's reward is granted when
// they finish their first contest (ContestRewardWatcher); this card is the
// referrer-facing hub + the manual code-claim entry point.
export function ReferralCard() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const code = state.referral.code;
  const [activated, setActivated] = useState(0);
  const [entry, setEntry] = useState('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => { countMyActivatedReferrals().then(setActivated).catch(() => {}); }, [code]);

  const tier = referralTier(activated);

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Trade crypto & compete with me on CryptoComp — same $100k, best P&L wins. Use my code ${code} for a bonus when you join your first contest: ${buildReferralLink(code)}`,
      });
    } catch { /* cancelled */ }
  };

  const claimCode = async () => {
    const c = entry.trim().toUpperCase();
    if (!c || claiming) return;
    if (c === code) { Alert.alert('That\'s your code', "You can't refer yourself."); return; }
    setClaiming(true);
    const ok = await recordReferral(c, state.user.handle);
    setClaiming(false);
    if (ok) {
      dispatch({ type: 'SET_REFERRED_BY', code: c });
      setEntry('');
      Alert.alert('Code applied 🎉', 'Finish your first contest to unlock your welcome bonus (passes + XP).');
    } else {
      Alert.alert("Couldn't apply code", 'That code isn\'t valid, or you\'ve already used one.');
    }
  };

  return (
    <Card variant="noPad">
      <CardSection>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>Invite friends — Recruit & Rise</Text>
        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
          They get bonus passes + XP on their first contest. You climb the recruiter tiers.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: 2, color: colors.ink, fontVariant: ['tabular-nums'] }}>
              {code ?? '······'}
            </Text>
          </View>
          <Button variant="brand" size="sm" onPress={share} disabled={!code}>Invite</Button>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: colors.ink2 }}>
            {activated} activated · {tier.current ?? 'No tier yet'}
          </Text>
          {tier.next && (
            <Text style={{ fontSize: 12, color: colors.ink3 }}>{tier.toNext} to {tier.next}</Text>
          )}
        </View>
      </CardSection>

      {/* Manual code entry — only when the user hasn't been attributed yet. */}
      {!state.referral.referredByCode && (
        <CardSection last>
          <Text style={{ fontSize: 12, color: colors.ink3, marginBottom: 6 }}>Have a friend's code?</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12 }}>
              <TextInput
                value={entry}
                onChangeText={t => setEntry(t.toUpperCase())}
                placeholder="ENTER CODE"
                placeholderTextColor={colors.ink3}
                autoCapitalize="characters"
                maxLength={12}
                style={{ fontSize: 14, color: colors.ink, paddingVertical: 10, letterSpacing: 1 }}
              />
            </View>
            <Button variant="surface" size="sm" onPress={claimCode} disabled={!entry.trim() || claiming}>Apply</Button>
          </View>
        </CardSection>
      )}
    </Card>
  );
}
