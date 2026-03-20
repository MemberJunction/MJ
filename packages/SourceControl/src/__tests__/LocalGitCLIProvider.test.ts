/**
 * Unit tests for LocalGitCLIProvider.
 *
 * All child_process.exec calls are intercepted by mocking `node:child_process`.
 * The `node:util` promisify mock makes the mocked exec return its value directly
 * (as if it were already promisified).
 *
 * SourceControlMetrics is real; we Reset() between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SourceControlMetrics } from '../SourceControlMetrics.js';

// ─── Module Mocks ──────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
    exec: vi.fn(),
}));

vi.mock('node:util', () => ({
    promisify: (fn: Function) => fn,
}));

// node:fs mock — Commit() uses writeFileSync / unlinkSync via dynamic import.
// We keep a simple record of what was written so we can assert on it.
const writtenFiles: Map<string, string> = new Map();
vi.mock('node:fs', () => ({
    writeFileSync: vi.fn((path: string, content: string) => {
        writtenFiles.set(path, content);
    }),
    unlinkSync: vi.fn(),
    createWriteStream: vi.fn(), // Not used in LocalGitCLIProvider tests but exported by module
}));

// ─── Import after mocks are declared ────────────────────────────────

import { exec } from 'node:child_process';
import { LocalGitCLIProvider } from '../git/LocalGitCLIProvider.js';

// ─── Helpers ──────────────────────────────────────────────────────────

const WORK_DIR = '/tmp/test-repo';

type ExecMock = ReturnType<typeof vi.fn>;
const mockExec = exec as unknown as ExecMock;

/** Configure the mock to return specific stdout/stderr for the next call. */
function mockExecResult(stdout: string, stderr = ''): void {
    mockExec.mockResolvedValueOnce({ stdout, stderr });
}

/** Configure the mock to reject with an error. */
function mockExecError(message: string): void {
    mockExec.mockRejectedValueOnce(new Error(message));
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('LocalGitCLIProvider', () => {
    let provider: LocalGitCLIProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        writtenFiles.clear();
        provider = new LocalGitCLIProvider();
        SourceControlMetrics.Instance.Reset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ─── Properties ─────────────────────────────────────────────────

    describe('Properties', () => {
        it('should return "local" for ProviderName', () => {
            expect(provider.ProviderName).toBe('local');
        });
    });

    // ─── CurrentBranch ──────────────────────────────────────────────

    describe('CurrentBranch()', () => {
        it('should return the trimmed branch name from rev-parse', async () => {
            mockExecResult('main\n');

            const branch = await provider.CurrentBranch(WORK_DIR);

            expect(branch).toBe('main');
            expect(mockExec).toHaveBeenCalledWith(
                'git rev-parse --abbrev-ref HEAD',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should handle branch names with slashes', async () => {
            mockExecResult('feature/runtime-schema-update\n');

            const branch = await provider.CurrentBranch(WORK_DIR);

            expect(branch).toBe('feature/runtime-schema-update');
        });
    });

    // ─── Status ─────────────────────────────────────────────────────

    describe('Status()', () => {
        it('should parse porcelain output with staged, modified, and untracked files', async () => {
            // First call: rev-parse for branch name
            mockExecResult('develop\n');
            // Second call: status --porcelain
            mockExecResult(
                'M  staged-file.ts\n' +
                ' M modified-file.ts\n' +
                '?? untracked-file.ts\n' +
                'A  newly-added.ts\n',
            );

            const status = await provider.Status(WORK_DIR);

            expect(status.Branch).toBe('develop');
            expect(status.Clean).toBe(false);
            expect(status.Staged).toContain('staged-file.ts');
            expect(status.Staged).toContain('newly-added.ts');
            expect(status.Modified).toContain('modified-file.ts');
            expect(status.Untracked).toContain('untracked-file.ts');
        });

        it('should report Clean = true when porcelain output is empty', async () => {
            mockExecResult('main\n');
            mockExecResult('');

            const status = await provider.Status(WORK_DIR);

            expect(status.Clean).toBe(true);
            expect(status.Staged).toHaveLength(0);
            expect(status.Modified).toHaveLength(0);
            expect(status.Untracked).toHaveLength(0);
        });

        it('should handle files that are both staged and modified (MM)', async () => {
            mockExecResult('main\n');
            // "MM" means index has changes AND worktree has changes
            mockExecResult('MM both-changed.ts\n');

            const status = await provider.Status(WORK_DIR);

            // The first character 'M' is not space or '?', so it goes to staged
            expect(status.Staged).toContain('both-changed.ts');
        });

        it('should handle deleted files', async () => {
            mockExecResult('main\n');
            mockExecResult('D  deleted-file.ts\n');

            const status = await provider.Status(WORK_DIR);

            expect(status.Staged).toContain('deleted-file.ts');
            expect(status.Clean).toBe(false);
        });
    });

    // ─── Log ────────────────────────────────────────────────────────

    describe('Log()', () => {
        it('should parse log output into GitLogEntry[]', async () => {
            mockExecResult(
                'abc123|fix: resolve issue|Jane Doe|2026-03-15T10:00:00+00:00\n' +
                'def456|feat: add feature|John Smith|2026-03-14T09:00:00+00:00\n',
            );

            const entries = await provider.Log(WORK_DIR);

            expect(entries).toHaveLength(2);
            expect(entries[0]).toEqual({
                SHA: 'abc123',
                Message: 'fix: resolve issue',
                Author: 'Jane Doe',
                Date: '2026-03-15T10:00:00+00:00',
            });
            expect(entries[1]).toEqual({
                SHA: 'def456',
                Message: 'feat: add feature',
                Author: 'John Smith',
                Date: '2026-03-14T09:00:00+00:00',
            });
        });

        it('should pass MaxCount as -n flag', async () => {
            mockExecResult('abc123|msg|author|2026-03-15T00:00:00Z\n');

            await provider.Log(WORK_DIR, { MaxCount: 5 });

            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('-n 5'),
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should pass Since as --since flag', async () => {
            mockExecResult('');

            await provider.Log(WORK_DIR, { Since: '2026-01-01' });

            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('--since="2026-01-01"'),
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should return empty array for empty log output', async () => {
            mockExecResult('');

            const entries = await provider.Log(WORK_DIR);

            expect(entries).toHaveLength(0);
        });
    });

    // ─── CreateBranch ───────────────────────────────────────────────

    describe('CreateBranch()', () => {
        it('should run git checkout -b with the branch name', async () => {
            mockExecResult('');

            await provider.CreateBranch(WORK_DIR, 'feature/new-thing');

            expect(mockExec).toHaveBeenCalledWith(
                'git checkout -b feature/new-thing',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Checkout ───────────────────────────────────────────────────

    describe('Checkout()', () => {
        it('should run git checkout with the branch name', async () => {
            mockExecResult('');

            await provider.Checkout(WORK_DIR, 'main');

            expect(mockExec).toHaveBeenCalledWith(
                'git checkout main',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Add ────────────────────────────────────────────────────────

    describe('Add()', () => {
        it('should quote file names in the git add command', async () => {
            mockExecResult('');

            await provider.Add(WORK_DIR, ['file1.ts', 'path/to/file2.ts']);

            expect(mockExec).toHaveBeenCalledWith(
                'git add "file1.ts" "path/to/file2.ts"',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should handle files with spaces in their names', async () => {
            mockExecResult('');

            await provider.Add(WORK_DIR, ['file with spaces.ts']);

            expect(mockExec).toHaveBeenCalledWith(
                'git add "file with spaces.ts"',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Commit ─────────────────────────────────────────────────────

    describe('Commit()', () => {
        it('should write message to a temp file and use -F flag', async () => {
            // First call: git commit -F "..."
            mockExecResult('');
            // Second call: git rev-parse HEAD for the SHA
            mockExecResult('abc123def456\n');

            const sha = await provider.Commit(WORK_DIR, 'feat: add new feature');

            expect(sha).toBe('abc123def456');

            // Verify the commit command used -F with a temp file path
            const commitCall = mockExec.mock.calls[0] as [string, Record<string, unknown>];
            expect(commitCall[0]).toMatch(/^git commit -F ".*\.sc_commit_msg_\d+\.txt"$/);
        });

        it('should write the commit message content to the temp file', async () => {
            mockExecResult('');
            mockExecResult('sha123\n');

            await provider.Commit(WORK_DIR, 'fix: important bug fix\n\nDetailed description here');

            // Check that writeFileSync was called with the message
            const writtenEntries = Array.from(writtenFiles.entries());
            expect(writtenEntries.length).toBeGreaterThanOrEqual(1);
            const [, content] = writtenEntries[0];
            expect(content).toBe('fix: important bug fix\n\nDetailed description here');
        });

        it('should return the SHA from rev-parse HEAD after committing', async () => {
            mockExecResult('');
            mockExecResult('deadbeef1234567890abcdef\n');

            const sha = await provider.Commit(WORK_DIR, 'chore: update deps');

            expect(sha).toBe('deadbeef1234567890abcdef');
        });
    });

    // ─── Push ───────────────────────────────────────────────────────

    describe('Push()', () => {
        it('should run basic push without flags', async () => {
            mockExecResult('');

            await provider.Push(WORK_DIR, 'origin', 'main');

            expect(mockExec).toHaveBeenCalledWith(
                'git push  origin main',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should include -u flag when SetUpstream is true', async () => {
            mockExecResult('');

            await provider.Push(WORK_DIR, 'origin', 'feature/x', { SetUpstream: true });

            expect(mockExec).toHaveBeenCalledWith(
                'git push -u origin feature/x',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should include --force flag when Force is true', async () => {
            mockExecResult('');

            await provider.Push(WORK_DIR, 'origin', 'feature/x', { Force: true });

            expect(mockExec).toHaveBeenCalledWith(
                'git push --force origin feature/x',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should combine -u and --force flags', async () => {
            mockExecResult('');

            await provider.Push(WORK_DIR, 'origin', 'feature/x', { SetUpstream: true, Force: true });

            expect(mockExec).toHaveBeenCalledWith(
                'git push -u --force origin feature/x',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Pull ───────────────────────────────────────────────────────

    describe('Pull()', () => {
        it('should run git pull with remote and branch', async () => {
            mockExecResult('');

            await provider.Pull(WORK_DIR, 'origin', 'main');

            expect(mockExec).toHaveBeenCalledWith(
                'git pull origin main',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Fetch ──────────────────────────────────────────────────────

    describe('Fetch()', () => {
        it('should default to --all when no remote is specified', async () => {
            mockExecResult('');

            await provider.Fetch(WORK_DIR);

            expect(mockExec).toHaveBeenCalledWith(
                'git fetch --all',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });

        it('should fetch a specific remote when provided', async () => {
            mockExecResult('');

            await provider.Fetch(WORK_DIR, 'upstream');

            expect(mockExec).toHaveBeenCalledWith(
                'git fetch upstream',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── ConfigureUser ──────────────────────────────────────────────

    describe('ConfigureUser()', () => {
        it('should run git config for both name and email', async () => {
            // Two exec calls: config user.name and config user.email
            mockExecResult('');
            mockExecResult('');

            await provider.ConfigureUser(WORK_DIR, 'Jane Dev', 'jane@example.com');

            expect(mockExec).toHaveBeenCalledTimes(2);
            expect(mockExec).toHaveBeenCalledWith(
                'git config user.name "Jane Dev"',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
            expect(mockExec).toHaveBeenCalledWith(
                'git config user.email "jane@example.com"',
                expect.objectContaining({ cwd: WORK_DIR }),
            );
        });
    });

    // ─── Exec ───────────────────────────────────────────────────────

    describe('Exec()', () => {
        it('should prefix commands with git and pass workDir as cwd', async () => {
            mockExecResult('output here\n');

            const result = await provider.Exec(WORK_DIR, 'status');

            expect(result.Stdout).toBe('output here\n');
            expect(result.Stderr).toBe('');
            expect(mockExec).toHaveBeenCalledWith(
                'git status',
                expect.objectContaining({
                    cwd: WORK_DIR,
                    timeout: 60_000,
                    maxBuffer: 10 * 1024 * 1024,
                }),
            );
        });

        it('should propagate errors from exec', async () => {
            mockExecError('fatal: not a git repository');

            await expect(provider.Exec(WORK_DIR, 'status')).rejects.toThrow(
                'fatal: not a git repository',
            );
        });
    });

    // ─── Error Handling ─────────────────────────────────────────────

    describe('Error handling', () => {
        it('should propagate exec errors from CurrentBranch', async () => {
            mockExecError('fatal: not a git repository');

            await expect(provider.CurrentBranch(WORK_DIR)).rejects.toThrow(
                'fatal: not a git repository',
            );
        });

        it('should propagate exec errors from CreateBranch', async () => {
            mockExecError('fatal: A branch named "main" already exists');

            await expect(provider.CreateBranch(WORK_DIR, 'main')).rejects.toThrow(
                'fatal: A branch named "main" already exists',
            );
        });

        it('should propagate exec errors from Add', async () => {
            mockExecError('fatal: pathspec "missing.ts" did not match any files');

            await expect(provider.Add(WORK_DIR, ['missing.ts'])).rejects.toThrow(
                'fatal: pathspec "missing.ts" did not match any files',
            );
        });
    });

    // ─── Metrics Recording ──────────────────────────────────────────

    describe('Metrics recording', () => {
        it('should record successful git operations to SourceControlMetrics', async () => {
            mockExecResult('main\n');

            await provider.CurrentBranch(WORK_DIR);

            const summary = SourceControlMetrics.Instance.GetSummary();
            expect(summary.TotalGitOperations).toBe(1);
        });

        it('should record failed git operations to metrics', async () => {
            mockExecError('fatal: error');

            try {
                await provider.CurrentBranch(WORK_DIR);
            } catch {
                // Expected
            }

            const summary = SourceControlMetrics.Instance.GetSummary();
            expect(summary.TotalGitOperations).toBe(1);
        });

        it('should record multiple operations from Status()', async () => {
            mockExecResult('main\n');
            mockExecResult('M  file.ts\n');

            await provider.Status(WORK_DIR);

            // Status calls execAndRecord twice: once for branch, once for porcelain status
            const summary = SourceControlMetrics.Instance.GetSummary();
            expect(summary.TotalGitOperations).toBe(2);
        });
    });
});
