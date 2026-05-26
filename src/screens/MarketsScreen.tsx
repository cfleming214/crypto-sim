import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { CoinGlyph } from '../components/ui/Avatar';
import { Sparkline } from '../components/charts/Sparkline';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';
import { useNavigation } from '@react-navigation/native';
import { Search, Star } from 'lucide-react-native';

const BASE_CATEGORIES = ['All', 'Top 10', 'DeFi', 'Layer 1', 'Meme', 'Stables'];

const categorySymbols: Record<string, string[]> = {
  'Meme':    ['DOGE', 'PEPE'],
  'Layer 1': ['BTC', 'ETH', 'SOL'],
  'Stables': ['USDC'],
};

const sortOrders = ['Market cap ↓', 'Price ↓', 'Change ↓'];

export function MarketsScreen() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const nav = useNavigation<any>();
  const [cat, setCat] = useState('All');
  const [sortIdx, setSortIdx] = useState(0);
  const [query, setQuery] = useState('');

  const allCoins = state.coins;
  const categories = ['Watchlist', ...BASE_CATEGORIES];

  const byCategory = (() => {
    if (cat === 'Watchlist') return allCoins.filter(c => state.watchlist.includes(c.symbol));
    if (cat === 'All' || cat === 'Top 10') return allCoins;
    return allCoins.filter(c => (categorySymbols[cat] ?? []).includes(c.symbol));
  })();

  const filtered = query.trim()
    ? byCategory.filter(c =>
        c.symbol.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase()),
      )
    : byCategory;

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
    <ScreenShell eyebrow="Markets" title="Crypto">
      {/* Stats strip */}
      <Card variant="noPad" style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: colors.hairline }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Total mkt cap</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}>$2.41T</Text>
            <Text style={{ fontSize: 11, color: colors.up, fontVariant: ['tabular-nums'] }}>+1.8%</Text>
          </View>
        </View>
        <View style={{ flex: 1, padding: 12 }}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Fear & Greed</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}>72</Text>
            <Chip variant="warn" style={{ paddingVertical: 1, paddingHorizontal: 6 }}>Greed</Chip>
          </View>
        </View>
      </Card>

      {/* Search */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      }}>
        <Search color={colors.ink3} size={16} strokeWidth={1.75} />
        <TextInput
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
                  <Card variant="compact" style={{ width: 120, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CoinGlyph symbol={a.symbol} size={24} />
                      <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                    </View>
                    <Sparkline data={a.history} down={a.change24h < 0} width={96} height={28} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: a.change24h >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                      {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(1)}%
                    </Text>
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
          {sorted.length < allCoins.length ? ` (${sorted.length})` : ''}
        </Text>
        <TouchableOpacity onPress={() => setSortIdx(i => (i + 1) % sortOrders.length)}>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>Sort: {sortOrders[sortIdx]}</Text>
        </TouchableOpacity>
      </View>

      <Card variant="noPad">
        {sorted.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: colors.ink3 }}>
              {query ? `No results for "${query}"` : cat === 'Watchlist' ? 'Your watchlist is empty' : 'No coins in this category'}
            </Text>
          </View>
        ) : sorted.map((a, i) => (
          <TouchableOpacity key={a.symbol} onPress={() => handleCoinTap(a.symbol)} activeOpacity={0.75}>
            <CardSection last={i === sorted.length - 1}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CoinGlyph symbol={a.symbol} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                    <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                      ${a.price < 0.01 ? a.price.toFixed(8) : a.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>{a.name} · MC {a.marketCap}</Text>
                    <Text style={{ fontSize: 12, color: a.change24h >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                      {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(1)}%
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  <Sparkline data={a.history} down={a.change24h < 0} width={56} height={22} />
                  <TouchableOpacity
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
        ))}
      </Card>
    </ScreenShell>
  );
}
