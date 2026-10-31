/**
 * `RecordsSynced` on the watermark row has to be the number of records this run WROTE.
 *
 * Two defects, one counter:
 *
 *  1. It was written as `created + updated + skipped + errored`. An object whose rows were all
 *     content-hash-unchanged reported thousands "synced" having written nothing; an object that
 *     errored every record reported the same number as one that succeeded on every record. Operators
 *     watched it climb for hours against a physical row count that never moved (ACR dev, Vendor
 *     Payment: 10,400 "synced" against 3,150 rows).
 *  2. The write was gated on `batch.HasMore`, i.e. it happened on every batch EXCEPT the last — so an
 *     object that completes in a single page, which is most of them, never wrote the counter at all
 *     and sat at 0 for the life of the connection. The post-loop watermark save does not touch it.
 *
 * These tests drive the real engine through `RunSync()` with a fake connector and a captured
 * watermark row, so the assertion is on the value actually persisted. Harness cloned from
 * IntegrationEngine.safefloor.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
    ICompanyIntegrationSyncWatermark,
} from '../entity-types.js';
import type { BaseIntegrationConnector, FetchBatchResult } from '../BaseIntegrationConnector.js';
import type { ExternalRecord } from '../types.js';
import { IntegrationEngine } from '../IntegrationEngine.js';

/** A valid ISO watermark the fake connector reports on its single page. */
const PAGE_WATERMARK = '2024-06-15T12:00:00.000Z';
/** The watermark the run starts from (a prior clean incremental). */
const PRIOR_WATERMARK = '2024-06-15T09:00:00.000Z';

let mockRunViewsFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockEntityInstances: Map<string, ReturnType<typeof createMockEntity>>;

const fanOutToRunView = async (params: Array<Record<string, unknown>>, contextUser?: unknown) =>
    Promise.all(params.map(p => mockRunViewFn(p, contextUser)));

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
                static Provider: Record<string, unknown>;
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
                ...createOwnershipProviderSurface(),
                BeginTransaction: vi.fn().mockResolvedValue(undefined),
                CommitTransaction: vi.fn().mockResolvedValue(undefined),
                RollbackTransaction: vi.fn().mockResolvedValue(undefined),
                Entities: [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }],
                EntityByName(this: { Entities: Array<{ Name: string }> }, name: string) {
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

const rec = (id: string, name: string): ExternalRecord =>
    ({ ExternalID: id, ObjectType: 'Contact', Fields: { Name: name }, IsDeleted: false });

/**
 * TWO pages — the only shape that reaches the MID-RUN progress write (it is gated on `HasMore`), so
 * it is the only way to pin the arithmetic that write uses rather than the final one.
 */
function twoPageConnector(first: ExternalRecord[], second: ExternalRecord[]): BaseIntegrationConnector {
    let calls = 0;
    return {
        TestConnection: vi.fn(),
        DiscoverObjects: vi.fn(),
        DiscoverFields: vi.fn(),
        FetchChanges: vi.fn().mockImplementation(async (): Promise<FetchBatchResult> => {
            calls++;
            return calls === 1
                ? { Records: first, HasMore: true, NextPage: 2, NewWatermarkValue: PAGE_WATERMARK }
                : { Records: second, HasMore: false, NewWatermarkValue: PAGE_WATERMARK };
        }),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,
    } as unknown as BaseIntegrationConnector;
}

/** ONE page, `HasMore: false` — the shape that never wrote the counter at all. */
function singlePageConnector(records: ExternalRecord[]): BaseIntegrationConnector {
    return {
        TestConnection: vi.fn(),
        DiscoverObjects: vi.fn(),
        DiscoverFields: vi.fn(),
        FetchChanges: vi.fn().mockImplementation(async (): Promise<FetchBatchResult> =>
            ({ Records: records, HasMore: false, NewWatermarkValue: PAGE_WATERMARK })),
        GetDefaultFieldMappings: vi.fn().mockReturnValue([]),
        RateLimitPolicy: null,
        ExtractRetryAfterMs: () => undefined,
        PostProcessRecord: (r: ExternalRecord) => r,
        StableOrderingKey: () => null,   // non-keyset → timestamp watermark path
    } as unknown as BaseIntegrationConnector;
}

/**
 * Wires the run and returns the captured watermark row plus every RecordsSynced value written to it.
 * `nameMaxLength` gives the destination column a width, which is how a record is made to SKIP (a
 * value wider than its column is a per-record skip, never truncation).
 */
function wireRun(opts: { poisonName?: string; nameMaxLength?: number } = {}) {
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

    const recordsSyncedWrites: number[] = [];
    const existingWatermark = {
        ID: 'wm-1',
        EntityMapID: 'em-1',
        Direction: 'Pull' as const,
        WatermarkType: 'Timestamp' as const,
        WatermarkValue: PRIOR_WATERMARK as string | null,
        LastSyncAt: new Date(PRIOR_WATERMARK),
        RecordsSynced: 0,
        Get: vi.fn(),
        Save: vi.fn().mockImplementation(async function (this: { RecordsSynced: number }) {
            recordsSyncedWrites.push(this.RecordsSynced);
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
        return { Success: true, Results: [] };   // no record maps / no key matches → all creates
    });

    return { existingWatermark, recordsSyncedWrites, opts };
}

/** Installs the data-entity behaviour (poison record fails Save; optional column width). */
async function withEntityBehaviour<T>(
    opts: { poisonName?: string; nameMaxLength?: number },
    connector: BaseIntegrationConnector,
    body: () => Promise<T>,
): Promise<T> {
    const { Metadata: MockMetadataClass } = await import('@memberjunction/core');
    const origGetEntity = MockMetadataClass.prototype.GetEntityObject;
    MockMetadataClass.prototype.GetEntityObject = vi.fn().mockImplementation(async (entityName: string) => {
        const entity = createMockEntity({});
        if (entityName === 'Contacts') {
            if (opts.nameMaxLength !== undefined) {
                (entity as unknown as { Fields: unknown }).Fields = [
                    { Name: 'Name', EntityFieldInfo: { Type: 'nvarchar', MaxLength: opts.nameMaxLength } },
                ];
            }
            if (opts.poisonName !== undefined) {
                entity.Save = vi.fn().mockImplementation(async () =>
                    (entity._data['Name'] as string) !== opts.poisonName);
            }
        }
        return entity;
    });
    const { ConnectorFactory } = await import('../ConnectorFactory.js');
    const resolveOrig = ConnectorFactory.Resolve;
    ConnectorFactory.Resolve = vi.fn().mockReturnValue(connector);
    try {
        return await body();
    } finally {
        ConnectorFactory.Resolve = resolveOrig;
        MockMetadataClass.prototype.GetEntityObject = origGetEntity;
    }
}

describe('IntegrationEngine — RecordsSynced counts what was written', () => {
    let engine: IntegrationEngine;

    beforeEach(() => {
        engine = new IntegrationEngine();
        mockEntityInstances = new Map();
        mockRunViewFn = vi.fn();
        mockRunViewsFn = vi.fn(fanOutToRunView);
        (IntegrationEngine as Record<string, unknown>)['activeSyncs'] = new Map();
    });

    it('an object that completes in ONE page still records what it wrote', async () => {
        const connector = singlePageConnector([rec('ext-1', 'A'), rec('ext-2', 'B'), rec('ext-3', 'C')]);
        const { existingWatermark, recordsSyncedWrites } = wireRun();

        const result = await withEntityBehaviour({}, connector, () =>
            engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false }));

        expect(result.RecordsCreated).toBe(3);
        // Before the fix this was the whole bug: HasMore was false on the only batch, so nothing ever
        // wrote the counter and it stayed at its previous value for the life of the connection.
        expect(recordsSyncedWrites).toContain(3);
        expect((existingWatermark as unknown as { RecordsSynced: number }).RecordsSynced).toBe(3);
    });

    it('excludes ERRORED records — a run that wrote two of three says two', async () => {
        const connector = singlePageConnector([
            rec('ext-1', 'A'), rec('ext-2', 'POISON'), rec('ext-3', 'C'),
        ]);
        const { existingWatermark, recordsSyncedWrites } = wireRun();

        const result = await withEntityBehaviour({ poisonName: 'POISON' }, connector, () =>
            engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false }));

        expect(result.RecordsCreated).toBe(2);
        expect(result.RecordsErrored).toBe(1);
        expect((existingWatermark as unknown as { RecordsSynced: number }).RecordsSynced).toBe(2);
        expect(recordsSyncedWrites).not.toContain(3);     // the old arithmetic's answer
    });

    it('excludes SKIPPED records — a value too wide for its column was never written', async () => {
        // A value wider than its column is a per-record SKIP (never truncation), so this run writes
        // one record and skips one. The old counter reported both.
        const connector = singlePageConnector([rec('ext-1', 'AB'), rec('ext-2', 'WAY-TOO-LONG')]);
        const { existingWatermark } = wireRun();

        const result = await withEntityBehaviour({ nameMaxLength: 4 }, connector, () =>
            engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false }));

        expect(result.RecordsCreated).toBe(1);
        expect(result.RecordsSkipped).toBe(1);
        expect((existingWatermark as unknown as { RecordsSynced: number }).RecordsSynced).toBe(1);
    });

    it('the MID-RUN progress write is writes-only too, not the four-outcome sum', async () => {
        // The mid-loop write is gated on HasMore, so only a multi-page object reaches it. Page 1
        // writes one record and errors one; the value persisted between the pages must be 1. The old
        // arithmetic put 2 there, which is the counter operators actually watched climbing.
        const connector = twoPageConnector(
            [rec('ext-1', 'A'), rec('ext-2', 'POISON')],
            [rec('ext-3', 'C')],
        );
        const { recordsSyncedWrites, existingWatermark } = wireRun();

        const result = await withEntityBehaviour({ poisonName: 'POISON' }, connector, () =>
            engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false }));

        expect(result.RecordsCreated).toBe(2);
        expect(result.RecordsErrored).toBe(1);
        // The FIRST write is the one taken between the pages: 1, the record written. The old
        // arithmetic put 2 there (1 created + 1 errored) — the number operators watched climb past
        // the physical row count. The final write is legitimately 2, both records having landed by then.
        expect(recordsSyncedWrites[0]).toBe(1);
        expect((existingWatermark as unknown as { RecordsSynced: number }).RecordsSynced).toBe(2);
    });

    it('records zero — honestly — for a page that yielded no writes at all', async () => {
        const connector = singlePageConnector([rec('ext-1', 'POISON')]);
        const { existingWatermark } = wireRun();

        const result = await withEntityBehaviour({ poisonName: 'POISON' }, connector, () =>
            engine.RunSync('ci-1', contextUser, 'Manual', undefined, undefined, { FullSync: false }));

        expect(result.RecordsErrored).toBe(1);
        expect((existingWatermark as unknown as { RecordsSynced: number }).RecordsSynced).toBe(0);
    });
});
