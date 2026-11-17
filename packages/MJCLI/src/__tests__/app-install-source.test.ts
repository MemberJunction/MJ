/**
 * `mj app install <source>` with a folder path: the command passes the engine a `file:` locator
 * relative to the repository root, and refuses a folder outside that root before installing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstallOptions } from '@memberjunction/open-app-engine';

const installCalls: InstallOptions[] = [];

vi.mock('@memberjunction/open-app-engine', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/open-app-engine')>()),
    InstallApp: vi.fn(async (options: InstallOptions) => {
        installCalls.push(options);
        return { Success: true, AppName: 'analytics', Version: '1.0.0' };
    }),
}));

let repoRoot: string;
vi.mock('../utils/open-app-context.js', () => ({
    BuildOrchestratorContext: vi.fn(async () => ({ RepoRoot: repoRoot })),
}));

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

beforeEach(() => {
    installCalls.length = 0;
    repoRoot = mkdtempSync(join(tmpdir(), 'app-install-'));
    mkdirSync(join(repoRoot, 'openapps', 'analytics'), { recursive: true });
});

afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
});

describe('mj app install with a local folder', () => {
    it('installs a folder path as a file: locator relative to the repository root', async () => {
        const { default: AppInstall } = await import('../commands/app/install.js');

        await AppInstall.run(['./openapps/analytics', '--non-interactive'], packageRoot);

        expect(installCalls).toHaveLength(1);
        expect(installCalls[0].Source).toBe('file:openapps/analytics');
    }, 60_000);

    it('refuses a folder outside the repository root without installing', async () => {
        const { default: AppInstall } = await import('../commands/app/install.js');

        let exit: number | undefined;
        try {
            await AppInstall.run(['../elsewhere/app', '--non-interactive'], packageRoot);
        } catch (error: unknown) {
            exit = (error as Error & { oclif?: { exit?: number } }).oclif?.exit;
        }

        expect(exit).toBe(1);
        expect(installCalls).toHaveLength(0);
    }, 60_000);
});
