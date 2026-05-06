/**
 * Tests for GenericDatabaseProvider.createViewUserSearchSQL — the single function
 * that builds the WHERE-clause fragment for RunView's UserSearchString feature.
 *
 * Coverage:
 *   - Predicate honors UserSearchPredicateAPI (Exact / BeginsWith / EndsWith / Contains)
 *   - Default (null/undefined predicate) falls back to Contains
 *   - UserSearchParamFormatAPI overrides the predicate path
 *   - LIKE metacharacters (%, _, [, ], \) are escaped with ESCAPE '\'
 *   - Single-quote escaping is preserved on Exact (which doesn't use LIKE escaping)
 *   - Non-text fields are skipped
 *   - Unbounded text fields (nvarchar(MAX)) are skipped on non-FTX entities
 *   - Multiple eligible fields produce an OR'd predicate wrapped in parentheses
 *   - FTX path is unchanged when entity.FullTextSearchEnabled === true
 *   - Empty result when no eligible fields
 */

import { describe, it, expect, vi } from 'vitest';
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
// Minimal concrete subclass that exposes the protected method we want to test.
// Patterned after FieldSelectionTestProvider in runViewFieldSelection.test.ts.
// ---------------------------------------------------------------------------
class SearchSQLTestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public buildSQL(entityInfo: EntityInfo, userSearchString: string): string {
        return this.createViewUserSearchSQL(entityInfo, userSearchString);
    }

    // --- Abstract-member implementations (just enough to satisfy the type system) ---
    protected get UUIDFunctionPattern(): RegExp { return SearchSQLTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return SearchSQLTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'search-sql-test'; }
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
// EntityInfo / EntityFieldInfo factories. We only set the fields the SUT reads
// to keep the fixtures legible — everything else is left at the class default.
// ---------------------------------------------------------------------------

interface FieldOpts {
    name: string;
    type?: string;
    length?: number;
    include?: boolean;
    predicate?: string | null | undefined;
    paramFormat?: string;
}

function makeField(opts: FieldOpts): EntityFieldInfo {
    const f = new EntityFieldInfo();
    f.Name = opts.name;
    f.Type = opts.type ?? 'nvarchar';
    f.Length = opts.length ?? 200;
    f.IncludeInUserSearchAPI = opts.include ?? true;
    f.UserSearchPredicateAPI = opts.predicate === undefined ? 'Contains' : (opts.predicate as string);
    f.UserSearchParamFormatAPI = opts.paramFormat ?? null;
    return f;
}

function makeEntity(opts: { ftx?: boolean; ftxFunction?: string; pkName?: string; fields: EntityFieldInfo[] }): EntityInfo {
    // EntityInfo has a heavy constructor / initialization path AND a `FirstPrimaryKey`
    // getter on its prototype, so `Object.create(EntityInfo.prototype) + Object.assign`
    // would throw on the FirstPrimaryKey override. Build a plain object cast to
    // EntityInfo instead — the SUT only touches FullTextSearchEnabled,
    // FullTextSearchFunction, SchemaName, FirstPrimaryKey?.Name, and Fields.
    return {
        FullTextSearchEnabled: !!opts.ftx,
        FullTextSearchFunction: opts.ftxFunction ?? 'fnSearchTest',
        SchemaName: 'crm',
        FirstPrimaryKey: { Name: opts.pkName ?? 'ID' },
        Fields: opts.fields,
    } as unknown as EntityInfo;
}

const provider = new SearchSQLTestProvider();

describe('createViewUserSearchSQL — predicate routing', () => {
    it('Exact emits = N\'term\'', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Code', predicate: 'Exact' })] });
        const sql = provider.buildSQL(e, 'ABC');
        expect(sql).toBe(`([Code]  = N'ABC')`);
    });

    it('BeginsWith emits LIKE N\'term%\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'BeginsWith' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'foo%' ESCAPE '\\')`);
    });

    it('EndsWith emits LIKE N\'%term\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'EndsWith' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo' ESCAPE '\\')`);
    });

    it('Contains emits LIKE N\'%term%\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });

    it('null predicate defaults to Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: null })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });

    it('Unknown predicate value also defaults to Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Bogus' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });
});

describe('createViewUserSearchSQL — escaping', () => {
    it('Single-quote in input is doubled', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, "O'Reilly");
        expect(sql).toBe(`([Name]  LIKE N'%O''Reilly%' ESCAPE '\\')`);
    });

    it('LIKE metacharacters %, _, [, ], \\ are escaped on Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, '50%_off[2]\\done');
        // Each metacharacter prefixed with \, raw \ becomes \\
        expect(sql).toBe(`([Name]  LIKE N'%50\\%\\_off\\[2\\]\\\\done%' ESCAPE '\\')`);
    });

    it('LIKE metacharacters are escaped on BeginsWith too', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'BeginsWith' })] });
        const sql = provider.buildSQL(e, '50%');
        expect(sql).toBe(`([Name]  LIKE N'50\\%%' ESCAPE '\\')`);
    });

    it('Exact does NOT escape LIKE metacharacters (it does not use LIKE)', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Code', predicate: 'Exact' })] });
        const sql = provider.buildSQL(e, '50%');
        expect(sql).toBe(`([Code]  = N'50%')`);
    });
});

describe('createViewUserSearchSQL — UserSearchParamFormatAPI override', () => {
    it('Custom format wins over predicate', () => {
        const e = makeEntity({ fields: [makeField({
            name: 'Phone',
            predicate: 'Exact',
            paramFormat: " LIKE '+1' + REPLACE('{0}', ' ', '')",
        })] });
        const sql = provider.buildSQL(e, '555 1212');
        // {0} is replaced with the single-quote-escaped raw term (no LIKE escaping)
        expect(sql).toBe(`([Phone]  LIKE '+1' + REPLACE('555 1212', ' ', ''))`);
    });

    it('Custom format wins even on a non-text field that would otherwise be skipped', () => {
        const e = makeEntity({ fields: [makeField({
            name: 'Year',
            type: 'int',
            predicate: 'Contains',
            paramFormat: ' = {0}',
        })] });
        const sql = provider.buildSQL(e, '2026');
        expect(sql).toBe(`([Year]  = 2026)`);
    });
});

describe('createViewUserSearchSQL — type guards', () => {
    it('Non-text fields (int, uniqueidentifier, etc.) are skipped', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'ID', type: 'uniqueidentifier', predicate: 'Contains' }),
            makeField({ name: 'YearAge', type: 'int', predicate: 'Contains' }),
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });

    it('Unbounded text fields are skipped on non-FTX entity', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'Description', type: 'nvarchar', length: -1, predicate: 'Contains' }),
            makeField({ name: 'Notes', type: 'ntext', predicate: 'Contains' }),
            makeField({ name: 'Body', type: 'text', predicate: 'Contains' }),
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });

    it('Returns empty when no field is eligible', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'ID', type: 'uniqueidentifier', predicate: 'Contains' }),
            makeField({ name: 'Year', type: 'int', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe('');
    });

    it('IncludeInUserSearchAPI=false is skipped even on a text field', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'Hidden', predicate: 'Contains', include: false }),
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`([Name]  LIKE N'%foo%' ESCAPE '\\')`);
    });
});

describe('createViewUserSearchSQL — multiple fields', () => {
    it('OR-joins eligible fields and wraps in outer parentheses', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'FirstName', predicate: 'Contains' }),
            makeField({ name: 'LastName', predicate: 'Contains' }),
            makeField({ name: 'Email', predicate: 'BeginsWith' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(
            `([FirstName]  LIKE N'%foo%' ESCAPE '\\' OR ` +
            `[LastName]  LIKE N'%foo%' ESCAPE '\\' OR ` +
            `[Email]  LIKE N'foo%' ESCAPE '\\')`
        );
    });
});

describe('createViewUserSearchSQL — FTX path is unchanged', () => {
    it('FTX-enabled entity routes through fnSearch<Entity> with single-word term', () => {
        const e = makeEntity({ ftx: true, ftxFunction: 'fnSearchAccount', fields: [
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'inc');
        expect(sql).toBe(`[ID] IN (SELECT [ID] FROM [crm].[fnSearchAccount]('inc'))`);
    });

    it('FTX-enabled entity preserves explicit boolean operators in input', () => {
        const e = makeEntity({ ftx: true, ftxFunction: 'fnSearchAccount', fields: [] });
        const sql = provider.buildSQL(e, 'foo AND bar');
        expect(sql).toContain('fnSearchAccount');
        expect(sql).toContain(' AND ');
    });
});
