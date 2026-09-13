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
 *   - SQL keywords in the search text are ordinary literal content, never a refusal (#4392)
 *   - Non-text fields are skipped
 *   - Unbounded text fields (nvarchar(MAX)) are skipped on non-FTX entities
 *   - Multiple eligible fields produce an OR'd predicate wrapped in parentheses
 *   - FTX path is unchanged when entity.FullTextSearchEnabled === true
 *   - Empty result when no eligible fields
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
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
class SearchSQLTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public buildSQL(entityInfo: EntityInfo, userSearchString: string, contextUser?: UserInfo): string {
        return this.createViewUserSearchSQL(entityInfo, userSearchString, contextUser);
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
    // EntityInfo has a heavy constructor / initialization path; we build a
    // minimal shape via Object.create + property assignment. The SUT only
    // touches FullTextSearchEnabled, FullTextSearchFunction, SchemaName,
    // FirstPrimaryKey?.Name, and Fields.
    const entity = Object.create(EntityInfo.prototype) as EntityInfo;
    // Both `FirstPrimaryKey` and `Fields` are getters on EntityInfo (Fields → _Fields,
    // FirstPrimaryKey → Fields.find(IsPrimaryKey)). We seed the private `_Fields` backing
    // store with a synthetic PK plus the test fields, and the getters resolve naturally.
    // IncludeInUserSearchAPI defaults to null (falsy), so the per-field search loop skips the PK.
    const pkField = new EntityFieldInfo();
    pkField.Name = opts.pkName ?? 'ID';
    pkField.IsPrimaryKey = true;
    Object.assign(entity, {
        FullTextSearchEnabled: !!opts.ftx,
        FullTextSearchFunction: opts.ftxFunction ?? 'fnSearchTest',
        SchemaName: 'crm',
        _Fields: [pkField, ...opts.fields],
    });
    return entity;
}

const provider = new SearchSQLTestProvider();

describe('createViewUserSearchSQL — predicate routing', () => {
    it('Exact emits = N\'term\'', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Code', predicate: 'Exact' })] });
        const sql = provider.buildSQL(e, 'ABC');
        expect(sql).toBe(`(([Code]  = N'ABC'))`);
    });

    it('BeginsWith emits LIKE N\'term%\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'BeginsWith' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'foo%' ESCAPE '\\'))`);
    });

    it('EndsWith emits LIKE N\'%term\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'EndsWith' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'%foo' ESCAPE '\\'))`);
    });

    it('Contains emits LIKE N\'%term%\' with ESCAPE', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
    });

    it('null predicate defaults to Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: null })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
    });

    it('Unknown predicate value also defaults to Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Bogus' })] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
    });
});

describe('createViewUserSearchSQL — escaping', () => {
    it('Single-quote in input is doubled', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, "O'Reilly");
        expect(sql).toBe(`(([Name]  LIKE N'%O''Reilly%' ESCAPE '\\'))`);
    });

    it('LIKE metacharacters %, _, [, ], \\ are escaped on Contains', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, '50%_off[2]\\done');
        // Each metacharacter prefixed with \, raw \ becomes \\
        expect(sql).toBe(`(([Name]  LIKE N'%50\\%\\_off\\[2\\]\\\\done%' ESCAPE '\\'))`);
    });

    it('LIKE metacharacters are escaped on BeginsWith too', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'BeginsWith' })] });
        const sql = provider.buildSQL(e, '50%');
        expect(sql).toBe(`(([Name]  LIKE N'50\\%%' ESCAPE '\\'))`);
    });

    it('Exact does NOT escape LIKE metacharacters (it does not use LIKE)', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Code', predicate: 'Exact' })] });
        const sql = provider.buildSQL(e, '50%');
        expect(sql).toBe(`(([Code]  = N'50%'))`);
    });
});

describe('createViewUserSearchSQL — SQL keywords are ordinary search text (#4392)', () => {
    // UserSearchString used to be screened by ValidateUserProvidedSQLClause, a denylist meant for
    // caller-supplied SQL FRAGMENTS. Word-boundary-matched against free search-box text it refused
    // real searches — "Union Pacific", "Update Request", "drop shipment" — and the grid showed a
    // null error message. The screen is gone; these tests pin what replaces it: the term lands
    // INSIDE a quoted literal with every quote doubled, where no keyword it contains can be parsed
    // as SQL. That is the correct protection for a literal, and it never rejects a real search.

    const keywordTerms = [
        'Union Pacific',
        'Update Request',
        'drop shipment',
        'delete',
        'insert',
        'exec',
        'execute',
        'waitfor',
    ];

    it.each(keywordTerms)('%j is emitted as a literal, not refused', (term) => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, term);
        // The term appears verbatim inside the LIKE literal (no metacharacters in these terms).
        expect(sql).toBe(`(([Name]  LIKE N'%${term}%' ESCAPE '\\'))`);
    });

    it("xp_ prefixed text searches normally (the _ is LIKE-escaped, as any literal underscore is)", () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, 'xp_test');
        expect(sql).toBe(`(([Name]  LIKE N'%xp\\_test%' ESCAPE '\\'))`);
    });

    it('a term carrying a statement terminator stays inside the literal', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, "a; DROP TABLE Users--");
        expect(sql).toBe(`(([Name]  LIKE N'%a; DROP TABLE Users--%' ESCAPE '\\'))`);
        // Exactly two unescaped quotes: the literal's own delimiters. Nothing escaped out.
        expect(sql.replace(/''/g, '').match(/'/g)?.length).toBe(4); // 2 for the literal + 2 for ESCAPE '\'
    });

    it("a quote-breaking payload is neutralized by doubling, not by refusal", () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        const sql = provider.buildSQL(e, "x' OR '1'='1");
        expect(sql).toBe(`(([Name]  LIKE N'%x'' OR ''1''=''1%' ESCAPE '\\'))`);
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
        expect(sql).toBe(`(([Phone]  LIKE '+1' + REPLACE('555 1212', ' ', '')))`);
    });

    it('Custom format wins even on a non-text field that would otherwise be skipped', () => {
        const e = makeEntity({ fields: [makeField({
            name: 'Year',
            type: 'int',
            predicate: 'Contains',
            paramFormat: ' = {0}',
        })] });
        const sql = provider.buildSQL(e, '2026');
        expect(sql).toBe(`(([Year]  = 2026))`);
    });

    /**
     * The search term is end-user input. Substituting it into the `{0}` slot with a
     * string replacement expanded `$$`/`$&`/`` $` ``/`$'` in the term, splicing the
     * format string's own text into the SQL predicate. See issue #3171.
     */
    for (const term of ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b']) {
        it(`Custom format substitutes a term containing ${JSON.stringify(term)} verbatim`, () => {
            const e = makeEntity({ fields: [makeField({
                name: 'Phone',
                predicate: 'Exact',
                paramFormat: " = '{0}'",
            })] });
            const sql = provider.buildSQL(e, term);
            // `'` is SQL-escaped by doubling; `$` must pass through untouched.
            const escaped = term.replace(/'/g, "''");
            expect(sql).toBe(`(([Phone]  = '${escaped}'))`);
        });
    }
});

describe('createViewUserSearchSQL — the custom-format denylist follows field-level security (#4392 + FLS)', () => {
    // The denylist is re-applied only because UserSearchParamFormatAPI may splice the term into
    // SQL unquoted. Field-level security can exclude that very field from the search — and a
    // field that never reaches the SQL cannot carry the term into it. Screening on behalf of an
    // excluded field would refuse ordinary searches ("Union Pacific") for precisely the users
    // with the LEAST access, which is the wrong way round. Participation, not configuration,
    // is what makes the screen necessary.

    /** An entity whose ONLY custom-format field is denied to the caller. */
    function entityWithDeniedCustomFormat(denied: string[]): EntityInfo {
        const e = makeEntity({ fields: [
            makeField({ name: 'Year', type: 'int', predicate: 'Contains', paramFormat: ' = {0}' }),
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        Object.assign(e, {
            EnableFieldLevelSecurity: true,
            GetDeniedReadFields: () => new Set(denied.map(d => d.toLowerCase())),
        });
        return e;
    }

    const someUser = { Email: 'x@y.com' } as unknown as UserInfo;

    it('screens when the custom-format field IS searchable by this user', () => {
        expect(() => provider.buildSQL(entityWithDeniedCustomFormat([]), '2026)) UNION SELECT 1 --', someUser))
            .toThrow(/UserSearchParamFormatAPI/);
    });

    it('does NOT screen when field security excludes the custom-format field', () => {
        // 'Year' is denied, so only the quoted LIKE predicate on 'Name' is built — the term is
        // confined to a literal again and the ordinary-search fix applies.
        const sql = provider.buildSQL(entityWithDeniedCustomFormat(['year']), 'Union Pacific', someUser);
        expect(sql).toBe(`(([Name]  LIKE N'%Union Pacific%' ESCAPE '\\'))`);
        expect(sql).not.toContain('[Year]');
    });

    it('a denied custom-format field also cannot smuggle the term into SQL', () => {
        const sql = provider.buildSQL(entityWithDeniedCustomFormat(['year']), "2026)) UNION SELECT 1 --", someUser);
        // No unquoted splice anywhere: the payload sits inside the LIKE literal on Name.
        expect(sql).not.toContain('[Year]');
        expect(sql).toContain(`LIKE N'%2026)) UNION SELECT 1 --%'`);
    });
});

describe('createViewUserSearchSQL — UserSearchParamFormatAPI still gets the fragment denylist (#4392)', () => {
    // #4392 removed ValidateUserProvidedSQLClause from UserSearchString because the term is
    // normally confined to a string literal. UserSearchParamFormatAPI breaks that premise: the
    // admin-authored format may splice {0} in UNQUOTED (` = {0}` on a numeric field is a
    // supported, tested case just above), and then the term IS SQL. Without the screen,
    // `2026)) UNION SELECT 1,2,3 --` became a UNION injection in the view's WHERE clause.

    const customFormatEntity = () => makeEntity({ fields: [makeField({
        name: 'Year', type: 'int', predicate: 'Contains', paramFormat: ' = {0}',
    })] });

    for (const payload of [
        '2026)) UNION SELECT 1,2,3 --',
        '2026; DROP TABLE Users--',
        '2026) OR 1=1 --',
        "2026 /* comment */",
        '2026; EXEC xp_cmdshell',
    ]) {
        it(`refuses ${JSON.stringify(payload)} when a field splices the term into SQL`, () => {
            expect(() => provider.buildSQL(customFormatEntity(), payload)).toThrow(/UserSearchParamFormatAPI/);
        });
    }

    it('still allows an ordinary term on a custom-format entity', () => {
        expect(provider.buildSQL(customFormatEntity(), '2026')).toBe(`(([Year]  = 2026))`);
    });

    it('a QUOTED custom format keeps working for terms with punctuation', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Phone', predicate: 'Exact', paramFormat: " = '{0}'" })] });
        expect(provider.buildSQL(e, "O'Leary")).toBe(`(([Phone]  = 'O''Leary'))`);
    });

    it('does NOT screen entities without a custom format — that is the #4392 fix', () => {
        const e = makeEntity({ fields: [makeField({ name: 'Name', predicate: 'Contains' })] });
        // "union"/"drop"/";" are ordinary words here; the term lands inside a literal.
        expect(() => provider.buildSQL(e, 'Union Pacific')).not.toThrow();
        expect(() => provider.buildSQL(e, 'drop shipment')).not.toThrow();
        expect(() => provider.buildSQL(e, 'a; b')).not.toThrow();
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
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
    });

    it('Unbounded text fields are skipped on non-FTX entity', () => {
        const e = makeEntity({ fields: [
            makeField({ name: 'Description', type: 'nvarchar', length: -1, predicate: 'Contains' }),
            makeField({ name: 'Notes', type: 'ntext', predicate: 'Contains' }),
            makeField({ name: 'Body', type: 'text', predicate: 'Contains' }),
            makeField({ name: 'Name', predicate: 'Contains' }),
        ] });
        const sql = provider.buildSQL(e, 'foo');
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
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
        expect(sql).toBe(`(([Name]  LIKE N'%foo%' ESCAPE '\\'))`);
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
            `(([FirstName]  LIKE N'%foo%' ESCAPE '\\') OR ` +
            `([LastName]  LIKE N'%foo%' ESCAPE '\\') OR ` +
            `([Email]  LIKE N'foo%' ESCAPE '\\'))`
        );
    });
});

describe('createViewUserSearchSQL — FTX operator detection is word-boundary, not substring (#4392)', () => {
    // As SUBSTRINGS, `OR` matches "C-OR-PORATE" and `AND` matches "ST-AND-ARD", so ordinary
    // two-word searches were emitted as `Corporate%Office`. `%` is not a full-text operator —
    // that is a syntax error, not a search. Only a standalone AND/OR/NOT is an operator.
    const ftsEntity = () => makeEntity({ ftx: true, ftxFunction: 'fnSearchAccount', fields: [] });

    for (const [term, expected] of [
        ['Corporate Office', 'Corporate AND Office'],   // "cORporate" — was Corporate%Office
        ['Standard Rate', 'Standard AND Rate'],         // "stANDard"  — was Standard%Rate
        ['North America', 'North AND America'],         // "nORth"     — was North%America
        ['Marcus Chen', 'Marcus AND Chen'],             // no operator substring — already worked
    ] as [string, string][]) {
        it(`${JSON.stringify(term)} becomes ${JSON.stringify(expected)}`, () => {
            expect(provider.buildSQL(ftsEntity(), term)).toBe(
                `[ID] IN (SELECT [ID] FROM [crm].[fnSearchAccount]('${expected}'))`,
            );
        });
    }

    it('a STANDALONE operator is still honored as a boolean expression', () => {
        const sql = provider.buildSQL(ftsEntity(), 'foo AND bar');
        expect(sql).toContain(' AND ');
        expect(sql).not.toContain('%');
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
