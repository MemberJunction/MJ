/**
 * @fileoverview Shared constants for the Theme Studio + Theme Manager.
 * @module ThemeStudio
 */

import { ContrastCheck, DerivedTheme, hexToOKLCH, oklchToHex, ThemeSeeds } from '@memberjunction/theme-engine';

/**
 * The seeded, built-in MemberJunction theme (created by migration
 * V202607202101__v5.49.x__Add_Theme_Entity.sql with this stable, hardcoded ID).
 * It is protected from edit and delete so there is always a safe fallback theme,
 * regardless of what the user does to their own themes. Duplicating it is allowed.
 */
export const MJ_BUILTIN_THEME_ID = '64A6B519-CFBA-4F25-98D4-8398D397E21C';

/** Whether a theme id is the protected built-in MemberJunction theme (case-insensitive). */
export function IsBuiltInTheme(id: string | null | undefined): boolean {
  return !!id && id.toUpperCase() === MJ_BUILTIN_THEME_ID;
}

/** @deprecated Use {@link IsBuiltInTheme}. */
export function isBuiltInTheme(id: string | null | undefined): boolean {
  return IsBuiltInTheme(id);
}

/** A chrome selector a themer can target from Custom CSS, with a one-line description. */
export interface ChromeSelectorInfo {
  Selector: string;
  Description: string;
}

/**
 * Real MJ chrome selectors a themer can target from Custom CSS — component element
 * tags (Angular selectors) + the shell logo class, each with a one-line description
 * so the catalog can render as clickable chips instead of hiding behind typing.
 * Curated to the persistent chrome worth theming (not transient dialogs/resources).
 * Element tags are reliable targets; internal component classes are view-encapsulated
 * and generally not selectable from an overlay.
 */
export const MJ_CHROME_SELECTOR_INFO: ChromeSelectorInfo[] = [
  { Selector: 'mj-shell', Description: 'The top-level app shell (header bar + workspace)' },
  { Selector: 'mj-app-nav', Description: 'Top app navigation strip' },
  { Selector: 'mj-app-switcher', Description: 'App switcher menu' },
  { Selector: 'mj-tab-container', Description: 'Workspace tab strip + tab content host' },
  { Selector: 'mj-single-dashboard', Description: 'Dashboard resource host' },
  { Selector: 'mj-single-record', Description: 'Record form resource host' },
  { Selector: 'mj-single-query', Description: 'Query resource host' },
  { Selector: 'mj-single-search-result', Description: 'Search results resource host' },
  { Selector: 'mj-command-palette', Description: 'Cmd/Ctrl-K command palette' },
  { Selector: 'mj-omnibar-palette', Description: 'Omnibar search palette' },
  { Selector: 'mj-notifications-resource', Description: 'Notifications panel' },
  { Selector: 'mj-empty-state', Description: 'Empty-state placeholder blocks' },
  { Selector: 'mj-loading', Description: 'Loading indicator (animated logo)' },
  { Selector: 'mj-dialog', Description: 'Modal dialogs' },
  { Selector: 'mj-dialog-actions', Description: 'Dialog footer action row' },
  { Selector: 'mj-profile-dialog', Description: 'User profile dialog' },
  { Selector: 'mj-server-connectivity-banner', Description: 'Server connectivity banner' },
  { Selector: 'mj-system-validation-banner', Description: 'System validation banner' },
  { Selector: '.mj-logo', Description: 'The shell logo element' },
];

/** Flat selector list (autocomplete + validation). */
export const MJ_CHROME_SELECTORS: string[] = MJ_CHROME_SELECTOR_INFO.map((i) => i.Selector);

/** One category in the visual token browser. */
export interface TokenCategory {
  Key: string;
  Label: string;
  Match: RegExp;
}

/**
 * Categories for the visual token browser, in display order. A token lands in the
 * first category whose regex matches; anything unmatched (e.g. an override of a base
 * token outside the derived contract) falls into the trailing "Other" bucket the
 * component appends.
 */
export const TOKEN_CATEGORIES: TokenCategory[] = [
  { Key: 'brand', Label: 'Brand', Match: /^--mj-brand-/ },
  { Key: 'bg', Label: 'Backgrounds', Match: /^--mj-bg-/ },
  { Key: 'text', Label: 'Text', Match: /^--mj-text-/ },
  { Key: 'border', Label: 'Borders', Match: /^--mj-border-/ },
  { Key: 'status', Label: 'Status', Match: /^--mj-status-/ },
  { Key: 'viz', Label: 'Viz', Match: /^--mj-viz-/ },
  { Key: 'shape', Label: 'Shape', Match: /^--mj-(radius|shadow)-/ },
  { Key: 'type', Label: 'Type', Match: /^--mj-font-/ },
  { Key: 'ramps', Label: 'Ramps (primitives)', Match: /^--mj-color-/ },
];

/**
 * Reverse-highlight map: token name → selectors INSIDE the preview canvas whose
 * rendering uses that token. The canvas markup + CSS are authored in this package,
 * so this mapping is exact by construction (unlike inferring provenance from
 * resolved styles, which is deliberately out of scope). Tokens without an entry
 * simply don't highlight. Selectors are matched under `.ts-canvas`.
 */
export const TOKEN_PREVIEW_TARGETS: Record<string, string[]> = {
  '--mj-brand-primary': ['.mx-btn.pri', '.mx-av', '.mx-appico', '.mx-tabs i.on', '.mx-prog i', '.mx-swch:not(.off)', '.rhead', 'table.grid th', '.ag-find .fdot', '.mx-btn.out'],
  '--mj-brand-primary-hover': ['.states-row .is-hover'],
  '--mj-brand-primary-active': ['.states-row .is-active'],
  '--mj-brand-on-primary': ['.mx-btn.pri', '.mx-av', '.rhead'],
  '--mj-brand-accent': ['.kpi', '.zone-lab'],
  '--mj-bg-page': ['.mx', '.pv-view'],
  '--mj-bg-surface': ['.mx-shell', '.mx-ph', '.mx-cell', '.mx-chip', '.report'],
  '--mj-bg-surface-card': ['.kpi', '.rfoot', '.ag-find', 'table.grid tr:nth-child(even) td'],
  '--mj-bg-surface-sunken': ['.mx-search', '.mx-input', '.mx-btn.sec', '.mx-dlg-t', '.mx-stat.neu'],
  '--mj-bg-surface-hover': ['.mx-nav b', '.mx-lnav b', '.mx-chip'],
  '--mj-text-primary': ['.mx-ph-title', '.mx-dlg-t', '.kpi .n', 'table.grid td b'],
  '--mj-text-secondary': ['.mx-lbl', '.mx-tabs i', 'table.grid td', '.ag-sum', '.bar .bv'],
  '--mj-text-muted': ['.mx-cap', '.mx-ph-sub', '.kpi .l', '.cats span', '.rfoot'],
  '--mj-border-default': ['.mx-cell', '.mx-shell', '.mx-input', '.mx-dlg', 'table.grid td'],
  '--mj-border-strong': ['.mx-swch.off'],
  '--mj-border-focus': ['.mx-input.focus', '.states-row .is-focus'],
  '--mj-status-success': ['.mx-stat.suc', '.kpi .d.up'],
  '--mj-status-success-bg': ['.mx-stat.suc'],
  '--mj-status-success-text': ['.mx-stat.suc'],
  '--mj-status-warning': ['.mx-stat.wrn'],
  '--mj-status-warning-bg': ['.mx-stat.wrn'],
  '--mj-status-warning-text': ['.mx-stat.wrn'],
  '--mj-status-error': ['.mx-btn.dgr', '.kpi .d.dn'],
  '--mj-status-info': ['.mx-alert'],
  '--mj-status-info-bg': ['.mx-alert'],
  '--mj-status-info-text': ['.mx-alert'],
  '--mj-status-info-border': ['.mx-alert'],
  '--mj-viz-1': ['.bar:nth-child(1) .fill'],
  '--mj-viz-2': ['.bar:nth-child(2) .fill'],
  '--mj-viz-3': ['.bar:nth-child(3) .fill'],
  '--mj-viz-4': ['.bar:nth-child(4) .fill'],
  '--mj-viz-5': ['.bar:nth-child(5) .fill'],
  '--mj-viz-6': ['.bar:nth-child(6) .fill'],
  '--mj-radius-sm': ['.mx-btn', '.mx-input', '.mx-alert'],
  '--mj-radius-md': ['.mx-cell', '.mx-dlg', '.kpi', '.ag-find'],
  '--mj-radius-lg': ['.mx', '.report'],
  '--mj-shadow-brand-md': ['.report'],
  '--mj-font-family': ['.mx-ph-title', '.ag-sum', '.kpi .n'],
};

/**
 * A curated intent that expands to a token-override set (Q2 recipes): taste-level
 * power with zero token names on screen. Values are computed at toggle-on time from
 * the CURRENT derived theme so they follow the brand; toggling off removes exactly
 * the keys the recipe produced. Fully reversible, serialized through the same
 * `Overrides` JSON as hand-edited tokens.
 */
export interface ThemeRecipe {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokens: (derived: DerivedTheme, seeds: ThemeSeeds) => Record<string, string>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Reduce a hex color's OKLCH chroma by `factor` (0..1 = fully muted..unchanged). */
function muteHex(hex: string, factor: number): string {
  const c = hexToOKLCH(hex);
  return oklchToHex({ ...c, c: c.c * factor });
}

export const THEME_RECIPES: ThemeRecipe[] = [
  {
    id: 'flatter',
    name: 'Flatter look',
    description: 'Remove elevation shadows for a flat, print-like surface.',
    tokens: () => ({
      '--mj-shadow-brand-sm': 'none',
      '--mj-shadow-brand-md': 'none',
      '--mj-shadow-sm': 'none',
      '--mj-shadow-md': 'none',
      '--mj-shadow-lg': 'none',
    }),
  },
  {
    id: 'softer',
    name: 'Softer corners',
    description: 'Rounder radii across chrome and generated content.',
    tokens: (_derived, seeds) => {
      const base = Math.max(12, (seeds.radius ?? 8) * 1.5);
      const px = (n: number) => `${Math.round(n)}px`;
      return {
        '--mj-radius-sm': px(base / 2),
        '--mj-radius-md': px(base),
        '--mj-radius-lg': px(base * 1.5),
        '--mj-radius-xl': px(base * 2),
        '--mj-radius-2xl': px(base * 3),
      };
    },
  },
  {
    id: 'muted',
    name: 'Muted professional',
    description: 'Desaturate accent, tertiary, and chart colors for a quieter palette.',
    // Mutes the PRIMITIVE ramps (not the semantic tokens): every semantic token and
    // the dark block re-point off the primitives, so both modes stay correct.
    tokens: (derived) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(derived.primitives)) {
        if (/^--mj-color-(accent|tertiary)-/.test(k)) out[k] = muteHex(v, 0.4);
      }
      for (let i = 1; i <= 10; i++) {
        const v = derived.overlayVars[`--mj-viz-${i}`];
        if (v) out[`--mj-viz-${i}`] = muteHex(v, 0.45);
      }
      return out;
    },
  },
];

/** Parse a persisted Overrides JSON map: trims keys, drops blanks, coerces values to strings. */
export function ParseOverridesJson(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.trim()) out[k.trim()] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** @deprecated Use {@link ParseOverridesJson}. */
export function parseOverridesJson(json: string | null): Record<string, string> {
  return ParseOverridesJson(json);
}

/**
 * Pick the WORST of the light/dark text-on-primary contrast checks (Q1#3) — a failing
 * dark pair must not hide while previewing light. A failing mode always beats a passing
 * one; between two of the same outcome, lower ratio wins.
 */
export function PickWorstOnPrimary(
  light: ContrastCheck | undefined,
  dark: ContrastCheck | undefined,
): { check: ContrastCheck; mode: 'light' | 'dark' } | undefined {
  if (!light || !dark) {
    const only = light ?? dark;
    return only ? { check: only, mode: light ? 'light' : 'dark' } : undefined;
  }
  if (light.passes !== dark.passes) {
    return light.passes ? { check: dark, mode: 'dark' } : { check: light, mode: 'light' };
  }
  return light.ratio <= dark.ratio ? { check: light, mode: 'light' } : { check: dark, mode: 'dark' };
}

/** @deprecated Use {@link PickWorstOnPrimary}. */
export function pickWorstOnPrimary(
  light: ContrastCheck | undefined,
  dark: ContrastCheck | undefined,
): { check: ContrastCheck; mode: 'light' | 'dark' } | undefined {
  return PickWorstOnPrimary(light, dark);
}

/** Inline custom-CSS validation (Q3#6): @import removal notice + unknown --mj-* names. */
export function BuildCssWarnings(css: string, knownTokens: ReadonlySet<string>): string[] {
  const warnings: string[] = [];
  if (/@import\b/i.test(css)) {
    warnings.push('@import is not supported and is removed on save.');
  }
  const unknown = new Set<string>();
  for (const match of css.matchAll(/--mj-[a-zA-Z0-9-]+/g)) {
    if (!knownTokens.has(match[0])) unknown.add(match[0]);
  }
  if (unknown.size > 0) {
    const list = Array.from(unknown);
    const shown = list.slice(0, 4).join(', ');
    warnings.push(
      `Unknown token${list.length > 1 ? 's' : ''}: ${shown}${list.length > 4 ? ` (+${list.length - 4} more)` : ''} — check the token browser for exact names.`,
    );
  }
  return warnings;
}

/** @deprecated Use {@link BuildCssWarnings}. */
export function buildCssWarnings(css: string, knownTokens: ReadonlySet<string>): string[] {
  return BuildCssWarnings(css, knownTokens);
}
