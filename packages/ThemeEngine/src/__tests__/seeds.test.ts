import { describe, expect, it } from 'vitest';
import { MJ_DEFAULT_SEEDS, SanitizeThemeSeeds } from '../seeds.js';

describe('SanitizeThemeSeeds', () => {
  it('keeps a well-formed theme unchanged', () => {
    expect(SanitizeThemeSeeds(MJ_DEFAULT_SEEDS)).toEqual(MJ_DEFAULT_SEEDS);
  });

  it('drops a font stack that could end its CSS declaration, and colors that are not hex', () => {
    const s = SanitizeThemeSeeds({ primary: '#0076b6', accent: 'red', fontFamily: 'x;} body{background:url(https://evil/t)} a{', vizPalette: ['#fff', 'url(x)'] });
    expect(s).toEqual({ primary: '#0076b6', vizPalette: ['#fff'] });
  });

  it('clamps numbers and refuses seeds with no usable primary', () => {
    expect(SanitizeThemeSeeds({ primary: '#abc', radius: 1e9, depth: Number.NaN })).toEqual({ primary: '#abc', radius: 64 });
    expect(SanitizeThemeSeeds({ primary: 'blue' })).toBeNull();
    expect(SanitizeThemeSeeds('nope')).toBeNull();
  });
});
