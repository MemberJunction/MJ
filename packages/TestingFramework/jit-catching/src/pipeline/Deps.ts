import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VitestCatchTarget } from '../target/VitestCatchTarget';
import { GitRepo } from '../git/GitRepo';
import { PackageMap } from '../analyzer/PackageMap';
import { Sandbox } from '../sandbox/Sandbox';
import { RedactionCheck, SecretsFromEnvironment } from '../sandbox/Redaction';
import type { Settings } from '../settings';

/** The target methods the pipeline steps call. */
export type PipelineTarget = Pick<VitestCatchTarget, 'Prepare' | 'BuildPackages' | 'PackagesAt' | 'WriteTests' | 'TypeCheck' | 'Run' | 'Coverage' | 'Cleanup'>;

/** The folder that holds the sandbox Dockerfile, next to `src/` and `dist/`. */
const SANDBOX_DIR = fileURLToPath(new URL('../../sandbox', import.meta.url));

/** The real target and sandbox for one run, all writing under the run's folder. */
export interface RunTarget { Target: VitestCatchTarget; Sandbox: Sandbox; PackageMap: PackageMap; Repo: GitRepo; EnsureImage: () => Promise<void>; }

/**
 * Builds the real target of one run: worktrees under `<run dir>/work` (so the base worktree is `<run dir>/work/base`)
 * and a pnpm store at `<run dir>/pnpm-store` that no other run uses.
 */
export function DefaultRunTarget(repoRoot: string, runPath: string, settings: Settings, repo: GitRepo = new GitRepo(repoRoot)): RunTarget {
    const packageMap = PackageMap.Load(repoRoot);
    const sandbox = new Sandbox(settings.Sandbox);
    const target = new VitestCatchTarget({ Repo: repo, Sandbox: sandbox, Settings: settings, WorkRoot: join(runPath, 'work'), PackageMap: packageMap, StoreDir: join(runPath, 'pnpm-store') });
    return { Target: target, Sandbox: sandbox, PackageMap: packageMap, Repo: repo, EnsureImage: () => sandbox.EnsureImage(SANDBOX_DIR) };
}

/** The redaction check over the secrets this process holds. */
export function DefaultRedaction(): RedactionCheck { return new RedactionCheck(SecretsFromEnvironment()); }
