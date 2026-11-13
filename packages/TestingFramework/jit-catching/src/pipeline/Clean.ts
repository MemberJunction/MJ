import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { GitRepo } from '../git/GitRepo';
import { IsValidRunID } from './RunDir';

/** Folders of a run that `CleanRun` removes. */
const REMOVED = ['work', 'pnpm-store', 'scratch', 'match'];
/** Worktrees under `work/` that are removed through git before the folder goes. */
const WORKTREES = ['base', 'head'];

/** `<repoRoot>/.jit-catch/runs`. */
function runsRoot(repoRoot: string): string { return join(repoRoot, '.jit-catch', 'runs'); }

/** True when `p` is a real folder, not a symlink. */
function isRealDir(p: string): boolean { try { return lstatSync(p).isDirectory(); } catch { return false; } }

/**
 * Removes `work/`, `pnpm-store/`, `scratch/` and `match/` of one run; keeps the JSON files, the transcripts and `base-src`.
 * The base and head worktrees go through `git worktree remove` first, so git forgets them; a git failure is ignored
 * because the folder is removed next anyway.
 */
export async function CleanRun(repoRoot: string, runID: string, repo: Pick<GitRepo, 'RemoveWorktree'>): Promise<void> {
    if (!IsValidRunID(runID)) throw new Error(`invalid run ID ${JSON.stringify(runID)}: use letters, digits, '-' and '_' only`);
    const path = join(runsRoot(repoRoot), runID);
    if (!isRealDir(path)) throw new Error(`run ${runID} not found`);
    for (const w of WORKTREES) {
        const wt = join(path, 'work', w);
        if (isRealDir(join(path, 'work')) && isRealDir(wt)) await repo.RemoveWorktree(wt).catch(() => undefined);
    }
    for (const d of REMOVED) rmSync(join(path, d), { recursive: true, force: true });
}

/** Run IDs under `.jit-catch/runs` that have an `assessment.json`, sorted. */
export function FinishedRunIDs(repoRoot: string): string[] {
    const root = runsRoot(repoRoot);
    if (!isRealDir(root)) return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && IsValidRunID(e.name) && existsSync(join(root, e.name, 'assessment.json')))
        .map((e) => e.name).sort();
}
