/**
 * Unit tests for MJQueryEntityServer's deferred derived-data path.
 *
 * MJ: Queries derives its own children — parameters, fields, entities, dependencies — from its
 * SQL, inside Save(). A caller that ALSO authors those children (`mj sync push` declaring
 * MJ: Query Parameters rows under the query) cannot write them before the parent, because they
 * carry its foreign key. Extraction inside Save() would therefore create its own copies first and
 * the authored INSERT would then violate UQ_QueryParameter_QueryID_Name.
 *
 * DeferDerivedData is how such a caller says "not yet": Save() records what it owes and the caller
 * runs it via ProcessDeferredDerivedData once the whole graph is written. These tests exercise that
 * orchestration; the extraction pipeline itself is mocked.
 *
 * See MemberJunction/MJ#4545.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator, keep MJGlobal controllable.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

const runExtractionPipelineMock = vi.fn(async () => ({ usesTemplate: true }));
const cleanupQueryDataMock = vi.fn(async () => undefined);
vi.mock('../custom/query-extraction', () => ({
    RunExtractionPipeline: (...args: unknown[]) => runExtractionPipelineMock(...args),
    CleanupQueryData: (...args: unknown[]) => cleanupQueryDataMock(...args),
    ConvertTSQLToPostgreSQL: (sql: string) => sql,
}));

vi.mock('../custom/util', () => ({
    EmbedTextLocalHelper: async () => ({ vector: [], modelID: null }),
}));

vi.mock('@memberjunction/sql-parser', () => ({
    SQLParser: { ExtractSelectColumns: () => [] },
}));
vi.mock('@memberjunction/sql-dialect', () => ({ GetDialect: () => ({}) }));
vi.mock('@memberjunction/generic-database-provider', () => ({ resolveDbPlatformFromEnv: () => 'sqlserver' }));

// Settable base standing in for the generated/extended Query entity plus the BaseEntity
// members the subclass relies on. `Save` here is the "super.Save" the subclass calls.
const superSaveMock = vi.fn(async () => true);
vi.mock('@memberjunction/core-entities', () => {
    class MockMJQueryEntityExtended {
        public ID = 'query-1';
        public Name = 'Test Query';
        public Description: string | null = null;
        public UserQuestion: string | null = null;
        public SQL: string | null = 'SELECT 1 FROM T WHERE X = {{ CompanyIDs }}';
        public UsesTemplate = false;
        public EmbeddingVector: string | null = null;
        public EmbeddingModelID: string | null = null;
        public IsSaved = false;
        public SQLDialectID: string | null = null;
        public ContextCurrentUser: unknown = null;
        public DeferDerivedData = false;

        public GetFieldByName(): { Dirty: boolean } {
            return { Dirty: false };
        }
        public GetPlatformSQL(): string | null {
            return this.SQL;
        }
        public get ProviderToUse(): unknown {
            return { Entities: [] };
        }
        public get RunViewProviderToUse(): unknown {
            return {};
        }
        public async Save(options?: unknown): Promise<boolean> {
            return superSaveMock(options);
        }
        public async ProcessDeferredDerivedData(): Promise<void> {
            // BaseEntity's no-op
        }
    }
    class MockMJQuerySQLEntity {
        public ID = 'querysql-1';
        public QueryID = 'query-1';
        public SQLDialectID: string | null = null;
        public ContextCurrentUser: unknown = null;
        public DeferDerivedData = false;
        public async Save(): Promise<boolean> {
            return true;
        }
        public async ProcessDeferredDerivedData(): Promise<void> {
            // BaseEntity's no-op
        }
    }
    return {
        MJQueryEntityExtended: MockMJQueryEntityExtended,
        MJQuerySQLEntity: MockMJQuerySQLEntity,
        QueryEngine: { Instance: { Queries: [], QuerySQLs: [], SQLDialects: [], Config: async () => undefined } },
    };
});

const { MJQueryEntityServer } = await import('../custom/MJQueryEntityServer.server');

describe('MJQueryEntityServer — DeferDerivedData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs extraction inside Save() by default', async () => {
        const query = new MJQueryEntityServer();

        expect(await query.Save()).toBe(true);
        expect(runExtractionPipelineMock).toHaveBeenCalledTimes(1);
    });

    it('does not run extraction inside Save() when derived data is deferred', async () => {
        const query = new MJQueryEntityServer();
        query.DeferDerivedData = true;

        expect(await query.Save()).toBe(true);
        expect(runExtractionPipelineMock).not.toHaveBeenCalled();
    });

    it('runs the deferred extraction when the caller asks for it', async () => {
        const query = new MJQueryEntityServer();
        query.DeferDerivedData = true;
        await query.Save();

        await query.ProcessDeferredDerivedData();

        expect(runExtractionPipelineMock).toHaveBeenCalledTimes(1);
    });

    it('runs deferred work once — a second call is a no-op', async () => {
        const query = new MJQueryEntityServer();
        query.DeferDerivedData = true;
        await query.Save();

        await query.ProcessDeferredDerivedData();
        await query.ProcessDeferredDerivedData();

        expect(runExtractionPipelineMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no save deferred any work', async () => {
        const query = new MJQueryEntityServer();

        await query.ProcessDeferredDerivedData();

        expect(runExtractionPipelineMock).not.toHaveBeenCalled();
        expect(cleanupQueryDataMock).not.toHaveBeenCalled();
    });

    it('defers cleanup for a query whose SQL is empty', async () => {
        const query = new MJQueryEntityServer();
        query.SQL = '';
        query.DeferDerivedData = true;

        await query.Save();
        expect(cleanupQueryDataMock).not.toHaveBeenCalled();

        await query.ProcessDeferredDerivedData();
        expect(cleanupQueryDataMock).toHaveBeenCalledTimes(1);
    });
});

// ═══════════════════════════════════════════════════
// MJ: Query SQLs triggers the SAME parent extraction
// when a dialect variant is saved, so it is subject to
// the same deferral — otherwise a query that declares
// both a SQL variant and its parameters reopens the
// collision the deferral exists to prevent.
// ═══════════════════════════════════════════════════

const { MJQuerySQLEntityServer } = await import('../custom/MJQuerySQLEntityServer.server');

/** Minimal stand-in for the parent query the QuerySQL record re-extracts. */
function stubQuerySQL(deferred: boolean): {
    entity: InstanceType<typeof MJQuerySQLEntityServer>;
    rerunCount: () => number;
} {
    let rerun = 0;
    const entity = new MJQuerySQLEntityServer();
    // The dialect/parent resolution is covered by MJQuerySQLEntityServer's own tests; here we
    // only care WHEN the re-extraction fires, so stand in for the whole resolution step.
    Object.defineProperty(entity, 'triggerParentExtractionIfDialectMatches', {
        value: async () => {
            rerun++;
        },
    });
    entity.DeferDerivedData = deferred;
    return { entity, rerunCount: () => rerun };
}

describe('MJQuerySQLEntityServer — DeferDerivedData', () => {
    it('re-extracts the parent inside Save() by default', async () => {
        const { entity, rerunCount } = stubQuerySQL(false);

        expect(await entity.Save()).toBe(true);
        expect(rerunCount()).toBe(1);
    });

    it('does not re-extract the parent inside Save() when derived data is deferred', async () => {
        const { entity, rerunCount } = stubQuerySQL(true);

        expect(await entity.Save()).toBe(true);
        expect(rerunCount()).toBe(0);
    });

    it('re-extracts the parent when the caller runs the deferred work', async () => {
        const { entity, rerunCount } = stubQuerySQL(true);
        await entity.Save();

        await entity.ProcessDeferredDerivedData();
        await entity.ProcessDeferredDerivedData();

        expect(rerunCount()).toBe(1);
    });
});
