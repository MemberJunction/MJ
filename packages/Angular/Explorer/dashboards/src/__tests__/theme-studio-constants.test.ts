/**
 * Tests for the Theme Studio pure helpers: token categorization, recipe expansion,
 * overrides parsing, worst-of-both contrast selection, and custom-CSS validation.
 */
import { describe, expect, it } from 'vitest';
import { ContrastCheck, derive, hexToOKLCH, MJ_DEFAULT_SEEDS } from '@memberjunction/theme-engine';
import {
  buildCssWarnings,
  parseOverridesJson,
  pickWorstOnPrimary,
  THEME_RECIPES,
  TOKEN_CATEGORIES,
} from '../ThemeStudio/theme-studio.constants';

function check(overrides: Partial<ContrastCheck>): ContrastCheck {
  return { name: 'text-on-primary', fg: '#ffffff', bg: '#0076b6', ratio: 5, required: 4.5, passes: true, ...overrides };
}

function firstCategory(token: string): string | undefined {
  return TOKEN_CATEGORIES.find((c) => c.match.test(token))?.key;
}

describe('TOKEN_CATEGORIES', () => {
  it('buckets semantic tokens into their families', () => {
    expect(firstCategory('--mj-brand-primary')).toBe('brand');
    expect(firstCategory('--mj-bg-surface-card')).toBe('bg');
    expect(firstCategory('--mj-text-muted')).toBe('text');
    expect(firstCategory('--mj-border-focus')).toBe('border');
    expect(firstCategory('--mj-status-warning-bg')).toBe('status');
    expect(firstCategory('--mj-viz-3')).toBe('viz');
  });

  it('buckets shape and type tokens', () => {
    expect(firstCategory('--mj-radius-md')).toBe('shape');
    expect(firstCategory('--mj-shadow-lg')).toBe('shape');
    expect(firstCategory('--mj-font-family')).toBe('type');
  });

  it('buckets primitive ramps last and leaves unknown families unmatched', () => {
    expect(firstCategory('--mj-color-accent-500')).toBe('ramps');
    expect(firstCategory('--mj-logo-mark')).toBeUndefined();
  });
});

describe('THEME_RECIPES', () => {
  const derived = derive({ ...MJ_DEFAULT_SEEDS });
  const flatter = THEME_RECIPES.find((r) => r.id === 'flatter')!;
  const softer = THEME_RECIPES.find((r) => r.id === 'softer')!;
  const muted = THEME_RECIPES.find((r) => r.id === 'muted')!;

  it('flatter sets every shadow token to none', () => {
    const tokens = flatter.tokens(derived, MJ_DEFAULT_SEEDS);
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(tokens)) {
      expect(key).toMatch(/^--mj-shadow-/);
      expect(value).toBe('none');
    }
  });

  it('softer scales radii off the seed radius with a 12px floor', () => {
    const tokens = softer.tokens(derived, { ...MJ_DEFAULT_SEEDS, radius: 8 });
    // base = max(12, 8 * 1.5) = 12
    expect(tokens['--mj-radius-sm']).toBe('6px');
    expect(tokens['--mj-radius-md']).toBe('12px');
    expect(tokens['--mj-radius-lg']).toBe('18px');
    expect(tokens['--mj-radius-xl']).toBe('24px');
    expect(tokens['--mj-radius-2xl']).toBe('36px');
  });

  it('softer defaults a missing seed radius to 8 and follows larger radii', () => {
    const noRadius = softer.tokens(derived, { ...MJ_DEFAULT_SEEDS, radius: undefined });
    expect(noRadius['--mj-radius-md']).toBe('12px');
    const large = softer.tokens(derived, { ...MJ_DEFAULT_SEEDS, radius: 20 });
    // base = max(12, 20 * 1.5) = 30
    expect(large['--mj-radius-md']).toBe('30px');
  });

  it('muted reduces chroma on accent/tertiary primitives and viz colors only', () => {
    const tokens = muted.tokens(derived, MJ_DEFAULT_SEEDS);
    const keys = Object.keys(tokens);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^--mj-(color-(accent|tertiary)-|viz-)/);
      const source = derived.primitives[key] ?? derived.overlayVars[key];
      expect(hexToOKLCH(tokens[key]).c).toBeLessThanOrEqual(hexToOKLCH(source).c);
    }
  });

  it('muted produces a stable key set across seed changes (re-expansion safe)', () => {
    const other = derive({ ...MJ_DEFAULT_SEEDS, primary: '#b45309', accent: '#e11d48' });
    expect(Object.keys(muted.tokens(other, MJ_DEFAULT_SEEDS)).sort()).toEqual(
      Object.keys(muted.tokens(derived, MJ_DEFAULT_SEEDS)).sort(),
    );
  });
});

describe('parseOverridesJson', () => {
  it('returns an empty map for null or invalid JSON', () => {
    expect(parseOverridesJson(null)).toEqual({});
    expect(parseOverridesJson('not json')).toEqual({});
  });

  it('trims keys, drops blank keys, and coerces values to strings', () => {
    expect(parseOverridesJson('{" --mj-a ": "#fff", "  ": "dropped", "--mj-b": 4}')).toEqual({
      '--mj-a': '#fff',
      '--mj-b': '4',
    });
  });
});

describe('pickWorstOnPrimary', () => {
  it('returns undefined when neither mode has a check', () => {
    expect(pickWorstOnPrimary(undefined, undefined)).toBeUndefined();
  });

  it('falls back to the only available mode', () => {
    const light = check({ ratio: 6 });
    expect(pickWorstOnPrimary(light, undefined)).toEqual({ check: light, mode: 'light' });
    const dark = check({ ratio: 3, passes: false });
    expect(pickWorstOnPrimary(undefined, dark)).toEqual({ check: dark, mode: 'dark' });
  });

  it('a failing mode always beats a passing one, regardless of ratio', () => {
    const light = check({ ratio: 2, passes: false });
    const dark = check({ ratio: 8 });
    expect(pickWorstOnPrimary(light, dark)).toEqual({ check: light, mode: 'light' });
    expect(pickWorstOnPrimary(dark, light)).toEqual({ check: light, mode: 'dark' });
  });

  it('between two of the same outcome, the lower ratio wins', () => {
    const light = check({ ratio: 5 });
    const dark = check({ ratio: 7 });
    expect(pickWorstOnPrimary(light, dark)?.mode).toBe('light');
    expect(pickWorstOnPrimary(dark, light)?.mode).toBe('dark');
  });
});

describe('buildCssWarnings', () => {
  const known = new Set(['--mj-brand-primary', '--mj-bg-surface']);

  it('returns no warnings for clean CSS using known tokens', () => {
    expect(buildCssWarnings('mj-shell { color: var(--mj-brand-primary); }', known)).toEqual([]);
  });

  it('flags @import case-insensitively', () => {
    const warnings = buildCssWarnings('@IMPORT url("x.css");', known);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('@import');
  });

  it('lists unknown tokens, deduplicated, capping the display at 4', () => {
    const css = '.a { c: var(--mj-nope-1); d: var(--mj-nope-1); }';
    expect(buildCssWarnings(css, known)[0]).toBe(
      'Unknown token: --mj-nope-1 — check the token browser for exact names.',
    );
    const many = [1, 2, 3, 4, 5, 6].map((i) => `var(--mj-nope-${i})`).join(' ');
    const warning = buildCssWarnings(`.a { c: ${many}; }`, known)[0];
    expect(warning).toContain('Unknown tokens:');
    expect(warning).toContain('(+2 more)');
  });
});
