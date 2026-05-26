import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';

type CardVariant = 'default' | 'compact' | 'tinted' | 'noPad' | 'flat';

interface CardProps {
  variant?: CardVariant;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function Card({ variant = 'default', style, children }: CardProps) {
  const { colors } = useTheme();

  const bgMap: Record<CardVariant, string> = {
    default: colors.elevated,
    compact: colors.elevated,
    tinted: colors.surface2,
    noPad: colors.elevated,
    flat: colors.elevated,
  };

  const padMap: Record<CardVariant, number> = {
    default: spacing.base,
    compact: spacing.md,
    tinted: spacing.base,
    noPad: 0,
    flat: spacing.md,
  };

  const gapMap: Record<CardVariant, number> = {
    default: 12,
    compact: 8,
    tinted: 12,
    noPad: 0,
    flat: 8,
  };

  const radiusMap: Record<CardVariant, number> = {
    default: radius.lg,
    compact: radius.md,
    tinted: radius.lg,
    noPad: radius.lg,
    flat: radius.md,
  };

  return (
    <View
      style={[
        {
          backgroundColor: bgMap[variant],
          borderColor: colors.hairline,
          borderWidth: 1,
          borderRadius: radiusMap[variant],
          padding: padMap[variant],
          gap: gapMap[variant],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface CardSectionProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  last?: boolean;
}

export function CardSection({ children, style, last }: CardSectionProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: spacing.base,
          paddingVertical: 14,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: colors.hairline,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
