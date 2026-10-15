import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

// DatabaseProviderBase is defined INSIDE the factory (vi.mock is hoisted). Tests import the same
// class from the mocked module, so `instanceof` matches when a test sets Metadata.Provider to one.
vi.mock('@memberjunction/core', () => ({
    ValidationResult: class {
        Success = false;
        Errors: Array<{ Source: string; Message: string }> = [];
    },
    ValidationErrorInfo: class {
        constructor(public Source: string, public Message: string, public Value: unknown, public Type: string) {}
    },
    ValidationErrorType: { Failure: 'Failure' },
    Metadata: class { static Provider: unknown = undefined; },
    DatabaseProviderBase: class DatabaseProviderBase {},
    UserInfo: class { ID = 'user-1'; },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunWatchdog: class { static SweepOrphanedRuns = vi.fn().mockResolvedValue(0); },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {},
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
    ScheduledJobConfiguration: class {},
}));

import { Metadata, DatabaseProviderBase } from '@memberjunction/core';
import { AgentRunWatchdog } from '@memberjunction/ai-agents';
import { AgentRunSweepScheduledJobDriver } from '../drivers/AgentRunSweepScheduledJobDriver';

type Mutable = { Provider: unknown };
const sweepSpy = AgentRunWatchdog.SweepOrphanedRuns as unknown as ReturnType<typeof vi.fn>;
const ctx = (Configuration: string | null = null) =>
    ({ Schedule: { Name: 'Nightly Sweep', Configuration }, Run: { ID: 'run-1' }, ContextUser: { ID: 'sys' } } as never);

describe('AgentRunSweepScheduledJobDriver', () => {
    let driver: AgentRunSweepScheduledJobDriver;

    beforeEach(() => {
        driver = new AgentRunSweepScheduledJobDriver();
        vi.clearAllMocks();
        sweepSpy.mockResolvedValue(0);
        (Metadata as unknown as Mutable).Provider = new (DatabaseProviderBase as unknown as new () => object)();
    });

    describe('Execute', () => {
        it('runs the sweep and reports the orphan count', async () => {
            sweepSpy.mockResolvedValue(3);
            const result = await driver.Execute(ctx());
            expect(result.Success).toBe(true);
            expect(result.Details).toEqual({ RunsFailed: 3 });
            expect(sweepSpy).toHaveBeenCalledTimes(1);
        });

        it('passes a custom StaleThresholdMinutes through to the sweep', async () => {
            await driver.Execute(ctx('{"StaleThresholdMinutes": 15}'));
            expect(sweepSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), { staleThresholdMinutes: 15 });
        });

        it('omits sweep config when no threshold is configured', async () => {
            await driver.Execute(ctx());
            expect(sweepSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined);
        });

        it('fails cleanly when no database provider is available', async () => {
            (Metadata as unknown as Mutable).Provider = {}; // not a DatabaseProviderBase
            const result = await driver.Execute(ctx());
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('no database provider');
            expect(sweepSpy).not.toHaveBeenCalled();
        });
    });

    describe('ValidateConfiguration', () => {
        const validate = (Configuration: string | null) =>
            driver.ValidateConfiguration({ Configuration } as never);

        it('accepts empty configuration (defaults apply)', () => {
            expect(validate(null).Success).toBe(true);
        });
        it('accepts a positive threshold', () => {
            expect(validate('{"StaleThresholdMinutes": 10}').Success).toBe(true);
        });
        it.each(['{"StaleThresholdMinutes": 0}', '{"StaleThresholdMinutes": -5}', '{"StaleThresholdMinutes": "x"}'])(
            'rejects a non-positive/non-numeric threshold: %s',
            (cfg) => {
                const r = validate(cfg);
                expect(r.Success).toBe(false);
                expect(r.Errors.length).toBe(1);
            },
        );
    });

    describe('FormatNotification', () => {
        it('summarizes a successful sweep that failed runs (Normal priority)', () => {
            const n = driver.FormatNotification(ctx(), { Success: true, Details: { RunsFailed: 2 } });
            expect(n.Subject).toContain('2 orphaned');
            expect(n.Priority).toBe('Normal');
        });
        it('uses Low priority when nothing was swept', () => {
            const n = driver.FormatNotification(ctx(), { Success: true, Details: { RunsFailed: 0 } });
            expect(n.Priority).toBe('Low');
        });
        it('uses High priority and surfaces the error on failure', () => {
            const n = driver.FormatNotification(ctx(), { Success: false, ErrorMessage: 'boom' });
            expect(n.Priority).toBe('High');
            expect(n.Body).toContain('boom');
        });
    });
});
