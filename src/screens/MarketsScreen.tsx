import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { Card, CardSection } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { CoinGlyph } from '../components/ui/Avatar';
import { Sparkline } from '../components/charts/Sparkline';
import { useTheme } from '../theme/ThemeContext';

const categories = ['All', 'Top 10', 'DeFi', 'Layer 1', 'Meme', 'Stables'];

const assets = [
  { symbol: 'BTC',  name: 'Bitcoin',   cap: '$1.26T',  price: '64,210', change: '+2.4%', down: false },
  { symbol: 'ETH',  name: 'Ethereum',  cap: '$381B',   price: '3,180',  change: '+1.1%', down: false },
  { symbol: 'SOL',  name: 'Solana',    cap: '$80B',    price: '182.40', change: '−0.8%', down: true  },
  { symbol: 'BNB',  name: 'BNB',       cap: '$88B',    price: '590.20', change: '+0.4%', down: false },
  { symbol: 'DOGE', name: 'Dogecoin',  cap: '$23B',    price: '0.160',  change: '+5.7%', down: false },
  { symbol: 'PEPE', name: 'Pepe',      cap: '$4.2B',   price: '0.0000118', change: '+12.3%', down: false },
  { symbol: 'USDC', name: 'USD Coin',  cap: '$32B',    price: '1.000',  change: '0.0%',  down: false },
];

const movers = assets.filter(a => a.symbol !== 'USDC').slice(0, 5);

export function MarketsScreen() {
  const { colors } = useTheme();
  const [cat, setCat] = useState('All');

  return (
    <ScreenShell eyebrow="Markets" title="Crypto">
      {/* Stats strip */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>TOTAL MKT CAP</Text>
          <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>$2.41T</Text>
        </View>
        <View>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>FEAR & GREED</Text>
          <Text style={{ fontWeight: '700', color: colors.warn, fontVariant: ['tabular-nums'] }}>62 · Greed</Text>
        </View>
        <View>
          <Text style={{ fontSize: 11, color: colors.ink3 }}>BTC DOM</Text>
          <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>52.4%</Text>
        </View>
      </View>

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
            <Card key={a.symbol} variant="compact" style={{ width: 110 }}>
              <CoinGlyph symbol={a.symbol} size={28} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
              <Text style={{ fontSize: 11, color: a.down ? colors.down : colors.up, fontVariant: ['tabular-nums'] }}>
                {a.change}
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* Asset list */}
      <Card variant="noPad">
        {assets.map((a, i) => (
          <CardSection key={a.symbol} last={i === assets.length - 1}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CoinGlyph symbol={a.symbol} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>{a.symbol}</Text>
                  <Text style={{ fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }}>${a.price}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>{a.cap}</Text>
                  <Text style={{ fontSize: 12, color: a.down ? colors.down : colors.up, fontVariant: ['tabular-nums'] }}>
                    {a.change}
                  </Text>
                </View>
              </View>
              <Sparkline down={a.down} width={56} height={22} />
            </View>
          </CardSection>
        ))}
      </Card>
    </ScreenShell>
  );
}
