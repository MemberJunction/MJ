import type { Settings } from '../settings';
import type { GenerationFile } from '../schemas';
import type { Catch, PreparedRevision, Trigger } from '../types';
import { GenerateStep } from './Generate';
import { ExecuteStep } from './Execute';
import { AssessStep } from './Assess';
import { CheckedBaseRootDir, RunDir } from './RunDir';
import { DefaultRedaction, DefaultRunTarget } from './Deps';
import { PreflightEnv } from './Preflight';

/** `PR` null runs on `BaseSHA`/`HeadSHA` instead. `Trigger` defaults to `Local`. */
export interface RunAllOptions { PR: number | null; BaseSHA?: string; HeadSHA?: string; Trigger?: Trigger; RepoRoot: string; Settings: Settings; StoreDir: string; }

/** A step after Generate failed. Carries the run ID, so the run's recorded spend can still be read, and the original error as `cause`. */
export class RunAllError extends Error {
    constructor(public readonly RunID: string, public readonly Step: 'Execute' | 'Assess' | 'Cleanup', cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause), { cause });
        this.name = 'RunAllError';
    }
}

/**
 * Checks the keys of every step first, then generates, executes and assesses on this machine with the real dependencies, and removes the base worktree.
 * When a step fails, the run folder and the base worktree stay so the failed step can be run again on its own.
 * A Generate failure is thrown as it is; a later failure is thrown as a `RunAllError`.
 */
export async function RunAll(o: RunAllOptions): Promise<{ RunID: string; Reported: Catch[] }> {
    PreflightEnv(o.Settings, process.env, 'Assess');
    const { RunID } = await GenerateStep({ PR: o.PR, BaseSHA: o.BaseSHA, HeadSHA: o.HeadSHA, Trigger: o.Trigger ?? 'Local', RepoRoot: o.RepoRoot, Settings: o.Settings });
    let step: RunAllError['Step'] = 'Execute';
    try {
        await ExecuteStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings });
        step = 'Assess';
        const { Catches } = await AssessStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings, StoreDir: o.StoreDir });
        step = 'Cleanup';
        const dir = new RunDir(o.RepoRoot, RunID, DefaultRedaction());
        const target = DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings).Target;
        await CleanupBase(dir, dir.ReadGeneration(), (r) => target.Cleanup(r));
        return { RunID, Reported: Catches.filter((c) => c.Reported) };
    } catch (e) {
        throw new RunAllError(RunID, step, e);
    }
}

/** Removes the run's base worktree with `cleanup`, after checking that the recorded path is the run's own `work/base`. */
export async function CleanupBase(dir: RunDir, gen: GenerationFile, cleanup: (r: PreparedRevision) => Promise<void>): Promise<void> {
    const root = CheckedBaseRootDir(dir, gen.BaseRootDir);
    await cleanup({ Ref: { Kind: 'Base', SHA: gen.Run.BaseSHA }, RootDir: root });
}
