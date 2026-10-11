/**
 * `ClientClauseScreen` — the client SQL clause screen shared by the RunView entry points, the
 * provider's saved-view checks, and the per-caller statement-separator check. Payloads are
 * harmless (stacked `SELECT`s).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { ClientClauseScreen, IsClientClauseScreeningProvider, type ClientViewClauseSet, type StatementRelation } from '../clientClauseScreen';

const MSSQL = new SQLServerDialect();
const PG = new PostgreSQLDialect();

/** An entity whose read, when granted, is unscoped: no row filter and no denied fields. */
function entity(name: string, schema: string, baseView: string, canRead = true): EntityInfo {
    return {
        Name: name,
        SchemaName: schema,
        BaseView: baseView,
        GetUserPermisions: () => ({ CanRead: canRead }),
        GetEffectiveRowFilterWhereClause: () => '',
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
}

const ENTITIES = [
    entity('Accounts', '__mj', 'vwAccounts'),
    entity('Ledger', 'fin', 'vwLedger', false),
    entity('Notes A', 'a', 'vwNotes'),
    entity('Notes B', 'b', 'vwNotes'),
];
const USER = { ID: 'u1' } as UserInfo;

const BRACKET_STACKED = "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT 1 WHERE (1 = (SELECT 1 AS [b'])";
const E_STRING_STACKED = "Name = E'\\'' ; SELECT 1 ; SELECT 1 WHERE Name = E'\\''";

/** A FROM item as `schema.table:cte` or `schema.table:table`, or `fn:name` for a table function. */
const describeRelation = (r: StatementRelation): string =>
    r.TableName ? `${r.SchemaName}.${r.TableName}:${r.IsCTEReference ? 'cte' : 'table'}` : `fn:${r.FunctionName}`;

const screen = (clause: string, label = 'ExtraFilter', dialect: SQLParserDialect = MSSQL) =>
    () => ClientClauseScreen.AssertClauseUsesEntityBaseViews(clause, label, ENTITIES, dialect, USER);

describe('ClientClauseScreen.DialectFor', () => {
    it('reads the provider PlatformKey first, then its class name, and defaults to SQL Server', () => {
        class PostgreSQLDataProvider {}
        class TenantProvider { get PlatformKey() { return 'postgresql'; } }

        expect(ClientClauseScreen.DialectFor({ PlatformKey: 'postgresql' })).toBeInstanceOf(PostgreSQLDialect);
        expect(ClientClauseScreen.DialectFor(new TenantProvider())).toBeInstanceOf(PostgreSQLDialect);
        expect(ClientClauseScreen.DialectFor(new PostgreSQLDataProvider())).toBeInstanceOf(PostgreSQLDialect);
        expect(ClientClauseScreen.DialectFor({ PlatformKey: 'sqlserver' })).toBeInstanceOf(SQLServerDialect);
        expect(ClientClauseScreen.DialectFor(undefined)).toBeInstanceOf(SQLServerDialect);
    });
});

describe('ClientClauseScreen.AssertClauseUsesEntityBaseViews', () => {
    it('refuses a stacked statement hidden behind a bracket identifier', () => {
        expect(screen(BRACKET_STACKED)).toThrow(/multiple statements/);
    });

    it('refuses a stacked statement hidden behind a PostgreSQL E-string', () => {
        expect(screen(E_STRING_STACKED, 'ExtraFilter', PG)).toThrow(/Invalid ExtraFilter/);
    });

    it('refuses base tables, catalogs, and entities the user cannot read', () => {
        expect(screen(`EXISTS (SELECT 1 FROM __mj.[User] WHERE [Type] = 'Owner')`)).toThrow(/entity base view/);
        expect(screen(`EXISTS (SELECT 1 FROM sys.objects)`)).toThrow(/entity base view/);
        expect(screen(`ID IN (SELECT AccountID FROM fin.vwLedger)`)).toThrow(/read permission/);
    });

    it('requires a schema for a view name that exists in more than one schema', () => {
        expect(screen(`ID IN (SELECT ID FROM vwNotes)`)).toThrow(/more than one schema/);
        expect(screen(`ID IN (SELECT ID FROM a.vwNotes)`)).not.toThrow();
    });

    it('allows ordinary predicates, base-view subqueries, and literals that look like SQL', () => {
        expect(screen(`[Name] = 'O''Brien; DROP' AND ID IN (SELECT ID FROM [__mj].[vwAccounts])`)).not.toThrow();
        expect(screen('', 'ExtraFilter')).not.toThrow();
    });

    it('screens an OrderBy as a sort list', () => {
        expect(screen('[Name] DESC, ID', 'OrderBy')).not.toThrow();
        expect(screen('(SELECT TOP 1 Password FROM __mj.Credential)', 'OrderBy')).toThrow(/entity base view/);
    });
});

describe('ClientClauseScreen — PostgreSQL bracket identifiers', () => {
    it('screens a bracketed clause in the form the PostgreSQL provider runs it', () => {
        expect(screen(`([Name] = 'Acme') AND ([Name] LIKE '%acme%')`, 'ExtraFilter', PG)).not.toThrow();
        expect(screen(`ID IN (SELECT ID FROM [__mj].[vwAccounts])`, 'ExtraFilter', PG)).not.toThrow();
        expect(screen('[Name] DESC', 'OrderBy', PG)).not.toThrow();
    });

    it('still refuses a bracketed base table, and any bracket around more than a plain name', () => {
        expect(screen(`EXISTS (SELECT 1 FROM [__mj].[User])`, 'ExtraFilter', PG)).toThrow(/entity base view/);
        expect(screen(`[a;b] = 1`, 'ExtraFilter', PG)).toThrow(/Invalid ExtraFilter/);
        expect(screen(`[x'y] = 1`, 'ExtraFilter', PG)).toThrow(/Invalid ExtraFilter/);
    });
});

describe('ClientClauseScreen.ScreenViewClauses', () => {
    it('screens every variant of a platform-specific clause under its own dialect', () => {
        expect(() => ClientClauseScreen.ScreenViewClauses(
            { ExtraFilter: { default: `Name = 'x'`, postgresql: E_STRING_STACKED } },
            ENTITIES, MSSQL, USER,
        )).toThrow(/Invalid ExtraFilter/);
        expect(() => ClientClauseScreen.ScreenViewClauses(
            { ExtraFilter: { default: `Name = 'x'`, sqlserver: `[Name] = 'y'`, postgresql: `"Name" = 'y'` } },
            ENTITIES, MSSQL, USER,
        )).not.toThrow();
    });

    it('refuses a clause value, or a platform variant, that is not SQL text', () => {
        const junk = { ExtraFilter: 42 } as unknown as ClientViewClauseSet;
        const junkVariant = { ExtraFilter: { default: `Name = 'x'`, sqlserver: ['1=1 ; SELECT 1'] } } as unknown as ClientViewClauseSet;
        expect(() => ClientClauseScreen.ScreenViewClauses(junk, ENTITIES, MSSQL, USER)).toThrow(/expected SQL text/);
        expect(() => ClientClauseScreen.ScreenViewClauses(junkVariant, ENTITIES, MSSQL, USER)).toThrow(/expected SQL text/);
    });
});

describe('ClientClauseScreen.AssertSingleStatementFragment', () => {
    const check = (clause: string, dialect: SQLParserDialect = MSSQL) => () => ClientClauseScreen.AssertSingleStatementFragment(clause, 'ExtraFilter', dialect);

    it('refuses a separator or comment hidden from the keyword denylist', () => {
        expect(check(BRACKET_STACKED)).toThrow(/statement separators/);
        expect(check(E_STRING_STACKED, PG)).toThrow(/statement separators/);
        expect(check("1=1 AND [x'] = 1 --'")).toThrow(/comments/);
    });

    it('refuses input that is not SQL text', () => {
        const notText = ['1=1 ; SELECT 1'] as unknown as string;
        expect(() => ClientClauseScreen.AssertSingleStatementFragment(notText, 'ExtraFilter', MSSQL)).toThrow(/expected SQL text/);
    });

    it('allows separators and comment markers inside literals and quoted identifiers', () => {
        expect(check(`[Na;me] = 'a;b' AND Note <> 'c--d' AND "x;y" = 1`)).not.toThrow();
        expect(check(`Name = E'it\\'s;fine'`, PG)).not.toThrow();
        expect(check('')).not.toThrow();
    });
});

describe('IsClientClauseScreeningProvider', () => {
    it('recognizes a provider that exposes ScreenClientClause', () => {
        expect(IsClientClauseScreeningProvider({ ScreenClientClause: () => undefined })).toBe(true);
        expect(IsClientClauseScreeningProvider({ Entities: [] })).toBe(false);
        expect(IsClientClauseScreeningProvider(null)).toBe(false);
    });
});

describe('ClientClauseScreen — every subquery position is screened', () => {
    // A subquery can sit in a CASE branch, HAVING, or a window's ORDER BY / PARTITION BY, and a
    // later FROM item can reuse an earlier one's alias. The screen must see the table read in each
    // position: a base table or a row-filtered entity is refused there, an unscoped view allowed.
    const ORDERS = {
        Name: 'Orders',
        SchemaName: '__mj',
        BaseView: 'vwOrders',
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => "(OwnerID = 'u1')",
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
    const WITH_ORDERS = [...ENTITIES, ORDERS];

    const POSITIONS: Array<[string, (table: string) => string]> = [
        ['a CASE WHEN condition', (t) => `CASE WHEN (SELECT COUNT(*) FROM ${t}) > 0 THEN 1 ELSE 0 END = 1`],
        ['a CASE THEN result', (t) => `ID = CASE WHEN 1 = 1 THEN (SELECT MAX(ID) FROM ${t}) END`],
        ['a CASE ELSE result', (t) => `ID = CASE WHEN 1 = 0 THEN NULL ELSE (SELECT MAX(ID) FROM ${t}) END`],
        ['HAVING', (t) => `ID IN (SELECT ID FROM __mj.vwAccounts GROUP BY ID HAVING (SELECT COUNT(*) FROM ${t}) > 0)`],
        ['a window ORDER BY', (t) => `ID IN (SELECT ID FROM (SELECT ID, ROW_NUMBER() OVER (ORDER BY (SELECT COUNT(*) FROM ${t})) AS rn FROM __mj.vwAccounts) x)`],
        // The PostgreSQL grammar parses a PARTITION BY subquery only inside a function call.
        ['a window PARTITION BY', (t) => `ID IN (SELECT ID FROM (SELECT ID, SUM(1) OVER (PARTITION BY COALESCE((SELECT MAX(ID) FROM ${t}), ID)) AS rn FROM __mj.vwAccounts) x)`],
        ['a FROM item whose alias a later FROM item reuses', (t) => `ID IN (SELECT a.ID FROM ${t} a) OR ID IN (SELECT a.ID FROM __mj.vwAccounts a)`],
        ['a FROM item aliased as a later view name', (t) => `ID IN (SELECT vwAccounts.ID FROM ${t} vwAccounts) OR ID IN (SELECT ID FROM __mj.vwAccounts)`],
    ];
    const DIALECTS: Array<[string, SQLParserDialect]> = [['SQL Server', MSSQL], ['PostgreSQL', PG]];
    const screenIn = (clause: string, dialect: SQLParserDialect) =>
        () => ClientClauseScreen.AssertClauseUsesEntityBaseViews(clause, 'ExtraFilter', WITH_ORDERS, dialect, USER);

    for (const [dialectName, dialect] of DIALECTS) {
        for (const [position, clauseFor] of POSITIONS) {
            it(`refuses a base table read from ${position} (${dialectName})`, () => {
                expect(screenIn(clauseFor('__mj.[User]'), dialect)).toThrow(/entity base view/);
            });

            it(`refuses a row-filtered entity read from ${position} (${dialectName})`, () => {
                expect(screenIn(clauseFor('__mj.vwOrders'), dialect)).toThrow(/'Orders' is row-level-security filtered/);
            });

            it(`allows an unscoped entity view read from ${position} (${dialectName})`, () => {
                expect(screenIn(clauseFor('__mj.vwAccounts'), dialect)).not.toThrow();
            });
        }
    }

    it('refuses a table function in FROM unless it is a built-in that reads only its arguments', () => {
        expect(screenIn(`EXISTS (SELECT 1 FROM sys.dm_exec_sql_text(0x01))`, MSSQL)).toThrow(/table function 'sys.dm_exec_sql_text'/);
        expect(screenIn(`EXISTS (SELECT 1 FROM dbo.STRING_SPLIT('a,b', ','))`, MSSQL)).toThrow(/table function 'dbo.STRING_SPLIT'/);
        expect(screenIn(`EXISTS (SELECT 1 FROM pg_get_keywords())`, PG)).toThrow(/table function 'pg_get_keywords'/);
        expect(screenIn(`EXISTS (SELECT 1 FROM pg_catalog.generate_series(1, 2))`, PG)).toThrow(/table function/);
    });

    it('allows an unqualified built-in table function that reads only its arguments, and a VALUES list', () => {
        expect(screenIn(`ID IN (SELECT value FROM STRING_SPLIT('a,b', ','))`, MSSQL)).not.toThrow();
        expect(screenIn(`EXISTS (SELECT 1 FROM generate_series(1, 2))`, PG)).not.toThrow();
        expect(screenIn(`ID IN (SELECT x FROM (VALUES (1),(2)) v(x))`, MSSQL)).not.toThrow();
    });

    it('still screens a subquery inside an allowed table function', () => {
        expect(screenIn(`ID IN (SELECT value FROM STRING_SPLIT((SELECT MAX(Name) FROM __mj.[User]), ','))`, MSSQL)).toThrow(/entity base view/);
        expect(screenIn(`ID IN (SELECT * FROM unnest(ARRAY(SELECT ID FROM __mj.vwOrders)))`, PG)).toThrow(/'Orders' is row-level-security filtered/);
    });

    it('skips only the parse wrapper itself, not another read of a table with its name', () => {
        expect(screenIn(`EXISTS (SELECT 1 FROM __mj_clause_screen)`, MSSQL)).toThrow(/entity base view/);
        expect(screenIn(`EXISTS (SELECT 1 FROM __mj_clause_screen)`, PG)).toThrow(/entity base view/);
    });
});

describe('ClientClauseScreen.CollectStatementReads', () => {
    it('keeps every FROM item, even when an alias repeats, and counts each SELECT node', () => {
        const sql = `SELECT 1 FROM x WHERE (ID IN (SELECT a.ID FROM s.t1 a) OR ID IN (SELECT a.ID FROM s.t2 a))`;

        const reads = ClientClauseScreen.CollectStatementReads(new SQLParser(sql, MSSQL));

        expect(reads.Relations.map((r) => `${r.SchemaName}.${r.TableName}`)).toEqual(['.x', 's.t1', 's.t2']);
        expect(reads.SelectCount).toBe(3);
    });

    it('keeps the database of a three-part name, so it cannot match a view in this database', () => {
        const reads = ClientClauseScreen.CollectStatementReads(new SQLParser('SELECT 1 FROM otherdb.__mj.vwAccounts', MSSQL));

        expect(reads.Relations).toEqual([{ SchemaName: 'otherdb.__mj', TableName: 'vwAccounts', FunctionName: '', IsCTEReference: false }]);
    });

    it('reads back the names the fallback parse renamed, and marks the CTE reference', () => {
        // A bracket-quoted CTE name makes the T-SQL grammar fail, so the parser renames brackets and retries.
        const sql = `WITH [Recent Accounts] AS (SELECT ID FROM [__mj].[vwAccounts]) SELECT ID FROM [Recent Accounts]`;

        const reads = ClientClauseScreen.CollectStatementReads(new SQLParser(sql, MSSQL));

        expect(reads.Relations.map(describeRelation).sort()).toEqual(['.Recent Accounts:cte', '__mj.vwAccounts:table']);
    });

    it('marks a FROM item as a CTE reference only by a name the statement declares, read as written', () => {
        const sql = `WITH [a b] AS (SELECT 1 AS x), _mjid_1 AS (SELECT 1 AS y) SELECT * FROM [vwOrders]`;

        const reads = ClientClauseScreen.CollectStatementReads(new SQLParser(sql, MSSQL));

        expect(reads.Relations.map(describeRelation)).toEqual(['.vwOrders:table']);
    });
});

describe('ClientClauseScreen — names reserved for the SQL parser', () => {
    // The parser renames bracket identifiers it cannot read and maps the new names back. Client SQL
    // may not use a name of that form, quoted or bare, in any case.
    const RESERVED = [`ID IN (SELECT ID FROM __mj._mjid_1)`, `[_mjid_1] = 1`, `"_MJID_2" = 1`, `ID = 1 OR _mjid3_0 = 1`];
    const DIALECTS: Array<[string, SQLParserDialect]> = [['SQL Server', MSSQL], ['PostgreSQL', PG]];

    for (const [dialectName, dialect] of DIALECTS) {
        it(`refuses a reserved name in a filter or a sort (${dialectName})`, () => {
            for (const clause of RESERVED) {
                expect(screen(clause, 'ExtraFilter', dialect)).toThrow(/reserved for the SQL parser/);
            }
            expect(screen('_mjid_0 DESC', 'OrderBy', dialect)).toThrow(/reserved for the SQL parser/);
        });

        it(`still allows the reserved form inside a longer name or a string literal (${dialectName})`, () => {
            expect(screen(`[Name] = '_mjid_1' AND [x_mjid_1] = 1`, 'ExtraFilter', dialect)).not.toThrow();
        });
    }

    it('refuses a reserved name when the clause also makes the parser rename brackets (SQL Server)', () => {
        expect(screen(`[a]]b] = 1 OR [vwAccounts] = 1 OR ID IN (SELECT ID FROM __mj._mjid_1)`)).toThrow(/reserved for the SQL parser/);
    });
});

describe('ClientClauseScreen.AssertEverySelectAccountedFor', () => {
    const check = (sql: string, selectCount: number) =>
        () => ClientClauseScreen.AssertEverySelectAccountedFor(sql, MSSQL, { Relations: [], SelectCount: selectCount }, 'ExtraFilter');

    it('refuses SQL with a SELECT the walk did not find', () => {
        expect(check('SELECT 1 FROM x WHERE (SELECT 1) = 1', 1)).toThrow(/could not account for every subquery/);
    });

    it('counts only SELECT keywords outside literals, quoted identifiers and comments', () => {
        expect(check(`SELECT 1 FROM x WHERE Name = 'select' AND [select] = 1`, 1)).not.toThrow();
        expect(check('SELECT 1 FROM x WHERE (SELECT 1) = 1', 2)).not.toThrow();
    });
});

describe('ClientClauseScreen.CollectStatementReads — a FROM item is a CTE reference only where that CTE is in scope', () => {
    const reads = (sql: string, dialect: SQLParserDialect) =>
        ClientClauseScreen.CollectStatementReads(new SQLParser(sql, dialect)).Relations.map(describeRelation).sort();

    it('marks a reference in its own statement, a subquery, and every set-operation branch', () => {
        const sql = 'WITH a AS (SELECT ID FROM t) SELECT ID FROM a WHERE ID IN (SELECT ID FROM a) UNION SELECT ID FROM a';
        expect(reads(sql, MSSQL)).toEqual(['.a:cte', '.a:cte', '.a:cte', '.t:table']);
        expect(reads(sql, PG)).toEqual(['.a:cte', '.a:cte', '.a:cte', '.t:table']);
    });

    it('never marks a schema-qualified reference, dbo included', () => {
        expect(reads('WITH vwOrders AS (SELECT 1 AS y) SELECT * FROM dbo.vwOrders', MSSQL)).toEqual(['dbo.vwOrders:table']);
        expect(reads('WITH "vwOrders" AS (SELECT 1 AS y) SELECT * FROM __mj."vwOrders"', PG)).toEqual(['__mj.vwOrders:table']);
    });

    it('does not carry a WITH out of its subquery, into a sibling, or past its parenthesized branch (PostgreSQL)', () => {
        expect(reads('SELECT o.* FROM (WITH x AS (SELECT 1 AS a) SELECT * FROM x) s CROSS JOIN x o', PG)).toEqual(['.x:cte', '.x:table']);
        expect(reads('SELECT 1 FROM t WHERE EXISTS (WITH x AS (SELECT 1 AS a) SELECT 1 FROM x) AND id IN (SELECT id FROM x)', PG))
            .toEqual(['.t:table', '.x:cte', '.x:table']);
        expect(reads('WITH a AS (WITH b AS (SELECT 1 AS x) SELECT * FROM b) SELECT * FROM a, b', PG)).toEqual(['.a:cte', '.b:cte', '.b:table']);
        expect(reads('(WITH x AS (SELECT 1 AS a) SELECT a FROM x) UNION SELECT a FROM x', PG)).toEqual(['.x:cte', '.x:table']);
    });

    it('lets a CTE body see only the CTEs before it, plus itself on SQL Server, and every CTE of a RECURSIVE list on PostgreSQL', () => {
        expect(reads('WITH a AS (SELECT * FROM b), b AS (SELECT * FROM b) SELECT * FROM a, b', PG))
            .toEqual(['.a:cte', '.b:cte', '.b:table', '.b:table']);
        expect(reads('WITH RECURSIVE a AS (SELECT * FROM b), b AS (SELECT 1 AS x UNION ALL SELECT x FROM b) SELECT * FROM a', PG))
            .toEqual(['.a:cte', '.b:cte', '.b:cte']);
        expect(reads('WITH a AS (SELECT * FROM b), b AS (SELECT ID FROM t UNION ALL SELECT ID FROM b) SELECT * FROM a', MSSQL))
            .toEqual(['.a:cte', '.b:cte', '.b:table', '.t:table']);
    });

    it('keeps a name in scope while any WITH that declares it is open, and not after', () => {
        for (const dialect of [PG, MSSQL]) {
            expect(reads('WITH x AS (SELECT 1 AS a) SELECT * FROM (WITH x AS (SELECT 2 AS a) SELECT a FROM x) s, x', dialect))
                .toEqual(['.x:cte', '.x:cte']);
            expect(reads('SELECT * FROM (WITH x AS (SELECT 1 AS a) SELECT a FROM x) s1, (WITH x AS (SELECT 2 AS a) SELECT a FROM x) s2, x', dialect))
                .toEqual(['.x:cte', '.x:cte', '.x:table']);
            expect(reads('WITH x AS (SELECT 1 AS a), y AS (SELECT * FROM (WITH x AS (SELECT 2 AS a) SELECT a FROM x) s, x) SELECT * FROM y, x', dialect))
                .toEqual(['.x:cte', '.x:cte', '.x:cte', '.y:cte']);
        }
    });

    it('folds unquoted names to lower case and matches quoted names exactly on PostgreSQL', () => {
        expect(reads('WITH recent AS (SELECT 1 AS a) SELECT * FROM Recent, "recent"', PG)).toEqual(['.Recent:cte', '.recent:cte']);
        expect(reads('WITH recent AS (SELECT 1 AS a) SELECT * FROM "Recent"', PG)).toEqual(['.Recent:table']);
        expect(reads('WITH "Recent" AS (SELECT 1 AS a) SELECT * FROM Recent', PG)).toEqual(['.Recent:table']);
        expect(reads('WITH "Recent" AS (SELECT 1 AS a) SELECT * FROM "Recent"', PG)).toEqual(['.Recent:cte']);
    });

    it('ignores case on SQL Server', () => {
        expect(reads('WITH Recent AS (SELECT 1 AS a) SELECT * FROM RECENT, [recent]', MSSQL)).toEqual(['.RECENT:cte', '.recent:cte']);
    });

    it('leaves the clause screen exempting no CTE: a CTE reference must still be an entity view there', () => {
        expect(screen(`ID IN (WITH x AS (SELECT "ID" FROM __mj."vwAccounts") SELECT "ID" FROM x)`, 'ExtraFilter', PG)).toThrow(/entity base view, not 'x'/);
    });
});

describe('ClientClauseScreen — functions whose reads the screen cannot see', () => {
    // These run SQL given as a string, read files or other databases, act on the server, or pause the
    // query. The dialect's list of functions caller SQL may not call applies to every client clause.
    const PG_CALLS = [
        `length(CAST(table_to_xml('__mj."vwAccounts"', true, false, '') AS text)) > 0`,
        `position('x' in CAST(query_to_xml('select 1', true, true, '') AS text)) > 0`,
        `length(CAST(cursor_to_xml('c', 1, false, true, '') AS text)) > 0`,
        `length(CAST(pg_catalog.query_to_xmlschema('select 1', true, true, '') AS text)) > 0`,
        `length(CAST([table_to_xml]('x', true, false, '') AS text)) > 0`,
        `ID IN (SELECT x FROM dblink('c', 'select 1') AS t(x int))`,
        `length(pg_read_file('x')) > 0`,
        `lo_import('x') > 0`,
        `pg_sleep(0) IS NULL`,
    ];
    const SS_CALLS = [
        `ID IN (SELECT 1 FROM OPENQUERY(srv, 'SELECT 1'))`,
        `EXISTS (SELECT 1 FROM OPENROWSET('SQLNCLI', 'x', 'SELECT 1'))`,
        `EXISTS (SELECT 1 FROM OPENDATASOURCE('SQLNCLI', 'x').db.dbo.t)`,
        `EXISTS (SELECT 1 FROM OPENXML(1, '/x'))`,
    ];

    it('refuses them in a filter and a sort on PostgreSQL', () => {
        for (const clause of PG_CALLS) {
            expect(screen(clause, 'ExtraFilter', PG)).toThrow(/may not call/);
        }
        expect(screen(`CAST(query_to_xml('select 1', true, true, '') AS text)`, 'OrderBy', PG)).toThrow(/may not call query_to_xml/);
    });

    it('refuses the rowset functions on SQL Server', () => {
        for (const clause of SS_CALLS) {
            expect(screen(clause)).toThrow(/may not call/);
        }
    });

    it('still allows ordinary functions, and a forbidden name in a literal or as a column', () => {
        expect(screen(`lower([Name]) = 'table_to_xml(' AND length([Name]) > 0 AND [lo_size] > 0`, 'ExtraFilter', PG)).not.toThrow();
        expect(screen(`LOWER([Name]) = 'OPENQUERY(' AND LEN([Name]) > 0`)).not.toThrow();
    });
});

describe('ClientClauseScreen.AssertTableRefReadable — a schema written is the schema read', () => {
    it('does not resolve a dbo-qualified reference through an entity in another schema', () => {
        expect(screen(`ID IN (SELECT ID FROM dbo.vwAccounts)`)).toThrow(/entity base view, not 'dbo.vwAccounts'/);
    });

    it('still resolves a dbo-qualified reference to an entity in dbo, and an unqualified name unique across schemas', () => {
        const withDbo = [...ENTITIES, entity('Things', 'dbo', 'vwThings')];
        expect(() => ClientClauseScreen.AssertClauseUsesEntityBaseViews(`ID IN (SELECT ID FROM dbo.vwThings)`, 'ExtraFilter', withDbo, MSSQL, USER)).not.toThrow();
        expect(screen(`ID IN (SELECT ID FROM vwAccounts)`)).not.toThrow();
    });
});
