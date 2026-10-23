import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../registry/load';
import { DataCache, type Json } from './cache';

export interface CatalogEntry {
  Kind: 'world' | 'scenario';
  ID: string;
  SpecFile: string;
  Generator: string;
}

const WORLD_IDS = [
  'W1-signal', 'W2-noise', 'W3-leak-row', 'W4-pit', 'W5-censor',
  'W6-drift', 'W7-small-imbalanced', 'W8-highcard', 'W9-multiclass',
] as const;

const SCENARIO_IDS = [
  'C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r',
  'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T4',
] as const;

export const CATALOG: readonly CatalogEntry[] = [
  ...WORLD_IDS.map((id): CatalogEntry => ({
    Kind: 'world',
    ID: id,
    SpecFile: `fixtures/worlds/${id}.json`,
    Generator: id === 'W9-multiclass' ? 'generators/make_world_multiclass.mjs' : 'generators/make_world.mjs',
  })),
  ...SCENARIO_IDS.map((id): CatalogEntry => ({
    Kind: 'scenario',
    ID: id,
    SpecFile: `fixtures/scenarios/specs/${id}.json`,
    Generator: 'generators/make_scenario.mjs',
  })),
  {
    Kind: 'scenario',
    ID: 'T3-lag',
    SpecFile: 'fixtures/scenarios/specs/T3.json',
    Generator: 'generators/derive_t3_lag.mjs',
  },
];

/** Dataset catalog lookup and on-demand cached generation. */
export class DatasetCatalog {
  /** Find a catalog entry by kind and ID. */
  public static Find(kind: 'world' | 'scenario', id: string): CatalogEntry {
    const entry = CATALOG.find((e) => e.Kind === kind && e.ID === id);
    if (!entry) throw new Error(`Dataset ${kind}/${id} not found in CATALOG`);
    return entry;
  }

  /** Compute the spec hash for a catalog entry. */
  public static EntrySpecHash(entry: CatalogEntry): string {
    const root = TruthSuite.Root();
    const spec = SafeJSONParse<{ [k: string]: Json }>(readFileSync(path.join(root, entry.SpecFile), 'utf8'));
    const genSource = readFileSync(path.join(root, entry.Generator), 'utf8');
    const loomPin = SafeJSONParse<{ sha: string }>(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
    if (!spec || !loomPin) throw new Error(`Failed to read spec or loom.json for ${entry.ID}`);
    return DataCache.SpecHash(spec, genSource, loomPin.sha);
  }

  /** The file's text, or null when it does not exist (read directly rather than checked first, so there is no race). */
  private static readIfPresent(filePath: string): string | null {
    try {
      return readFileSync(filePath, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  private static updateIndex(dataRoot: string, kind: 'world' | 'scenario', id: string, seed: number, seedDir: string): void {
    const indexPath = path.join(dataRoot, 'index.json');
    const existing = SafeJSONParse<Record<string, string>>(DatasetCatalog.readIfPresent(indexPath) ?? '{}') || {};
    const key = `${kind}/${id}/seed-${seed}`;
    if (existing[key] !== seedDir) {
      existing[key] = seedDir;
      mkdirSync(dataRoot, { recursive: true });
      writeFileSync(indexPath, `${JSON.stringify(existing, null, 2)}\n`);
    }
  }

  /**
   * Ensure `seed` of `entry` is generated under `dataRoot`. Returns the seed directory once `.complete` exists.
   */
  public static async EnsureGenerated(entry: CatalogEntry, seed: number, dataRoot: string = DataCache.Root()): Promise<string> {
    const root = TruthSuite.Root();
    const specHash = DatasetCatalog.EntrySpecHash(entry);
    const seedDir = DataCache.Dir(dataRoot, entry.Kind, entry.ID, specHash, seed);
    const completeMarker = path.join(seedDir, '.complete');
    if (DatasetCatalog.readIfPresent(completeMarker) !== null) {
      DatasetCatalog.updateIndex(dataRoot, entry.Kind, entry.ID, seed, seedDir);
      return seedDir;
    }

    mkdirSync(seedDir, { recursive: true });
    const genPath = path.join(root, entry.Generator);
    const specPath = path.join(root, entry.SpecFile);

    if (entry.Kind === 'world') {
      const hashRoot = path.dirname(seedDir);
      execFileSync(process.execPath, [genPath, specPath, hashRoot, '--seeds', String(seed)], { stdio: 'pipe' });
    } else if (entry.ID === 'T3-lag') {
      const t3Entry = DatasetCatalog.Find('scenario', 'T3');
      const t3Dir = await DatasetCatalog.EnsureGenerated(t3Entry, seed, dataRoot);
      execFileSync(process.execPath, [genPath, t3Dir, seedDir], { stdio: 'pipe' });
    } else {
      execFileSync(process.execPath, [genPath, specPath, seedDir, '--seed', String(seed)], { stdio: 'pipe' });
    }

    const requiredFiles = entry.Kind === 'world'
      ? ['rows.csv', 'truth.csv', 'people.csv', 'manifest.json']
      : ['rows.csv', 'truth.csv', 'manifest.json'];
    for (const f of requiredFiles) {
      if (!existsSync(path.join(seedDir, f))) {
        throw new Error(`Generator for ${entry.ID} seed ${seed} did not produce ${f} in ${seedDir}`);
      }
    }
    writeFileSync(completeMarker, `${specHash}\n`);
    DatasetCatalog.updateIndex(dataRoot, entry.Kind, entry.ID, seed, seedDir);
    return seedDir;
  }
}
