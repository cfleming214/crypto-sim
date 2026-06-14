import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Target scale on press. Subtle by design (0.95–0.98). */
  scaleTo?: number;
}

// Visual-only press feedback: springs down to `scaleTo` on press-in and snaps
// back on release — the single biggest "feels responsive" win. No haptics (app
// rule). Honors Reduce Motion (skips the scale entirely when enabled). Both
// style and transform live on one element so layout props like flex still work.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 6 }).start();

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => { if (!reduced && !disabled) spring(scaleTo); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { if (!reduced) spring(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
