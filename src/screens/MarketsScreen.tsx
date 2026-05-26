import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { CoinGlyph } from '../components/ui/Avatar';
import { Sparkline } from '../components/charts/Sparkline';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../store/AppContext';

const categories = ['All', 'Top 10', 'DeFi', 'Layer 1', 'Meme', 'Stables'];

export function MarketsScreen() {
  const { colors } = useTheme();
  const { state } = useApp();
  const [cat, setCat] = useState('All');

  const coins = state.coins;
  const movers = [...coins].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 5);

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

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
          {categories.map(c => (
            <TouchableOpacity key={c} onPress={() => setCat(c)}>
              <Chip variant={cat === c ? 'brand' : 'outline'}>{c}</Chip>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Top movers */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Top movers</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20 }}>
          {movers.map(a => (
            <Card key={a.symbol} variant="compact" style={{ width: 120, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CoinGlyph symbol={a.symbol} size={24} />
                <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
              </View>
              <Sparkline data={a.history} down={a.change24h < 0} width={96} height={28} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: a.change24h >= 0 ? colors.up : colors.down, fontVariant: ['tabular-nums'] }}>
                {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(1)}%
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* All assets */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>All assets</Text>
        <Text style={{ fontSize: 11, color: colors.ink3 }}>Sort: Market cap ↓</Text>
      </View>

      <Card variant="noPad">
        {coins.map((a, i) => (
          <CardSection key={a.symbol} last={i === coins.length - 1}>
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
              <Sparkline data={a.history} down={a.change24h < 0} width={56} height={22} />
            </View>
          </CardSection>
        ))}
      </Card>
    </ScreenShell>
  );
}
