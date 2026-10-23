import { createHash } from 'node:crypto';
import path from 'node:path';
import { Canonicalize } from '@memberjunction/global';
import { TruthSuite } from '../truth-suite';

/** A JSON value as the specs hold it. */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** The generated-data cache: its root, its key (spec hash) and a seed's directory. */
export class DataCache {
  /** `$TRUTH_DATA_DIR`, else `TruthSuite/.data`. */
  public static Root(): string {
    return process.env.TRUTH_DATA_DIR || path.join(TruthSuite.Root(), '.data');
  }

  /**
   * sha256 of the canonical spec (MJGlobal `Canonicalize`: object keys sorted at every level, so key order never changes
   * the hash), the generator's source and the Loom pin: any of the three changing regenerates.
   */
  public static SpecHash(spec: { [k: string]: Json }, generatorSource: string, loomSha: string): string {
    return createHash('sha256').update(Canonicalize(spec)).update('\0').update(generatorSource).update('\0').update(loomSha).digest('hex');
  }

  /** `<root>/<kind>/<id>/<specHash12>/seed-<k>`. */
  public static Dir(dataRoot: string, kind: 'world' | 'scenario', id: string, specHash: string, seed: number): string {
    return path.join(dataRoot, kind, id, specHash.slice(0, 12), `seed-${seed}`);
  }
}
