import React, { useMemo, useState } from 'react';
import { View, ViewStyle, PanResponder, Pressable } from 'react-native';
import { Text } from '../ui/Text';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import type { ChartMarker } from './CandleChart';

interface AreaChartProps {
  height?: number;
  data?: number[];
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

// `xFrac[i]` is where point i sits along the axis, 0..1. Callers derive it from
// TIMESTAMPS where they have them, so an unevenly-sampled series is drawn to
// scale. Index spacing is the fallback for synthetic data with no timestamps.
function generatePath(data: number[], xFrac: number[], w: number, h: number, closed = false): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (xFrac[i] ?? i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h * 0.85 - h * 0.075,
  }));
  // The vertical band every data point maps into: max -> yTop, min -> yBottom.
  const yTop = h * 0.075;
  const yBottom = h - h * 0.075;

  // Catmull-Rom spline → cubic beziers: a smooth curve through every point whose
  // tangents come from the NEIGHBORING points. The old scheme used horizontal
  // tangents at each point (cp1y = prevY, cp2y = curY), which flattened the line
  // at every vertex and rendered dense intraday data (60 one-min points) as a
  // staircase. Neighbor-based tangents give a natural flowing line instead.
  //
  // CENTRIPETAL parameterization (alpha = 0.5), not uniform. Uniform tangents —
  // (p2 - p0) / 6 — assume every point is evenly spaced along x. That held while
  // points were positioned by index, but they're positioned by TIMESTAMP now, so
  // a dense cluster of live captures followed by a wide gap makes p3 far away
  // and drives cp2x left of p1.x. The curve then doubles back on itself: the
  // line visibly reverses and hooks, which is what this looked like on the Live
  // window. Centripetal parameterization scales each tangent by the actual
  // distance between knots and is provably free of cusps and self-intersections
  // on non-uniform data.
  const dist = (a: typeof points[0], b: typeof points[0]) => Math.hypot(b.x - a.x, b.y - a.y);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    // sqrt of chord length = alpha 0.5. Floored so coincident points (a repeated
    // timestamp, or a perfectly flat run) can't divide by zero.
    const t01 = Math.sqrt(dist(p0, p1)) || 1e-6;
    const t12 = Math.sqrt(dist(p1, p2)) || 1e-6;
    const t23 = Math.sqrt(dist(p2, p3)) || 1e-6;
    const m1x = (p2.x - p1.x) + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12));
    const m1y = (p2.y - p1.y) + t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12));
    const m2x = (p2.x - p1.x) + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23));
    const m2y = (p2.y - p1.y) + t12 * ((p3.y - p2.y) / t23 - (p3.y - p1.y) / (t12 + t23));
    // Hold both control points inside the segment's x span. The input x values
    // only ever increase, so a cubic whose control x values stay within
    // [p1.x, p2.x] cannot move backwards — the reversal is impossible by
    // construction, not merely unlikely.
    const clampX = (v: number) => Math.min(p2.x, Math.max(p1.x, v));
    // And hold control Y inside the band the data itself maps into. A cubic is
    // contained by the convex hull of its control points, so with all four
    // inside the band the whole curve is too. Without this the spline could
    // overshoot vertically past a sharp turn and dip BELOW the plot, drawing
    // over the X-axis labels. Clamping to the band rather than to each segment's
    // own [p1.y, p2.y] keeps the curve smooth through peaks — it only stops it
    // leaving the chart.
    const clampY = (v: number) => Math.min(yBottom, Math.max(yTop, v));
    const cp1x = clampX(p1.x + m1x / 3);
    const cp1y = clampY(p1.y + m1y / 3);
    const cp2x = clampX(p2.x - m2x / 3);
    const cp2y = clampY(p2.y - m2y / 3);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  if (closed) {
    d += ` L ${points[points.length - 1].x} ${h} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
  }

  return d;
}

// Shape parameters for the decorative placeholder curve below. This used to be a
// table keyed by timeframe, but no caller has ever passed `timeframe` — the two
// remaining data-less callers (a lesson illustration and a walkthrough slide)
// take the default — so every other row was unreachable.
const PLACEHOLDER_BASE = 10847;
const PLACEHOLDER = { points: 56, volatility: 0.010, drawdown: 0.07 };

// Decorative placeholder curve for the two callers that render a chart with no
// data at all. Deterministic, so it doesn't reshuffle on every render.
function generateData(endValue: number): number[] {
  const { points, volatility, drawdown } = PLACEHOLDER;
  const seed = 7;

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

export function AreaChart({ height = 170, data, down = false, showDot = true, style, timestamps, crosshair, axes = false, markers, onMarkerGroupPress }: AreaChartProps) {
  const { colors } = useTheme();
  const [selGroup, setSelGroup] = useState<number | null>(null);

  const chartData = useMemo(() => data ?? generateData(PLACEHOLDER_BASE), [data]);

  const color = down ? colors.down : colors.up;
  const crosshairEnabled = crosshair !== false && !!data && chartData.length >= 2;

  // Real on-screen width of the chart, captured via onLayout. Touch x is in this
  // coordinate space; the SVG viewBox is fixed at 0..300 with
  // preserveAspectRatio="none", so we just scale.
  const [layoutWidth, setLayoutWidth] = useState(300);
  const [plotPx, setPlotPx] = useState(0); // real px width of the touch overlay
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);
  // Two-finger range selection: the two touched curve indices. When set, we show
  // the Δ price/percent between them and a connecting line (green up / red down).
  const [rangeSel, setRangeSel] = useState<{ a: number; b: number } | null>(null);

  // Axis gutters. When `axes` is on we inset the plot: a left gutter holds the
  // $ (Y) labels and a bottom gutter holds the time (X) labels. The line + all
  // SVG coords are computed against the inset plot region (plotH tall, starting
  // at leftGutter px from the left).
  const axesOn = axes && !!data && chartData.length >= 2;
  // Size the Y gutter to the widest label it actually has to hold rather than a
  // fixed 40. The old 36pt text box (40 − 4) couldn't fit "$100.0k" — the value
  // every account starts at — and with no numberOfLines the label wrapped onto a
  // second line instead of shrinking. AXIS_CHAR_W is the advance of one glyph at
  // fontSize 9 with tabular numerals, which makes every digit the same width.
  const AXIS_CHAR_W = 5.4;
  const yTickValues = React.useMemo(() => {
    if (!axesOn) return [] as number[];
    const lo = Math.min(...chartData);
    const hi = Math.max(...chartData);
    return [hi, (hi + lo) / 2, lo];
  }, [axesOn, chartData]);
  const yLabelChars = yTickValues.length
    ? Math.max(...yTickValues.map(v => formatAxisMoney(v).length))
    : 0;
  // +14 leaves a little air on the left and an 8pt gap before the plot starts.
  const leftGutter = axesOn ? Math.max(40, Math.ceil(yLabelChars * AXIS_CHAR_W) + 14) : 0;
  const bottomGutter = axesOn ? 16 : 0;
  const plotH = height - bottomGutter;
  // Right inset. The curve's last point sits at the very end of the viewBox and
  // carries a filled dot, so with the plot flush to the container the line and
  // dot were clipped against the screen edge. Reserve enough for the dot plus
  // its stroke. The X-axis label row already inset itself by 4 for the same
  // reason, which is why "Now" cleared the edge while the line did not.
  const rightGutter = axesOn ? 10 : 0;
  const plotWidthPx = Math.max(1, layoutWidth - leftGutter - rightGutter);

  // Horizontal position of each point as a 0..1 fraction, derived from its
  // TIMESTAMP rather than its index.
  //
  // The series is deliberately not evenly sampled: equitySnapshots captures
  // every 4s while foregrounded, backfillGap fills a closed gap with hourly
  // points plus a 5-minute tail for the last 3h, and downsample() keeps full
  // resolution for 3h, 2-min to 24h, hourly to 30d and daily beyond. Spacing by
  // index therefore stretched whichever region happened to hold the most points
  // — after a day offline, the recent 3 hours took two thirds of a 24H chart and
  // read as a flat plateau, while 18 real hours were squeezed into the rest.
  const xFrac = useMemo(() => {
    const n = chartData.length;
    if (n <= 1) return [0];
    const byIndex = () => chartData.map((_, i) => i / (n - 1));
    if (!timestamps || timestamps.length !== n) return byIndex();
    const t0 = timestamps[0];
    const span = timestamps[n - 1] - t0;
    if (!(span > 0)) return byIndex();   // all same instant / bad clock
    return timestamps.map(t => Math.min(1, Math.max(0, (t - t0) / span)));
  }, [chartData, timestamps]);

  const panResponder = useMemo(() => {
    // The pan handlers live on a transparent overlay (a plain View covering the
    // plot region), so locationX is real pixels relative to the plot — it maps
    // directly to the plot width. (Reading locationX off the SVG instead returns
    // viewBox units (0..300), which made the crosshair only track the left third
    // on wide screens.)
    // Inverse of xFrac: touch position → nearest point. This has to search the
    // positions rather than scale the index, or the crosshair lands on the wrong
    // reading wherever the series is unevenly sampled — the same distortion that
    // made offline gaps render as plateaus.
    const idxFor = (x: number) => {
      const w = plotPx || plotWidthPx;
      const f = Math.max(0, Math.min(1, x / w));
      let lo = 0, hi = xFrac.length - 1;
      while (lo < hi) {                      // xFrac is ascending
        const mid = (lo + hi) >> 1;
        if (xFrac[mid] < f) lo = mid + 1; else hi = mid;
      }
      // Snap to whichever neighbour is actually closer.
      if (lo > 0 && Math.abs(xFrac[lo - 1] - f) <= Math.abs(xFrac[lo] - f)) return lo - 1;
      return lo;
    };
    // One finger → crosshair (single point). Two fingers → range selection
    // (Δ between the two touched points). nativeEvent.touches holds every active
    // touch on the overlay, so we read both when present.
    const setFromTouch = (e: any) => {
      const touches = e.nativeEvent.touches ?? [];
      if (touches.length >= 2) {
        setRangeSel({ a: idxFor(touches[0].locationX), b: idxFor(touches[1].locationX) });
        setCrosshairIdx(null);
      } else {
        setCrosshairIdx(idxFor(e.nativeEvent.locationX));
        setRangeSel(null);
      }
    };
    const clear = () => { setCrosshairIdx(null); setRangeSel(null); };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => crosshairEnabled,
      onMoveShouldSetPanResponder:  () => crosshairEnabled,
      onPanResponderGrant: setFromTouch,
      onPanResponderMove: setFromTouch,
      onPanResponderRelease: clear,
      onPanResponderTerminate: clear,
    });
  }, [crosshairEnabled, plotPx, plotWidthPx, chartData.length, xFrac]);

  // Precompute layout helpers for crosshair + axis rendering (plot-region space)
  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;
  const yForValue = (v: number) => plotH - ((v - min) / range) * plotH * 0.85 - plotH * 0.075;
  const xForIdx = (i: number) => (xFrac[i] ?? 0) * 300;

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
  const showAxisLabels = axesOn && hoverIdx === null && rangeSel === null; // hide labels while inspecting

  // Two-finger range: low/high are the EARLIER/LATER touched points in time
  // (data is oldest→newest left→right), so the diff reads as the change over the
  // span. Positive (later ≥ earlier) → green; negative → red.
  const rangeLo = rangeSel ? Math.min(rangeSel.a, rangeSel.b) : null;
  const rangeHi = rangeSel ? Math.max(rangeSel.a, rangeSel.b) : null;
  const rangeVLo = rangeLo !== null ? chartData[rangeLo] : null;
  const rangeVHi = rangeHi !== null ? chartData[rangeHi] : null;
  const rangeDiff = (rangeVLo !== null && rangeVHi !== null) ? rangeVHi - rangeVLo : 0;
  const rangePct = rangeVLo ? (rangeDiff / rangeVLo) * 100 : 0;
  const rangePositive = rangeDiff >= 0;
  const rangeColor = rangePositive ? colors.up : colors.down;

  return (
    <View
      style={[{ height }, style]}
      onLayout={e => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      {/* Y-axis $ labels in the left gutter */}
      {showAxisLabels && yTickValues.map((v, i) => {
        const y = Math.max(0, Math.min(plotH - 12, yForValue(v) - 6));
        // Skip the midpoint when the series is essentially flat (avoids three
        // identical labels stacked on top of each other).
        if (i === 1 && (max - min) / (max || 1) < 0.004) return null;
        return (
          <Text
            key={i}
            numberOfLines={1}
            style={{
              // Right-aligned in a box that ends 8pt short of the plot, so the
              // label reads against the axis without touching either the
              // container edge or the curve.
              position: 'absolute', left: 0, top: y, width: leftGutter - 8,
              textAlign: 'right', fontSize: 9, color: colors.ink4, fontVariant: ['tabular-nums'],
            }}
          >
            {formatAxisMoney(v)}
          </Text>
        );
      })}

      {/* Plot region (inset by the gutters) */}
      <View style={{ position: 'absolute', left: leftGutter, right: rightGutter, top: 0, height: plotH }}>
        <Svg width="100%" height={plotH} viewBox={`0 0 300 ${plotH}`} preserveAspectRatio="none">
          <Path d={generatePath(chartData, xFrac, 300, plotH, false)} stroke={color} strokeWidth="2" fill="none" />
          {showDot && hoverIdx === null && rangeSel === null && (() => {
            const last = chartData[chartData.length - 1];
            return <Circle cx="300" cy={yForValue(last)} r="3.5" fill={color} />;
          })()}
          {/* Two-finger range: vertical guides at each touched point, a connecting
              line coloured by direction (green up / red down), and an endpoint dot
              on each. */}
          {rangeLo !== null && rangeHi !== null && rangeVLo !== null && rangeVHi !== null && (
            <>
              <Line x1={xForIdx(rangeLo)} y1={0} x2={xForIdx(rangeLo)} y2={plotH} stroke={colors.ink3} strokeWidth="1" strokeDasharray="3,3" />
              <Line x1={xForIdx(rangeHi)} y1={0} x2={xForIdx(rangeHi)} y2={plotH} stroke={colors.ink3} strokeWidth="1" strokeDasharray="3,3" />
              <Line x1={xForIdx(rangeLo)} y1={yForValue(rangeVLo)} x2={xForIdx(rangeHi)} y2={yForValue(rangeVHi)} stroke={rangeColor} strokeWidth="2.5" />
              <Circle cx={xForIdx(rangeLo)} cy={yForValue(rangeVLo)} r="4.5" fill={rangeColor} stroke={colors.surface} strokeWidth="2" />
              <Circle cx={xForIdx(rangeHi)} cy={yForValue(rangeVHi)} r="4.5" fill={rangeColor} stroke={colors.surface} strokeWidth="2" />
            </>
          )}
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
        // Midpoint of the time span, not the middle index — with points spaced
        // by time, the middle index is not the middle of the axis.
        const mid = first + span / 2;
        const lbl = { fontSize: 9, color: colors.ink4 } as const;
        return (
          <View style={{
            position: 'absolute', left: leftGutter, right: rightGutter, top: plotH, height: bottomGutter,
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
        const tooltipX = leftGutter + (xFrac[hoverIdx] ?? 0) * plotWidthPx;
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

      {/* Two-finger range tooltip — Δ price + Δ percent, coloured by direction.
          Centered between the two touched points. */}
      {rangeLo !== null && rangeHi !== null && (() => {
        const midIdx = (rangeLo + rangeHi) / 2;
        const cx = leftGutter + (xFrac[Math.round(midIdx)] ?? 0) * plotWidthPx;
        const tipW = 150;
        const left = Math.max(4, Math.min(layoutWidth - tipW - 4, cx - tipW / 2));
        const sign = rangePositive ? '+' : '−';
        return (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 6, left, width: tipW,
              backgroundColor: colors.ink, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
            }}
          >
            <Text style={{ color: rangeColor, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {sign}${Math.abs(rangeDiff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={{ color: rangeColor, fontSize: 12, fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] }}>
              {sign}{Math.abs(rangePct).toFixed(2)}%
            </Text>
          </View>
        );
      })()}

      {/* Transparent touch overlay covering the plot region. A plain View (no SVG
          viewBox) so locationX is in real pixels relative to the plot width —
          this is what makes the crosshair track the full width, not just the
          left third on wide screens. */}
      {crosshairEnabled && (
        <View
          style={{ position: 'absolute', left: leftGutter, right: rightGutter, top: 0, height: plotH }}
          onLayout={e => setPlotPx(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        />
      )}

      {/* Buy/sell markers, anchored to the equity curve and grouped by time
          bucket. A single-trade bucket is a triangle (buy ▲ / sell ▼); a
          multi-trade bucket is a plain dot (the transaction count lives in the
          tap popup, not on the icon). Above the touch overlay so taps hit it. */}
      {markerGroups.map((g, i) => {
        const xPx = leftGutter + (xFrac[g.idx] ?? 0) * plotWidthPx;
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
        const xPx = leftGutter + (xFrac[g.idx] ?? 0) * plotWidthPx;
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
