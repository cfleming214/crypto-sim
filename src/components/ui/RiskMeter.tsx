import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface RiskMeterProps {
  score: number; // 0-100
  style?: ViewStyle;
}

export function RiskMeter({ score, style }: RiskMeterProps) {
  const { colors } = useTheme();
  // 5 segments, score 0-20 = 1 segment, etc.
  const filled = Math.min(5, Math.ceil(score / 20));

  // `score` is a health score (high = low risk). Color the filled segments by
  // level to match the Healthy/Caution/High-risk chip: green = low risk,
  // yellow = medium, red = high risk.
  const levelColor = score >= 80 ? colors.up : score >= 50 ? colors.warn : colors.down;

  return (
    <View style={[{ flexDirection: 'row', gap: 3, height: 8 }, style]}>
      {[1, 2, 3, 4, 5].map(i => (
        <View
          key={i}
          style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: i <= filled ? levelColor : colors.surface2 }}
        />
      ))}
    </View>
  );
}
