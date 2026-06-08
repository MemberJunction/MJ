import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationRunEntity,
    MJCompanyIntegrationRunDetailEntity,
    MJCompanyIntegrationRecordMapEntity,
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
import type { ExternalRecord, SyncProgress } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';
// Note: IntegrationEngine is a singleton but tests instantiate it directly for isolation

// ---- Mocks ----

// Track mock RunView calls
let mockRunViewsFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;

// Track mock entity Save/NewRecord/InnerLoad calls
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
        // Dynamic property setters used by orchestrator
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
                // Stub out the database provider so ApplyRecords' BeginTransaction/Commit/Rollback
                // pattern is a no-op in unit tests. Real transaction behavior is exercised by
                // the full-stack regression suite.
                //
                // Multi-provider migration: IntegrationEngine now uses this.ProviderToUse which
                // falls back to Metadata.Provider. Several existing tests dynamically override
                // `MockMetadata.prototype.GetEntityObject` to inject failures — `Metadata.Provider`
                // delegates to `MockMetadata.prototype.GetEntityObject` so a single prototype
                // override affects both code paths (helper-class instance + static Provider).
                static Provider: {
                    BeginTransaction: ReturnType<typeof vi.fn>;
                    CommitTransaction: ReturnType<typeof vi.fn>;
                    RollbackTransaction: ReturnType<typeof vi.fn>;
                    Entities: { Name: string; FirstPrimaryKey: { Name: string } }[];
                    EntityByName: (name: string) => { Name: string; FirstPrimaryKey: { Name: string } } | undefined;
                    GetEntityObject: (...args: unknown[]) => Promise<unknown>;
                };
                get Entities() {
                    return [{
                        Name: 'Contacts',
                        FirstPrimaryKey: { Name: 'ID' },
                    }];
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
                // Delegate to the prototype so test-time prototype overrides flow through.
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

function createMockConnector(fetchResult: FetchBatchResult): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ConnectionTestResult>>().mockResolvedValue({
            Success: true, Message: 'OK',
        }),
        DiscoverObjects: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ExternalObjectSchema[]>>().mockResolvedValue([]),
        DiscoverFields: vi.fn<[MJCompanyIntegrationEntity, string, UserInfo], Promise<ExternalFieldSchema[]>>().mockResolvedValue([]),
        FetchChanges: vi.fn<[FetchContext], Promise<FetchBatchResult>>().mockResolvedValue(fetchResult),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        // §7/§10 contract defaults (real connectors inherit these from BaseIntegrationConnector).
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
    } as unknown as BaseIntegrationConnector;
}

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

function createMockRecords(count: number): ExternalRecord[] {
    return Array.from({ length: count }, (_, i) => ({
        ExternalID: `ext-${i + 1}`,
        ObjectType: 'Contact',
        Fields: { Name: `Contact ${i + 1}`, Email: `c${i + 1}@test.com` },
        IsDeleted: false,
    }));
}

describe('IntegrationEngine', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn();
        // Clear static activeSyncs between tests to prevent cross-test interference
        // Access via bracket notation since it's private static
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
    });

    it('should execute a full orchestration flow with records', async () => {
        const records = createMockRecords(3);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
            NewWatermarkValue: '2024-06-15T12:00:00.000Z',
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration: MJIntegrationEntity = {
            ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
            Name: 'TestIntegration',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        // Mock RunViews for LoadRunConfiguration
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
                    SyncEnabled: true,
                    Status: 'Active',
                } as unknown as ICompanyIntegrationEntityMap],
            },
            { Success: true, Results: [integration] },
        ]);

        // Mock field maps loading (RunView)
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
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            // Key field match / record map lookups - return no matches (all creates)
            return { Success: true, Results: [] };
        });

        // Override ConnectorFactory.Resolve to return our mock connector
        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.RecordsProcessed).toBe(3);
            expect(result.RecordsCreated).toBe(3);
            expect(result.RecordsErrored).toBe(0);
            expect(result.Success).toBe(true);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('isolates a single failing record: good siblings commit, only the poison record errors', async () => {
        const records = createMockRecords(3);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

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
                }],
            },
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
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    }],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            // Record map lookups — no matches (all creates)
            return { Success: true, Results: [] };
        });

        // Make ONLY the record whose mapped Name is 'Contact 2' fail to Save. We key on the
        // record's own field value (not call order) so the per-record fallback's re-apply pass
        // fails the SAME record both times — proving failure isolation by record identity, not
        // by transaction position.
        const savedNames: string[] = [];
        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => {
            const entity = createMockEntity({});
            if (entityName === 'Contacts') {
                entity.Save = vi.fn().mockImplementation(async () => {
                    const name = entity._data['Name'] as string;
                    if (name === 'Contact 2') {
                        return false; // poison record
                    }
                    savedNames.push(name);
                    return true;
                });
            }
            return entity;
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            // Per-record isolation: when the batch transaction fails on the poison record,
            // the engine degrades to per-record transactions. The two good records (Contact 1
            // and Contact 3) are committed/created; only Contact 2 errors. RecordsProcessed
            // still equals the chunk size (3 — the run invariant is preserved).
            expect(result.RecordsProcessed).toBe(3);
            expect(result.RecordsCreated).toBe(2);
            expect(result.RecordsErrored).toBe(1);
            expect(result.Errors.length).toBe(1);
            // The error carries the REAL per-record cause + identity — not a single batch-wide
            // 'Batch rolled back' message smeared across every record.
            expect(result.Errors[0].ExternalID).toBe('ext-2');
            expect(result.Errors[0].ChangeType).toBe('Create');
            expect(result.Errors[0].ErrorMessage).not.toContain('Batch rolled back');
            expect(result.Errors[0].ErrorMessage).toContain('Failed to create Contacts record');
            // The good records were actually saved (committed) — exactly Contact 1 and Contact 3.
            expect(savedNames).toContain('Contact 1');
            expect(savedNames).toContain('Contact 3');
            expect(savedNames).not.toContain('Contact 2');
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });

    it('a poison record in the middle of a chunk does not sink its siblings', async () => {
        // Five records; the middle one (Contact 3) fails Save. The other four must still create.
        const records = createMockRecords(5);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

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
                }],
            },
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
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    }],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => {
            const entity = createMockEntity({});
            if (entityName === 'Contacts') {
                entity.Save = vi.fn().mockImplementation(async () =>
                    (entity._data['Name'] as string) !== 'Contact 3');
            }
            return entity;
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.RecordsProcessed).toBe(5);
            expect(result.RecordsCreated).toBe(4);
            expect(result.RecordsErrored).toBe(1);
            expect(result.Errors.length).toBe(1);
            expect(result.Errors[0].ExternalID).toBe('ext-3');
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });

    it('does not start a sync (and creates no run) when the connector is deactivated (IsActive=false)', async () => {
        const records = createMockRecords(1);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

        // CompanyIntegration with IsActive=false (strongly-typed property on the mock).
        const companyIntegration = {
            Get: vi.fn((field: string) => {
                if (field === 'ID') return 'ci-1';
                if (field === 'Configuration') return '{}';
                return null;
            }),
            ID: 'ci-1',
            IntegrationID: 'int-1',
            Integration: 'Test',
            Configuration: '{}',
            IsActive: false,
        } as unknown as MJCompanyIntegrationEntity;

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
                }],
            },
            { Success: true, Results: [integration] },
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            // The engine-level IsActive gate aborts gracefully: a structured failure result,
            // no run row created (no entity object for 'MJ: Company Integration Runs'), and a
            // clear deactivated message.
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('deactivated');
            expect(result.RunID).toBeUndefined();
            expect(result.RecordsProcessed).toBe(0);
            expect(result.RecordsCreated).toBe(0);
            // The connector must never have been asked to fetch.
            expect(connector.FetchChanges).not.toHaveBeenCalled();
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('should handle empty result set from connector', async () => {
        const connector = createMockConnector({
            Records: [],
            HasMore: false,
        });

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
                }],
            },
            { Success: true, Results: [integration] },
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
            const entityName = params['EntityName'] as string;
            if (entityName === 'MJ: Company Integration Field Maps') {
                return { Success: true, Results: [] };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.RecordsProcessed).toBe(0);
            expect(result.RecordsCreated).toBe(0);
            expect(result.Success).toBe(true);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('should throw when CompanyIntegration is not found', async () => {
        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [] }, // No CI found
            { Success: true, Results: [] },
            { Success: true, Results: [] },
            { Success: true, Results: [] },
        ]);

        await expect(orchestrator.RunSync('nonexistent', contextUser))
            .rejects.toThrow('CompanyIntegration not found');
    });

    it('should handle connector FetchChanges with multiple batches', async () => {
        const batch1Records = createMockRecords(2);
        const batch2Records: ExternalRecord[] = [
            { ExternalID: 'ext-3', ObjectType: 'Contact', Fields: { Name: 'Contact 3' }, IsDeleted: false },
        ];

        let fetchCallCount = 0;
        const connector = {
            TestConnection: vi.fn(),
            DiscoverObjects: vi.fn(),
            DiscoverFields: vi.fn(),
            FetchChanges: vi.fn().mockImplementation(async () => {
                fetchCallCount++;
                if (fetchCallCount === 1) {
                    return { Records: batch1Records, HasMore: true, NewWatermarkValue: 'wm-1' };
                }
                return { Records: batch2Records, HasMore: false, NewWatermarkValue: 'wm-2' };
            }),
            GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
            RateLimitPolicy: null,
            ExtractRetryAfterMs: () => undefined,
            PostProcessRecord: (r: ExternalRecord) => r,
            StableOrderingKey: () => null,
        } as unknown as BaseIntegrationConnector;

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
                }],
            },
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
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    }],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.RecordsProcessed).toBe(3);
            expect(result.RecordsCreated).toBe(3);
            expect(fetchCallCount).toBe(2);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('should resume a keyset scan from the persisted Cursor watermark (§8a checkpoint-resume)', async () => {
        const seenAfterKeys: Array<string | null | undefined> = [];
        const connector = {
            TestConnection: vi.fn(),
            DiscoverObjects: vi.fn(),
            DiscoverFields: vi.fn(),
            FetchChanges: vi.fn().mockImplementation(async (ctx: FetchContext) => {
                seenAfterKeys.push(ctx.AfterKeyValue);
                return {
                    Records: [{ ExternalID: 'ext-9', ObjectType: 'Contact', Fields: { Name: 'Contact 9' }, IsDeleted: false }],
                    HasMore: false,
                    NextAfterKeyValue: 'ext-9',
                };
            }),
            GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
            RateLimitPolicy: null,
            ExtractRetryAfterMs: () => undefined,
            PostProcessRecord: (r: ExternalRecord) => r,
            // Keyset-capable: declares a stable ordering key for this object, so the engine resumes by seek.
            StableOrderingKey: () => 'hs_object_id',
        } as unknown as BaseIntegrationConnector;

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
            ID: 'int-1', Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null), Name: 'Test', ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [companyIntegration] },
            { Success: true, Results: [{
                Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                CompanyIntegrationID: 'ci-1', EntityID: 'entity-1', ConflictResolution: 'SourceWins',
                DeleteBehavior: 'SoftDelete', Entity: 'Contacts', ExternalObjectName: 'contacts',
            }] },
            { Success: true, Results: [integration] },
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        // The previously-interrupted scan left a Cursor watermark at ordering key '1500'.
        const cursorWatermark = {
            EntityMapID: 'em-1', Direction: 'Pull', WatermarkType: 'Cursor', WatermarkValue: '1500',
            LastSyncAt: null, RecordsSynced: 0, Save: vi.fn().mockResolvedValue(true),
        };
        mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
            const entityName = params['EntityName'] as string;
            if (entityName === 'MJ: Company Integration Field Maps') {
                return { Success: true, Results: [{ SourceFieldName: 'Name', DestinationFieldName: 'Name', TransformPipeline: null, IsKeyField: false, Status: 'Active', Priority: 0 }] };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [cursorWatermark] };
            }
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            await orchestrator.RunSync('ci-1', contextUser);
            // The first (and only) fetch must have been seeded with the persisted seek key — proof the
            // engine resumed the interrupted scan instead of restarting from the beginning.
            expect(seenAfterKeys[0]).toBe('1500');
            // A clean scan clears the resume marker so the next run seeks fresh.
            expect(cursorWatermark.WatermarkValue).toBeNull();
            expect(cursorWatermark.Save).toHaveBeenCalled();
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('should include ErrorCode and Severity on record errors', async () => {
        const records = createMockRecords(1);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

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
                }],
            },
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
                        IsKeyField: false,
                        Status: 'Active',
                        Priority: 0,
                    }],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        // Make the target entity Save fail, but NOT the run/detail/record-map entities
        let entityCreateCount = 0;
        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => {
            entityCreateCount++;
            const entity = createMockEntity({ ID: `id-${entityCreateCount}` });
            // The first GetEntityObject call is for the run record (which must succeed).
            // The second is for the target entity we want to fail.
            // Subsequent calls are for run detail, record maps, etc. (must succeed).
            if (entityName === 'Contacts' || entityCreateCount === 2) {
                entity.Save.mockResolvedValue(false);
            }
            return entity;
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.Errors.length).toBe(1);
            const error = result.Errors[0];
            expect(error.ErrorCode).toBeDefined();
            expect(error.Severity).toBeDefined();
            expect(typeof error.ErrorCode).toBe('string');
            expect(typeof error.Severity).toBe('string');
            expect(error.ExternalID).toBe('ext-1');
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });

    describe('Concurrency lock', () => {
        it('should return the same promise when RunSync is called twice for the same ID', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

            const companyIntegration = createMockCompanyIntegration();
            const integration = {
                ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
                Name: 'Test',
                ClassName: 'TestConnector',
            } as unknown as MJIntegrationEntity;

            // Need to mock RunViews twice since two calls will share the same promise
            // but only one will actually execute
            mockRunViewsFn.mockResolvedValue([
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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                // Start two syncs for the same company integration ID
                const promise1 = orchestrator.RunSync('ci-1', contextUser);
                const promise2 = orchestrator.RunSync('ci-1', contextUser);

                const [result1, result2] = await Promise.all([promise1, promise2]);

                // Both should return the same result since the second call joins the first
                expect(result1).toBe(result2);
                expect(result1.Success).toBe(true);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should be case-insensitive when checking for duplicate syncs', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

            const companyIntegration = createMockCompanyIntegration();
            const integration = {
                ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
                Name: 'Test',
                ClassName: 'TestConnector',
            } as unknown as MJIntegrationEntity;

            mockRunViewsFn.mockResolvedValue([
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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                // Start with different casing
                const promise1 = orchestrator.RunSync('CI-1', contextUser);
                const promise2 = orchestrator.RunSync('ci-1', contextUser);

                const [result1, result2] = await Promise.all([promise1, promise2]);

                // Both should return the same result because lock key is lowercased
                expect(result1).toBe(result2);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should clear the lock after sync completes, allowing a new sync', async () => {
            const connector = createMockConnector({
                Records: [],
                HasMore: false,
            });

            const companyIntegration = createMockCompanyIntegration();
            const integration = {
                ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
                Name: 'Test',
                ClassName: 'TestConnector',
            } as unknown as MJIntegrationEntity;

            mockRunViewsFn.mockResolvedValue([
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
                    }],
                },
                { Success: true, Results: [integration] },
                { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
            ]);

            mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
                const entityName = params['EntityName'] as string;
                if (entityName === 'MJ: Company Integration Field Maps') {
                    return { Success: true, Results: [] };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                // First sync
                const result1 = await orchestrator.RunSync('ci-1', contextUser);
                expect(result1.Success).toBe(true);

                // Second sync should execute independently (not return same promise)
                const result2 = await orchestrator.RunSync('ci-1', contextUser);
                expect(result2.Success).toBe(true);

                // They should be different objects because the first completed and lock was cleared
                expect(result1).not.toBe(result2);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });
    });

    describe('Batch size enforcement', () => {
        it('should truncate records when connector returns more than MaxBatchSize', async () => {
            // Create 10 records but set MaxBatchSize to 5
            const records = createMockRecords(10);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                orchestrator.MaxBatchSize = 5;
                const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

                const result = await orchestrator.RunSync('ci-1', contextUser);

                // Should process ALL 10 records — MaxBatchSize is a warning threshold, not a hard truncation
                expect(result.RecordsProcessed).toBe(10);
                expect(result.RecordsCreated).toBe(10);

                // Should have logged a message that the batch size was exceeded
                expect(logSpy).toHaveBeenCalledWith(
                    expect.stringContaining('MaxBatchSize')
                );

                logSpy.mockRestore();
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should not truncate when connector returns exactly MaxBatchSize records', async () => {
            const records = createMockRecords(5);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                orchestrator.MaxBatchSize = 5;
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

                const result = await orchestrator.RunSync('ci-1', contextUser);

                // Should process all 5 records without truncation
                expect(result.RecordsProcessed).toBe(5);
                expect(result.RecordsCreated).toBe(5);

                // Should NOT have logged a truncation warning
                const truncationWarnings = warnSpy.mock.calls.filter(
                    call => typeof call[0] === 'string' && call[0].includes('exceeding MaxBatchSize')
                );
                expect(truncationWarnings.length).toBe(0);

                warnSpy.mockRestore();
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });
    });

    describe('Pre-write validation', () => {
        it('should throw when entity.Validate() returns failure', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            // Create entity with Validate that returns failure
            const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
            const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
            MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async () => {
                const entity = createMockEntity({ ID: 'id-validating' });
                // Add Validate method that returns failure
                (entity as Record<string, unknown>)['Validate'] = () => ({
                    Success: false,
                    Errors: [{ Message: 'Email is required' }, { Message: 'Name too short' }],
                });
                return entity;
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                const result = await orchestrator.RunSync('ci-1', contextUser);

                // The record should have errored due to validation failure
                expect(result.RecordsErrored).toBe(1);
                expect(result.Errors.length).toBe(1);
                expect(result.Errors[0].ErrorMessage).toContain('Validation failed');
                expect(result.Errors[0].ErrorMessage).toContain('Email is required');
                expect(result.Errors[0].ErrorMessage).toContain('Name too short');
                expect(result.Errors[0].ErrorCode).toBe('VALIDATION_ERROR');
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
                MockMetadataClass.prototype.GetEntityObject = origGetEntity;
            }
        });

        it('should proceed normally when entity has no Validate method', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                const result = await orchestrator.RunSync('ci-1', contextUser);
                // Entity without Validate should proceed normally
                expect(result.RecordsCreated).toBe(1);
                expect(result.RecordsErrored).toBe(0);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should proceed when entity.Validate() returns success', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            // Entity with Validate returning success
            const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
            const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
            MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async () => {
                const entity = createMockEntity({ ID: 'id-valid' });
                (entity as Record<string, unknown>)['Validate'] = () => ({
                    Success: true,
                    Errors: [],
                });
                return entity;
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                const result = await orchestrator.RunSync('ci-1', contextUser);
                expect(result.RecordsCreated).toBe(1);
                expect(result.RecordsErrored).toBe(0);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
                MockMetadataClass.prototype.GetEntityObject = origGetEntity;
            }
        });
    });

    describe('Progress callback', () => {
        it('should call onProgress callback during entity map processing', async () => {
            const records = createMockRecords(3);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            const progressUpdates: SyncProgress[] = [];
            const onProgress = (progress: SyncProgress) => {
                progressUpdates.push({ ...progress });
            };

            try {
                await orchestrator.RunSync('ci-1', contextUser, 'Manual', onProgress);

                // Should have received at least one progress update
                expect(progressUpdates.length).toBeGreaterThan(0);

                // Check the structure of the progress update
                const lastUpdate = progressUpdates[progressUpdates.length - 1];
                expect(lastUpdate.EntityMapIndex).toBeDefined();
                expect(lastUpdate.TotalEntityMaps).toBeDefined();
                expect(lastUpdate.RecordsProcessedInCurrentMap).toBeDefined();
                expect(lastUpdate.TotalRecordsInCurrentMap).toBeDefined();
                expect(typeof lastUpdate.PercentComplete).toBe('number');
                expect(lastUpdate.PercentComplete).toBeGreaterThanOrEqual(0);
                expect(lastUpdate.PercentComplete).toBeLessThanOrEqual(100);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should not fail when no onProgress callback is provided', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

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
                    }],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            try {
                // No onProgress callback — should not throw
                const result = await orchestrator.RunSync('ci-1', contextUser);
                expect(result.Success).toBe(true);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });

        it('should report correct TotalEntityMaps in progress', async () => {
            const records = createMockRecords(1);
            const connector = createMockConnector({
                Records: records,
                HasMore: false,
            });

            const companyIntegration = createMockCompanyIntegration();
            const integration = {
                ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
                Name: 'Test',
                ClassName: 'TestConnector',
            } as unknown as MJIntegrationEntity;

            // Provide 2 entity maps
            mockRunViewsFn.mockResolvedValueOnce([
                { Success: true, Results: [companyIntegration] },
                {
                    Success: true,
                    Results: [
                        {
                            Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                            CompanyIntegrationID: 'ci-1',
                            EntityID: 'entity-1',
                            ConflictResolution: 'SourceWins',
                            DeleteBehavior: 'SoftDelete',
                            Entity: 'Contacts',
                            ExternalObjectName: 'contacts',
                        },
                        {
                            Get: vi.fn((f: string) => f === 'ID' ? 'em-2' : null),
                            CompanyIntegrationID: 'ci-1',
                            EntityID: 'entity-2',
                            ConflictResolution: 'SourceWins',
                            DeleteBehavior: 'SoftDelete',
                            Entity: 'Accounts',
                            ExternalObjectName: 'accounts',
                        },
                    ],
                },
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
                            IsKeyField: false,
                            Status: 'Active',
                            Priority: 0,
                        }],
                    };
                }
                if (entityName === 'MJ: Company Integration Sync Watermarks') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            });

            const { ConnectorFactory } = await import('../ConnectorFactory.js');
            const resolveOrig = ConnectorFactory.Resolve;
            ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

            const progressUpdates: SyncProgress[] = [];
            const onProgress = (progress: SyncProgress) => {
                progressUpdates.push({ ...progress });
            };

            try {
                await orchestrator.RunSync('ci-1', contextUser, 'Manual', onProgress);

                // Should have received updates for both entity maps
                expect(progressUpdates.length).toBe(2);

                // Both should report TotalEntityMaps as 2
                for (const update of progressUpdates) {
                    expect(update.TotalEntityMaps).toBe(2);
                }

                // First update should be for entity map index 0, second for index 1
                expect(progressUpdates[0].EntityMapIndex).toBe(0);
                expect(progressUpdates[1].EntityMapIndex).toBe(1);
            } finally {
                ConnectorFactory.Resolve = resolveOrig;
            }
        });
    });
});
