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
  /** When `data` is absent, seed (e.g. the coin symbol) so each coin's
   *  placeholder differs instead of every row drawing the same default line. */
  seed?: string;
}

const DEFAULT_DATA = [10, 12, 11, 14, 13, 16, 15, 18];

// Deterministic pseudo-random walk derived from a string, so a coin without
// real history still gets a distinct (but stable) placeholder sparkline.
function seededSeries(seed: string, n = 16): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; // xorshift
    v += ((h >>> 0) % 1000) / 1000 - 0.5;       // ±0.5 step
    out.push(v);
  }
  return out;
}

export function Sparkline({ data, width = 56, height = 22, down, style, seed }: SparklineProps) {
  const { colors } = useTheme();
  const pts = data ?? (seed ? seededSeries(seed) : DEFAULT_DATA);
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
