import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
} from '../entity-types.js';
import type {
    BaseIntegrationConnector,
    FetchContext,
    FetchBatchResult,
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import {
    IntegrationEngine,
    DetectSchemaNotGenerated,
    RunFailed,
    SubtractWatermarkSeconds,
    BuildBatchCapMessage,
    DEFAULT_MAX_BATCHES_PER_MAP,
} from '../IntegrationEngine.js';
import { ConnectorFactory } from '../ConnectorFactory.js';
import { WatermarkService } from '../WatermarkService.js';

// ---- Mock harness (same shape as IntegrationEngine.fetch-timeout.test.ts) ----
//
// Pins the per-connection run limits (#4823), the monotonic-watermark lookback (#3085) and the
// stale-CRUD fail-stop (#4433).

let mockRunViewsFn: ReturnType<typeof vi.fn>;

const fanOutToRunView = async (params: Array<Record<string, unknown>>, contextUser?: unknown) =>
    Promise.all(params.map(p => mockRunViewFn(p, contextUser)));
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockEntityInstances: Map<string, ReturnType<typeof createMockEntity>>;

/** When set, every save of a synced `Contacts` record fails with this provider message. */
let recordSaveFailure: string | null = null;
const entityNameOf = (data: Record<string, unknown>): string => String(data['__entityName'] ?? '');

function createMockEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: vi.fn(),
        // Records of the synced entity fail with `recordSaveFailure` when it is set; engine rows always save.
        Save: vi.fn(async () => !(recordSaveFailure && entityNameOf(data) === 'Contacts')),
        get LatestResult() { return { CompleteMessage: recordSaveFailure ?? '' }; },
        Delete: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => { data[field] = value; }),
        get ID() { return data['ID'] ?? 'generated-id'; },
        set ID(v: string) { data['ID'] = v; },
        get PrimaryKey() {
            return { KeyValuePairs: [{ FieldName: 'ID', Value: data['ID'] ?? 'generated-id' }] };
        },
        set CompanyIntegrationID(v: string) { data['CompanyIntegrationID'] = v; },
        set RunByUserID(v: string) { data['RunByUserID'] = v; },
        set StartedAt(v: Date) { data['StartedAt'] = v; },
        set EndedAt(v: Date | undefined) { data['EndedAt'] = v; },
        set Status(v: string) { data['Status'] = v; },
        set TotalRecords(v: number) { data['TotalRecords'] = v; },
        set ConfigData(v: string) { data['ConfigData'] = v; },
        set ErrorLog(v: string | undefined) { data['ErrorLog'] = v; },
        set CompanyIntegrationRunID(v: string) { data['CompanyIntegrationRunID'] = v; },
        set EntityID(v: string) { data['EntityID'] = v; },
        set RecordID(v: string) { data['RecordID'] = v; },
        set Action(v: string) { data['Action'] = v; },
        set IsSuccess(v: boolean) { data['IsSuccess'] = v; },
        set ExternalSystemRecordID(v: string) { data['ExternalSystemRecordID'] = v; },
        set EntityRecordID(v: string) { data['EntityRecordID'] = v; },
        _data: data,
    };
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    // Durable run ownership (#3291, merged after this branch was cut): every sync claims its run row,
    // heartbeats a lease, fences each batch boundary and releases at the end, all through the provider.
    // Imported HERE rather than at module scope because `vi.mock` factories are hoisted above imports.
    const { createOwnershipProviderSurface } = await vi.importActual<
        typeof import('./helpers/ownershipProviderSurface.js')
    >('./helpers/ownershipProviderSurface.js');
    return {
        ...actual,
        RunView: class MockRunView {
            RunViews(...args: unknown[]) { return mockRunViewsFn(...args); }
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
        Metadata: (() => {
            class MockMetadata {
                static Provider: {
                    BeginTransaction: ReturnType<typeof vi.fn>;
                    CommitTransaction: ReturnType<typeof vi.fn>;
                    RollbackTransaction: ReturnType<typeof vi.fn>;
                    Entities: { Name: string; FirstPrimaryKey: { Name: string } }[];
                    EntityByName: (name: string) => { Name: string; FirstPrimaryKey: { Name: string } } | undefined;
                    GetEntityObject: (...args: unknown[]) => Promise<unknown>;
                };
                get Entities() {
                    return [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }];
                }
                EntityByName(name: string) {
                    return this.Entities.find(e => e.Name === name);
                }
                async GetEntityObject(entityName: string) {
                    const entity = createMockEntity({ ID: `new-${entityName}-id`, __entityName: entityName });
                    mockEntityInstances.set(entityName, entity);
                    return entity;
                }
            }
            MockMetadata.Provider = {
                // Without this surface the run aborts inside `RunOwnershipService.Claim` before any
                // FetchChanges happens, so a timeout test never reaches what it measures.
                ...createOwnershipProviderSurface(),
                BeginTransaction: vi.fn().mockResolvedValue(undefined),
                CommitTransaction: vi.fn().mockResolvedValue(undefined),
                RollbackTransaction: vi.fn().mockResolvedValue(undefined),
                Entities: [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }],
                EntityByName(name: string) {
                    return this.Entities.find(e => e.Name === name);
                },
                GetEntityObject(...args: unknown[]) {
                    return MockMetadata.prototype.GetEntityObject.apply(new MockMetadata(), args as [string]);
                },
            };
            return MockMetadata;
        })(),
        CompositeKey: class MockCompositeKey {
            KeyValuePairs: Array<{ FieldName: string; Value: string }> = [];
        },
    };
});

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    GetRegistration: vi.fn().mockReturnValue({}),
                    CreateInstance: vi.fn(),
                },
            },
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

/** A connector whose FetchChanges is supplied by the test. */
function createConnector(
    fetch: (ctx: FetchContext) => Promise<FetchBatchResult>,
    opts: { monotonic?: boolean; lookbackSeconds?: number } = {},
): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ConnectionTestResult>>().mockResolvedValue({
            Success: true, Message: 'OK',
        }),
        DiscoverObjects: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ExternalObjectSchema[]>>().mockResolvedValue([]),
        DiscoverFields: vi.fn<[MJCompanyIntegrationEntity, string, UserInfo], Promise<ExternalFieldSchema[]>>().mockResolvedValue([]),
        FetchChanges: vi.fn<[FetchContext], Promise<FetchBatchResult>>().mockImplementation(fetch),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: vi.fn().mockReturnValue(undefined),
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
        MaxConcurrencyHint: null,
        FetchChangesTimeoutMs: null,
        MonotonicWatermark: opts.monotonic ?? false,
        WatermarkLookbackSeconds: opts.lookbackSeconds ?? 0,
    } as unknown as BaseIntegrationConnector;
}

function createMockCompanyIntegration(configuration: string): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return configuration;
            return null;
        }),
        ID: 'ci-1',
        IntegrationID: 'int-1',
        Configuration: configuration,
    } as unknown as MJCompanyIntegrationEntity;
}

function entityMapRow(id: string, entity: string, externalObjectName: string): ICompanyIntegrationEntityMap {
    return {
        Get: vi.fn((f: string) => f === 'ID' ? id : null),
        ID: id,
        CompanyIntegrationID: 'ci-1',
        EntityID: `entity-${id}`,
        ConflictResolution: 'SourceWins',
        DeleteBehavior: 'SoftDelete',
        Entity: entity,
        ExternalObjectName: externalObjectName,
        SyncEnabled: true,
        Status: 'Active',
        SyncDirection: 'Pull',
    } as unknown as ICompanyIntegrationEntityMap;
}

function wireConfigMocks(
    companyIntegration: MJCompanyIntegrationEntity,
    integration: MJIntegrationEntity,
    entityMaps: ICompanyIntegrationEntityMap[] = [entityMapRow('em-1', 'Contacts', 'contacts')],
): void {
    mockRunViewsFn.mockResolvedValueOnce([
        { Success: true, Results: [companyIntegration] },
        { Success: true, Results: entityMaps },
        { Success: true, Results: [integration] },
        { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
    ]);

    mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
        const entityName = params['EntityName'] as string;
        if (entityName === 'MJ: Company Integration Field Maps') {
            return {
                Success: true,
                Results: [{
                    SourceFieldName: 'Name',
                    DestinationFieldName: 'Name',
                    TransformPipeline: null,
                    IsKeyField: true,
                    Status: 'Active',
                    Priority: 0,
                } as unknown as ICompanyIntegrationFieldMap],
            };
        }
        return { Success: true, Results: [] };
    });
}

function buildIntegration(): MJIntegrationEntity {
    return {
        ID: 'int-1',
        Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
        Name: 'TestIntegration',
        ClassName: 'TestConnector',
    } as unknown as MJIntegrationEntity;
}


interface RunHandles {
    connector: BaseIntegrationConnector;
    fetchCalls: () => FetchContext[];
    run: () => ReturnType<typeof createMockEntity> | undefined;
}

describe('IntegrationEngine — per-connection run limits, lookback and stale CRUD (#4823 #3085 #4433)', () => {
    let orchestrator: IntegrationEngine;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let watermarkUpdate: ReturnType<typeof vi.spyOn>;
    let resolveOrig: typeof ConnectorFactory.Resolve;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        recordSaveFailure = null;
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silence */ });
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* silence */ });
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => { /* silence */ });
        watermarkUpdate = vi.spyOn(WatermarkService.prototype, 'Update').mockResolvedValue(undefined);
        resolveOrig = ConnectorFactory.Resolve;
    });

    afterEach(() => {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
        logSpy.mockRestore();
        debugSpy.mockRestore();
        watermarkUpdate.mockRestore();
        ConnectorFactory.Resolve = resolveOrig;
    });

    async function runWith(
        configuration: Record<string, unknown>,
        fetch: (ctx: FetchContext) => Promise<FetchBatchResult>,
        opts: { monotonic?: boolean; lookbackSeconds?: number; savedWatermark?: { type: string; value: string } } = {},
    ): Promise<RunHandles> {
        wireConfigMocks(createMockCompanyIntegration(JSON.stringify(configuration)), buildIntegration());
        if (opts.savedWatermark) {
            const base = mockRunViewFn.getMockImplementation();
            const saved = opts.savedWatermark;
            mockRunViewFn.mockImplementation(async (params: Record<string, unknown>, u?: unknown) => {
                if (params['EntityName'] === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [{ ID: 'wm-1', EntityMapID: 'em-1', Direction: 'Pull', WatermarkType: saved.type, WatermarkValue: saved.value }] };
                }
                return base!(params, u);
            });
        }
        const connector = createConnector(fetch, opts);
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);
        await orchestrator.RunSync('ci-1', contextUser);
        const fetchChanges = connector.FetchChanges as unknown as ReturnType<typeof vi.fn>;
        return {
            connector,
            fetchCalls: () => fetchChanges.mock.calls.map(c => c[0] as FetchContext),
            run: () => mockEntityInstances.get('MJ: Company Integration Runs'),
        };
    }

    const empty = async (): Promise<FetchBatchResult> => ({ Records: [], HasMore: false });

    it('Configuration batchSize reaches the first fetch', async () => {
        const h = await runWith({ batchSize: 50 }, empty);
        expect(h.fetchCalls()[0].BatchSize).toBe(50);
    }, 30000);

    it('without batchSize the engine default is asked for', async () => {
        const h = await runWith({}, empty);
        expect(h.fetchCalls()[0].BatchSize).toBe(orchestrator.MaxBatchSize);
    }, 30000);

    it('reaching maxBatchesPerMap fails the run with BATCH_CAP_REACHED and saves no watermark', async () => {
        let page = 0;
        const h = await runWith({ maxBatchesPerMap: 2 }, async () => {
            page++;
            return { Records: [], HasMore: true, NextCursor: `c${page}` };
        });

        // Two pages are applied; the pipelined prefetch may have requested a third before the cap check.
        expect(h.fetchCalls().length).toBeGreaterThanOrEqual(2);
        expect(h.fetchCalls().length).toBeLessThanOrEqual(3);
        const run = h.run();
        expect(run!._data['Status']).toBe('Failed');
        expect(String(run!._data['ErrorLog'])).toContain('BATCH_CAP_REACHED');
        expect(String(run!._data['ErrorLog'])).toContain('maxBatchesPerMap');
        expect(watermarkUpdate).not.toHaveBeenCalled();
    }, 30000);

    it('monotonic Timestamp watermark: the fetch filter reaches back by the lookback, the saved value does not', async () => {
        const h = await runWith({ watermarkLookbackSeconds: 60 }, empty, {
            monotonic: true,
            savedWatermark: { type: 'Timestamp', value: '2026-01-01T00:10:00.000Z' },
        });

        expect(h.fetchCalls()[0].WatermarkValue).toBe('2026-01-01T00:09:00.000Z');
        for (const call of watermarkUpdate.mock.calls) expect(call[1]).not.toBe('2026-01-01T00:09:00.000Z');
    }, 30000);

    it("uses the connector's WatermarkLookbackSeconds when Configuration says nothing", async () => {
        const h = await runWith({}, empty, {
            monotonic: true,
            lookbackSeconds: 300,
            savedWatermark: { type: 'Timestamp', value: '2026-01-01T00:10:00.000Z' },
        });
        expect(h.fetchCalls()[0].WatermarkValue).toBe('2026-01-01T00:05:00.000Z');
    }, 30000);

    it('Configuration 0 turns the overlap off even when the connector declares one', async () => {
        const h = await runWith({ watermarkLookbackSeconds: 0 }, empty, {
            monotonic: true,
            lookbackSeconds: 300,
            savedWatermark: { type: 'Timestamp', value: '2026-01-01T00:10:00.000Z' },
        });
        expect(h.fetchCalls()[0].WatermarkValue).toBe('2026-01-01T00:10:00.000Z');
    }, 30000);

    it('a non-monotonic connector keeps its watermark unchanged', async () => {
        const h = await runWith({ watermarkLookbackSeconds: 60 }, empty, {
            monotonic: false,
            savedWatermark: { type: 'Timestamp', value: '2026-01-01T00:10:00.000Z' },
        });
        expect(h.fetchCalls()[0].WatermarkValue).toBe('2026-01-01T00:10:00.000Z');
    }, 30000);

    it('a stale CRUD procedure stops the object after one error and fails the run', async () => {
        recordSaveFailure = "Procedure or function 'spCreateContacts' has too many arguments specified.";
        const records: ExternalRecord[] = ['a', 'b', 'c'].map(n => ({ ExternalID: n, ObjectType: 'contacts', Fields: { Name: n } }));
        const h = await runWith({ writeMode: 'individual' }, async () => ({ Records: records, HasMore: false }));

        const run = h.run();
        expect(run!._data['Status']).toBe('Failed');
        const errors = JSON.parse(String(run!._data['ErrorLog'])) as Array<{ ErrorCode: string; ErrorMessage: string }>;
        const schemaErrors = errors.filter(e => e.ErrorCode === 'CONFIGURATION_ERROR');
        expect(schemaErrors).toHaveLength(1);
        expect(schemaErrors[0].ErrorMessage).toContain('does not match');
    }, 30000);
});

describe('DetectSchemaNotGenerated', () => {
    it('classifies a missing SQL Server procedure as Missing', () => {
        const e = DetectSchemaNotGenerated('Contacts', "Could not find stored procedure '__mj.spCreateContacts'.");
        expect(e?.Reason).toBe('Missing');
        expect(e?.StoredProcedureName).toBe('__mj.spCreateContacts');
    });

    it('classifies too many arguments as Stale', () => {
        const e = DetectSchemaNotGenerated('Contacts', "Procedure or function 'spUpdateContacts' has too many arguments specified.");
        expect(e?.Reason).toBe('Stale');
        expect(e?.StoredProcedureName).toBe('spUpdateContacts');
        expect(e?.message).toContain('Run CodeGen');
    });

    it('classifies a missing parameter as Stale', () => {
        const e = DetectSchemaNotGenerated('Contacts', "Procedure or function 'spCreateContacts' expects parameter '@Email', which was not supplied.");
        expect(e?.Reason).toBe('Stale');
    });

    it('classifies the PostgreSQL wrong-arity / missing function message', () => {
        const e = DetectSchemaNotGenerated('Contacts', 'function crm.spcreatecontacts(uuid, text) does not exist');
        expect(e?.StoredProcedureName).toBe('crm.spcreatecontacts');
    });

    it('leaves an ordinary save failure alone', () => {
        expect(DetectSchemaNotGenerated('Contacts', 'Violation of UNIQUE KEY constraint')).toBeNull();
    });
});

describe('run-limit helpers', () => {
    it('RunFailed: errored records or any Critical error', () => {
        expect(RunFailed({ RecordsErrored: 0, Errors: [] })).toBe(false);
        expect(RunFailed({ RecordsErrored: 1, Errors: [] })).toBe(true);
        expect(RunFailed({ RecordsErrored: 0, Errors: [{ ExternalID: '', ChangeType: 'Skip', ErrorMessage: 'x', ErrorCode: 'CONNECTOR_ERROR', Severity: 'Warning' }] })).toBe(false);
        expect(RunFailed({ RecordsErrored: 0, Errors: [{ ExternalID: '', ChangeType: 'Create', ErrorMessage: 'x', ErrorCode: 'CONFIGURATION_ERROR', Severity: 'Critical' }] })).toBe(true);
    });

    it('SubtractWatermarkSeconds moves an ISO timestamp and leaves anything else', () => {
        expect(SubtractWatermarkSeconds('2026-01-01T00:00:00.000Z', 30)).toBe('2025-12-31T23:59:30.000Z');
        expect(SubtractWatermarkSeconds('not-a-date', 30)).toBe('not-a-date');
    });

    it('SubtractWatermarkSeconds reads a zoneless ISO watermark as UTC, not server-local time', () => {
        expect(SubtractWatermarkSeconds('2026-01-01T10:00:00', 300)).toBe('2026-01-01T09:55:00.000Z');
        expect(SubtractWatermarkSeconds('2026-01-01T10:00:00.250', 300)).toBe('2026-01-01T09:55:00.250Z');
        expect(SubtractWatermarkSeconds('2026-01-01T10:00:00-06:00', 300)).toBe('2026-01-01T15:55:00.000Z');
    });

    it('BuildBatchCapMessage names the object, the cap and both settings', () => {
        const m = BuildBatchCapMessage('contacts', DEFAULT_MAX_BATCHES_PER_MAP, 200);
        expect(m).toContain('contacts');
        expect(m).toContain('5000');
        expect(m).toContain('batchSize');
        expect(m).toContain('maxBatchesPerMap');
    });
});
