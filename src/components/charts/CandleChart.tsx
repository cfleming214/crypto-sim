import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandleChartProps {
  height?: number;
  data?: Candle[];
  style?: ViewStyle;
}

const DEFAULT_CANDLES: Candle[] = [
  { open: 62000, high: 63200, low: 61500, close: 62800, volume: 0.6 },
  { open: 62800, high: 64100, low: 62400, close: 63900, volume: 0.8 },
  { open: 63900, high: 64800, low: 63200, close: 63400, volume: 0.5 },
  { open: 63400, high: 64200, low: 62900, close: 64100, volume: 0.7 },
  { open: 64100, high: 65000, low: 63800, close: 64500, volume: 0.9 },
  { open: 64500, high: 65200, low: 63900, close: 64200, volume: 0.6 },
  { open: 64200, high: 64900, low: 63600, close: 64890, volume: 1.0 },
  { open: 64890, high: 65400, low: 64000, close: 64210, volume: 0.75 },
];

export function CandleChart({ height = 220, data, style }: CandleChartProps) {
  const { colors } = useTheme();
  const candles = data ?? DEFAULT_CANDLES;

  const allValues = candles.flatMap(c => [c.high, c.low]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const W = 300;
  const chartH = height * 0.82;
  const volH = height * 0.12;
  const gap = height * 0.06;

  const toY = (v: number) => chartH - ((v - minVal) / range) * chartH * 0.9 - chartH * 0.05;

  const candleW = (W / candles.length) * 0.55;
  const spacing = W / candles.length;

  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        {candles.map((c, i) => {
          const x = i * spacing + spacing / 2;
          const bull = c.close >= c.open;
          const color = bull ? colors.up : colors.down;
          const bodyTop = toY(Math.max(c.open, c.close));
          const bodyBot = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(2, bodyBot - bodyTop);

          // volume bar
          const maxVol = Math.max(...candles.map(cc => cc.volume ?? 0.5));
          const vol = (c.volume ?? 0.5) / maxVol;
          const volY = chartH + gap + volH * (1 - vol);

          return (
            <React.Fragment key={i}>
              {/* wick */}
              <Line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth="1" />
              {/* body */}
              <Rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} rx="1" />
              {/* volume */}
              <Rect x={x - candleW / 2} y={volY} width={candleW} height={chartH + gap + volH - volY} fill={color} opacity="0.35" rx="1" />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
