import React from 'react';
import { View, Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { useTheme } from '../theme/ThemeContext';

export function TradeDetailScreen() {
  const { colors } = useTheme();
  return (
    <ScreenShell title="Trade Detail">
      <Text style={{ color: colors.ink3 }}>Coming in next PR</Text>
    </ScreenShell>
  );
}
