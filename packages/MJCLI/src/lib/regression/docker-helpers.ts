/**
 * Shared helpers for `mj test regression *` subcommands.
 *
 * The CLI commands themselves are thin oclif wrappers — they just spawn
 * `docker compose` / `bash` with the right flags. All the wiring (path
 * resolution, profile selection, error reporting) lives here so the same
 * conventions apply across every subcommand.
 */
import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REGRESSION_DIR = 'docker/regression';
export const COMPOSE_FILE = `${REGRESSION_DIR}/docker-compose.test.yml`;
export const BACPAC_OVERLAY = `${REGRESSION_DIR}/docker-compose.bacpac.yml`;
export const STANDALONE_COMPOSE = `${REGRESSION_DIR}/docker-compose.standalone.yml`;
export const BACPAC_STANDALONE_COMPOSE = `${REGRESSION_DIR}/docker-compose.bacpac-standalone.yml`;

/**
 * Package root of @memberjunction/cli (resolved from this compiled module at
 * dist/lib/regression/docker-helpers.js → up 3). Used to locate compose assets
 * bundled into the published package for external (no-monorepo) use.
 */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Resolve a standalone compose file. Prefers the monorepo copy (cwd-relative
 * `docker/regression/<name>`); falls back to the copy bundled into this CLI
 * package at build time (`<pkg>/regression-compose/<name>`) so external users
 * who only `npm i -g @memberjunction/cli` still have it. Returns the first path
 * that exists, or the bundled path (so the caller can surface a clear error).
 */
export function resolveStandaloneCompose(monorepoRelPath: string): string {
  const monorepo = path.resolve(monorepoRelPath);
  if (existsSync(monorepo)) return monorepo;
  const bundled = path.join(PKG_ROOT, 'regression-compose', path.basename(monorepoRelPath));
  return existsSync(bundled) ? bundled : monorepo;
}
export const ENV_FILE = `${REGRESSION_DIR}/.env.test`;
export const TARGETS_DIR = `${REGRESSION_DIR}/targets`;

/**
 * Mint a run id host-side, matching the entrypoint's `run-<utc-timestamp>`
 * folder convention (DR-F1). The CLI passes this to compose as `RUN_ID` so the
 * host knows the run's identity — and therefore its `test-results/<RUN_ID>/`
 * directory — from the moment it launches, instead of reverse-engineering it
 * from the `latest` symlink after the fact. `status`/`logs`/`rerun-failures`
 * (DR-F3/F4) all key off this.
 */
export function mintRunId(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `run-${ts}`;
}

/** Absolute host path to a run's output directory for a given run id (DR-F1). */
export function runDirFor(runId: string): string {
  return path.resolve(RESULTS_DIR, runId);
}

/**
 * Newest `run-*` directory under test-results, or null when none exist
 * (DR-F3). Picked by mtime so it survives a missing `latest` symlink.
 */
export function latestRunDir(): string | null {
  const base = path.resolve(RESULTS_DIR);
  if (!existsSync(base)) return null;
  const runs = readdirSync(base)
    .filter(n => n.startsWith('run-'))
    .map(n => path.join(base, n))
    .filter(p => { try { return statSync(p).isDirectory(); } catch { return false; } });
  if (runs.length === 0) return null;
  return runs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/**
 * Resolve which run directory a command targets: an explicit `--run` id (or a
 * path), else the newest run (DR-F3). Returns null when nothing resolves.
 */
export function resolveRunDir(runIdOrPath?: string): string | null {
  if (runIdOrPath) {
    const asPath = path.isAbsolute(runIdOrPath) || runIdOrPath.includes('/')
      ? path.resolve(runIdOrPath)
      : runDirFor(runIdOrPath);
    return existsSync(asPath) ? asPath : null;
  }
  return latestRunDir();
}

/** A run's incremental snapshot, normalized from results.partial.json (DR-D5). */
export interface RunSnapshot {
  runId: string;
  status: string;
  updatedAt?: string;
  completed: number;
  counts: { passed: number; failed: number; error: number; timeout: number; skipped: number; flaky: number };
  tests: Array<{ testId: string; testName: string; status: string; score: number; durationMs: number; workerIndex?: number; attempts?: number; flaky?: boolean }>;
  source: 'partial' | 'final' | 'none';
}

/**
 * Read a run's incremental snapshot (DR-F3). Prefers results.partial.json (the
 * DR-D5 live snapshot, present mid-run and after a crash); falls back to a
 * minimal view derived from a completed results.json; returns a `none` snapshot
 * when neither is parseable. Never throws.
 */
export function readRunSnapshot(runDir: string): RunSnapshot {
  const runId = path.basename(runDir);
  const empty = { passed: 0, failed: 0, error: 0, timeout: 0, skipped: 0, flaky: 0 };
  const partialPath = path.join(runDir, 'results.partial.json');
  if (existsSync(partialPath)) {
    try {
      const p = JSON.parse(readFileSync(partialPath, 'utf8'));
      return {
        runId,
        status: p.status ?? 'Unknown',
        updatedAt: p.updatedAt,
        completed: p.completed ?? (p.tests?.length ?? 0),
        counts: { ...empty, ...(p.counts ?? {}) },
        tests: p.tests ?? [],
        source: 'partial',
      };
    } catch { /* fall through */ }
  }
  const finalPath = path.join(runDir, 'results.json');
  if (existsSync(finalPath)) {
    try {
      const f = JSON.parse(readFileSync(finalPath, 'utf8'));
      const tests = f.testResults ?? [];
      const counts = { ...empty };
      for (const t of tests) {
        if (t.status === 'Passed') counts.passed++;
        else if (t.status === 'Failed') counts.failed++;
        else if (t.status === 'Error') counts.error++;
        else if (t.status === 'Timeout') counts.timeout++;
        else if (t.status === 'Skipped') counts.skipped++;
        if (t.flaky) counts.flaky++;
      }
      return {
        runId,
        status: f.status ?? 'Completed',
        completed: tests.length,
        counts,
        tests: tests.map((t: Record<string, unknown>) => ({
          testId: t.testId, testName: t.testName, status: t.status, score: t.score,
          durationMs: t.durationMs, workerIndex: t.workerIndex, attempts: t.attempts, flaky: t.flaky,
        })),
        source: 'final',
      };
    } catch { /* fall through */ }
  }
  return { runId, status: 'Unknown', completed: 0, counts: empty, tests: [], source: 'none' };
}
export const LOAD_TARGET_SCRIPT = `${REGRESSION_DIR}/scripts/load-target-profile.cjs`;
export const GEN_FORMS_SCRIPT = `${REGRESSION_DIR}/gen-forms.sh`;
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
 * Soft check — returns true when there's an MJ monorepo at-or-above cwd.
 * Used by commands (compare, up, export, remote) to pick monorepo-relative
 * paths over external/published-image paths. Unlike `requireMonorepoRoot()`,
 * this does NOT exit on failure.
 *
 * The sentinel is the regression base compose file: it lives in every
 * monorepo checkout and is never present in an external `npm i -g` install.
 */
export function isInsideMonorepo(startDir: string = process.cwd()): boolean {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (existsSync(path.join(dir, COMPOSE_FILE))) return true;
    dir = path.dirname(dir);
  }
  return false;
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
 * Spawn a child and TEE its stdout+stderr to both this process's streams and a
 * file (DR-F2), so an attached run leaves a complete console record on disk —
 * host-side, in the run dir, independent of the container-side `runner.log`
 * (DR-F2 Wave-0 slice). Resolves with the exit code; never rejects. A file-open
 * failure degrades to terminal-only (best-effort). stdin is inherited.
 */
export function spawnTee(
  command: string,
  args: string[],
  teeFilePath: string,
  options: SpawnOptions = {},
): Promise<number> {
  return new Promise((resolve) => {
    let fileStream: ReturnType<typeof createWriteStream> | undefined;
    try {
      mkdirSync(path.dirname(teeFilePath), { recursive: true });
      fileStream = createWriteStream(teeFilePath, { flags: 'a' });
    } catch {
      fileStream = undefined; // tee to terminal only
    }
    const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'], ...options });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (c: string) => { process.stdout.write(c); fileStream?.write(c); });
    child.stderr?.on('data', (c: string) => { process.stderr.write(c); fileStream?.write(c); });
    child.on('exit', (code) => { fileStream?.end(); resolve(code ?? 1); });
    child.on('error', (err) => {
      process.stderr.write(`✗ failed to spawn ${command}: ${err.message}\n`);
      fileStream?.end();
      resolve(1);
    });
  });
}

/**
 * Infrastructure services of the `full` profile — everything except the
 * test-runner (DR-F2). The attached `up` starts these detached + waits for
 * health, then runs the test-runner in the foreground so its exit code (the
 * suite verdict) propagates. Order is informational; compose resolves the
 * dependency graph itself.
 */
export const FULL_INFRA_SERVICES = ['sqlserver', 'db-setup', 'mjapi', 'mjexplorer'];

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

/**
 * Build a `docker run …` argument list for the published image (external,
 * no-monorepo path). Mounts are [hostPath, containerPath] pairs; envFile is
 * injected with `--env-file`; `host.docker.internal` is always mapped so a DB
 * published on the host is reachable on Linux too.
 */
export function dockerRunArgs(
  image: string,
  subArgs: string[],
  opts: { mounts?: Array<[string, string]>; envFile?: string } = {},
): string[] {
  const args = ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway'];
  if (opts.envFile && existsSync(opts.envFile)) {
    args.push('--env-file', opts.envFile);
  }
  for (const [hostPath, containerPath] of opts.mounts ?? []) {
    args.push('-v', `${hostPath}:${containerPath}`);
  }
  args.push(image, ...subArgs);
  return args;
}
