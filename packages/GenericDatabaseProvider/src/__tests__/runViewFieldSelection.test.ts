/**
 * SELECT-clause coverage for GenericDatabaseProvider.getRunTimeViewFieldArray /
 * getRunTimeViewFieldString.
 *
 * Why this file exists:
 *
 * The cache-poisoning fix in MJCore (PR for cache-poison-fix branch) gates the
 * Fields-rewriting override in PreRunView/PreRunViews on whether caching will
 * actually happen. The MJCore unit tests prove the gate predicate produces the
 * right `params.Fields` reaching `InternalRunView`. These tests close the loop
 * end-to-end by proving that `getRunTimeViewFieldArray` honors that narrow
 * `params.Fields` to produce a narrow SELECT clause — i.e. the wire promise
 * of the fix (smaller SQL, smaller payload) actually holds.
 *
 * Without these tests, a future refactor of `getRunTimeViewFieldArray` could
 * silently widen the SELECT for non-cached entities and the cache-poison fix
 * would lose its user-visible benefit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import type { RunQueryResult } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';

// Mock sql-formatter (used by SqlLoggingSessionImpl and indirectly imported)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
}));

// ---------------------------------------------------------------------------
// Minimal concrete subclass that exposes the protected methods we want to test
// and lets us inject entity metadata without running Config().
// ---------------------------------------------------------------------------
class FieldSelectionTestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    private _testEntities: EntityInfo[] = [];

    public registerEntity(entity: EntityInfo): void {
        this._testEntities.push(entity);
    }

    // Override the Entities getter so getRunTimeViewFieldArray finds our fixtures.
    public override get Entities(): EntityInfo[] {
        return this._testEntities;
    }

    // --- Abstract member implementations (mirrors TestGenericProvider) ---
    protected get UUIDFunctionPattern(): RegExp { return FieldSelectionTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return FieldSelectionTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    // ProviderBase + DatabaseProviderBase abstract members
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    public async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<{ EntityID: string; PrimaryKey: CompositeKey; RecordName: string }[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey; }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] } as unknown as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as unknown as RecordMergeResult['Request'], KeyValueOfSurvivingRecord: new CompositeKey() } as unknown as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] } as unknown as DatasetResultType;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] } as unknown as DatasetStatusResultType;
    }
    public get InstanceConnectionString(): string { return 'field-selection-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }

    // Test exposers
    public testGetRunTimeViewFieldArray(params: RunViewParams): EntityFieldInfo[] {
        return (this as unknown as { getRunTimeViewFieldArray: (p: RunViewParams, v: null) => EntityFieldInfo[] })
            .getRunTimeViewFieldArray(params, null);
    }
    public testGetRunTimeViewFieldString(params: RunViewParams): string {
        return (this as unknown as { getRunTimeViewFieldString: (p: RunViewParams, v: null) => string })
            .getRunTimeViewFieldString(params, null);
    }
}

// ---------------------------------------------------------------------------
// Field/entity fixtures
// ---------------------------------------------------------------------------
function makeField(name: string, codeName?: string): EntityFieldInfo {
    return {
        Name: name,
        CodeName: codeName ?? name,
    } as unknown as EntityFieldInfo;
}

function makeEntity(name: string, fieldNames: string[], pkNames: string[] = ['ID']): EntityInfo {
    const allFields = fieldNames.map((n) => makeField(n));
    const pks = pkNames.map((n) => allFields.find((f) => f.Name === n) ?? makeField(n));
    return {
        Name: name,
        SchemaName: '__mj',
        BaseView: `vw${name.replace(/\s+/g, '')}`,
        Fields: allFields,
        PrimaryKeys: pks,
        FirstPrimaryKey: pks[0],
        // Mirror the real EntityInfo O(1) field index used by getRunTimeViewFieldArray.
        FieldByName: (n: string) => allFields.find((f) => f.Name.trim().toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: allFields.filter((f) => (f as unknown as { TSType?: unknown }).TSType === 'date'),
    } as unknown as EntityInfo;
}

const FULL_FIELDS = ['ID', 'Name', 'Status', 'Description', 'CreatedAt', 'UpdatedAt'];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GenericDatabaseProvider — getRunTimeViewFieldArray narrow→SELECT proof', () => {
    let provider: FieldSelectionTestProvider;

    beforeEach(() => {
        provider = new FieldSelectionTestProvider();
        provider.registerEntity(makeEntity('Cacheable', FULL_FIELDS));
    });

    describe('Narrow params.Fields produces narrow field list', () => {
        it('Two narrow Fields → field list is exactly those two (PK already among them)', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: ['ID', 'Name'],
            });
            // PK auto-prepended only if missing; ID is in Fields, so no auto-prepend.
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Name']);
        });

        it('Narrow Fields without PK → PK is auto-prepended', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: ['Name', 'Status'],
            });
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Name', 'Status']);
        });

        it('Single non-PK field → list contains PK then that field', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: ['Description'],
            });
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Description']);
        });

        it('SELECT clause for narrow Fields contains only those columns + PK', () => {
            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: ['Name', 'Status'],
            });
            expect(sql).toBe('[ID],[Name],[Status]');
            // Critically: does NOT contain Description, CreatedAt, UpdatedAt
            expect(sql).not.toContain('Description');
            expect(sql).not.toContain('CreatedAt');
            expect(sql).not.toContain('UpdatedAt');
        });
    });

    describe('Wide params.Fields (override-applied scenario) produces full SELECT', () => {
        it('Full Fields list → field list contains all entity fields (no duplicate PK)', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: FULL_FIELDS,  // simulates what the override produces for cacheable entities
            });
            expect(list.map((f) => f.Name)).toEqual(FULL_FIELDS);
        });

        it('SELECT clause for full Fields contains every column', () => {
            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: FULL_FIELDS,
            });
            expect(sql).toBe('[ID],[Name],[Status],[Description],[CreatedAt],[UpdatedAt]');
        });
    });

    describe('Edge cases on params.Fields', () => {
        it('Empty Fields array [] → field list contains only PKs (no entity fields)', () => {
            // Caller passed Fields: [] explicitly. The `if (params.Fields)` check at line 1275
            // is truthy for empty arrays, so the loop runs but adds nothing; only PKs from
            // the auto-prepend block end up in the list.
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: [],
            });
            expect(list.map((f) => f.Name)).toEqual(['ID']);
        });

        it('Empty Fields array [] → SELECT contains only [ID]', () => {
            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: [],
            });
            expect(sql).toBe('[ID]');
        });

        it('Undefined Fields with no viewEntity → empty field list → SELECT is "*"', () => {
            // No Fields, no viewEntity columns → falls through both branches → empty list →
            // getRunTimeViewFieldString returns '*' (line 1251).
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
            });
            expect(list).toEqual([]);

            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
            });
            expect(sql).toBe('*');
        });

        it('Fields with mixed casing matches entity fields case-insensitively, returning canonical names', () => {
            // Lookup at line 1280 is case-insensitive, but what's pushed into the list is
            // the entity's canonical EntityFieldInfo — so .Name comes back in the entity's
            // declared casing, not the caller's input casing.
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: ['id', 'NAME', 'Status'],
            });
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Name', 'Status']);
        });

        it('Fields with whitespace around names is trimmed for matching', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: [' ID ', '  Name  '],
            });
            // The lookup at line 1280 trims; the original passed-in strings aren't sanitized
            // into the result, so what comes back is the entity's canonical Field objects.
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Name']);
        });

        it('Fields containing a non-existent column logs an error and skips it', () => {
            // Production code at line 1282 logs an error for unknown fields but doesn't throw.
            // Result should contain only the resolvable fields + PK.
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'Cacheable',
                Fields: ['ID', 'NotAColumn', 'Name'],
            });
            expect(list.map((f) => f.Name)).toEqual(['ID', 'Name']);
        });
    });

    describe('Composite primary keys', () => {
        beforeEach(() => {
            // Re-create provider with a composite-PK entity
            provider = new FieldSelectionTestProvider();
            provider.registerEntity(makeEntity('CompositePKEntity', ['TenantID', 'RecordID', 'Name', 'Status'], ['TenantID', 'RecordID']));
        });

        it('Composite PK is auto-prepended when missing from Fields', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'CompositePKEntity',
                Fields: ['Name'],
            });
            expect(list.map((f) => f.Name)).toEqual(['TenantID', 'RecordID', 'Name']);
        });

        it('Composite PK partially overlapping Fields → only missing PKs are auto-prepended', () => {
            const list = provider.testGetRunTimeViewFieldArray({
                EntityName: 'CompositePKEntity',
                Fields: ['TenantID', 'Status'],
            });
            // RecordID was missing → auto-prepended; TenantID was already present → not duplicated
            expect(list.map((f) => f.Name)).toEqual(['RecordID', 'TenantID', 'Status']);
        });
    });

    describe('Cache-poison fix end-to-end SELECT proof', () => {
        // These three tests are the user-visible promise of the cache-poison fix:
        // for non-cached entities, narrow Fields → narrow SELECT. The MJCore unit
        // tests prove the gate produces narrow params.Fields; these prove that
        // narrow params.Fields translates to a narrow SELECT clause.

        it('Izzy scenario simulation: narrow Fields on a heavy entity → narrow SELECT (not all 6 columns)', () => {
            // Simulates a Channel-Messages-style entity with multi-MB columns the caller
            // does NOT want on the wire. With AllowCaching=false in the real metadata,
            // ProviderBase's gate skips the override, and params.Fields stays narrow.
            // This SELECT generation honors that.
            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: ['ID', 'Name'],
            });
            expect(sql).toBe('[ID],[Name]');
            // Heavy columns absent
            expect(sql).not.toContain('Description');
        });

        it('Cacheable-entity scenario simulation: override-applied wide Fields → wide SELECT', () => {
            // Simulates ProviderBase's gate firing — params.Fields was rewritten to all
            // entity fields. SELECT must include all of them so the cache entry stores
            // a universal superset (Amith's invariant).
            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: FULL_FIELDS,
            });
            expect(sql).toBe('[ID],[Name],[Status],[Description],[CreatedAt],[UpdatedAt]');
        });

        it('Each call produces a SELECT that exactly matches its params.Fields (no carryover between calls)', () => {
            // Independence check: the method is stateless over consecutive calls.
            const sql1 = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: ['ID', 'Name'],
            });
            const sql2 = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: ['ID', 'Status'],
            });
            const sql3 = provider.testGetRunTimeViewFieldString({
                EntityName: 'Cacheable',
                Fields: FULL_FIELDS,
            });
            expect(sql1).toBe('[ID],[Name]');
            expect(sql2).toBe('[ID],[Status]');
            expect(sql3).toBe('[ID],[Name],[Status],[Description],[CreatedAt],[UpdatedAt]');
        });
    });

    describe('CodeName aliasing in SELECT', () => {
        it('Field with CodeName different from Name produces "[Name] AS [CodeName]" in SELECT', () => {
            // Simulates a renamed field where the entity exposes a different code name
            // than the underlying column. getRunTimeViewFieldString line 1254 generates
            // an AS alias when CodeName !== Name.
            const aliasedFields = [
                makeField('ID'),
                { Name: 'Old Column Name', CodeName: 'NewCodeName' } as unknown as EntityFieldInfo,
            ];
            const e = {
                Name: 'AliasedEntity',
                SchemaName: '__mj',
                BaseView: 'vwAliased',
                Fields: aliasedFields,
                PrimaryKeys: [makeField('ID')],
                FirstPrimaryKey: makeField('ID'),
                FieldByName: (n: string) => aliasedFields.find((f) => f.Name.trim().toLowerCase() === n.trim().toLowerCase()),
            } as unknown as EntityInfo;
            provider = new FieldSelectionTestProvider();
            provider.registerEntity(e);

            const sql = provider.testGetRunTimeViewFieldString({
                EntityName: 'AliasedEntity',
                Fields: ['ID', 'Old Column Name'],
            });
            expect(sql).toBe('[ID],[Old Column Name] AS [NewCodeName]');
        });
    });
});
