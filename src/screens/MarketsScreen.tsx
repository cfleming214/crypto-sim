import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { CoinGlyph } from '../components/ui/Avatar';
import { Sparkline } from '../components/charts/Sparkline';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { formatLargeNumber } from '../services/priceService';
import { useNavigation } from '@react-navigation/native';
import { Search, Star, SlidersHorizontal, X, Info } from 'lucide-react-native';

// Absolute 24h price move in dollars, derived from the current price and the
// 24h % change (prev = price / (1 + pct/100)). Returned unsigned and compactly
// formatted; the caller supplies the +/− sign and color.
function fmtMoneyDelta(price: number, changePct: number): string {
  const prev = price / (1 + changePct / 100);
  const d = Math.abs(price - prev);
  if (d >= 1000) return d.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (d >= 1) return d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Sub-$1 move: scale decimals to the coin's PRICE, not the move size, so a ~$1
  // stablecoin like USDC shows cents (e.g. "0.00") instead of a string of zeros,
  // while genuinely sub-dollar coins still show meaningful precision.
  if (price >= 1) return d.toFixed(2);
  if (d >= 0.01) return d.toFixed(4);
  return (d.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')) || '0';
}

type ChangeFilter = 'all' | 'gainers' | 'losers';
type McapFilter = 'all' | 'large' | 'mid' | 'small';

interface Filters {
  change: ChangeFilter;
  mcap: McapFilter;
}

function FilterSheet({ visible, filters, onApply, onClose }: {
  visible: boolean;
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [local, setLocal] = useState<Filters>(filters);

  const handleApply = () => { onApply(local); onClose(); };
  const handleReset = () => { const f: Filters = { change: 'all', mcap: 'all' }; setLocal(f); onApply(f); onClose(); };

  const activeCount = (local.change !== 'all' ? 1 : 0) + (local.mcap !== 'all' ? 1 : 0);

  const changeOptions: { label: string; value: ChangeFilter }[] = [
    { label: 'All', value: 'all' }, { label: 'Gainers', value: 'gainers' }, { label: 'Losers', value: 'losers' },
  ];
  const mcapOptions: { label: string; value: McapFilter }[] = [
    { label: 'All', value: 'all' }, { label: 'Large cap (>$100B)', value: 'large' },
    { label: 'Mid cap ($1B–$100B)', value: 'mid' }, { label: 'Small cap (<$1B)', value: 'small' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
            Filter{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <X color={colors.ink} size={22} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 24, paddingBottom: 40 }}>
          {/* 24h change */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>24h change</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {changeOptions.map(o => (
                <TouchableOpacity key={o.value} style={{ flex: 1 }} onPress={() => setLocal(l => ({ ...l, change: o.value }))}>
                  <View style={{
                    paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: local.change === o.value ? colors.brand : colors.surface2,
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: local.change === o.value ? colors.brandOn : colors.ink2 }}>
                      {o.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Market cap tier */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Market cap</Text>
            <View style={{ gap: 8 }}>
              {mcapOptions.map(o => (
                <TouchableOpacity key={o.value} onPress={() => setLocal(l => ({ ...l, mcap: o.value }))}>
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
                    backgroundColor: local.mcap === o.value ? colors.surface2 : 'transparent',
                    borderWidth: 1,
                    borderColor: local.mcap === o.value ? colors.brand : colors.hairline,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.ink }}>{o.label}</Text>
                    {local.mcap === o.value && (
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '700' }}>✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={handleReset}>Reset</Button>
          <Button variant="brand" style={{ flex: 1 }} onPress={handleApply}>Apply filters</Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const BASE_CATEGORIES = ['All', 'Top 10', 'DeFi', 'Layer 1', 'Meme', 'Stables'];

const categorySymbols: Record<string, string[]> = {
  'Top 10':  ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'],
  'Meme':    ['DOGE'],
  'Layer 1': ['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'DOT'],
  'DeFi':    ['LINK'],
  'Stables': ['USDC'],
};

const sortOrders = ['Market cap ↓', 'Price ↓', 'Change ↓'];

function parseMcap(raw: string): number {
  const m = raw.replace('$', '').trim();
  if (m.endsWith('T')) return parseFloat(m) * 1e12;
  if (m.endsWith('B')) return parseFloat(m) * 1e9;
  if (m.endsWith('M')) return parseFloat(m) * 1e6;
  return parseFloat(m) || 0;
}

export function MarketsScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [cat, setCat] = useState('All');
  const [sortIdx, setSortIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ change: 'all', mcap: 'all' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [fgInfoOpen, setFgInfoOpen] = useState(false);

  const activeFilterCount = (filters.change !== 'all' ? 1 : 0) + (filters.mcap !== 'all' ? 1 : 0);

  const allCoins = state.coins;
  const categories = ['Watchlist', ...BASE_CATEGORIES];

  const byCategory = (() => {
    if (cat === 'Watchlist') return allCoins.filter(c => state.watchlist.includes(c.symbol));
    if (cat === 'All' || cat === 'Top 10') return allCoins;
    return allCoins.filter(c => (categorySymbols[cat] ?? []).includes(c.symbol));
  })();

  const byQuery = query.trim()
    ? byCategory.filter(c =>
        c.symbol.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase()),
      )
    : byCategory;

  const filtered = byQuery.filter(c => {
    if (filters.change === 'gainers' && c.change24h < 0) return false;
    if (filters.change === 'losers'  && c.change24h > 0) return false;
    if (filters.mcap !== 'all') {
      const mc = parseMcap(c.marketCap);
      if (filters.mcap === 'large' && mc <  1e11) return false;
      if (filters.mcap === 'mid'   && (mc < 1e9 || mc >= 1e11)) return false;
      if (filters.mcap === 'small' && mc >= 1e9)  return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortIdx === 1) return b.price - a.price;
    if (sortIdx === 2) return Math.abs(b.change24h) - Math.abs(a.change24h);
    return 0;
  });

  const movers = [...allCoins].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 5);

  const handleCoinTap = (symbol: string) => {
    dispatch({ type: 'SET_TRADE_SYMBOL', symbol });
    nav.navigate('Trade');
  };

  return (
    <ScreenShell
      eyebrow="Markets"
      title="Crypto"
      rightActions={
        <TouchableOpacity testID="markets-filter-btn" style={{ padding: 8, position: 'relative' }} onPress={() => setFilterOpen(true)}>
          <SlidersHorizontal color={activeFilterCount > 0 ? colors.brand : colors.ink} size={20} strokeWidth={1.75} />
          {activeFilterCount > 0 && (
            <View style={{
              position: 'absolute', top: 4, right: 4,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: colors.brand,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: colors.brandOn, fontSize: 9, fontWeight: '700' }}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      }
    >
      {/* Stats strip — real CoinGecko /global + alternative.me Fear & Greed */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: colors.hairline }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Total mkt cap</Text>
          <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 }}>
            {state.globalStats ? formatLargeNumber(state.globalStats.totalMarketCap) : '—'}
          </Text>
          {state.globalStats && (() => {
            const { totalMarketCap: mc, change24h: pct } = state.globalStats;
            const delta = mc - mc / (1 + pct / 100);   // 24h $ change
            const up = pct >= 0;
            return (
              <Text style={{ fontSize: 11, color: up ? colors.up : colors.down, fontVariant: ['tabular-nums'], marginTop: 1 }}>
                {up ? '+' : '−'}{formatLargeNumber(Math.abs(delta))} · {up ? '+' : ''}{pct.toFixed(1)}%
              </Text>
            );
          })()}
        </View>
        <TouchableOpacity style={{ flex: 1, padding: 12 }} activeOpacity={0.7} onPress={() => setFgInfoOpen(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Fear & Greed</Text>
            <Info size={11} color={colors.ink3} strokeWidth={2} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}>
              {state.fearGreed ? String(state.fearGreed.value) : '—'}
            </Text>
            {state.fearGreed && (() => {
              const v = state.fearGreed.value;
              const variant = v >= 70 ? 'down' : v >= 55 ? 'warn' : v >= 45 ? 'outline' : v >= 25 ? 'warn' : 'up';
              return (
                <Chip variant={variant as any} style={{ paddingVertical: 1, paddingHorizontal: 6 }}>
                  {state.fearGreed.label}
                </Chip>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Card>

      {/* Available cash to trade (active portfolio) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 12, color: colors.ink3 }}>Available cash to trade</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
          ${state.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>

      {/* Search */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      }}>
        <Search color={colors.ink3} size={16} strokeWidth={1.75} />
        <TextInput
          testID="markets-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder="Search coins…"
          placeholderTextColor={colors.ink4 ?? colors.ink3}
          style={{ flex: 1, fontSize: 14, color: colors.ink }}
        />
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
          {categories.map(c => (
            <TouchableOpacity key={c} onPress={() => { setCat(c); setQuery(''); }}>
              <Chip
                variant={cat === c ? 'brand' : 'outline'}
                style={c === 'Watchlist' ? { flexDirection: 'row', gap: 4, alignItems: 'center' } : undefined}
              >
                {c === 'Watchlist' && (
                  <Star size={11} color={cat === 'Watchlist' ? '#fff' : colors.ink3} strokeWidth={1.75} fill={cat === 'Watchlist' ? '#fff' : 'none'} />
                )}
                {c}
              </Chip>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Top movers — hidden when searching */}
      {!query && cat === 'All' && (
        <>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Top movers</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20 }}>
              {movers.map(a => (
                <TouchableOpacity key={a.symbol} onPress={() => handleCoinTap(a.symbol)} activeOpacity={0.75}>
                  <Card variant="compact" style={{ width: 150, gap: 8 }}>
                    {/* Name on top; price below it; the $ + % change sits directly underneath the price */}
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CoinGlyph symbol={a.symbol} size={24} />
                        <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                      </View>
                      <View style={{ gap: 2 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                          ${a.price < 0.01 ? a.price.toFixed(6) : a.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: a.change24h >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                          {a.change24h >= 0 ? '+' : '−'}${fmtMoneyDelta(a.price, a.change24h)} · {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                    <Sparkline data={a.history.length ? [...a.history, a.price] : undefined} seed={a.symbol} down={a.change24h < 0} width={126} height={28} />
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {/* All assets */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>
          {cat === 'All' ? 'All assets' : cat}
          {` (${sorted.length})`}
        </Text>
        <TouchableOpacity onPress={() => setSortIdx(i => (i + 1) % sortOrders.length)}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Sort: {sortOrders[sortIdx]}</Text>
        </TouchableOpacity>
      </View>

      <Card variant="noPad">
        {allCoins.length <= 1 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.ink3 }}>Loading markets…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.ink3 }}>
              {query ? `No results for "${query}"` : cat === 'Watchlist' ? 'Your watchlist is empty' : 'No coins in this category'}
            </Text>
          </View>
        ) : sorted.map((a, i) => {
          const held = state.holdings.find(h => h.symbol === a.symbol);
          const heldLine = held && held.units > 0
            ? `${held.units < 1 ? held.units.toFixed(4) : held.units.toFixed(2)} ${a.symbol} · $${(held.units * a.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '';
          return (
          <TouchableOpacity key={a.symbol} testID={`markets-coin-row-${a.symbol}`} onPress={() => handleCoinTap(a.symbol)} activeOpacity={0.75}>
            <CardSection last={i === sorted.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CoinGlyph symbol={a.symbol} />
                {/* Ticker + name on one line; holding on its own line; market cap under it */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink3, flexShrink: 1 }} numberOfLines={1}>{a.name}</Text>
                  </View>
                  {heldLine !== '' && (
                    <Text style={{ fontSize: 12, color: colors.ink2, marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{heldLine}</Text>
                  )}
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }} numberOfLines={1}>MC {a.marketCap}</Text>
                </View>
                {/* Price with the 24h change tucked directly underneath, right-aligned so long numbers can't run off the row */}
                <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                    ${a.price < 0.01 ? a.price.toFixed(8) : a.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={{ fontSize: 11, color: a.change24h >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'], marginTop: 2 }} numberOfLines={1}>
                    {a.change24h >= 0 ? '+' : '−'}${fmtMoneyDelta(a.price, a.change24h)} · {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(1)}%
                  </Text>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  <Sparkline data={a.history.length ? [...a.history, a.price] : undefined} seed={a.symbol} down={a.change24h < 0} width={44} height={22} />
                  <TouchableOpacity
                    testID={`markets-watchlist-star-${a.symbol}`}
                    onPress={() => dispatch({ type: 'TOGGLE_WATCHLIST', symbol: a.symbol })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Star
                      size={14}
                      color={state.watchlist.includes(a.symbol) ? colors.warn : colors.ink3}
                      strokeWidth={1.75}
                      fill={state.watchlist.includes(a.symbol) ? colors.warn : 'none'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </CardSection>
          </TouchableOpacity>
          );
        })}
      </Card>
      <FilterSheet
        visible={filterOpen}
        filters={filters}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />

      {/* Fear & Greed explainer */}
      <Modal visible={fgInfoOpen} transparent animationType="fade" onRequestClose={() => setFgInfoOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setFgInfoOpen(false)}
          style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>Fear &amp; Greed Index</Text>
              <TouchableOpacity onPress={() => setFgInfoOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={colors.ink3} size={20} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {state.fearGreed && (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                  {state.fearGreed.value}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink2 }}>{state.fearGreed.label}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3 }}> / 100</Text>
              </View>
            )}

            <Text style={{ fontSize: 13, color: colors.ink2, lineHeight: 19 }}>
              A single 0–100 score for the crypto market&apos;s mood. Low numbers mean investors are fearful
              (selling, prices depressed); high numbers mean they&apos;re greedy (buying, prices frothy).
            </Text>

            {/* Bands */}
            <View style={{ gap: 4 }}>
              {[
                { range: '0–24', label: 'Extreme Fear', c: colors.up },
                { range: '25–44', label: 'Fear', c: colors.warn },
                { range: '45–54', label: 'Neutral', c: colors.ink3 },
                { range: '55–74', label: 'Greed', c: colors.warn },
                { range: '75–100', label: 'Extreme Greed', c: colors.down },
              ].map(b => (
                <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.c }} />
                  <Text style={{ fontSize: 12, color: colors.ink2, width: 64, fontVariant: ['tabular-nums'] }}>{b.range}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink }}>{b.label}</Text>
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 18 }}>
              Source: alternative.me, updated daily. It blends market volatility, momentum &amp; trading volume,
              social-media sentiment, Bitcoin dominance, and search trends into one number.
            </Text>
            <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 18 }}>
              Many traders read it as a contrarian signal — &quot;extreme fear&quot; can flag a buying opportunity,
              while &quot;extreme greed&quot; can warn the market is due for a pullback. It&apos;s a sentiment gauge, not a
              guarantee.
            </Text>

            <Button variant="brand" onPress={() => setFgInfoOpen(false)}>Got it</Button>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenShell>
  );
}
