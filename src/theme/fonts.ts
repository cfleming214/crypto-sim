import type { TextStyle } from 'react-native';

// Geist is the app's typeface. @expo-google-fonts registers each weight as its
// OWN family ('Geist_600SemiBold', …) and React Native's `fontWeight` does NOT
// pick between custom-font faces — so we resolve the family from the weight in
// one place (the <Text> wrapper) instead of touching every screen.
//
// We bundle four faces (Regular/Medium/SemiBold/Bold) — the weights the design
// system actually uses — and snap the rare 100–300 / 800–900 requests to the
// nearest loaded face so nothing ever falls back to a system font.
const FACE: Record<string, string> = {
  '100': 'Geist_400Regular',
  '200': 'Geist_400Regular',
  '300': 'Geist_400Regular',
  '400': 'Geist_400Regular',
  normal: 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  '800': 'Geist_700Bold',
  '900': 'Geist_700Bold',
  bold: 'Geist_700Bold',
};

export function geistFamily(weight?: TextStyle['fontWeight']): string {
  return FACE[String(weight ?? '400')] ?? 'Geist_400Regular';
}
