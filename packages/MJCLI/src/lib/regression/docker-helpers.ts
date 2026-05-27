/**
 * Shared helpers for `mj test regression *` subcommands.
 *
 * The CLI commands themselves are thin oclif wrappers — they just spawn
 * `docker compose` / `bash` with the right flags. All the wiring (path
 * resolution, profile selection, error reporting) lives here so the same
 * conventions apply across every subcommand.
 */
import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const REGRESSION_DIR = 'docker/regression';
export const COMPOSE_FILE = `${REGRESSION_DIR}/docker-compose.test.yml`;
export const ENV_FILE = `${REGRESSION_DIR}/.env.test`;
export const TARGETS_DIR = `${REGRESSION_DIR}/targets`;
export const LOAD_TARGET_SCRIPT = `${REGRESSION_DIR}/scripts/load-target-profile.cjs`;
export const GEN_FORMS_SCRIPT = `${REGRESSION_DIR}/gen-forms.sh`;
export const EXAMPLES_DIR = `${REGRESSION_DIR}/examples`;
export const RESULTS_DIR = `${REGRESSION_DIR}/test-results`;
export const INLINE_REPORT_SCRIPT = `${REGRESSION_DIR}/scripts/inline-report.cjs`;

/**
 * The pinned runner image tag used when `init` (and future external invocations)
 * shell out to `docker run memberjunction/agentic-test-runner …`. Kept here so
 * a single bump updates every CLI command that consumes the image. The
 * version is pinned to the most recent release that includes Phase 8.
 */
export const AGENTIC_TEST_RUNNER_IMAGE = 'memberjunction/agentic-test-runner:latest';

/**
 * Verify the current working directory is the MJ monorepo root. If it isn't,
 * print a helpful message and exit. Phase 4 still requires the user to be in
 * the monorepo; Phase 8 will publish the docker image and lift this guard.
 */
export function requireMonorepoRoot(): void {
  if (!existsSync(COMPOSE_FILE)) {
    process.stderr.write(
      `✗ Expected to find ${COMPOSE_FILE} relative to the current directory.\n` +
        `  'mj test regression *' commands must be run from the MemberJunction\n` +
        `  monorepo root. (Phase 8 will lift this requirement by publishing the\n` +
        `  test-runner image; for now, cd into the MJ repo first.)\n`,
    );
    process.exit(1);
  }
}

/**
 * Walk up from cwd looking for `docker/regression/examples/`. Returns the
 * absolute path to the examples dir when found, or null when the cwd isn't
 * under an MJ monorepo checkout. Used by `init` to decide whether to copy
 * examples locally or shell out to `docker run` against the published image.
 */
export function findMonorepoExamplesDir(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, EXAMPLES_DIR);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Soft check — returns true when there's an MJ monorepo at-or-above cwd.
 * Used by `init` to pick the local-copy path over the docker-run path.
 * Unlike `requireMonorepoRoot()`, this does NOT exit on failure.
 */
export function isInsideMonorepo(): boolean {
  return findMonorepoExamplesDir() !== null;
}

/** Returns true when `<cwd>/<ENV_FILE>` exists (e.g. user copied .env.test.example). */
export function envFileExists(): boolean {
  return existsSync(ENV_FILE);
}

/**
 * Spawn a child process inheriting stdio. Resolves with the exit code.
 * The promise NEVER rejects on a non-zero exit code — callers inspect the
 * resolved number and propagate it to the user.
 */
export function spawnInherit(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`✗ failed to spawn ${command}: ${err.message}\n`);
      resolve(1);
    });
  });
}

/**
 * Capture stdout from a child process (stderr inherited so errors surface).
 * Resolves with { code, stdout }. Used by the remote subcommand to read the
 * target-profile loader's JSON output without printing it to the user.
 */
export function spawnCapture(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'inherit'],
      ...options,
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('exit', (code) => resolve({ code: code ?? 1, stdout }));
    child.on('error', (err) => {
      process.stderr.write(`✗ failed to spawn ${command}: ${err.message}\n`);
      resolve({ code: 1, stdout: '' });
    });
  });
}

/**
 * Build the base `docker compose -f <file> --env-file <file>` argument list.
 * Optionally prepends a profile and additional overlay files (Mode D).
 *
 * Overlays are passed as additional `-f` flags AFTER the base compose file —
 * compose merges them in order, so later overlays override earlier ones.
 * Relative paths inside an overlay resolve against the FIRST `-f` file's
 * directory (the base compose file at `docker/regression/`), NOT against the
 * overlay's own location.
 */
export function dockerComposeArgs(
  profile?: string,
  extra: string[] = [],
  overlays: string[] = [],
): string[] {
  const args = ['compose', '-f', COMPOSE_FILE];
  for (const overlay of overlays) {
    args.push('-f', overlay);
  }
  if (envFileExists()) {
    args.push('--env-file', ENV_FILE);
  }
  if (profile) {
    args.push('--profile', profile);
  }
  return args.concat(extra);
}

/**
 * Resolve a target-profile argument to an absolute path. Accepts:
 *   - "staging-mj"                  → docker/regression/targets/staging-mj.target.json
 *   - "staging-mj.target.json"      → docker/regression/targets/staging-mj.target.json
 *   - "./my/elsewhere.target.json"  → ./my/elsewhere.target.json (passthrough)
 *   - absolute path                 → unchanged
 */
export function resolveTargetPath(input: string): string {
  if (path.isAbsolute(input)) return input;
  if (input.includes('/')) return path.resolve(input);
  const withSuffix = input.endsWith('.target.json') ? input : `${input}.target.json`;
  return path.resolve(TARGETS_DIR, withSuffix);
}
