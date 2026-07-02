import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { IntegrationEngine } from '../IntegrationEngine.js';

// ──────────────────────────────────────────────────────────────────────────────
// RecordMap-on-UPDATE coverage (P5).
//
// The existing IntegrationEngine.test.ts only exercises the CREATE path (every
// match lookup returns []  → "Updated: 0"). This file drives the *matched-and-
// updated* path: a record whose key field matches an existing destination row, so
// MatchEngine resolves ChangeType='Update' with a MatchedMJRecordID. We then assert:
//   1. RecordsUpdated > 0 (the real UPDATE branch ran, not CREATE).
//   2. UpdateRecord called SaveRecordMap on the update path.
//   3. The record map is 1:1 — exactly ONE record-map row exists for the
//      (CompanyIntegration, Entity, ExternalID) tuple (no drift / no duplicate).
//
// Source under test:
//   - UpdateRecord (~2560-2641): after a successful Save, calls SaveRecordMap.
//   - SaveRecordMap (~3006-3049): upsert keyed on
//     (CompanyIntegrationID, EntityID, ExternalSystemRecordID) — looks up an
//     existing map row first, only NewRecord()s when none exists (1:1 guarantee).
// ──────────────────────────────────────────────────────────────────────────────

// ---- Mock state (reset per test) ----
let mockRunViewsFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;

// Every record-map row that SaveRecordMap actually persists, captured at Save().
// One entry per persisted (CompanyIntegrationID|EntityID|ExternalSystemRecordID).
let savedRecordMapRows: Array<{
    CompanyIntegrationID: string;
    EntityID: string;
    ExternalSystemRecordID: string;
    EntityRecordID: string;
    isNew: boolean;
}>;

// Tracks how many times each entity type's Save() succeeded on the target entity.
let targetSaveCount: number;

/**
 * Mock target-entity (e.g. 'Contacts'). Mirrors the createMockEntity shape in
 * IntegrationEngine.test.ts but adds the members the UPDATE path requires that
 * the CREATE-only harness never exercised: a `Dirty` getter (so the engine does
 * NOT short-circuit the write as "unchanged") and a `Fields` array (so
 * PrefetchContentHashes can introspect columns without throwing).
 */
function createMockTargetEntity() {
    const data: Record<string, unknown> = {};
    let dirty = false;
    return {
        NewRecord: vi.fn(() => { dirty = true; }),
        Save: vi.fn().mockImplementation(async () => { dirty = false; targetSaveCount++; return true; }),
        Delete: vi.fn().mockResolvedValue(true),
        // InnerLoad simulates a successful load of the matched destination row.
        InnerLoad: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => {
            if (data[field] !== value) dirty = true;
            data[field] = value;
        }),
        // Built-in dirty tracking — the engine skips the write when !Dirty.
        get Dirty() { return dirty; },
        // The target entity has NO __mj_integration_ContentHash column, so the
        // content-hash fast path stays dormant and the real dirty-flag write runs.
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Email' }],
        get ID() { return (data['ID'] as string) ?? 'mj-contact-1'; },
        set ID(v: string) { data['ID'] = v; },
        get PrimaryKey() {
            return { KeyValuePairs: [{ FieldName: 'ID', Value: (data['ID'] as string) ?? 'mj-contact-1' }] };
        },
        _data: data,
    };
}

/**
 * Mock record-map entity ('MJ: Company Integration Record Maps'). On Save() it
 * appends its current field state to savedRecordMapRows so the test can assert
 * the 1:1 invariant on what was actually persisted.
 */
function createMockRecordMapEntity() {
    const data: Record<string, unknown> = {};
    let isNew = false;
    return {
        NewRecord: vi.fn(() => { isNew = true; }),
        Load: vi.fn().mockImplementation(async (id: string) => { data['ID'] = id; isNew = false; return true; }),
        Save: vi.fn().mockImplementation(async () => {
            savedRecordMapRows.push({
                CompanyIntegrationID: data['CompanyIntegrationID'] as string,
                EntityID: data['EntityID'] as string,
                ExternalSystemRecordID: data['ExternalSystemRecordID'] as string,
                EntityRecordID: data['EntityRecordID'] as string,
                isNew,
            });
            return true;
        }),
        Get: vi.fn((field: string) => data[field]),
        set CompanyIntegrationID(v: string) { data['CompanyIntegrationID'] = v; },
        set ExternalSystemRecordID(v: string) { data['ExternalSystemRecordID'] = v; },
        set EntityID(v: string) { data['EntityID'] = v; },
        set EntityRecordID(v: string) { data['EntityRecordID'] = v; },
        get LatestResult() { return { CompleteMessage: '' }; },
        _data: data,
    };
}

/**
 * Generic mock for the run/run-detail/etc. bookkeeping entities the engine
 * creates around a sync. They must Save() successfully but carry no assertions.
 */
function createMockBookkeepingEntity(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...overrides };
    return {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        Delete: vi.fn().mockResolvedValue(true),
        Load: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(true),
        Get: vi.fn((field: string) => data[field]),
        Set: vi.fn((field: string, value: unknown) => { data[field] = value; }),
        get ID() { return (data['ID'] as string) ?? 'generated-id'; },
        set ID(v: string) { data['ID'] = v; },
        get PrimaryKey() {
            return { KeyValuePairs: [{ FieldName: 'ID', Value: (data['ID'] as string) ?? 'generated-id' }] };
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
        _data: data,
    };
}

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');

    // Entity-info the engine reads via EntityByName. Includes Fields + PrimaryKeys so
    // the real PK-extraction / content-hash-introspection paths don't throw. Defined
    // INSIDE the factory because vi.mock is hoisted above top-level const declarations.
    const CONTACTS_ENTITY_INFO = {
        Name: 'Contacts',
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Email' }],
    };

    function makeEntity(entityName: string) {
        if (entityName === 'Contacts') return createMockTargetEntity();
        if (entityName === 'MJ: Company Integration Record Maps') return createMockRecordMapEntity();
        return createMockBookkeepingEntity({ ID: `new-${entityName}-id` });
    }

    class MockMetadata {
        static Provider: {
            BeginTransaction: ReturnType<typeof vi.fn>;
            CommitTransaction: ReturnType<typeof vi.fn>;
            RollbackTransaction: ReturnType<typeof vi.fn>;
            Entities: typeof CONTACTS_ENTITY_INFO[];
            EntityByName: (name: string) => typeof CONTACTS_ENTITY_INFO | undefined;
            GetEntityObject: (...args: unknown[]) => Promise<unknown>;
        };
        get Entities() { return [CONTACTS_ENTITY_INFO]; }
        EntityByName(name: string) {
            return name === 'Contacts' ? CONTACTS_ENTITY_INFO : undefined;
        }
        async GetEntityObject(entityName: string) {
            return makeEntity(entityName);
        }
    }
    MockMetadata.Provider = {
        BeginTransaction: vi.fn().mockResolvedValue(undefined),
        CommitTransaction: vi.fn().mockResolvedValue(undefined),
        RollbackTransaction: vi.fn().mockResolvedValue(undefined),
        Entities: [CONTACTS_ENTITY_INFO],
        EntityByName(name: string) {
            return name === 'Contacts' ? CONTACTS_ENTITY_INFO : undefined;
        },
        GetEntityObject(...args: unknown[]) {
            return MockMetadata.prototype.GetEntityObject.apply(new MockMetadata(), args as [string]);
        },
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
        ID: 'ci-1',
        IntegrationID: 'int-1',
    } as unknown as MJCompanyIntegrationEntity;
}

describe('IntegrationEngine — RecordMap on UPDATE (1:1, no drift)', () => {
    let orchestrator: IntegrationEngine;

    beforeEach(() => {
        orchestrator = new IntegrationEngine();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn();
        savedRecordMapRows = [];
        targetSaveCount = 0;
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
    });

    it('updates a matched record and writes exactly ONE record-map row (no duplicate)', async () => {
        // One incoming record. Its key field ('Name') will match an existing
        // destination Contacts row → ChangeType=Update with MatchedMJRecordID.
        const incoming: ExternalRecord[] = [{
            ExternalID: 'ext-1',
            ObjectType: 'Contact',
            Fields: { Name: 'Existing Contact', Email: 'updated@test.com' },
            IsDeleted: false,
        }];
        const connector = createMockConnector({
            Records: incoming,
            HasMore: false,
            NewWatermarkValue: '2024-06-15T12:00:00.000Z',
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
            ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
            Name: 'TestIntegration',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        // LoadRunConfiguration: CI, entity map (key-field-based, ConflictResolution=SourceWins
        // → matched records become Update, not Skip), integration, driver class.
        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [companyIntegration] },
            {
                Success: true,
                Results: [{
                    Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                    ID: 'em-1',
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
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        // Per-EntityName RunView routing:
        //   - Field Maps: 'Name' is a KEY field (drives FindByKeyFields).
        //   - Watermarks: none.
        //   - 'Contacts': the MatchEngine.FindByKeyFields lookup → return a matching
        //     PK row so the record resolves to UPDATE.
        //   - 'MJ: Company Integration Record Maps': SaveRecordMap's existence check.
        //     Return [] so the first persist NewRecord()s the single 1:1 row.
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
            if (entityName === 'Contacts') {
                // FindByKeyFields: existing destination row matches on Name → its PK.
                return { Success: true, Results: [{ ID: 'mj-contact-1' }] };
            }
            if (entityName === 'MJ: Company Integration Record Maps') {
                // SaveRecordMap's upsert existence check — no prior map row.
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);

            // The matched record went down the real UPDATE branch.
            expect(result.Success).toBe(true);
            expect(result.RecordsProcessed).toBe(1);
            expect(result.RecordsCreated).toBe(0);
            expect(result.RecordsUpdated).toBe(1);
            expect(result.RecordsErrored).toBe(0);

            // The destination Contacts row was actually saved on the update path.
            expect(targetSaveCount).toBe(1);

            // SaveRecordMap was invoked on the UPDATE path → exactly ONE record-map
            // row persisted (1:1 — no drift, no duplicate).
            expect(savedRecordMapRows.length).toBe(1);
            const row = savedRecordMapRows[0];
            expect(row.isNew).toBe(true);                       // freshly created (no prior map)
            expect(row.CompanyIntegrationID).toBe('ci-1');
            expect(row.EntityID).toBe('entity-1');
            expect(row.ExternalSystemRecordID).toBe('ext-1');
            // EntityRecordID is the entity's real PK, not the external ID.
            expect(row.EntityRecordID).toBe('mj-contact-1');

            // Strict 1:1: only one distinct (CI, Entity, ExternalID) tuple exists.
            const tuples = new Set(
                savedRecordMapRows.map(r => `${r.CompanyIntegrationID}|${r.EntityID}|${r.ExternalSystemRecordID}`)
            );
            expect(tuples.size).toBe(1);
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });

    it('SKIPS an unchanged matched record but STILL writes the record map (dirty-skip path)', async () => {
        // Regression for the Fonteva e2e defect: a record matches an existing dest row by KEY FIELD
        // (so ChangeType=Update, MatchedMJRecordID set) but is content-UNCHANGED, so UpdateRecord's
        // dirty-flag fast path returns early (RecordsSkipped++, no write). The bug: that early return
        // ALSO skipped SaveRecordMap, so a matched-but-unmapped record (e.g. dest rows persisted while
        // their record maps were deleted — a maps delete+re-add, or a fresh CompanyIntegration over
        // pre-existing rows) never got its map (re-)established → CompanyIntegrationRecordMap stayed
        // empty, breaking the 1:1 completeness invariant + orphan detection. The fix re-establishes the
        // map on the skip path. The mock target entity reports Dirty=false unless Set() changes a value;
        // here SetEntityFields sets the SAME value it already holds → !Dirty → the skip branch runs.
        const targetEntity = createMockTargetEntity();
        // Pre-seed the dest row's mapped field with the SAME value the incoming record carries, so
        // SetEntityFields produces no change → entity.Dirty === false → the dirty-skip branch is taken.
        targetEntity._data['Name'] = 'Unchanged Contact';
        targetEntity._data['Email'] = 'same@test.com';

        const incoming: ExternalRecord[] = [{
            ExternalID: 'ext-skip-1',
            ObjectType: 'Contact',
            Fields: { Name: 'Unchanged Contact', Email: 'same@test.com' },
            IsDeleted: false,
        }];
        const connector = createMockConnector({
            Records: incoming,
            HasMore: false,
            NewWatermarkValue: '2024-06-15T12:00:00.000Z',
        });

        const companyIntegration = createMockCompanyIntegration();
        const integration = {
            ID: 'int-1',
            Get: vi.fn((f: string) => f === 'ID' ? 'int-1' : null),
            Name: 'TestIntegration',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        mockRunViewsFn.mockResolvedValueOnce([
            { Success: true, Results: [companyIntegration] },
            {
                Success: true,
                Results: [{
                    Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                    ID: 'em-1',
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
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
            const entityName = params['EntityName'] as string;
            if (entityName === 'MJ: Company Integration Field Maps') {
                return {
                    Success: true,
                    Results: [{
                        SourceFieldName: 'Name', DestinationFieldName: 'Name',
                        TransformPipeline: null, IsKeyField: true, Status: 'Active', Priority: 0,
                    } as unknown as ICompanyIntegrationFieldMap],
                };
            }
            if (entityName === 'MJ: Company Integration Sync Watermarks') return { Success: true, Results: [] };
            // FindByKeyFields: the existing dest row matches on Name → resolves to Update.
            if (entityName === 'Contacts') return { Success: true, Results: [{ ID: 'mj-contact-1' }] };
            // No prior map row (the defect scenario: dest row exists, map was lost) → NewRecord() the map.
            if (entityName === 'MJ: Company Integration Record Maps') return { Success: true, Results: [] };
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        // Route GetEntityObject('Contacts') to our pre-seeded entity so the dirty-flag stays false.
        const { Metadata } = await import('@memberjunction/core');
        const provider = (Metadata as unknown as { Provider: { GetEntityObject: (...a: unknown[]) => Promise<unknown> } }).Provider;
        const getEntityObjectOrig = provider.GetEntityObject;
        provider.GetEntityObject = vi.fn(async (entityName: string) => {
            if (entityName === 'Contacts') return targetEntity;
            if (entityName === 'MJ: Company Integration Record Maps') return createMockRecordMapEntity();
            return createMockBookkeepingEntity({ ID: `new-${entityName}-id` });
        }) as unknown as typeof provider.GetEntityObject;

        try {
            const result = await orchestrator.RunSync('ci-1', contextUser);

            // The record was SKIPPED (unchanged), not created or updated.
            expect(result.Success).toBe(true);
            expect(result.RecordsProcessed).toBe(1);
            expect(result.RecordsCreated).toBe(0);
            expect(result.RecordsUpdated).toBe(0);
            expect(result.RecordsSkipped).toBe(1);
            // No write to the dest entity (the whole point of the skip).
            expect(targetSaveCount).toBe(0);

            // ...but the record map MUST STILL be (re-)established for the matched record.
            expect(savedRecordMapRows.length).toBe(1);
            const row = savedRecordMapRows[0];
            expect(row.CompanyIntegrationID).toBe('ci-1');
            expect(row.EntityID).toBe('entity-1');
            expect(row.ExternalSystemRecordID).toBe('ext-skip-1');
            expect(row.EntityRecordID).toBe('mj-contact-1');
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
            provider.GetEntityObject = getEntityObjectOrig;
        }
    });

    it('re-updating the same external record reuses the existing map row (idempotent upsert, still 1:1)', async () => {
        // The SAME external record is updated across TWO separate sync runs. The FIRST run's
        // UpdateRecord creates the map row; the SECOND run's UpdateRecord must LOOK IT UP via
        // SaveRecordMap's upsert-by-identity and REUSE it (Load, not NewRecord) — so the map
        // never duplicates and stays strictly 1:1. (Two separate runs, not two batches in one
        // run, because the engine's duplicate-batch guard halts a run that re-fetches the same
        // ExternalID set twice — which is irrelevant to the record-map dedupe under test.)
        const run1Records: ExternalRecord[] = [{
            ExternalID: 'ext-1',
            ObjectType: 'Contact',
            Fields: { Name: 'Existing Contact', Email: 'v1@test.com' },
            IsDeleted: false,
        }];
        const run2Records: ExternalRecord[] = [{
            ExternalID: 'ext-1',
            ObjectType: 'Contact',
            // Different value so the second run is genuinely dirty (a real write, not a skip).
            Fields: { Name: 'Existing Contact', Email: 'v2@test.com' },
            IsDeleted: false,
        }];

        let runIndex = 0;
        const connector = {
            TestConnection: vi.fn(),
            DiscoverObjects: vi.fn(),
            DiscoverFields: vi.fn(),
            FetchChanges: vi.fn().mockImplementation(async () =>
                ({ Records: runIndex === 1 ? run1Records : run2Records, HasMore: false, NewWatermarkValue: `wm-${runIndex}` })),
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
            Name: 'TestIntegration',
            ClassName: 'TestConnector',
        } as unknown as MJIntegrationEntity;

        // mockResolvedValue (not Once) — both runs reload the same configuration.
        mockRunViewsFn.mockResolvedValue([
            { Success: true, Results: [companyIntegration] },
            {
                Success: true,
                Results: [{
                    Get: vi.fn((f: string) => f === 'ID' ? 'em-1' : null),
                    ID: 'em-1',
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
            { Success: true, Results: [{ DriverClass: 'TestConnector' }] },
        ]);

        // Track whether a record-map row already exists so the SECOND run's SaveRecordMap
        // existence-check returns it (forcing the Load()+reuse branch, not NewRecord()).
        let recordMapExists = false;
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
            if (entityName === 'Contacts') {
                return { Success: true, Results: [{ ID: 'mj-contact-1' }] };
            }
            if (entityName === 'MJ: Company Integration Record Maps') {
                if (recordMapExists) {
                    return { Success: true, Results: [{ ID: 'existing-map-1' }] };
                }
                // First lookup: no row yet — but the upcoming Save will create one.
                recordMapExists = true;
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const { ConnectorFactory } = await import('../ConnectorFactory.js');
        const resolveOrig = ConnectorFactory.Resolve;
        ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);

        try {
            // Run 1 — first sync of ext-1.
            runIndex = 1;
            const r1 = await orchestrator.RunSync('ci-1', contextUser);
            expect(r1.Success).toBe(true);
            expect(r1.RecordsUpdated).toBe(1);

            // Run 2 — re-sync of the same ext-1 (changed value).
            runIndex = 2;
            const r2 = await orchestrator.RunSync('ci-1', contextUser);
            expect(r2.Success).toBe(true);
            expect(r2.RecordsUpdated).toBe(1);

            // Each run's UpdateRecord saved the map → two Save() calls total.
            expect(savedRecordMapRows.length).toBe(2);
            // Run 1's Save created the row; Run 2's Save reused it (isNew=false) — proving
            // the upsert-by-identity dedupe, so the map stays strictly 1:1.
            expect(savedRecordMapRows[0].isNew).toBe(true);
            expect(savedRecordMapRows[1].isNew).toBe(false);

            // Still exactly one logical (CI, Entity, ExternalID) tuple — no drift.
            const tuples = new Set(
                savedRecordMapRows.map(r => `${r.CompanyIntegrationID}|${r.EntityID}|${r.ExternalSystemRecordID}`)
            );
            expect(tuples.size).toBe(1);
            for (const r of savedRecordMapRows) {
                expect(r.ExternalSystemRecordID).toBe('ext-1');
                expect(r.EntityRecordID).toBe('mj-contact-1');
            }
        } finally {
            ConnectorFactory.Resolve = resolveOrig;
        }
    });
});
