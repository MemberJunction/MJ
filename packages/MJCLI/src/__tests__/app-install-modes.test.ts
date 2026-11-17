/**
 * `mj app install --packages-only` / `--database-only`: the two halves of an install, so a Docker
 * build can run the package step with no database and a container entrypoint can run the rest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = vi.hoisted(() => ({
    InstallApp: vi.fn(async () => ({ Success: true, AppName: 'app', Version: '1.0.0' })),
    InstallAppPackages: vi.fn(async () => ({ Success: true, AppName: 'app', Version: '1.0.0' })),
}));
const contexts = vi.hoisted(() => ({
    BuildOrchestratorContext: vi.fn(async () => ({ Kind: 'full' })),
    BuildPackageStepContext: vi.fn(() => ({ Kind: 'packages' })),
}));

vi.mock('@memberjunction/open-app-engine', () => engine);
vi.mock('../utils/open-app-context.js', () => contexts);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = 'https://github.com/acme/mj-crm';

async function runInstall(...flags: string[]): Promise<Error | undefined> {
    const { default: AppInstall } = await import('../commands/app/install.js');
    try {
        await AppInstall.run([SOURCE, '--non-interactive', ...flags], packageRoot);
        return undefined;
    } catch (error: unknown) {
        return error as Error;
    }
}

describe('mj app install split modes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('--packages-only runs the package step without building a database context', async () => {
        const error = await runInstall('--packages-only');

        expect(error).toBeUndefined();
        expect(contexts.BuildOrchestratorContext).not.toHaveBeenCalled();
        expect(engine.InstallApp).not.toHaveBeenCalled();
        expect(engine.InstallAppPackages).toHaveBeenCalledWith(expect.objectContaining({ Source: SOURCE }), { Kind: 'packages' });
    }, 60_000);

    it('--database-only passes DatabaseOnly to the engine', async () => {
        const error = await runInstall('--database-only');

        expect(error).toBeUndefined();
        expect(engine.InstallApp).toHaveBeenCalledWith(expect.objectContaining({ Source: SOURCE, DatabaseOnly: true }), { Kind: 'full' });
    }, 60_000);

    it('rejects --packages-only with --database-only before any install work', async () => {
        const error = await runInstall('--packages-only', '--database-only');

        expect(error?.message).toMatch(/cannot also be provided/);
        expect(engine.InstallApp).not.toHaveBeenCalled();
        expect(engine.InstallAppPackages).not.toHaveBeenCalled();
    }, 60_000);
});
