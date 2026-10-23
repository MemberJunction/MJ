import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../truth-suite';
import { DataCache, type Json } from './cache';
import type { ScenarioID, WorldID } from '../harness/types';

export interface CatalogEntry {
  Kind: 'world' | 'scenario';
  Code: string;
  SpecFile: string;
  /** The generator's TypeScript entry point, relative to the package root; run with tsx (see `runGenerator`). */
  Generator: string;
}

/**
 * The modules every generator imports. Their source joins the cache key with the generator's own, so a change to the
 * shared CSV writer, people draw or Loom loader regenerates the data like a change to the generator does.
 */
const GENERATOR_SHARED_SOURCES = ['src/generators/gen_lib.ts', 'src/generators/loom.ts', 'src/generators/types.ts'] as const;

// `satisfies` ties each list to its union in harness/types, so an id outside the union is a compile error.
const WORLD_IDS = [
  'W1-signal', 'W2-noise', 'W3-leak-row', 'W4-pit', 'W5-censor',
  'W6-drift', 'W7-small-imbalanced', 'W8-highcard', 'W9-multiclass',
] as const satisfies readonly WorldID[];

const SCENARIO_IDS = [
  'C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r',
  'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T4',
] as const satisfies readonly ScenarioID[];

/** The derived scenario: generated from T3's output, not from a spec of its own. */
const DERIVED_SCENARIO_ID = 'T3-lag' satisfies ScenarioID;

export const CATALOG: readonly CatalogEntry[] = [
  ...WORLD_IDS.map((id): CatalogEntry => ({
    Kind: 'world',
    Code: id,
    SpecFile: `fixtures/worlds/${id}.json`,
    Generator: id === 'W9-multiclass' ? 'src/generators/make_world_multiclass.ts' : 'src/generators/make_world.ts',
  })),
  ...SCENARIO_IDS.map((id): CatalogEntry => ({
    Kind: 'scenario',
    Code: id,
    SpecFile: `fixtures/scenarios/specs/${id}.json`,
    Generator: 'src/generators/make_scenario.ts',
  })),
  {
    Kind: 'scenario',
    Code: DERIVED_SCENARIO_ID,
    SpecFile: 'fixtures/scenarios/specs/T3.json',
    Generator: 'src/generators/derive_t3_lag.ts',
  },
];

/** Dataset catalog lookup and on-demand cached generation. */
export class DatasetCatalog {
  private static readonly worldIDs: ReadonlySet<string> = new Set<WorldID>(WORLD_IDS);
  private static readonly scenarioIDs: ReadonlySet<string> = new Set<ScenarioID>([...SCENARIO_IDS, DERIVED_SCENARIO_ID]);

  /** True when `code` names a world of the catalog. */
  public static IsWorldID(code: string): code is WorldID {
    return DatasetCatalog.worldIDs.has(code);
  }

  /** True when `code` names a scenario of the catalog (T3-lag included). */
  public static IsScenarioID(code: string): code is ScenarioID {
    return DatasetCatalog.scenarioIDs.has(code);
  }

  /** Find a catalog entry by kind and ID. */
  public static Find(kind: 'world' | 'scenario', id: string): CatalogEntry {
    const entry = CATALOG.find((e) => e.Kind === kind && e.Code === id);
    if (!entry) throw new Error(`Dataset ${kind}/${id} not found in CATALOG`);
    return entry;
  }

  /** Compute the spec hash for a catalog entry. */
  public static EntrySpecHash(entry: CatalogEntry): string {
    const root = TruthSuite.Root();
    const spec = SafeJSONParse<{ [k: string]: Json }>(readFileSync(path.join(root, entry.SpecFile), 'utf8'));
    const genSource = [entry.Generator, ...GENERATOR_SHARED_SOURCES].map((f) => readFileSync(path.join(root, f), 'utf8')).join('\0');
    const loomPin = SafeJSONParse<{ sha: string }>(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
    if (!spec || !loomPin) throw new Error(`Failed to read spec or loom.json for ${entry.Code}`);
    return DataCache.SpecHash(spec, genSource, loomPin.sha);
  }

  /**
   * Run a generator in a child Node process with tsx's loader, from the package root (where tsx resolves). The
   * TypeScript source is what runs, so the code that generates is the code the cache key hashed, whether this module
   * runs from src/ or dist/.
   */
  private static runGenerator(genPath: string, args: readonly string[]): void {
    execFileSync(process.execPath, ['--import', 'tsx', genPath, ...args], { stdio: 'pipe', cwd: TruthSuite.Root() });
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
    const seedDir = DataCache.Dir(dataRoot, entry.Kind, entry.Code, specHash, seed);
    const completeMarker = path.join(seedDir, '.complete');
    if (DatasetCatalog.readIfPresent(completeMarker) !== null) {
      DatasetCatalog.updateIndex(dataRoot, entry.Kind, entry.Code, seed, seedDir);
      return seedDir;
    }

    mkdirSync(seedDir, { recursive: true });
    const genPath = path.join(root, entry.Generator);
    const specPath = path.join(root, entry.SpecFile);

    if (entry.Kind === 'world') {
      const hashRoot = path.dirname(seedDir);
      DatasetCatalog.runGenerator(genPath, [specPath, hashRoot, '--seeds', String(seed)]);
    } else if (entry.Code === 'T3-lag') {
      const t3Entry = DatasetCatalog.Find('scenario', 'T3');
      const t3Dir = await DatasetCatalog.EnsureGenerated(t3Entry, seed, dataRoot);
      DatasetCatalog.runGenerator(genPath, [t3Dir, seedDir]);
    } else {
      DatasetCatalog.runGenerator(genPath, [specPath, seedDir, '--seed', String(seed)]);
    }

    const requiredFiles = entry.Kind === 'world'
      ? ['rows.csv', 'truth.csv', 'people.csv', 'manifest.json']
      : ['rows.csv', 'truth.csv', 'manifest.json'];
    for (const f of requiredFiles) {
      if (!existsSync(path.join(seedDir, f))) {
        throw new Error(`Generator for ${entry.Code} seed ${seed} did not produce ${f} in ${seedDir}`);
      }
    }
    writeFileSync(completeMarker, `${specHash}\n`);
    DatasetCatalog.updateIndex(dataRoot, entry.Kind, entry.Code, seed, seedDir);
    return seedDir;
  }
}
