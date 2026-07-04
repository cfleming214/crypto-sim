import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from './ui/Text';
import { Card } from './ui/Card';
import { CoinGlyph } from './ui/Avatar';
import { useTheme } from '../theme/ThemeContext';
import { fetchTradeMix24h, type TradeMixSlice } from '../services/liveTradeService';

// "Top traded · 24h" — a ranked horizontal bar chart of the 5 most-traded coins
// across the global feed in the last 24h, each labelled with its share of all
// trades. Sits under the live-trades ticker on Compete. Hides itself when there's
// no data (guest / quiet feed). Reloads on focus.
export function TradeMix24h() {
  const { colors } = useTheme();
  const [mix, setMix] = useState<TradeMixSlice[] | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    fetchTradeMix24h().then(m => { if (!cancelled) setMix(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  if (!mix || mix.length === 0) return null; // nothing to show yet

  const leader = Math.max(...mix.map(s => s.pct), 1);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Top traded</Text>
        <Text style={{ fontSize: 12, color: colors.ink3 }}>· last 24h</Text>
      </View>
      <Card style={{ gap: 12 }}>
        {mix.map(s => (
          <View key={s.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CoinGlyph symbol={s.symbol} size={26} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{s.symbol}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{s.pct}%</Text>
              </View>
              {/* Bar scaled to the leader so the ranking reads at a glance. The
                  fill is split green (buys) / red (sells) in proportion to that
                  coin's buy-vs-sell trades over the 24h window. */}
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', width: `${Math.max(6, (s.pct / leader) * 100)}%` }}>
                  {s.buys > 0 && <View style={{ flex: s.buys, backgroundColor: colors.up }} />}
                  {s.sells > 0 && <View style={{ flex: s.sells, backgroundColor: colors.down }} />}
                </View>
              </View>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}
