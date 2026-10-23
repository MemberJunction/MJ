import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TruthSuite } from '../../truth-suite';
import { CATALOG, DatasetCatalog } from '../../data/catalog';
import { DatasetSeeds } from '../../data/seeds';

interface Golden { worlds: Record<string, { rows: string; truth: string }>; scenarios: Record<string, { rows: string; truth: string }> }
const golden = JSON.parse(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'golden-hashes.json'), 'utf8')) as Golden;
const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('every base seed regenerates byte-identical to the review data', () => {
  for (const entry of CATALOG.filter((d) => d.Code !== 'T3-lag')) {
    for (const seed of DatasetSeeds.SeedSet(entry.Kind, entry.Code, 'base')) {
      const key = entry.Kind === 'world' ? `${entry.Code}/seed-${seed}` : entry.Code;
      const expected = entry.Kind === 'world' ? golden.worlds[key] : golden.scenarios[key];
      it(`${key}`, async () => {
        expect(expected, `no golden hash for ${key}`).toBeDefined();
        const dir = await DatasetCatalog.EnsureGenerated(entry, seed);
        expect(sha(path.join(dir, 'rows.csv'))).toBe(expected!.rows);
        expect(sha(path.join(dir, 'truth.csv'))).toBe(expected!.truth);
      });
    }
  }
  it('W2-noise s120–s159 regenerate identically into two fresh caches (determinism beyond the golden seeds)', async () => {
    const w2 = CATALOG.find((d) => d.Code === 'W2-noise');
    if (!w2) throw new Error('W2-noise missing from the catalog');
    const rootA = mkdtempSync(path.join(tmpdir(), 'truth-a-'));
    const rootB = mkdtempSync(path.join(tmpdir(), 'truth-b-'));
    for (const seed of DatasetSeeds.SeedSet('world', 'W2-noise', 't2').slice(20)) {
      const a = await DatasetCatalog.EnsureGenerated(w2, seed, rootA);
      const b = await DatasetCatalog.EnsureGenerated(w2, seed, rootB);
      expect(sha(path.join(a, 'rows.csv'))).toBe(sha(path.join(b, 'rows.csv')));
    }
  });
});
