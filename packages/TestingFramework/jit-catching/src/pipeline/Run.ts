import { join } from 'node:path';
import type { Settings } from '../settings';
import type { GenerationFile } from '../schemas';
import type { Catch, PreparedRevision, TokenUsage, Trigger } from '../types';
import { GenerateError, GenerateStep } from './Generate';
import { ExecuteStep } from './Execute';
import { AssessStep } from './Assess';
import { CheckedBaseRootDir, RunDir } from './RunDir';
import { SnapshotBaseSources } from './BaseSnapshot';
import type { VitestCatchTarget } from '../target/VitestCatchTarget';
import type { PackageMap } from '../analyzer/PackageMap';
import { DefaultRedaction, DefaultRunTarget } from './Deps';
import { PreflightEnv } from './Preflight';
import { RedactTail } from '../sandbox/Redaction';

/** The target and package lookup `FinishRun` uses for one run folder. */
export interface FinishTools { Target: Pick<VitestCatchTarget, 'Cleanup' | 'RemoveStore'>; PackageMap: Pick<PackageMap, 'Get'>; }

/**
 * `PR` null runs on `BaseSHA`/`HeadSHA` instead. `Trigger` defaults to `Local`.
 * `FinishTools` builds the finish tools for the run folder; the real run target when not given.
 */
export interface RunAllOptions {
    PR: number | null; BaseSHA?: string; HeadSHA?: string; Trigger?: Trigger; RepoRoot: string; Settings: Settings; StoreDir: string;
    FinishTools?: (runPath: string) => FinishTools;
}

/**
 * A step failed after the run had an ID. Carries the run ID, so the run's recorded spend can still be read, and the original error as `cause`.
 * `Usage` holds the spend of a Generate failure that wrote no `generation.json`.
 */
export class RunAllError extends Error {
    constructor(public readonly RunID: string, public readonly Step: 'Generate' | 'Execute' | 'Assess', cause: unknown, public readonly Usage?: TokenUsage[]) {
        super(cause instanceof Error ? cause.message : String(cause), { cause });
        this.name = 'RunAllError';
    }
}

/**
 * Checks the keys of every step first, then generates, executes and assesses on this machine with the real dependencies, and finishes the run with `FinishRun`.
 * When a step fails, the run folder and the base worktree stay so the failed step can be run again on its own.
 * A `FinishRun` failure after Assess is written as one stderr line and the run still succeeds.
 * A Generate failure after the analyzer ran is thrown as a `RunAllError` with its usage; an earlier Generate failure is thrown as it is; a later failure is thrown as a `RunAllError`.
 */
export async function RunAll(o: RunAllOptions): Promise<{ RunID: string; Reported: Catch[] }> {
    PreflightEnv(o.Settings, process.env, 'Assess');
    const { RunID } = await generate(o);
    let step: RunAllError['Step'] = 'Execute';
    let catches: Catch[];
    try {
        await ExecuteStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings });
        step = 'Assess';
        catches = (await AssessStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings, StoreDir: o.StoreDir })).Catches;
    } catch (e) {
        throw new RunAllError(RunID, step, e);
    }
    await finishOrReport(o, RunID);
    return { RunID, Reported: catches.filter((c) => c.Reported) };
}

/** Finishes the run with `FinishRun`; a failure is written as one redacted stderr line and does not fail the run. */
async function finishOrReport(o: RunAllOptions, runID: string): Promise<void> {
    try {
        const dir = new RunDir(o.RepoRoot, runID, DefaultRedaction());
        const { Target, PackageMap } = o.FinishTools ? o.FinishTools(dir.Path) : DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings);
        await FinishRun(dir, Target, PackageDirs(dir.ReadGeneration().Analysis.PackagesToTest, (n) => PackageMap.Get(n)?.Dir ?? null));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        process.stderr.write(`finish run ${runID}: ${RedactTail(message.split('\n')[0].trim())}\n`);
    }
}

async function generate(o: RunAllOptions): Promise<{ RunID: string }> {
    try { return await GenerateStep({ PR: o.PR, BaseSHA: o.BaseSHA, HeadSHA: o.HeadSHA, Trigger: o.Trigger ?? 'Local', RepoRoot: o.RepoRoot, Settings: o.Settings }); }
    catch (e) {
        if (e instanceof GenerateError) throw new RunAllError(e.RunID, 'Generate', e.cause, e.Usage);
        throw e;
    }
}

/** Removes the run's base worktree with `cleanup`, after checking that the recorded path is the run's own `work/base`. */
export async function CleanupBase(dir: RunDir, gen: GenerationFile, cleanup: (r: PreparedRevision) => Promise<void>): Promise<void> {
    const root = CheckedBaseRootDir(dir, gen.BaseRootDir);
    await cleanup({ Ref: { Kind: 'Base', SHA: gen.Run.BaseSHA }, RootDir: root });
}

/**
 * Copies the base sources of `packageDirs` to `<run dir>/base-src`, records that folder as `BaseSourceDir` in
 * `generation.json`, removes the base worktree, and removes the run's pnpm store and fetch folders. Writes a stderr
 * line when the snapshot holds no files.
 */
export async function FinishRun(dir: RunDir, target: Pick<VitestCatchTarget, 'Cleanup' | 'RemoveStore'>, packageDirs: string[]): Promise<void> {
    const gen = dir.ReadGeneration();
    const dest = join(dir.Path, 'base-src');
    const copied = SnapshotBaseSources(CheckedBaseRootDir(dir, gen.BaseRootDir), packageDirs, dest);
    if (copied === 0) process.stderr.write(`base source snapshot: no files copied to ${dest}; a later assess cannot read base sources\n`);
    dir.WriteGeneration({ ...gen, BaseSourceDir: dest });
    await CleanupBase(dir, gen, (r) => target.Cleanup(r));
    await target.RemoveStore();
}

/** The repository-relative folder of each package name; a name `dirOf` does not know is skipped with a stderr line. */
export function PackageDirs(names: string[], dirOf: (name: string) => string | null): string[] {
    const dirs: string[] = [];
    for (const n of names) {
        const d = dirOf(n);
        if (d === null) process.stderr.write(`base source snapshot: unknown package ${n}, skipped\n`);
        else dirs.push(d);
    }
    return dirs;
}
