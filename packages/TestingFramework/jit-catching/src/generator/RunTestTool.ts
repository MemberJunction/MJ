import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { Sandbox, SandboxMount, SandboxRunResult } from '../sandbox/Sandbox';
import type { FailureDetail, MutantEdit } from '../types';
import type { Settings } from '../settings';
import { ParseVitestOutput } from '../target/VitestReport';
import { JIT_REPORTER_ARG, JIT_REPORTER_MOUNT, WriteJitReporter } from '../target/JitReporter';
import { ApplyMutantEdits, CopyPackageForMutant, ValidateMutantEdits } from './Mutant';

export interface RunTestInput { File: string; Mutant?: { Edits: MutantEdit[] }; }
export interface RunTestOutput { Ran: boolean; Status: 'Pass' | 'Fail' | 'Timeout' | 'CompileError' | 'RunnerError'; TestName: string | null; Failure: FailureDetail | null; DurationMs: number; Error?: string; }
export interface RunTestToolOptions { Sandbox: Sandbox; BaseRootDir: string; PackageRelDir: string; PackageName: string; ScratchRoot: string; Settings: Settings; }
export interface LastMutantRecord { Edits: MutantEdit[]; Patch: string; Failure: FailureDetail | null; }

const ROOT = '/work';
const OUTPUT_EXCERPT_CHARS = 500;

/** A mutant prepared on the host: the scratch package copy and the patch that produced it. */
interface PreparedMutant { Scratch: string; Patch: string; }

/** The agent's only way to execute anything: one vitest file on base, or on base + mutant, inside the sandbox (§8.3). */
export class RunTestTool {
    /** The most recent mutant run: its edits, patch, and the failure it caused (null unless the test failed). */
    public LastMutant: LastMutantRecord | null = null;
    constructor(private readonly o: RunTestToolOptions) {}

    public async Run(input: RunTestInput): Promise<RunTestOutput> {
        const fileError = this.checkFile(input.File);
        if (fileError) return this.refuse(fileError);
        let mutant: PreparedMutant | null = null;
        if (input.Mutant) {
            const prepared = this.prepareMutant(input.Mutant.Edits);
            if (typeof prepared === 'string') return this.refuse(prepared);
            mutant = prepared;
        }
        let r: SandboxRunResult;
        try { r = await this.runInSandbox(input.File, mutant?.Scratch ?? null); }
        finally { if (mutant) rmSync(dirname(mutant.Scratch), { recursive: true, force: true }); }
        const out = this.toOutput(r, input);
        if (input.Mutant && mutant) this.LastMutant = { Edits: input.Mutant.Edits, Patch: mutant.Patch, Failure: out.Status === 'Fail' ? out.Failure : null };
        return out;
    }

    /**
     * Returns an error unless the file is `<jitDir>/<name>.jit.test.ts` (one file-name segment), exists,
     * the jit folder is not a symlink, and the file's real path is inside the worktree.
     */
    private checkFile(file: string): string | null {
        const jitDir = this.jitDir();
        if (!this.jitFilePattern().test(file)) return `run_test accepts only files directly under ${jitDir}/ ending in .jit.test.ts`;
        const root = realpathSync.native(this.o.BaseRootDir);
        const jitAbs = join(this.o.BaseRootDir, jitDir);
        if (!existsSync(jitAbs) || realpathSync.native(jitAbs) !== join(root, jitDir)) return `the jit folder must be a real folder inside the worktree: ${jitDir}`;
        const abs = join(this.o.BaseRootDir, file);
        if (!existsSync(abs)) return `file not found: ${file}`;
        if (!isInside(root, realpathSync.native(abs))) return `file resolves outside the worktree: ${file}`;
        return null;
    }

    /** Validates the edits and applies them to a scratch copy of the package; returns an error string when the mutant is invalid. */
    private prepareMutant(edits: MutantEdit[]): PreparedMutant | string {
        const err = ValidateMutantEdits(this.o.PackageRelDir, edits);
        if (err) return `invalid mutant: ${err}`;
        const scratch = CopyPackageForMutant(join(this.o.BaseRootDir, this.o.PackageRelDir), this.o.ScratchRoot);
        const linkError = this.checkEditTargets(scratch, edits);
        if (linkError) { rmSync(dirname(scratch), { recursive: true, force: true }); return `invalid mutant: ${linkError}`; }
        try { return { Scratch: scratch, Patch: ApplyMutantEdits(scratch, edits, this.o.PackageRelDir).Patch }; }
        catch (e) { rmSync(dirname(scratch), { recursive: true, force: true }); return `invalid mutant: ${(e as Error).message}`; }
    }

    /** Returns an error when an edit target in the scratch copy is a symlink or resolves outside the copy. */
    private checkEditTargets(scratch: string, edits: MutantEdit[]): string | null {
        const scratchReal = realpathSync.native(scratch);
        for (const e of edits) {
            const target = join(scratch, e.File.slice(this.o.PackageRelDir.length + 1));
            const stat = lstatSync(target, { throwIfNoEntry: false });
            if (!stat) continue;
            if (stat.isSymbolicLink()) return `a mutant may not edit a symlink: ${e.File}`;
            if (!isInside(scratchReal, realpathSync.native(target))) return `a mutant edit resolves outside the package through a symlink: ${e.File}`;
        }
        return null;
    }

    /** Runs vitest on one file. The worktree is read-only; the jit folder and a mutant's package copy are writable. */
    private runInSandbox(file: string, scratch: string | null): Promise<SandboxRunResult> {
        const pkg = this.o.PackageRelDir; const jitDir = this.jitDir();
        const mounts: SandboxMount[] = [
            { Host: this.o.BaseRootDir, Container: ROOT, Mode: 'ro' },
            { Host: join(this.o.BaseRootDir, jitDir), Container: `${ROOT}/${jitDir}`, Mode: 'rw' },
            { Host: WriteJitReporter(join(this.o.ScratchRoot, 'jit-reporter')), Container: JIT_REPORTER_MOUNT, Mode: 'ro' },
        ];
        if (scratch) mounts.push({ Host: scratch, Container: `${ROOT}/${pkg}`, Mode: 'rw' });
        this.ensureViteDirs(scratch);
        const s = this.o.Settings;
        return this.o.Sandbox.Run({
            Mounts: mounts, Tmpfs: [`${ROOT}/${pkg}/node_modules/.vite`, `${ROOT}/node_modules/.vite`], WorkDir: `${ROOT}/${pkg}`,
            Command: ['npx', 'vitest', 'run', file.slice(pkg.length + 1), JIT_REPORTER_ARG, `--sequence.seed=${s.SequenceSeed}`, `--testTimeout=${s.TestTimeoutMs}`],
            TimeoutMs: s.TestTimeoutMs * 3 + 60_000, Env: { TZ: 'UTC', HOME: '/tmp', CI: '1' },
        });
    }

    /** Creates the `node_modules/.vite` tmpfs mount points on the host: in the base root, and in the package dir (the scratch copy when present). */
    private ensureViteDirs(scratch: string | null): void {
        mkdirSync(join(this.o.BaseRootDir, 'node_modules/.vite'), { recursive: true });
        mkdirSync(join(scratch ?? join(this.o.BaseRootDir, this.o.PackageRelDir), 'node_modules/.vite'), { recursive: true });
    }

    /** Maps the sandbox result to the tool output. Every RunnerError carries an excerpt of stderr (or stdout when stderr is empty) in Error. */
    private toOutput(r: SandboxRunResult, input: RunTestInput): RunTestOutput {
        if (r.TimedOut) return { Ran: true, Status: 'Timeout', TestName: null, Failure: null, DurationMs: r.DurationMs };
        const [res] = ParseVitestOutput(r.Stdout, { FilePathToTestID: { [input.File]: 'probe' }, Revision: input.Mutant ? 'Mutant' : 'Base', RunIndex: 0 });
        const excerpt = (r.Stderr || r.Stdout).slice(0, OUTPUT_EXCERPT_CHARS);
        if (!res) return { Ran: true, Status: 'RunnerError', TestName: null, Failure: null, DurationMs: r.DurationMs, Error: excerpt };
        const out: RunTestOutput = { Ran: true, Status: res.Status, TestName: res.TestName, Failure: res.Failure, DurationMs: res.DurationMs };
        if (res.Status === 'RunnerError') out.Error = excerpt;
        return out;
    }

    private jitFilePattern(): RegExp { return new RegExp(`^${escapeRegExp(this.jitDir())}/[^/]+\\.jit\\.test\\.ts$`); }
    private jitDir(): string { return `${this.o.PackageRelDir}/src/__tests__/jit`; }
    private refuse(error: string): RunTestOutput { return { Ran: false, Status: 'RunnerError', TestName: null, Failure: null, DurationMs: 0, Error: error }; }
}

/** True when `child` is `parent` or lies under it. Both paths must already be real paths. */
function isInside(parent: string, child: string): boolean {
    const rel = relative(parent, child);
    return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function escapeRegExp(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
