/**
 * `ClientClauseScreen` — the client SQL clause screen shared by the RunView entry points, the
 * provider's saved-view checks, and the per-caller statement-separator check. Payloads are
 * harmless (stacked `SELECT`s).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { ClientClauseScreen, IsClientClauseScreeningProvider, type ClientViewClauseSet } from '../clientClauseScreen';

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

const screen = (clause: string, label = 'ExtraFilter', dialect = MSSQL) =>
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
    const check = (clause: string, dialect = MSSQL) => () => ClientClauseScreen.AssertSingleStatementFragment(clause, 'ExtraFilter', dialect);

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
        expect(screenIn(`EXISTS (SELECT 1 FROM pg_ls_dir('.'))`, PG)).toThrow(/table function 'pg_ls_dir'/);
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

        expect(reads.Relations).toEqual([{ SchemaName: 'otherdb.__mj', TableName: 'vwAccounts', FunctionName: '' }]);
    });

    it('reads back the names the fallback parse renamed, and collects CTE names', () => {
        // A bracket-quoted CTE name makes the T-SQL grammar fail, so the parser renames brackets and retries.
        const sql = `WITH [Recent Accounts] AS (SELECT ID FROM [__mj].[vwAccounts]) SELECT ID FROM [Recent Accounts]`;

        const reads = ClientClauseScreen.CollectStatementReads(new SQLParser(sql, MSSQL));

        expect(reads.Relations.map((r) => `${r.SchemaName}.${r.TableName}`).sort()).toEqual(['.Recent Accounts', '__mj.vwAccounts']);
        expect([...reads.CTENames]).toEqual(['recent accounts']);
    });
});

describe('ClientClauseScreen.AssertEverySelectAccountedFor', () => {
    const check = (sql: string, selectCount: number) =>
        () => ClientClauseScreen.AssertEverySelectAccountedFor(sql, MSSQL, { Relations: [], SelectCount: selectCount, CTENames: new Set<string>() }, 'ExtraFilter');

    it('refuses SQL with a SELECT the walk did not find', () => {
        expect(check('SELECT 1 FROM x WHERE (SELECT 1) = 1', 1)).toThrow(/could not account for every subquery/);
    });

    it('counts only SELECT keywords outside literals, quoted identifiers and comments', () => {
        expect(check(`SELECT 1 FROM x WHERE Name = 'select' AND [select] = 1`, 1)).not.toThrow();
        expect(check('SELECT 1 FROM x WHERE (SELECT 1) = 1', 2)).not.toThrow();
    });
});
