import React from 'react';
import { TextStyle, TextProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/tokens';

interface TypographyProps extends TextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'lg' | 'base' | 'sm' | 'xs' | 'eyebrow';
  weight?: keyof typeof fontWeight;
  color?: string;
  mono?: boolean;
  up?: boolean;
  down?: boolean;
  muted?: boolean;
  dim?: boolean;
  style?: TextStyle;
}

export function Typography({
  variant = 'base',
  weight = 'regular',
  color,
  mono,
  up,
  down,
  muted,
  dim,
  style,
  children,
  ...props
}: TypographyProps) {
  const { colors } = useTheme();

  let textColor = colors.ink;
  if (muted) textColor = colors.ink3;
  if (dim) textColor = colors.ink2;
  if (up) textColor = colors.up;
  if (down) textColor = colors.down;
  if (color) textColor = color;

  const variantTable: Record<NonNullable<TypographyProps['variant']>, TextStyle> = {
    h1: { fontSize: fontSize.h1, fontWeight: '700', letterSpacing: -0.7 },
    h2: { fontSize: fontSize.h2, fontWeight: '700', letterSpacing: -0.4 },
    h3: { fontSize: fontSize.h3, fontWeight: '600', letterSpacing: -0.16 },
    lg: { fontSize: fontSize.lg },
    base: { fontSize: fontSize.base },
    sm: { fontSize: fontSize.sm },
    xs: { fontSize: fontSize.xs },
    eyebrow: { fontSize: fontSize.eyebrow, fontWeight: '600', letterSpacing: 0.44, textTransform: 'uppercase' },
  };
  const variantStyles = variantTable[variant];

  return (
    <Text
      style={[
        { color: textColor, fontWeight: fontWeight[weight] },
        variantStyles,
        mono && { fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}
