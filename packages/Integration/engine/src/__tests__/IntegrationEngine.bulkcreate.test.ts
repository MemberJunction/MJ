import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';
import type {
    BaseIntegrationConnector,
    FetchBatchResult,
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
} from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';

// ──────────────────────────────────────────────────────────────────────────────
// Opt-in bulk writes (Configuration.writeMode === 'bulk').
//
// The contract under test, end-to-end through RunSync():
//   1. Eligible NEW records (Create + mapped PK) go through provider.BulkCreate ONCE
//      per batch — and their entities are NEVER Save()d individually.
//   2. A failed bulk write falls back to the unchanged per-record path — same counts,
//      correctness unaffected, only the batch's write cost.
//   3. Without the opt-in, BulkCreate is never touched — the default path is unchanged.
//   4. Record maps ride the same flush as ever, one per created record.
// ──────────────────────────────────────────────────────────────────────────────

let mockRunViewsFn: ReturnType<typeof vi.fn>;
const fanOutToRunView = async (params: Array<Record<string, unknown>>, contextUser?: unknown) =>
    Promise.all(params.map(p => mockRunViewFn(p, contextUser)));
let mockRunViewFn: ReturnType<typeof vi.fn>;

let savedRecordMapRows: Array<{ ExternalSystemRecordID: string; EntityRecordID: string }>;
let targetSaveCount: number;
let bulkCreateMock: ReturnType<typeof vi.fn>;

function createMockTargetEntity() {
    const data: Record<string, unknown> = {};
    let dirty = false;
    return {
        NewRecord: vi.fn(() => { dirty = true; }),
        Save: vi.fn().mockImplementation(async () => { dirty = false; targetSaveCount++; return true; }),
        Delete: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(false),   // no existing row — genuinely new
        Load: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => { if (data[field] !== value) dirty = true; data[field] = value; }),
        get Dirty() { return dirty; },
        Fields: [{ Name: 'ID' }, { Name: 'Name' }],
        get EntityInfo() { return { Name: 'Contacts' }; },
        get IsSaved() { return false; },
        get PrimaryKey() {
            return { KeyValuePairs: [{ FieldName: 'ID', Value: (data['ID'] as string) ?? '?' }] };
        },
        get LatestResult() { return { CompleteMessage: '' }; },
        _data: data,
    };
}

function createMockRecordMapEntity() {
    const data: Record<string, unknown> = {};
    return {
        NewRecord: vi.fn(),
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockImplementation(async () => {
            savedRecordMapRows.push({
                ExternalSystemRecordID: data['ExternalSystemRecordID'] as string,
                EntityRecordID: data['EntityRecordID'] as string,
            });
            return true;
        }),
        Get: vi.fn((field: string) => data[field]),
        set CompanyIntegrationID(v: string) { data['CompanyIntegrationID'] = v; },
        set ExternalSystemRecordID(v: string) { data['ExternalSystemRecordID'] = v; },
        set EntityID(v: string) { data['EntityID'] = v; },
        set EntityRecordID(v: string) { data['EntityRecordID'] = v; },
        get LatestResult() { return { CompleteMessage: '' }; },
    };
}

function createMockBookkeepingEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true), Delete: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true), InnerLoad: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => { data[field] = value; }),
        get ID() { return (data['ID'] as string) ?? 'generated-id'; },
        set ID(v: string) { data['ID'] = v; },
        get PrimaryKey() { return { KeyValuePairs: [{ FieldName: 'ID', Value: (data['ID'] as string) ?? 'generated-id' }] }; },
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
        _data: data,
    };
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    const { createOwnershipProviderSurface } = await vi.importActual<
        typeof import('./helpers/ownershipProviderSurface.js')
    >('./helpers/ownershipProviderSurface.js');

    const CONTACTS_ENTITY_INFO = {
        Name: 'Contacts',
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }],
    };

    function makeEntity(entityName: string) {
        if (entityName === 'Contacts') return createMockTargetEntity();
        if (entityName === 'MJ: Company Integration Record Maps') return createMockRecordMapEntity();
        return createMockBookkeepingEntity({ ID: `new-${entityName}-id` });
    }

    class MockMetadata {
        static Provider: Record<string, unknown>;
        get Entities() { return [CONTACTS_ENTITY_INFO]; }
        EntityByName(name: string) { return name === 'Contacts' ? CONTACTS_ENTITY_INFO : undefined; }
        async GetEntityObject(entityName: string) { return makeEntity(entityName); }
    }
    MockMetadata.Provider = {
        ...createOwnershipProviderSurface(),
        BeginTransaction: vi.fn().mockResolvedValue(undefined),
        CommitTransaction: vi.fn().mockResolvedValue(undefined),
        RollbackTransaction: vi.fn().mockResolvedValue(undefined),
        Entities: [CONTACTS_ENTITY_INFO],
        EntityByName(name: string) { return name === 'Contacts' ? CONTACTS_ENTITY_INFO : undefined; },
        GetEntityObject(...args: unknown[]) {
            return MockMetadata.prototype.GetEntityObject.apply(new MockMetadata(), args as [string]);
        },
        // The capability the engine duck-types for. Wired to the test-controlled mock at runtime
        // (bulkCreateMock is assigned in beforeEach, after this hoisted factory runs).
        BulkCreate(...args: unknown[]) { return bulkCreateMock(...args); },
    };

    return {
        ...actual,
        RunView: class MockRunView {
            RunViews(...args: unknown[]) { return mockRunViewsFn(...args); }
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
        Metadata: MockMetadata,
        CompositeKey: class MockCompositeKey {
            KeyValuePairs: Array<{ FieldName: string; Value: string }> = [];
        },
    };
});

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn().mockReturnValue({}), CreateInstance: vi.fn() } } },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

function createMockConnector(fetchResult: FetchBatchResult): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ConnectionTestResult>>().mockResolvedValue({ Success: true, Message: 'OK' }),
        DiscoverObjects: vi.fn<[MJCompanyIntegrationEntity, UserInfo], Promise<ExternalObjectSchema[]>>().mockResolvedValue([]),
        DiscoverFields: vi.fn<[MJCompanyIntegrationEntity, string, UserInfo], Promise<ExternalFieldSchema[]>>().mockResolvedValue([]),
        FetchChanges: vi.fn().mockResolvedValue(fetchResult),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
    } as unknown as BaseIntegrationConnector;
}

function createMockCompanyIntegration(configuration = '{"writeMode":"bulk"}'): MJCompanyIntegrationEntity {
    return {
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'ci-1';
            if (field === 'Configuration') return configuration;
            return null;
        }),
        ID: 'ci-1',
        IntegrationID: 'int-1',
    } as unknown as MJCompanyIntegrationEntity;
}

/** Three brand-new records whose mapped fields carry the PK — bulk-eligible by construction. */
function threeCreates(): ExternalRecord[] {
    return [1, 2, 3].map(i => ({
        ExternalID: `ext-${i}`, ObjectType: 'Contact',
        Fields: { ID: `mj-${i}`, Name: `Contact ${i}` }, IsDeleted: false,
    }));
}

function wireRun(companyIntegration: MJCompanyIntegrationEntity) {
    const integration = {
        ID: 'int-1',
        Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
        Name: 'Test', ClassName: 'TestConnector',
    } as unknown as MJIntegrationEntity;

    mockRunViewsFn.mockResolvedValueOnce([
        { Success: true, Results: [companyIntegration] },
        {
            Success: true,
            Results: [{
                Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                ID: 'em-1', CompanyIntegrationID: 'ci-1', EntityID: 'entity-1',
                ConflictResolution: 'SourceWins', DeleteBehavior: 'SoftDelete',
                Entity: 'Contacts', ExternalObjectName: 'contacts',
                SyncEnabled: true, Status: 'Active',
            } as unknown as ICompanyIntegrationEntityMap],
        },
        { Success: true, Results: [integration] },
        { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
    ]);

    mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
        const entityName = params['EntityName'] as string;
        if (entityName === 'MJ: Company Integration Field Maps') {
            return {
                Success: true,
                Results: [
                    { SourceFieldName: 'ID', DestinationFieldName: 'ID', TransformPipeline: null, IsKeyField: true, Status: 'Active', Priority: 0 },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name', TransformPipeline: null, IsKeyField: false, Status: 'Active', Priority: 1 },
                ] as unknown as ICompanyIntegrationFieldMap[],
            };
        }
        // Contacts match lookups + record-map lookups: nothing exists — every record is a Create.
        return { Success: true, Results: [] };
    });
}

describe('IntegrationEngine — opt-in bulk writes', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        savedRecordMapRows = [];
        targetSaveCount = 0;
        bulkCreateMock = vi.fn();
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
    });

    async function run(configuration?: string) {
        const connector = createMockConnector({ Records: threeCreates(), HasMore: false });
        const companyIntegration = createMockCompanyIntegration(configuration);
        wireRun(companyIntegration);
        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);
        try {
            return await orchestrator.RunSync('ci-1', contextUser);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    }

    it('routes eligible creates through ONE BulkCreate call and never Save()s them individually', async () => {
        bulkCreateMock.mockResolvedValue({ Success: true, RowsInserted: 3, Mechanism: 'bulk' });

        const result = await run();

        expect(result.Success).toBe(true);
        expect(result.RecordsCreated).toBe(3);
        expect(bulkCreateMock).toHaveBeenCalledTimes(1);
        expect((bulkCreateMock.mock.calls[0][0] as unknown[]).length).toBe(3);
        // The whole point: zero per-record save round trips for the bulk-eligible set.
        expect(targetSaveCount).toBe(0);
        // Record maps still ride the same flush — one per created record, real PKs.
        expect(savedRecordMapRows.map(r => r.EntityRecordID).sort()).toEqual(['mj-1', 'mj-2', 'mj-3']);
    });

    it('falls back to the unchanged per-record path when the bulk write does not land', async () => {
        bulkCreateMock.mockResolvedValue({ Success: false, RowsInserted: 0, Mechanism: 'bulk', ErrorMessage: 'PK collision' });

        const result = await run();

        expect(result.Success).toBe(true);
        // Same records, same counts — only the write mechanism changed.
        expect(result.RecordsCreated).toBe(3);
        expect(targetSaveCount).toBe(3);
        expect(savedRecordMapRows).toHaveLength(3);
    });

    it('never touches BulkCreate without the opt-in — the default path is byte-for-byte unchanged', async () => {
        const result = await run('{}');

        expect(result.Success).toBe(true);
        expect(result.RecordsCreated).toBe(3);
        expect(bulkCreateMock).not.toHaveBeenCalled();
        expect(targetSaveCount).toBe(3);
    });
});
