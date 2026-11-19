/**
 * Tests for CheckWorkspacePackages: the check that every package a local Open App writes as
 * `workspace:*` is a project in the consumer's workspace, before the install changes anything.
 *
 * The package manager is the boundary, so `execFile` is stubbed with the output each package
 * manager prints for its workspace listing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecFileException } from 'node:child_process';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';
import { CheckWorkspacePackages } from '../install/workspace-packages.js';

const REPO_ROOT = '/repo/platform';

type ExecCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

/** Makes execFile answer every call with the given stdout, or with an error. */
function answerExecFile(stdout: string, error: ExecFileException | null = null): void {
    vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
        callback(error, stdout, error ? 'command failed' : '');
    }) as unknown as typeof execFile);
}

const PNPM_LISTING = JSON.stringify([
    { name: 'platform', path: REPO_ROOT, private: true },
    { name: '@acme/analytics-server', version: '1.0.0', path: `${REPO_ROOT}/openapps/analytics/packages/server` },
    { name: '@acme/analytics-ui', version: '1.0.0', path: `${REPO_ROOT}/openapps/analytics/packages/ui` },
]);

describe('CheckWorkspacePackages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes when pnpm lists every package as a workspace project', async () => {
        answerExecFile(PNPM_LISTING);

        const result = await CheckWorkspacePackages(['@acme/analytics-server', '@acme/analytics-ui'], REPO_ROOT, 'pnpm');

        expect(result).toEqual({ Success: true, Missing: [] });
        const [file, args, options] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], { cwd: string }];
        expect(file).toMatch(/^pnpm(\.cmd)?$/);
        expect(args).toEqual(['ls', '-r', '--depth', '-1', '--json']);
        expect(options.cwd).toBe(REPO_ROOT);
    });

    it('names the packages that are not in the workspace and says nothing changed', async () => {
        answerExecFile(PNPM_LISTING);

        const result = await CheckWorkspacePackages(['@acme/analytics-server', '@acme/analytics-actions'], REPO_ROOT, 'pnpm');

        expect(result.Success).toBe(false);
        expect(result.Missing).toEqual(['@acme/analytics-actions']);
        expect(result.ErrorMessage).toContain('@acme/analytics-actions');
        expect(result.ErrorMessage).toContain('pnpm-workspace.yaml');
        expect(result.ErrorMessage).toContain('Nothing has been changed');
    });

    it('reads the yarn workspace listing', async () => {
        answerExecFile([
            JSON.stringify({ location: '.', name: 'platform' }),
            JSON.stringify({ location: 'openapps/analytics/packages/server', name: '@acme/analytics-server' }),
        ].join('\n'));

        const result = await CheckWorkspacePackages(['@acme/analytics-server'], REPO_ROOT, 'yarn');

        expect(result).toEqual({ Success: true, Missing: [] });
        const [file, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
        expect(file).toMatch(/^yarn(\.cmd)?$/);
        expect(args).toEqual(['workspaces', 'list', '--json']);
    });

    it('refuses npm, which cannot install workspace:* versions, without running it', async () => {
        const result = await CheckWorkspacePackages(['@acme/analytics-server'], REPO_ROOT, 'npm');

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('npm');
        expect(execFile).not.toHaveBeenCalled();
    });

    it('fails with the reason when the package manager cannot list the workspace', async () => {
        const error = Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }) as ExecFileException;
        answerExecFile('', error);

        const result = await CheckWorkspacePackages(['@acme/analytics-server'], REPO_ROOT, 'pnpm');

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('spawn pnpm ENOENT');
    });

    it('does not run the package manager when the app has no packages', async () => {
        const result = await CheckWorkspacePackages([], REPO_ROOT, 'pnpm');

        expect(result).toEqual({ Success: true, Missing: [] });
        expect(execFile).not.toHaveBeenCalled();
    });
});
