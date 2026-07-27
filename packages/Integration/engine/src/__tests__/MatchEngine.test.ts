import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationFieldMap, ICompanyIntegrationEntityMap } from '../entity-types.js';
import { MatchEngine } from '../MatchEngine.js';
import type { MappedRecord, ExternalRecord } from '../types.js';

// Track what RunView.RunView returns per test
let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
            // The engine batches its prefetches into one RunViews call. Fanning out to the same
            // per-params mock keeps the filter-aware assertions below meaningful — they still see
            // one call per read, with the read's own params.
            RunViews(params: Array<Record<string, unknown>>, contextUser?: unknown) {
                return Promise.all(params.map(p => mockRunViewFn(p, contextUser)));
            }
        },
        Metadata: class MockMetadata {
            // Multi-provider migration: MatchEngine uses this.ProviderToUse which falls back
            // to Metadata.Provider. Expose a static Provider with the methods/properties the
            // engine needs.
            static Provider = {
                Entities: [{ Name: 'Contacts', FirstPrimaryKey: { Name: 'ID' } }],
                EntityByName(name: string) {
                    return this.Entities.find((e: { Name: string }) => e.Name === name);
                },
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
        },
    };
});

function createMappedRecord(
    overrides: Partial<MappedRecord> = {},
    externalOverrides: Partial<ExternalRecord> = {}
): MappedRecord {
    return {
        ExternalRecord: {
            ExternalID: 'ext-1',
            ObjectType: 'Contact',
            Fields: {},
            IsDeleted: false,
            ...externalOverrides,
        },
        MJEntityName: 'Contacts',
        MappedFields: { Email: 'test@example.com' },
        ChangeType: 'Create',
        ...overrides,
    };
}

function createEntityMap(overrides: Partial<Record<string, unknown>> = {}): ICompanyIntegrationEntityMap {
    return {
        CompanyIntegrationID: 'ci-1',
        EntityID: 'entity-1',
        ConflictResolution: 'SourceWins',
        DeleteBehavior: 'SoftDelete',
        Entity: 'Contacts',
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'em-1';
            return (overrides as Record<string, unknown>)[field] ?? null;
        }),
        ...overrides,
    } as unknown as ICompanyIntegrationEntityMap;
}

function createKeyFieldMap(sourceField: string, destField: string): ICompanyIntegrationFieldMap {
    return {
        SourceFieldName: sourceField,
        DestinationFieldName: destField,
        IsKeyField: true,
        Status: 'Active' as const,
    } as unknown as ICompanyIntegrationFieldMap;
}

const mockContextUser = { ID: 'user-1' } as UserInfo;
const RECORD_MAP_ENTITY = 'MJ: Company Integration Record Maps';

/**
 * Routes the mocked RunView by entity and honors the filter, so tests assert BEHAVIOUR rather
 * than call order. MatchEngine now resolves a whole batch's record-map and identity/key lookups
 * up front (one query each) and only falls back to a per-record query when the batch read
 * neither found the record nor proved it absent — so call-index-based mocks no longer describe
 * what the engine does.
 */
function mockQueries(opts: {
    Entity?: Array<Record<string, unknown>>;
    RecordMap?: Array<{ ExternalSystemRecordID: string; EntityRecordID: string }>;
    Success?: boolean;
}) {
    const inFilter = (filter: string, value: unknown) =>
        typeof value === 'string' && filter.includes(`'${value.replace(/'/g, "''")}'`);

    mockRunViewFn.mockImplementation((params: { EntityName: string; ExtraFilter: string }) => {
        const Success = opts.Success ?? true;
        const rows = params.EntityName === RECORD_MAP_ENTITY
            ? (opts.RecordMap ?? []).filter(r => inFilter(params.ExtraFilter, r.ExternalSystemRecordID))
            : (opts.Entity ?? []).filter(r => Object.values(r).some(v => inFilter(params.ExtraFilter, v)));
        return Promise.resolve({ Success, Results: Success ? rows : [] });
    });
}

/** Args of the Nth query against the destination entity (skipping record-map queries). */
function entityCall(index = 0): { EntityName: string; ExtraFilter: string } {
    const calls = mockRunViewFn.mock.calls
        .map(c => c[0] as { EntityName: string; ExtraFilter: string })
        .filter(p => p.EntityName !== RECORD_MAP_ENTITY);
    return calls[index];
}

/** Count of queries issued against a given entity. */
function queryCount(entityName: string): number {
    return mockRunViewFn.mock.calls
        .filter(c => (c[0] as { EntityName: string }).EntityName === entityName).length;
}

describe('MatchEngine', () => {
    const engine = new MatchEngine();

    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
    });

    it('should classify new records as Create when no match found', async () => {
        const records = [createMappedRecord()];
        const entityMap = createEntityMap();
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Create');
        expect(results[0].MatchedMJRecordID).toBeUndefined();
    });

    it('should classify matched records as Update', async () => {
        // First call: key field match returns existing record
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'mj-record-1' }],
        });

        const records = [createMappedRecord({ MappedFields: { Email: 'test@example.com' } })];
        const entityMap = createEntityMap();
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Update');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-1');
    });

    it('should classify deleted records as Delete when record map entry exists', async () => {
        // Record map lookup returns a match
        mockQueries({
            RecordMap: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-record-2' }],
        });

        const records = [createMappedRecord(
            { ChangeType: 'Delete' },
            { IsDeleted: true }
        )];
        const entityMap = createEntityMap();

        const results = await engine.Resolve(records, entityMap, [], mockContextUser);

        expect(results[0].ChangeType).toBe('Delete');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-2');
    });

    it('should classify deleted records as Skip when no record map entry exists', async () => {
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

        const records = [createMappedRecord(
            { ChangeType: 'Delete' },
            { IsDeleted: true }
        )];
        const entityMap = createEntityMap();

        const results = await engine.Resolve(records, entityMap, [], mockContextUser);

        expect(results[0].ChangeType).toBe('Skip');
    });

    it('should classify as Skip when conflict resolution is Manual and record exists', async () => {
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'mj-record-3' }],
        });

        const records = [createMappedRecord()];
        const entityMap = createEntityMap({ ConflictResolution: 'Manual' });
        const fieldMaps = [createKeyFieldMap('Email', 'Email')];

        const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

        expect(results[0].ChangeType).toBe('Skip');
        expect(results[0].MatchedMJRecordID).toBe('mj-record-3');
    });

    describe('multiple key fields', () => {
        it('should match on multiple key fields combined with AND', async () => {
            mockQueries({
                Entity: [{ ID: 'mj-multi-key', Email: 'test@example.com', CompanyName: 'Acme' }],
            });

            const records = [createMappedRecord({
                MappedFields: { Email: 'test@example.com', CompanyName: 'Acme' },
            })];
            const entityMap = createEntityMap();
            const fieldMaps = [
                createKeyFieldMap('Email', 'Email'),
                createKeyFieldMap('Company', 'CompanyName'),
            ];

            const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Update');
            expect(results[0].MatchedMJRecordID).toBe('mj-multi-key');

            const callArgs = entityCall();
            // ANSI double-quoted identifiers — portable across dialects (QUOTED_IDENTIFIER ON on
            // SQL Server, standard on Postgres) and safe for reserved-word columns (e.g. `open`).
            // SQL-Server square brackets are NOT used — they break Postgres.
            expect(callArgs.ExtraFilter).toContain('"Email" =');
            expect(callArgs.ExtraFilter).toContain('"CompanyName" =');
            expect(callArgs.ExtraFilter).not.toContain('[Email]');
            expect(callArgs.ExtraFilter).toContain('AND');
        });
    });

    describe('partial key match', () => {
        it('should skip null key field values in filter', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const records = [createMappedRecord({
                MappedFields: { Email: null as unknown as string },
            })];
            const entityMap = createEntityMap();
            const fieldMaps = [createKeyFieldMap('Email', 'Email')];

            const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Create');
        });
    });

    describe('record map fallback', () => {
        it('should fall back to record map when key field match fails', async () => {
            mockQueries({
                Entity: [],
                RecordMap: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-from-map' }],
            });

            const records = [createMappedRecord()];
            const entityMap = createEntityMap();
            const fieldMaps = [createKeyFieldMap('Email', 'Email')];

            const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Update');
            expect(results[0].MatchedMJRecordID).toBe('mj-from-map');
        });
    });

    describe('no key fields', () => {
        it('should use only record map when no key fields are defined', async () => {
            mockQueries({
                RecordMap: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-record-map-only' }],
            });

            const records = [createMappedRecord()];
            const entityMap = createEntityMap();
            const noKeyFieldMaps: ICompanyIntegrationFieldMap[] = [];

            const results = await engine.Resolve(records, entityMap, noKeyFieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Update');
            expect(results[0].MatchedMJRecordID).toBe('mj-record-map-only');
        });
    });

    describe('multiple records', () => {
        it('should process multiple records independently', async () => {
            mockQueries({ Entity: [{ ID: 'mj-1', Email: 'a@test.com' }] });

            const records = [
                createMappedRecord({ MappedFields: { Email: 'a@test.com' } }, { ExternalID: 'ext-a' }),
                createMappedRecord({ MappedFields: { Email: 'b@test.com' } }, { ExternalID: 'ext-b' }),
            ];
            const entityMap = createEntityMap();
            const fieldMaps = [createKeyFieldMap('Email', 'Email')];

            const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Update');
            expect(results[0].MatchedMJRecordID).toBe('mj-1');
            expect(results[1].ChangeType).toBe('Create');
        });
    });

    describe('batched identity lookups', () => {
        it('resolves a whole batch with one record-map query and one entity query', async () => {
            mockQueries({
                Entity: [
                    { ID: 'mj-1', Email: 'a@test.com' },
                    { ID: 'mj-2', Email: 'b@test.com' },
                    { ID: 'mj-3', Email: 'c@test.com' },
                ],
            });

            const records = ['a', 'b', 'c'].map(letter => createMappedRecord(
                { MappedFields: { Email: `${letter}@test.com` } },
                { ExternalID: `ext-${letter}` }
            ));

            const results = await engine.Resolve(records, createEntityMap(), [createKeyFieldMap('Email', 'Email')], mockContextUser);

            expect(results.map(r => r.MatchedMJRecordID)).toEqual(['mj-1', 'mj-2', 'mj-3']);
            expect(queryCount('Contacts')).toBe(1);
            // Every record matched in the batch read, so no map fallback was needed either.
            expect(queryCount(RECORD_MAP_ENTITY)).toBe(1);
        });

        it('proves absence for the batch when nothing matches — no per-record fallback', async () => {
            mockQueries({ Entity: [] });

            const records = ['a', 'b', 'c'].map(letter => createMappedRecord(
                { MappedFields: { Email: `${letter}@test.com` } },
                { ExternalID: `ext-${letter}` }
            ));

            const results = await engine.Resolve(records, createEntityMap(), [createKeyFieldMap('Email', 'Email')], mockContextUser);

            expect(results.every(r => r.ChangeType === 'Create')).toBe(true);
            expect(queryCount('Contacts')).toBe(1);
        });

        it('falls back per-record only for records the batch read did not attribute', async () => {
            // 'a' matches in the batch read; 'b' does not — and because the batch DID return a
            // row, absence is not inferred for 'b', so 'b' alone re-queries.
            mockQueries({ Entity: [{ ID: 'mj-1', Email: 'a@test.com' }] });

            const records = ['a', 'b'].map(letter => createMappedRecord(
                { MappedFields: { Email: `${letter}@test.com` } },
                { ExternalID: `ext-${letter}` }
            ));

            await engine.Resolve(records, createEntityMap(), [createKeyFieldMap('Email', 'Email')], mockContextUser);

            expect(queryCount('Contacts')).toBe(2); // 1 batch + 1 fallback, not 1 per record
            expect(entityCall(1).ExtraFilter).toContain("'b@test.com'");
            expect(entityCall(1).ExtraFilter).not.toContain("'a@test.com'");
        });

        it('falls back to the per-record path when the batch read fails', async () => {
            mockQueries({ Success: false });

            const records = [createMappedRecord()];
            const results = await engine.Resolve(records, createEntityMap(), [createKeyFieldMap('Email', 'Email')], mockContextUser);

            // A failed batch read must NOT be read as "no record exists" — that would create a duplicate.
            expect(results[0].ChangeType).toBe('Create'); // per-record read also failed here
            expect(queryCount('Contacts')).toBe(2); // batch attempt + per-record fallback
        });
    });

    describe('RunView failure handling', () => {
        it('should treat failed RunView as no match (Create)', async () => {
            mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'DB Error' });

            const records = [createMappedRecord()];
            const entityMap = createEntityMap();
            const fieldMaps = [createKeyFieldMap('Email', 'Email')];

            const results = await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(results[0].ChangeType).toBe('Create');
        });
    });

    describe('SQL injection prevention', () => {
        it('should escape single quotes in key field values', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const records = [createMappedRecord({
                MappedFields: { Email: "o'reilly@test.com" },
            })];
            const entityMap = createEntityMap();
            const fieldMaps = [createKeyFieldMap('Email', 'Email')];

            await engine.Resolve(records, entityMap, fieldMaps, mockContextUser);

            expect(entityCall().ExtraFilter).toContain("o''reilly@test.com");
        });
    });

    /**
     * The batched record-map read is the ONLY place a "no mapping exists" answer is now produced
     * without asking the database about that specific ID — and a wrong "no mapping" is a duplicate
     * CREATE against a live external system. These pin the two comparisons apart.
     */
    describe('record-map batch lookup vs. the database\'s own comparison', () => {
        it('matches a mapping the database returned under a different casing', async () => {
            // Requested 'EXT-1'; a case-insensitive collation matched and returned the stored
            // 'ext-1'. Pairing the result up with === would miss it and re-create the record.
            mockRunViewFn.mockImplementation((params: { EntityName: string }) =>
                Promise.resolve(params.EntityName === RECORD_MAP_ENTITY
                    ? { Success: true, Results: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1' }] }
                    : { Success: true, Results: [] }));

            const records = [createMappedRecord({}, { ExternalID: 'EXT-1' })];
            const results = await engine.Resolve(records, createEntityMap(), [], mockContextUser);

            expect(results[0].ChangeType).toBe('Update');
            expect(results[0].MatchedMJRecordID).toBe('mj-1');
        });

        it('matches across trailing whitespace, which SQL Server ignores in `=`', async () => {
            mockRunViewFn.mockImplementation((params: { EntityName: string }) =>
                Promise.resolve(params.EntityName === RECORD_MAP_ENTITY
                    ? { Success: true, Results: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1' }] }
                    : { Success: true, Results: [] }));

            const records = [createMappedRecord({}, { ExternalID: 'ext-1  ' })];
            const results = await engine.Resolve(records, createEntityMap(), [], mockContextUser);

            expect(results[0].MatchedMJRecordID).toBe('mj-1');
        });

        it('does NOT invent a match when the folded ID is genuinely different', async () => {
            mockRunViewFn.mockImplementation((params: { EntityName: string }) =>
                Promise.resolve(params.EntityName === RECORD_MAP_ENTITY
                    ? { Success: true, Results: [{ ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1' }] }
                    : { Success: true, Results: [] }));

            const records = [createMappedRecord({}, { ExternalID: 'ext-2' })];
            const results = await engine.Resolve(records, createEntityMap(), [], mockContextUser);

            expect(results[0].ChangeType).toBe('Create');
        });

        it('asks the database itself when a fold is ambiguous, rather than guessing', async () => {
            // Two stored IDs fold to the same key but point at different MJ records. The index
            // cannot say which one a requested 'EXT-1' meant — so it must not answer at all.
            const batchRows = [
                { ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1' },
                { ExternalSystemRecordID: 'Ext-1', EntityRecordID: 'mj-2' },
            ];
            mockRunViewFn.mockImplementation((params: { EntityName: string; MaxRows?: number }) => {
                if (params.EntityName !== RECORD_MAP_ENTITY) return Promise.resolve({ Success: true, Results: [] });
                // MaxRows:1 identifies the per-record fallback query; it is the database's answer.
                return Promise.resolve(params.MaxRows === 1
                    ? { Success: true, Results: [{ EntityRecordID: 'mj-2' }] }
                    : { Success: true, Results: batchRows });
            });

            const records = [createMappedRecord({}, { ExternalID: 'EXT-1' })];
            const results = await engine.Resolve(records, createEntityMap(), [], mockContextUser);

            expect(queryCount(RECORD_MAP_ENTITY)).toBe(2);   // batch read + the fallback it could not answer
            expect(results[0].MatchedMJRecordID).toBe('mj-2');
        });

        it('still resolves each ID exactly when both casings are present', async () => {
            mockRunViewFn.mockImplementation((params: { EntityName: string }) =>
                Promise.resolve(params.EntityName === RECORD_MAP_ENTITY
                    ? { Success: true, Results: [
                        { ExternalSystemRecordID: 'ext-1', EntityRecordID: 'mj-1' },
                        { ExternalSystemRecordID: 'Ext-1', EntityRecordID: 'mj-2' },
                    ] }
                    : { Success: true, Results: [] }));

            const records = [
                createMappedRecord({}, { ExternalID: 'ext-1' }),
                createMappedRecord({}, { ExternalID: 'Ext-1' }),
            ];
            const results = await engine.Resolve(records, createEntityMap(), [], mockContextUser);

            expect(results[0].MatchedMJRecordID).toBe('mj-1');
            expect(results[1].MatchedMJRecordID).toBe('mj-2');
        });
    });
});
