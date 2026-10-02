/**
 * @fileoverview MemberJunction's design tokens, for React Native.
 *
 * ## Why these values are duplicated rather than imported
 *
 * MJ's tokens are authored as CSS custom properties in
 * `packages/Angular/Generic/shared/src/lib/_tokens.scss` and consumed through `var(--mj-*)`. React
 * Native has no CSS and no cascade, so a native surface cannot read them — it needs the values as
 * JavaScript.
 *
 * This is not a new problem and not a new answer: `@memberjunction/realtime-widget` already mirrors
 * the same set in TypeScript (`src/ui/tokens.ts`) because its shadow root cannot see the host
 * page's `:root` either. This file is the third mirror.
 *
 * **That third mirror is the argument for promoting the values into a framework-neutral package**
 * that emits both the SCSS and a TypeScript object, so Angular, the widget and the native app
 * cannot drift. Raised as a proposal rather than done here: it touches the token pipeline and the
 * `check:ui` design-token CI gate, which is not this branch's business. Until then, the rule is
 * simple — **if a value here disagrees with `_tokens.scss`, `_tokens.scss` wins.**
 *
 * ## Why the names stay RN-flavoured
 *
 * The semantic names below (`bg`, `ink`, `line`) predate this alignment and are used across every
 * screen. Each one now documents the `--mj-*` token it carries, so the mapping is checkable, and
 * the values are MJ's exactly. Renaming them would be churn without benefit.
 */

/**
 * Semantic colour palette, carrying MemberJunction's SHIPPED DEFAULT token values —
 * the literals in `_tokens.scss`, not what a particular deployment resolves at runtime.
 *
 * That distinction cost a round of wrong values and is worth stating. Reading the computed
 * properties off a running Explorer returns whatever THEME is active on that instance; the
 * development tenant applies one, so `--mj-color-neutral-800` resolved to `#1a2b38` there while
 * the shipped default is `#1e293b`. Both are "MJ's tokens" in some sense, but only the defaults
 * belong in a file that claims to mirror `_tokens.scss`.
 *
 * **Known limitation:** a native build therefore cannot follow a deployment's custom theme. The
 * web reads live custom properties; this is a compile-time copy. Runtime theming on mobile would
 * mean shipping the token set over the API and resolving it at boot — worth doing, not done.
 */
export const Colors = {
  // Surfaces
  /** `--mj-bg-page` */
  bg: '#f8fafc',
  /** `--mj-bg-surface` */
  surface: '#ffffff',
  /** `--mj-bg-surface-sunken` */
  surface2: '#f1f5f9',
  /** `--mj-bg-surface-hover`, used as the user-message ground on light rows. */
  userBg: '#f1f5f9',

  // Text
  /** `--mj-text-primary` */
  ink: '#1e293b',
  /** `--mj-text-secondary` */
  ink2: '#475569',
  /** `--mj-text-muted` */
  ink3: '#64748b',
  /** `--mj-text-inverse` */
  inverse: '#ffffff',

  // Lines
  /** `--mj-border-subtle` */
  line: '#f1f5f9',
  /** `--mj-border-default` */
  line2: '#e2e8f0',
  /** `--mj-border-strong` */
  line3: '#cbd5e1',

  // Brand
  /** `--mj-brand-primary` */
  brand: '#0076b6',
  /** `--mj-brand-primary-hover` */
  brandHover: '#006aa3',
  /** `--mj-brand-accent-subtle` */
  brandSoft: '#f0faff',

  // Per-agent identity, for avatars and mention chips. Drawn from MJ's own accent ramps so a
  // generated avatar never lands on a colour the palette does not contain.
  agentSkip: '#0076b6',
  agentResearch: '#7c3aed',
  agentAnalyst: '#d97706',
  agentForecaster: '#16a34a',
  agentEmailDrafter: '#0092ab',
  agentFallback: '#617687',

  // Status
  /** `--mj-color-success-600` */
  positive: '#16a34a',
  /** `--mj-status-success-bg` */
  positiveSoft: '#f0fdf4',
  /** `--mj-color-warning-500` */
  warn: '#f59e0b',
  /** `--mj-status-warning-bg` */
  warnSoft: '#fffbeb',
  /** `--mj-color-error-500` */
  danger: '#ef4444',
  /** `--mj-status-error-bg` */
  dangerSoft: '#fef2f2',
} as const;

/**
 * Chat-specific tokens, mirroring the `--mj-chat-*` set.
 *
 * These exist as their own group on the web precisely so a product can retheme the conversation
 * without touching the rest of the palette. Keeping that separation here means a host can do the
 * same on a phone.
 */
export const ChatColors = {
  /** `--mj-chat-bubble-user-bg` */
  bubbleUserBg: '#0076b6',
  /** `--mj-chat-bubble-user-text` */
  bubbleUserText: '#ffffff',
  /** `--mj-chat-bubble-agent-bg` */
  bubbleAgentBg: '#f8fafc',
  /** `--mj-chat-bubble-agent-text` */
  bubbleAgentText: '#1e293b',
  /** `--mj-chat-composer-bg` */
  composerBg: '#ffffff',
  /** `--mj-chat-composer-border` */
  composerBorder: '#e2e8f0',
  /** `--mj-chat-presence-pulse-color` */
  presencePulse: '#0076b6',
  /** `--mj-chat-voice-thinking` */
  voiceThinking: '#f59e0b',
} as const;

/** Spacing scale in px (`xs`=4 … `xxxl`=32) for padding, margins, and gaps. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Corner-radius scale in px, plus named values (`composer`, `pill` for fully-rounded). */
export const Radius = {
  /** `--mj-radius-sm` */
  sm: 4,
  /** `--mj-radius-md` */
  md: 8,
  /** `--mj-radius-lg` */
  lg: 12,
  /** `--mj-radius-xl` */
  xl: 16,
  /** `--mj-radius-2xl` */
  xxl: 24,
  /** The composer's own rounding — `--mj-radius-lg`, matching the web's message box. */
  composer: 12,
  /** `--mj-radius-full` */
  pill: 9999,
} as const;

/**
 * Typography tokens: font sizes (`caption`…`display`, in px) and font-weight
 * strings (`regular`…`bold`) usable directly as RN `fontWeight` values.
 */
export const Type = {
  // Sizes — MJ's rem scale resolved at a 16px root.
  /** `--mj-text-xs` (0.75rem) */
  caption: 12,
  /** `--mj-text-sm` (0.875rem) */
  small: 14,
  /** `--mj-text-base` (1rem) */
  body: 16,
  /** `--mj-text-lg` (1.125rem) */
  bodyLarge: 18,
  /** `--mj-text-xl` (1.25rem) */
  title: 20,
  /** `--mj-text-2xl` (1.5rem) */
  heading: 24,
  /** `--mj-text-3xl` (1.875rem) */
  display: 30,

  // Weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Elevation presets (iOS shadow* props + Android `elevation`) at three depths:
 * `card` (subtle), `cardLarge` (modals/inputs), and `fab` (floating action button).
 */
export const Shadow = {
  card: {
    shadowColor: '#071927',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLarge: {
    shadowColor: '#071927',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  fab: {
    shadowColor: '#071927',
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
export function ColorForAgent(agentName: string | undefined | null): string {
  if (!agentName) return Colors.agentFallback;
  const key = agentName.trim().toLowerCase();
  if (key.includes('skip')) return Colors.agentSkip;
  if (key.includes('research')) return Colors.agentResearch;
  if (key.includes('analyst')) return Colors.agentAnalyst;
  if (key.includes('forecast')) return Colors.agentForecaster;
  if (key.includes('email')) return Colors.agentEmailDrafter;
  return Colors.agentFallback;
}

/** @deprecated Use {@link ColorForAgent}. */
export function colorForAgent(agentName: string | undefined | null): string {
  return ColorForAgent(agentName);
}
