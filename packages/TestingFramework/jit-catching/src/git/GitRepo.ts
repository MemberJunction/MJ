import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Options set on every git call so paths print as plain text. */
const BASE_ARGS = ['-c', 'core.quotePath=false'];

/** Runs `git` with the given arguments in `cwd` and returns its stdout. Injected so tests never run git. */
export type GitRunner = (args: string[], cwd: string) => Promise<string>;
const DEFAULT_GIT_RUNNER: GitRunner = async (args, cwd) => (await run('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 })).stdout;

/** The text a read of a revision gives, or the git error message. */
export type GitText = { Ok: true; Text: string } | { Ok: false; Error: string };

/** Pathspecs that `GrepAt` leaves out: test files, generated code and build output. */
const GREP_EXCLUDES = [':!*.test.ts', ':!**/generated/**', ':!**/dist/**'];

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
    /** The subject and body of every non-merge commit in base..head, newest first, without blank lines. */
    public async Messages(base: string, head: string): Promise<string> {
        return (await this.git(['log', '--no-merges', '--format=%s%n%b', `${base}..${head}`])).split('\n').filter((l) => l.trim()).join('\n');
    }
    public async Fetch(ref: string): Promise<void> { await this.git(['fetch', '--no-tags', 'origin', ref]); }
    /** Unified diff of base..head. `NoRenames` shows a renamed file as a delete of the old path plus an add of the new one. */
    public async Diff(base: string, head: string, paths: string[] = [], o: { NoRenames?: boolean } = {}): Promise<string> {
        const renames = o.NoRenames ? ['--no-renames'] : [];
        return this.git(['diff', '--no-color', '--no-ext-diff', ...renames, '--src-prefix=a/', '--dst-prefix=b/', `${base}..${head}`, '--', ...paths]);
    }
    /** SHAs of commits after `sha` on origin/next that touch any of `paths`. */
    public async LaterCommitsTouching(sha: string, paths: string[]): Promise<string[]> {
        return (await this.git(['log', '--first-parent', '--format=%H', `${sha}..origin/next`, '--', ...paths])).split('\n').filter(Boolean);
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
    /** File content at `sha` without a checkout. A git failure (such as a missing path) is returned, not thrown. */
    public async FileAt(sha: string, path: string): Promise<GitText> {
        try { return { Ok: true, Text: await this.runner([...BASE_ARGS, 'show', `${sha}:${path}`], this.Root) }; }
        catch (e) { return { Ok: false, Error: gitErrorText(e) }; }
    }
    /**
     * `git grep` for the extended regular expression `pattern` at `sha` under `path` (default `packages`), without test files,
     * generated code or build output. Lines read `<sha>:<path>:<line>:<text>`. No match gives empty text; any other git
     * failure is returned, not thrown.
     */
    public async GrepAt(sha: string, pattern: string, path = 'packages'): Promise<GitText> {
        try { return { Ok: true, Text: await this.runner([...BASE_ARGS, 'grep', '-n', '-I', '-E', '-e', pattern, sha, '--', path || 'packages', ...GREP_EXCLUDES], this.Root) }; }
        catch (e) {
            if (isExitError(e) && (e as { code: number }).code === 1 && !stderrOf(e)) return { Ok: true, Text: '' };
            return { Ok: false, Error: gitErrorText(e) };
        }
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
     * with `baseSHA` as parent under the fixed identity `jit-catch <jit-catch@localhost>` and returns the new commit SHA;
     * null when the patch does not apply. A worktree or folder left at `scratchDir` is removed first, and the scratch
     * worktree is removed before this returns.
     */
    public async CommitWithPatch(baseSHA: string, patchFile: string, scratchDir: string): Promise<string | null> {
        await this.RemoveWorktree(scratchDir).catch(() => rmSync(scratchDir, { recursive: true, force: true }));
        await this.AddWorktree(scratchDir, baseSHA);
        try {
            if (!(await this.ApplyPatch(scratchDir, patchFile))) return null;
            await this.git(['-C', scratchDir, 'add', '-A']);
            const tree = (await this.git(['-C', scratchDir, 'write-tree'])).trim();
            return (await this.git(['-c', 'user.name=jit-catch', '-c', 'user.email=jit-catch@localhost', '-C', scratchDir, 'commit-tree', tree, '-p', baseSHA, '-m', `jit-catch match: ${baseSHA} + fix`])).trim();
        } finally {
            await this.RemoveWorktree(scratchDir);
        }
    }
}

/** The stderr text of a failed `execFile` call, trimmed; empty when there is none. */
function stderrOf(e: unknown): string {
    return typeof e === 'object' && e !== null && 'stderr' in e && typeof e.stderr === 'string' ? e.stderr.trim() : '';
}

/** A short message for a failed git call: its stderr when it has one, otherwise the error message. */
function gitErrorText(e: unknown): string {
    return (stderrOf(e) || (e instanceof Error ? e.message : String(e))).slice(0, 300);
}

/** True when the error is a process that ran and exited non-zero (a numeric exit `code`), not one that failed to start. */
function isExitError(e: unknown): boolean {
    return e instanceof Error && 'code' in e && typeof e.code === 'number' && e.code !== 0;
}
