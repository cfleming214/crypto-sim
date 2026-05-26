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

  return (
    <View style={[{ flexDirection: 'row', gap: 3, height: 8 }, style]}>
      {[1, 2, 3, 4, 5].map(i => {
        let bg = colors.surface2;
        if (i <= filled) {
          if (i === 5) bg = colors.down;
          else if (i === 4) bg = colors.warn;
          else bg = colors.ink;
        }
        return (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: bg }} />
        );
      })}
    </View>
  );
}
