import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Switch, Alert, Modal, TextInput, ScrollView, Image, Share, Linking, Platform } from 'react-native';
import { Text } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { ReferralCard } from '../components/ReferralCard';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { LeagueBadge } from '../components/ui/LeagueBadge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { ACHIEVEMENTS, contestXpForRank, monthKey } from '../services/gamification';
import { achievementIcon } from '../components/ui/achievementIcons';
import { MoreHorizontal, Star, Flame, Trophy, Shield, User, ArrowLeftRight, BarChart2, Moon, Bell, Activity, X, Camera, LogOut, Ban, FileText, Trash2, Banknote, GraduationCap, RotateCcw, Sparkles, Crown, RefreshCw, Gift, Plus } from 'lucide-react-native';
import { frameColor, titleLabel, FRAMES } from '../data/season';
import { ACADEMY } from '../data/academy';
import { useCoachmarkSettings } from '../components/coachmarks/CoachmarkProvider';
import { Lightbulb } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadAvatarPhoto, fetchActiveMirrorCount, loadFinishedContestResults, fetchMyContestStats } from '../services/portfolioService';
import { registerDevice, deactivateDevices } from '../services/pushDeviceService';
import { isAmplifyConfigured } from '../lib/amplify';
import { LEGAL_URLS } from '../constants/legal';
import { openExternal } from '../lib/linking';
import { refreshStatus } from '../services/stripeService';
import { PAYOUTS_ENABLED, STARTING_CASH, CONTEST_CASH_PRIZES, DEFAULT_PRIZE_XP, PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH } from '../constants/featureFlags';
import { watchForReward } from '../lib/rewardedRewards';
import { isAdTestMode, setAdTestMode, isAdTestModeForcedByEnv } from '../lib/adTestMode';
import { restore as restorePurchases, refreshEntitlements, entitlementOwner, type EntitlementOwner, useEntitlements, usePurchasesReady, entitlementDiagnostic } from '../lib/purchases';
import { PurchaseModal } from '../components/PurchaseModal';
import { OfflinePortfolioChooser, type OfflineGrantSource } from '../components/OfflinePortfolioChooser';
import { OFFLINE_BALANCE_GRANT } from '../constants/featureFlags';
import type { AppDispatch } from '../store/AppContext';

// Open the system "Manage Subscriptions" sheet (Apple ID / Play Store).
function openManageSubscriptions() {
  const url = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  Linking.openURL(url).catch(() => {});
}

// Restore prior purchases (Apple review requirement) and sync entitlements.
async function doRestore(dispatch: AppDispatch) {
  const res = await restorePurchases();
  if (!res.ok) { Alert.alert('Restore failed', res.error ?? 'Could not restore purchases.'); return; }
  if (res.entitlements) dispatch({ type: 'SET_ENTITLEMENTS', noAds: res.entitlements.noAds, premium: res.entitlements.premium });
  const any = res.entitlements?.noAds || res.entitlements?.premium;
  Alert.alert(
    any ? 'Purchases restored' : 'Nothing to restore',
    any ? 'Your subscription has been restored.' : 'No active purchases were found for your Apple ID.',
  );
}

// Force a network re-read of entitlements (invalidate the RevenueCat cache +
// getCustomerInfo) so a LAPSED/cancelled subscription is picked up immediately,
// without waiting for a cold launch. Unlike Restore (which re-applies a receipt),
// this can also turn Premium OFF when the sub is gone. Reports the resulting
// state so a tester can confirm removal (esp. useful with flaky sandbox expiry).
async function doRefresh(dispatch: AppDispatch) {
  const e = await refreshEntitlements();
  if (!e) {
    Alert.alert('Couldn’t refresh', 'Subscription status is unavailable right now — you may be offline, or in-app purchases aren’t configured on this build.');
    return;
  }
  dispatch({ type: 'SET_ENTITLEMENTS', noAds: e.noAds, premium: e.premium });
  Alert.alert(
    e.premium ? 'Premium active' : e.noAds ? 'No-Ads active' : 'No active subscription',
    e.premium || e.noAds ? 'Your subscription is active.' : 'No active subscription was found — Premium perks and No-Ads are now off.',
  );
}

const AVATAR_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#64748B',
];

function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [handle, setHandle] = useState(state.user.handle);
  const [avatarColor, setAvatarColor] = useState(state.user.avatarColor);
  const [photoUri, setPhotoUri] = useState<string | null>(state.user.avatarUri ?? null);
  const [pickedLocalUri, setPickedLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set your avatar.', [{ text: 'OK' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
      setPickedLocalUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    dispatch({ type: 'SET_HANDLE', handle });
    dispatch({ type: 'SET_AVATAR_COLOR', color: avatarColor });

    // If the user picked a new local photo this session, upload it to S3
    if (pickedLocalUri) {
      if (isAmplifyConfigured) {
        const result = await uploadAvatarPhoto(pickedLocalUri);
        if (result) {
          dispatch({ type: 'SET_AVATAR', uri: result.url, key: result.key });
        } else {
          // Upload failed — fall back to local URI for this session
          dispatch({ type: 'SET_AVATAR_URI', uri: pickedLocalUri });
          Alert.alert('Upload failed', 'Your photo will only be visible on this device until you try again.', [{ text: 'OK' }]);
        }
      } else {
        // Offline mode — keep the local URI
        dispatch({ type: 'SET_AVATAR_URI', uri: pickedLocalUri });
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Edit profile</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}>
          {/* Avatar preview */}
          <View style={{ alignItems: 'center', gap: 16 }}>
            <TouchableOpacity testID="profile-photo-picker" onPress={handlePickPhoto} activeOpacity={0.8} style={{ position: 'relative' }}>
              {photoUri ? (
                <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden' }}>
                  <Image source={{ uri: photoUri }} style={{ width: 80, height: 80 }} />
                </View>
              ) : (
                <Avatar
                  initials={handle.slice(0, 2).toUpperCase() || '??'}
                  size="xl"
                  style={{ backgroundColor: avatarColor }}
                />
              )}
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: colors.brand,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: colors.surface,
              }}>
                <Camera color={colors.brandOn} size={13} strokeWidth={2} />
              </View>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>
              {photoUri ? 'Tap to change photo · or choose a color below' : 'Tap to upload photo · or choose a color'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity key={c} testID={`profile-color-${c.replace('#', '')}`} onPress={() => setAvatarColor(c)}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: c,
                    borderWidth: 3,
                    borderColor: avatarColor === c ? colors.ink : 'transparent',
                  }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Handle input */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Handle</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <Text style={{ fontSize: 15, color: colors.ink3 }}>@</Text>
              <TextInput
                testID="profile-handle-input"
                value={handle}
                onChangeText={t => setHandle(t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="yourhandle"
                placeholderTextColor={colors.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' }}
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Letters, numbers, underscores only · max 20 chars</Text>
          </View>

          <Button testID="profile-save-btn" variant="brand" onPress={handleSave} disabled={saving} loading={saving}>
            Save changes
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


// Guest (signed-out) profile — settings reachable without an account, plus the
// upgrade/restore entry points so a paid user who hasn't signed in can still
// restore their purchases and manage settings. Replaces the old AuthWall.
function OfflineProfile() {
  const { colors, isDark, toggle } = useTheme();
  const { dispatch } = useApp();
  const { noAds, premium } = useEntitlements();
  const nav = useNavigation<any>();
  const { enabled: tipsEnabled, setEnabled: setTipsEnabled } = useCoachmarkSettings();
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const purchasesReady = usePurchasesReady();
  const planLabel = premium ? 'Premium' : noAds ? 'No Ads' : null;

  return (
    <ScreenShell back={false} title="Settings" eyebrow="Guest">
      {/* Sign-in CTA */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${colors.brand}1A`, alignItems: 'center', justifyContent: 'center' }}>
            <User color={colors.brand} size={22} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>You're browsing as a guest</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2, lineHeight: 17 }}>
              Create a free account to save your portfolio, stats, and trading history across devices.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button testID="offline-signin-btn" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => nav.navigate('Auth', { mode: 'signin' })}>Sign in</Button>
          <Button testID="offline-signup-btn" variant="brand" size="sm" style={{ flex: 1 }} onPress={() => nav.navigate('Auth', { mode: 'signup' })}>Create account</Button>
        </View>
      </Card>

      {/* Upgrade — hidden when the purchases SDK isn't available on this binary. */}
      {purchasesReady && (
      <Card variant="noPad">
        <TouchableOpacity testID="offline-upgrade" onPress={() => setPurchaseVisible(true)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Sparkles color={colors.accent} size={18} strokeWidth={1.9} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Upgrade — No Ads / Premium</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity testID="offline-restore" onPress={() => doRestore(dispatch)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RefreshCw color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Restore purchases</Text>
              </View>
              {planLabel ? <Chip variant="up">{planLabel}</Chip> : <Text style={{ color: colors.ink3 }}>›</Text>}
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity testID="offline-manage-sub" onPress={openManageSubscriptions}>
          <CardSection last>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Crown color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Manage subscription</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
      </Card>
      )}

      {/* Preferences */}
      <Card variant="noPad">
        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Moon color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>Dark mode</Text>
            </View>
            <Switch value={isDark} onValueChange={toggle} trackColor={{ true: colors.brand, false: colors.surface2 }} />
          </View>
        </CardSection>
        <CardSection last>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Lightbulb color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>In-app tips</Text>
            </View>
            <Switch value={tipsEnabled} onValueChange={setTipsEnabled} trackColor={{ true: colors.brand, false: colors.surface2 }} />
          </View>
        </CardSection>
      </Card>

      {/* Legal */}
      <Card variant="noPad">
        <TouchableOpacity onPress={() => openExternal(LEGAL_URLS.terms)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FileText color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Terms of Use</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openExternal(LEGAL_URLS.privacy)}>
          <CardSection last>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Shield color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Privacy Policy</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
      </Card>

      <PurchaseModal visible={purchaseVisible} onClose={() => setPurchaseVisible(false)} />
    </ScreenShell>
  );
}

export function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const { state, dispatch } = useApp();
  const { noAds, premium } = useEntitlements();
  const [editVisible, setEditVisible] = useState(false);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [perkChooser, setPerkChooser] = useState<{ source: OfflineGrantSource } | null>(null);
  const purchasesReady = usePurchasesReady();
  const planLabel = premium ? 'Premium' : noAds ? 'No Ads' : null;
  // Premium has monthly perks to claim (the $5M + new $5M portfolios). Surface a
  // "Claim" hint on the plan row so they're discoverable — tapping the row opens
  // the Upgrade sheet, where the perks live.
  const pmk = monthKey(Date.now());
  const premiumPortfoliosLeft = state.premiumGrants.portfolioMonthKey === pmk
    ? Math.max(0, PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH - state.premiumGrants.portfoliosThisMonth)
    : PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH;
  const premiumPerksAvailable = premium && (state.premiumGrants.balanceMonthKey !== pmk || premiumPortfoliosLeft > 0);
  // When the app sees NO entitlement but the user believes they subscribed, show
  // what RevenueCat actually returned so we can tell "not synced" from "entitlement
  // not attached / wrong identifier".
  const entDiag = entitlementDiagnostic();
  const showEntitlementDiag = purchasesReady && !premium && !noAds && (entDiag.subscriptions.length > 0 || entDiag.entitlements.length > 0);
  // WHO RevenueCat attributes the sub to on this device — surfaces a transfer/leak
  // (sub attributed to another account) vs this account vs an anonymous device
  // user. Re-loads when entitlements change (e.g. after Refresh) so it stays live.
  const [entOwner, setEntOwner] = useState<EntitlementOwner | null>(null);
  useEffect(() => {
    let alive = true;
    entitlementOwner().then(o => { if (alive) setEntOwner(o); });
    return () => { alive = false; };
  }, [premium, noAds, purchasesReady]);
  const showOwnerDiag = purchasesReady && !!entOwner;
  const [activeMirrorCount, setActiveMirrorCount] = useState(0);
  // LIFETIME contest stats (total tournaments ever entered + best finish), from
  // ALL the user's entries — so these don't reset to 0 once contests end.
  const [contestStats, setContestStats] = useState<{ played: number; bestRank: number | null }>({ played: 0, bestRank: null });

  // Refresh active mirror count on mount + whenever the user adds/removes one.
  // Mirror is owner-scoped so list() already returns only this user's rows.
  useEffect(() => {
    fetchActiveMirrorCount().then(setActiveMirrorCount);
    fetchMyContestStats().then(setContestStats).catch(() => {});
  }, [state.joinedTournamentIds.length]); // re-fetch on join/leave as a cheap heuristic

  // "Win bracket" — any finished joined competition where the user ranked #1
  // on the live leaderboard.
  const hasWonBracket = state.joinedTournamentIds.some(cid => {
    const comp = state.competitions.find(c => c.id === cid);
    if (!comp || comp.status !== 'finished') return false;
    const entries = state.leaderboard[cid] ?? [];
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    return sorted[0]?.handle === state.user.handle;
  });

  // "Top 50" — best rank across joined competitions, computed live (no longer
  // depends on the removed activeTournament summary).
  const topRanks = state.joinedTournamentIds
    .map(cid => {
      const entries = state.leaderboard[cid] ?? [];
      const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
      const idx = sorted.findIndex(e => e.handle === state.user.handle);
      return idx >= 0 ? idx + 1 : null;
    })
    .filter((r): r is number => r !== null);
  const bestLiveRank = topRanks.length > 0 ? Math.min(...topRanks) : Infinity;

  // Achievements come from the engine + persisted unlock map (state.achievements),
  // kept current by the global AchievementWatcher. We render earned state and the
  // unlock date here; new unlocks toast + confetti elsewhere.
  const achievements = ACHIEVEMENTS.map(def => ({
    id: def.id,
    name: def.name,
    description: def.description,
    Icon: achievementIcon(def.icon),
    earned: def.id in state.achievements,
    unlockedAt: state.achievements[def.id] as number | undefined,
  }));
  const earnedCount = achievements.filter(a => a.earned).length;
  const { signOut, deleteAccount, status, userId } = useAuth();
  const nav = useNavigation<any>();

  // Master push-notification toggle. The real source of truth is the server-side
  // PushDevice.active flag; this just persists the user's intent locally and
  // flips registration on/off. Default on.
  const PUSH_PREF_KEY = 'pref:pushEnabled';
  const [pushOn, setPushOn] = useState(true);
  const { enabled: tipsEnabled, setEnabled: setTipsEnabled, resetSeen: resetTips } = useCoachmarkSettings();
  useEffect(() => {
    AsyncStorage.getItem(PUSH_PREF_KEY).then(v => { if (v !== null) setPushOn(v === '1'); });
  }, []);
  const togglePush = (v: boolean) => {
    setPushOn(v);
    AsyncStorage.setItem(PUSH_PREF_KEY, v ? '1' : '0').catch(() => {});
    if (v && userId) registerDevice(userId);
    else if (!v) deactivateDevices();
  };

  // Withdrawable prize balance — refreshed whenever Profile regains focus (e.g.
  // after claiming a prize on the Compete tab or returning from the Withdraw
  // screen). Only meaningful when real-money payouts are enabled.
  const [balanceCents, setBalanceCents] = useState(0);
  const loadBalance = useCallback(() => {
    if (PAYOUTS_ENABLED) refreshStatus().then(a => { if (a) setBalanceCents(a.balanceCents ?? 0); }).catch(() => {});
  }, []);
  useFocusEffect(loadBalance);

  // Unclaimed contest rewards — finished contests where the user placed on the
  // podium and hasn't collected the XP yet (XP-prize mode only). Refreshed on
  // focus, so a contest that settled while away shows up when you return.
  const [finishedResults, setFinishedResults] = useState<{ competitionId: string; rank: number }[]>([]);
  const loadFinished = useCallback(() => {
    if (!CONTEST_CASH_PRIZES) loadFinishedContestResults().then(setFinishedResults).catch(() => {});
  }, []);
  useFocusEffect(loadFinished);
  // Resolve each finished result to its XP prize (rank × the contest's prizeXp),
  // keeping only podium finishes that still have an unclaimed prize.
  const unclaimedRewards = finishedResults
    .map(r => {
      const comp = state.finishedCompetitions.find(c => c.id === r.competitionId)
        ?? state.competitions.find(c => c.id === r.competitionId);
      const xp = contestXpForRank(comp?.prizeXp ?? DEFAULT_PRIZE_XP, r.rank);
      return { id: r.competitionId, name: comp?.name ?? 'Contest', rank: r.rank, xp };
    })
    .filter(u => u.xp > 0 && !state.claimedContestIds.includes(u.id));
  const claimReward = (u: { id: string; name: string; xp: number }) => {
    dispatch({ type: 'CLAIM_CONTEST_XP', contestId: u.id, xp: u.xp });
    Alert.alert('Reward claimed 🎉', `+${u.xp.toLocaleString()} XP from ${u.name}.`);
  };

  // Two-step confirmation, then a permanent client-side wipe + Cognito
  // deleteUser (App Store guideline 5.1.1(v)). On success auth flips to
  // unauthenticated and this screen is replaced by the guest/sign-up wall.
  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all of your data — profile, trades, public leaderboard entry, and avatar. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Permanently delete account',
            `Are you absolutely sure? @${state.user.handle} and all associated data will be removed immediately.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                  } catch (e: any) {
                    Alert.alert('Could not delete account', e?.message ?? 'Something went wrong. Please try again.');
                  }
                },
              },
            ],
          ),
        },
      ],
    );
  };

  const pnl = state.bankroll - STARTING_CASH;
  const sellTrades = state.trades.filter(t => t.side === 'sell');
  // Win rate = % of sells that closed in profit. Prefer the realized P&L recorded
  // at sell time; for any sell missing it (legacy / rebalance / copy rows), rebuild
  // the symbol's running average cost from the BUY ledger and compare against it.
  // The old fallback compared the sell price to the CURRENT holding's avg cost —
  // but a fully-closed position has no current holding, so it always read as a
  // loss and dragged the win rate down. This replays trades oldest-first instead.
  const winRate = (() => {
    const chron = [...state.trades].sort((a, b) => a.timestamp - b.timestamp);
    const pos: Record<string, { units: number; cost: number }> = {};
    let wins = 0, sells = 0;
    for (const t of chron) {
      const p = pos[t.symbol] ?? { units: 0, cost: 0 };
      if (t.side === 'buy') { p.units += t.units; p.cost += t.amount; pos[t.symbol] = p; continue; }
      if (t.side !== 'sell') continue;
      sells++;
      const avgCost = p.units > 0 ? p.cost / p.units : 0;
      const win = typeof t.realizedPnl === 'number' ? t.realizedPnl > 0 : (avgCost > 0 && t.price > avgCost);
      if (win) wins++;
      p.units = Math.max(0, p.units - t.units);
      p.cost = avgCost * p.units;            // shrink cost basis at avg cost
      pos[t.symbol] = p;
    }
    return sells > 0 ? Math.round((wins / sells) * 100) : 0;
  })();
  // Best rank across all joined contests: find this user's rank in each
  // live leaderboard, take the lowest (best) number.
  const myRanks: number[] = [];
  for (const cid of state.joinedTournamentIds) {
    const entries = state.leaderboard[cid] ?? [];
    const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
    const idx = sorted.findIndex(e => e.handle === state.user.handle);
    if (idx >= 0) myRanks.push(idx + 1);
  }
  const bestRank = myRanks.length > 0 ? `#${Math.min(...myRanks)}` : '—';

  // Contest history: every contest the user has joined, with current bankroll,
  // P&L, live rank, and the prize they'd win if it ended right now.
  const contestHistory = state.joinedTournamentIds
    .map(id => {
      const comp = state.competitions.find(c => c.id === id);
      if (!comp) return null;
      const portfolio = state.portfolios[id];
      const slice = state.activePortfolioId === id
        ? { cash: state.cash, holdings: state.holdings }
        : (portfolio ?? { cash: STARTING_CASH, holdings: [] });
      const bankroll = slice.cash + slice.holdings.reduce((s, h) => {
        const c = state.coins.find(x => x.symbol === h.symbol);
        return s + (c ? c.price * h.units : 0);
      }, 0);
      const contestPnl = bankroll - STARTING_CASH;
      const entries = state.leaderboard[id] ?? [];
      const sorted = [...entries].sort((a, b) => b.bankroll - a.bankroll);
      const myIdx = sorted.findIndex(e => e.handle === state.user.handle);
      const myRank = myIdx >= 0 ? myIdx + 1 : null;
      const prize = myRank && myRank <= comp.prizes.length ? comp.prizes[myRank - 1] : 0;
      // XP-prize mode (production): the prize is the rank's share of prizeXp,
      // derived from the live leaderboard rank — same math as the contest screen.
      const xp = myRank ? contestXpForRank(comp.prizeXp, myRank) : 0;
      return { comp, bankroll, pnl: contestPnl, myRank, prize, xp };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.comp.startAt - a.comp.startAt);

  const handleShareProfile = async () => {
    const pnlStr = `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`;
    const divLabel = state.user.division > 0 ? String(state.user.division) : '';
    const message =
      `@${state.user.handle} on CryptoComp — ${pnlStr} all-time · ${state.user.league} ${divLabel}`.trim() +
      `\n${winRate}% win rate · ${state.user.xp.toLocaleString()} XP · ${state.user.streak}-day streak`;
    try {
      await Share.share({ message });
    } catch {
      // User cancelled or share unavailable — silent
    }
  };

  const stats = [
    ['All-time P&L', `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`, pnl >= 0 ? 'up' : 'down'],
    // Lifetime: total tournaments ever entered + best-ever finish (from all
    // entries), never less than what's currently active.
    ['Tournaments', String(Math.max(contestStats.played, state.joinedTournamentIds.length)), null],
    ['Win rate',    sellTrades.length > 0 ? `${winRate}%` : '—', sellTrades.length > 0 ? (winRate >= 50 ? 'up' : 'down') : null],
    ['Trades',      String(state.trades.length), null],
    ['XP',          state.user.xp.toLocaleString(), null],
    ['Best rank',   contestStats.bestRank != null ? `#${contestStats.bestRank}` : bestRank, null],
  ];

  // Guests can use the demo portfolio AND reach settings/restore-purchases
  // without an account — show the offline settings page instead of a hard wall.
  if (status === 'unauthenticated') {
    return <OfflineProfile />;
  }

  return (
    <ScreenShell
      back={false} // tab root — suppress the transient canGoBack() chevron flash
      title="Profile"
      rightActions={
        <TouchableOpacity
          style={{ padding: 8 }}
          onPress={() => Alert.alert('More options', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share profile', onPress: handleShareProfile },
            {
              text: `Reset demo ($${(STARTING_CASH / 1000).toFixed(0)}K)`,
              onPress: () => Alert.alert(
                'Reset demo?',
                noAds
                  ? `Your bankroll and trades go back to $${(STARTING_CASH + (state.purchasedCash[state.activePortfolioId] ?? 0)).toLocaleString()}. Profile settings are kept.`
                  : `Watch a short video to reset — your bankroll and trades go back to $${(STARTING_CASH + (state.purchasedCash[state.activePortfolioId] ?? 0)).toLocaleString()}. Profile settings are kept.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: noAds ? 'Reset' : 'Watch & reset',
                    onPress: async () => {
                      // Graceful fallback: reset even if no ad is available to show.
                      const { granted, blocked } = await watchForReward('rewardedReset', dispatch, { grantOnUnavailable: true });
                      if (blocked) return; // duplicate trigger while an ad is up — ignore
                      if (!granted) Alert.alert('Not reset', "The video didn't finish, so nothing was reset.");
                    },
                  },
                ]
              ),
            },
            {
              text: `Test ads (QA): ${isAdTestMode() ? 'ON' : 'OFF'}`,
              onPress: () => {
                if (isAdTestModeForcedByEnv()) {
                  Alert.alert('Test ads forced on', "Test mode is forced by the build/OTA flag and can't be turned off in-app.");
                  return;
                }
                const next = !isAdTestMode();
                setAdTestMode(next);
                Alert.alert(`Test ads ${next ? 'ON' : 'OFF'}`, `Newly loaded ads will use ${next ? 'TEST' : 'REAL'} units.`);
              },
            },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => signOut(),
            },
          ])}
        >
          <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
        </TouchableOpacity>
      }
    >
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials={state.user.handle.slice(0, 2).toUpperCase() || '??'} size="xl" uri={state.user.avatarUri} status="online" frame={frameColor(state.cosmetics.equippedFrame) ?? undefined} style={{ backgroundColor: state.user.avatarColor }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>@{state.user.handle}</Text>
            {titleLabel(state.cosmetics.equippedTitle) && (
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent }}>· {titleLabel(state.cosmetics.equippedTitle)}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <LeagueBadge league={state.user.league} division={state.user.division} />
            <Text style={{ fontSize: 12, color: colors.ink3 }}>
              {state.user.createdAt
                ? `Joined ${new Date(state.user.createdAt).toLocaleDateString([], { month: 'short', year: '2-digit' })}`
                : 'New trader'}
            </Text>
          </View>
        </View>
        <Button testID="profile-edit-btn" variant="ghost" size="sm" onPress={() => setEditVisible(true)}>Edit</Button>
      </View>

      {/* Cosmetics — equip unlocked titles + avatar frames (tap to toggle) */}
      {(state.cosmetics.titles.length > 0 || state.cosmetics.frames.length > 0) && (
        <Card variant="tinted" style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cosmetics</Text>
          {state.cosmetics.titles.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {state.cosmetics.titles.map(id => {
                const active = state.cosmetics.equippedTitle === id;
                return (
                  <Chip key={id} variant={active ? 'accent' : 'default'} onPress={() => dispatch({ type: 'EQUIP_COSMETIC', slot: 'title', id: active ? null : id })}>
                    {titleLabel(id)}
                  </Chip>
                );
              })}
            </View>
          )}
          {state.cosmetics.frames.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {state.cosmetics.frames.map(id => {
                const f = FRAMES.find(x => x.id === id);
                const active = state.cosmetics.equippedFrame === id;
                return (
                  <Chip key={id} variant={active ? 'accent' : 'default'} dot dotColor={f?.color} onPress={() => dispatch({ type: 'EQUIP_COSMETIC', slot: 'frame', id: active ? null : id })}>
                    {f?.label} frame
                  </Chip>
                );
              })}
            </View>
          )}
        </Card>
      )}

      {/* Stat grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline }}>
        {stats.map(([label, value, type], i) => (
          <View
            key={label}
            style={{
              width: '33.33%',
              padding: 14,
              backgroundColor: colors.surface,
              alignItems: 'center',
              borderRightWidth: i % 3 !== 2 ? 1 : 0,
              borderRightColor: colors.hairline,
              borderTopWidth: i >= 3 ? 1 : 0,
              borderTopColor: colors.hairline,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
            <Text style={{ fontWeight: '700', fontSize: 15, color: type === 'up' ? colors.up : type === 'down' ? colors.down : colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* Referral program — Recruit & Rise */}
      <ReferralCard />

      {/* Quick links */}
      <Card variant="noPad">
        <TouchableOpacity onPress={() => nav.navigate('Learn')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <GraduationCap color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Crypto Academy</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.ink3, fontSize: 12 }}>
                  {ACADEMY.filter(l => state.academyCompleted.includes(l.id)).length}/{ACADEMY.length}
                </Text>
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => nav.navigate('Notifications')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Bell color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Notifications</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </View>
          </CardSection>
        </TouchableOpacity>

        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Moon color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>Dark mode</Text>
            </View>
            <Switch value={isDark} onValueChange={toggle} trackColor={{ true: colors.brand, false: colors.surface2 }} />
          </View>
        </CardSection>

        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Bell color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>Push notifications</Text>
            </View>
            <Switch
              testID="profile-push-toggle"
              value={pushOn}
              onValueChange={togglePush}
              trackColor={{ true: colors.brand, false: colors.surface2 }}
            />
          </View>
        </CardSection>

        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Lightbulb color={colors.ink} size={18} strokeWidth={1.75} />
              <View>
                <Text style={{ fontWeight: '600', color: colors.ink }}>In-app tips</Text>
                {tipsEnabled && (
                  <TouchableOpacity onPress={resetTips} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>Reset — show all tips again</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Switch
              testID="profile-tips-toggle"
              value={tipsEnabled}
              onValueChange={setTipsEnabled}
              trackColor={{ true: colors.brand, false: colors.surface2 }}
            />
          </View>
        </CardSection>

        <CardSection>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Trophy color={colors.ink} size={18} strokeWidth={1.75} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>Show me on the leaderboard</Text>
            </View>
            <Switch
              testID="profile-leaderboard-toggle"
              value={state.user.leaderboardVisible ?? true}
              onValueChange={v => dispatch({ type: 'SET_LEADERBOARD_VISIBLE', visible: v })}
              trackColor={{ true: colors.brand, false: colors.surface2 }}
            />
          </View>
        </CardSection>

        <TouchableOpacity onPress={() => nav.navigate('Activity')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Activity color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>XP this season</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', color: colors.up, fontVariant: ['tabular-nums'] }}>
                  {state.user.xp.toLocaleString()} XP
                </Text>
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => nav.navigate('Season')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Sparkles color={colors.accent} size={18} strokeWidth={1.9} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Season Pass</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await AsyncStorage.removeItem('hasOnboarded');   // keep 'onboardingRewarded' so XP isn't re-farmed
            dispatch({ type: 'LOAD_ONBOARDING', hasOnboarded: false });
          }}
        >
          <CardSection last={!PAYOUTS_ENABLED}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RotateCcw color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Replay onboarding</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        {/* Real-money payout entry — hidden while PAYOUTS_ENABLED is off so the
            submitted build stays a pure play-money simulator. */}
        {PAYOUTS_ENABLED && (
          <TouchableOpacity testID="profile-payouts" onPress={() => nav.navigate('PayoutSetup')}>
            <CardSection last>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Banknote color={colors.ink} size={18} strokeWidth={1.75} />
                  <Text style={{ fontWeight: '600', color: colors.ink }}>Prize payouts</Text>
                </View>
                <Text style={{ color: colors.ink3 }}>›</Text>
              </View>
            </CardSection>
          </TouchableOpacity>
        )}
      </Card>

      {/* Subscription & purchases — upgrade, restore, manage. Hidden when the
          purchases SDK isn't available on this binary (e.g. OTA on an older build). */}
      {purchasesReady && (
      <Card variant="noPad">
        <TouchableOpacity testID="profile-upgrade" onPress={() => setPurchaseVisible(true)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Sparkles color={colors.accent} size={18} strokeWidth={1.9} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>{planLabel ? 'Your plan' : 'Upgrade — No Ads / Premium'}</Text>
              </View>
              {planLabel ? <Chip variant="up">{planLabel}</Chip> : <Text style={{ color: colors.ink3 }}>›</Text>}
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity testID="profile-restore" onPress={() => doRestore(dispatch)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RefreshCw color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Restore purchases</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity testID="profile-manage-sub" onPress={openManageSubscriptions}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Crown color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Manage subscription</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
        <TouchableOpacity testID="profile-refresh-entitlements" onPress={async () => { await doRefresh(dispatch); entitlementOwner().then(setEntOwner); }}>
          <CardSection last={!premium && !showEntitlementDiag && !showOwnerDiag}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RefreshCw color={colors.ink} size={18} strokeWidth={1.75} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>Refresh subscription status</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>Re-check after cancelling, or if perks look wrong</Text>
                </View>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        {/* Entitlement-owner diagnostic — which RevenueCat identity owns the sub on
            this device. Flags a transfer/leak (attributed to ANOTHER account) vs
            this account vs an anonymous device user. */}
        {showOwnerDiag && entOwner && (() => {
          const mine = !entOwner.isAnonymous && !!userId && entOwner.appUserId === userId;
          const leaked = !entOwner.isAnonymous && !!userId && entOwner.appUserId !== userId;
          const ownerLabel = entOwner.isAnonymous
            ? 'Anonymous device user (not scoped to an account)'
            : mine
              ? `This account (@${state.user.handle})`
              : 'Another account — attributed elsewhere';
          const ownerColor = entOwner.isAnonymous || leaked ? colors.warn : colors.ink3;
          const exp = entOwner.expirationDate ? new Date(entOwner.expirationDate) : null;
          const expLabel = exp && !isNaN(exp.getTime())
            ? `${entOwner.willRenew ? 'Renews' : 'Expires'} ${exp.toLocaleDateString()} ${exp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : null;
          return (
            <CardSection last={!premium && !showEntitlementDiag}>
              <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '700', marginBottom: 3 }}>Subscription identity</Text>
              <Text style={{ fontSize: 12, color: ownerColor, fontWeight: '600' }}>
                {leaked ? '⚠️ ' : ''}{ownerLabel}
              </Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }} numberOfLines={1}>
                RevenueCat ID: {entOwner.appUserId}
              </Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                {entOwner.active
                  ? `Active${entOwner.productId ? ` · ${entOwner.productId.split('.').pop()}` : ''}${expLabel ? ` · ${expLabel}` : ''}`
                  : 'No active subscription'}
              </Text>
              {leaked && (
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4, lineHeight: 15 }}>
                  A sub bought on another account transferred to this one. Set RevenueCat transfer behavior to “Keep with original App User ID” to prevent this.
                </Text>
              )}
            </CardSection>
          );
        })()}

        {/* Diagnostic: subscribed but the app sees no entitlement → almost always
            the entitlement isn't attached to the product (or the ID differs). */}
        {showEntitlementDiag && (
          <CardSection last>
            <Text style={{ fontSize: 11, color: colors.warn, fontWeight: '700', marginBottom: 2 }}>Subscription active, but no perks granted</Text>
            <Text style={{ fontSize: 11, color: colors.ink3, lineHeight: 16 }}>
              {entDiag.subscriptions.length > 0 ? `Subscribed: ${entDiag.subscriptions.join(', ')}\n` : ''}
              Active entitlements: {entDiag.entitlements.length > 0 ? entDiag.entitlements.join(', ') : 'none'}
              {'\n'}Expected: no_ads / premium. In RevenueCat, attach those entitlements to the product (matching IDs), then tap Restore purchases.
            </Text>
          </CardSection>
        )}

        {/* Premium perks — redeem the monthly $5M + extra $5M portfolios right
            here, directly under Manage subscription. */}
        {premium && (
          <>
            <CardSection>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Gift color={colors.accent} size={20} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>Monthly $5M balance</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Add to a new or existing portfolio · resets monthly</Text>
                </View>
                {state.premiumGrants.balanceMonthKey !== pmk
                  ? <Button testID="perk-redeem-balance" variant="accent" size="sm" onPress={() => setPerkChooser({ source: 'premium-balance' })}>Redeem</Button>
                  : <Chip variant="up">Claimed</Chip>}
              </View>
            </CardSection>
            <CardSection last>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Plus color={colors.accent} size={20} strokeWidth={2.25} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>New $5M portfolio</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{premiumPortfoliosLeft} of {PREMIUM_OFFLINE_PORTFOLIOS_PER_MONTH} left this month</Text>
                </View>
                {premiumPortfoliosLeft > 0
                  ? <Button testID="perk-redeem-portfolio" variant="accent" size="sm" onPress={() => setPerkChooser({ source: 'premium-portfolio' })}>Create</Button>
                  : <Chip variant="default">Used up</Chip>}
              </View>
            </CardSection>
          </>
        )}
      </Card>
      )}

      {/* Prize balance + withdrawals — only when real-money payouts are enabled. */}
      {PAYOUTS_ENABLED && (
        <Card variant="noPad">
          <TouchableOpacity testID="profile-balance" onPress={() => nav.navigate('Withdraw')}>
            <CardSection last>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.upSoft }}>
                    <Banknote color={colors.up} size={20} strokeWidth={1.75} />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '700', color: colors.ink }}>Prize balance</Text>
                    <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Withdraw to your bank ›</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                  ${(balanceCents / 100).toFixed(2)}
                </Text>
              </View>
            </CardSection>
          </TouchableOpacity>
        </Card>
      )}

      {/* Safety & legal */}
      <Card variant="noPad">
        <TouchableOpacity testID="profile-blocked-users" onPress={() => nav.navigate('BlockedUsers')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ban color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Blocked users</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity testID="profile-old-walkthrough" onPress={() => nav.navigate('OldWalkthrough')}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Sparkles color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Old walkthrough</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity testID="profile-terms" onPress={() => openExternal(LEGAL_URLS.terms)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FileText color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Terms of Use</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity testID="profile-privacy" onPress={() => openExternal(LEGAL_URLS.privacy)}>
          <CardSection>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Shield color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Privacy Policy</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>

        <TouchableOpacity testID="profile-rules" onPress={() => openExternal(LEGAL_URLS.rules)}>
          <CardSection last>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Trophy color={colors.ink} size={18} strokeWidth={1.75} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>Contest Rules</Text>
              </View>
              <Text style={{ color: colors.ink3 }}>›</Text>
            </View>
          </CardSection>
        </TouchableOpacity>
      </Card>

      {/* Achievements */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Achievements</Text>
        <Text style={{ fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] }}>{earnedCount} / {achievements.length}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {achievements.map(({ Icon, name, description, earned, unlockedAt }) => (
          <TouchableOpacity
            key={name}
            style={{ width: '22%', alignItems: 'center', opacity: earned ? 1 : 0.35 }}
            onPress={() => earned
              ? Alert.alert(name, `${description}${unlockedAt ? `\n\nUnlocked ${new Date(unlockedAt).toLocaleDateString()}` : ''}`, [{ text: 'Nice!' }])
              : Alert.alert(name, description, [{ text: 'OK' }])
            }
            activeOpacity={0.75}
          >
            <View style={{
              width: '100%', aspectRatio: 1, borderRadius: 14,
              backgroundColor: earned ? colors.surface2 : 'transparent',
              borderWidth: 1,
              borderColor: earned ? colors.hairline : colors.hairlineStrong,
              borderStyle: earned ? 'solid' : 'dashed',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon color={earned ? colors.ink : colors.ink3} size={22} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6, textAlign: 'center' }}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Unclaimed contest rewards — podium finishes with XP still to collect. */}
      {unclaimedRewards.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Unclaimed rewards</Text>
            <Chip variant="accent">{unclaimedRewards.length}</Chip>
          </View>
          <Card variant="noPad">
            {unclaimedRewards.map((u, i) => (
              <CardSection key={u.id} last={i === unclaimedRewards.length - 1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Trophy color={colors.accent} size={20} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={1}>{u.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                      Finished #{u.rank} · +{u.xp.toLocaleString()} XP
                    </Text>
                  </View>
                  <Button testID={`profile-claim-${u.id}`} variant="accent" size="sm" onPress={() => claimReward(u)}>Claim</Button>
                </View>
              </CardSection>
            ))}
          </Card>
        </>
      )}

      {/* Contest history */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Contest history</Text>
      {contestHistory.length === 0 ? (
        <Card variant="tinted">
          <Text style={{ fontSize: 13, color: colors.ink3 }}>
            You haven't joined any contests yet. Head to Compete to find one.
          </Text>
        </Card>
      ) : (
        <Card variant="noPad">
          {contestHistory.map((row, i) => {
            const finished = row.comp.status === 'finished';
            const live = row.comp.status === 'live';
            return (
              <TouchableOpacity
                key={row.comp.id}
                activeOpacity={0.7}
                onPress={() => nav.navigate('TournamentDetail', { id: row.comp.id })}
              >
                <CardSection last={i === contestHistory.length - 1}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }}>
                          {row.comp.name}
                        </Text>
                        <View style={{
                          paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
                          backgroundColor: finished ? colors.surface2 : (live ? colors.upSoft : colors.surface2),
                        }}>
                          <Text style={{
                            fontSize: 10, fontWeight: '700', letterSpacing: 0.3,
                            color: finished ? colors.ink3 : (live ? colors.up : colors.ink3),
                            textTransform: 'uppercase',
                          }}>
                            {finished ? 'Finished' : (live ? 'Live' : 'Open')}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3, fontVariant: ['tabular-nums'] }}>
                        {row.myRank ? `#${row.myRank}` : 'Unranked'} · ${Math.round(row.bankroll).toLocaleString()} bankroll
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontWeight: '700', fontSize: 13,
                        color: row.pnl >= 0 ? colors.up : colors.down,
                        fontVariant: ['tabular-nums'],
                      }}>
                        {row.pnl >= 0 ? '+' : ''}${Math.abs(row.pnl).toFixed(0)}
                      </Text>
                      <Text style={{
                        fontSize: 11,
                        color: (CONTEST_CASH_PRIZES ? row.prize : row.xp) > 0 ? colors.up : colors.ink3,
                        fontVariant: ['tabular-nums'],
                        marginTop: 2,
                      }}>
                        {CONTEST_CASH_PRIZES
                          ? (row.prize > 0
                              ? (finished ? `Won $${row.prize}` : `~$${row.prize} if ends now`)
                              : (finished ? 'No prize' : 'Out of money'))
                          : (row.xp > 0
                              ? (finished ? `Won ${row.xp.toLocaleString()} XP` : `~${row.xp.toLocaleString()} XP if ends now`)
                              : (finished ? 'No prize' : 'Out of money'))}
                      </Text>
                    </View>
                  </View>
                </CardSection>
              </TouchableOpacity>
            );
          })}
        </Card>
      )}

      {/* Sign out — only authenticated users reach this screen (guests see
          the AuthWall above), so the button always renders here. */}
      {(
        <TouchableOpacity
          testID="profile-signout-btn"
          onPress={() => Alert.alert(
            'Sign out?',
            `You'll be signed out of @${state.user.handle}. Your portfolio is saved in the cloud.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ],
          )}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, paddingVertical: 14, marginTop: 8,
            borderRadius: 12, borderWidth: 1, borderColor: colors.hairline,
            backgroundColor: colors.surface,
          }}
          activeOpacity={0.7}
        >
          <LogOut color={colors.down} size={18} strokeWidth={1.75} />
          <Text style={{ fontWeight: '600', color: colors.down }}>Sign out</Text>
        </TouchableOpacity>
      )}

      {/* Account deletion — permanent, App Store guideline 5.1.1(v). */}
      <TouchableOpacity
        testID="profile-delete-account-btn"
        onPress={confirmDeleteAccount}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 8, paddingVertical: 14,
          borderRadius: 12, borderWidth: 1, borderColor: colors.hairline,
          backgroundColor: 'transparent',
        }}
        activeOpacity={0.7}
      >
        <Trash2 color={colors.down} size={18} strokeWidth={1.75} />
        <Text style={{ fontWeight: '600', color: colors.down }}>Delete account</Text>
      </TouchableOpacity>

      <EditProfileModal visible={editVisible} onClose={() => setEditVisible(false)} />
      <PurchaseModal visible={purchaseVisible} onClose={() => setPurchaseVisible(false)} />

      {/* Premium perk redemption — a single modal hosting the inline chooser
          (create a new $5M portfolio or add the $5M to an existing one). */}
      <Modal visible={!!perkChooser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPerkChooser(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          {perkChooser && (
            <OfflinePortfolioChooser
              amount={OFFLINE_BALANCE_GRANT}
              source={perkChooser.source}
              monthKey={pmk}
              onClose={() => setPerkChooser(null)}
              onDone={() => setPerkChooser(null)}
            />
          )}
        </SafeAreaView>
      </Modal>
    </ScreenShell>
  );
}
