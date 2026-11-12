import { describe, expect, it } from 'vitest';
import { MJ_DEFAULT_SEEDS, MJ_LEGACY_INTER_FONT, ResolveSeeds, SanitizeThemeSeeds } from '../seeds.js';

describe('SanitizeThemeSeeds', () => {
  it('keeps a well-formed theme unchanged', () => {
    expect(SanitizeThemeSeeds(MJ_DEFAULT_SEEDS)).toEqual(MJ_DEFAULT_SEEDS);
  });

  it('drops a font stack that could end its CSS declaration, and colors that are not hex', () => {
    const s = SanitizeThemeSeeds({
      primary: '#0076b6',
      accent: 'red',
      fontFamily: 'x;} body{background:url(https://evil/t)} a{',
      fontFamilyDisplay: 'y;} h1{color:red} b{',
      vizPalette: ['#fff', 'url(x)'],
    });
    expect(s).toEqual({ primary: '#0076b6', vizPalette: ['#fff'] });
  });

  it('clamps numbers and refuses seeds with no usable primary', () => {
    expect(SanitizeThemeSeeds({ primary: '#abc', radius: 1e9, depth: Number.NaN })).toEqual({ primary: '#abc', radius: 64 });
    expect(SanitizeThemeSeeds({ primary: 'blue' })).toBeNull();
    expect(SanitizeThemeSeeds('nope')).toBeNull();
  });

  it('normalizes persisted legacy untouched Inter default font stacks to Montserrat', () => {
    const sanitized = SanitizeThemeSeeds({
      primary: '#0076b6',
      fontFamily: MJ_LEGACY_INTER_FONT,
      fontFamilyDisplay: MJ_LEGACY_INTER_FONT,
    });
    expect(sanitized?.fontFamily).toBe(MJ_DEFAULT_SEEDS.fontFamily);
    expect(sanitized?.fontFamilyDisplay).toBe(MJ_DEFAULT_SEEDS.fontFamilyDisplay);

    const resolved = ResolveSeeds({ primary: '#0076b6', fontFamily: MJ_LEGACY_INTER_FONT });
    expect(resolved.fontFamily).toBe(MJ_DEFAULT_SEEDS.fontFamily);
    expect(resolved.fontFamilyDisplay).toBe(MJ_DEFAULT_SEEDS.fontFamily);

    const doubleQuotedInter = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const resolvedDbl = ResolveSeeds({ primary: '#0076b6', fontFamily: doubleQuotedInter });
    expect(resolvedDbl.fontFamily).toBe(MJ_DEFAULT_SEEDS.fontFamily);
  });
});
