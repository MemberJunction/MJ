/**
 * `ClientClauseScreen` — the client SQL clause screen shared by the RunView entry points, the
 * provider's saved-view checks, and the per-caller statement-separator check. Payloads are
 * harmless (stacked `SELECT`s).
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { ClientClauseScreen } from '../clientClauseScreen';

const MSSQL = new SQLServerDialect();
const PG = new PostgreSQLDialect();

function entity(name: string, schema: string, baseView: string, canRead = true): EntityInfo {
    return { Name: name, SchemaName: schema, BaseView: baseView, GetUserPermisions: () => ({ CanRead: canRead }) } as unknown as EntityInfo;
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

    it('refuses a clause value that is not SQL text', () => {
        const junk = { ExtraFilter: 42 } as unknown as { ExtraFilter: string };
        expect(() => ClientClauseScreen.ScreenViewClauses(junk, ENTITIES, MSSQL, USER)).toThrow(/expected SQL text/);
    });
});

describe('ClientClauseScreen.AssertSingleStatementFragment', () => {
    const check = (clause: string, dialect = MSSQL) => () => ClientClauseScreen.AssertSingleStatementFragment(clause, 'ExtraFilter', dialect);

    it('refuses a separator or comment hidden from the keyword denylist', () => {
        expect(check(BRACKET_STACKED)).toThrow(/statement separators/);
        expect(check(E_STRING_STACKED, PG)).toThrow(/statement separators/);
        expect(check("1=1 AND [x'] = 1 --'")).toThrow(/comments/);
    });

    it('allows separators and comment markers inside literals and quoted identifiers', () => {
        expect(check(`[Na;me] = 'a;b' AND Note <> 'c--d' AND "x;y" = 1`)).not.toThrow();
        expect(check(`Name = E'it\\'s;fine'`, PG)).not.toThrow();
        expect(check('')).not.toThrow();
    });
});
