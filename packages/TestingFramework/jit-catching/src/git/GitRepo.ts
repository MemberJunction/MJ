import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Options set on every git call so paths print as plain text. */
const BASE_ARGS = ['-c', 'core.quotePath=false'];

/** Thin wrapper over the `git` CLI for one repository root. */
export class GitRepo {
    constructor(public readonly Root: string) {}

    private async git(args: string[]): Promise<string> {
        try { const { stdout } = await run('git', [...BASE_ARGS, ...args], { cwd: this.Root, maxBuffer: 256 * 1024 * 1024 }); return stdout; }
        catch (e) { throw new Error(`git ${args.join(' ')} failed: ${(e as Error).message}`); }
    }
    public async ResolveSHA(ref: string): Promise<string> { return (await this.git(['rev-parse', '--verify', `${ref}^{commit}`])).trim(); }
    public async MergeBase(a: string, b: string): Promise<string> { return (await this.git(['merge-base', a, b])).trim(); }
    public async FirstParent(sha: string): Promise<string> { return this.ResolveSHA(`${sha}^1`); }
    public async Fetch(ref: string): Promise<void> { await this.git(['fetch', '--no-tags', 'origin', ref]); }
    public async Diff(base: string, head: string, paths: string[] = []): Promise<string> { return this.git(['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `${base}..${head}`, '--', ...paths]); }
    public async ChangedPaths(base: string, head: string): Promise<string[]> { return (await this.git(['diff', '--name-only', `${base}..${head}`])).split('\n').filter(Boolean); }
    /** File content at `sha`, or null when the path does not exist there. */
    public async Show(sha: string, path: string): Promise<string | null> {
        if (!(await this.exists(sha, path))) return null;
        return this.git(['show', `${sha}:${path}`]);
    }
    private async exists(sha: string, path: string): Promise<boolean> {
        try { await run('git', [...BASE_ARGS, 'cat-file', '-e', `${sha}:${path}`], { cwd: this.Root }); return true; } catch { return false; }
    }
    public async AddWorktree(dir: string, sha: string): Promise<void> { await this.git(['worktree', 'add', '--detach', dir, sha]); }
    public async RemoveWorktree(dir: string): Promise<void> { await this.git(['worktree', 'remove', '--force', dir]); }
}
