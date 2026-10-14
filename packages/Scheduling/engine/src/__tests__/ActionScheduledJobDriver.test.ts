import { describe, it, expect, vi, beforeEach } from 'vitest';

/** One action row as the mocked engine exposes it. */
interface MockAction {
    ID: string;
    Name: string;
    DriverClass: string | null;
    Type: string;
}

/** One action param row as the mocked engine exposes it. */
interface MockActionParam {
    ID: string;
    Name: string;
    Type: string;
}

/** Stands in for ActionEngineServer.Instance; Actions and ActionParams are plain fields each test can set. */
interface MockActionEngine {
    Config: ReturnType<typeof vi.fn>;
    Actions: MockAction[];
    ActionParams: MockActionParam[];
    RunAction: ReturnType<typeof vi.fn>;
    IsActionClassLoaded: ReturnType<typeof vi.fn>;
    IsActionClassRegistered: ReturnType<typeof vi.fn>;
    ActionClassKey: ReturnType<typeof vi.fn>;
}

const { mockRunViewResults, mockEngine } = vi.hoisted(() => {
    const engine: MockActionEngine = {
        Config: vi.fn(),
        Actions: [],
        ActionParams: [],
        RunAction: vi.fn(),
        IsActionClassLoaded: vi.fn(),
        IsActionClassRegistered: vi.fn(),
        ActionClassKey: vi.fn()
    };
    return { mockRunViewResults: vi.fn(), mockEngine: engine };
});

/** Makes the mocked action engine report the action's class as loaded (or not) in this process. */
function setClassLoaded(loaded: boolean): void {
    mockEngine.IsActionClassLoaded.mockReturnValue(loaded);
    mockEngine.IsActionClassRegistered.mockReturnValue(loaded);
}

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatusEx: vi.fn(),
        // The resume's read: each call hands the view params to mockRunViewResults, which returns the rows.
        RunView: {
            FromMetadataProvider: () => ({
                RunView: async (params: { ExtraFilter?: string }) => ({ Success: true, Results: mockRunViewResults(params) })
            })
        }
    };
});

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: mockEngine }
}));

// Entity classes are plain bases here; the typed doubles keep their field values in memory.
vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {}
}));

import { LogError } from '@memberjunction/core';
import { ActionScheduledJobDriver } from '../drivers/ActionScheduledJobDriver';
import {
    TestContext,
    TestDatabaseProvider,
    TestMetadataProvider,
    TestScheduledJob,
    TestUser,
    type TestScheduledJobValues
} from './helpers/scheduling-doubles';

/** A job as the driver reads it. */
function job(values: TestScheduledJobValues = {}): TestScheduledJob {
    return new TestScheduledJob(values);
}

/** A context on `schedule` whose database provider hands out `stored` as the freshly read copy of the job. */
function contextFor(schedule: TestScheduledJob, stored: TestScheduledJob): { context: ReturnType<typeof TestContext>; provider: TestDatabaseProvider } {
    const provider = new TestDatabaseProvider();
    provider.EntityObjects = [stored];
    return { context: TestContext(schedule, provider), provider };
}

/** Runs the resume as the job's user on a database provider. */
function resume(): Promise<string[]> {
    return ActionScheduledJobDriver.ResumeJobsPausedForMissingClass(TestUser(), new TestDatabaseProvider());
}

/** A schedule for ValidateConfiguration, which reads only Configuration. */
function scheduleWith(configuration: string | null): TestScheduledJob {
    return job({ Configuration: configuration });
}

const SYNC_ACTION: MockAction = { ID: 'A1', Name: 'Sync Activities', DriverClass: 'Common.SyncActivities', Type: 'Custom' };

describe('ActionScheduledJobDriver', () => {
    let driver: ActionScheduledJobDriver;

    beforeEach(() => {
        driver = new ActionScheduledJobDriver();
        vi.clearAllMocks();
        mockEngine.Config.mockResolvedValue(undefined);
        mockEngine.Actions = [SYNC_ACTION];
        mockEngine.RunAction.mockResolvedValue({ Success: true, Message: 'Action completed', Result: { ResultCode: 'OK' }, Params: [] });
        mockRunViewResults.mockReturnValue([]);
        mockEngine.ActionParams = [];
        mockEngine.ActionClassKey.mockImplementation((action: MockAction) => action.DriverClass || action.Name);
    });

    describe('Execute when the action class is not loaded', () => {
        it('pauses the job and does not run the action when the action class is not loaded', async () => {
            setClassLoaded(false);
            const schedule = job();
            const stored = job();
            const result = await driver.Execute(contextFor(schedule, stored).context);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain("class 'Common.SyncActivities' is not loaded on this server");
            expect(stored.LoadedIDs).toEqual(['J1']);
            expect(stored.Status).toBe('Paused');
            expect(stored.SaveCount).toBe(1);
            expect(mockEngine.RunAction).not.toHaveBeenCalled();
        });

        it('saves the pause on a fresh copy of the job, never on the shared schedule entity', async () => {
            setClassLoaded(false);
            const schedule = job();
            const stored = job();
            await driver.Execute(contextFor(schedule, stored).context);
            expect(schedule.SaveCount).toBe(0);
            expect(schedule.Status).toBe('Active');
            expect(stored.SaveCount).toBe(1);
        });

        it('reports a failed pause save with the save error', async () => {
            setClassLoaded(false);
            const stored = job();
            stored.SaveResult = false;
            stored.SaveFailure = 'locked row';
            const result = await driver.Execute(contextFor(job(), stored).context);
            expect(result.ErrorMessage).toContain('Pausing the job failed: locked row');
        });

        it('reports a pause that could not read the job, without saving anything', async () => {
            setClassLoaded(false);
            const stored = job();
            stored.LoadResult = false;
            const result = await driver.Execute(contextFor(job(), stored).context);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Pausing the job failed: the job could not be read.');
            expect(stored.SaveCount).toBe(0);
            expect(mockEngine.RunAction).not.toHaveBeenCalled();
        });

        it('runs the action when its class is registered', async () => {
            setClassLoaded(true);
            const stored = job();
            await driver.Execute(contextFor(job(), stored).context);
            expect(mockEngine.RunAction).toHaveBeenCalled();
            expect(stored.SaveCount).toBe(0);
            expect(stored.Status).toBe('Active');
        });

        it('asks the action engine whether the action can run here, and names its class key in the pause', async () => {
            setClassLoaded(false);
            await driver.Execute(contextFor(job(), job()).context);
            expect(mockEngine.IsActionClassLoaded).toHaveBeenCalledWith(SYNC_ACTION);
            expect(mockEngine.ActionClassKey).toHaveBeenCalledWith(SYNC_ACTION);
        });

        it('checks the marked class key with the action engine when resuming', async () => {
            setClassLoaded(true);
            const paused = job({
                Status: 'Paused',
                Configuration: JSON.stringify({ ActionID: 'A1', PausedForMissingClass: 'Common.SyncActivities' })
            });
            mockRunViewResults.mockReturnValue([paused]);
            await resume();
            expect(mockEngine.IsActionClassRegistered).toHaveBeenCalledWith('Common.SyncActivities');
        });

        it('marks the paused job with the missing class, and resumes it once the class is loaded', async () => {
            setClassLoaded(false);
            const stored = job();
            await driver.Execute(contextFor(job(), stored).context);
            expect(JSON.parse(stored.Configuration ?? '{}').PausedForMissingClass).toBe('Common.SyncActivities');
            mockRunViewResults.mockReturnValue([stored]); // the paused jobs the resume reads
            expect(await resume()).toEqual([]); // class still missing
            expect(stored.Status).toBe('Paused');
            setClassLoaded(true);
            expect(await resume()).toEqual(['Sync']);
            expect(stored.Status).toBe('Active');
            expect(JSON.parse(stored.Configuration ?? '{}')).toEqual({ ActionID: 'A1', Params: [] });
        });

        it('leaves a paused job without the marker alone', async () => {
            setClassLoaded(true);
            const paused = job({ Status: 'Paused' });
            mockRunViewResults.mockReturnValue([paused]);
            expect(await resume()).toEqual([]);
            expect(paused.Status).toBe('Paused');
            expect(paused.SaveCount).toBe(0);
        });

        it('does not resume a paused job whose lock the pausing server still holds', async () => {
            // Server A paused the row and still holds its lock (it saves the run and statistics, then releases).
            // A full save of this copy would write A's lock and the pre-run statistics back over the live row.
            setClassLoaded(true);
            const locked = job({
                Status: 'Paused',
                LockToken: 'token-of-server-a',
                Configuration: JSON.stringify({ ActionID: 'A1', PausedForMissingClass: 'Common.SyncActivities' })
            });
            mockRunViewResults.mockReturnValue([locked]);
            expect(await resume()).toEqual([]);
            expect(locked.SaveCount).toBe(0);
            expect(locked.Status).toBe('Paused');
        });

        it('reads only unlocked paused jobs that carry the marker', async () => {
            await resume();
            const filter = String(mockRunViewResults.mock.calls[0][0].ExtraFilter);
            expect(filter).toContain(`Status='Paused'`);
            expect(filter).toContain('LockToken IS NULL');
        });

        it('does not report a job as resumed when saving it fails', async () => {
            setClassLoaded(true);
            const paused = job({
                Status: 'Paused',
                Configuration: JSON.stringify({ ActionID: 'A1', PausedForMissingClass: 'Common.SyncActivities' })
            });
            paused.SaveResult = false;
            mockRunViewResults.mockReturnValue([paused]);
            expect(await resume()).toEqual([]);
        });
    });

    describe('Execute with a SQL Statement param', () => {
        const SQL_CONFIG = JSON.stringify({
            ActionID: 'A1',
            Params: [{ ActionParamID: 'P1', ValueType: 'SQL Statement', Value: 'SELECT 1 AS N' }]
        });

        it("runs the param's query on the job's provider as the job's user and passes the rows to the action", async () => {
            setClassLoaded(true);
            mockEngine.ActionParams = [{ ID: 'P1', Name: 'Rows', Type: 'Input' }];
            const { context, provider } = contextFor(job({ Configuration: SQL_CONFIG }), job());
            provider.SQLRows = [{ N: 1 }];
            await driver.Execute(context);
            expect(provider.SQLCalls).toEqual([{ SQL: 'SELECT 1 AS N', Parameters: undefined, ContextUser: context.ContextUser }]);
            expect(mockEngine.RunAction.mock.calls[0][0].Params).toEqual([{ Name: 'Rows', Value: [{ N: 1 }], Type: 'Input' }]);
        });

        it('passes null for a SQL param when the job\'s provider cannot run SQL, and logs why', async () => {
            setClassLoaded(true);
            mockEngine.ActionParams = [{ ID: 'P1', Name: 'Rows', Type: 'Input' }];
            const metadataOnly = new TestMetadataProvider();
            await driver.Execute(TestContext(job({ Configuration: SQL_CONFIG }), metadataOnly));
            expect(mockEngine.RunAction.mock.calls[0][0].Params).toEqual([{ Name: 'Rows', Value: null, Type: 'Input' }]);
            expect(String(vi.mocked(LogError).mock.calls[0][0])).toContain('needs a database provider');
        });

        it('passes null for a param whose query fails, and still runs the action', async () => {
            setClassLoaded(true);
            mockEngine.ActionParams = [{ ID: 'P1', Name: 'Rows', Type: 'Input' }];
            const { context, provider } = contextFor(job({ Configuration: SQL_CONFIG }), job());
            provider.SQLFailure = new Error('Invalid object name');
            await driver.Execute(context);
            expect(mockEngine.RunAction.mock.calls[0][0].Params).toEqual([{ Name: 'Rows', Value: null, Type: 'Input' }]);
        });
    });

    describe('ValidateConfiguration', () => {
        it('should return success for valid configuration with ActionID', () => {
            const schedule = scheduleWith(JSON.stringify({ ActionID: 'action-123' }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when ActionID is missing', () => {
            const schedule = scheduleWith(JSON.stringify({}));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('Configuration.ActionID');
        });

        it('should fail when Configuration is not valid JSON', () => {
            const schedule = scheduleWith('not json');
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should fail when Configuration is missing entirely', () => {
            const schedule = scheduleWith(null);
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it('should validate Params array structure', () => {
            const schedule = scheduleWith(JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Static', Value: 'test' }
                    ]
                }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should fail when Params element is missing ActionParamID', () => {
            const schedule = scheduleWith(JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ValueType: 'Static', Value: 'test' }
                    ]
                }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ActionParamID')
            )).toBe(true);
        });

        it('should fail when Params element has invalid ValueType', () => {
            const schedule = scheduleWith(JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Invalid', Value: 'test' }
                    ]
                }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ValueType')
            )).toBe(true);
        });

        it('should accept SQL Statement as valid ValueType', () => {
            const schedule = scheduleWith(JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'SQL Statement', Value: 'SELECT 1' }
                    ]
                }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should succeed with no Params', () => {
            const schedule = scheduleWith(JSON.stringify({ ActionID: 'action-123' }));
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });
    });

    describe('FormatNotification', () => {
        it('should format success notification correctly', () => {
            const context = TestContext(job({ ID: 'schedule-1', Name: 'Test Job' }));
            const notification = driver.FormatNotification(context, { Success: true, Details: { ResultCode: 'OK' } });
            expect(notification.Subject).toContain('Completed');
            expect(notification.Subject).toContain('Test Job');
            expect(notification.Priority).toBe('Normal');
        });

        it('should format failure notification with High priority', () => {
            const context = TestContext(job({ ID: 'schedule-1', Name: 'Failing Job' }));
            const notification = driver.FormatNotification(context, { Success: false, ErrorMessage: 'Something went wrong', Details: {} });
            expect(notification.Subject).toContain('Failed');
            expect(notification.Subject).toContain('Failing Job');
            expect(notification.Priority).toBe('High');
            expect(notification.Body).toContain('Something went wrong');
        });

        it('shows N/A for a result code that is not a string', () => {
            const context = TestContext(job({ ID: 'schedule-2', Name: 'Odd Job' }));
            const notification = driver.FormatNotification(context, { Success: true, Details: { ResultCode: 7 } });
            expect(notification.Body).toContain('Result Code: N/A');
            expect(notification.Metadata?.ResultCode).toBeUndefined();
        });

        it('should include metadata in notification', () => {
            const context = TestContext(job({ ID: 'schedule-abc', Name: 'Metadata Job' }));
            const notification = driver.FormatNotification(context, { Success: true, Details: { ResultCode: 'SUCCESS' } });
            expect(notification.Metadata).toBeDefined();
            expect(notification.Metadata?.ScheduleID).toBe('schedule-abc');
            expect(notification.Metadata?.JobType).toBe('Action');
        });
    });
});
