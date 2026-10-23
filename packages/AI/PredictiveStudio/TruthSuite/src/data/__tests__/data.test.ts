import { describe, it, expect } from 'vitest';
import { DatasetSeeds } from '../seeds';
import { DataCache } from '../cache';
import { CATALOG } from '../catalog';

describe('seed sets', () => {
  it('fixes the base, T2 and 400-seed sets', () => {
    expect(DatasetSeeds.SeedSet('world', 'W1-signal', 'base')).toEqual([42, 43, 44, 9042]);
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 't2')).toEqual(Array.from({ length: 60 }, (_, i) => 100 + i));
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 'n400')).toHaveLength(400);
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 'n400')[399]).toBe(499);
    const c2 = DatasetSeeds.SeedSet('scenario', 'C2', 'n400');
    expect(c2.slice(0, 3)).toEqual([2201, 2201001, 2201002]);
    expect(new Set(c2).size).toBe(400);
  });
});

describe('cache', () => {
  it('hashes the spec, the generator and the Loom pin together', () => {
    const a = DataCache.SpecHash({ id: 'X', seed: 1 }, 'generator-bytes', 'loomsha');
    expect(DataCache.SpecHash({ seed: 1, id: 'X' }, 'generator-bytes', 'loomsha')).toBe(a);   // key order does not matter
    expect(DataCache.SpecHash({ id: 'X', seed: 2 }, 'generator-bytes', 'loomsha')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', seed: 1 }, 'generator-bytes', 'other')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', seed: 1 }, 'other-generator', 'loomsha')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', nested: { b: 1, a: 2 } }, 'g', 'l')).toBe(DataCache.SpecHash({ nested: { a: 2, b: 1 }, id: 'X' }, 'g', 'l'));
    expect(DataCache.Dir('/d', 'world', 'W1-signal', a, 42)).toBe(`/d/world/W1-signal/${a.slice(0, 12)}/seed-42`);
  });
  it('catalogs 9 worlds and 15 scenarios (14 specs + T3-lag)', () => {
    expect(CATALOG.filter((d) => d.Kind === 'world')).toHaveLength(9);
    expect(CATALOG.filter((d) => d.Kind === 'scenario').map((d) => d.Code)).toContain('T3-lag');
    expect(CATALOG.filter((d) => d.Kind === 'scenario')).toHaveLength(15);
  });
});
