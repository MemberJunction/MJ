import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeJSONParse } from '@memberjunction/global';
import type { GateEntry } from './types';

/** Where the TruthSuite package lives on disk. */
export class TruthSuite {
  /** Absolute path of the TruthSuite package root (works from src/ under vitest and from dist/). */
  public static Root(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  }
}

/** The 111-gate registry (`gates/gates.json`): loading and lookup by test name. */
export class GateRegistry {
  /** Parse the registry file; `GateRegistryValidator.Validate` checks the shape the parse returns. */
  public static Load(file: string = path.join(TruthSuite.Root(), 'gates', 'gates.json')): GateEntry[] {
    return SafeJSONParse<GateEntry[]>(readFileSync(file, 'utf8')) || [];
  }

  /** The gate whose `TestName` is exactly `testName`; throws when there is none (a body for an unregistered gate). */
  public static Find(registry: readonly GateEntry[], testName: string): GateEntry {
    const gate = registry.find((g) => g.TestName === testName);
    if (!gate) throw new Error(`No gate named "${testName}" in gates/gates.json`);
    return gate;
  }
}
