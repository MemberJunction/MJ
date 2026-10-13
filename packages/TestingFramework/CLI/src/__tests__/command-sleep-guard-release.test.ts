/**
 * `mj test run` and `mj test suite` hold a host sleep guard for the length of the command and release
 * it in `finally`. A path that calls process.exit ends the assertion with the process (caffeinate -w),
 * but a programmatic caller that re-enters Execute must not stack one assertion per call: every way out
 * of Execute that does not exit the process releases the guard. process.exit is stubbed here so the
 * error path (which exits 1) can be observed through to its `finally`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { guard, loadMJConfig } = vi.hoisted(() => ({
    guard: { Active: true, Description: 'test guard', Release: vi.fn() },
    loadMJConfig: vi.fn(),
}));

vi.mock('../lib/host-sleep-guard', () => ({
    HostSleepGuard: { AcquireForRun: () => guard },
}));
vi.mock('../utils/config-loader', () => ({ LoadMJConfig: loadMJConfig, LoadCLIConfig: vi.fn() }));
vi.mock('../lib/mj-provider', () => ({
    InitializeMJProvider: vi.fn(),
    CloseMJProvider: vi.fn().mockResolvedValue(undefined),
    GetContextUser: vi.fn(),
}));
vi.mock('../utils/check-module-loader', () => ({ LoadCheckModules: vi.fn() }));
vi.mock('../utils/oracle-module-loader', () => ({ LoadOraclesModule: vi.fn() }));
vi.mock('@memberjunction/testing-engine', () => ({ TestEngine: { Instance: {} } }));
vi.mock('@memberjunction/testing-integration', () => ({ installInstrumentedCacheFirst: vi.fn() }));

import { RunCommand } from '../commands/run';
import { SuiteCommand } from '../commands/suite';
import type { RunFlags, SuiteFlags } from '../types';

describe('run / suite release the host sleep guard', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        guard.Release.mockClear();
        loadMJConfig.mockReset();
        loadMJConfig.mockRejectedValue(new Error('config unreadable'));
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('RunCommand.Execute releases the guard on the way out of a failed run', async () => {
        const flags: RunFlags = {};
        await new RunCommand().Execute('some-test', flags);
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(guard.Release).toHaveBeenCalledTimes(1);
    });

    it('SuiteCommand.Execute releases the guard on the way out of a failed run', async () => {
        const flags: SuiteFlags = {};
        await new SuiteCommand().Execute('some-suite', flags);
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(guard.Release).toHaveBeenCalledTimes(1);
    });
});
