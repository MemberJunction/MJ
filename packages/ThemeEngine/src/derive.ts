/**
 * @fileoverview The single derivation function shared by save, live preview, and
 * validation (org theming decision #4). Given ~8 brand seeds it produces the full
 * --mj-* token contract: generated OKLCH ramps, resolved light/dark semantic maps,
 * a brand-derived chart palette (G4), brand-tinted shadows (G3), the font token (G1),
 * shape radii, an a11y contrast report, and the minimal CSS overlay to emit at runtime.
 *
 * Overlay strategy: the emitted overlay only redefines the PRIMITIVE ramps (plus viz,
 * shadow, font, radius). Every semantic token and the entire [data-theme="dark"] block
 * in _tokens.scss are `var(--mj-color-*)` references, so overriding primitives cascades
 * into both modes automatically — the dark re-point and hover families come for free,
 * with no risk of a parallel mapping diverging from the base stylesheet.
 * @module @memberjunction/theme-engine
 */

import { parseHex } from './color.js';
import { buildContrastReport, ContrastReport } from './contrast.js';
import {
  ACCENT_SHAPE,
  BRAND_SHAPE,
  FAMILY_ANCHOR,
  generateBrandRamp,
  generateNeutralRamp,
  TERTIARY_SHAPE,
} from './ramps.js';
import { hexToOKLCH, oklchToHex } from './color.js';
import { MJ_DEFAULT_SEEDS, ResolvedSeeds, resolveSeeds, ThemeSeeds } from './seeds.js';

/** Fully derived theme: ramps, resolved per-mode maps, overlay vars, and a11y report. */
export interface DerivedTheme {
  seeds: ResolvedSeeds;
  /** Generated primitive ramps, keyed by full CSS var name (`--mj-color-brand-500`). */
  primitives: Record<string, string>;
  /** Resolved semantic tokens as hex, per user mode (the M2 token cache / preview feed). */
  tokens: { light: Record<string, string>; dark: Record<string, string> };
  /** Minimal token overrides emitted into the runtime overlay. */
  overlayVars: Record<string, string>;
  contrast: ContrastReport;
}

/** Fixed (non-brand-derived) status ramp steps referenced by the semantic maps. */
const STATUS = {
  successBg: '#f0fdf4', success: '#22c55e', successText: '#15803d', successText100: '#dcfce7',
  warningBg: '#fffbeb', warning: '#f59e0b', warningText: '#b45309', warningText100: '#fef3c7',
  errorBg: '#fef2f2', error: '#ef4444', errorText: '#b91c1c', errorText100: '#fee2e2', error400: '#f87171',
  infoBg: '#eff6ff', info: '#3b82f6', infoText: '#1d4ed8', infoText100: '#dbeafe',
};

/** Build the resolved semantic map for one mode from the generated primitive ramps. */
function resolveSemantics(
  brand: Record<number, string>,
  accent: Record<number, string>,
  tertiary: Record<number, string>,
  neutral: Record<number, string>,
  mode: 'light' | 'dark',
): Record<string, string> {
  if (mode === 'light') {
    return {
      '--mj-bg-page': neutral[50], '--mj-bg-surface': neutral[0], '--mj-bg-surface-elevated': neutral[0],
      '--mj-bg-surface-card': neutral[50], '--mj-bg-surface-sunken': neutral[100],
      '--mj-bg-surface-hover': neutral[100], '--mj-bg-surface-active': neutral[200],
      '--mj-text-primary': neutral[800], '--mj-text-secondary': neutral[600], '--mj-text-muted': neutral[500],
      '--mj-text-disabled': neutral[400], '--mj-text-inverse': neutral[0],
      '--mj-text-link': brand[500], '--mj-text-link-hover': brand[600],
      '--mj-border-default': neutral[200], '--mj-border-subtle': neutral[100], '--mj-border-strong': neutral[300],
      '--mj-border-focus': brand[500], '--mj-border-error': STATUS.error,
      '--mj-brand-primary': brand[500], '--mj-brand-primary-hover': brand[600], '--mj-brand-primary-active': brand[700],
      '--mj-brand-primary-light': brand[350], '--mj-brand-secondary': brand[900], '--mj-brand-on-primary': neutral[0],
      '--mj-brand-accent': accent[400], '--mj-brand-accent-hover': accent[500], '--mj-brand-accent-active': accent[600],
      '--mj-brand-accent-subtle': accent[50], '--mj-brand-on-accent': neutral[900],
      '--mj-brand-tertiary': tertiary[500], '--mj-brand-tertiary-hover': tertiary[600],
      '--mj-brand-tertiary-active': tertiary[700], '--mj-brand-tertiary-subtle': tertiary[50], '--mj-brand-on-tertiary': neutral[0],
      '--mj-status-success': STATUS.success, '--mj-status-success-bg': STATUS.successBg, '--mj-status-success-text': STATUS.successText,
      '--mj-status-warning': STATUS.warning, '--mj-status-warning-bg': STATUS.warningBg, '--mj-status-warning-text': STATUS.warningText,
      '--mj-status-error': STATUS.error, '--mj-status-error-bg': STATUS.errorBg, '--mj-status-error-text': STATUS.errorText,
      '--mj-status-info': STATUS.info, '--mj-status-info-bg': STATUS.infoBg, '--mj-status-info-text': STATUS.infoText,
    };
  }
  return {
    '--mj-bg-page': neutral[900], '--mj-bg-surface': neutral[800], '--mj-bg-surface-elevated': neutral[700],
    '--mj-bg-surface-card': '#253347', '--mj-bg-surface-sunken': neutral[950],
    '--mj-bg-surface-hover': neutral[600], '--mj-bg-surface-active': neutral[500],
    '--mj-text-primary': neutral[100], '--mj-text-secondary': neutral[300], '--mj-text-muted': neutral[400],
    '--mj-text-disabled': neutral[600], '--mj-text-inverse': neutral[900],
    '--mj-text-link': brand[300], '--mj-text-link-hover': brand[200],
    '--mj-border-default': neutral[700], '--mj-border-subtle': neutral[800], '--mj-border-strong': neutral[600],
    '--mj-border-focus': brand[400], '--mj-border-error': STATUS.error400,
    '--mj-brand-primary': brand[400], '--mj-brand-primary-hover': brand[300], '--mj-brand-primary-active': brand[200],
    '--mj-brand-primary-light': brand[350], '--mj-brand-secondary': brand[900], '--mj-brand-on-primary': neutral[0],
    '--mj-brand-accent': accent[300], '--mj-brand-accent-hover': accent[200], '--mj-brand-accent-active': accent[100],
    '--mj-brand-accent-subtle': `color-mix(in srgb, ${accent[400]} 15%, transparent)`, '--mj-brand-on-accent': neutral[900],
    '--mj-brand-tertiary': tertiary[400], '--mj-brand-tertiary-hover': tertiary[300], '--mj-brand-tertiary-active': tertiary[200],
    '--mj-brand-tertiary-subtle': `color-mix(in srgb, ${tertiary[500]} 15%, transparent)`, '--mj-brand-on-tertiary': neutral[0],
    '--mj-status-success': STATUS.success, '--mj-status-success-bg': `rgba(34, 197, 94, 0.15)`, '--mj-status-success-text': STATUS.successText100,
    '--mj-status-warning': STATUS.warning, '--mj-status-warning-bg': `rgba(245, 158, 11, 0.15)`, '--mj-status-warning-text': STATUS.warningText100,
    '--mj-status-error': STATUS.error, '--mj-status-error-bg': `rgba(239, 68, 68, 0.15)`, '--mj-status-error-text': STATUS.errorText100,
    '--mj-status-info': STATUS.info, '--mj-status-info-bg': `rgba(59, 130, 246, 0.15)`, '--mj-status-info-text': STATUS.infoText100,
  };
}

/** Derive a categorical chart palette (G4) by rotating hue around the brand. */
function deriveVizPalette(brandHueDeg: number, override?: string[]): string[] {
  if (override && override.length) {
    const out = override.slice(0, 10);
    while (out.length < 10) out.push(out[out.length % override.length]);
    return out;
  }
  // Ten evenly-spaced hues at a categorical-friendly lightness/chroma, anchored at brand.
  return Array.from({ length: 10 }, (_, i) =>
    oklchToHex({ l: 0.63, c: 0.15, h: (brandHueDeg + i * 36) % 360 }),
  );
}

/** `#rrggbb` -> `r, g, b` for rgba() shadow emission. */
function rgbTriplet(hex: string): string {
  const { r, g, b } = parseHex(hex);
  return `${r}, ${g}, ${b}`;
}

/** Round to at most 2 decimals and drop trailing zeros. */
const px = (n: number): string => `${Math.round(n)}px`;

/**
 * Derive the full theme from brand seeds. Feeding {@link MJ_DEFAULT_SEEDS} reproduces
 * MJ's default _tokens.scss within perceptual tolerance.
 */
export function derive(seeds: ThemeSeeds = MJ_DEFAULT_SEEDS): DerivedTheme {
  const s = resolveSeeds(seeds);
  const brandHue = hexToOKLCH(s.primary).h;

  const brand = generateBrandRamp(BRAND_SHAPE, FAMILY_ANCHOR.brand, s.primary, s.vibrancy);
  const accent = generateBrandRamp(ACCENT_SHAPE, FAMILY_ANCHOR.accent, s.accent, s.vibrancy);
  const tertiary = generateBrandRamp(TERTIARY_SHAPE, FAMILY_ANCHOR.tertiary, s.tertiary, s.vibrancy);
  const neutral = generateNeutralRamp(brandHue, s.neutralChroma);

  const primitives: Record<string, string> = {};
  const addRamp = (name: string, ramp: Record<number, string>) => {
    for (const step of Object.keys(ramp)) primitives[`--mj-color-${name}-${step}`] = ramp[Number(step)];
  };
  addRamp('brand', brand);
  addRamp('accent', accent);
  addRamp('tertiary', tertiary);
  addRamp('neutral', neutral);

  const viz = deriveVizPalette(brandHue, s.vizPalette);
  const vizVars: Record<string, string> = {};
  viz.forEach((hex, i) => (vizVars[`--mj-viz-${i + 1}`] = hex));

  // Brand-tinted shadows (G3): re-color MJ's brand shadow tokens; alpha scaled by depth.
  const brandRgb = rgbTriplet(brand[500]);
  const shadowVars: Record<string, string> = {
    '--mj-shadow-brand-sm': `0 2px 8px rgba(${brandRgb}, ${(0.3 * s.depth).toFixed(2)})`,
    '--mj-shadow-brand-md': `0 4px 12px rgba(${brandRgb}, ${(0.4 * s.depth).toFixed(2)})`,
  };

  // Shape (radius) and type (font, G1).
  const shapeVars: Record<string, string> = {
    '--mj-radius-sm': px(s.radius / 2),
    '--mj-radius-md': px(s.radius),
    '--mj-radius-lg': px(s.radius * 1.5),
    '--mj-radius-xl': px(s.radius * 2),
    '--mj-radius-2xl': px(s.radius * 3),
  };
  const typeVars: Record<string, string> = {
    '--mj-font-family': s.fontFamily,
    '--mj-font-family-mono': s.fontFamilyMono,
  };

  const light = resolveSemantics(brand, accent, tertiary, neutral, 'light');
  const dark = resolveSemantics(brand, accent, tertiary, neutral, 'dark');

  const overlayVars: Record<string, string> = {
    ...primitives,
    ...vizVars,
    ...shadowVars,
    ...shapeVars,
    ...typeVars,
  };

  return {
    seeds: s,
    primitives,
    tokens: { light, dark },
    overlayVars,
    contrast: buildContrastReport(light, dark),
  };
}

/** Optional advanced-customization layer applied on top of the seed-derived tokens. */
export interface OverlayOptions {
  /** Per-token overrides merged over the derived overlay vars (override wins). Keys are
   *  `--mj-*` custom-property names; applied in the same mode-agnostic overlay block. */
  overrides?: Record<string, string> | null;
  /** Raw CSS appended after the token block, auto-scoped under the overlay selector via
   *  native CSS nesting so it only applies when this theme is active. Escape hatch. */
  customCss?: string | null;
}

/**
 * Serialize a derived theme into overlay CSS scoped to `[data-theme-overlay="<id>"]`.
 * A single block suffices: it overrides primitives that _tokens.scss's semantic and
 * dark blocks reference, so both modes re-point automatically.
 *
 * The optional advanced layer (decision: seed-first, with an escape hatch) is applied
 * last: `overrides` merge over the derived vars; `customCss` is appended, wrapped in the
 * overlay selector so raw rules stay scoped to this theme.
 */
export function emitOverlayCss(themeId: string, derived: DerivedTheme, options: OverlayOptions = {}): string {
  const vars = { ...derived.overlayVars, ...(options.overrides ?? {}) };
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  let css = `[data-theme-overlay="${themeId}"] {\n${body}\n}\n`;
  const custom = (options.customCss ?? '').trim();
  if (custom) {
    css += '\n' + emitScopedCustomCss(`[data-theme-overlay="${themeId}"]`, custom);
  }
  return css;
}

/**
 * Scope raw custom CSS under `selector`, but hoist at-rules that MUST live at the
 * stylesheet top level (`@keyframes`, `@font-face`, `@property`, `@import`) out of the
 * wrapper — CSS nesting forbids them inside a style rule, so nesting them would silently
 * break animations/fonts. Everything else is wrapped so it only applies to this theme.
 */
export function emitScopedCustomCss(selector: string, css: string): string {
  const trimmed = css.trim();
  if (!trimmed) return '';
  const { hoisted, scoped } = splitHoistedAtRules(trimmed);
  let out = '';
  if (hoisted.trim()) out += `${hoisted.trim()}\n`;
  if (scoped.trim()) out += `${selector} {\n${scoped.trim()}\n}\n`;
  return out;
}

const HOIST_AT_RULE = /^@(?:-webkit-|-moz-|-o-)?(?:keyframes|font-face|property|import)\b/i;

/** Separate top-level hoistable at-rules from the rest of a custom-CSS string. */
function splitHoistedAtRules(css: string): { hoisted: string; scoped: string } {
  const hoisted: string[] = [];
  let scoped = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    if (css[i] === '@' && HOIST_AT_RULE.test(css.slice(i))) {
      // @import is a statement ending at ';'; the others are blocks ending at a matched '}'.
      if (/^@(?:-webkit-|-moz-|-o-)?import/i.test(css.slice(i))) {
        const semi = css.indexOf(';', i);
        const end = semi === -1 ? n : semi + 1;
        hoisted.push(css.slice(i, end));
        i = end;
        continue;
      }
      const open = css.indexOf('{', i);
      if (open === -1) {
        scoped += css.slice(i);
        break;
      }
      let depth = 0;
      let j = open;
      for (; j < n; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) {
          j++;
          break;
        }
      }
      hoisted.push(css.slice(i, j));
      i = j;
      continue;
    }
    scoped += css[i];
    i++;
  }
  return { hoisted: hoisted.join('\n'), scoped };
}
