/**
 * Composite-primary-key SQL shape for the view pipeline's PK-derived fragments.
 *
 * MJ entities can have any primary key — `ID`, `individual_id`, or a composite `(OrderID, LineNo)`.
 * Every core entity uses a single `ID`, so code that reads only the FIRST key column works on the
 * whole core product and silently truncates a composite key on customer entities. Two helpers own
 * that concern for RunView:
 *
 *   - buildPrimaryKeyOrderBy — the determinism fallback `ORDER BY` for row-limited queries with no
 *     caller ordering. It must list EVERY key column (a composite key ordered by its first column
 *     alone leaves rows sharing that value in undefined order) and must stay byte-identical to the
 *     previous `ORDER BY <first pk>` for single-column keys.
 *   - assertSingleColumnPrimaryKey — the guard for features that store/compare ONE bare key value
 *     per row (user view run exclusion, the `{%UserView%}` template's `IN (subquery)`). Composite
 *     keys must be refused loudly rather than matched on one column.
 */
import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
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
import type { RunQueryResult } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';

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
// Minimal concrete subclass exposing the two protected helpers under test.
// Patterned after SearchSQLTestProvider in createViewUserSearchSQL.test.ts.
// ---------------------------------------------------------------------------
class PrimaryKeyShapeTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public orderBy(entityInfo: EntityInfo): string {
        return this.buildPrimaryKeyOrderBy(entityInfo);
    }
    public assertSingle(entityInfo: EntityInfo, feature: string): void {
        this.assertSingleColumnPrimaryKey(entityInfo, feature);
    }

    // --- Abstract-member implementations (just enough to satisfy the type system) ---
    protected get UUIDFunctionPattern(): RegExp { return PrimaryKeyShapeTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return PrimaryKeyShapeTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'primary-key-shape-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        };
    }
}

// ---------------------------------------------------------------------------
// Fixtures — only the members the helpers read.
// ---------------------------------------------------------------------------
function makeEntity(name: string, pkNames: string[]): EntityInfo {
    const pks = pkNames.map((n) => ({ Name: n } as unknown as EntityFieldInfo));
    return {
        Name: name,
        PrimaryKeys: pks,
        FirstPrimaryKey: pks[0],
    } as unknown as EntityInfo;
}

describe('buildPrimaryKeyOrderBy — determinism fallback ORDER BY', () => {
    const provider = new PrimaryKeyShapeTestProvider();

    it('single-column key renders exactly the quoted first key — byte-identical to the former `ORDER BY <first pk>`', () => {
        const entity = makeEntity('Widgets', ['ID']);
        expect(provider.orderBy(entity)).toBe('[ID]');
        expect(provider.orderBy(entity)).toBe(provider.QuoteIdentifier(entity.FirstPrimaryKey.Name));
    });

    it('single-column key with a non-ID name uses that name, never a hardcoded ID', () => {
        expect(provider.orderBy(makeEntity('Individuals', ['individual_id']))).toBe('[individual_id]');
    });

    it('composite key lists EVERY key column, in key order', () => {
        expect(provider.orderBy(makeEntity('Order Lines', ['OrderID', 'LineNo']))).toBe('[OrderID], [LineNo]');
    });

    it('three-column key is fully enumerated', () => {
        expect(provider.orderBy(makeEntity('Cells', ['TenantID', 'SheetID', 'CellRef']))).toBe('[TenantID], [SheetID], [CellRef]');
    });
});

describe('assertSingleColumnPrimaryKey — one-bare-key-value features refuse composite keys', () => {
    const provider = new PrimaryKeyShapeTestProvider();

    it('accepts a single-column key silently', () => {
        expect(() => provider.assertSingle(makeEntity('Widgets', ['ID']), 'ExcludeUserViewRunID')).not.toThrow();
        expect(() => provider.assertSingle(makeEntity('Individuals', ['individual_id']), 'ExcludeUserViewRunID')).not.toThrow();
    });

    it('rejects a composite key, naming the feature, the entity, and every key column', () => {
        expect(() => provider.assertSingle(makeEntity('Order Lines', ['OrderID', 'LineNo']), 'ExcludeUserViewRunID / ExcludeDataFromAllPriorViewRuns'))
            .toThrow(/ExcludeUserViewRunID \/ ExcludeDataFromAllPriorViewRuns requires a single-column primary key\. Entity "Order Lines" has 2 primary key columns \(OrderID, LineNo\)\./);
    });

    it('rejects an entity with no primary key at all', () => {
        expect(() => provider.assertSingle(makeEntity('Keyless', []), 'The {%UserView%} template variable'))
            .toThrow(/has 0 primary key columns/);
    });
});
