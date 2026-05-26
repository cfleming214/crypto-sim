import React, { useMemo, useRef, useEffect } from 'react';
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

  // Capture basePrice at the moment timeframe changes, not on every price tick
  const basePriceRef = useRef(basePrice ?? 64210);
  useEffect(() => {
    if (basePrice !== undefined) basePriceRef.current = basePrice;
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const candles = useMemo(() => {
    if (data) return data;
    return generateCandles(timeframe ?? '5M', basePriceRef.current);
  }, [timeframe, data]); // re-generate only on timeframe change

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

          const maxVol = Math.max(...candles.map(cc => cc.volume ?? 0.5));
          const vol = (c.volume ?? 0.5) / maxVol;
          const volY = chartH + gap + volH * (1 - vol);

          return (
            <React.Fragment key={i}>
              <Line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth="1" />
              <Rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} rx="1" />
              <Rect x={x - candleW / 2} y={volY} width={candleW} height={chartH + gap + volH - volY} fill={color} opacity="0.35" rx="1" />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
