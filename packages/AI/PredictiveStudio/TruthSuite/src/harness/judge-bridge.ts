import { existsSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { TruthSuite } from '../truth-suite';
import { HarnessProcess } from './process';

/** Subprocess bridge from TypeScript gate bodies to `truthsuite.judges.<module>`. */
export class JudgeBridge {
  /**
   * Run `python -m truthsuite.judges.<module> ...args` and parse stdout as JSON. The interpreter is resolved the way
   * `MLSidecar` resolves its own (`PREDICTIVE_STUDIO_PYTHON`, then the bundled venv — here the TruthSuite's `.venv`).
   */
  public static async Judge<TOut>(module: string, args: string[]): Promise<TOut> {
    const root = TruthSuite.Root();
    const venvPython = path.join(root, '.venv', 'bin', 'python');
    const bundled = existsSync(venvPython) ? venvPython : null;
    if (bundled === null && !process.env[MLSidecar.PythonEnvVar]?.trim()) {
      throw new Error(`TruthSuite Python not found at ${venvPython}. Run \`pnpm run setup:python\`.`);
    }
    const python = MLSidecar.ResolvePython(undefined, process.env, bundled);
    const pythonDir = path.join(root, 'python');
    const { Code, Stdout, Stderr } = await HarnessProcess.Run(python, ['-m', `truthsuite.judges.${module}`, ...args], {
      Cwd: pythonDir,
      Env: { ...process.env, PYTHONPATH: pythonDir },
    });
    if (Code !== 0) {
      throw new Error(`truthsuite.judges.${module} exited ${Code}: ${Stderr.trim() || Stdout.trim()}`);
    }
    const parsed = SafeJSONParse<TOut>(Stdout.trim());
    if (parsed === null) {
      throw new Error(`truthsuite.judges.${module} did not print valid JSON: ${Stdout.slice(0, 400)}`);
    }
    return parsed;
  }
}
