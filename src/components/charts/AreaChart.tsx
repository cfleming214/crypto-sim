import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, ViewStyle, PanResponder, Text, Pressable } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import type { ChartMarker } from './CandleChart';

interface AreaChartProps {
  height?: number;
  data?: number[];
  timeframe?: string;
  baseValue?: number;
  down?: boolean;
  showDot?: boolean;
  style?: ViewStyle;
  timestamps?: number[];   // optional ms-epoch per data point — enables date in crosshair tooltip
  crosshair?: boolean;     // enable touch-driven inspection (default true when data supplied)
  axes?: boolean;          // render $ (Y) + time (X) labels in gutters (default false)
  markers?: ChartMarker[]; // buy/sell trades pinned on the curve as up/down triangles
  // Tap handler for a marker. Receives ALL trades that fall in that marker's
  // time bucket (markers snapped to the same curve point are grouped into one).
  // When provided, the inline tooltip is suppressed in favour of this callback
  // (the host shows its own full-detail popup).
  onMarkerGroupPress?: (markers: ChartMarker[]) => void;
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
    const trend = progress * (endValue - startValue);
    const noise = (
      Math.sin((i + seed) * 1.7) * 0.6 +
      Math.sin((i + seed) * 0.4) * 0.3 +
      Math.cos((i + seed) * 3.1) * 0.1
    ) * volatility * endValue;

    v = startValue + trend + noise;
    v = Math.max(v, endValue * 0.3);
    data.push(v);
  }

  data[data.length - 1] = endValue;
  return data;
}

function formatTooltipTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const ageMs = now - ts;
  // < 24h: show time only; otherwise date
  if (ageMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' +
         d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Compact label for the X axis: time-of-day for short spans, date for long ones.
function formatAxisTime(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Compact dollar label for the Y axis (e.g. $10.4k, or $842 for small values).
function formatAxisMoney(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtMarkerPrice(v: number): string {
  return v < 0.01
    ? v.toFixed(8)
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMarkerUnits(u: number): string {
  if (u >= 1000) return u.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (u >= 1)    return u.toFixed(2);
  return u.toFixed(4);
}

export function AreaChart({ height = 170, data, timeframe, baseValue, down = false, showDot = true, style, timestamps, crosshair, axes = false, markers, onMarkerGroupPress }: AreaChartProps) {
  const { colors } = useTheme();
  const [selGroup, setSelGroup] = useState<number | null>(null);

  const baseValueRef = useRef(baseValue ?? 10847);
  useEffect(() => {
    if (baseValue !== undefined) baseValueRef.current = baseValue;
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(() => {
    if (data) return data;
    return generateData(timeframe ?? '7D', baseValueRef.current);
  }, [timeframe, data]);

  const color = down ? colors.down : colors.up;
  const crosshairEnabled = crosshair !== false && !!data && chartData.length >= 2;

  // Real on-screen width of the chart, captured via onLayout. Touch x is in this
  // coordinate space; the SVG viewBox is fixed at 0..300 with
  // preserveAspectRatio="none", so we just scale.
  const [layoutWidth, setLayoutWidth] = useState(300);
  const [plotPx, setPlotPx] = useState(0); // real px width of the touch overlay
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);

  // Axis gutters. When `axes` is on we inset the plot: a left gutter holds the
  // $ (Y) labels and a bottom gutter holds the time (X) labels. The line + all
  // SVG coords are computed against the inset plot region (plotH tall, starting
  // at leftGutter px from the left).
  const axesOn = axes && !!data && chartData.length >= 2;
  const leftGutter = axesOn ? 40 : 0;
  const bottomGutter = axesOn ? 16 : 0;
  const plotH = height - bottomGutter;
  const plotWidthPx = Math.max(1, layoutWidth - leftGutter);

  const panResponder = useMemo(() => {
    // The pan handlers live on a transparent overlay (a plain View covering the
    // plot region), so locationX is real pixels relative to the plot — it maps
    // directly to the plot width. (Reading locationX off the SVG instead returns
    // viewBox units (0..300), which made the crosshair only track the left third
    // on wide screens.)
    const setFromTouch = (e: { nativeEvent: { locationX: number } }) => {
      const w = plotPx || plotWidthPx;
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
      setCrosshairIdx(Math.round(ratio * (chartData.length - 1)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => crosshairEnabled,
      onMoveShouldSetPanResponder:  () => crosshairEnabled,
      onPanResponderGrant: setFromTouch,
      onPanResponderMove: setFromTouch,
      onPanResponderRelease: () => setCrosshairIdx(null),
      onPanResponderTerminate: () => setCrosshairIdx(null),
    });
  }, [crosshairEnabled, plotPx, plotWidthPx, chartData.length]);

  // Precompute layout helpers for crosshair + axis rendering (plot-region space)
  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;
  const yForValue = (v: number) => plotH - ((v - min) / range) * plotH * 0.85 - plotH * 0.075;
  const xForIdx = (i: number) => (i / (chartData.length - 1)) * 300;

  // Map buy/sell markers to the nearest point on the equity curve by timestamp.
  const markerData = useMemo(() => {
    if (!markers || !markers.length || !timestamps || timestamps.length < 2) return [];
    const t0 = timestamps[0];
    const tN = timestamps[timestamps.length - 1];
    const tol = (tN - t0) / timestamps.length;
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
  }, [markers, timestamps, chartData.length]);

  // Group markers that snap to the same curve point into one bucket — i.e. all
  // trades that happened within that slice of time share a single marker. The
  // tap target reveals every trade in the bucket. Sorted by time within each.
  const markerGroups = useMemo(() => {
    const byIdx = new Map<number, typeof markerData>();
    for (const m of markerData) {
      const arr = byIdx.get(m.idx);
      if (arr) arr.push(m);
      else byIdx.set(m.idx, [m]);
    }
    return [...byIdx.entries()]
      .map(([idx, ms]) => ({ idx, markers: [...ms].sort((a, b) => a.timestamp - b.timestamp) }))
      .sort((a, b) => a.idx - b.idx);
  }, [markerData]);

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

  const hoverIdx = crosshairIdx;
  const hoverValue = hoverIdx !== null ? chartData[hoverIdx] : null;
  const hoverTs = (hoverIdx !== null && timestamps) ? timestamps[hoverIdx] : null;
  const showAxisLabels = axesOn && hoverIdx === null; // hide labels while inspecting

  return (
    <View
      style={[{ height }, style]}
      onLayout={e => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      {/* Y-axis $ labels in the left gutter */}
      {showAxisLabels && [max, (max + min) / 2, min].map((v, i) => {
        const y = Math.max(0, Math.min(plotH - 12, yForValue(v) - 6));
        // Skip the midpoint when the series is essentially flat (avoids three
        // identical labels stacked on top of each other).
        if (i === 1 && (max - min) / (max || 1) < 0.004) return null;
        return (
          <Text
            key={i}
            style={{
              position: 'absolute', left: 0, top: y, width: leftGutter - 4,
              textAlign: 'right', fontSize: 9, color: colors.ink4, fontVariant: ['tabular-nums'],
            }}
          >
            {formatAxisMoney(v)}
          </Text>
        );
      })}

      {/* Plot region (inset by the gutters) */}
      <View style={{ position: 'absolute', left: leftGutter, right: 0, top: 0, height: plotH }}>
        <Svg width="100%" height={plotH} viewBox={`0 0 300 ${plotH}`} preserveAspectRatio="none">
          <Path d={generatePath(chartData, 300, plotH, false)} stroke={color} strokeWidth="2" fill="none" />
          {showDot && hoverIdx === null && (() => {
            const last = chartData[chartData.length - 1];
            return <Circle cx="300" cy={yForValue(last)} r="3.5" fill={color} />;
          })()}
          {hoverIdx !== null && hoverValue !== null && (
            <>
              <Line
                x1={xForIdx(hoverIdx)} y1={0}
                x2={xForIdx(hoverIdx)} y2={plotH}
                stroke={colors.ink3}
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <Circle cx={xForIdx(hoverIdx)} cy={yForValue(hoverValue)} r="4.5" fill={color} stroke={colors.surface} strokeWidth="2" />
            </>
          )}
        </Svg>
      </View>

      {/* X-axis time labels in the bottom gutter */}
      {showAxisLabels && timestamps && timestamps.length >= 2 && (() => {
        const first = timestamps[0];
        const last = timestamps[timestamps.length - 1];
        const span = last - first;
        const mid = timestamps[Math.floor((timestamps.length - 1) / 2)];
        const lbl = { fontSize: 9, color: colors.ink4 } as const;
        return (
          <View style={{
            position: 'absolute', left: leftGutter, right: 4, top: plotH, height: bottomGutter,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Text style={lbl}>{formatAxisTime(first, span)}</Text>
            <Text style={lbl}>{formatAxisTime(mid, span)}</Text>
            <Text style={lbl}>Now</Text>
          </View>
        );
      })()}

      {/* Crosshair tooltip rendered above the chart in real pixel coords */}
      {hoverIdx !== null && hoverValue !== null && (() => {
        const tooltipX = leftGutter + (hoverIdx / Math.max(1, chartData.length - 1)) * plotWidthPx;
        // Keep tooltip within bounds — 140px wide approx
        const left = Math.max(4, Math.min(layoutWidth - 140, tooltipX - 70));
        return (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 6,
              left,
              backgroundColor: colors.ink,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              minWidth: 90,
            }}
          >
            <Text style={{ color: colors.brandOn, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              ${hoverValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            {hoverTs !== null && (
              <Text style={{ color: `${colors.brandOn}99`, fontSize: 10, marginTop: 1 }}>
                {formatTooltipTime(hoverTs)}
              </Text>
            )}
          </View>
        );
      })()}

      {/* Transparent touch overlay covering the plot region. A plain View (no SVG
          viewBox) so locationX is in real pixels relative to the plot width —
          this is what makes the crosshair track the full width, not just the
          left third on wide screens. */}
      {crosshairEnabled && (
        <View
          style={{ position: 'absolute', left: leftGutter, right: 0, top: 0, height: plotH }}
          onLayout={e => setPlotPx(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        />
      )}

      {/* Buy/sell markers, anchored to the equity curve and grouped by time
          bucket. A single-trade bucket is a triangle (buy ▲ / sell ▼); a
          multi-trade bucket is a plain dot (the transaction count lives in the
          tap popup, not on the icon). Above the touch overlay so taps hit it. */}
      {markerGroups.map((g, i) => {
        const xPx = leftGutter + (g.idx / Math.max(1, chartData.length - 1)) * plotWidthPx;
        const yPx = Math.max(7, Math.min(plotH - 7, yForValue(chartData[g.idx])));
        const allBuy = g.markers.every(m => m.side === 'buy');
        const allSell = g.markers.every(m => m.side === 'sell');
        // Mixed buckets use the brand colour; single-side buckets keep up/down.
        const col = allBuy ? colors.up : allSell ? colors.down : colors.brand;
        const onPress = () => {
          if (onMarkerGroupPress) onMarkerGroupPress(g.markers);
          else setSelGroup(prev => (prev === i ? null : i));
        };
        const multi = g.markers.length > 1;
        return (
          <Pressable
            key={`g${i}`}
            onPress={onPress}
            hitSlop={8}
            style={{
              position: 'absolute',
              left: xPx - (multi ? 5.5 : 6),
              top: multi ? yPx - 5.5 : (allBuy ? yPx + 3 : yPx - 11),
              alignItems: 'center', justifyContent: 'center', zIndex: 6,
            }}
          >
            {multi ? (
              <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: col, borderWidth: 1.5, borderColor: colors.surface }} />
            ) : (
              <View style={{ width: 12, height: 9, alignItems: 'center', justifyContent: 'center' }}>
                <View style={allBuy ? upTri(col) : downTri(col)} />
              </View>
            )}
          </Pressable>
        );
      })}

      {/* Inline fallback tooltip — only used when no onMarkerGroupPress host is
          wired (the portfolio chart shows its own full-detail popup instead). */}
      {!onMarkerGroupPress && selGroup !== null && markerGroups[selGroup] && (() => {
        const g = markerGroups[selGroup];
        const m = g.markers[0];
        const xPx = leftGutter + (g.idx / Math.max(1, chartData.length - 1)) * plotWidthPx;
        const tipW = 150;
        const left = Math.max(4, Math.min(layoutWidth - tipW - 4, xPx - tipW / 2));
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
              {buy ? 'BUY' : 'SELL'}{m.symbol ? ` · ${m.symbol}` : ''}{g.markers.length > 1 ? ` +${g.markers.length - 1}` : ''}
            </Text>
            <Text style={{ color: colors.brandOn, fontSize: 12, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
              {fmtMarkerUnits(m.units)} @ ${fmtMarkerPrice(m.price)}
            </Text>
            <Text style={{ color: `${colors.brandOn}B0`, fontSize: 11, marginTop: 1, fontVariant: ['tabular-nums'] }}>
              ${fmtMarkerPrice(m.amount)} total
            </Text>
          </View>
        );
      })()}
    </View>
  );
}
