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
import type { ExternalRecord } from '../types.js';
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
});
