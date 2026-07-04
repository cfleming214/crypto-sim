import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { Text } from './ui/Text';
import { Crown } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from './ui/Button';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { usePurchasesReady } from '../lib/purchases';
import { PurchaseModal } from './PurchaseModal';

// Prompts once a Premium subscription has lapsed while the user still holds
// Premium-granted content. Gives the choice to RESUBSCRIBE (keep everything) or
// REMOVE the perks (dispatch PREMIUM_DOWNGRADE): passes → 5, Premium-created
// portfolios removed, Premium cash clawed back from kept portfolios. Anything the
// user paid for separately (a $5M consumable) is kept. Renders nothing until the
// condition holds; resolving either way makes the condition false and hides it.
export function PremiumDowngradeWatcher() {
  const { state, dispatch } = useApp();
  const { status } = useAuth();
  const purchasesReady = usePurchasesReady();
  const { colors } = useTheme();
  const [resubscribe, setResubscribe] = useState(false);

  // Premium-created offline portfolios still present, and total Premium cash on
  // the portfolios we'd KEEP (main + paid ones). Either > 0 → content to reclaim.
  const removeIds = state.premiumPortfolioIds.filter(id => state.offlinePortfolios.ids.includes(id));
  const keptPremiumCash = Object.entries(state.premiumCash)
    .filter(([id]) => !removeIds.includes(id))
    .reduce((s, [, v]) => s + (v > 0 ? v : 0), 0);
  const hasPremiumContent = removeIds.length > 0 || keptPremiumCash > 0;

  // Only once RevenueCat has confirmed (ready) that a signed-in account is NOT
  // subscribed yet still holds Premium content. Never prompts offline/unconfigured
  // (purchasesReady false) or before entitlements resolve.
  const show = purchasesReady && status === 'authenticated' && !state.isSubscriber && hasPremiumContent && !resubscribe;

  const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

  return (
    <>
      {/* Non-dismissible: the user must choose resubscribe or remove. */}
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Crown color={colors.accent} size={22} strokeWidth={2} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Premium ended</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.ink2, lineHeight: 20, marginBottom: 14 }}>
              Your Premium subscription is no longer active. Resubscribe to keep everything, or continue and we’ll:
            </Text>
            <View style={{ gap: 8, marginBottom: 14 }}>
              <Bullet colors={colors} text="Reset your contest passes to 5" />
              {removeIds.length > 0 && (
                <Bullet colors={colors} text={`Remove ${removeIds.length} Premium portfolio${removeIds.length > 1 ? 's' : ''}`} />
              )}
              {keptPremiumCash > 0 && (
                <Bullet colors={colors} text={`Subtract ${money(keptPremiumCash)} of Premium balance from your kept portfolios`} />
              )}
            </View>
            <Text style={{ fontSize: 12, color: colors.ink3, marginBottom: 18, lineHeight: 17 }}>
              Anything you bought separately (a one-time $5M balance) is kept.
            </Text>
            <Button variant="accent" fullWidth onPress={() => setResubscribe(true)}>
              Resubscribe to keep everything
            </Button>
            <View style={{ height: 10 }} />
            <Button variant="surface" fullWidth onPress={() => dispatch({ type: 'PREMIUM_DOWNGRADE' })}>
              Remove Premium perks
            </Button>
          </View>
        </View>
      </Modal>
      <PurchaseModal visible={resubscribe} onClose={() => setResubscribe(false)} />
    </>
  );
}

function Bullet({ text, colors }: { text: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: colors.accent, fontWeight: '800' }}>•</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}
