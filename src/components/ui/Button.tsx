import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';

type ButtonVariant = 'brand' | 'up' | 'down' | 'ghost' | 'surface';
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
}: ButtonProps) {
  const { colors } = useTheme();

  const bgMap: Record<ButtonVariant, string> = {
    brand: colors.brand,
    up: colors.up,
    down: colors.down,
    ghost: 'transparent',
    surface: colors.surface2,
  };

  const textColorMap: Record<ButtonVariant, string> = {
    brand: colors.brandOn,
    up: '#FFFFFF',
    down: '#FFFFFF',
    ghost: colors.ink,
    surface: colors.ink,
  };

  const borderMap: Record<ButtonVariant, string> = {
    brand: colors.brand,
    up: colors.up,
    down: colors.down,
    ghost: colors.hairlineStrong,
    surface: colors.hairline,
  };

  const pad = size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 14 } : { paddingVertical: 13, paddingHorizontal: 18 };
  const textSize = size === 'sm' ? 12 : 14;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        pad,
        {
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
          opacity: disabled ? 0.5 : 1,
          flex: fullWidth ? 1 : undefined,
        },
        style,
      ]}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColorMap[variant]} />
      ) : (
        <Text style={[styles.text, { color: textColorMap[variant], fontSize: textSize }, textStyle]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
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
