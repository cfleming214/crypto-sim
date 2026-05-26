import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface SparklineProps {
  data?: number[];
  width?: number;
  height?: number;
  down?: boolean;
  style?: ViewStyle;
}

const DEFAULT_DATA = [10, 12, 11, 14, 13, 16, 15, 18];

export function Sparkline({ data, width = 56, height = 22, down, style }: SparklineProps) {
  const { colors } = useTheme();
  const pts = data ?? DEFAULT_DATA;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const color = down ? colors.down : colors.up;

  const points = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * width,
    y: height - ((v - min) / range) * height * 0.8 - height * 0.1,
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
    d += ` C ${cpx} ${points[i - 1].y}, ${cpx} ${points[i].y}, ${points[i].x} ${points[i].y}`;
  }

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Path d={d} stroke={color} strokeWidth="1.5" fill="none" />
      </Svg>
    </View>
  );
}
