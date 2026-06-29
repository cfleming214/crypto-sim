import React, { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './ui/Text';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { X, Ban, Wallet, Crown, Check, RefreshCw, Gift, Plus } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import {
  getPackages, purchase, restore, useEntitlements,
  PRODUCT_NO_ADS, PRODUCT_BALANCE_5M, PRODUCT_PREMIUM, type PurchasePackage,
} from '../lib/purchases';
import { OFFLINE_BALANCE_GRANT, PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH, MAX_OFFLINE_PORTFOLIOS } from '../constants/featureFlags';
import { OfflinePortfolioChooser, type OfflineGrantSource } from './OfflinePortfolioChooser';
import { monthKey } from '../services/gamification';
import { LEGAL_URLS } from '../constants/legal';
import { openExternal } from '../lib/linking';

interface Props { visible: boolean; onClose: () => void; }

// Fallback price strings shown before/if the store offering fails to load, so the
// sheet is never blank. The real localized price replaces these once loaded.
const OPTIONS = [
  { key: 'noads',   productId: PRODUCT_NO_ADS,    title: 'No Ads',             price: '$2.99', period: '/month',  sub: true,
    desc: 'Remove banner, in-feed, and full-screen ads. Optional reward videos still work.', icon: Ban },
  { key: 'balance', productId: PRODUCT_BALANCE_5M, title: '$5M Practice Balance', price: '$2.99', period: 'one-time', sub: false,
    desc: 'Add $5,000,000 of play money to a new or existing offline portfolio.', icon: Wallet },
  { key: 'premium', productId: PRODUCT_PREMIUM,   title: 'Premium',            price: '$3.99', period: '/month',  sub: true,
    desc: `No ads + $5M every month + up to ${PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH} extra $5M portfolios per month.`, icon: Crown },
] as const;

export function PurchaseModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const { noAds, premium } = useEntitlements();
  const mk = monthKey(Date.now());
  const balanceClaimable = premium && state.premiumGrants.balanceMonthKey !== mk;
  const portfoliosUsed = state.premiumGrants.portfolioMonthKey === mk ? state.premiumGrants.portfoliosThisMonth : 0;
  const portfoliosLeft = Math.max(0, PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH - portfoliosUsed);
  const atCap = state.offlinePortfolios.ids.length >= MAX_OFFLINE_PORTFOLIOS;
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // productId mid-purchase
  const [chooser, setChooser] = useState<{ source: OfflineGrantSource } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getPackages().then(setPackages).finally(() => setLoading(false));
  }, [visible]);

  const priceFor = (productId: string, fallback: string) =>
    packages.find(p => p.productId === productId)?.priceString || fallback;

  const handleBuy = async (productId: string) => {
    const pkg = packages.find(p => p.productId === productId);
    if (!pkg) {
      Alert.alert('Unavailable', 'This purchase isn’t available right now. Please try again later.');
      return;
    }
    setBusy(productId);
    const res = await purchase(pkg);
    setBusy(null);
    if (res.cancelled) return;
    if (!res.ok) { Alert.alert('Purchase failed', res.error ?? 'Something went wrong.'); return; }
    if (res.entitlements) dispatch({ type: 'SET_ENTITLEMENTS', noAds: res.entitlements.noAds, premium: res.entitlements.premium });
    if (productId === PRODUCT_BALANCE_5M) {
      setChooser({ source: 'consumable' });
    } else {
      Alert.alert('You’re all set 🎉', productId === PRODUCT_PREMIUM ? 'Premium is active — enjoy no ads and your monthly perks.' : 'No more ads. Enjoy!');
      onClose();
    }
  };

  const handleRestore = async () => {
    setBusy('restore');
    const res = await restore();
    setBusy(null);
    if (!res.ok) { Alert.alert('Restore failed', res.error ?? 'Could not restore purchases.'); return; }
    if (res.entitlements) dispatch({ type: 'SET_ENTITLEMENTS', noAds: res.entitlements.noAds, premium: res.entitlements.premium });
    const any = res.entitlements?.noAds || res.entitlements?.premium;
    Alert.alert(any ? 'Purchases restored' : 'Nothing to restore', any ? 'Your subscription has been restored.' : 'No active purchases were found for your Apple ID.');
  };

  const ownedLabel = (key: string) =>
    (key === 'premium' && premium) ? 'Active'
      : (key === 'noads' && noAds) ? (premium ? 'Included in Premium' : 'Active')
      : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Upgrade</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Go ad-free or stock up on practice balance</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}>
          {loading && (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <ActivityIndicator color={colors.ink3} />
            </View>
          )}

          {/* Premium monthly perks — claimable in-app (need the new-or-add choice,
              so never auto-granted). Shown only while Premium is active. */}
          {premium && (balanceClaimable || portfoliosLeft > 0) && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Premium perks</Text>
              {balanceClaimable && (
                <Card style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
                      <Gift color={colors.accent} size={22} strokeWidth={1.9} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>This month's $5M</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Add to a new or existing offline portfolio.</Text>
                    </View>
                  </View>
                  <Button testID="premium-claim-balance" variant="accent" onPress={() => setChooser({ source: 'premium-balance' })}>Claim $5M</Button>
                </Card>
              )}
              {portfoliosLeft > 0 && (
                <Card style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
                      <Plus color={colors.accent} size={22} strokeWidth={2.25} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>New $5M portfolio</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{portfoliosLeft} of {PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH} left this month{atCap ? ' · portfolio limit reached' : ''}.</Text>
                    </View>
                  </View>
                  <Button testID="premium-new-portfolio" variant="accent" disabled={atCap} onPress={() => setChooser({ source: 'premium-portfolio' })}>Create portfolio</Button>
                </Card>
              )}
            </>
          )}

          {OPTIONS.map(opt => {
            const owned = ownedLabel(opt.key);
            const Icon = opt.icon;
            return (
              <Card key={opt.key} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.brand}1A`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon color={colors.brand} size={22} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{opt.title}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                        {priceFor(opt.productId, opt.price)}
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3 }}> {opt.period}</Text>
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, lineHeight: 17 }}>{opt.desc}</Text>
                  </View>
                </View>
                {owned ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}>
                    <Check color={colors.up} size={16} strokeWidth={2.5} />
                    <Text style={{ fontWeight: '700', color: colors.up }}>{owned}</Text>
                  </View>
                ) : (
                  <Button
                    testID={`purchase-${opt.key}`}
                    variant="brand"
                    onPress={() => handleBuy(opt.productId)}
                    loading={busy === opt.productId}
                    disabled={!!busy}
                  >
                    {opt.sub ? 'Subscribe' : 'Buy'}
                  </Button>
                )}
              </Card>
            );
          })}

          {/* Restore */}
          <TouchableOpacity testID="purchase-restore" onPress={handleRestore} disabled={!!busy} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
            {busy === 'restore' ? <ActivityIndicator color={colors.ink3} size="small" /> : <RefreshCw color={colors.ink2} size={16} strokeWidth={2} />}
            <Text style={{ fontWeight: '600', color: colors.ink2 }}>Restore purchases</Text>
          </TouchableOpacity>

          {/* Renewal terms — Apple review requirement for auto-renewing subs. */}
          <View style={{ gap: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, lineHeight: 16 }}>
              No Ads ($2.99/month) and Premium ($3.99/month) are auto-renewing subscriptions. Payment is charged to your
              Apple ID at confirmation. The subscription renews automatically unless cancelled at least 24 hours before the
              end of the current period; your Apple ID is charged for renewal within 24 hours of the period ending. Manage or
              cancel anytime in your device Settings → Apple ID → Subscriptions. The $5M Practice Balance is a one-time
              purchase of in-app play money and is non-refundable. All purchases unlock virtual, practice-only items and
              carry no real-world or cash value.
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
              <TouchableOpacity onPress={() => openExternal(LEGAL_URLS.terms)}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.brand }}>Terms of Use</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openExternal(LEGAL_URLS.privacy)}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.brand }}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Where the $5M consumable gets placed after a successful buy. */}
        <OfflinePortfolioChooser
          visible={!!chooser}
          onClose={() => setChooser(null)}
          amount={OFFLINE_BALANCE_GRANT}
          source={chooser?.source ?? 'consumable'}
          monthKey={monthKey(Date.now())}
          onDone={onClose}
        />
      </SafeAreaView>
    </Modal>
  );
}
