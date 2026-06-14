import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { coinColors, coinColorsDark } from '../../theme/tokens';

type AvatarSize = 'sm' | 'default' | 'lg' | 'xl';

/** Presence states for the corner status dot. 'busy' is the catch-all "other". */
export type AvatarStatus = 'online' | 'away' | 'offline' | 'busy';

interface AvatarProps {
  initials?: string;
  size?: AvatarSize;
  square?: boolean;
  brand?: boolean;
  uri?: string;
  style?: ViewStyle;
  /** Render a small colored presence dot at the bottom-right when set. */
  status?: AvatarStatus;
}

const sizeMap: Record<AvatarSize, number> = { sm: 28, default: 36, lg: 52, xl: 64 };
const fontSizeMap: Record<AvatarSize, number> = { sm: 11, default: 14, lg: 18, xl: 22 };

export function Avatar({ initials = '?', size = 'default', square, brand, uri, style, status }: AvatarProps) {
  const { colors } = useTheme();
  const dim = sizeMap[size];
  const br = square ? 10 : dim / 2;

  // Callers pass backgroundColor via `style` to tint the initials circle; keep
  // that on the inner element while layout props (e.g. marginLeft for overlap)
  // stay on the wrapper.
  const bgOverride = (style as { backgroundColor?: string } | undefined)?.backgroundColor;

  const inner = uri ? (
    <View style={{ width: dim, height: dim, borderRadius: br, overflow: 'hidden' }}>
      <Image source={{ uri }} style={{ width: dim, height: dim }} />
    </View>
  ) : (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: br,
        backgroundColor: bgOverride ?? (brand ? colors.brand : colors.surface2),
        borderWidth: 1,
        borderColor: colors.hairline,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: fontSizeMap[size], fontWeight: '700', color: brand ? colors.brandOn : colors.ink }}>
        {initials}
      </Text>
    </View>
  );

  // Wrap so the absolutely-positioned dot anchors to the avatar regardless of
  // which render path (image vs initials) produced it.
  const dotColor =
    status === 'online' ? colors.up :   // green
    status === 'away' ? colors.warn :   // yellow
    colors.down;                        // red — offline / busy
  const dotSize = Math.max(8, Math.round(dim / 3.2));

  // The wrapper is a plain square (no border radius). The caller's `style` may
  // carry a `backgroundColor` meant to tint the inner circle — that's already
  // applied via `bgOverride`. Leaving it on the wrapper too paints the square
  // corners, so the color bleeds past the rounded avatar. Strip it here and
  // keep only layout props (margin, position) on the wrapper.
  const { backgroundColor: _bgIgnored, ...wrapperStyle } =
    (style ?? {}) as ViewStyle & { backgroundColor?: string };

  return (
    <View style={[{ width: dim, height: dim }, wrapperStyle]}>
      {inner}
      {status && (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: dotColor,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      )}
    </View>
  );
}

interface CoinGlyphProps {
  symbol: string;
  size?: number;
  style?: ViewStyle;
}

export function CoinGlyph({ symbol, size = 36, style }: CoinGlyphProps) {
  const { isDark } = useTheme();
  const palette = isDark ? coinColorsDark : coinColors;
  const c = palette[symbol] ?? { bg: '#88888822', color: '#888888' };

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.bg,
          // Subtle colored ring so each coin badge reads as its own brand color
          // instead of a flat tint.
          borderWidth: 1,
          borderColor: `${c.color}55`,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.44, fontWeight: '700', color: c.color }}>{symbol[0]}</Text>
    </View>
  );
}
