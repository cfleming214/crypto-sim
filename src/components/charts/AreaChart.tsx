import React, { useMemo, useRef, useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface AreaChartProps {
  height?: number;
  data?: number[];
  timeframe?: string;
  baseValue?: number;
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
    d += ` L ${points[points.length - 1].x} ${h} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
  }

  return d;
}

const TF_CONFIG: Record<string, { points: number; volatility: number; drawdown: number }> = {
  '1H':  { points: 24,  volatility: 0.0008, drawdown: 0.008 },
  '1D':  { points: 48,  volatility: 0.003,  drawdown: 0.025 },
  '7D':  { points: 56,  volatility: 0.010,  drawdown: 0.07  },
  '30D': { points: 60,  volatility: 0.020,  drawdown: 0.15  },
  'SEA': { points: 90,  volatility: 0.035,  drawdown: 0.25  },
  'ALL': { points: 120, volatility: 0.050,  drawdown: 0.35  },
};

function generateData(timeframe: string, endValue: number): number[] {
  const cfg = TF_CONFIG[timeframe] ?? TF_CONFIG['7D'];
  const { points, volatility, drawdown } = cfg;

  // Seed from timeframe string for deterministic but different shapes
  const seed = timeframe.split('').reduce((s, c, i) => s + c.charCodeAt(0) * (i + 1), 0);

  const startValue = endValue * (1 - drawdown);
  const data: number[] = [];
  let v = startValue;

  for (let i = 0; i <= points; i++) {
    const progress = i / points;
    // Smooth trend toward endValue
    const trend = progress * (endValue - startValue);
    // Deterministic noise using sin/cos with seed
    const noise = (
      Math.sin((i + seed) * 1.7) * 0.6 +
      Math.sin((i + seed) * 0.4) * 0.3 +
      Math.cos((i + seed) * 3.1) * 0.1
    ) * volatility * endValue;

    v = startValue + trend + noise;
    v = Math.max(v, endValue * 0.3);
    data.push(v);
  }

  // Pin last point to exact current value
  data[data.length - 1] = endValue;
  return data;
}

export function AreaChart({ height = 170, data, timeframe, baseValue, down = false, showDot = true, style }: AreaChartProps) {
  const { colors } = useTheme();

  // Capture baseValue at the moment timeframe changes, not on every price tick
  const baseValueRef = useRef(baseValue ?? 10847);
  useEffect(() => {
    if (baseValue !== undefined) baseValueRef.current = baseValue;
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(() => {
    if (data) return data;
    return generateData(timeframe ?? '7D', baseValueRef.current);
  }, [timeframe, data]); // re-generate only on timeframe change

  const color = down ? colors.down : colors.up;

  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="none">
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
