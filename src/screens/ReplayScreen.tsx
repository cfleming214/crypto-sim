import React from 'react';
import { Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { useTheme } from '../theme/ThemeContext';

export function ReplayScreen() {
  const { colors } = useTheme();
  return (
    <ScreenShell title="Time Machine">
      <Text style={{ color: colors.ink3 }}>Coming in next PR</Text>
    </ScreenShell>
  );
}
