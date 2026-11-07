import type { Settings } from '../settings';
import type { Catch, Trigger } from '../types';
import { GenerateStep } from './Generate';
import { ExecuteStep } from './Execute';
import { AssessStep } from './Assess';
import { RunDir } from './RunDir';
import { DefaultRedaction, DefaultRunTarget } from './Deps';

/** `PR` null runs on `BaseSHA`/`HeadSHA` instead. `Trigger` defaults to `Local`. */
export interface RunAllOptions { PR: number | null; BaseSHA?: string; HeadSHA?: string; Trigger?: Trigger; RepoRoot: string; Settings: Settings; StoreDir: string; }

/**
 * Generate, execute and assess on this machine with the real dependencies, then remove the base worktree.
 * When a step fails, the run folder and the base worktree stay so the failed step can be run again on its own.
 */
export async function RunAll(o: RunAllOptions): Promise<{ RunID: string; Reported: Catch[] }> {
    const { RunID } = await GenerateStep({ PR: o.PR, BaseSHA: o.BaseSHA, HeadSHA: o.HeadSHA, Trigger: o.Trigger ?? 'Local', RepoRoot: o.RepoRoot, Settings: o.Settings });
    await ExecuteStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings });
    const { Catches } = await AssessStep({ RunID, RepoRoot: o.RepoRoot, Settings: o.Settings, StoreDir: o.StoreDir });
    const dir = new RunDir(o.RepoRoot, RunID, DefaultRedaction());
    const gen = dir.ReadGeneration();
    await DefaultRunTarget(o.RepoRoot, dir.Path, o.Settings).Target.Cleanup({ Ref: { Kind: 'Base', SHA: gen.Run.BaseSHA }, RootDir: gen.BaseRootDir });
    return { RunID, Reported: Catches.filter((c) => c.Reported) };
}
