/**
 * Design tokens — from plans/mobile-app-react-native/README.md §4.1.
 * Light theme only for Phase 1. Dark theme is a Phase 2 decision.
 */

export const Colors = {
  // Surfaces
  bg: '#fafaf7',
  surface: '#ffffff',
  surface2: '#f6f5ef',
  userBg: '#f1efe9',

  // Text
  ink: '#0d0d10',
  ink2: '#4a4a52',
  ink3: '#8a8a93',
  inverse: '#ffffff',

  // Lines
  line: 'rgba(13,13,16,0.06)',
  line2: 'rgba(13,13,16,0.10)',

  // Brand & agent identities (matches mockups exactly)
  brand: '#264FAF',
  brandSoft: 'rgba(38,79,175,0.08)',

  agentSkip: '#264FAF',
  agentResearch: '#7c5cd6',
  agentAnalyst: '#d97757',
  agentForecaster: '#1a8a5f',
  agentEmailDrafter: '#b87a1f',
  agentFallback: '#4a4f5a',

  // Status
  positive: '#1a8a5f',
  positiveSoft: 'rgba(26,138,95,0.10)',
  warn: '#b87a1f',
  warnSoft: 'rgba(184,122,31,0.12)',
  danger: '#c84a39',
  dangerSoft: 'rgba(200,74,57,0.12)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 18,
  xxl: 22,
  composer: 24,
  pill: 999,
} as const;

export const Type = {
  // Sizes
  caption: 11,
  small: 12,
  body: 15,
  bodyLarge: 16,
  title: 18,
  heading: 22,
  display: 30,

  // Weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const Shadow = {
  card: {
    shadowColor: '#0d0d10',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLarge: {
    shadowColor: '#0d0d10',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  fab: {
    shadowColor: '#0d0d10',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.30,
    shadowRadius: 28,
    elevation: 12,
  },
} as const;

/**
 * Stable color resolver for an agent. Falls back to a neutral slate
 * when no specific mapping is registered.
 */
export function colorForAgent(agentName: string | undefined | null): string {
  if (!agentName) return Colors.agentFallback;
  const key = agentName.trim().toLowerCase();
  if (key.includes('skip')) return Colors.agentSkip;
  if (key.includes('research')) return Colors.agentResearch;
  if (key.includes('analyst')) return Colors.agentAnalyst;
  if (key.includes('forecast')) return Colors.agentForecaster;
  if (key.includes('email')) return Colors.agentEmailDrafter;
  return Colors.agentFallback;
}
