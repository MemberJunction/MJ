import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../registry/load';

/** Subprocess bridge from TypeScript gate bodies to `truthsuite.judges.<module>`. */
export class JudgeBridge {
  /** Spawn `<TruthSuite>/.venv/bin/python -m truthsuite.judges.<module> ...args` and parse stdout as JSON. */
  public static async Judge<TOut>(module: string, args: string[]): Promise<TOut> {
    const root = TruthSuite.Root();
    const fromEnv = process.env.PREDICTIVE_STUDIO_PYTHON?.trim();
    const venvPython = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(root, '.venv', 'bin', 'python');
    if (!existsSync(venvPython)) {
      throw new Error(`TruthSuite Python not found at ${venvPython}. Run \`pnpm run setup:python\`.`);
    }

    const pythonDir = path.join(root, 'python');
    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONPATH: pythonDir };
    if (process.platform === 'darwin' && existsSync('/opt/homebrew/opt/libomp/lib')) {
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
        ? `/opt/homebrew/opt/libomp/lib:${env.DYLD_LIBRARY_PATH}`
        : '/opt/homebrew/opt/libomp/lib';
    }

    const { code, stdout, stderr } = await new Promise<{ code: number; stdout: string; stderr: string }>((resolvePromise, reject) => {
      const child = spawn(venvPython, ['-m', `truthsuite.judges.${module}`, ...args], {
        cwd: pythonDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        err += d.toString();
      });
      child.on('error', reject);
      child.on('close', (c: number | null) => resolvePromise({ code: c ?? -1, stdout: out, stderr: err }));
    });

    if (code !== 0) {
      throw new Error(`truthsuite.judges.${module} exited ${code}: ${stderr.trim() || stdout.trim()}`);
    }
    const parsed = SafeJSONParse<TOut>(stdout.trim());
    if (parsed === null) {
      throw new Error(`truthsuite.judges.${module} did not print valid JSON: ${stdout.slice(0, 400)}`);
    }
    return parsed;
  }
}
