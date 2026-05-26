import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, ViewStyle, PanResponder, Text } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Indicator = 'MA20' | 'MA50' | 'RSI';

interface CandleChartProps {
  height?: number;
  data?: Candle[];
  timeframe?: string;
  basePrice?: number;
  indicators?: Indicator[];
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

  const prices: number[] = [endPrice];
  for (let i = 1; i < count + 1; i++) {
    const noise = (
      Math.sin((i + seed) * 1.9) * 0.55 +
      Math.cos((i + seed) * 0.8) * 0.35 +
      Math.sin((i + seed) * 4.1) * 0.1
    ) * volatility;
    const prev = prices[prices.length - 1];
    prices.push(Math.max(prev * (1 + noise - 0.0003), endPrice * 0.3));
  }
  prices.reverse();

  return prices.slice(0, count).map((open, i) => {
    const close = prices[i + 1];
    const s1 = Math.abs(Math.sin((i + seed) * 2.3));
    const s2 = Math.abs(Math.cos((i + seed) * 1.5));
    const bodyRange = Math.abs(close - open);
    return {
      open,
      close,
      high:   Math.max(open, close) + bodyRange * 0.3 + Math.max(open, close) * volatility * s1 * 0.5,
      low:    Math.min(open, close) - bodyRange * 0.3 - Math.min(open, close) * volatility * s2 * 0.5,
      volume: 0.25 + s1 * 0.75,
    };
  });
}

function computeMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    return values.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
  });
}

function computeRSI(values: number[], period = 14): (number | null)[] {
  return values.map((_, i) => {
    if (i < period) return null;
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - values[j - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const rs = losses === 0 ? Infinity : gains / losses;
    return 100 - 100 / (1 + rs);
  });
}

function seriesPath(values: (number | null)[], W: number, H: number, min: number, max: number): string {
  const range = max - min || 1;
  let d = '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85 - H * 0.075;
    d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
  }
  return d;
}

export function CandleChart({ height = 220, data, timeframe, basePrice, indicators = [], style }: CandleChartProps) {
  const { colors } = useTheme();
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(300);

  const basePriceRef = useRef(basePrice ?? 64210);
  useEffect(() => {
    if (basePrice !== undefined) basePriceRef.current = basePrice;
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const candles = useMemo(() => {
    if (data) return data;
    return generateCandles(timeframe ?? '5M', basePriceRef.current);
  }, [timeframe, data]);

  const closes = useMemo(() => candles.map(c => c.close), [candles]);

  const showRSI = indicators.includes('RSI');
  const showMA20 = indicators.includes('MA20');
  const showMA50 = indicators.includes('MA50');

  const W = 300;
  const chartH = showRSI ? Math.round(height * 0.68) : height;
  const rsiH   = showRSI ? height - chartH - 10 : 0;

  const isUp = closes[closes.length - 1] >= closes[0];
  const lineColor = isUp ? colors.up : colors.down;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const toY = (v: number) => chartH - ((v - min) / range) * chartH * 0.85 - chartH * 0.075;

  const points = useMemo(() => closes.map((v, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: toY(v),
  })), [closes, chartH]); // eslint-disable-line react-hooks/exhaustive-deps

  const mainPath = useMemo(() => {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cpx = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
      d += ` C ${cpx} ${points[i - 1].y}, ${cpx} ${points[i].y}, ${points[i].x} ${points[i].y}`;
    }
    return d;
  }, [points]);

  const ma20 = useMemo(() => showMA20 ? computeMA(closes, 20) : [], [closes, showMA20]);
  const ma50 = useMemo(() => showMA50 ? computeMA(closes, 50) : [], [closes, showMA50]);
  const rsi  = useMemo(() => showRSI  ? computeRSI(closes)    : [], [closes, showRSI]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      const idx = Math.round((e.nativeEvent.locationX / containerWidth) * (closes.length - 1));
      setCrosshairIdx(Math.max(0, Math.min(idx, closes.length - 1)));
    },
    onPanResponderMove: (e) => {
      const idx = Math.round((e.nativeEvent.locationX / containerWidth) * (closes.length - 1));
      setCrosshairIdx(Math.max(0, Math.min(idx, closes.length - 1)));
    },
    onPanResponderRelease:   () => setCrosshairIdx(null),
    onPanResponderTerminate: () => setCrosshairIdx(null),
  }), [containerWidth, closes.length]);

  const last = points[points.length - 1];

  // Crosshair SVG coords
  const chX = crosshairIdx !== null ? (crosshairIdx / (closes.length - 1)) * W : null;
  const chY = crosshairIdx !== null ? toY(closes[crosshairIdx]) : null;
  const chPrice = crosshairIdx !== null ? closes[crosshairIdx] : null;

  // Tooltip stays in-bounds
  const tooltipLeft = crosshairIdx !== null
    ? Math.max(4, Math.min(containerWidth - 80, (crosshairIdx / (closes.length - 1)) * containerWidth - 36))
    : 0;

  // RSI helpers
  const toRsiY = (v: number) => rsiH - (v / 100) * rsiH * 0.85 - rsiH * 0.075;
  const rsiNow = rsi.length ? rsi[rsi.length - 1] : null;
  const rsiColor = rsiNow !== null && rsiNow > 70 ? colors.down : rsiNow !== null && rsiNow < 30 ? colors.up : colors.ink2 ?? colors.ink3;

  return (
    <View
      style={[{ height }, style]}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      {/* Floating price tooltip */}
      {chPrice !== null && (
        <View style={{
          position: 'absolute', top: 4, left: tooltipLeft, zIndex: 10,
          backgroundColor: colors.ink, borderRadius: 6,
          paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ color: colors.surface, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            ${chPrice < 0.01
              ? chPrice.toFixed(8)
              : chPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      )}

      {/* Main price chart */}
      <Svg width="100%" height={chartH} viewBox={`0 0 ${W} ${chartH}`} preserveAspectRatio="none">
        <Path d={mainPath} stroke={lineColor} strokeWidth="2" fill="none" />
        {!crosshairIdx && <Circle cx={last.x} cy={last.y} r="3.5" fill={lineColor} />}

        {showMA20 && <Path d={seriesPath(ma20, W, chartH, min, max)} stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.85" />}
        {showMA50 && <Path d={seriesPath(ma50, W, chartH, min, max)} stroke="#6366F1" strokeWidth="1.5" fill="none" opacity="0.85" />}

        {chX !== null && chY !== null && (
          <>
            <Line x1={chX} y1={0}      x2={chX} y2={chartH} stroke={colors.ink3} strokeWidth="0.75" strokeDasharray="4,3" />
            <Line x1={0}   y1={chY}    x2={W}   y2={chY}    stroke={colors.ink3} strokeWidth="0.75" strokeDasharray="4,3" />
            <Circle cx={chX} cy={chY} r="7" fill={lineColor} opacity="0.2" />
            <Circle cx={chX} cy={chY} r="3.5" fill={lineColor} />
          </>
        )}
      </Svg>

      {/* RSI sub-panel */}
      {showRSI && (
        <>
          <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 4 }} />
          <View style={{ position: 'relative', height: rsiH }}>
            <Text style={{
              position: 'absolute', top: 0, left: 2, zIndex: 1,
              fontSize: 9, fontWeight: '700', color: colors.ink3, letterSpacing: 0.3,
            }}>
              RSI 14 {rsiNow !== null ? `· ${rsiNow.toFixed(0)}` : ''}
            </Text>
            <Svg width="100%" height={rsiH} viewBox={`0 0 ${W} ${rsiH}`} preserveAspectRatio="none">
              {/* Overbought/oversold zones */}
              <Line x1={0} y1={toRsiY(70)} x2={W} y2={toRsiY(70)} stroke={colors.down} strokeWidth="0.75" opacity="0.4" strokeDasharray="3,3" />
              <Line x1={0} y1={toRsiY(50)} x2={W} y2={toRsiY(50)} stroke={colors.ink3} strokeWidth="0.5"  opacity="0.25" />
              <Line x1={0} y1={toRsiY(30)} x2={W} y2={toRsiY(30)} stroke={colors.up}   strokeWidth="0.75" opacity="0.4" strokeDasharray="3,3" />
              {/* RSI line */}
              {(() => {
                let d = '';
                for (let i = 0; i < rsi.length; i++) {
                  if (rsi[i] === null) continue;
                  const x = (i / (rsi.length - 1)) * W;
                  const y = toRsiY(rsi[i]!);
                  d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
                }
                return <Path d={d} stroke={rsiColor} strokeWidth="1.5" fill="none" />;
              })()}
              {/* Crosshair dot on RSI */}
              {chX !== null && crosshairIdx !== null && rsi[crosshairIdx] !== null && (
                <Circle cx={chX} cy={toRsiY(rsi[crosshairIdx]!)} r="3" fill={colors.ink} />
              )}
            </Svg>
          </View>
        </>
      )}
    </View>
  );
}
