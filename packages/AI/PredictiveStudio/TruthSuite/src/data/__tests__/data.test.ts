import { describe, it, expect } from 'vitest';
import { DatasetSeeds } from '../seeds';
import { DataCache } from '../cache';
import { CATALOG, DatasetCatalog } from '../catalog';

describe('seed sets', () => {
  it('fixes the base and T2 sets', () => {
    expect(DatasetSeeds.SeedSet('world', 'W1-signal', 'base')).toEqual([42, 43, 44, 9042]);
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 't2')).toEqual(Array.from({ length: 60 }, (_, i) => 100 + i));
    expect(DatasetSeeds.SeedSet('scenario', 'C2', 'base')).toEqual([2201]);
    expect(DatasetSeeds.SeedSet('scenario', 'T3-lag', 'base')).toEqual(DatasetSeeds.SeedSet('scenario', 'T3', 'base'));
    expect(() => DatasetSeeds.SeedSet('world', 'W1-signal', 't2')).toThrow();
    expect(() => DatasetSeeds.SeedSet('scenario', 'C2', 't2')).toThrow();
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
  it('narrows every catalog code to its id union, and nothing else', () => {
    for (const entry of CATALOG) {
      expect(entry.Kind === 'world' ? DatasetCatalog.IsWorldID(entry.Code) : DatasetCatalog.IsScenarioID(entry.Code)).toBe(true);
    }
    expect(DatasetCatalog.IsWorldID('C2')).toBe(false);
    expect(DatasetCatalog.IsScenarioID('W1-signal')).toBe(false);
    expect(DatasetCatalog.IsScenarioID('T9')).toBe(false);
  });
});
