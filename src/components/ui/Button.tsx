import React from 'react';
import { StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';
import { PressableScale } from './PressableScale';

type ButtonVariant = 'brand' | 'up' | 'down' | 'ghost' | 'surface' | 'accent';
type ButtonSize = 'default' | 'sm';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
}

export function Button({
  variant = 'surface',
  size = 'default',
  onPress,
  children,
  style,
  textStyle,
  disabled,
  loading,
  fullWidth,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();

  const bgMap: Record<ButtonVariant, string> = {
    brand: colors.brand,
    up: colors.up,
    down: colors.down,
    ghost: 'transparent',
    surface: colors.surface2,
    accent: colors.accent,
  };

  const textColorMap: Record<ButtonVariant, string> = {
    brand: colors.brandOn,
    up: '#FFFFFF',
    down: '#FFFFFF',
    ghost: colors.ink,
    surface: colors.ink,
    accent: '#FFFFFF',
  };

  const borderMap: Record<ButtonVariant, string> = {
    brand: colors.brand,
    up: colors.up,
    down: colors.down,
    ghost: colors.hairlineStrong,
    surface: colors.hairline,
    accent: colors.accent,
  };

  const pad = size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 14 } : { paddingVertical: 13, paddingHorizontal: 18 };
  const textSize = size === 'sm' ? 12 : 14;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        pad,
        {
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
          opacity: disabled ? 0.5 : 1,
          // Full width = stretch across the container's cross axis. (Using
          // `flex: 1` here collapsed the button's height to ~0 inside an
          // auto-height column — e.g. modal cards — clipping the label.)
          alignSelf: fullWidth ? 'stretch' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColorMap[variant]} />
      ) : (
        <Text style={[styles.text, { color: textColorMap[variant], fontSize: textSize }, textStyle]}>
          {children}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  text: {
    fontWeight: '600',
  },
});
