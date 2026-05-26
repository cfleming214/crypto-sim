import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { CandleChart, type Indicator } from '../components/charts/CandleChart';
import { CoinGlyph } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { Star, MoreHorizontal, Shield, Check, X, ChevronDown, Bell, Share2, ExternalLink } from 'lucide-react-native';

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

          <Card style={{ gap: 16 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {side === 'buy' ? 'You spend' : 'You sell worth'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                ${parsedAmount.toFixed(2)}
              </Text>
              <Chip variant="outline">USD</Chip>
            </View>
            <View style={{ height: 1, backgroundColor: colors.hairline }} />
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {side === 'buy' ? 'You get' : 'Returning to cash'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                {units.toFixed(6)}
              </Text>
              <Chip variant="outline">{symbol}</Chip>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {QUICK_AMOUNTS.map((a) => (
                <TouchableOpacity key={a} style={{ flex: 1 }} onPress={() => setAmount(String(a))}>
                  <Chip
                    variant={parsedAmount === a ? 'brand' : 'outline'}
                    style={{ justifyContent: 'center', width: '100%' }}
                  >${a}</Chip>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => setAmount(side === 'sell' ? maxSell.toFixed(2) : state.cash.toFixed(2))}
              >
                <Chip
                  variant={parsedAmount === (side === 'sell' ? maxSell : state.cash) ? 'brand' : 'outline'}
                  style={{ justifyContent: 'center', width: '100%' }}
                >Max</Chip>
              </TouchableOpacity>
            </View>
          </Card>

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
            variant={side === 'buy' ? 'up' : 'down'}
            onPress={() => onConfirm(parsedAmount, orderType === 'limit' && limitPrice > 0 ? limitPrice : undefined)}
            style={{ width: '100%' }}
            disabled={
              parsedAmount <= 0 ||
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
      onPress: () => { onClose(); Alert.alert('Share', 'Sharing coming soon!'); },
    },
    {
      Icon: ExternalLink,
      label: 'View on CoinGecko',
      sub: `Open ${symbol} market page`,
      onPress: () => { onClose(); Alert.alert('External link', 'Opens in browser in production.'); },
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
  const nav = useNavigation<any>();
  const [tf, setTf] = useState('5M');
  const [modalSide, setModalSide] = useState<'buy' | 'sell' | null>(null);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTrade, setLastTrade] = useState<{ side: string; amount: number; units: number } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const toggleIndicator = (ind: Indicator) => {
    setActiveIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]);
  };

  const symbol = state.tradeSymbol;
  const watchlisted = state.watchlist.includes(symbol);
  const coin = getCoin(symbol);
  if (!coin) return null;

  const price = coin.price;
  const change24h = coin.change24h;
  const isUp = change24h >= 0;

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
    dispatch({ type: modalSide === 'buy' ? 'BUY' : 'SELL', symbol, amount });
    setLastTrade({ side: modalSide, amount, units });
    setModalSide(null);
    setShowSuccess(true);
  };

  if (showSuccess && lastTrade) {
    const hasStop = !!state.stopLosses[symbol];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
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
            <Chip variant="up">+25 XP</Chip>
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
            <Button variant="brand" style={{ flex: 1 }} onPress={() => { setShowSuccess(false); nav.navigate('Home'); }}>View portfolio</Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <ScreenShell
        eyebrow="Trade"
        title={`${symbol} / USD`}
        scrollable={false}
        style={{ flex: 1 }}
        rightActions={
          <>
            <TouchableOpacity style={{ padding: 8 }} onPress={() => dispatch({ type: 'TOGGLE_WATCHLIST', symbol })}>
              <Star
                color={watchlisted ? colors.warn : colors.ink}
                size={20}
                strokeWidth={1.75}
                fill={watchlisted ? colors.warn : 'none'}
              />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 8 }} onPress={() => setMoreOpen(true)}>
              <MoreHorizontal color={colors.ink} size={20} strokeWidth={1.75} />
            </TouchableOpacity>
          </>
        }
      >
        <View style={{ flex: 1, gap: 14, paddingHorizontal: 20 }}>
          {/* Coin selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
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

          {/* Price */}
          <View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.7 }}>
              ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price < 0.01 ? 8 : 2 })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Chip variant={isUp ? 'up' : 'down'}>
                {isUp ? '↑' : '↓'} {isUp ? '+' : ''}{change24h.toFixed(2)}%
              </Chip>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>24h</Text>
            </View>
          </View>

          <View style={{ marginHorizontal: -20 }}>
            <CandleChart height={220} timeframe={tf} basePrice={price} indicators={activeIndicators} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Segmented options={['1M', '5M', '1H', '1D', '1W']} value={tf} onChange={setTf} />
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

          {/* Stats grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, backgroundColor: colors.surface2, borderRadius: 12, padding: 14 }}>
            {[
              ['24h High', `$${(price * 1.01).toFixed(price < 0.01 ? 8 : 0)}`],
              ['24h Low',  `$${(price * 0.97).toFixed(price < 0.01 ? 8 : 0)}`],
              ['Volume',   coin.volume],
              ['Mkt Cap',  coin.marketCap],
              ['RSI 14',   '64.2'],
              ['Your pos.', (() => { const h = state.holdings.find(x => x.symbol === symbol); if (!h) return '—'; const pnl = h.units * price - h.units * h.avgCost; return `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`; })()],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '30%' }}>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{label}</Text>
                <Text style={{ fontWeight: '600', color: label === 'Your pos.' ? colors.up : colors.ink, fontVariant: ['tabular-nums'] }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          <Card variant="tinted" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Shield color={colors.warn} size={16} strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 12, color: colors.ink }}>
                A $1,000 buy raises your risk score {state.riskScore} → {state.riskScore + 5}
              </Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                {symbol} would be 43% of portfolio · still within bracket limits
              </Text>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
            <Button variant="down" style={{ flex: 1 }} onPress={() => setModalSide('sell')}>Sell</Button>
            <Button variant="up" style={{ flex: 1 }} onPress={() => setModalSide('buy')}>Buy</Button>
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
    </>
  );
}
