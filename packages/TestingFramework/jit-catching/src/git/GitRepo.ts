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
    public async Diff(base: string, head: string, paths: string[] = []): Promise<string> { return this.git(['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `${base}..${head}`, '--', ...paths]); }
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
}
