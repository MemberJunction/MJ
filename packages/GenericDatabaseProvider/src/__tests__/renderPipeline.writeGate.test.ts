/**
 * The read-only gate in front of every rendered query.
 *
 * Rule: every path that renders SQL for execution runs the token-based read-only check
 * (`IsReadOnlyQuery`), so a write is refused whether or not node-sql-parser can read it
 * (DISCUSSION §6, 2026-10-27; W1–W4). Before, the saved-query path
 * (`GenericDatabaseProvider.processQueryParameters`, which does not set `RequireReadStatement`)
 * relied on `SQLParser.HasWriteStatement`, which is false for SQL the AST parser cannot read and
 * does not treat `SELECT … INTO` as a write; these cases were pinned with `it.fails` until the
 * gate moved.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata, DatabasePlatform, QueryDependencySpec, UserInfo } from '@memberjunction/core';
import { RenderPipeline, RenderContext } from '../renderPipeline';

afterEach(() => {
    vi.restoreAllMocks();
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as unknown as typeof Metadata.Provider);
}

const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;

/** What a refusal from the read-only gate says (either the lexer gate or the AST write check). */
const REFUSED = /read query|write statement/i;

/** The writes the saved-query path lets through today. */
const UPDATE_TRY_CAST = 'UPDATE t SET a = TRY_CAST(b AS INT)';
const MERGE_DELETE = 'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE';
const SELECT_INTO = 'SELECT a INTO newtable FROM t';

/** Renders `sql` the way `GenericDatabaseProvider.processQueryParameters` does for a saved query. */
function renderSaved(sql: string, platform: DatabasePlatform = 'sqlserver'): string {
    stubMetadata();
    return RenderPipeline.Run(sql, { Platform: platform }).FinalSQL;
}

describe('saved-query path refuses writes the AST parser cannot classify', () => {
    it('renders a plain SELECT on the saved path (setup works)', () => {
        expect(renderSaved('SELECT a FROM t')).toBe('SELECT a FROM t');
    });

    // Was pinned: the lexer read-only check runs on every path; node-sql-parser never decides safety (DISCUSSION §6, 2026-10-27). W1.
    it('refuses UPDATE t SET a = TRY_CAST(b AS INT)', () => {
        expect(() => renderSaved(UPDATE_TRY_CAST)).toThrow(REFUSED);
    });

    // Was pinned: the lexer read-only check runs on every path (DISCUSSION §6, 2026-10-27). W2.
    it('refuses MERGE … WHEN MATCHED THEN DELETE on SQL Server', () => {
        expect(() => renderSaved(MERGE_DELETE, 'sqlserver')).toThrow(REFUSED);
    });

    // Was pinned: the lexer read-only check runs on every path (DISCUSSION §6, 2026-10-27). W2 (PG 15+ MERGE).
    it('refuses MERGE … WHEN MATCHED THEN DELETE on PostgreSQL', () => {
        expect(() => renderSaved(MERGE_DELETE, 'postgresql')).toThrow(REFUSED);
    });

    // Was pinned: the lexer read-only check runs on every path (DISCUSSION §6, 2026-10-27). W3.
    it('refuses SELECT a INTO newtable FROM t on SQL Server', () => {
        expect(() => renderSaved(SELECT_INTO, 'sqlserver')).toThrow(REFUSED);
    });

    // Was pinned: the lexer read-only check runs on every path (DISCUSSION §6, 2026-10-27). W3.
    it('refuses SELECT a INTO newtable FROM t on PostgreSQL', () => {
        expect(() => renderSaved(SELECT_INTO, 'postgresql')).toThrow(REFUSED);
    });
});

/**
 * One row per path that renders SQL for execution and can be reached without a database. Each
 * builds the `RenderContext` its caller in `GenericDatabaseProvider` builds. TestQuerySQL
 * (MJServer) and data-context runs reach the provider through these same calls; they are covered
 * by their own packages and by IT35.
 */
interface EntryPoint {
    Name: string;
    Render: (sql: string) => void;
}

const entryPoints: EntryPoint[] = [
    {
        Name: 'saved query (processQueryParameters)',
        Render: sql => { RenderPipeline.Run(sql, { Platform: 'sqlserver' }); },
    },
    {
        Name: 'saved query that uses templates (processQueryParameters, UsesTemplate)',
        Render: sql => {
            const ctx: RenderContext = {
                Platform: 'sqlserver',
                UsesTemplate: true,
                Parameters: {},
                QueryInfo: { SQL: sql, UsesTemplate: true, Parameters: [] },
            };
            RenderPipeline.Run(sql, ctx);
        },
    },
    {
        Name: 'saved query whose write is in a composed dependency',
        Render: sql => {
            const deps: QueryDependencySpec[] = [{ Name: 'Writer', CategoryPath: '/Test/', SQL: sql }];
            RenderPipeline.Run('SELECT * FROM {{query:"Test/Writer"}} [w]', {
                Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
            });
        },
    },
    {
        Name: 'ad hoc SQL (runAdhocSQL, RequireReadStatement)',
        Render: sql => { RenderPipeline.Run(sql, { Platform: 'sqlserver', RequireReadStatement: true }); },
    },
    {
        Name: 'query execution spec / TestQuerySQL (resolveSpecParameters, RequireReadStatement)',
        Render: sql => {
            RenderPipeline.Run(sql, {
                Platform: 'sqlserver', ContextUser: mockUser, OriginalSQL: sql, MaxRows: 10, RequireReadStatement: true,
            });
        },
    },
];

const probes: Array<{ Id: string; SQL: string }> = [
    { Id: 'W1', SQL: UPDATE_TRY_CAST },
    { Id: 'W2', SQL: MERGE_DELETE },
    { Id: 'W3', SQL: SELECT_INTO },
];

describe('W4 — the read-only check runs on every rendering path', () => {
    for (const entry of entryPoints) {
        it(`${entry.Name}: renders a plain SELECT (setup works)`, () => {
            stubMetadata();
            expect(() => entry.Render('SELECT a FROM t')).not.toThrow();
        });

        for (const probe of probes) {
            // W4 / probe.Id: every path runs the token-based read-only check (DISCUSSION §6, 2026-10-27).
            it(`${entry.Name}: refuses ${probe.SQL}`, () => {
                stubMetadata();
                expect(() => entry.Render(probe.SQL)).toThrow(REFUSED);
            });
        }
    }
});

// The gate works from tokens: constructs the structural parser reads as Unknown still run (DISCUSSION §6,
// 2026-10-27, "never complete structural parse required").
describe('the read-only gate does not need a complete structural parse', () => {
    it('runs a saved T-SQL query with nested JOIN … JOIN … ON … ON', () => {
        const sql = 'SELECT a.ID FROM A a JOIN B b JOIN C c ON c.BID = b.ID ON b.AID = a.ID';
        expect(renderSaved(sql)).toBe(sql);
    });

    it('runs a saved T-SQL query with a bare (NOLOCK) table hint', () => {
        const sql = 'SELECT a.ID FROM dbo.A a (NOLOCK) WHERE a.ID > 0';
        expect(renderSaved(sql)).toBe(sql);
    });

    it('refuses a SELECT … INTO inside a composed dependency (CTE body)', () => {
        stubMetadata();
        const deps: QueryDependencySpec[] = [{ Name: 'Into', CategoryPath: '/Test/', SQL: SELECT_INTO }];
        expect(() => RenderPipeline.Run('SELECT * FROM {{query:"Test/Into"}} [w]', { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }))
            .toThrow(/writes its result into a table/);
    });
});
