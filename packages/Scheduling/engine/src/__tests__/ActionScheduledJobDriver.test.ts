import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewResults, mockEngine } = vi.hoisted(() => ({
    mockRunViewResults: vi.fn(),
    mockEngine: {
        Config: vi.fn().mockResolvedValue(undefined),
        Actions: [{ ID: 'A1', Name: 'Sync Activities', DriverClass: 'Common.SyncActivities', Type: 'Custom' }],
        ActionParams: [],
        RunAction: vi.fn(),
        IsActionClassLoaded: vi.fn(),
        IsActionClassRegistered: vi.fn(),
        ActionClassKey: vi.fn()
    }
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    // The resume's read: each call hands the view params to mockRunViewResults, which returns the rows.
    RunView: {
        FromMetadataProvider: () => ({
            RunView: async (params: { ExtraFilter?: string }) => ({ Success: true, Results: mockRunViewResults(params) })
        })
    },
    LogError: vi.fn(),
    LogStatusEx: vi.fn()
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: mockEngine }
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerDataProvider: class {
        ExecuteSQL = vi.fn();
    }
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
    ActionJobConfiguration: class {}
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class {}
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {}
}));

import { BaseEntityResult, EntityInfo, UserInfo } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { ActionScheduledJobDriver } from '../drivers/ActionScheduledJobDriver';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

/** A scheduled job whose fields live in memory; Load/Save return the results a test sets. */
class TestJob extends MJScheduledJobEntity {
    private values: { ID: string; Name: string; Configuration: string | null; Status: MJScheduledJobEntity['Status'] };
    public LoadResult = true;
    public SaveResult = true;
    public SaveFailure = '';
    public LoadedIDs: string[] = [];
    public SaveCount = 0;

    constructor(values: Partial<{ Configuration: string; Status: MJScheduledJobEntity['Status'] }> = {}) {
        super(new EntityInfo());
        this.values = { ID: 'J1', Name: 'Sync', Configuration: JSON.stringify({ ActionID: 'A1', Params: [] }), Status: 'Active', ...values };
    }
    override get ID(): string { return this.values.ID; }
    override get Name(): string { return this.values.Name; }
    override get Configuration(): string | null { return this.values.Configuration; }
    override set Configuration(value: string | null) { this.values.Configuration = value; }
    override get Status(): MJScheduledJobEntity['Status'] { return this.values.Status; }
    override set Status(value: MJScheduledJobEntity['Status']) { this.values.Status = value; }
    override get LatestResult(): BaseEntityResult { return new BaseEntityResult(this.SaveFailure === '', this.SaveFailure); }
    override async Load(id: string): Promise<boolean> {
        this.LoadedIDs.push(id);
        return this.LoadResult;
    }
    override async Save(): Promise<boolean> {
        this.SaveCount++;
        return this.SaveResult;
    }
}

/** A paused job that carries the missing-class marker. */
function pausedJob(): TestJob {
    return new TestJob({ Status: 'Paused', Configuration: JSON.stringify({ ActionID: 'A1', PausedForMissingClass: 'Common.SyncActivities' }) });
}

/** An execution context on `schedule` whose provider hands out `stored` as the freshly read copy of the job. */
function contextFor(schedule: TestJob, stored: TestJob): ScheduledJobExecutionContext {
    const provider = new EntitiesOnlyProvider([]);
    vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(stored);
    return { Schedule: schedule, Run: new MJScheduledJobRunEntity(new EntityInfo()), ContextUser: new UserInfo(), Provider: provider };
}

function resume(): Promise<string[]> {
    return ActionScheduledJobDriver.ResumeJobsPausedForMissingClass(new UserInfo(), new EntitiesOnlyProvider([]));
}

function setClassLoaded(loaded: boolean): void {
    mockEngine.IsActionClassLoaded.mockReturnValue(loaded);
    mockEngine.IsActionClassRegistered.mockReturnValue(loaded);
}

describe('ActionScheduledJobDriver', () => {
    let driver: ActionScheduledJobDriver;

    beforeEach(() => {
        driver = new ActionScheduledJobDriver();
        vi.clearAllMocks();
        mockEngine.RunAction.mockResolvedValue({ Success: true, Message: 'Action completed', Result: { ResultCode: 'OK' }, Params: [] });
        mockEngine.ActionClassKey.mockReturnValue('Common.SyncActivities');
        mockRunViewResults.mockReturnValue([]);
    });

    describe('Execute when the action class is not loaded', () => {
        it('pauses a fresh copy of the job, marks the missing class, and does not run the action', async () => {
            setClassLoaded(false);
            const schedule = new TestJob();
            const stored = new TestJob();
            const result = await driver.Execute(contextFor(schedule, stored));
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain("class 'Common.SyncActivities' is not loaded on this server");
            expect(stored.LoadedIDs).toEqual(['J1']);
            expect(stored.Status).toBe('Paused');
            expect(JSON.parse(stored.Configuration ?? '{}').PausedForMissingClass).toBe('Common.SyncActivities');
            expect(schedule.SaveCount).toBe(0);
            expect(mockEngine.RunAction).not.toHaveBeenCalled();
        });

        it('reports a failed pause save with the save error', async () => {
            setClassLoaded(false);
            const stored = new TestJob();
            stored.SaveResult = false;
            stored.SaveFailure = 'locked row';
            const result = await driver.Execute(contextFor(new TestJob(), stored));
            expect(result.ErrorMessage).toContain('Pausing the job failed: locked row');
        });

        it('runs the action when its class is loaded', async () => {
            setClassLoaded(true);
            const stored = new TestJob();
            await driver.Execute(contextFor(new TestJob(), stored));
            expect(mockEngine.RunAction).toHaveBeenCalled();
            expect(stored.SaveCount).toBe(0);
        });
    });

    describe('ResumeJobsPausedForMissingClass', () => {
        it('resumes a marked job once its class is registered, removing the marker', async () => {
            const paused = pausedJob();
            mockRunViewResults.mockReturnValue([paused]);
            setClassLoaded(false);
            expect(await resume()).toEqual([]);
            expect(paused.Status).toBe('Paused');
            setClassLoaded(true);
            expect(await resume()).toEqual(['Sync']);
            expect(mockEngine.IsActionClassRegistered).toHaveBeenCalledWith('Common.SyncActivities');
            expect(paused.Status).toBe('Active');
            expect(JSON.parse(paused.Configuration ?? '{}')).toEqual({ ActionID: 'A1' });
        });

        it('leaves a paused job without the marker alone', async () => {
            setClassLoaded(true);
            const paused = new TestJob({ Status: 'Paused' });
            mockRunViewResults.mockReturnValue([paused]);
            expect(await resume()).toEqual([]);
            expect(paused.SaveCount).toBe(0);
        });

        it('reads only unlocked paused jobs that carry the marker', async () => {
            await resume();
            const filter = String(mockRunViewResults.mock.calls[0][0].ExtraFilter);
            expect(filter).toContain(`Status='Paused'`);
            expect(filter).toContain('LockToken IS NULL');
            expect(filter).toContain('PausedForMissingClass');
        });

        it('does not report a job as resumed when saving it fails', async () => {
            setClassLoaded(true);
            const paused = pausedJob();
            paused.SaveResult = false;
            mockRunViewResults.mockReturnValue([paused]);
            expect(await resume()).toEqual([]);
        });
    });

    describe('ValidateConfiguration', () => {
        it('should return success for valid configuration with ActionID', () => {
            const schedule = {
                Configuration: JSON.stringify({ ActionID: 'action-123' })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when ActionID is missing', () => {
            const schedule = {
                Configuration: JSON.stringify({})
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('Configuration.ActionID');
        });

        it('should fail when Configuration is not valid JSON', () => {
            const schedule = {
                Configuration: 'not json'
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should fail when Configuration is missing entirely', () => {
            const schedule = { Configuration: null };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it('should validate Params array structure', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Static', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should fail when Params element is missing ActionParamID', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ValueType: 'Static', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ActionParamID')
            )).toBe(true);
        });

        it('should fail when Params element has invalid ValueType', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Invalid', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ValueType')
            )).toBe(true);
        });

        it('should accept SQL Statement as valid ValueType', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'SQL Statement', Value: 'SELECT 1' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should succeed with no Params', () => {
            const schedule = {
                Configuration: JSON.stringify({ ActionID: 'action-123' })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });
    });

    describe('FormatNotification', () => {
        it('should format success notification correctly', () => {
            const context = {
                Schedule: { ID: 'schedule-1', Name: 'Test Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: { ResultCode: 'OK' }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Completed');
            expect(notification.Subject).toContain('Test Job');
            expect(notification.Priority).toBe('Normal');
        });

        it('should format failure notification with High priority', () => {
            const context = {
                Schedule: { ID: 'schedule-1', Name: 'Failing Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: false,
                ErrorMessage: 'Something went wrong',
                Details: {}
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Failed');
            expect(notification.Subject).toContain('Failing Job');
            expect(notification.Priority).toBe('High');
            expect(notification.Body).toContain('Something went wrong');
        });

        it('should include metadata in notification', () => {
            const context = {
                Schedule: { ID: 'schedule-abc', Name: 'Metadata Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: { ResultCode: 'SUCCESS' }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Metadata).toBeDefined();
            expect(notification.Metadata.ScheduleID).toBe('schedule-abc');
            expect(notification.Metadata.JobType).toBe('Action');
        });
    });
});
