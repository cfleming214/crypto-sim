import React, { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, cancelAnimation } from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { PressableScale } from './ui/PressableScale';
import { useReducedMotion } from '../hooks/useReducedMotion';

// The shimmering "upgrade" button that sits left of the Portfolio "+". A gentle
// scale + glow loop draws the eye to the purchase popup. Honors Reduce Motion
// (renders a static badge). Visual only — opening the modal is the caller's job.
export function AnimatedBuyButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.12 }],
    opacity: 0.85 + pulse.value * 0.15,
  }));

  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel="Upgrade — no ads or more balance">
      <Animated.View
        style={[
          {
            width: 30,
            height: 30,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: `${colors.accent}1A`,
            alignItems: 'center',
            justifyContent: 'center',
          },
          animStyle,
        ]}
      >
        <Sparkles color={colors.accent} size={17} strokeWidth={2.25} />
      </Animated.View>
    </PressableScale>
  );
}
