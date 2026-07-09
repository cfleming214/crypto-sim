import React from 'react';
import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { fontFamily as faceForWeight } from '../../theme/fonts';

// Drop-in replacement for react-native's <Text>. It renders the app's typeface
// (Inter) at the face matching each element's fontWeight — custom fonts ignore
// `fontWeight`, so the family is resolved here, in one place, with no per-screen
// edits. An explicit `fontFamily` in the caller's style always wins (e.g. a
// deliberate monospace), and every other prop passes straight through, so this
// is API-identical to the RN Text it replaces.
export const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>(
  ({ style, ...props }, ref) => {
    const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
    const fontFamily = flat.fontFamily ?? faceForWeight(flat.fontWeight);
    return <RNText ref={ref} {...props} style={[{ fontFamily }, style]} />;
  },
);

Text.displayName = 'Text';
