import React, { useMemo } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface AreaChartProps {
  height?: number;
  data?: number[];
  down?: boolean;
  showDot?: boolean;
  style?: ViewStyle;
}

function generatePath(data: number[], w: number, h: number, closed = false): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h * 0.85 - h * 0.075,
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
    const cp1y = points[i - 1].y;
    const cp2x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
    const cp2y = points[i].y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i].x} ${points[i].y}`;
  }

  if (closed) {
    d += ` L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
  }

  return d;
}

const DEFAULT_DATA = [100, 108, 104, 115, 111, 122, 118, 130, 125, 140, 135, 148];

export function AreaChart({ height = 170, data, down = false, showDot = true, style }: AreaChartProps) {
  const { colors } = useTheme();
  const chartData = data ?? DEFAULT_DATA;
  const color = down ? colors.down : colors.up;

  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={generatePath(chartData, 300, height, true)} fill="url(#areaGrad)" />
        <Path d={generatePath(chartData, 300, height, false)} stroke={color} strokeWidth="2" fill="none" />
        {showDot && (() => {
          const last = chartData[chartData.length - 1];
          const min = Math.min(...chartData);
          const max = Math.max(...chartData);
          const range = max - min || 1;
          const dotY = height - ((last - min) / range) * height * 0.85 - height * 0.075;
          return <Circle cx="300" cy={dotY} r="3.5" fill={color} />;
        })()}
      </Svg>
    </View>
  );
}
