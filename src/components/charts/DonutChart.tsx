import React from 'react';
import { View } from 'react-native';
import { Text } from '../ui/Text';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

interface Segment {
  label: string;
  pct: number;   // 0–100
  color: string;
}

interface Props {
  segments: Segment[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export function DonutChart({ segments, size = 160, centerLabel, centerSub }: Props) {
  const { colors } = useTheme();
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const strokeWidth = size * 0.14;
  const gap = 2; // degrees between segments

  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  const normalized = total > 0 ? segments.map(s => ({ ...s, pct: (s.pct / total) * 100 })) : segments;

  let cursor = 0;
  const arcs = normalized.map(seg => {
    const span = (seg.pct / 100) * (360 - normalized.length * gap);
    const start = cursor + (normalized.indexOf(seg) * gap);
    const end = start + span;
    cursor += span;
    return { ...seg, start, end };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ position: 'relative', width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle cx={cx} cy={cy} r={r} stroke={colors.surface2} strokeWidth={strokeWidth} fill="none" />
          {/* Segments */}
          {arcs.map((arc, i) => (
            <Path
              key={i}
              d={describeArc(cx, cy, r, arc.start, arc.end)}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </Svg>
        {/* Center text */}
        {(centerLabel || centerSub) && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            {centerLabel && (
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                {centerLabel}
              </Text>
            )}
            {centerSub && (
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>{centerSub}</Text>
            )}
          </View>
        )}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' }}>
        {normalized.map((seg, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color }} />
            <Text style={{ fontSize: 11, color: colors.ink3 }}>
              {seg.label} {seg.pct.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
