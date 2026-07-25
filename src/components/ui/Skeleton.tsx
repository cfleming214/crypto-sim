import React, { useEffect } from 'react';
import { Animated, Easing, View, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// One shared pulse for every skeleton on screen.
//
// Each block owning its own Animated.Value looks wrong: they start at whatever
// moment their row mounted and drift out of phase, so the page shimmers like TV
// static instead of breathing. A single module-level driver keeps every block in
// lockstep. Refcounted so the loop only runs while skeletons are actually
// mounted — a forever-looping animation would otherwise keep the JS/UI thread
// bridge warm for the life of the app.
// ---------------------------------------------------------------------------
const pulse = new Animated.Value(0);
let loop: Animated.CompositeAnimation | null = null;
let mounted = 0;

function acquirePulse() {
  mounted += 1;
  if (loop) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]),
  );
  loop.start();
}

function releasePulse() {
  mounted -= 1;
  if (mounted > 0) return;
  loop?.stop();
  loop = null;
  pulse.setValue(0);
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Corner radius. Defaults to a small rounded rect; pass `radius.pill` for chips. */
  br?: number;
  style?: StyleProp<ViewStyle>;
}

// A single placeholder block. Opacity-only pulse (native-driven), so it costs
// nothing on the JS thread and never triggers layout.
export function Skeleton({ width = '100%', height = 12, br = 6, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    acquirePulse();
    return releasePulse;
  }, [reduced]);

  // Reduce Motion keeps the placeholder — losing it would hide that the page is
  // still loading — but holds it at a steady mid opacity instead of pulsing.
  const opacity = reduced
    ? 0.6
    : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: br, backgroundColor: colors.surface2, opacity },
        style,
      ]}
    />
  );
}

// A run of text lines. The last line is short, the way a real wrapped paragraph
// ends — a full-width final line reads as a table, not prose.
export function SkeletonText({
  lines = 2,
  height = 12,
  gap = 8,
  lastLineWidth = '60%',
  style,
}: {
  lines?: number;
  height?: number;
  gap?: number;
  lastLineWidth?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'} />
      ))}
    </View>
  );
}

export function SkeletonCircle({ size = 36, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={size} height={size} br={size / 2} style={style} />;
}

// Avatar + two stacked lines + an optional trailing value. The shape almost every
// list row in the app resolves to (leaderboards, payouts, holdings, traders).
export function SkeletonRow({
  avatar = true,
  avatarSize = 36,
  trailing = true,
  style,
}: {
  avatar?: boolean;
  avatarSize?: number;
  trailing?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>
      {avatar && <SkeletonCircle size={avatarSize} />}
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton height={12} width="55%" />
        <Skeleton height={10} width="35%" />
      </View>
      {trailing && (
        <View style={{ alignItems: 'flex-end', gap: 7 }}>
          <Skeleton height={12} width={54} />
          <Skeleton height={10} width={36} />
        </View>
      )}
    </View>
  );
}

// A card-shaped placeholder that matches the real Card's chrome (border +
// radius), so the swap to loaded content doesn't shift the page.
export function SkeletonCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
