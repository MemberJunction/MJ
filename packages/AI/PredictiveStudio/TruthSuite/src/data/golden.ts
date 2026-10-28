import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../truth-suite';
import type { CatalogEntry } from './catalog';
import { DatasetSeeds } from './seeds';

/** The pinned sha256 of a generated dataset's `rows.csv` and `truth.csv`. */
export interface GoldenDatasetHashes {
  RowsSha256: string;
  TruthSha256: string;
}

/** One entry of fixtures/golden-hashes.json (the file's own lower-case keys). */
interface GoldenFileEntry {
  rows: string;
  truth: string;
}

/** fixtures/golden-hashes.json: worlds keyed `<id>/seed-<n>`, scenarios keyed by id (one base seed each). */
interface GoldenHashFile {
  source: string;
  worlds: Record<string, GoldenFileEntry>;
  scenarios: Record<string, GoldenFileEntry>;
}

/**
 * The byte-for-byte pins of the generated datasets (fixtures/golden-hashes.json). Every base seed of every catalog
 * entry has a pin; other seeds (W2-noise s120–s159) have none, and `pnpm run test:regeneration` checks only that
 * they regenerate identically.
 */
export class GoldenHashes {
  private static file: GoldenHashFile | null = null;

  /** The key of `seed` of `entry` in golden-hashes.json. */
  public static Key(entry: CatalogEntry, seed: number): string {
    return entry.Kind === 'world' ? `${entry.Code}/seed-${seed}` : entry.Code;
  }

  /**
   * The pinned hashes of `seed` of `entry`, or null when the seed is not one of the entry's base seeds (no pin).
   * Throws when a base seed has no pin.
   */
  public static Expected(entry: CatalogEntry, seed: number): GoldenDatasetHashes | null {
    if (!DatasetSeeds.SeedSet(entry.Kind, entry.Code, 'base').includes(seed)) return null;
    const pins = GoldenHashes.load();
    const key = GoldenHashes.Key(entry, seed);
    const pin = entry.Kind === 'world' ? pins.worlds[key] : pins.scenarios[key];
    if (!pin) throw new Error(`fixtures/golden-hashes.json has no pin for base seed ${key}`);
    return { RowsSha256: pin.rows, TruthSha256: pin.truth };
  }

  /** The sha256 of a generated dataset's `rows.csv` and `truth.csv` in `dir`. */
  public static Actual(dir: string): GoldenDatasetHashes {
    return { RowsSha256: GoldenHashes.sha256(path.join(dir, 'rows.csv')), TruthSha256: GoldenHashes.sha256(path.join(dir, 'truth.csv')) };
  }

  /**
   * Throws when the generated `rows.csv` or `truth.csv` of a base seed differs from its pin, so a stale or drifted
   * dataset is never loaded and graded. Seeds without a pin are not checked.
   */
  public static Verify(entry: CatalogEntry, seed: number, dir: string): void {
    const expected = GoldenHashes.Expected(entry, seed);
    if (!expected) return;
    const actual = GoldenHashes.Actual(dir);
    const key = GoldenHashes.Key(entry, seed);
    if (actual.RowsSha256 !== expected.RowsSha256) {
      throw new Error(`${key}: rows.csv in ${dir} has sha256 ${actual.RowsSha256}, golden-hashes.json pins ${expected.RowsSha256}`);
    }
    if (actual.TruthSha256 !== expected.TruthSha256) {
      throw new Error(`${key}: truth.csv in ${dir} has sha256 ${actual.TruthSha256}, golden-hashes.json pins ${expected.TruthSha256}`);
    }
  }

  private static load(): GoldenHashFile {
    if (!GoldenHashes.file) {
      const filePath = path.join(TruthSuite.Root(), 'fixtures', 'golden-hashes.json');
      const parsed = SafeJSONParse<GoldenHashFile>(readFileSync(filePath, 'utf8'));
      if (!parsed?.worlds || !parsed.scenarios) throw new Error(`${filePath} is not a golden-hash file`);
      GoldenHashes.file = parsed;
    }
    return GoldenHashes.file;
  }

  private static sha256(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  }
}
