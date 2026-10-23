import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../registry/load';

/** Where the harness writes run output. */
export class HarnessPaths {
  /** `$TRUTH_RESULTS_DIR` (scripts/run-truth.mjs sets it), else `<TruthSuite>/.run/results`. */
  public static ResultsDir(): string {
    return process.env.TRUTH_RESULTS_DIR || path.join(TruthSuite.Root(), '.run', 'results');
  }
}

/** Artifact writer for the truth harness. */
export class HarnessArtifacts {
  /** Write `<results dir>/artifacts/<name>.json` and return its absolute path. */
  public static async WriteArtifact(name: string, data: object): Promise<string> {
    const artifactsDir = path.join(HarnessPaths.ResultsDir(), 'artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    const filePath = path.join(artifactsDir, `${name}.json`);
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
    return filePath;
  }
}
