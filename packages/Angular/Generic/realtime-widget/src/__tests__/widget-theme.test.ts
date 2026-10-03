import { describe, it, expect } from 'vitest';
import { BuildThemeTokenMap, ResolveDataTheme } from '../lib/theme/widget-theme';
import { ENGLISH_STRINGS, FormatWidgetString, RegisterWidgetLocale, ResolveWidgetStrings } from '../lib/strings';

describe('BuildThemeTokenMap', () => {
  it('normalises both spellings to --mj-*, passing values through verbatim', () => {
    expect(BuildThemeTokenMap({ 'brand-primary': '#0a7a55', '--mj-bg-page': '#fff', 'mj-radius-md': '10px' })).toEqual({
      '--mj-brand-primary': '#0a7a55',
      '--mj-bg-page': '#fff',
      '--mj-radius-md': '10px'
    });
  });

  it('drops anything outside the token contract: other custom properties, blanks, non-strings', () => {
    expect(BuildThemeTokenMap({ '--evil': 'red', '': 'x', ok: ' ', good: 'blue', bad: 5 as unknown as string })).toEqual({ '--mj-good': 'blue' });
    expect(BuildThemeTokenMap(null)).toEqual({});
    expect(BuildThemeTokenMap(undefined)).toEqual({});
  });
});

describe('ResolveDataTheme', () => {
  it('applies an explicit light or dark mode always', () => {
    expect(ResolveDataTheme('dark', true, false)).toBe('dark');
    expect(ResolveDataTheme('light', true, true)).toBe('light');
  });

  it('on auto, defers to a page that already declares a theme (leaves the element alone)', () => {
    expect(ResolveDataTheme('auto', true, true)).toBeNull();
  });

  it('on auto with no page theme, follows the visitor\'s OS preference', () => {
    expect(ResolveDataTheme('auto', false, true)).toBe('dark');
    expect(ResolveDataTheme('auto', false, false)).toBe('light');
  });
});

describe('widget strings', () => {
  it('falls back to English for unknown locales and omitted keys', () => {
    expect(ResolveWidgetStrings(null)).toEqual(ENGLISH_STRINGS);
    expect(ResolveWidgetStrings('xx-YY')).toEqual(ENGLISH_STRINGS);
  });

  it('resolves a registered locale exactly, then by language, with partial tables completed from English', () => {
    RegisterWidgetLocale('fr', { begin: 'Commencer' });
    RegisterWidgetLocale('fr-CA', { begin: 'Débuter' });
    expect(ResolveWidgetStrings('fr-CA').begin).toBe('Débuter');
    expect(ResolveWidgetStrings('FR-be').begin).toBe('Commencer');
    expect(ResolveWidgetStrings('fr').notNow).toBe(ENGLISH_STRINGS.notNow);
  });

  it('substitutes the agent name', () => {
    expect(FormatWidgetString('Talk to {agent} — {agent}', 'Sage')).toBe('Talk to Sage — Sage');
  });
});
