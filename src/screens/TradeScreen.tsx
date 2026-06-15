import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, TextInput, Share, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCoachmark } from '../components/coachmarks/CoachmarkProvider';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { CandleChart, type Indicator, type ChartMarker } from '../components/charts/CandleChart';
import { fetchOhlc, type OhlcCandle } from '../services/priceService';
import { latestRSI } from '../lib/indicators';
import { CoinGlyph } from '../components/ui/Avatar';
import { ConfettiBurst } from '../components/ui/ConfettiBurst';
import { ShakeText } from '../components/ui/ShakeText';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { realizedPnl as calcRealizedPnl, sellXp } from '../services/gamification';
import { Star, MoreHorizontal, Shield, Check, X, ChevronDown, ChevronLeft, Bell, Share2, ExternalLink } from 'lucide-react-native';
import { NumPad } from '../components/ui/NumPad';

// A buy of this size or larger gets a confetti celebration (a notable position).
const BIG_BUY_USD = 1000;

const QUICK_AMOUNTS = [50, 100, 250, 500];

function OrderModal({ visible, side, symbol, onClose, onConfirm }: {
  visible: boolean; side: 'buy' | 'sell'; symbol: string;
  onClose: () => void; onConfirm: (amount: number, limitPrice?: number) => void;
}) {
  const { colors } = useTheme();
  const { state, getCoin, getHolding } = useApp();
  const [amount, setAmount] = useState('100');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPriceStr, setLimitPriceStr] = useState('');
  const coin = getCoin(symbol);
  if (!coin) return null;

  const parsedAmount = parseFloat(amount) || 0;
  const limitPrice = parseFloat(limitPriceStr) || 0;
  const effectivePrice = orderType === 'limit' && limitPrice > 0 ? limitPrice : coin.price;
  const units = parsedAmount / effectivePrice;
  const holding = getHolding(symbol);
  const maxSell = holding ? holding.value : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
            {side === 'buy' ? 'Buy' : 'Sell'} {symbol}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Order type toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 }}>
            {(['market', 'limit'] as const).map(t => (
              <TouchableOpacity
                key={t}
                testID={`trade-${t}-toggle`}
                style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8, backgroundColor: orderType === t ? colors.surface : 'transparent' }}
                onPress={() => setOrderType(t)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: orderType === t ? colors.ink : colors.ink3, textTransform: 'capitalize' }}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Limit price input */}
          {orderType === 'limit' && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Limit price (USD)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 15, color: colors.ink3 }}>$</Text>
                <TextInput
                  value={limitPriceStr}
                  onChangeText={setLimitPriceStr}
                  placeholder={coin.price.toFixed(2)}
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, fontSize: 15, color: colors.ink, marginLeft: 4 }}
                />
              </View>
              <Text style={{ fontSize: 11, color: colors.ink3 }}>
                {side === 'buy' ? 'Order fills when price drops to this level' : 'Order fills when price rises to this level'}
              </Text>
            </View>
          )}

          {/* Amount display */}
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 44, fontWeight: '700', color: amount ? colors.ink : colors.ink3, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>
              ${amount || '0'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>
              ≈ {units.toFixed(6)} {symbol}
            </Text>
            {/* Quick amounts */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {QUICK_AMOUNTS.map(a => (
                <TouchableOpacity key={a} onPress={() => setAmount(String(a))}>
                  <Chip variant={parsedAmount === a ? 'brand' : 'outline'}>${a}</Chip>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setAmount((side === 'sell' ? maxSell : state.cash).toFixed(2))}>
                <Chip variant="outline">Max</Chip>
              </TouchableOpacity>
            </View>
          </View>

          {/* Numeric keypad */}
          <NumPad
            value={amount}
            onChange={setAmount}
            maxValue={side === 'sell' ? maxSell : state.cash}
          />

          <Card variant="compact" style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>Price</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                ${coin.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>Slippage (max)</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>0.10%</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>Fee</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.up }}>Free</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink3 }}>{side === 'sell' ? 'Position value' : 'Available cash'}</Text>
              <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                ${(side === 'sell' ? maxSell : state.cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </Card>

          {side === 'buy' && parsedAmount > 0 && (
            <Card variant="tinted" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Shield color={colors.warn} size={16} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 12, color: colors.ink }}>
                  Risk impact: {state.riskScore} → {Math.min(100, state.riskScore + Math.round(parsedAmount / 200))}
                </Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                  ${parsedAmount.toFixed(0)} of your bankroll in {symbol}
                </Text>
              </View>
            </Card>
          )}

          <Button
            testID="trade-place-order-btn"
            variant={side === 'buy' ? 'up' : 'down'}
            onPress={() => onConfirm(parsedAmount, orderType === 'limit' && limitPrice > 0 ? limitPrice : undefined)}
            style={{ width: '100%' }}
            disabled={
              parsedAmount <= 0 ||
              // USDC is cash, not a buyable asset — buying it would strand the
              // balance in an un-spendable holding.
              (side === 'buy' && symbol === 'USDC') ||
              (side === 'buy' && parsedAmount > state.cash) ||
              (side === 'sell' && parsedAmount > maxSell) ||
              (orderType === 'limit' && limitPrice <= 0)
            }
          >
            {orderType === 'limit' ? 'Place limit order' : (side === 'buy' ? 'Confirm buy' : 'Confirm sell')} · ${parsedAmount.toFixed(2)}
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PriceAlertSheet({ visible, symbol, currentPrice, onClose }: {
  visible: boolean; symbol: string; currentPrice: number; onClose: () => void;
}) {
  const { colors } = useTheme();
  const { dispatch } = useApp();
  const [targetStr, setTargetStr] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');

  const targetPrice = parseFloat(targetStr) || 0;

  const handleSet = () => {
    if (targetPrice <= 0) return;
    dispatch({ type: 'ADD_PRICE_ALERT', symbol, targetPrice, direction });
    setTargetStr('');
    onClose();
    Alert.alert('Alert set', `You'll be notified when ${symbol} goes ${direction} $${targetPrice.toLocaleString()}.`);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Price alert</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              Current: ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: currentPrice < 0.01 ? 8 : 2 })}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* Direction toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 }}>
            {(['above', 'below'] as const).map(d => (
              <TouchableOpacity
                key={d}
                style={{
                  flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8,
                  backgroundColor: direction === d ? colors.surface : 'transparent',
                }}
                onPress={() => setDirection(d)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: direction === d ? colors.ink : colors.ink3, textTransform: 'capitalize' }}>
                  {d === 'above' ? '↑ Above' : '↓ Below'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target price input */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Target price (USD)
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontSize: 16, color: colors.ink3 }}>$</Text>
              <TextInput
                value={targetStr}
                onChangeText={setTargetStr}
                placeholder={currentPrice.toFixed(currentPrice < 0.01 ? 6 : 2)}
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.ink, marginLeft: 4 }}
                autoFocus
              />
            </View>
          </View>

          <Button
            variant="brand"
            onPress={handleSet}
            disabled={targetPrice <= 0}
          >
            Set alert for {symbol}
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// Add a per-coin auto-trigger: a SELL stop-loss (sell the whole position when
// price falls a chosen % below entry) or a BUY stop (buy $X when price falls to
// a target). One of each per coin; both auto-execute on the price tick.
function TriggerSheet({ visible, symbol, currentPrice, avgCost, units, onClose }: {
  visible: boolean; symbol: string; currentPrice: number; avgCost: number; units: number; onClose: () => void;
}) {
  const { colors } = useTheme();
  const { dispatch } = useApp();
  const holds = units > 0;
  const [side, setSide] = useState<'sell' | 'buy'>(holds ? 'sell' : 'buy');
  const [pct, setPct] = useState(10);
  const [buyPriceStr, setBuyPriceStr] = useState('');
  const [buyAmtStr, setBuyAmtStr] = useState('100');

  // Reset to a sensible default each open (sell if they hold it, else buy).
  useEffect(() => { if (visible) setSide(holds ? 'sell' : 'buy'); }, [visible, holds]);

  const sellPrice = avgCost * (1 - pct / 100);
  const buyPrice = parseFloat(buyPriceStr) || 0;
  const buyAmt = parseFloat(buyAmtStr) || 0;

  const handleSet = () => {
    if (side === 'sell') {
      if (!holds) return;
      dispatch({ type: 'SET_STOP_LOSS', symbol, pct });
      onClose();
      Alert.alert('Stop-loss set', `${symbol} will auto-sell if it falls ${pct}% (≈$${sellPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}).`);
    } else {
      if (!(buyPrice > 0) || !(buyAmt > 0)) return;
      dispatch({ type: 'SET_BUY_STOP', symbol, price: buyPrice, amount: buyAmt });
      onClose();
      Alert.alert('Buy trigger set', `Will buy $${buyAmt.toLocaleString()} of ${symbol} when it falls to $${buyPrice.toLocaleString()}.`);
    }
  };

  const inputBox = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 };
  const canSet = side === 'sell' ? holds : (buyPrice > 0 && buyAmt > 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Add a trigger</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
              {symbol} · ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: currentPrice < 0.01 ? 8 : 2 })}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* Side toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 10, padding: 3 }}>
            {(['sell', 'buy'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, backgroundColor: side === s ? colors.surface : 'transparent' }}
                onPress={() => setSide(s)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: side === s ? (s === 'sell' ? colors.down : colors.up) : colors.ink3 }}>
                  {s === 'sell' ? '↓ Stop-loss (sell)' : '↓ Buy the dip'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {side === 'sell' ? (
            !holds ? (
              <Text style={{ fontSize: 13, color: colors.ink3, lineHeight: 19 }}>
                You don't hold {symbol}. Buy some first — a stop-loss sells a position you already own.
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Sell if it drops</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[5, 10, 15, 20].map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPct(p)}
                      style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, backgroundColor: pct === p ? colors.down : colors.surface2, borderColor: pct === p ? colors.down : colors.hairline }}
                    >
                      <Text style={{ fontWeight: '700', fontSize: 14, color: pct === p ? '#FFFFFF' : colors.ink }}>{p}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>
                  Sells all {units < 1 ? units.toFixed(4) : units.toFixed(2)} {symbol} at ≈${sellPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} (entry ${avgCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}).
                </Text>
              </>
            )
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Buy when price falls to</Text>
                <View style={inputBox}>
                  <Text style={{ fontSize: 16, color: colors.ink3 }}>$</Text>
                  <TextInput value={buyPriceStr} onChangeText={setBuyPriceStr} placeholder={currentPrice.toFixed(currentPrice < 0.01 ? 6 : 2)} placeholderTextColor={colors.ink3} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.ink, marginLeft: 4 }} />
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Amount to buy (USD)</Text>
                <View style={inputBox}>
                  <Text style={{ fontSize: 16, color: colors.ink3 }}>$</Text>
                  <TextInput value={buyAmtStr} onChangeText={setBuyAmtStr} placeholder="100" placeholderTextColor={colors.ink3} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.ink, marginLeft: 4 }} />
                </View>
              </View>
            </>
          )}

          <Button variant={side === 'sell' ? 'down' : 'up'} onPress={handleSet} disabled={!canSet}>
            {side === 'sell' ? `Set ${pct}% stop-loss` : 'Set buy trigger'}
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function MoreSheet({ visible, symbol, currentPrice, onClose, onSetAlert }: {
  visible: boolean; symbol: string; currentPrice: number; onClose: () => void; onSetAlert: () => void;
}) {
  const { colors } = useTheme();

  const options: { Icon: any; label: string; sub: string; onPress: () => void; color?: string }[] = [
    {
      Icon: Bell,
      label: 'Set price alert',
      sub: `Notify me when ${symbol} hits a target`,
      onPress: () => { onClose(); onSetAlert(); },
    },
    {
      Icon: Share2,
      label: 'Share',
      sub: `Share ${symbol} trade idea`,
      onPress: async () => {
        onClose();
        try {
          await Share.share({
            message: `${symbol} at $${currentPrice.toLocaleString('en-US', { maximumFractionDigits: currentPrice < 0.01 ? 8 : 2 })} — watching this one on CryptoComp`,
          });
        } catch {
          // User cancelled — silent
        }
      },
    },
    {
      Icon: ExternalLink,
      label: 'View on CoinGecko',
      sub: `Open ${symbol} market page`,
      onPress: async () => {
        onClose();
        const slugs: Record<string, string> = {
          BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
          DOGE: 'dogecoin', USDC: 'usd-coin', PEPE: 'pepe',
        };
        const slug = slugs[symbol] ?? symbol.toLowerCase();
        const url = `https://www.coingecko.com/en/coins/${slug}`;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) await Linking.openURL(url);
        else Alert.alert('Cannot open link', url);
      },
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{symbol}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {options.map(opt => (
            <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.75}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface2, borderRadius: 14, padding: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <opt.Icon color={opt.color ?? colors.ink} size={20} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{opt.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{opt.sub}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function TradeScreen() {
  const { colors } = useTheme();
  const { state, getCoin, dispatch } = useApp();
  const buyCoachRef = useCoachmark(
    'tr-buy',
    'Tap Buy to place a trade. You spend dollars and get crypto at the live price — sell anytime to return it to cash. It\'s all simulated.',
    'Make a trade',
  );
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [tf, setTf] = useState('24H');
  const [modalSide, setModalSide] = useState<'buy' | 'sell' | null>(null);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTrade, setLastTrade] = useState<{ side: string; amount: number; units: number; xp: number; realizedPnl?: number; costBasis?: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [fetchedCandles, setFetchedCandles] = useState<OhlcCandle[]>([]);

  const toggleIndicator = (ind: Indicator) => {
    setActiveIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]);
  };

  const symbol = state.tradeSymbol;
  const watchlisted = state.watchlist.includes(symbol);
  const coin = getCoin(symbol);

  // Drop the previous coin's fetched bars the instant we switch coins so the
  // chart never renders one coin's history under another's price axis.
  useEffect(() => { setFetchedCandles([]); }, [symbol]);

  // The 24H chart reuses the live in-state 24h series (state.coins[].history),
  // which the price poll keeps fresh every 10s — so opening a coin needs NO
  // network call and the chart ticks live. Only the other timeframes fetch
  // real OHLC from CoinGecko (cached 60s, rate-limited internally).
  useEffect(() => {
    if (tf === '24H') return;
    let cancelled = false;
    fetchOhlc(symbol, tf).then(candles => {
      if (!cancelled) setFetchedCandles(candles);
    });
    return () => { cancelled = true; };
  }, [symbol, tf]);

  // Chart data: 24H from the in-state rolling series (live, no fetch), other
  // timeframes from the fetched OHLC. CandleChart draws a line through closes,
  // so flat OHLC synthesized from the price series renders the same line.
  const { chartCandles, chartTimestamps } = useMemo(() => {
    if (tf === '24H') {
      // Real 24h series + the live price as the right-edge tip, so the chart
      // moves with every price update (same data the Markets sparkline uses).
      const base = coin?.history ?? [];
      const h = base.length ? [...base, coin!.price] : [];
      if (h.length < 2) return { chartCandles: undefined, chartTimestamps: undefined };
      // The series is ~hourly closes ending at "now"; synthesize per-point
      // timestamps so trade markers land at the right place on the X axis.
      const now = Date.now();
      const hourMs = 60 * 60 * 1000;
      const candles = h.map((p, i) => {
        const o = i > 0 ? h[i - 1] : p;
        return { open: o, high: Math.max(o, p), low: Math.min(o, p), close: p };
      });
      const ts = h.map((_, i) => now - (h.length - 1 - i) * hourMs);
      return { chartCandles: candles, chartTimestamps: ts };
    }
    if (fetchedCandles.length > 0) {
      return {
        chartCandles: fetchedCandles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close })),
        chartTimestamps: fetchedCandles.map(c => c.timestamp),
      };
    }
    return { chartCandles: undefined, chartTimestamps: undefined };
  }, [tf, coin?.history, coin?.price, fetchedCandles]);

  // Your buy/sell trades for this coin, pinned on the chart as up/down triangles.
  // Reward grants (kind === 'reward') aren't trades, so they're excluded.
  const chartMarkers = useMemo<ChartMarker[]>(() =>
    state.trades
      .filter(t => t.symbol === symbol && t.kind !== 'reward')
      .map(t => ({ timestamp: t.timestamp, side: t.side, price: t.price, units: t.units, amount: t.amount, symbol: t.symbol })),
    [state.trades, symbol],
  );

  // The Trade screen stays mounted as a tab, so the post-trade confirmation
  // (showSuccess) would otherwise still be up when you navigate away and return
  // to the same coin. Clear it whenever the screen loses focus.
  useFocusEffect(
    React.useCallback(() => {
      return () => { setShowSuccess(false); setLastTrade(null); };
    }, []),
  );

  if (!coin) return null;

  const price = coin.price;
  const change24h = coin.change24h;
  const isUp = change24h >= 0;
  // Absolute 24h move in dollars (prev = price / (1 + pct/100)), compactly
  // formatted; the sign/color is applied where it's rendered.
  const abs24hChange = Math.abs(price - price / (1 + change24h / 100));
  const change24hStr =
    abs24hChange >= 1000 ? abs24hChange.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs24hChange >= 1   ? abs24hChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs24hChange >= 0.01 ? abs24hChange.toFixed(2)
    : abs24hChange.toFixed(6);

  const handleConfirm = (amount: number, limitPrice?: number) => {
    if (!modalSide) return;
    if (limitPrice && limitPrice > 0) {
      dispatch({ type: 'PLACE_LIMIT_ORDER', symbol, side: modalSide, amount, limitPrice });
      setModalSide(null);
      Alert.alert(
        'Limit order placed',
        `${modalSide === 'buy' ? 'Buy' : 'Sell'} $${amount.toFixed(2)} of ${symbol} when price ${modalSide === 'buy' ? 'drops to' : 'rises to'} $${limitPrice.toLocaleString()}.`,
        [{ text: 'OK' }],
      );
      return;
    }
    const units = amount / price;
    if (modalSide === 'buy') {
      dispatch({ type: 'BUY', symbol, amount });
      setLastTrade({ side: 'buy', amount, units, xp: 25 });
      if (amount >= BIG_BUY_USD) setConfetti(c => c + 1);
    } else {
      // Mirror the reducer so the success screen shows the exact realized P&L /
      // XP it just recorded (units capped at the held amount).
      const holding = state.holdings.find(h => h.symbol === symbol);
      const unitsToSell = holding ? Math.min(amount / price, holding.units) : units;
      const pnl = holding ? calcRealizedPnl(holding.avgCost, unitsToSell, price) : 0;
      const costBasis = holding ? unitsToSell * holding.avgCost : 0;
      const xp = sellXp(pnl, unitsToSell * price);
      dispatch({ type: 'SELL', symbol, amount });
      setLastTrade({ side: 'sell', amount, units: unitsToSell, xp, realizedPnl: pnl, costBasis });
      if (pnl > 0) setConfetti(c => c + 1);
    }
    setModalSide(null);
    setShowSuccess(true);
  };

  if (showSuccess && lastTrade) {
    const hasStop = !!state.stopLosses[symbol];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ConfettiBurst trigger={confetti} />
        {/* Back button → portfolio page */}
        <TouchableOpacity
          testID="order-filled-back-btn"
          onPress={() => { setShowSuccess(false); nav.navigate('MainTabs', { screen: 'Home' }); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 10 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft color={colors.ink} size={24} strokeWidth={2} />
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Portfolio</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 14 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.upSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Check color={colors.up} size={44} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.up, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order filled</Text>
            <Text style={{ fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.65, textAlign: 'center' }}>
              {lastTrade.side === 'buy' ? 'Bought' : 'Sold'} {lastTrade.units.toFixed(5)} {symbol}
            </Text>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>at ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · just now</Text>
            {typeof lastTrade.realizedPnl === 'number' && (
              <Text style={{ fontSize: 16, fontWeight: '700', color: lastTrade.realizedPnl >= 0 ? colors.up : colors.down }}>
                {lastTrade.realizedPnl >= 0 ? 'Realized +$' : 'Realized −$'}
                {Math.abs(lastTrade.realizedPnl).toFixed(2)}
                {lastTrade.costBasis && lastTrade.costBasis > 0
                  ? ` (${lastTrade.realizedPnl >= 0 ? '▲' : '▼'}${Math.abs((lastTrade.realizedPnl / lastTrade.costBasis) * 100).toFixed(1)}%)`
                  : ''}
              </Text>
            )}
            <Chip variant="up">+{lastTrade.xp} XP</Chip>
          </View>

          {/* Trailing stop CTA — only shown after a buy without an existing stop */}
          {lastTrade.side === 'buy' && !hasStop && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => dispatch({ type: 'SET_STOP_LOSS', symbol, pct: 5 })}
            >
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: colors.warnSoft, borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: `${colors.warn}40`,
              }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Shield color={colors.warn} size={20} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>Set a 5% stop-loss?</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                    Auto-sell {symbol} if it drops 5% from here
                  </Text>
                </View>
                <Text style={{ fontSize: 20, color: colors.ink3 }}>→</Text>
              </View>
            </TouchableOpacity>
          )}
          {lastTrade.side === 'buy' && hasStop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.upSoft, borderRadius: 12, padding: 12 }}>
              <Shield color={colors.up} size={16} strokeWidth={1.75} />
              <Text style={{ fontSize: 13, color: colors.up, fontWeight: '600' }}>
                {state.stopLosses[symbol]}% stop-loss active
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" style={{ flex: 1 }} onPress={() => setShowSuccess(false)}>Trade more</Button>
            <Button variant="brand" style={{ flex: 1 }} onPress={() => { setShowSuccess(false); nav.navigate('MainTabs', { screen: 'Home' }); }}>View portfolio</Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <ScreenShell
        eyebrow="Trade"
        title={coin.name}
        scrollable={false}
        style={{ flex: 1 }}
        rightActions={
          <>
            <TouchableOpacity testID="trade-watchlist-star" style={{ padding: 8 }} onPress={() => dispatch({ type: 'TOGGLE_WATCHLIST', symbol })}>
              <Star
                color={watchlisted ? colors.warn : colors.ink}
                size={20}
                strokeWidth={1.75}
                fill={watchlisted ? colors.warn : 'none'}
              />
            </TouchableOpacity>
            <TouchableOpacity testID="trade-more-btn" style={{ padding: 8 }} onPress={() => setMoreOpen(true)}>
              <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
            </TouchableOpacity>
          </>
        }
      >
        <View style={{ flex: 1, gap: 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 8 }}>
          {/* Coin selector. flexGrow:0 stops the horizontal ScrollView from
              stretching to fill the flex:1 column (which left a big gap between
              the chips and the price); it now hugs the chips' height. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
              {state.coins.filter(c => c.symbol !== 'USDC').map(c => (
                <TouchableOpacity
                  key={c.symbol}
                  onPress={() => dispatch({ type: 'SET_TRADE_SYMBOL', symbol: c.symbol })}
                >
                  <Chip
                    variant={c.symbol === symbol ? 'brand' : 'outline'}
                    style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
                  >
                    {c.symbol}
                  </Chip>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Price (below the coin selectors) — jitters on each price update */}
          <View>
            <ShakeText style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.7 }}>
              ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price < 0.01 ? 8 : 2 })}
            </ShakeText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Chip variant={isUp ? 'up' : 'down'}>
                {isUp ? '↑' : '↓'} {isUp ? '+' : '−'}${change24hStr} · {isUp ? '+' : ''}{change24h.toFixed(2)}%
              </Chip>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>24h</Text>
            </View>
          </View>

          <View style={{ marginHorizontal: -20 }}>
            <CandleChart
              height={220}
              data={chartCandles}
              timestamps={chartTimestamps}
              markers={chartMarkers}
              axes
              timeframe={tf}
              basePrice={price}
              indicators={activeIndicators}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Segmented options={['24H', '7D', '30D', '90D', '1Y', 'MAX']} value={tf} onChange={setTf} />
            <Button
              variant={indicatorsOpen ? 'brand' : 'ghost'}
              size="sm"
              onPress={() => setIndicatorsOpen(o => !o)}
            >
              Indicators{activeIndicators.length > 0 ? ` · ${activeIndicators.length}` : ''}
            </Button>
          </View>

          {indicatorsOpen && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['MA20', 'MA50', 'RSI'] as Indicator[]).map(ind => {
                const active = activeIndicators.includes(ind);
                const indColors: Record<Indicator, string> = { MA20: '#F59E0B', MA50: '#6366F1', RSI: colors.ink2 ?? colors.ink3 };
                return (
                  <TouchableOpacity key={ind} onPress={() => toggleIndicator(ind)}>
                    <Chip
                      variant={active ? 'brand' : 'outline'}
                      style={active ? { borderWidth: 2, borderColor: indColors[ind] } : undefined}
                    >
                      {ind}
                    </Chip>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Stats grid — all values now derived from real CoinGecko data */}
          {(() => {
            const fmt = (n: number) => `$${n.toLocaleString('en-US', {
              minimumFractionDigits: n < 0.01 ? 6 : 2,
              maximumFractionDigits: n < 0.01 ? 8 : 2,
            })}`;
            const rsi = latestRSI(coin.history, 14);
            const ownHolding = state.holdings.find(x => x.symbol === symbol);
            const ownPnl    = ownHolding ? ownHolding.units * price - ownHolding.units * ownHolding.avgCost : 0;
            const ownValue  = ownHolding ? ownHolding.units * price : 0;

            // Concentration if user adds another $1,000 of this coin (the risk card below).
            const hypotheticalHoldingValue = ownValue + 1000;
            const hypotheticalBankroll = state.bankroll + 0; // bankroll already includes ownValue
            const concentrationPct = hypotheticalBankroll > 0 ? (hypotheticalHoldingValue / hypotheticalBankroll) * 100 : 0;

            const stats = [
              ['24h High',  coin.high24h ? fmt(coin.high24h) : '—'],
              ['24h Low',   coin.low24h  ? fmt(coin.low24h)  : '—'],
              ['Volume',    coin.volume],
              ['Mkt Cap',   coin.marketCap],
              ['RSI 14',    rsi !== null ? rsi.toFixed(1) : '—'],
              ['Your pos.', ownHolding ? `${ownPnl >= 0 ? '+' : ''}$${Math.abs(ownPnl).toFixed(0)}` : '—'],
            ];

            return (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, backgroundColor: colors.surface2, borderRadius: 12, padding: 14 }}>
                  {stats.map(([label, value]) => (
                    <View key={label} style={{ width: '30%' }}>
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
                      <Text style={{
                        fontWeight: '600',
                        color: label === 'Your pos.'
                          ? (ownPnl >= 0 ? colors.up : colors.down)
                          : colors.ink,
                        fontVariant: ['tabular-nums'],
                      }}>
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Available cash for the active portfolio (main or a contest). */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, color: colors.ink3 }}>Available cash to trade</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    ${state.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Shield color={colors.warn} size={16} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', fontSize: 12, color: colors.ink }}>
                      A $1,000 buy raises your risk score {state.riskScore} → {Math.max(0, state.riskScore - 5)}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                      {symbol} would be {concentrationPct.toFixed(0)}% of portfolio
                    </Text>
                  </View>
                </Card>
              </>
            );
          })()}

          {/* Active triggers — every stop-loss + buy-stop across coins, plus an
              "add" for the current coin. Auto-execute on the price tick. */}
          {(() => {
            const sells = Object.entries(state.stopLosses).map(([sym, pct]) => {
              const h = state.holdings.find(x => x.symbol === sym);
              const c = getCoin(sym);
              const triggerPrice = h ? h.avgCost * (1 - pct / 100) : null;
              return { sym, pct, triggerPrice, livePrice: c?.price };
            });
            const buys = Object.entries(state.buyStops).map(([sym, bs]) => ({ sym, ...bs }));
            const hasAny = sells.length > 0 || buys.length > 0;
            return (
              <Card variant="noPad" style={{ marginTop: 4 }}>
                <CardSection last={!hasAny}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Shield color={colors.ink} size={16} strokeWidth={1.9} />
                      <Text style={{ fontWeight: '700', fontSize: 14, color: colors.ink }}>Auto triggers</Text>
                    </View>
                    <Button testID="trade-add-trigger-btn" variant="surface" size="sm" onPress={() => setTriggerOpen(true)}>+ Add</Button>
                  </View>
                </CardSection>
                {sells.map((s, i) => (
                  <CardSection key={`sl-${s.sym}`} last={i === sells.length - 1 && buys.length === 0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Chip variant="down">SELL</Chip>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{s.sym} stop-loss · −{s.pct}%</Text>
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>
                          Sells all at ≈${(s.triggerPrice ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          {s.livePrice ? ` · now $${s.livePrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => dispatch({ type: 'SET_STOP_LOSS', symbol: s.sym, pct: 0 })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X color={colors.ink3} size={18} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </CardSection>
                ))}
                {buys.map((b, i) => (
                  <CardSection key={`bs-${b.sym}`} last={i === buys.length - 1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Chip variant="up">BUY</Chip>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600', fontSize: 13, color: colors.ink }}>{b.sym} buy · ${b.amount.toLocaleString()}</Text>
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>When price falls to ${b.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                      </View>
                      <TouchableOpacity onPress={() => dispatch({ type: 'CLEAR_BUY_STOP', symbol: b.sym })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X color={colors.ink3} size={18} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </CardSection>
                ))}
                {!hasAny && (
                  <CardSection last>
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>No active triggers. Add a stop-loss or a buy-the-dip order.</Text>
                  </CardSection>
                )}
              </Card>
            );
          })()}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
            <Button testID="trade-sell-btn" variant="down" style={{ flex: 1 }} onPress={() => setModalSide('sell')}>Sell</Button>
            <View ref={buyCoachRef} style={{ flex: 1 }} collapsable={false}>
              <Button testID="trade-buy-btn" variant="up" style={{ flex: 1 }} onPress={() => setModalSide('buy')}>Buy</Button>
            </View>
          </View>
        </View>
      </ScreenShell>

      <OrderModal
        visible={modalSide !== null}
        side={modalSide ?? 'buy'}
        symbol={symbol}
        onClose={() => setModalSide(null)}
        onConfirm={handleConfirm}
      />
      <MoreSheet
        visible={moreOpen}
        symbol={symbol}
        currentPrice={price}
        onClose={() => setMoreOpen(false)}
        onSetAlert={() => setAlertOpen(true)}
      />
      <PriceAlertSheet
        visible={alertOpen}
        symbol={symbol}
        currentPrice={price}
        onClose={() => setAlertOpen(false)}
      />
      <TriggerSheet
        visible={triggerOpen}
        symbol={symbol}
        currentPrice={price}
        avgCost={state.holdings.find(h => h.symbol === symbol)?.avgCost ?? price}
        units={state.holdings.find(h => h.symbol === symbol)?.units ?? 0}
        onClose={() => setTriggerOpen(false)}
      />
    </>
  );
}
