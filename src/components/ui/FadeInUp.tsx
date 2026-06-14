import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Strong ease-out — same curve the Compete carousel already uses, so motion
// feels consistent across the app.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

interface FadeInUpProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Stagger position — each step adds ~50ms so items cascade in. */
  index?: number;
  /** Extra base delay before this item starts (ms). */
  delay?: number;
  /** How far it rises, in px. */
  distance?: number;
}

// Entrance animation: fade + rise + a barely-there scale, optionally staggered
// by `index`. Under Reduce Motion the movement is dropped and only opacity
// animates. transform + opacity only, native driver.
export function FadeInUp({ children, style, index = 0, delay = 0, distance = 8 }: FadeInUpProps) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      delay: delay + index * 50,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, index, delay]);

  const transform = reduced
    ? []
    : [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
      ];

  return <Animated.View style={[style, { opacity: progress, transform }]}>{children}</Animated.View>;
}
