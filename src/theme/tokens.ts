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
};

export const coinColorsDark: Record<string, { bg: string; color: string }> = {
  BTC: { bg: 'rgba(247,147,26,0.18)', color: '#F7B855' },
  ETH: { bg: 'rgba(120,140,200,0.18)', color: '#9FB2E0' },
  SOL: { bg: 'rgba(61,214,140,0.18)', color: '#5BE9A8' },
  DOGE: { bg: 'rgba(224,184,94,0.18)', color: '#E6C988' },
  USDC: { bg: 'rgba(80,140,220,0.18)', color: '#8FB3F5' },
  PEPE: { bg: 'rgba(61,214,140,0.18)', color: '#5BE9A8' },
};
