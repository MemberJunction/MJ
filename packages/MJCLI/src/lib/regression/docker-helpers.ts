/**
 * Shared helpers for `mj test regression *` subcommands.
 *
 * The CLI commands themselves are thin oclif wrappers — they just spawn
 * `docker compose` / `bash` with the right flags. All the wiring (path
 * resolution, profile selection, error reporting) lives here so the same
 * conventions apply across every subcommand.
 */
import { spawn, execFileSync, type SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
 * folder convention. The CLI passes this to compose as `RUN_ID` so the
 * host knows the run's identity — and therefore its `test-results/<RUN_ID>/`
 * directory — from the moment it launches, instead of reverse-engineering it
 * from the `latest` symlink after the fact. `status`/`logs`/`rerun-failures`
 * all key off this.
 */
export function mintRunId(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `run-${ts}`;
}

/** Absolute host path to a run's output directory for a given run id. */
export function runDirFor(runId: string): string {
  return path.resolve(RESULTS_DIR, runId);
}

/**
 * Newest `run-*` directory under test-results, or null when none exist
 *. Picked by mtime so it survives a missing `latest` symlink.
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
 * path), else the newest run. Returns null when nothing resolves.
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

/** A run's incremental snapshot, normalized from results.partial.json. */
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
 * Read a run's incremental snapshot. Prefers results.partial.json (the
 * live snapshot, present mid-run and after a crash); falls back to a
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

/** Directory gen-forms writes the generated Angular entity forms into. */
export const GENERATED_FORMS_DIR = `${REGRESSION_DIR}/.docker-generated/MJExplorer-forms/Entities`;
/** Sidecar recording the schema fingerprint the current forms were generated against. */
export const FORMS_FINGERPRINT_FILE = `${REGRESSION_DIR}/.docker-generated/.fingerprint`;

// the generated Angular forms (and the entity classes / resolvers baked
// alongside them) are a pure function of the DB schema — i.e. of the same three
// inputs hashes for the DB snapshot: the migrations, the AssociationDB
// demo SQL, and the MJ build version (a proxy for CodeGen behavior across
// releases). We stamp that hash into .docker-generated/.fingerprint when
// gen-forms runs, so `build`/`up` can tell "the forms match the current schema"
// from "the forms are stale and would silently bake a schema that no longer
// matches the DB" (the stale-forms → runtime-missing-type failure class).
//
// This MIRRORS docker/regression/scripts/db-snapshot.cjs computeHash() — same
// input dirs, extensions, version suffix, and sha256/16 truncation. Keep the two
// in sync; they run in different contexts (that .cjs in-container over /app, this
// on the host over the monorepo root) so the logic is intentionally duplicated
// rather than shared across the container/host boundary.
const FORMS_HASH_INPUT_DIRS = ['migrations', 'Demos/AssociationDB'];
const FORMS_HASH_INPUT_EXTS = new Set(['.sql', '.md', '.sh', '.json', '.csv']);

/** All files under `dir`, depth-first, path-sorted for determinism. */
function walkSorted(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSorted(fp));
    else out.push(fp);
  }
  return out;
}

/** MJ monorepo version at `root` — the CodeGen-behavior proxy in the fingerprint. */
function readBuildVersion(root: string): string {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Stable sha256 (first 16 hex chars) over the schema inputs + MJ build version,
 * computed host-side against the monorepo `root` (default cwd). Deterministic:
 * same inputs → same fingerprint. See the block comment above for why this
 * mirrors db-snapshot.cjs.
 */
export function computeFormsFingerprint(root: string = process.cwd()): string {
  const h = createHash('sha256');
  for (const rel of FORMS_HASH_INPUT_DIRS) {
    const dirRoot = path.join(root, rel);
    if (!existsSync(dirRoot)) continue;
    for (const file of walkSorted(dirRoot)) {
      if (!FORMS_HASH_INPUT_EXTS.has(path.extname(file).toLowerCase())) continue;
      h.update(path.relative(root, file));
      // Wrap in Uint8Array: @types/node types createHash.update's BinaryLike as
      // Uint8Array<ArrayBuffer>, and a raw Buffer's ArrayBufferLike trips strict TS.
      h.update(new Uint8Array(readFileSync(file)));
    }
  }
  h.update('version:' + readBuildVersion(root));
  return h.digest('hex').slice(0, 16);
}

/** The fingerprint recorded alongside the current generated forms, or null if none. */
export function readFormsFingerprint(): string | null {
  const fp = path.resolve(FORMS_FINGERPRINT_FILE);
  if (!existsSync(fp)) return null;
  try {
    return readFileSync(fp, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Record `hash` as the fingerprint the current generated forms were built against. */
export function writeFormsFingerprint(hash: string): void {
  const fp = path.resolve(FORMS_FINGERPRINT_FILE);
  mkdirSync(path.dirname(fp), { recursive: true });
  writeFileSync(fp, hash + '\n', 'utf8');
}

/** Result of comparing the current schema fingerprint to the one the forms were built against. */
export interface FormsFingerprintStatus {
  /** True when the generated forms exist AND their fingerprint matches the current schema. */
  fresh: boolean;
  /** Human-readable reason when not fresh (empty when fresh). */
  reason: string;
  /** The fingerprint of the current on-disk schema inputs. */
  current: string;
  /** The fingerprint the existing forms were generated against, or null when unstamped. */
  recorded: string | null;
}

/**
 * Compare the generated forms against the current schema inputs. Forms
 * are "fresh" only when the output directory exists AND a fingerprint was
 * recorded AND it matches the current inputs. A missing directory, missing
 * fingerprint, or mismatch all report `fresh: false` with a specific reason.
 */
export function formsFingerprintStatus(root: string = process.cwd()): FormsFingerprintStatus {
  const current = computeFormsFingerprint(root);
  const recorded = readFormsFingerprint();
  if (!existsSync(path.resolve(GENERATED_FORMS_DIR))) {
    return { fresh: false, reason: 'generated forms are missing (.docker-generated/ not populated)', current, recorded };
  }
  if (recorded === null) {
    return { fresh: false, reason: 'generated forms have no fingerprint (generated before DR-C5, or manually)', current, recorded };
  }
  if (recorded !== current) {
    return {
      fresh: false,
      reason: `generated forms are stale — built against ${recorded}, current schema is ${current}`,
      current,
      recorded,
    };
  }
  return { fresh: true, reason: '', current, recorded };
}

// ─── composite build identity (APP_BUILD_HASH) ────────────────────────

/**
 * `git rev-parse --short=12 HEAD` for `root`, with a `-dirty` suffix when the
 * working tree has uncommitted changes (so local iteration never exact-matches a
 * committed build). Returns null when git is unavailable or `root` isn't a repo —
 * the caller then keys build identity on the schema hash alone.
 */
export function gitRevisionShort(root: string = process.cwd()): string | null {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    if (!sha) return null;
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim().length > 0;
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

/**
 * Mint the composite build identity the replay tier keys on. Layer 1's
 * `decideReplayTier` treats it as an OPAQUE string: an exact match
 * across runs unlocks the zero-heal `replay` fast path; any change demotes to the
 * safe `replay-with-heal` default. Shape:
 *
 *     <gitSha>:<schemaHash>          (e.g. "a1b2c3d4e5f6:9f8e7d6c5b4a3210")
 *     <gitSha>-dirty:<schemaHash>    (uncommitted working tree)
 *     <schemaHash>                   (git unavailable — graceful fallback)
 *
 * where `gitSha` captures source changes (TS logic, prompts) and `schemaHash` is
 * the forms fingerprint.
 *
 * NOTE: Decision D2 named THREE components — gitSha, the gen-forms fingerprint,
 * and the DB-snapshot hash. In THIS codebase the latter two are the SAME hash by
 * construction: `computeFormsFingerprint` explicitly mirrors `db-snapshot.cjs`
 * `computeHash` over the same inputs (migrations + Demos/AssociationDB + build
 * version). So they collapse to a single `schemaHash` rather than a redundant
 * duplicated third segment — two meaningful components, not three.
 */
export function computeAppBuildHash(root: string = process.cwd()): string {
  const git = gitRevisionShort(root);
  const schema = computeFormsFingerprint(root); // == the DB-snapshot hash, by construction
  return git ? `${git}:${schema}` : schema;
}

// ─── resource sizing ──────────────────────────────────────────────────

/**
 * Parse a docker-style memory string ("8g", "512m", "1024k", "4gb", or a bare
 * byte count) to bytes. Returns null when the input isn't a recognizable size,
 * so callers can reject a bad `--*-memory` flag with a clear error.
 */
export function parseMemoryToBytes(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([gmk]?)b?$/i.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1;
  return Math.round(n * mult);
}

/**
 * formula: the max number of browser workers a runner container of
 * `runnerMemBytes` can hold without OOM. Each Computer-Use worker drives a
 * Chromium context (~1.5 GiB); a fixed reserve covers the node/CLI process
 * itself (the `4 workers OOM'd the default-memory host` note in the plan is why
 * the per-worker budget is deliberately generous). Pure + deterministic, clamped
 * to [1, 12]. This SURFACES a suggestion (effective-config banner) — it does not
 * silently override an explicit `--workers`.
 */
export function suggestWorkers(
  runnerMemBytes: number,
  perWorkerBytes: number = Math.round(1.5 * 1024 ** 3),
  reserveBytes: number = 1024 ** 3,
): number {
  const usable = runnerMemBytes - reserveBytes;
  if (usable < perWorkerBytes) return 1;
  return Math.max(1, Math.min(12, Math.floor(usable / perWorkerBytes)));
}

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
  if (existsSync(COMPOSE_FILE)) return; // cwd IS the monorepo root — the happy path
 // (path hardening): distinguish "in a subdirectory OF a monorepo" — a
  // precise, actionable error — from "not in a monorepo at all" (the external
  // message). The old guard printed the generic message in both cases, so the
  // subdir case read like a broken checkout instead of a wrong cwd.
  const root = findMonorepoRoot();
  if (root) {
    process.stderr.write(
      `✗ 'mj test regression *' must be run from the MemberJunction monorepo root.\n` +
        `  You're in a subdirectory:  ${process.cwd()}\n` +
        `  Run:  cd ${root}\n`,
    );
  } else {
    process.stderr.write(
      `✗ Expected to find ${COMPOSE_FILE} relative to the current directory.\n` +
        `  'mj test regression *' commands must be run from the MemberJunction\n` +
        `  monorepo root. (Phase 8 will lift this requirement by publishing the\n` +
        `  test-runner image; for now, cd into the MJ repo first.)\n`,
    );
  }
  process.exit(1);
}

/**
 * Walk up from `startDir` (inclusive, through the filesystem root) looking for
 * the regression compose file — the sentinel that marks an MJ monorepo checkout
 * (present in every checkout, never in an external `npm i -g` install). Returns
 * the directory that contains it (the monorepo root), or null when none is found
 * at or above `startDir`. (the single walk-up root resolver.)
 */
export function findMonorepoRoot(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  const fsRoot = path.parse(dir).root;
  // Loop tests fsRoot too (the old isInsideMonorepo stopped one short of it).
  for (;;) {
    if (existsSync(path.join(dir, COMPOSE_FILE))) return dir;
    if (dir === fsRoot) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Soft check — returns true when there's an MJ monorepo at-or-above cwd.
 * Used by commands (compare, up, export, remote) to pick monorepo-relative
 * paths over external/published-image paths. Unlike `requireMonorepoRoot()`,
 * this does NOT exit on failure.
 */
export function isInsideMonorepo(startDir: string = process.cwd()): boolean {
  return findMonorepoRoot(startDir) !== null;
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
 * file, so an attached run leaves a complete console record on disk —
 * host-side, in the run dir, independent of the container-side `runner.log`
 * (Wave-0 slice). Resolves with the exit code; never rejects. A file-open
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
 * test-runner. The attached `up` starts these detached + waits for
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
