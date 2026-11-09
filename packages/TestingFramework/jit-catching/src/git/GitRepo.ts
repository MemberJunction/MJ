import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Options set on every git call so paths print as plain text. */
const BASE_ARGS = ['-c', 'core.quotePath=false'];

/** Runs `git` with the given arguments in `cwd` and returns its stdout. Injected so tests never run git. */
export type GitRunner = (args: string[], cwd: string) => Promise<string>;
const DEFAULT_GIT_RUNNER: GitRunner = async (args, cwd) => (await run('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 })).stdout;

/** Thin wrapper over the `git` CLI for one repository root. */
export class GitRepo {
    constructor(public readonly Root: string, private readonly runner: GitRunner = DEFAULT_GIT_RUNNER) {}

    private async git(args: string[]): Promise<string> {
        try { return await this.runner([...BASE_ARGS, ...args], this.Root); }
        catch (e) { throw new Error(`git ${args.join(' ')} failed: ${(e as Error).message}`); }
    }
    public async ResolveSHA(ref: string): Promise<string> { return (await this.git(['rev-parse', '--verify', `${ref}^{commit}`])).trim(); }
    public async MergeBase(a: string, b: string): Promise<string> { return (await this.git(['merge-base', a, b])).trim(); }
    public async FirstParent(sha: string): Promise<string> { return this.ResolveSHA(`${sha}^1`); }
    /** The subject line of commit `sha`, trimmed. */
    public async Subject(sha: string): Promise<string> { return (await this.git(['log', '-1', '--format=%s', sha])).trim(); }
    public async Fetch(ref: string): Promise<void> { await this.git(['fetch', '--no-tags', 'origin', ref]); }
    /** Unified diff of base..head. `NoRenames` shows a renamed file as a delete of the old path plus an add of the new one. */
    public async Diff(base: string, head: string, paths: string[] = [], o: { NoRenames?: boolean } = {}): Promise<string> {
        const renames = o.NoRenames ? ['--no-renames'] : [];
        return this.git(['diff', '--no-color', '--no-ext-diff', ...renames, '--src-prefix=a/', '--dst-prefix=b/', `${base}..${head}`, '--', ...paths]);
    }
    /** SHAs of commits after `sha` on origin/next that touch any of `paths`. */
    public async LaterCommitsTouching(sha: string, paths: string[]): Promise<string[]> {
        return (await this.git(['log', '--format=%H', `${sha}..origin/next`, '--', ...paths])).split('\n').filter(Boolean);
    }
    /**
     * For each line range at `sha`, the first-parent landing commit that last changed each line; one SHA per line.
     * `--root` keeps the root commit from printing as a boundary (`^` and a shortened SHA).
     */
    public async BlameFirstParent(sha: string, path: string, ranges: { Start: number; End: number }[]): Promise<string[]> {
        if (ranges.length === 0) return [];
        const lineArgs = ranges.flatMap((r) => ['-L', `${r.Start},${r.End}`]);
        const out = await this.git(['blame', '-l', '--root', '--first-parent', ...lineArgs, sha, '--', path]);
        return out.split('\n').map((l) => /^\^?([0-9a-f]{40})/.exec(l)?.[1]).filter((s): s is string => Boolean(s));
    }
    public async ChangedPaths(base: string, head: string): Promise<string[]> { return (await this.git(['diff', '--name-only', `${base}..${head}`])).split('\n').filter(Boolean); }
    /** File content at `sha`, or null when the path does not exist there. */
    public async Show(sha: string, path: string): Promise<string | null> {
        if (!(await this.exists(sha, path))) return null;
        return this.git(['show', `${sha}:${path}`]);
    }
    private async exists(sha: string, path: string): Promise<boolean> {
        try { await this.runner([...BASE_ARGS, 'cat-file', '-e', `${sha}:${path}`], this.Root); return true; } catch { return false; }
    }
    public async AddWorktree(dir: string, sha: string): Promise<void> { await this.git(['worktree', 'add', '--detach', dir, sha]); }
    public async RemoveWorktree(dir: string): Promise<void> { await this.git(['worktree', 'remove', '--force', dir]); }
    /** `git -C <dir> apply --3way --whitespace=nowarn <patchFile>`; false when git exits non-zero (the patch does not apply). */
    public async ApplyPatch(dir: string, patchFile: string): Promise<boolean> {
        try { await this.runner([...BASE_ARGS, '-C', dir, 'apply', '--3way', '--whitespace=nowarn', patchFile], this.Root); return true; }
        catch (e) {
            if (isExitError(e)) return false;
            throw new Error(`git apply ${patchFile} failed: ${(e as Error).message}`);
        }
    }
    /**
     * The commit of `baseSHA` plus the patch: applies `patchFile` in a scratch worktree at `scratchDir`, commits its tree
     * with `baseSHA` as parent and returns the new commit SHA; null when the patch does not apply. The scratch worktree is
     * removed before this returns.
     */
    public async CommitWithPatch(baseSHA: string, patchFile: string, scratchDir: string): Promise<string | null> {
        await this.AddWorktree(scratchDir, baseSHA);
        try {
            if (!(await this.ApplyPatch(scratchDir, patchFile))) return null;
            await this.git(['-C', scratchDir, 'add', '-A']);
            const tree = (await this.git(['-C', scratchDir, 'write-tree'])).trim();
            return (await this.git(['-C', scratchDir, 'commit-tree', tree, '-p', baseSHA, '-m', `jit-catch match: ${baseSHA} + fix`])).trim();
        } finally {
            await this.RemoveWorktree(scratchDir);
        }
    }
}

/** True when the error is a process that ran and exited non-zero (a numeric exit `code`), not one that failed to start. */
function isExitError(e: unknown): boolean {
    return e instanceof Error && 'code' in e && typeof e.code === 'number' && e.code !== 0;
}
