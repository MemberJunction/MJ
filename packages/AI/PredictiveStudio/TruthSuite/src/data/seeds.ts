import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../truth-suite';

export type SeedSetName = 'base' | 't2' | 'n400';
interface WorldSpecSeeds { seeds: number[]; freshSeed: number }
interface ScenarioSpecSeed { seed: number }

/** The fixed seed sets of every dataset. */
export class DatasetSeeds {
  /**
   * The seeds of `set` for a world or scenario: `base` from its spec file; `t2` the fixed W2-noise range s100–s159;
   * `n400` W2-noise s100–s499, or a scenario's spec seed followed by spec*1000+1 … spec*1000+399.
   */
  public static SeedSet(kind: 'world' | 'scenario', id: string, set: SeedSetName): number[] {
    if (kind === 'world') {
      const spec = SafeJSONParse<WorldSpecSeeds>(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'worlds', `${id}.json`), 'utf8'));
      if (!spec) throw new Error(`Invalid world spec JSON for ${id}`);
      if (set === 'base') return [...spec.seeds, spec.freshSeed];
      if (id !== 'W2-noise') throw new Error(`seed set ${set} is defined only for W2-noise among the worlds`);
      return DatasetSeeds.range(100, set === 't2' ? 60 : 400);
    }
    if (set === 't2') throw new Error('seed set t2 is defined only for W2-noise');
    const specId = id === 'T3-lag' ? 'T3' : id;
    const spec = SafeJSONParse<ScenarioSpecSeed>(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'scenarios', 'specs', `${specId}.json`), 'utf8'));
    if (!spec) throw new Error(`Invalid scenario spec JSON for ${specId}`);
    if (set === 'base') return [spec.seed];
    return [spec.seed, ...DatasetSeeds.range(spec.seed * 1000 + 1, 399)];
  }

  /** `count` consecutive seeds starting at `first`. */
  private static range(first: number, count: number): number[] {
    return Array.from({ length: count }, (_, i) => first + i);
  }
}
