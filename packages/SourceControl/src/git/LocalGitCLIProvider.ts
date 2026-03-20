/**
 * LocalGitCLIProvider — executes git commands on the local filesystem via child_process.
 *
 * Registered as 'local' in MJ's ClassFactory. Each method builds a git command
 * string and delegates to Exec() which runs it via child_process.exec.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseGitCLIProvider } from '../BaseGitCLIProvider.js';
import type { GitExecResult } from '../BaseGitCLIProvider.js';
import type { GitStatus, GitLogEntry, GitLogOptions, GitPushOptions } from '../interfaces.js';
import { SourceControlMetrics } from '../SourceControlMetrics.js';

/** Default timeout for git commands (60 seconds). */
const DEFAULT_TIMEOUT_MS = 60_000;

@RegisterClass(BaseGitCLIProvider, 'local')
export class LocalGitCLIProvider extends BaseGitCLIProvider {
    get ProviderName(): string {
        return 'local';
    }

    // ─── Repository State ─────────────────────────────────────────

    async CurrentBranch(workDir: string): Promise<string> {
        const { Stdout } = await this.execAndRecord(workDir, 'rev-parse --abbrev-ref HEAD', 'CurrentBranch');
        return Stdout.trim();
    }

    async Status(workDir: string): Promise<GitStatus> {
        const branchResult = await this.execAndRecord(workDir, 'rev-parse --abbrev-ref HEAD', 'Status.branch');
        const statusResult = await this.execAndRecord(workDir, 'status --porcelain', 'Status');

        const branch = branchResult.Stdout.trim();
        const lines = statusResult.Stdout.split('\n').filter(l => l.length > 0);

        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];

        for (const line of lines) {
            const indexStatus = line[0];
            const workTreeStatus = line[1];
            const fileName = line.substring(3).trim();

            if (indexStatus === '?' && workTreeStatus === '?') {
                untracked.push(fileName);
            } else if (indexStatus !== ' ' && indexStatus !== '?') {
                staged.push(fileName);
            } else if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
                modified.push(fileName);
            }
        }

        return {
            Branch: branch,
            Clean: lines.length === 0,
            Staged: staged,
            Modified: modified,
            Untracked: untracked,
        };
    }

    async Log(workDir: string, options?: GitLogOptions): Promise<GitLogEntry[]> {
        const args: string[] = ['log', '--format=%H|%s|%an|%aI'];
        if (options?.MaxCount != null) args.push(`-n ${options.MaxCount}`);
        if (options?.Since) args.push(`--since="${options.Since}"`);

        const { Stdout } = await this.execAndRecord(workDir, args.join(' '), 'Log');
        return Stdout.split('\n')
            .filter(l => l.length > 0)
            .map(line => {
                const [sha, message, author, date] = line.split('|');
                return { SHA: sha, Message: message, Author: author, Date: date };
            });
    }

    // ─── Branching ────────────────────────────────────────────────

    async CreateBranch(workDir: string, name: string): Promise<void> {
        await this.execAndRecord(workDir, `checkout -b ${name}`, 'CreateBranch');
    }

    async Checkout(workDir: string, branch: string): Promise<void> {
        await this.execAndRecord(workDir, `checkout ${branch}`, 'Checkout');
    }

    // ─── Staging & Committing ─────────────────────────────────────

    async Add(workDir: string, files: string[]): Promise<void> {
        const quoted = files.map(f => `"${f}"`).join(' ');
        await this.execAndRecord(workDir, `add ${quoted}`, 'Add');
    }

    async Commit(workDir: string, message: string): Promise<string> {
        // Use a temp file for the commit message to avoid shell escaping issues
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const msgFile = `${workDir}/.sc_commit_msg_${Date.now()}.txt`;
        writeFileSync(msgFile, message, 'utf-8');
        try {
            await this.execAndRecord(workDir, `commit -F "${msgFile}"`, 'Commit');
        } finally {
            try { unlinkSync(msgFile); } catch { /* best-effort cleanup */ }
        }

        // Return the new commit SHA
        const { Stdout } = await this.Exec(workDir, 'rev-parse HEAD');
        return Stdout.trim();
    }

    // ─── Remote ───────────────────────────────────────────────────

    async Push(workDir: string, remote: string, branch: string, options?: GitPushOptions): Promise<void> {
        const flags: string[] = [];
        if (options?.SetUpstream) flags.push('-u');
        if (options?.Force) flags.push('--force');
        await this.execAndRecord(workDir, `push ${flags.join(' ')} ${remote} ${branch}`, 'Push');
    }

    async Pull(workDir: string, remote: string, branch: string): Promise<void> {
        await this.execAndRecord(workDir, `pull ${remote} ${branch}`, 'Pull');
    }

    async Fetch(workDir: string, remote?: string): Promise<void> {
        await this.execAndRecord(workDir, `fetch ${remote ?? '--all'}`, 'Fetch');
    }

    // ─── Configuration ────────────────────────────────────────────

    async ConfigureUser(workDir: string, name: string, email: string): Promise<void> {
        await this.Exec(workDir, `config user.name "${name}"`);
        await this.Exec(workDir, `config user.email "${email}"`);
    }

    // ─── Low-level ────────────────────────────────────────────────

    async Exec(workDir: string, args: string): Promise<GitExecResult> {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(`git ${args}`, {
            cwd: workDir,
            timeout: DEFAULT_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs/logs
        });

        return { Stdout: stdout, Stderr: stderr };
    }

    // ─── Private ──────────────────────────────────────────────────

    private async execAndRecord(workDir: string, args: string, operation: string): Promise<GitExecResult> {
        const start = Date.now();
        let success = true;
        try {
            return await this.Exec(workDir, args);
        } catch (error) {
            success = false;
            throw error;
        } finally {
            SourceControlMetrics.Instance.RecordGitOperation(operation, Date.now() - start, success);
        }
    }
}
