import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, ViewStyle, PanResponder, Text } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

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

export function AreaChart({ height = 170, data, timeframe, baseValue, down = false, showDot = true, style, timestamps, crosshair, axes = false }: AreaChartProps) {
  const { colors } = useTheme();

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

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => crosshairEnabled,
    onMoveShouldSetPanResponder:  () => crosshairEnabled,
    onPanResponderGrant: (e) => {
      const x = e.nativeEvent.locationX - leftGutter;
      const ratio = Math.max(0, Math.min(1, x / plotWidthPx));
      setCrosshairIdx(Math.round(ratio * (chartData.length - 1)));
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.locationX - leftGutter;
      const ratio = Math.max(0, Math.min(1, x / plotWidthPx));
      setCrosshairIdx(Math.round(ratio * (chartData.length - 1)));
    },
    onPanResponderRelease: () => setCrosshairIdx(null),
    onPanResponderTerminate: () => setCrosshairIdx(null),
  }), [crosshairEnabled, plotWidthPx, leftGutter, chartData.length]);

  // Precompute layout helpers for crosshair + axis rendering (plot-region space)
  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;
  const yForValue = (v: number) => plotH - ((v - min) / range) * plotH * 0.85 - plotH * 0.075;
  const xForIdx = (i: number) => (i / (chartData.length - 1)) * 300;

  const hoverIdx = crosshairIdx;
  const hoverValue = hoverIdx !== null ? chartData[hoverIdx] : null;
  const hoverTs = (hoverIdx !== null && timestamps) ? timestamps[hoverIdx] : null;
  const showAxisLabels = axesOn && hoverIdx === null; // hide labels while inspecting

  return (
    <View
      style={[{ height }, style]}
      onLayout={e => setLayoutWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
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
    </View>
  );
}
