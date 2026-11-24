/**
 * `--dependencies-from-head` on `mj app install` and `mj app upgrade` must reach the engine, and must
 * be off unless the developer gives it: on a deployment, an installed app is held to the dependencies
 * of its installed version (#6877).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstallApp, UpgradeApp } from '@memberjunction/open-app-engine';

vi.mock('@memberjunction/open-app-engine', () => ({
    InstallApp: vi.fn(async () => ({ Success: true, AppName: 'crm', Version: '1.0.0' })),
    UpgradeApp: vi.fn(async () => ({ Success: true, AppName: 'crm', Version: '1.0.0' })),
}));
vi.mock('../utils/open-app-context.js', () => ({
    BuildOrchestratorContext: vi.fn(async () => ({})),
}));

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('--dependencies-from-head', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['off by default', [], undefined],
        ['all installed apps', ['--dependencies-from-head', 'all'], 'all'],
        ['one app', ['--dependencies-from-head', 'mj-tasks'], ['mj-tasks']],
        ['several apps', ['--dependencies-from-head', 'mj-tasks', '--dependencies-from-head', 'mj-common'], ['mj-tasks', 'mj-common']],
        ['all next to a name', ['--dependencies-from-head', 'mj-tasks', '--dependencies-from-head', 'all'], 'all'],
    ])('install: %s', async (_name, flags, expected) => {
        const { default: AppInstall } = await import('../commands/app/install.js');
        await AppInstall.run(['https://github.com/acme/crm', '--non-interactive', ...flags], packageRoot);
        expect(vi.mocked(InstallApp).mock.calls[0][0].DependenciesFromHead).toEqual(expected);
    }, 60_000);

    it.each([
        ['off by default', [], undefined],
        ['all installed apps', ['--dependencies-from-head', 'all'], 'all'],
        ['one app', ['--dependencies-from-head', 'mj-tasks'], ['mj-tasks']],
        ['several apps', ['--dependencies-from-head', 'mj-tasks', '--dependencies-from-head', 'mj-common'], ['mj-tasks', 'mj-common']],
        ['all next to a name', ['--dependencies-from-head', 'mj-tasks', '--dependencies-from-head', 'all'], 'all'],
    ])('upgrade: %s', async (_name, flags, expected) => {
        const { default: AppUpgrade } = await import('../commands/app/upgrade.js');
        await AppUpgrade.run(['crm', '--non-interactive', ...flags], packageRoot);
        expect(vi.mocked(UpgradeApp).mock.calls[0][0].DependenciesFromHead).toEqual(expected);
    }, 60_000);

    it('leaves the app argument that follows it', async () => {
        const { default: AppUpgrade } = await import('../commands/app/upgrade.js');
        await AppUpgrade.run(['--dependencies-from-head', 'mj-tasks', 'crm'], packageRoot);
        expect(vi.mocked(UpgradeApp).mock.calls[0][0]).toMatchObject({ AppName: 'crm', DependenciesFromHead: ['mj-tasks'] });
    }, 60_000);
});
