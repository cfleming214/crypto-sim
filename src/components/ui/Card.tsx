import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

type CardVariant = 'default' | 'compact' | 'tinted' | 'noPad' | 'flat';

interface CardProps {
  variant?: CardVariant;
  style?: ViewStyle;
  children?: React.ReactNode;
  /** Render a diagonal gradient background instead of a flat fill (drops the
   * border). Pass a [from, to] color pair, e.g. from the `gradients` token. */
  gradient?: readonly [string, string];
  /** When set, the whole card becomes a press-scaling tappable. */
  onPress?: () => void;
}

export function Card({ variant = 'default', style, children, gradient, onPress }: CardProps) {
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

  const layout: ViewStyle = {
    borderRadius: radiusMap[variant],
    padding: padMap[variant],
    gap: gapMap[variant],
  };

  const inner = gradient ? (
    <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[layout, { overflow: 'hidden' }, style]}>
      {children}
    </LinearGradient>
  ) : (
    <View style={[layout, { backgroundColor: bgMap[variant], borderColor: colors.hairline, borderWidth: 1 }, style]}>
      {children}
    </View>
  );

  if (onPress) return <PressableScale onPress={onPress}>{inner}</PressableScale>;
  return inner;
}

interface CardSectionProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  last?: boolean;
  /** When set, the row becomes a press-scaling tappable. */
  onPress?: () => void;
}

export function CardSection({ children, style, last, onPress }: CardSectionProps) {
  const { colors } = useTheme();
  const rowStyle: ViewStyle = {
    paddingHorizontal: spacing.base,
    paddingVertical: 14,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: colors.hairline,
  };
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={[rowStyle, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[rowStyle, style]}>{children}</View>;
}
