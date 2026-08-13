/**
 * pnpm process invocations for `mj dev workspace`.
 *
 * SIDE EFFECTS: spawns the `pnpm` binary. This is the only module in the
 * dev-workspace feature that starts child processes. The spawner is injectable
 * (narrow structural type) so tests never fork.
 *
 * @module lib/dev-workspace/pnpm
 */
import { spawn } from 'node:child_process';

/** `pnpm --version` gets this long before we give up (milliseconds). */
const VERSION_PROBE_TIMEOUT_MS = 15_000;

/** The stdio configurations this module uses. */
export type WorkspaceStdio = 'inherit' | ['ignore', 'pipe', 'ignore'];

/** The slice of a spawned child process this module consumes. */
export interface WorkspaceChildProcess {
  stdout?: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Narrow structural spawn signature — node's `spawn` satisfies it; tests inject fakes. */
export type SpawnWorkspaceProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; stdio: WorkspaceStdio }
) => WorkspaceChildProcess;

/**
 * Runs `pnpm install` at the parent directory with inherited stdio so the user
 * sees pnpm's own progress output. Rejects on a non-zero exit or when pnpm
 * cannot be spawned at all.
 */
export function RunPnpmInstall(parentDir: string, spawnFn: SpawnWorkspaceProcess = spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn('pnpm', ['install'], { cwd: parentDir, stdio: 'inherit' });
    child.on('error', (error: NodeJS.ErrnoException) => {
      const hint = error.code === 'ENOENT' ? ' (pnpm not found on PATH — `corepack enable` or install pnpm 10)' : '';
      reject(new Error(`Failed to run pnpm install${hint}: ${error.message}`));
    });
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm install exited with code ${code} at ${parentDir}`));
      }
    });
  });
}

/**
 * Returns the pnpm version active at the parent directory (`pnpm --version`),
 * or null when pnpm is not runnable there. Never throws — status reporting must
 * degrade gracefully on machines without pnpm. Bounded by a kill timeout.
 */
export function GetPnpmVersion(parentDir: string, spawnFn: SpawnWorkspaceProcess = spawn): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawnFn('pnpm', ['--version'], { cwd: parentDir, stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), VERSION_PROBE_TIMEOUT_MS);
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      const version = stdout.trim();
      resolve(code === 0 && /^\d+\.\d+\.\d+/.test(version) ? version : null);
    });
  });
}
