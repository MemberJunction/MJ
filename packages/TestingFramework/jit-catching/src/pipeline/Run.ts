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

/**
 * Checks the keys of every step first, then generates, executes and assesses on this machine with the real dependencies, and removes the base worktree.
 * When a step fails, the run folder and the base worktree stay so the failed step can be run again on its own.
 */
export async function RunAll(o: RunAllOptions): Promise<{ RunID: string; Reported: Catch[] }> {
    PreflightEnv(o.Settings, process.env, 'Assess');
    const { RunID } = await GenerateStep({ PR: o.PR, BaseSHA: o.BaseSHA, HeadSHA: o.HeadSHA, Trigger: o.Trigger ?? 'Local', RepoRoot: o.RepoRoot, Settings: o.Settings });
    await ExecuteStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings });
    const { Catches } = await AssessStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings, StoreDir: o.StoreDir });
    const dir = new RunDir(o.RepoRoot, RunID, DefaultRedaction());
    const target = DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings).Target;
    await CleanupBase(dir, dir.ReadGeneration(), (r) => target.Cleanup(r));
    return { RunID, Reported: Catches.filter((c) => c.Reported) };
}

/** Removes the run's base worktree with `cleanup`, after checking that the recorded path is the run's own `work/base`. */
export async function CleanupBase(dir: RunDir, gen: GenerationFile, cleanup: (r: PreparedRevision) => Promise<void>): Promise<void> {
    const root = CheckedBaseRootDir(dir, gen.BaseRootDir);
    await cleanup({ Ref: { Kind: 'Base', SHA: gen.Run.BaseSHA }, RootDir: root });
}
