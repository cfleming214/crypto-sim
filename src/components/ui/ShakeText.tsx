import React, { useEffect, useRef } from 'react';
import { Animated, TextStyle, StyleProp } from 'react-native';

// A Text that does a quick horizontal jitter whenever its (string) content
// changes — used for the live portfolio value so an update reads as "live".
// Built on RN's built-in Animated (useNativeDriver), so no new deps and no
// haptics (celebrations/feedback in this app are visual only).
export function ShakeText({
  children,
  style,
  amount = 3,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  amount?: number;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  // Re-run only when the rendered text actually changes.
  const key = typeof children === 'string' || typeof children === 'number'
    ? String(children)
    : React.Children.toArray(children).join('');

  useEffect(() => {
    if (first.current) { first.current = false; return; } // no jitter on mount
    shake.stopAnimation();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [key, shake]);

  const translateX = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-amount, amount],
  });

  return (
    <Animated.Text style={[style, { transform: [{ translateX }] }]}>
      {children}
    </Animated.Text>
  );
}
