import React, { useMemo, useRef, useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
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
  timeframe?: string;
  basePrice?: number;
  style?: ViewStyle;
}

const TF_CONFIG: Record<string, { count: number; volatility: number }> = {
  '1M': { count: 40, volatility: 0.0015 },
  '5M': { count: 32, volatility: 0.004  },
  '1H': { count: 24, volatility: 0.012  },
  '1D': { count: 30, volatility: 0.030  },
  '1W': { count: 20, volatility: 0.075  },
};

function generateCandles(timeframe: string, endPrice: number): Candle[] {
  const cfg = TF_CONFIG[timeframe] ?? TF_CONFIG['5M'];
  const { count, volatility } = cfg;

  const seed = timeframe.split('').reduce((s, c, i) => s + c.charCodeAt(0) * (i + 1), 0);

  // Work backwards from endPrice so the chart always ends at current price
  const prices: number[] = [endPrice];
  for (let i = 1; i < count + 1; i++) {
    const noise = (
      Math.sin((i + seed) * 1.9) * 0.55 +
      Math.cos((i + seed) * 0.8) * 0.35 +
      Math.sin((i + seed) * 4.1) * 0.1
    ) * volatility;
    const prev = prices[prices.length - 1];
    // Slight downward bias going back (so trend is up going forward)
    const step = prev * (1 + noise - 0.0003);
    prices.push(Math.max(step, endPrice * 0.3));
  }

  // Reverse so oldest is first
  prices.reverse();

  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = prices[i];
    const close = prices[i + 1];
    const s1 = Math.abs(Math.sin((i + seed) * 2.3));
    const s2 = Math.abs(Math.cos((i + seed) * 1.5));
    const bodyRange = Math.abs(close - open);
    const high = Math.max(open, close) + bodyRange * 0.3 + Math.max(open, close) * volatility * s1 * 0.5;
    const low  = Math.min(open, close) - bodyRange * 0.3 - Math.min(open, close) * volatility * s2 * 0.5;
    const volume = 0.25 + s1 * 0.75;
    candles.push({ open, close, high, low, volume });
  }

  return candles;
}

export function CandleChart({ height = 220, data, timeframe, basePrice, style }: CandleChartProps) {
  const { colors } = useTheme();

  const basePriceRef = useRef(basePrice ?? 64210);
  useEffect(() => {
    if (basePrice !== undefined) basePriceRef.current = basePrice;
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const candles = useMemo(() => {
    if (data) return data;
    return generateCandles(timeframe ?? '5M', basePriceRef.current);
  }, [timeframe, data]);

  const closes = candles.map(c => c.close);
  const W = 300;
  const isUp = closes[closes.length - 1] >= closes[0];
  const color = isUp ? colors.up : colors.down;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes.map((v, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: height - ((v - min) / range) * height * 0.85 - height * 0.075,
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const cpx = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
    d += ` C ${cpx} ${points[i - 1].y}, ${cpx} ${points[i].y}, ${points[i].x} ${points[i].y}`;
  }

  const last = points[points.length - 1];

  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <Path d={d} stroke={color} strokeWidth="2" fill="none" />
        <Circle cx={last.x} cy={last.y} r="3.5" fill={color} />
      </Svg>
    </View>
  );
}
