import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './ui/Text';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { X, Plus, Wallet } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { MAX_OFFLINE_PORTFOLIOS } from '../constants/featureFlags';

// Where the $5M grant came from — decides which actions the chooser dispatches:
//   consumable       — one-time $5M purchase (create OR add to existing).
//   premium-balance  — Premium's monthly $5M (create OR add); marks the month claimed.
//   premium-portfolio— one of Premium's 3 new-portfolios/month (create ONLY, consumes
//                      a monthly allowance slot).
export type OfflineGrantSource = 'consumable' | 'premium-balance' | 'premium-portfolio';

interface Props {
  visible: boolean;
  onClose: () => void;
  amount: number;             // play money to grant (e.g. $5,000,000)
  source: OfflineGrantSource;
  monthKey?: string;          // required for the two premium sources
  onDone?: () => void;        // called after a successful place
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// After the user obtains a $5M grant (bought the consumable, or claimed a Premium
// monthly perk), this sheet lets them either spin up a NEW offline practice
// portfolio or top up an existing one. Play money only — never touches contests.
export function OfflinePortfolioChooser({ visible, onClose, amount, source, monthKey, onDone }: Props) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [name, setName] = useState('');

  const allowAdd = source !== 'premium-portfolio';
  const atCap = state.offlinePortfolios.ids.length >= MAX_OFFLINE_PORTFOLIOS;

  // Equity per addable portfolio (main + each offline), valued at live prices.
  const sliceFor = (id: string) => (id === state.activePortfolioId
    ? { cash: state.cash, holdings: state.holdings }
    : (state.portfolios[id] ?? { cash: id === 'main' ? 0 : 0, holdings: [] }));
  const equityOf = (id: string) => {
    const s = sliceFor(id);
    return s.cash + s.holdings.reduce((a, h) => {
      const c = state.coins.find(x => x.symbol === h.symbol);
      return a + (c ? c.price * h.units : 0);
    }, 0);
  };

  const addable = allowAdd
    ? [{ id: 'main', label: 'Main portfolio' }, ...state.offlinePortfolios.ids.map(id => ({ id, label: state.offlinePortfolios.names[id] ?? 'Portfolio' }))]
    : [];

  const finishPremium = () => {
    if (source === 'premium-balance' && monthKey) dispatch({ type: 'CLAIM_PREMIUM_BALANCE', monthKey });
  };

  const handleCreate = () => {
    if (atCap) {
      Alert.alert('Portfolio limit reached', `You can keep up to ${MAX_OFFLINE_PORTFOLIOS} offline portfolios. Add the balance to an existing one instead.`);
      return;
    }
    const id = `offline-${Date.now().toString(36)}`;
    const fallback = `Portfolio ${state.offlinePortfolios.ids.length + 2}`; // main = 1
    dispatch({
      type: 'CREATE_OFFLINE_PORTFOLIO',
      id,
      name: name.trim() || fallback,
      cash: amount,
      premiumMonthKey: source === 'premium-portfolio' ? monthKey : undefined,
    });
    finishPremium();
    setName('');
    onDone?.();
    onClose();
  };

  const handleAdd = (portfolioId: string) => {
    dispatch({ type: 'ADD_OFFLINE_BALANCE', portfolioId, amount });
    finishPremium();
    onDone?.();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Place your {fmt(amount)}</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>Practice balance — separate from contests</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}>
          {/* Create new */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>New portfolio</Text>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${colors.brand}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Plus color={colors.brand} size={20} strokeWidth={2.25} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>Create a new portfolio</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                  Starts with {fmt(amount)} · {state.offlinePortfolios.ids.length}/{MAX_OFFLINE_PORTFOLIOS} used
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <TextInput
                value={name}
                onChangeText={t => setName(t.slice(0, 24))}
                placeholder={`Portfolio ${state.offlinePortfolios.ids.length + 2}`}
                placeholderTextColor={colors.ink3}
                style={{ flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' }}
              />
            </View>
            <Button testID="chooser-create-btn" variant="brand" onPress={handleCreate} disabled={atCap}>
              {atCap ? 'Portfolio limit reached' : `Create with ${fmt(amount)}`}
            </Button>
          </Card>

          {/* Add to existing */}
          {allowAdd && addable.length > 0 && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
                Or add to existing
              </Text>
              <Card variant="noPad">
                {addable.map((p, i) => (
                  <TouchableOpacity key={p.id} testID={`chooser-add-${p.id}`} activeOpacity={0.75} onPress={() => handleAdd(p.id)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: i < addable.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                        <Wallet color={colors.ink2} size={18} strokeWidth={1.75} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', color: colors.ink }}>{p.label}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2, fontVariant: ['tabular-nums'] }}>{fmt(equityOf(p.id))}</Text>
                      </View>
                      <View style={{ backgroundColor: `${colors.up}1A`, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.up }}>+{fmt(amount)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
