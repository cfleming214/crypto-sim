import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { coinColors, coinColorsDark } from '../../theme/tokens';

type AvatarSize = 'sm' | 'default' | 'lg' | 'xl';

interface AvatarProps {
  initials?: string;
  size?: AvatarSize;
  square?: boolean;
  brand?: boolean;
  style?: ViewStyle;
}

const sizeMap: Record<AvatarSize, number> = { sm: 28, default: 36, lg: 52, xl: 64 };
const fontSizeMap: Record<AvatarSize, number> = { sm: 11, default: 14, lg: 18, xl: 22 };

export function Avatar({ initials = '?', size = 'default', square, brand, style }: AvatarProps) {
  const { colors, isDark } = useTheme();
  const dim = sizeMap[size];
  const br = square ? 10 : dim / 2;

  return (
    <View
      style={[
        {
          width: dim,
          height: dim,
          borderRadius: br,
          backgroundColor: brand ? colors.brand : colors.surface2,
          borderWidth: 1,
          borderColor: colors.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: fontSizeMap[size], fontWeight: '700', color: brand ? colors.brandOn : colors.ink }}>
        {initials}
      </Text>
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
