import React from 'react';
import { Text } from 'react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { useTheme } from '../theme/ThemeContext';

export function NotificationsScreen() {
  const { colors } = useTheme();
  return (
    <ScreenShell title="Notifications">
      <Text style={{ color: colors.ink3 }}>Coming in next PR</Text>
    </ScreenShell>
  );
}
