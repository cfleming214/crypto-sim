import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from './ui/Text';
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop, Path, Circle, G,
} from 'react-native-svg';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Animated splash, pure JS so it ships over OTA. Three layers, back to front:
//   1. A stock line that draws itself from the bottom-left up to the top-right
//      (value rising), with a soft area fill and a glowing leading dot.
//   2. The bare CryptoComp glyph (no rounded-square backdrop) fading + scaling in.
//   3. The "CryptoComp" wordmark sliding up into place beneath the glyph.
// Shown by RootNavigator on cold start while the session check resolves.

const BG = '#0A0A0B';        // dark theme backdrop
const GREEN = '#2BF06A';     // brand neon green
const GREEN_HI = '#86FFCB';  // light end of the glyph gradient
const TEXT = '#F5F4EF';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 85-point upward stock with natural pullbacks and volatility clustering.
// Rendered with cubic bezier curves (same as the app's AreaChart).
const VALUES = [
  0.060,0.071,0.082,0.090,0.097,0.100,0.104,0.108,0.118,0.107,
  0.093,0.085,0.077,0.069,0.078,0.084,0.089,0.100,0.112,0.118,
  0.129,0.141,0.153,0.162,0.152,0.145,0.136,0.131,0.142,0.155,
  0.167,0.174,0.182,0.198,0.210,0.218,0.228,0.239,0.251,0.262,
  0.248,0.243,0.232,0.230,0.215,0.235,0.244,0.262,0.280,0.292,
  0.302,0.315,0.334,0.353,0.373,0.367,0.363,0.349,0.344,0.369,
  0.384,0.409,0.428,0.451,0.477,0.492,0.524,0.560,0.592,0.614,
  0.653,0.692,0.730,0.719,0.694,0.667,0.653,0.699,0.717,0.755,
  0.803,0.833,0.888,0.945,1.000,
];

function buildChart(W: number, H: number) {
  const n = VALUES.length;
  const min = Math.min(...VALUES);
  const max = Math.max(...VALUES);
  const range = max - min || 1;
  const pts = VALUES.map((v, i) => ({
    x: (i / (n - 1)) * W,
    y: H - ((v - min) / range) * H * 0.85 - H * 0.075,
  }));
  // Cubic bezier — same as app's AreaChart / Sparkline
  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * 0.5;
    line += ` C ${cpx.toFixed(1)} ${pts[i - 1].y.toFixed(1)}, ${cpx.toFixed(1)} ${pts[i].y.toFixed(1)}, ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const area = `${line} L ${last.x.toFixed(1)} ${H} L 0 ${H} Z`;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return { line, area, len: len * 1.05, end: [last.x, last.y] as [number, number] };
}

// The interlocking-C glyph, stroked straight from the brand SVG — no backdrop.
function Glyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="cc_g" x1="0.12" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor={GREEN_HI} />
          <Stop offset="0.45" stopColor={GREEN} />
          <Stop offset="1" stopColor="#11D156" />
        </LinearGradient>
        <LinearGradient id="cc_sheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <Stop offset="0.4" stopColor="#ffffff" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <G transform="translate(60 60) scale(0.84) translate(-54 -64)">
        <Path d="M72 30 H14 V70 a6 6 0 0 0 6 6 H68" fill="none" stroke="url(#cc_g)" strokeWidth={17.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} />
        <Path d="M72 30 H14 V70 a6 6 0 0 0 6 6 H68" fill="none" stroke="url(#cc_sheen)" strokeWidth={17.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} opacity={0.6} />
        <Path d="M72 30 H14 V70 a6 6 0 0 0 6 6 H68" fill="none" stroke={BG} strokeWidth={13.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} />
        <Path d="M38 52 H94 V92 a6 6 0 0 1 -6 6 H40" fill="none" stroke="url(#cc_g)" strokeWidth={17.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} />
        <Path d="M38 52 H94 V92 a6 6 0 0 1 -6 6 H40" fill="none" stroke="url(#cc_sheen)" strokeWidth={17.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} opacity={0.6} />
        <Path d="M38 52 H94 V92 a6 6 0 0 1 -6 6 H40" fill="none" stroke={BG} strokeWidth={13.5} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit={8} />
      </G>
    </Svg>
  );
}

export function SplashLogo() {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const chart = useMemo(() => buildChart(W, H), [W, H]);

  const draw = useRef(new Animated.Value(0)).current;   // 0→1 line draw + area + dot (JS-driven SVG props)
  const enter = useRef(new Animated.Value(0)).current;  // glyph fade + scale (native)
  const word = useRef(new Animated.Value(0)).current;   // wordmark rise + fade (native)
  const pulse = useRef(new Animated.Value(0)).current;  // gentle breathing loop (native)

  const LOGO = Math.min(132, W * 0.32);

  useEffect(() => {
    if (reduced) {
      draw.setValue(1); enter.setValue(1); word.setValue(1);
      return;
    }
    Animated.timing(draw, {
      toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    Animated.sequence([
      Animated.delay(220),
      Animated.timing(enter, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(620),
      Animated.timing(word, { toValue: 1, duration: 540, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [draw, enter, word, pulse, reduced]);

  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [chart.len, 0] });
  const areaOpacity = draw.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const dotOpacity = draw.interpolate({ inputRange: [0, 0.92, 1], outputRange: [0, 0, 1] });

  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const breathe = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const wordY = word.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: BG }]}>
      {/* ── Background: rising stock line ─────────────────────────── */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="cc_area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GREEN} stopOpacity="0.55" />
            <Stop offset="0.6" stopColor={GREEN} stopOpacity="0.12" />
            <Stop offset="1" stopColor={GREEN} stopOpacity="0" />
          </LinearGradient>
          <RadialGradient id="cc_dot" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={GREEN} stopOpacity="0.9" />
            <Stop offset="1" stopColor={GREEN} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <AnimatedPath d={chart.area} fill="url(#cc_area)" opacity={areaOpacity} />
        <AnimatedPath
          d={chart.line}
          stroke={GREEN}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={chart.len}
          strokeDashoffset={dashOffset}
        />
        {/* leading dot: soft halo + solid core */}
        <AnimatedCircle cx={chart.end[0]} cy={chart.end[1]} r={18} fill="url(#cc_dot)" opacity={dotOpacity} />
        <AnimatedCircle cx={chart.end[0]} cy={chart.end[1]} r={5} fill={GREEN} opacity={dotOpacity} />
      </Svg>

      {/* ── Foreground: glyph + wordmark ──────────────────────────── */}
      <View style={[styles.center, { transform: [{ translateY: -H * 0.25 }] }]} pointerEvents="none">
        <Animated.View style={{ opacity: enter, transform: [{ scale: Animated.multiply(enterScale, breathe) }] }}>
          <Glyph size={LOGO} />
        </Animated.View>
        <Animated.View style={{ marginTop: 22, opacity: word, transform: [{ translateY: wordY }] }}>
          <Text style={styles.wordmark}>
            Crypto<Text style={{ color: GREEN, fontWeight: '800' }}>Comp</Text>
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wordmark: {
    color: TEXT,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
