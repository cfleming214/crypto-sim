export interface Colors {
  bg: string;
  surface: string;
  surface2: string;
  elevated: string;
  hairline: string;
  hairlineStrong: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  brand: string;
  brandOn: string;
  accent: string;
  accentSoft: string;
  up: string;
  upSoft: string;
  down: string;
  downSoft: string;
  warn: string;
  warnSoft: string;
}

export const lightColors: Colors = {
  bg: '#F7F6F2',
  surface: '#FFFFFF',
  surface2: '#F1EFE9',
  elevated: '#FFFFFF',
  hairline: '#E6E3DB',
  hairlineStrong: '#D7D2C5',
  ink: '#0B0B0C',
  ink2: '#3D3D40',
  ink3: '#76757A',
  ink4: '#A8A6A0',
  brand: '#1B1B1B',
  brandOn: '#FAFAF7',
  accent: '#2E63E8',
  accentSoft: '#E7EDFD',
  up: '#15803D',
  upSoft: '#E5F2EC',
  down: '#B5322E',
  downSoft: '#F6E6E4',
  warn: '#8A6B1F',
  warnSoft: '#F6EFD9',
};

export const darkColors: Colors = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1B1B1E',
  elevated: '#1A1A1D',
  hairline: '#25252A',
  hairlineStrong: '#33333A',
  ink: '#F5F4EF',
  ink2: '#C9C7C0',
  ink3: '#88868A',
  ink4: '#5C5B60',
  brand: '#F5F4EF',
  brandOn: '#0A0A0B',
  accent: '#6B8FFF',
  accentSoft: 'rgba(107,143,255,0.14)',
  up: '#3DD68C',
  upSoft: 'rgba(61,214,140,0.12)',
  down: '#FF6F61',
  downSoft: 'rgba(255,111,97,0.14)',
  warn: '#E0B85E',
  warnSoft: 'rgba(224,184,94,0.12)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
  avatar: 999,
  avatarSq: 10,
} as const;

export const fontSize = {
  h1: 28,
  h2: 20,
  h3: 16,
  lg: 15,
  base: 13,
  sm: 12,
  xs: 11,
  eyebrow: 11,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const coinColors: Record<string, { bg: string; color: string }> = {
  BTC: { bg: '#F7931A22', color: '#F7931A' },
  ETH: { bg: '#62688F22', color: '#62688F' },
  SOL: { bg: '#14F19522', color: '#15803D' },
  DOGE: { bg: '#C2A63322', color: '#8A6B1F' },
  USDC: { bg: '#2775CA22', color: '#2775CA' },
  PEPE: { bg: '#3A964322', color: '#15803D' },
  BNB:  { bg: '#F3BA2F22', color: '#A77F0E' },
  XRP:  { bg: '#23292F22', color: '#23292F' },
  ADA:  { bg: '#0033AD22', color: '#0033AD' },
  AVAX: { bg: '#E8414222', color: '#E84142' },
  LINK: { bg: '#2A5ADA22', color: '#2A5ADA' },
  DOT:  { bg: '#E6007A22', color: '#E6007A' },
};

export const coinColorsDark: Record<string, { bg: string; color: string }> = {
  BTC: { bg: 'rgba(247,147,26,0.18)', color: '#F7B855' },
  ETH: { bg: 'rgba(120,140,200,0.18)', color: '#9FB2E0' },
  SOL: { bg: 'rgba(61,214,140,0.18)', color: '#5BE9A8' },
  DOGE: { bg: 'rgba(224,184,94,0.18)', color: '#E6C988' },
  USDC: { bg: 'rgba(80,140,220,0.18)', color: '#8FB3F5' },
  PEPE: { bg: 'rgba(61,214,140,0.18)', color: '#5BE9A8' },
  BNB:  { bg: 'rgba(243,186,47,0.18)', color: '#F3CA5E' },
  XRP:  { bg: 'rgba(154,164,174,0.18)', color: '#C2CBD4' },
  ADA:  { bg: 'rgba(0,51,173,0.22)', color: '#6F8FE0' },
  AVAX: { bg: 'rgba(232,65,66,0.18)', color: '#F08A8B' },
  LINK: { bg: 'rgba(42,90,218,0.20)', color: '#7C9BF0' },
  DOT:  { bg: 'rgba(230,0,122,0.18)', color: '#F06FB0' },
};

// Bold per-category palette for the Academy (keyed by ACADEMY_CATEGORIES). Each
// entry: a primary `color`, a `soft` tinted background, and a `grad` pair for
// gradient surfaces. Theme-aware — consumers pick the map via `isDark`, same
// pattern as coinColors/coinColorsDark.
export interface CategoryColor { color: string; soft: string; grad: [string, string] }

export const categoryColors: Record<string, CategoryColor> = {
  'Crypto basics':      { color: '#4F46E5', soft: '#ECEBFB', grad: ['#6366F1', '#4F46E5'] }, // indigo
  'Reading the market': { color: '#0E9488', soft: '#E2F4F1', grad: ['#14B8A6', '#0E9488'] }, // teal
  'Risk & strategy':    { color: '#D97706', soft: '#FBEFDD', grad: ['#F59E0B', '#D97706'] }, // amber
  'Using the app':      { color: '#7C3AED', soft: '#F1E9FC', grad: ['#8B5CF6', '#7C3AED'] }, // violet
};

export const categoryColorsDark: Record<string, CategoryColor> = {
  'Crypto basics':      { color: '#8B92F8', soft: 'rgba(129,140,248,0.16)', grad: ['#818CF8', '#6366F1'] },
  'Reading the market': { color: '#3FD9C8', soft: 'rgba(45,212,191,0.16)',  grad: ['#2DD4BF', '#14B8A6'] },
  'Risk & strategy':    { color: '#F2B45C', soft: 'rgba(245,158,11,0.16)',  grad: ['#FBBF24', '#F59E0B'] },
  'Using the app':      { color: '#A78BFA', soft: 'rgba(167,139,250,0.16)', grad: ['#A78BFA', '#8B5CF6'] },
};

// Hero gradients for prominent surfaces (summary cards, featured banners).
export const gradients: Record<string, [string, string]> = {
  brandHero:   ['#2E63E8', '#4F46E5'],
  successHero: ['#15803D', '#0E9488'],
};

export const gradientsDark: Record<string, [string, string]> = {
  brandHero:   ['#6B8FFF', '#818CF8'],
  successHero: ['#3DD68C', '#2DD4BF'],
};
