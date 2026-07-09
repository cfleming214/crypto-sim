import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../../theme/ThemeContext';

// A small filled triangle (CSS-triangle via borders, so it renders on every font),
// pointing up for gains and down for losses. Robinhood's signature change glyph.
export function Triangle({ up, color, size = 5 }: { up: boolean; color: string; size?: number }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size,
        borderRightWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        ...(up
          ? { borderBottomWidth: size * 1.5, borderBottomColor: color }
          : { borderTopWidth: size * 1.5, borderTopColor: color }),
      }}
    />
  );
}

// Robinhood-style change indicator: a filled ▲/▼ triangle + percent, colored
// green (up) / red (down). Optionally prefixes a $ delta (e.g. "+$1.20 · 3.40%").
export function DeltaText({
  pct,
  dollars,
  size = 11,
  weight = '600',
  showTriangle = true,
}: {
  pct: number;
  dollars?: string;
  size?: number;
  weight?: '400' | '500' | '600' | '700';
  showTriangle?: boolean;
}) {
  const { colors } = useTheme();
  const up = pct >= 0;
  const color = up ? colors.up : colors.down;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {showTriangle && <Triangle up={up} color={color} size={Math.max(3.5, size * 0.4)} />}
      <Text style={{ fontSize: size, fontWeight: weight, color, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {dollars ? `${up ? '+' : '−'}$${dollars} · ` : ''}{Math.abs(pct).toFixed(2)}%
      </Text>
    </View>
  );
}
