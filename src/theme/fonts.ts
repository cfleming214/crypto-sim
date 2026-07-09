import type { TextStyle } from 'react-native';

// Inter is the app's typeface — the closest freely-licensable match to Robinhood's
// (proprietary) Capsule Sans. @expo-google-fonts registers each weight as its OWN
// family ('Inter_600SemiBold', …) and React Native's `fontWeight` does NOT pick
// between custom-font faces — so we resolve the family from the weight in one place
// (the <Text> wrapper) instead of touching every screen.
//
// We bundle five faces (Regular/Medium/SemiBold/Bold/ExtraBold) and snap the rare
// out-of-range requests to the nearest loaded face so nothing falls back to a
// system font. 800/900 map to ExtraBold for punchy Robinhood-style headings.
const FACE: Record<string, string> = {
  '100': 'Inter_400Regular',
  '200': 'Inter_400Regular',
  '300': 'Inter_400Regular',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
};

export function fontFamily(weight?: TextStyle['fontWeight']): string {
  return FACE[String(weight ?? '400')] ?? 'Inter_400Regular';
}
