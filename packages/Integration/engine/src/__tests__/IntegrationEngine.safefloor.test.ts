import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
    ICompanyIntegrationSyncWatermark,
} from '../entity-types.js';
import type {
    BaseIntegrationConnector,
    FetchContext,
    FetchBatchResult,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';

// ---------------------------------------------------------------------------
// Critical audit bug #6 — safe-floor-on-error watermark.
//
// When an incremental pull has a CLEAN earlier batch followed by a LATER batch
// that errors a record, the persisted incremental watermark MUST be held to the
// last fully-clean batch's value (lastCleanWatermark) — NOT advanced to the
// errored batch's watermark. Advancing past the failed window would drop the
// errored records below the saved watermark, so the next incremental never
// re-fetches them: silent permanent data loss.
//
// Source under test (IntegrationEngine.ts):
//   - lastCleanWatermark init                                (~1197)
//   - per-batch gate: only raise floor on a zero-error batch
//       `if (result.RecordsErrored === erroredBeforeApply)`  (~1388)
//   - final selection:
//       `result.RecordsErrored > 0
//           ? (lastCleanWatermark ?? currentWatermark)
//           : currentWatermark`                              (~1459)
//
// This drives the REAL engine through its public RunSync() API. The harness is
// copied from IntegrationEngine.test.ts (same mocks for core/global, same
// connector + RunView shapes). The only new wrinkle is that we hand the engine
// a PRE-EXISTING watermark row whose Save() captures whatever WatermarkValue the
// engine decides to persist — that captured value is the assertion subject.
// ---------------------------------------------------------------------------

// A valid ISO-timestamp watermark for batch 1 (the clean batch). Because the
// final-watermark selection holds the floor to lastCleanWatermark, THIS is the
// value that must survive when batch 2 errors.
const CLEAN_WATERMARK = '2024-06-15T10:00:00.000Z';
// Batch 2's watermark — the engine advances currentWatermark to this, but the
// safe floor must REFUSE to persist it because batch 2 errored a record.
const DIRTY_WATERMARK = '2024-06-15T11:00:00.000Z';
// The watermark the run starts from (a prior clean incremental). Valid timestamp
// so it passes ValidateWatermark and seeds the run as a normal incremental.
const PRIOR_WATERMARK = '2024-06-15T09:00:00.000Z';

let mockRunViewsFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockEntityInstances: Map<string, ReturnType<typeof createMockEntity>>;

function createMockEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
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
                    const entity = createMockEntity({ ID: `new-${entityName}-id` });
                    mockEntityInstances.set(entityName, entity);
                    return entity;
                }
            }
            MockMetadata.Provider = {
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

function createMockCompanyIntegration(): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return '{}';
            return null;
        }),
        IntegrationID: 'int-1',
    } as unknown as MJCompanyIntegrationEntity;
}

/**
 * A multi-batch connector for an incremental (timestamp-watermark) pull:
 *   batch 1 — two clean records, NewWatermarkValue=CLEAN_WATERMARK, HasMore=true
 *   batch 2 — one poison + one good record, NewWatermarkValue=DIRTY_WATERMARK, HasMore=false
 * Non-keyset (StableOrderingKey === null) so the timestamp safe-floor path runs.
 */
function createTwoBatchConnector(): { connector: BaseIntegrationConnector; fetchCalls: () => number } {
    let fetchCallCount = 0;
    const batch1: ExternalRecord[] = [
        { ExternalID: 'ext-1', ObjectType: 'Contact', Fields: { Name: 'Contact 1' }, IsDeleted: false },
        { ExternalID: 'ext-2', ObjectType: 'Contact', Fields: { Name: 'Contact 2' }, IsDeleted: false },
    ];
    const batch2: ExternalRecord[] = [
        // 'Contact POISON' fails Save() below → this batch errors one record.
        { ExternalID: 'ext-3', ObjectType: 'Contact', Fields: { Name: 'Contact POISON' }, IsDeleted: false },
        { ExternalID: 'ext-4', ObjectType: 'Contact', Fields: { Name: 'Contact 4' }, IsDeleted: false },
    ];
    const connector = {
        TestConnection: vi.fn(),
        DiscoverObjects: vi.fn(),
        DiscoverFields: vi.fn(),
        FetchChanges: vi.fn().mockImplementation(async (_ctx: FetchContext): Promise<FetchBatchResult> => {
            fetchCallCount++;
            if (fetchCallCount === 1) {
                return { Records: batch1, HasMore: true, NewWatermarkValue: CLEAN_WATERMARK };
            }
            return { Records: batch2, HasMore: false, NewWatermarkValue: DIRTY_WATERMARK };
        }),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,   // non-keyset → timestamp watermark path
    } as unknown as BaseIntegrationConnector;
    return { connector, fetchCalls: () => fetchCallCount };
}

describe('IntegrationEngine — safe-floor-on-error watermark (audit bug #6)', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn();
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
    });

    it('holds the persisted incremental watermark to the last CLEAN batch when a later batch errors a record', async () => {
        const { connector, fetchCalls } = createTwoBatchConnector();

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
            ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
            Name: 'Test',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [companyIntegration] },
            {
                Success: true,
                Results: [{
                    Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                    CompanyIntegrationID: 'ci-1',
                    EntityID: 'entity-1',
                    ConflictResolution: 'SourceWins',
                    DeleteBehavior: 'SoftDelete',
                    Entity: 'Contacts',
                    ExternalObjectName: 'contacts',
                } as unknown as ICompanyIntegrationEntityMap],
            },
            { Success: true, Results: [integration] },
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        // The PRE-EXISTING Pull watermark row. The engine loads it at the start of the pull
        // (seeding the incremental from PRIOR_WATERMARK) and writes the FINAL watermark back into
        // it via WatermarkService.Update → UpdateExistingWatermark → Save(). We capture exactly
        // what value the engine chose to persist — that is the safe-floor decision under test.
        let persistedWatermark: string | null | undefined;
        const existingWatermark = {
            ID: 'wm-1',
            EntityMapID: 'em-1',
            Direction: 'Pull' as const,
            WatermarkType: 'Timestamp' as const,
            WatermarkValue: PRIOR_WATERMARK as string | null,
            LastSyncAt: new Date('2024-06-15T09:00:00.000Z'),
            RecordsSynced: 0,
            Get: vi.fn(),
            Save: vi.fn().mockImplementation(async function (this: { WatermarkValue: string | null }) {
                persistedWatermark = this.WatermarkValue;
                return true;
            }),
        } as unknown as ICompanyIntegrationSyncWatermark;

        mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
            const entityName = params['EntityName'] as string;
            if (entityName === 'MJ: Company Integration Field Maps') {
                return {
                    Success: true,
                    Results: [{
                        SourceFieldName: 'Name',
                        DestinationFieldName: 'Name',
                        TransformPipeline: null,
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    } as unknown as ICompanyIntegrationFieldMap],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                // Every Load() of the Pull watermark returns the same row reference so the
                // engine's in-place Update is observable via its Save().
                return { Success: true, Results: [existingWatermark] };
            }
            // Record-map / key-match lookups — no matches (all creates).
            return { Success: true, Results: [] };
        });

        // Fail ONLY the record whose mapped Name is 'Contact POISON' (batch 2). Keying on the
        // record's own value (not call order) makes the per-record re-apply fail the SAME record
        // both times, so exactly one record in batch 2 errors and the floor must not advance.
        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => {
            const entity = createMockEntity({});
            if (entityName === 'Contacts') {
                entity.Save = vi.fn().mockImplementation(async () =>
                    (entity._data['Name'] as string) !== 'Contact POISON');
            }
            return entity;
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false });

            // Sanity: this is genuinely the multi-batch, error-bearing incremental path we intended to
            // drive (a full sync would always advance the watermark to "now" and never test the floor).
            expect(fetchCalls()).toBe(2);                 // both batches were fetched
            expect(result.RecordsProcessed).toBe(4);      // 2 clean + (1 poison + 1 good)
            expect(result.RecordsCreated).toBe(3);        // Contact 1, 2, 4
            expect(result.RecordsErrored).toBe(1);        // only Contact POISON
            expect(result.Errors[0].ExternalID).toBe('ext-3');

            // THE SAFE-FLOOR ASSERTION (asserts on the value actually written to the watermark row —
            // the persisted DB effect, which is the real subject of bug #6):
            // The engine advanced currentWatermark to DIRTY_WATERMARK (batch 2) but, because batch 2
            // errored, it must persist the last fully-clean batch's value (CLEAN_WATERMARK) so the next
            // incremental re-fetches the failed window. It must NOT persist DIRTY_WATERMARK.
            expect(persistedWatermark).toBe(CLEAN_WATERMARK);
            expect(persistedWatermark).not.toBe(DIRTY_WATERMARK);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });

    it('advances the watermark to the latest batch when ALL batches are clean (control — floor only triggers on error)', async () => {
        // Same two-batch shape, but NO poison record — proves the assertion above isolates the
        // safe-floor behavior and isn't just always returning the earlier watermark.
        const { connector } = createTwoBatchConnector();

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
            ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
            Name: 'Test',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [companyIntegration] },
            {
                Success: true,
                Results: [{
                    Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                    CompanyIntegrationID: 'ci-1',
                    EntityID: 'entity-1',
                    ConflictResolution: 'SourceWins',
                    DeleteBehavior: 'SoftDelete',
                    Entity: 'Contacts',
                    ExternalObjectName: 'contacts',
                } as unknown as ICompanyIntegrationEntityMap],
            },
            { Success: true, Results: [integration] },
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        let persistedWatermark: string | null | undefined;
        const existingWatermark = {
            ID: 'wm-1',
            EntityMapID: 'em-1',
            Direction: 'Pull' as const,
            WatermarkType: 'Timestamp' as const,
            WatermarkValue: PRIOR_WATERMARK as string | null,
            LastSyncAt: new Date('2024-06-15T09:00:00.000Z'),
            RecordsSynced: 0,
            Get: vi.fn(),
            Save: vi.fn().mockImplementation(async function (this: { WatermarkValue: string | null }) {
                persistedWatermark = this.WatermarkValue;
                return true;
            }),
        } as unknown as ICompanyIntegrationSyncWatermark;

        mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
            const entityName = params['EntityName'] as string;
            if (entityName === 'MJ: Company Integration Field Maps') {
                return {
                    Success: true,
                    Results: [{
                        SourceFieldName: 'Name',
                        DestinationFieldName: 'Name',
                        TransformPipeline: null,
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    } as unknown as ICompanyIntegrationFieldMap],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [existingWatermark] };
            }
            return { Success: true, Results: [] };
        });

        // No poison: every Contacts Save succeeds → both batches are fully clean.
        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async () => createMockEntity({}));

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false });

            expect(result.RecordsErrored).toBe(0);
            // With zero errors, the floor never engages and the watermark advances to the latest
            // batch's value (here that is DIRTY_WATERMARK — "dirty" only by name; this run is clean).
            // This control proves the bug-#6 assertion above isolates the safe-floor behavior and isn't
            // just always persisting the earlier watermark.
            expect(persistedWatermark).toBe(DIRTY_WATERMARK);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });
});
