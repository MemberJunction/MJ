/**
 * `mj app upgrade <name> --reapply` asks the engine to run the upgrade even when the app is
 * already at the target version.
 */
import { describe, it, expect, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UpgradeOptions } from '@memberjunction/open-app-engine';

const upgradeCalls: UpgradeOptions[] = [];

vi.mock('@memberjunction/open-app-engine', () => ({
    UpgradeApp: vi.fn(async (options: UpgradeOptions) => {
        upgradeCalls.push(options);
        return { Success: true, AppName: options.AppName, Version: '1.0.0' };
    }),
}));
vi.mock('../utils/open-app-context.js', () => ({
    BuildOrchestratorContext: vi.fn(async () => ({})),
}));

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('mj app upgrade --reapply', () => {
    it('passes Reapply to the engine', async () => {
        const { default: AppUpgrade } = await import('../commands/app/upgrade.js');

        await AppUpgrade.run(['analytics', '--reapply', '--non-interactive'], packageRoot);

        expect(upgradeCalls).toHaveLength(1);
        expect(upgradeCalls[0].Reapply).toBe(true);
    }, 60_000);
});
