/**
 * `mj app install` / `upgrade` / `remove` / `enable` / `disable` must exit 1 — once — when the
 * engine reports failure.
 *
 * oclif's `this.exit(1)` works by THROWING an ExitError. Called inside the command's generic
 * try/catch, the catch swallowed its own exit: it printed a second "failed" line and re-raised the
 * string "EEXIT: 1" through `this.error()`, which exits 2.
 */
import { describe, it, expect, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@memberjunction/open-app-engine', () => ({
    InstallApp: vi.fn(async () => ({ Success: false, ErrorMessage: 'Cannot read Acme/Private.' })),
    UpgradeApp: vi.fn(async () => ({ Success: false, ErrorMessage: 'Cannot read Acme/Private.' })),
    RemoveApp: vi.fn(async () => ({ Success: false, ErrorMessage: "App 'no-such-app' is not installed" })),
    EnableApp: vi.fn(async () => ({ Success: false, ErrorMessage: "App 'no-such-app' is not installed" })),
    DisableApp: vi.fn(async () => ({ Success: false, ErrorMessage: "App 'no-such-app' is not installed" })),
}));
vi.mock('../utils/open-app-context.js', () => ({
    BuildOrchestratorContext: vi.fn(async () => ({})),
}));

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Runs a command and returns what it threw, so the exit code can be read off oclif's error. */
async function runAndCatch(run: () => Promise<unknown>): Promise<{ message: string; exit: number | undefined }> {
    try {
        await run();
    } catch (error: unknown) {
        const e = error as Error & { oclif?: { exit?: number } };
        return { message: e.message, exit: e.oclif?.exit };
    }
    throw new Error('expected the command to fail');
}

describe('app command exit code on an engine failure', () => {
    it('install exits 1 with ExitError, not 2 with "EEXIT: 1"', async () => {
        const { default: AppInstall } = await import('../commands/app/install.js');
        const result = await runAndCatch(() => AppInstall.run(['https://github.com/Acme/Private', '--non-interactive'], packageRoot));
        expect(result.exit).toBe(1);
        expect(result.message).toBe('EEXIT: 1');
    }, 60_000);

    it('upgrade exits 1 with ExitError, not 2 with "EEXIT: 1"', async () => {
        const { default: AppUpgrade } = await import('../commands/app/upgrade.js');
        const result = await runAndCatch(() => AppUpgrade.run(['some-app', '--version', '1.0.0'], packageRoot));
        expect(result.exit).toBe(1);
        expect(result.message).toBe('EEXIT: 1');
    }, 60_000);

    it('remove exits 1 with ExitError, not 2 with "EEXIT: 1" (#5930)', async () => {
        const { default: AppRemove } = await import('../commands/app/remove.js');
        const result = await runAndCatch(() => AppRemove.run(['no-such-app', '--yes', '--force'], packageRoot));
        expect(result.exit).toBe(1);
        expect(result.message).toBe('EEXIT: 1');
    }, 60_000);

    it('enable exits 1 with ExitError, not 2 with "EEXIT: 1" (#5930)', async () => {
        const { default: AppEnable } = await import('../commands/app/enable.js');
        const result = await runAndCatch(() => AppEnable.run(['no-such-app'], packageRoot));
        expect(result.exit).toBe(1);
        expect(result.message).toBe('EEXIT: 1');
    }, 60_000);

    it('disable exits 1 with ExitError, not 2 with "EEXIT: 1" (#5930)', async () => {
        const { default: AppDisable } = await import('../commands/app/disable.js');
        const result = await runAndCatch(() => AppDisable.run(['no-such-app'], packageRoot));
        expect(result.exit).toBe(1);
        expect(result.message).toBe('EEXIT: 1');
    }, 60_000);
});
