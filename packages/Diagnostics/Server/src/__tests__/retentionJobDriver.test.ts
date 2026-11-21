import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    IMetadataProvider,
    IsDiagnosticCaptureSuppressed,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { FileStorageBase, ResolveStorageDriver } from '@memberjunction/storage';
import { DiagnosticRetentionScheduledJobDriver } from '../retentionJobDriver.js';

vi.mock('@memberjunction/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/storage')>();
    return { ...actual, ResolveStorageDriver: vi.fn() };
});

interface FakeRecord {
    ID: string;
    Delete: () => Promise<boolean>;
    LatestResult: { CompleteMessage: string };
    FileID?: string | null;
    SuppressedDuringDelete?: boolean;
    Gone?: boolean;
}

type RowsByKind = { Local: FakeRecord[]; Received: FakeRecord[]; Sessions: FakeRecord[] };

function fakeRecord(id: string, deletes = true, fileId: string | null = null, events: string[] = []): FakeRecord {
    const record: FakeRecord = {
        ID: id,
        FileID: fileId,
        LatestResult: { CompleteMessage: `cannot delete ${id}` },
        Delete: async () => {
            record.SuppressedDuringDelete = IsDiagnosticCaptureSuppressed();
            events.push(`delete bundle ${id}`);
            if (deletes) record.Gone = true;
            return deletes;
        },
    };
    return record;
}

/**
 * A provider whose `MJ: Files` row and storage driver record what they delete in `events`.
 * `fileRowDeletes` decides what the `MJ: Files` row's `Delete()` returns.
 */
function fakeFileProvider(
    events: string[],
    fileRowDeletes = true,
    storage: { DeleteReturns: boolean; ObjectExists: boolean } = { DeleteReturns: true, ObjectExists: false }
): IMetadataProvider {
    const driver = {
        initialize: async () => undefined,
        DeleteObject: async (key: string) => {
            events.push(`delete object ${key}`);
            return storage.DeleteReturns;
        },
        ObjectExists: async () => storage.ObjectExists,
    };
    vi.mocked(ResolveStorageDriver).mockReturnValue(driver as unknown as FileStorageBase);
    const entities: Record<string, () => object> = {
        'MJ: Files': () => {
            const file = {
                ID: '',
                Name: 'bundle.mjdiag',
                ProviderID: 'SP-1',
                ProviderKey: 'verified/2026-10-01/R1.mjdiag',
                LatestResult: { CompleteMessage: 'file row is locked' },
                Load: async (id: string) => {
                    file.ID = id;
                    return true;
                },
                Delete: async () => {
                    events.push(`delete file row ${file.ID}`);
                    return fileRowDeletes;
                },
            };
            return file;
        },
        'MJ: File Storage Providers': () => ({ ID: 'SP-1', ServerDriverKey: 'Fake', Load: async () => true }),
    };
    return {
        GetEntityObject: async (name: string) => entities[name](),
    } as unknown as IMetadataProvider;
}

function kindOf(params: RunViewParams): keyof RowsByKind {
    if (params.EntityName === 'MJ: Diagnostic Sessions') return 'Sessions';
    return params.ExtraFilter?.includes("'Received'") ? 'Received' : 'Local';
}

/** Makes every RunView return the rows for its query kind, capped at MaxRows like the database. */
function mockRunView(rows: RowsByKind): RunViewParams[] {
    const calls: RunViewParams[] = [];
    const fake = {
        RunView: async (params: RunViewParams) => {
            calls.push(params);
            const filter = (params.ExtraFilter ?? '').toLowerCase();
            const all = rows[kindOf(params)].filter((r) => !r.Gone && !filter.includes(`'${r.ID.toLowerCase()}'`));
            const results = params.MaxRows ? all.slice(0, params.MaxRows) : all;
            return { Success: true, Results: results, ErrorMessage: '' };
        },
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fake as unknown as RunView);
    return calls;
}

function mockInstanceSettings(values: Record<string, string> = {}): void {
    const engine = InstanceConfigEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    vi.spyOn(engine, 'Get').mockImplementation((key: string) => values[key]);
}

function makeContext(
    configuration?: Record<string, number>,
    provider: IMetadataProvider = {} as unknown as IMetadataProvider
): ScheduledJobExecutionContext {
    return {
        Schedule: { Name: 'Retention', Configuration: configuration ? JSON.stringify(configuration) : null },
        Run: {},
        ContextUser: { ID: 'user-1' } as unknown as UserInfo,
        Provider: provider,
    } as unknown as ScheduledJobExecutionContext;
}

describe('DiagnosticRetentionScheduledJobDriver', () => {
    beforeEach(() => {
        mockInstanceSettings();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deletes the bundles and sessions the queries return and reports the real counts', async () => {
        const rows: RowsByKind = {
            Local: [fakeRecord('L1'), fakeRecord('L2')],
            Received: [fakeRecord('R1')],
            Sessions: [fakeRecord('S1'), fakeRecord('S2'), fakeRecord('S3')],
        };
        const calls = mockRunView(rows);

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext());

        expect(result.Success).toBe(true);
        expect(result.Details?.DeletedBundles).toBe(3);
        expect(result.Details?.DeletedSessions).toBe(3);
        expect(calls.every((c) => c.ResultType === 'entity_object')).toBe(true);
        expect(calls.find((c) => kindOf(c) === 'Sessions')?.ExtraFilter).toContain("Status <> 'Active'");
        const all = [...rows.Local, ...rows.Received, ...rows.Sessions];
        expect(all.every((r) => r.SuppressedDuringDelete === true)).toBe(true);
    });

    it('uses the Diagnostics.* retention settings unless the job configuration overrides them', async () => {
        mockInstanceSettings({ 'Diagnostics.RetentionDays': '5', 'Diagnostics.Intake.RetentionDays': '9' });
        mockRunView({ Local: [], Received: [], Sessions: [] });

        const fromSettings = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext());
        const fromConfig = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext({ LocalRetentionDays: 2 }));

        expect(fromSettings.Details?.LocalRetentionDays).toBe(5);
        expect(fromSettings.Details?.ReceivedRetentionDays).toBe(9);
        expect(fromConfig.Details?.LocalRetentionDays).toBe(2);
    });

    it('stops at MaxDeletesPerRun across all purges', async () => {
        const rows: RowsByKind = {
            Local: [fakeRecord('L1'), fakeRecord('L2')],
            Received: [fakeRecord('R1'), fakeRecord('R2')],
            Sessions: [fakeRecord('S1')],
        };
        mockRunView(rows);

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext({ MaxDeletesPerRun: 3 }));

        expect(result.Details?.DeletedBundles).toBe(3);
        expect(result.Details?.DeletedSessions).toBe(0);
        expect(rows.Received[1].SuppressedDuringDelete).toBeUndefined();
        expect(rows.Sessions[0].SuppressedDuringDelete).toBeUndefined();
    });

    it('reports a failed Delete() in Details and does not count it', async () => {
        mockRunView({ Local: [fakeRecord('L1'), fakeRecord('L-bad', false)], Received: [], Sessions: [] });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext());

        expect(result.Success).toBe(false);
        expect(result.Details?.DeletedBundles).toBe(1);
        expect(result.Details?.Failures).toEqual([expect.stringContaining('cannot delete L-bad')]);
    });

    it('deletes a bundle\'s stored object and file row before the bundle', async () => {
        const events: string[] = [];
        const provider = fakeFileProvider(events);
        mockRunView({ Local: [], Received: [fakeRecord('R1', true, 'FILE-1', events)], Sessions: [] });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext(undefined, provider));

        expect(events).toEqual([
            'delete object verified/2026-10-01/R1.mjdiag',
            'delete file row FILE-1',
            'delete bundle R1',
        ]);
        expect(result.Success).toBe(true);
        expect(result.Details?.DeletedBundles).toBe(1);
        expect(result.Details?.DeletedFiles).toBe(1);
    });

    it('keeps the bundle and reports it when its file delete fails', async () => {
        const events: string[] = [];
        const provider = fakeFileProvider(events, false);
        mockRunView({ Local: [], Received: [fakeRecord('R1', true, 'FILE-1', events)], Sessions: [] });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext(undefined, provider));

        expect(events).not.toContain('delete bundle R1');
        expect(result.Success).toBe(false);
        expect(result.Details?.DeletedBundles).toBe(0);
        expect(result.Details?.DeletedFiles).toBe(0);
        expect(result.Details?.Failures).toEqual([expect.stringContaining('file row is locked')]);
    });

    it('treats a storage object that is already gone as deleted', async () => {
        const events: string[] = [];
        const provider = fakeFileProvider(events, true, { DeleteReturns: false, ObjectExists: false });
        mockRunView({ Local: [], Received: [fakeRecord('R1', true, 'FILE-1', events)], Sessions: [] });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext(undefined, provider));

        expect(events).toEqual(['delete object verified/2026-10-01/R1.mjdiag', 'delete file row FILE-1', 'delete bundle R1']);
        expect(result.Success).toBe(true);
        expect(result.Details?.Failures).toEqual([]);
    });

    it('keeps the bundle when the storage object is still there after a failed delete', async () => {
        const events: string[] = [];
        const provider = fakeFileProvider(events, true, { DeleteReturns: false, ObjectExists: true });
        mockRunView({ Local: [], Received: [fakeRecord('R1', true, 'FILE-1', events)], Sessions: [] });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext(undefined, provider));

        expect(events).toEqual(['delete object verified/2026-10-01/R1.mjdiag']);
        expect(result.Success).toBe(false);
        expect(result.Details?.Failures).toEqual([expect.stringContaining('was not deleted')]);
    });

    it('does not charge failed rows to the budget and pages past them', async () => {
        const rows: RowsByKind = {
            Local: [fakeRecord('L-bad', false), fakeRecord('L2')],
            Received: [],
            Sessions: [],
        };
        mockRunView(rows);

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext({ MaxDeletesPerRun: 1 }));

        expect(rows.Local[1].Gone).toBe(true);
        expect(result.Details?.DeletedBundles).toBe(1);
        expect(result.Details?.Failures).toEqual([expect.stringContaining('cannot delete L-bad')]);
    });

    it('stops paging at twice MaxDeletesPerRun attempts when every row fails', async () => {
        const rows: RowsByKind = {
            Local: Array.from({ length: 10 }, (_, i) => fakeRecord(`L-bad-${i}`, false)),
            Received: [],
            Sessions: [],
        };
        mockRunView(rows);

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(makeContext({ MaxDeletesPerRun: 2 }));

        expect(result.Details?.DeletedBundles).toBe(0);
        expect(result.Details?.Failures).toHaveLength(4);
    });

    it('returns a failed result instead of throwing on a bad configuration', async () => {
        mockRunView({ Local: [], Received: [], Sessions: [] });
        const context = makeContext();
        context.Schedule.Configuration = JSON.stringify({ LocalRetentionDays: 'soon', MaxDeletesPerRun: -1 });

        const result = await new DiagnosticRetentionScheduledJobDriver().Execute(context);
        const validation = new DiagnosticRetentionScheduledJobDriver().ValidateConfiguration(context.Schedule);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/LocalRetentionDays/);
        expect(validation.Success).toBe(false);
        expect(validation.Errors.map((e) => e.Source)).toEqual(['LocalRetentionDays', 'MaxDeletesPerRun']);
    });
});
