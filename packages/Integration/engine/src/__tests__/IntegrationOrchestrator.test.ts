import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationRunEntity,
    MJCompanyIntegrationRunDetailEntity,
    MJCompanyIntegrationRecordMapEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJIntegrationEntity,
    MJIntegrationSourceTypeEntity,
} from '@memberjunction/core-entities';
import type {
    BaseIntegrationConnector,
    FetchContext,
    FetchBatchResult,
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord, SyncProgress } from '../types.js';
import { IntegrationOrchestrator } from '../IntegrationOrchestrator.js';

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
        Metadata: class MockMetadata {
            async GetEntityObject(entityName: string) {
                const entity = createMockEntity({ ID: `new-${entityName}-id` });
                mockEntityInstances.set(entityName, entity);
                return entity;
            }
        },
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

describe('IntegrationOrchestrator', () => {
    let orchestrator: IntegrationOrchestrator;

    beforeEach(() => {
        orchestrator = new IntegrationOrchestrator();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn();
        // Clear static activeSyncs between tests to prevent cross-test interference
        // Access via bracket notation since it's private static
        (IntegrationOrchestrator as Record<string, unknown>)['activeSyncs'] = new Map();
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
                } as unknown as MJCompanyIntegrationEntityMapEntity],
            },
            { Success: true, Results: [integration] },
            {
                Success: true,
                Results: [{
                    DriverClass: 'TestConnector',
                } as unknown as MJIntegrationSourceTypeEntity],
            },
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
                    } as unknown as MJCompanyIntegrationFieldMapEntity],
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

    it('should isolate errors per record (one fails, others succeed)', async () => {
        const records = createMockRecords(3);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
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

        let createCallCount = 0;
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
            // Record map lookups — no matches
            return { Success: true, Results: [] };
        });

        // Make the second entity.Save() fail
        const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
        const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
        MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async () => {
            createCallCount++;
            const entity = createMockEntity({ ID: `id-${createCallCount}` });
            if (createCallCount === 2) {
                entity.Save.mockResolvedValue(false);
            }
            return entity;
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);
            expect(result.RecordsProcessed).toBe(3);
            expect(result.RecordsErrored).toBe(1);
            expect(result.RecordsCreated).toBe(2);
            expect(result.Errors.length).toBe(1);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            MockMetadataClass.prototype.GetEntityObject = origGetEntity;
        }
    });

    it('should handle empty result set from connector', async () => {
        const connector = createMockConnector({
            Records: [],
            HasMore: false,
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
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
        } as unknown as BaseIntegrationConnector;

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
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

    it('should include ErrorCode and Severity on record errors', async () => {
        const records = createMockRecords(1);
        const connector = createMockConnector({
            Records: records,
            HasMore: false,
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
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

                // Should only process 5 records (truncated from 10)
                expect(result.RecordsProcessed).toBe(5);
                expect(result.RecordsCreated).toBe(5);

                // Should have logged a warning about truncation
                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('exceeding MaxBatchSize')
                );

                warnSpy.mockRestore();
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
