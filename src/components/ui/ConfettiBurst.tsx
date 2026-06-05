import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';

// A lightweight confetti burst built on React Native's built-in Animated API —
// no extra dependency, no native rebuild, no React-19 compat risk. Fire it by
// incrementing `trigger` (e.g. setConfetti(c => c + 1)); each change re-runs the
// fall animation. Renders nothing while idle. pointerEvents="none" so it never
// blocks touches. Anchor it inside a `position: relative` parent — particles
// rain down from the parent's top edge.

const COLORS = ['#F7931A', '#15803D', '#2E63E8', '#B5322E', '#8A6B1F', '#9945FF', '#2775CA'];
const COUNT = 28;
const FALL = 360;

interface Particle {
  anim: Animated.Value;
  left: number;     // 0..1 fraction of width
  drift: number;    // horizontal px drift
  spin: number;     // extra rotation degrees
  color: string;
  size: number;
  delay: number;
  duration: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: COUNT }, () => ({
    anim: new Animated.Value(0),
    left: Math.random(),
    drift: (Math.random() - 0.5) * 160,
    spin: Math.random() * 360,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 8,
    delay: Math.random() * 140,
    duration: 1100 + Math.random() * 700,
  }));
}

export function ConfettiBurst({ trigger }: { trigger: number }) {
  const particles = useRef<Particle[]>(makeParticles()).current;
  const [active, setActive] = useState(false);
  const width = Dimensions.get('window').width;

  useEffect(() => {
    if (trigger <= 0) return;
    setActive(true);
    const anims = particles.map(p => {
      p.anim.setValue(0);
      return Animated.timing(p.anim, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
    });
    const group = Animated.parallel(anims);
    group.start(({ finished }) => { if (finished) setActive(false); });
    return () => group.stop();
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FALL, overflow: 'visible' }}
    >
      {particles.map((p, i) => {
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [-30, FALL] });
        const translateX = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin + 360}deg`] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.left * width,
              top: 0,
              width: p.size,
              height: p.size * 1.4,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
