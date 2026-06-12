import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

// Animated splash: the app logo on a dark backdrop with a soft green glow that
// breathes in and out. Shown on cold start (RootNavigator) while the session
// check resolves. Pure JS (ships over OTA), built on the Animated API + a real
// react-native-svg radial gradient so the glow is soft, not a hard disc.

const BG = '#0A0A0B';        // matches the dark theme bg + the icon's backdrop
const GLOW = '#3DD68C';      // brand neon green (dark-theme "up")
const LOGO = require('../../assets/app-icon-1024.png');
const SIZE = 132;            // logo edge length
const GLOW_SIZE = Math.round(SIZE * 2.6);

function GlowOrb() {
  return (
    <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
      <Defs>
        <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={GLOW} stopOpacity="0.85" />
          <Stop offset="42%" stopColor={GLOW} stopOpacity="0.32" />
          <Stop offset="100%" stopColor={GLOW} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#splashGlow)" />
    </Svg>
  );
}

export function SplashLogo() {
  const enter = useRef(new Animated.Value(0)).current;  // fade + scale-in on mount
  const pulse = useRef(new Animated.Value(0)).current;  // 0..1 glow breathe loop

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, pulse]);

  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] });
  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: BG }]}>
      <Animated.View style={[styles.center, { opacity: enter, transform: [{ scale: enterScale }] }]}>
        {/* Soft radial glow behind the logo */}
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        >
          <GlowOrb />
        </Animated.View>
        {/* Logo */}
        <Animated.Image
          source={LOGO}
          resizeMode="contain"
          style={{ width: SIZE, height: SIZE, borderRadius: 30, transform: [{ scale: logoScale }] }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
