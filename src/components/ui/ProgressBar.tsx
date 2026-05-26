import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface ProgressBarProps {
  step: number;
  total: number;
}

export function ProgressBar({ step, total }: ProgressBarProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i < step ? colors.ink : colors.surface2,
          }}
        />
      ))}
    </View>
  );
}
