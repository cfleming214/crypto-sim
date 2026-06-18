import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../../theme/ThemeContext';
import { radius, fontSize } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

type ChipVariant = 'default' | 'brand' | 'up' | 'down' | 'warn' | 'outline' | 'accent';

interface ChipProps {
  variant?: ChipVariant;
  children?: React.ReactNode;
  style?: ViewStyle;
  dot?: boolean;
  dotColor?: string;
  /** When set, the chip becomes a press-scaling tappable. */
  onPress?: () => void;
}

export function Chip({ variant = 'default', children, style, dot, dotColor, onPress }: ChipProps) {
  const { colors } = useTheme();

  const bgMap: Record<ChipVariant, string> = {
    default: colors.surface2,
    brand: colors.brand,
    up: colors.upSoft,
    down: colors.downSoft,
    warn: colors.warnSoft,
    outline: 'transparent',
    accent: colors.accentSoft,
  };

  const textColorMap: Record<ChipVariant, string> = {
    default: colors.ink2,
    brand: colors.brandOn,
    up: colors.up,
    down: colors.down,
    warn: colors.warn,
    outline: colors.ink2,
    accent: colors.accent,
  };

  const borderMap: Record<ChipVariant, string | undefined> = {
    default: undefined,
    brand: undefined,
    up: undefined,
    down: undefined,
    warn: undefined,
    outline: colors.hairlineStrong,
    accent: undefined,
  };

  const body = (
    <>
      {dot && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: dotColor ?? colors.ink3,
          }}
        />
      )}
      <Text style={[styles.text, { color: textColorMap[variant] }]}>{children}</Text>
    </>
  );

  const chipStyle = [
    styles.base,
    {
      backgroundColor: bgMap[variant],
      borderWidth: variant === 'outline' ? 1 : 0,
      borderColor: borderMap[variant],
    },
    style,
  ];

  if (onPress) {
    return <PressableScale onPress={onPress} style={chipStyle}>{body}</PressableScale>;
  }
  return <View style={chipStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
