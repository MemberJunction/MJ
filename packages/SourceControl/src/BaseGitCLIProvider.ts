/**
 * BaseGitCLIProvider — abstract base for local git CLI operations.
 *
 * Subclasses implement the execution context (local shell, Docker exec, SSH)
 * and register via ClassFactory:
 *
 *   @RegisterClass(BaseGitCLIProvider, 'local')
 *   class LocalGitCLIProvider extends BaseGitCLIProvider { ... }
 *
 * Consumers resolve providers through MJ's ClassFactory:
 *
 *   const git = MJGlobal.Instance.ClassFactory.CreateInstance<BaseGitCLIProvider>(
 *       BaseGitCLIProvider, 'local'
 *   );
 */
import type {
    GitStatus,
    GitLogEntry,
    GitLogOptions,
    GitPushOptions,
} from './interfaces.js';

/** Result of executing a git command. */
export interface GitExecResult {
    Stdout: string;
    Stderr: string;
}

export abstract class BaseGitCLIProvider {
    /** Provider identifier (e.g., 'local', 'docker', 'ssh'). */
    abstract get ProviderName(): string;

    // ─── Repository State ─────────────────────────────────────────

    /** Get the current branch name. */
    abstract CurrentBranch(workDir: string): Promise<string>;

    /** Get the working tree status. */
    abstract Status(workDir: string): Promise<GitStatus>;

    /** Get commit log entries. */
    abstract Log(workDir: string, options?: GitLogOptions): Promise<GitLogEntry[]>;

    // ─── Branching ────────────────────────────────────────────────

    /** Create a new branch at the current HEAD. */
    abstract CreateBranch(workDir: string, name: string): Promise<void>;

    /** Check out an existing branch. */
    abstract Checkout(workDir: string, branch: string): Promise<void>;

    // ─── Staging & Committing ─────────────────────────────────────

    /** Stage files for commit. */
    abstract Add(workDir: string, files: string[]): Promise<void>;

    /** Create a commit with the given message. Returns the new commit SHA. */
    abstract Commit(workDir: string, message: string): Promise<string>;

    // ─── Remote ───────────────────────────────────────────────────

    /** Push a branch to a remote. */
    abstract Push(workDir: string, remote: string, branch: string, options?: GitPushOptions): Promise<void>;

    /** Pull from a remote branch. */
    abstract Pull(workDir: string, remote: string, branch: string): Promise<void>;

    /** Fetch from a remote (or all remotes if not specified). */
    abstract Fetch(workDir: string, remote?: string): Promise<void>;

    // ─── Configuration ────────────────────────────────────────────

    /** Set the git user name and email for commits in this repo. */
    abstract ConfigureUser(workDir: string, name: string, email: string): Promise<void>;

    // ─── Low-level ────────────────────────────────────────────────

    /** Execute an arbitrary git command. Subclasses implement the execution context. */
    abstract Exec(workDir: string, args: string): Promise<GitExecResult>;
}
