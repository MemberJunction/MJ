import { execFile } from 'node:child_process';
import { closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync, writeSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { promisify } from 'node:util';
import { BaseCatchTarget } from '../contracts/BaseCatchTarget';
import type { CandidateTest, ChangedLines, CoverageResult, ExecutionResult, PreparedRevision, RevisionRef } from '../types';
import type { Sandbox, SandboxMount, SandboxRunResult } from '../sandbox/Sandbox';
import type { GitRepo } from '../git/GitRepo';
import type { PackageMap } from '../analyzer/PackageMap';
import type { Settings } from '../settings';
import { ParseJitReport, ParseVitestJson, RunnerErrorResult, type ReportMapping } from './VitestReport';
import { JIT_REPORTER_ARG, JIT_REPORTER_MOUNT, WriteJitReporter } from './JitReporter';
import { StripPatchInfo } from './LockfileStrip';
import { RedactTail } from '../sandbox/Redaction';
import { PurgeNonRegularEntries } from './JitFolder';

const execFileAsync = promisify(execFile);
/** Runs one trusted command on the host and returns its stdout. Injected so tests see the calls; the default is execFile. */
export type HostRunner = (file: string, args: string[], cwd: string) => Promise<string>;
/** The environment host pnpm runs with: `PATH`, `HOME`, `TMPDIR` when set, and `CI=1`. No key or token reaches it. */
export function HostEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of ['PATH', 'HOME', 'TMPDIR']) { const v = env[name]; if (v) out[name] = v; }
    return { ...out, CI: '1' };
}
const DEFAULT_HOST_RUNNER: HostRunner = async (file, args, cwd) => (await execFileAsync(file, args, { cwd, maxBuffer: 64 * 1024 * 1024, env: HostEnv() })).stdout;
/** `StoreDir` is the pnpm store for one run only: the sandbox install writes patched files into it, so no other run may use it. */
export interface TargetOptions { Repo: GitRepo; Sandbox: Sandbox; Settings: Settings; WorkRoot: string; PackageMap: PackageMap; StoreDir: string; HostRunner?: HostRunner; }
/** A revision could not be prepared (host fetch or sandbox install). The PR is an infrastructure failure, not a test result. */
export class InfrastructureError extends Error {}
/** A host path the target refuses to write through or mount read-write: a symlink, a non-folder, or a folder outside the worktree. */
export class UnsafePathError extends Error {}

const CONTAINER_ROOT = '/work';
const CONTAINER_STORE = '/pnpm-store';
const JIT_SUBDIR = 'src/__tests__/jit';
/**
 * Platforms `pnpm fetch` downloads native optional packages for: the host's own and the image's (linux x64 or arm64),
 * so the offline install in the sandbox finds esbuild, rollup and swc binaries for linux.
 */
const FETCH_WORKSPACE_YAML = 'supportedArchitectures:\n  os: [current, linux]\n  cpu: [current, x64, arm64]\n  libc: [current, glibc]\n';
const NO_TEST_RAN = 'no test ran: every test in the file was skipped or todo';
/** States in which a test body actually ran, in the custom report and in vitest's JSON report. */
const RAN_STATES = new Set(['passed', 'failed']);

/** One package's slice of a run: its folder, its tests and the test files relative to the package. */
interface PackageGroup { Dir: string; Tests: CandidateTest[]; Files: string[]; }

/** Runs generated vitest tests on one git revision. Every install, build and test command runs in the sandbox (D28). */
export class VitestCatchTarget extends BaseCatchTarget {
    private readonly sandbox: Sandbox;
    private reporter: string | null = null;
    constructor(private readonly o: TargetOptions) { super(); this.sandbox = o.Sandbox; }

    /**
     * Worktree on the host, then dependencies. The host never runs pnpm inside the worktree:
     * `pnpm install --ignore-scripts` would still load the revision's `.pnpmfile.cjs` and follow its
     * `packageManager`. The host fetches from a copy of the lockfile without patch information and reads
     * no patch file; the sandbox installs offline with the real lockfile and `patches/` and applies the patches.
     * When the fetch or the install fails, the worktree is removed before the error is rethrown; a removal failure does not replace that error.
     */
    public async Prepare(revision: RevisionRef): Promise<PreparedRevision> {
        const dir = join(this.o.WorkRoot, revision.Kind.toLowerCase());
        if (existsSync(dir)) await this.o.Repo.RemoveWorktree(dir).catch(() => rmSync(dir, { recursive: true, force: true }));
        await this.o.Repo.AddWorktree(dir, revision.SHA);
        const prepared: PreparedRevision = { Ref: revision, RootDir: dir };
        try {
            await this.hostFetch(revision);
            const install = `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir ${CONTAINER_STORE} && pnpm rebuild --store-dir ${CONTAINER_STORE}`;
            const r = await this.inSandbox(prepared, 'rw', ['sh', '-c', install], 30 * 60_000);
            if (r.ExitCode !== 0) throw new InfrastructureError(`install failed on ${revision.Kind}: ${RedactTail(tail(r))}`);
        } catch (e) {
            await this.Cleanup(prepared).catch(() => undefined);
            throw e;
        }
        return prepared;
    }

    /**
     * `pnpm fetch` on the host, in a folder that holds only host-written files: the revision's lockfile, read from git
     * as a blob (never through the worktree, where it could be a symlink), with the patch information removed, a `package.json` whose `packageManager` pins the image's pnpm, and a
     * `pnpm-workspace.yaml` that adds the image's platforms. pnpm switches itself to the pinned version, so the
     * store it writes has the layout the image reads. The version is checked first, in a separate folder that holds
     * only the pinning `package.json`, so no pnpm command runs next to the lockfile before the fetch.
     */
    private async hostFetch(revision: RevisionRef): Promise<void> {
        const fetchDir = join(this.o.WorkRoot, `${revision.Kind.toLowerCase()}-fetch`);
        const versionDir = join(this.o.WorkRoot, `${revision.Kind.toLowerCase()}-pnpm-version`);
        const pinned = this.o.Settings.Sandbox.PnpmVersion;
        const host = this.o.HostRunner ?? DEFAULT_HOST_RUNNER;
        const lock = await this.o.Repo.Show(revision.SHA, 'pnpm-lock.yaml').catch(() => null);
        if (lock === null) throw new InfrastructureError(`no pnpm-lock.yaml in ${revision.Kind} ${revision.SHA}`);
        try {
            const pin = JSON.stringify({ name: 'jit-fetch', private: true, packageManager: `pnpm@${pinned}` });
            for (const d of [fetchDir, versionDir]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'package.json'), pin); }
            mkdirSync(this.o.StoreDir, { recursive: true });
            writeFileSync(join(fetchDir, 'pnpm-lock.yaml'), StripPatchInfo(lock));
            writeFileSync(join(fetchDir, 'pnpm-workspace.yaml'), FETCH_WORKSPACE_YAML);
        } catch (e) {
            throw new InfrastructureError(`could not write the fetch folder for ${revision.Kind}: ${(e as Error).message}`);
        }
        await this.checkHostPnpm(host, versionDir, pinned);
        try { await host('pnpm', ['fetch', '--store-dir', this.o.StoreDir], fetchDir); }
        catch (e) { throw new InfrastructureError(`host pnpm fetch failed on ${revision.Kind}: ${RedactTail((e as Error).message)}`); }
    }

    /** Throws when the pnpm that runs in `versionDir` (pinned by its `package.json`) is not the pinned version; the version is the last non-empty output line. */
    private async checkHostPnpm(host: HostRunner, versionDir: string, pinned: string): Promise<void> {
        let actual: string;
        try { actual = (await host('pnpm', ['--version'], versionDir)).split('\n').map((l) => l.trim()).filter((l) => l.length > 0).pop() ?? ''; }
        catch (e) { throw new InfrastructureError(`host pnpm --version failed: ${RedactTail((e as Error).message)}`); }
        if (actual !== pinned) throw new InfrastructureError(`host pnpm is ${actual} with the pin, but the sandbox image uses ${pinned}`);
    }

    /** The names in `packages` whose folder holds a regular `package.json` in the revision; a package the revision does not have is left out. */
    public PackagesAt(revision: PreparedRevision, packages: string[]): string[] {
        return packages.filter((name) => {
            const dir = this.o.PackageMap.Get(name)?.Dir;
            return dir !== undefined && lstatSync(join(revision.RootDir, dir, 'package.json'), { throwIfNoEntry: false })?.isFile() === true;
        });
    }

    /**
     * `turbo run build --filter=<pkg>...` for the packages under test, minus `Sandbox.BuildExclude`, inside the sandbox with the
     * local cache only. Concurrency is one task per sandbox cpu: turbo's default of ten parallel compilers exceeds the memory cap.
     */
    public async BuildPackages(revision: PreparedRevision, packages: string[]): Promise<void> {
        if (packages.length === 0) return;
        const sandbox = this.o.Settings.Sandbox;
        const filters = [...packages.map((p) => `--filter=${p}...`), ...sandbox.BuildExclude.map((p) => `--filter=!${p}`)].join(' ');
        const cmd = `npx turbo run build ${filters} --concurrency=${Math.max(1, Math.floor(sandbox.Cpus))} --cache=local:rw,remote:r --log-order=stream --summarize`;
        const r = await this.inSandbox(revision, 'rw', ['sh', '-c', cmd], 45 * 60_000, { TURBO_CACHE_DIR: `${CONTAINER_ROOT}/.turbo/cache`, TURBO_TELEMETRY_DISABLED: '1' });
        this.keepTurboSummaries(revision);
        if (r.ExitCode !== 0) throw new Error(`build failed on ${revision.Ref.Kind}: ${RedactTail(tail(r))}`);
    }

    /**
     * Copies turbo's run summaries out of the worktree, so base and head task hashes can be compared (design §5.4, Q4).
     * Only regular `.json` files in real `.turbo/runs` folders are copied; symlinks and anything else are skipped.
     */
    private keepTurboSummaries(revision: PreparedRevision): void {
        const turbo = join(revision.RootDir, '.turbo'); const from = join(turbo, 'runs');
        if (!lstatOrNull(turbo)?.isDirectory() || !lstatOrNull(from)?.isDirectory()) return;
        const to = join(this.o.WorkRoot, 'turbo-summaries', revision.Ref.Kind.toLowerCase()); mkdirSync(to, { recursive: true });
        for (const f of readdirSync(from)) if (f.endsWith('.json') && lstatOrNull(join(from, f))?.isFile()) copyFileSync(join(from, f), join(to, f));
    }

    /**
     * Writes each test's source into its package's jit folder. Every folder from the worktree root down to the jit
     * folder must be a real folder inside the worktree, and the file is opened without following a symlink.
     */
    public async WriteTests(revision: PreparedRevision, tests: CandidateTest[]): Promise<void> {
        for (const t of tests) checkedFilePath(t, this.packageDir(t.Package));
        for (const t of tests) {
            const jit = SafeDir(revision.RootDir, `${this.packageDir(t.Package)}/${JIT_SUBDIR}`, true);
            writeNoFollow(join(jit, basename(t.FilePath)), t.Source);
        }
    }

    /**
     * Type-checks the jit files per package with the package's own compiler options. The package tsconfig
     * usually excludes tests, so a throwaway tsconfig in the jit folder extends it and includes only the jit files.
     */
    public async TypeCheck(revision: PreparedRevision, tests: CandidateTest[]): Promise<Map<string, string | null>> {
        const out = new Map<string, string | null>(tests.map((t) => [t.ID, null]));
        for (const g of this.groups(tests)) {
            const config = `${JIT_SUBDIR}/tsconfig.jit.json`;
            const json = JSON.stringify({ extends: '../../../tsconfig.json', compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false }, include: g.Files.map((f) => `./${f.slice(JIT_SUBDIR.length + 1)}`), exclude: [] });
            const cmd = `cd ${sq(`${CONTAINER_ROOT}/${g.Dir}`)} && printf '%s' ${sq(json)} > ${config} && npx tsc --noEmit --pretty false -p ${config} 2>&1; rc=$?; rm -f ${config}; exit $rc`;
            const r = await this.inSandbox(revision, 'ro', ['sh', '-c', cmd], 10 * 60_000, {}, [], [g.Dir]);
            for (const [i, t] of g.Tests.entries()) {
                const lines = r.Stdout.split('\n').filter((l) => l.startsWith(g.Files[i]));
                if (lines.length) out.set(t.ID, lines.join('\n').slice(0, 4000));
            }
            // tsc failed before checking any file (config or setup error): every test in the package fails type-check.
            if (r.ExitCode !== 0 && !/^\S.*\(\d+,\d+\): error TS/m.test(r.Stdout)) for (const t of g.Tests) out.set(t.ID, `tsc failed: ${SandboxEvidence(r)}`);
        }
        return out;
    }

    /** Runs each package's jit files once per repeat with the fixed seed; a test with no executed result is a RunnerError. */
    public async Run(revision: PreparedRevision, tests: CandidateTest[], repeats: number): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];
        for (const g of this.groups(tests)) {
            const mapping: ReportMapping = { FilePathToTestID: Object.fromEntries(g.Tests.map((t) => [t.FilePath, t.ID])), Revision: revision.Ref.Kind, RunIndex: 0 };
            for (let i = 0; i < repeats; i++) results.push(...await this.runRepeat(revision, g, { ...mapping, RunIndex: i }));
        }
        return results;
    }

    /** One repeat with the custom reporter; when its JIT_REPORT line is missing, the repeat runs once more with the JSON reporter. */
    private async runRepeat(revision: PreparedRevision, g: PackageGroup, m: ReportMapping): Promise<ExecutionResult[]> {
        const ids = g.Tests.map((t) => t.ID);
        const timedOut = () => RunnerErrorResult(ids, m.Revision, m.RunIndex, 'sandbox timed out').map((x) => ({ ...x, Status: 'Timeout' as const }));
        const base = `cd ${sq(`${CONTAINER_ROOT}/${g.Dir}`)} && npx vitest run ${g.Files.map(sq).join(' ')} --sequence.seed=${this.o.Settings.SequenceSeed} --testTimeout=${this.o.Settings.TestTimeoutMs}`;
        const timeout = this.o.Settings.TestTimeoutMs * (g.Files.length + 2) + 120_000;
        const r = await this.runVitest(revision, g, `${base} ${JIT_REPORTER_ARG}`, timeout);
        if (r.TimedOut) return timedOut();
        const parsed = ParseJitReport(r.Stdout, m);
        if (parsed) return markUnran(parsed, m, ranFilesFromJitReport(r.Stdout));
        // vitest writes the JSON report to a file in the rw jit folder and stdout carries only that file, so test chatter cannot mix in.
        const out = sq(`${CONTAINER_ROOT}/${g.Dir}/${JIT_SUBDIR}/.jit-report-${m.Revision.toLowerCase()}-${m.RunIndex}.json`);
        const j = await this.runVitest(revision, g, `${base} --reporter=json --outputFile=${out} >/dev/null 2>&1; cat ${out}; rm -f ${out}`, timeout);
        if (j.TimedOut) return timedOut();
        if (safeJson<object>(j.Stdout) === null) return RunnerErrorResult(ids, m.Revision, m.RunIndex, `vitest produced no report: ${SandboxEvidence(r)}`);
        return markUnran(ParseVitestJson(j.Stdout, m), m, ranFilesFromJson(j.Stdout));
    }

    private runVitest(revision: PreparedRevision, g: PackageGroup, cmd: string, timeoutMs: number): Promise<SandboxRunResult> {
        return this.inSandbox(revision, 'ro', ['sh', '-c', cmd], timeoutMs, { TZ: 'UTC' }, ViteTmpfs(g.Dir), [g.Dir]);
    }

    /**
     * Per test: how many changed lines its run executed, from a v8 coverage report written inside the container.
     * A test whose run wrote no readable report is left out, with one line on stderr.
     */
    public async Coverage(revision: PreparedRevision, tests: CandidateTest[], changed: ChangedLines): Promise<CoverageResult[]> {
        const out: CoverageResult[] = [];
        for (const g of this.groups(tests)) {
            for (const [i, t] of g.Tests.entries()) {
                const report = `/tmp/cov-${t.ID}`;
                const cmd = `cd ${sq(`${CONTAINER_ROOT}/${g.Dir}`)} && npx vitest run ${sq(g.Files[i])} --coverage.enabled --coverage.provider=v8 --coverage.reporter=json --coverage.reportsDirectory=${report} >/dev/null 2>&1; cat ${report}/coverage-final.json`;
                const r = await this.inSandbox(revision, 'ro', ['sh', '-c', cmd], 10 * 60_000, { TZ: 'UTC' }, ViteTmpfs(g.Dir), [g.Dir]);
                const covered = CountCoveredChangedLines(r.Stdout, changed, CONTAINER_ROOT);
                if (covered === null) { process.stderr.write(`coverage not measured for test ${t.ID} in ${g.Dir}: ${SandboxEvidence(r)}\n`); continue; }
                out.push({ CandidateTestID: t.ID, CoveredChangedLines: covered });
            }
        }
        return out;
    }

    public async Cleanup(revision: PreparedRevision): Promise<void> {
        await this.o.Repo.RemoveWorktree(revision.RootDir).catch(() => rmSync(revision.RootDir, { recursive: true, force: true }));
    }

    /** Removes the run's pnpm store and the `*-fetch` and `*-pnpm-version` folders under the work root. */
    public async RemoveStore(): Promise<void> {
        rmSync(this.o.StoreDir, { recursive: true, force: true });
        if (!existsSync(this.o.WorkRoot)) return;
        for (const e of readdirSync(this.o.WorkRoot, { withFileTypes: true })) {
            if (e.name.endsWith('-fetch') || e.name.endsWith('-pnpm-version')) rmSync(join(this.o.WorkRoot, e.name), { recursive: true, force: true });
        }
    }

    /** Tests grouped by package, with each test file relative to its package folder. Every FilePath is checked first. */
    private groups(tests: CandidateTest[]): PackageGroup[] {
        const byDir = new Map<string, PackageGroup>();
        for (const t of tests) {
            const dir = this.packageDir(t.Package); checkedFilePath(t, dir);
            const g = byDir.get(dir) ?? { Dir: dir, Tests: [], Files: [] };
            g.Tests.push(t); g.Files.push(t.FilePath.slice(dir.length + 1)); byDir.set(dir, g);
        }
        return [...byDir.values()];
    }
    private packageDir(name: string): string { const p = this.o.PackageMap.Get(name); if (!p) throw new Error(`unknown package ${name}`); return p.Dir; }

    /**
     * 'rw' is the prepare phase (install, rebuild, build) and also mounts the store. 'ro' is the test phase: the
     * worktree read-only, the jit folder of each package under test read-write, and the reporter read-only. After an
     * 'ro' run, every entry of those jit folders that is not a regular file is removed.
     */
    private async inSandbox(revision: PreparedRevision, mode: 'ro' | 'rw', command: string[], timeoutMs: number, env: Record<string, string> = {}, tmpfs: string[] = [], packageDirs: string[] = []): Promise<SandboxRunResult> {
        const mounts: SandboxMount[] = [{ Host: revision.RootDir, Container: CONTAINER_ROOT, Mode: mode }];
        const jitDirs = mode === 'ro' ? packageDirs.map((d) => SafeDir(revision.RootDir, `${d}/${JIT_SUBDIR}`, false)) : [];
        if (mode === 'rw') mounts.push({ Host: this.o.StoreDir, Container: CONTAINER_STORE, Mode: 'rw' });
        if (mode === 'ro') {
            packageDirs.forEach((d, i) => mounts.push({ Host: jitDirs[i], Container: `${CONTAINER_ROOT}/${d}/${JIT_SUBDIR}`, Mode: 'rw' }));
            mounts.push({ Host: this.reporterDir(), Container: JIT_REPORTER_MOUNT, Mode: 'ro' });
        }
        for (const t of tmpfs) EnsureMountPoint(revision.RootDir, t.slice(CONTAINER_ROOT.length + 1));
        try { return await this.sandbox.Run({ Mounts: mounts, Tmpfs: tmpfs, WorkDir: CONTAINER_ROOT, Command: command, TimeoutMs: timeoutMs, Env: { HOME: '/tmp', CI: '1', ...env } }); }
        finally { for (const j of jitDirs) PurgeNonRegularEntries(j); }
    }
    private reporterDir(): string { return (this.reporter ??= WriteJitReporter(mkdtempSync(join(tmpdir(), 'jit-reporter-')))); }
}

const TEST_ID = /^[A-Za-z0-9_-]+$/;

/** Throws unless the test's FilePath is exactly `<package dir>/src/__tests__/jit/<ID>.jit.test.ts` with a plain ID. */
function checkedFilePath(t: CandidateTest, dir: string): void {
    const expected = `${dir}/${JIT_SUBDIR}/${t.ID}.jit.test.ts`;
    if (!TEST_ID.test(t.ID) || t.FilePath !== expected) throw new UnsafePathError(`refusing test ${t.ID}: FilePath ${t.FilePath} is not ${expected}`);
}

/** Single-quotes a value for `sh -c`. */
function sq(value: string): string { return `'${value.replace(/'/g, `'\\''`)}'`; }

/**
 * Walks `rel` below `root` one part at a time. Each part must be a real folder, not a symlink; missing parts are
 * created when `create` is true and refused otherwise. The real path of the result must lie inside the real root.
 */
export function SafeDir(root: string, rel: string, create: boolean): string {
    let p = root;
    for (const part of rel.split('/')) {
        p = join(p, part);
        let st = lstatOrNull(p);
        if (!st && create) { mkdirSync(p); st = lstatOrNull(p); }
        if (!st) throw new UnsafePathError(`refusing ${p}: it does not exist`);
        if (st.isSymbolicLink()) throw new UnsafePathError(`refusing ${p}: it is a symlink`);
        if (!st.isDirectory()) throw new UnsafePathError(`refusing ${p}: it is not a folder`);
    }
    if (!realpathSync.native(p).startsWith(realpathSync.native(root) + sep)) throw new UnsafePathError(`refusing ${p}: it resolves outside the worktree`);
    return p;
}

/** Writes `text` to `path`, refusing an existing symlink or non-file and opening with O_NOFOLLOW. */
function writeNoFollow(path: string, text: string): void {
    const st = lstatOrNull(path);
    if (st?.isSymbolicLink()) throw new UnsafePathError(`refusing ${path}: it is a symlink`);
    if (st && !st.isFile()) throw new UnsafePathError(`refusing ${path}: it is not a regular file`);
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    try { writeSync(fd, text); } finally { closeSync(fd); }
}

function lstatOrNull(path: string): Stats | null { try { return lstatSync(path); } catch { return null; } }

/**
 * Container folders vite and vitest write to at run time for the package at `pkgDir` (repo-relative). They get a
 * tmpfs because the worktree is read-only in the test phase; vite writes the bundled config to `.vite-temp`.
 */
export function ViteTmpfs(pkgDir: string): string[] {
    return [`${CONTAINER_ROOT}/${pkgDir}/node_modules/.vite`, `${CONTAINER_ROOT}/${pkgDir}/node_modules/.vite-temp`, `${CONTAINER_ROOT}/node_modules/.vite`];
}

/**
 * Creates a tmpfs mount point on the host, since Docker cannot create one inside a read-only mount. Every part
 * above the leaf (`packages/<dir>/node_modules`, `node_modules`) must already be a real folder, not a symlink;
 * only the leaf is created. Throws `UnsafePathError` otherwise.
 */
export function EnsureMountPoint(root: string, rel: string): void {
    const parent = rel.split('/').slice(0, -1).join('/');
    SafeDir(root, parent, false);
    SafeDir(root, rel, true);
}

/** Exit code and the redacted tail of stderr (stdout when stderr is empty) of a sandbox run. */
export function SandboxEvidence(r: SandboxRunResult): string {
    return `exit ${r.ExitCode ?? 'none'}: ${RedactTail(r.Stderr.trim() || r.Stdout.trim())}`;
}

function tail(r: SandboxRunResult): string { return `${r.Stderr}\n${r.Stdout}`.trim().slice(-4000); }

/** Turns a Pass into a RunnerError when no test in its file ran (every test skipped or todo). */
function markUnran(results: ExecutionResult[], m: ReportMapping, ranFiles: string[]): ExecutionResult[] {
    const pathById = new Map(Object.entries(m.FilePathToTestID).map(([path, id]) => [id, path]));
    return results.map((r) => {
        const path = pathById.get(r.CandidateTestID);
        if (r.Status !== 'Pass' || !path || ranFiles.some((f) => f.endsWith(path))) return r;
        return RunnerErrorResult([r.CandidateTestID], m.Revision, m.RunIndex, NO_TEST_RAN)[0];
    });
}

/** Files in the JIT_REPORT line with at least one test that ran. */
function ranFilesFromJitReport(stdout: string): string[] {
    const line = stdout.split('\n').reverse().find((l) => l.startsWith('JIT_REPORT '));
    const data = line ? safeJson<{ Tests?: { File?: string; State?: string }[] }>(line.slice('JIT_REPORT '.length)) : null;
    return (data?.Tests ?? []).filter((t) => RAN_STATES.has(t.State ?? '')).map((t) => t.File ?? '');
}

/** Files in vitest's JSON report with at least one assertion that ran. */
function ranFilesFromJson(json: string): string[] {
    const data = safeJson<{ testResults?: { name?: string; assertionResults?: { status?: string }[] }[] }>(json);
    return (data?.testResults ?? []).filter((f) => (f.assertionResults ?? []).some((a) => RAN_STATES.has(a.status ?? ''))).map((f) => f.name ?? '');
}

function safeJson<T>(text: string): T | null { try { return JSON.parse(text) as T; } catch { return null; } }

interface V8Coverage { statementMap: Record<string, { start: { line: number }; end: { line: number } }>; s: Record<string, number>; }

/** Counts changed lines (new side) that the v8 coverage report marks as executed at least once; null when the report is not a JSON object. */
export function CountCoveredChangedLines(coverageJson: string, changed: ChangedLines, containerRoot: string): number | null {
    const data = safeJson<Record<string, V8Coverage>>(coverageJson.trim()); if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    let covered = 0;
    for (const [file, lines] of Object.entries(changed)) {
        const entry = data[`${containerRoot}/${file}`]; if (!entry) continue;
        const hit = new Set<number>();
        for (const [k, st] of Object.entries(entry.statementMap)) if ((entry.s[k] ?? 0) > 0) for (let l = st.start.line; l <= st.end.line; l++) hit.add(l);
        covered += lines.filter((l) => hit.has(l)).length;
    }
    return covered;
}
