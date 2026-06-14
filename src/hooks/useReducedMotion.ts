import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True when the OS "Reduce Motion" accessibility setting is on. Animated
// components read this to drop movement (translate/scale) and keep only opacity,
// per accessibility guidance — reduced motion means gentler, not zero.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduced(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; sub.remove(); };
  }, []);

  return reduced;
}
