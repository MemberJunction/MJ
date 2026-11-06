import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

const execFileAsync = promisify(execFile);
/** Runs one trusted command on the host and returns its stdout. Injected so tests see the calls; the default is execFile. */
export type HostRunner = (file: string, args: string[], cwd: string) => Promise<string>;
const DEFAULT_HOST_RUNNER: HostRunner = async (file, args, cwd) => (await execFileAsync(file, args, { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } })).stdout;
/** `StoreDir` is the pnpm store for one run only: the sandbox install writes patched files into it, so no other run may use it. */
export interface TargetOptions { Repo: GitRepo; Sandbox: Sandbox; Settings: Settings; WorkRoot: string; PackageMap: PackageMap; StoreDir: string; HostRunner?: HostRunner; }
/** A revision could not be prepared (host fetch or sandbox install). The PR is an infrastructure failure, not a test result. */
export class InfrastructureError extends Error {}

const CONTAINER_ROOT = '/work';
const CONTAINER_STORE = '/pnpm-store';
const JIT_SUBDIR = 'src/__tests__/jit';
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
     */
    public async Prepare(revision: RevisionRef): Promise<PreparedRevision> {
        const dir = join(this.o.WorkRoot, revision.Kind.toLowerCase());
        if (existsSync(dir)) await this.o.Repo.RemoveWorktree(dir).catch(() => rmSync(dir, { recursive: true, force: true }));
        await this.o.Repo.AddWorktree(dir, revision.SHA);
        await this.hostFetch(revision, dir);
        const prepared: PreparedRevision = { Ref: revision, RootDir: dir };
        const install = `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir ${CONTAINER_STORE} && pnpm rebuild --store-dir ${CONTAINER_STORE}`;
        const r = await this.inSandbox(prepared, 'rw', ['sh', '-c', install], 30 * 60_000);
        if (r.ExitCode !== 0) throw new InfrastructureError(`install failed on ${revision.Kind}: ${tail(r)}`);
        return prepared;
    }

    /**
     * `pnpm fetch` on the host, in a folder that holds only host-written files: the revision's lockfile with the
     * patch information removed and a `package.json` whose `packageManager` pins the image's pnpm. pnpm switches
     * itself to that version, so the store it writes has the layout the image reads. The version is checked first.
     */
    private async hostFetch(revision: RevisionRef, worktree: string): Promise<void> {
        const fetchDir = join(this.o.WorkRoot, `${revision.Kind.toLowerCase()}-fetch`);
        const pinned = this.o.Settings.Sandbox.PnpmVersion;
        const host = this.o.HostRunner ?? DEFAULT_HOST_RUNNER;
        try {
            rmSync(fetchDir, { recursive: true, force: true }); mkdirSync(fetchDir, { recursive: true }); mkdirSync(this.o.StoreDir, { recursive: true });
            writeFileSync(join(fetchDir, 'pnpm-lock.yaml'), StripPatchInfo(readFileSync(join(worktree, 'pnpm-lock.yaml'), 'utf8')));
            writeFileSync(join(fetchDir, 'package.json'), JSON.stringify({ name: 'jit-fetch', private: true, packageManager: `pnpm@${pinned}` }));
        } catch (e) {
            throw new InfrastructureError(`could not write the fetch folder for ${revision.Kind}: ${(e as Error).message}`);
        }
        await this.checkHostPnpm(host, fetchDir, pinned);
        try { await host('pnpm', ['fetch', '--store-dir', this.o.StoreDir], fetchDir); }
        catch (e) { throw new InfrastructureError(`host pnpm fetch failed on ${revision.Kind}: ${(e as Error).message.slice(-4000)}`); }
    }

    /** Throws when the pnpm that runs in the fetch folder is not the pinned version. */
    private async checkHostPnpm(host: HostRunner, fetchDir: string, pinned: string): Promise<void> {
        let actual: string;
        try { actual = (await host('pnpm', ['--version'], fetchDir)).trim(); }
        catch (e) { throw new InfrastructureError(`host pnpm --version failed: ${(e as Error).message.slice(-4000)}`); }
        if (actual !== pinned) throw new InfrastructureError(`host pnpm is ${actual} in the fetch folder, but the sandbox image uses ${pinned}`);
    }

    /** `turbo run build --filter=<pkg>...` for the packages under test, inside the sandbox with the local cache only. */
    public async BuildPackages(revision: PreparedRevision, packages: string[]): Promise<void> {
        if (packages.length === 0) return;
        const filters = packages.map((p) => `--filter=${p}...`).join(' ');
        const cmd = `npx turbo run build ${filters} --cache=local:rw,remote:r --log-order=stream --summarize`;
        const r = await this.inSandbox(revision, 'rw', ['sh', '-c', cmd], 45 * 60_000, { TURBO_CACHE_DIR: `${CONTAINER_ROOT}/.turbo/cache`, TURBO_TELEMETRY_DISABLED: '1' });
        this.keepTurboSummaries(revision);
        if (r.ExitCode !== 0) throw new Error(`build failed on ${revision.Ref.Kind}: ${tail(r)}`);
    }

    /** Copies turbo's run summaries out of the worktree, so base and head task hashes can be compared (design §5.4, Q4). */
    private keepTurboSummaries(revision: PreparedRevision): void {
        const from = join(revision.RootDir, '.turbo', 'runs'); if (!existsSync(from)) return;
        const to = join(this.o.WorkRoot, 'turbo-summaries', revision.Ref.Kind.toLowerCase()); mkdirSync(to, { recursive: true });
        for (const f of readdirSync(from)) if (f.endsWith('.json')) copyFileSync(join(from, f), join(to, f));
    }

    /** Writes each test's source at its `FilePath` inside the worktree. */
    public async WriteTests(revision: PreparedRevision, tests: CandidateTest[]): Promise<void> {
        for (const t of tests) { const p = join(revision.RootDir, t.FilePath); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t.Source); }
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
            const cmd = `cd ${CONTAINER_ROOT}/${g.Dir} && printf '%s' '${json}' > ${config} && npx tsc --noEmit -p ${config} 2>&1; rc=$?; rm -f ${config}; exit $rc`;
            const r = await this.inSandbox(revision, 'ro', ['sh', '-c', cmd], 10 * 60_000, {}, [], [g.Dir]);
            for (const [i, t] of g.Tests.entries()) {
                const lines = r.Stdout.split('\n').filter((l) => l.startsWith(g.Files[i]));
                if (lines.length) out.set(t.ID, lines.join('\n').slice(0, 4000));
            }
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
        const base = `cd ${CONTAINER_ROOT}/${g.Dir} && npx vitest run ${g.Files.join(' ')} --sequence.seed=${this.o.Settings.SequenceSeed} --testTimeout=${this.o.Settings.TestTimeoutMs}`;
        const timeout = this.o.Settings.TestTimeoutMs * (g.Files.length + 2) + 120_000;
        const r = await this.runVitest(revision, g, `${base} ${JIT_REPORTER_ARG}`, timeout);
        if (r.TimedOut) return timedOut();
        const parsed = ParseJitReport(r.Stdout, m);
        if (parsed) return markUnran(parsed, m, ranFilesFromJitReport(r.Stdout));
        // vitest writes the JSON report to a file in the rw jit folder and stdout carries only that file, so test chatter cannot mix in.
        const out = `${CONTAINER_ROOT}/${g.Dir}/${JIT_SUBDIR}/.jit-report-${m.Revision.toLowerCase()}-${m.RunIndex}.json`;
        const j = await this.runVitest(revision, g, `${base} --reporter=json --outputFile=${out} >/dev/null 2>&1; cat ${out}; rm -f ${out}`, timeout);
        if (j.TimedOut) return timedOut();
        return markUnran(ParseVitestJson(j.Stdout, m), m, ranFilesFromJson(j.Stdout));
    }

    private runVitest(revision: PreparedRevision, g: PackageGroup, cmd: string, timeoutMs: number): Promise<SandboxRunResult> {
        return this.inSandbox(revision, 'ro', ['sh', '-c', cmd], timeoutMs, { TZ: 'UTC' }, viteTmpfs(g.Dir), [g.Dir]);
    }

    /** Per test: how many changed lines its run executed, from a v8 coverage report written inside the container. */
    public async Coverage(revision: PreparedRevision, tests: CandidateTest[], changed: ChangedLines): Promise<CoverageResult[]> {
        const out: CoverageResult[] = [];
        for (const g of this.groups(tests)) {
            for (const [i, t] of g.Tests.entries()) {
                const report = `/tmp/cov-${t.ID}`;
                const cmd = `cd ${CONTAINER_ROOT}/${g.Dir} && npx vitest run ${g.Files[i]} --coverage.enabled --coverage.provider=v8 --coverage.reporter=json --coverage.reportsDirectory=${report} >/dev/null 2>&1; cat ${report}/coverage-final.json`;
                const r = await this.inSandbox(revision, 'ro', ['sh', '-c', cmd], 10 * 60_000, { TZ: 'UTC' }, viteTmpfs(g.Dir), [g.Dir]);
                out.push({ CandidateTestID: t.ID, CoveredChangedLines: CountCoveredChangedLines(r.Stdout, changed, CONTAINER_ROOT) });
            }
        }
        return out;
    }

    public async Cleanup(revision: PreparedRevision): Promise<void> {
        await this.o.Repo.RemoveWorktree(revision.RootDir).catch(() => rmSync(revision.RootDir, { recursive: true, force: true }));
    }

    /** Tests grouped by package, with each test file relative to its package folder. */
    private groups(tests: CandidateTest[]): PackageGroup[] {
        const byDir = new Map<string, PackageGroup>();
        for (const t of tests) {
            const dir = this.packageDir(t.Package);
            const g = byDir.get(dir) ?? { Dir: dir, Tests: [], Files: [] };
            g.Tests.push(t); g.Files.push(t.FilePath.slice(dir.length + 1)); byDir.set(dir, g);
        }
        return [...byDir.values()];
    }
    private packageDir(name: string): string { const p = this.o.PackageMap.Get(name); if (!p) throw new Error(`unknown package ${name}`); return p.Dir; }

    /**
     * 'rw' is the prepare phase (install, rebuild, build) and also mounts the store. 'ro' is the test phase: the
     * worktree read-only, the jit folder of each package under test read-write, and the reporter read-only.
     */
    private inSandbox(revision: PreparedRevision, mode: 'ro' | 'rw', command: string[], timeoutMs: number, env: Record<string, string> = {}, tmpfs: string[] = [], packageDirs: string[] = []): Promise<SandboxRunResult> {
        const mounts: SandboxMount[] = [{ Host: revision.RootDir, Container: CONTAINER_ROOT, Mode: mode }];
        if (mode === 'rw') mounts.push({ Host: this.o.StoreDir, Container: CONTAINER_STORE, Mode: 'rw' });
        if (mode === 'ro') {
            for (const d of packageDirs) mounts.push({ Host: join(revision.RootDir, d, JIT_SUBDIR), Container: `${CONTAINER_ROOT}/${d}/${JIT_SUBDIR}`, Mode: 'rw' });
            mounts.push({ Host: this.reporterDir(), Container: JIT_REPORTER_MOUNT, Mode: 'ro' });
        }
        for (const t of tmpfs) ensureMountPoint(join(revision.RootDir, t.slice(CONTAINER_ROOT.length + 1)));
        return this.sandbox.Run({ Mounts: mounts, Tmpfs: tmpfs, WorkDir: CONTAINER_ROOT, Command: command, TimeoutMs: timeoutMs, Env: { HOME: '/tmp', CI: '1', ...env } });
    }
    private reporterDir(): string { return (this.reporter ??= WriteJitReporter(mkdtempSync(join(tmpdir(), 'jit-reporter-')))); }
}

/** Folders vite and vitest write to at run time; they get a tmpfs because the worktree is read-only in the test phase. */
function viteTmpfs(dir: string): string[] {
    return [`${CONTAINER_ROOT}/${dir}/node_modules/.vite`, `${CONTAINER_ROOT}/${dir}/node_modules/.vite-temp`, `${CONTAINER_ROOT}/node_modules/.vite`];
}

/** Creates a tmpfs mount point on the host; Docker cannot create one inside a read-only mount. */
function ensureMountPoint(path: string): void {
    try { mkdirSync(path, { recursive: true }); } catch { /* a missing mount point surfaces as a sandbox error */ }
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

/** Counts changed lines (new side) that the v8 coverage report marks as executed at least once. */
export function CountCoveredChangedLines(coverageJson: string, changed: ChangedLines, containerRoot: string): number {
    const data = safeJson<Record<string, V8Coverage>>(coverageJson.trim()); if (!data) return 0;
    let covered = 0;
    for (const [file, lines] of Object.entries(changed)) {
        const entry = data[`${containerRoot}/${file}`]; if (!entry) continue;
        const hit = new Set<number>();
        for (const [k, st] of Object.entries(entry.statementMap)) if ((entry.s[k] ?? 0) > 0) for (let l = st.start.line; l <= st.end.line; l++) hit.add(l);
        covered += lines.filter((l) => hit.has(l)).length;
    }
    return covered;
}
