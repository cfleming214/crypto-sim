import React, { useMemo, useState } from 'react';
import { View, ViewStyle, PanResponder, Text, Pressable } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { computeMA, computeRSI } from '../../lib/indicators';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Indicator = 'MA20' | 'MA50' | 'RSI';

// A buy/sell marker placed on the chart at the time of a trade. The chart maps
// each marker's timestamp to the nearest candle (needs `timestamps`) and draws
// an up (buy) / down (sell) triangle at the trade price; tapping it reveals the
// units, price and dollar amount.
export interface ChartMarker {
  timestamp: number;
  side: 'buy' | 'sell';
  price: number;
  units: number;
  amount: number;
  symbol?: string;
}

interface CandleChartProps {
  height?: number;
  data?: Candle[];
  timeframe?: string;
  basePrice?: number;
  indicators?: Indicator[];
  style?: ViewStyle;
  timestamps?: number[];     // ms-epoch per candle — enables X-axis labels + markers
  markers?: ChartMarker[];   // buy/sell trades to pin on the chart
  axes?: boolean;            // render price (Y) + time (X) axis labels
}

const TF_CONFIG: Record<string, { count: number; volatility: number }> = {
  '1M': { count: 40, volatility: 0.0015 },
  '5M': { count: 32, volatility: 0.004  },
  '1H': { count: 24, volatility: 0.012  },
  '1D': { count: 30, volatility: 0.030  },
  '1W': { count: 20, volatility: 0.075  },
  // Timeframes used on the Trade screen — without these every range fell
  // through to the '5M' preset and looked identical.
  '24H': { count: 48, volatility: 0.012 },
  '7D':  { count: 56, volatility: 0.030 },
  '30D': { count: 60, volatility: 0.050 },
  '90D': { count: 90, volatility: 0.075 },
  '1Y':  { count: 73, volatility: 0.120 },
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

// Compact dollar label for the price (Y) axis.
function fmtAxisPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1)    return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function fmtMarkerPrice(v: number): string {
  return v < 0.01
    ? v.toFixed(8)
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnits(u: number): string {
  if (u >= 1000) return u.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (u >= 1)    return u.toFixed(2);
  return u.toFixed(4);
}

// Compact time-of-day / date label for the X axis.
function fmtAxisTime(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (spanMs < 365 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
}

export function CandleChart({ height = 220, data, timeframe, basePrice, indicators = [], style, timestamps, markers, axes = false }: CandleChartProps) {
  const { colors } = useTheme();
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  const [selMarker, setSelMarker] = useState<number | null>(null);

  const candles = useMemo(() => {
    if (data && data.length > 0) return data;
    // Fallback only — real CoinGecko candles come in via `data`. Seed the
    // synthetic series from the current coin's price so the placeholder is
    // scaled correctly per coin (the old code froze this to the first coin's
    // price until the timeframe changed, drawing the wrong axis on switch).
    return generateCandles(timeframe ?? '24H', basePrice ?? 64210);
  }, [timeframe, data, basePrice]);

  const closes = useMemo(() => candles.map(c => c.close), [candles]);

  const showRSI = indicators.includes('RSI');
  const showMA20 = indicators.includes('MA20');
  const showMA50 = indicators.includes('MA50');

  // Axes only render against real (passed-in) data; the synthetic placeholder
  // has no meaningful timestamps to label.
  const axesOn = axes && !!data && closes.length >= 2;
  const bottomGutter = axesOn && timestamps && timestamps.length >= 2 ? 16 : 0;

  const W = 300;
  // Total vertical budget for the main price region (incl. its X-axis gutter).
  const mainRegion = showRSI ? Math.round(height * 0.68) : height;
  const rsiH   = showRSI ? height - mainRegion - 10 : 0;
  const plotH  = mainRegion - bottomGutter;   // height the price line is drawn in

  const isUp = closes[closes.length - 1] >= closes[0];
  const lineColor = isUp ? colors.up : colors.down;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const toY = (v: number) => plotH - ((v - min) / range) * plotH * 0.85 - plotH * 0.075;

  const points = useMemo(() => closes.map((v, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: toY(v),
  })), [closes, plotH]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Map each marker to the nearest candle index by timestamp, keeping only those
  // that fall within the visible window. Needs a timestamp per candle.
  const markerData = useMemo(() => {
    if (!markers || !markers.length || !timestamps || timestamps.length < 2) return [];
    const t0 = timestamps[0];
    const tN = timestamps[timestamps.length - 1];
    const tol = (tN - t0) / timestamps.length;   // half a candle of slack each side
    return markers
      .filter(m => m.timestamp >= t0 - tol && m.timestamp <= tN + tol)
      .map(m => {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < timestamps.length; i++) {
          const d = Math.abs(timestamps[i] - m.timestamp);
          if (d < bd) { bd = d; bi = i; }
        }
        return { ...m, idx: bi };
      });
  }, [markers, timestamps]);

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

  // Y-axis gridline values (top / middle / bottom of the visible price range).
  const yTicks = axesOn ? [max, (max + min) / 2, min] : [];
  const xSpan = timestamps && timestamps.length >= 2 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;

  const upTri = (c: string): ViewStyle => ({
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: c,
  });
  const downTri = (c: string): ViewStyle => ({
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: c,
  });

  return (
    <View
      style={[{ height }, style]}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Floating price tooltip (crosshair) */}
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

      {/* Main price region (price line + axes overlays + markers) */}
      <View style={{ height: plotH, position: 'relative' }}>
        <Svg width="100%" height={plotH} viewBox={`0 0 ${W} ${plotH}`} preserveAspectRatio="none">
          {/* Horizontal Y gridlines */}
          {axesOn && yTicks.map((v, i) => (
            <Line key={`g${i}`} x1={0} y1={toY(v)} x2={W} y2={toY(v)} stroke={colors.hairline} strokeWidth="0.75" opacity="0.7" />
          ))}

          <Path d={mainPath} stroke={lineColor} strokeWidth="2" fill="none" />
          {!crosshairIdx && <Circle cx={last.x} cy={last.y} r="3.5" fill={lineColor} />}

          {showMA20 && <Path d={seriesPath(ma20, W, plotH, min, max)} stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.85" />}
          {showMA50 && <Path d={seriesPath(ma50, W, plotH, min, max)} stroke="#6366F1" strokeWidth="1.5" fill="none" opacity="0.85" />}

          {chX !== null && chY !== null && (
            <>
              <Line x1={chX} y1={0}      x2={chX} y2={plotH} stroke={colors.ink3} strokeWidth="0.75" strokeDasharray="4,3" />
              <Line x1={0}   y1={chY}    x2={W}   y2={chY}    stroke={colors.ink3} strokeWidth="0.75" strokeDasharray="4,3" />
              <Circle cx={chX} cy={chY} r="7" fill={lineColor} opacity="0.2" />
              <Circle cx={chX} cy={chY} r="3.5" fill={lineColor} />
            </>
          )}
        </Svg>

        {/* Y-axis price labels (overlaid on the right edge) */}
        {axesOn && yTicks.map((v, i) => {
          if (i === 1 && range / (max || 1) < 0.004) return null; // skip mid when flat
          const y = Math.max(0, Math.min(plotH - 11, toY(v) - 6));
          return (
            <Text
              key={`yl${i}`}
              style={{
                position: 'absolute', right: 2, top: y, zIndex: 2,
                fontSize: 9, color: colors.ink4, fontVariant: ['tabular-nums'],
              }}
            >
              {fmtAxisPrice(v)}
            </Text>
          );
        })}

        {/* Transparent crosshair touch overlay. Lives UNDER the marker Pressables
            (rendered before them) so a tap on a marker hits the Pressable, while
            a touch anywhere else drives the crosshair — putting the PanResponder
            on the parent container instead would swallow every marker tap. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} {...panResponder.panHandlers} />

        {/* Buy/sell triangle markers */}
        {markerData.map((m, i) => {
          const xPx = (m.idx / (closes.length - 1)) * containerWidth;
          const yPx = Math.max(7, Math.min(plotH - 7, toY(m.price)));
          const buy = m.side === 'buy';
          const col = buy ? colors.up : colors.down;
          return (
            <Pressable
              key={`m${i}`}
              onPress={() => setSelMarker(prev => (prev === i ? null : i))}
              hitSlop={8}
              style={{
                position: 'absolute',
                left: xPx - 6,
                top: buy ? yPx + 3 : yPx - 11,
                width: 12, height: 9, alignItems: 'center', justifyContent: 'center', zIndex: 6,
              }}
            >
              <View style={buy ? upTri(col) : downTri(col)} />
            </Pressable>
          );
        })}

        {/* Marker detail tooltip */}
        {selMarker !== null && markerData[selMarker] && (() => {
          const m = markerData[selMarker];
          const xPx = (m.idx / (closes.length - 1)) * containerWidth;
          const tipW = 150;
          const left = Math.max(4, Math.min(containerWidth - tipW - 4, xPx - tipW / 2));
          const buy = m.side === 'buy';
          return (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', left, top: 2, width: tipW, zIndex: 20,
                backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
              }}
            >
              <Text style={{ color: buy ? colors.up : colors.down, fontWeight: '800', fontSize: 11, letterSpacing: 0.4 }}>
                {buy ? 'BUY' : 'SELL'}{m.symbol ? ` · ${m.symbol}` : ''}
              </Text>
              <Text style={{ color: colors.surface, fontSize: 12, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
                {fmtUnits(m.units)} @ ${fmtMarkerPrice(m.price)}
              </Text>
              <Text style={{ color: colors.surface, opacity: 0.7, fontSize: 11, marginTop: 1, fontVariant: ['tabular-nums'] }}>
                ${fmtMarkerPrice(m.amount)} total
              </Text>
            </View>
          );
        })()}
      </View>

      {/* X-axis time labels */}
      {bottomGutter > 0 && timestamps && (
        <View style={{
          height: bottomGutter, flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', paddingHorizontal: 2,
        }}>
          <Text style={{ fontSize: 9, color: colors.ink4 }}>{fmtAxisTime(timestamps[0], xSpan)}</Text>
          <Text style={{ fontSize: 9, color: colors.ink4 }}>
            {fmtAxisTime(timestamps[Math.floor((timestamps.length - 1) / 2)], xSpan)}
          </Text>
          <Text style={{ fontSize: 9, color: colors.ink4 }}>Now</Text>
        </View>
      )}

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
