import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../registry/load';

/** Artifact writer for the truth harness. */
export class HarnessArtifacts {
  /** Write `$TRUTH_RESULTS_DIR/artifacts/<name>.json` and return its absolute path. */
  public static async WriteArtifact(name: string, data: object): Promise<string> {
    const resultsDir =
      process.env.TRUTH_RESULTS_DIR || path.join(TruthSuite.Root(), 'results', process.env.TRUTH_RUN_ID || 'local');
    const artifactsDir = path.join(resultsDir, 'artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    const filePath = path.join(artifactsDir, `${name}.json`);
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
    return filePath;
  }
}
