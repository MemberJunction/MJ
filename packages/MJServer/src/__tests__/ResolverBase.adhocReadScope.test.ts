// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabasePlatform, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RenderPipeline } from '@memberjunction/generic-database-provider';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * The ad-hoc SQL screen (`assertFullQueryUsesReadableEntityViews`) admits a table reference
 * only when it resolves to an entity base view the caller can read UNSCOPED. These tests pin
 * the three ways that resolution was looser than it looked (PR #4782 review):
 *
 * - a schema-qualified reference fell back to a bare-name match in another schema;
 * - an unqualified name present in two schemas resolved to whichever loaded last;
 * - entity CanRead was treated as unscoped read authority, though raw SQL does not apply the
 *   row-level filter RunView does. (lts/5 has no field-level security, so there is no
 *   denied-field case on this line.)
 */

type EntityShape = {
    Name: string;
    SchemaName: string;
    BaseView: string;
    canRead?: boolean;
    rowFilter?: string;
};

function fakeProvider(entities: EntityShape[], platform?: DatabasePlatform): IMetadataProvider {
    return {
        PlatformKey: platform,
        Entities: entities.map((e) => ({
            Name: e.Name,
            SchemaName: e.SchemaName,
            BaseView: e.BaseView,
            GetUserPermisions: () => ({ CanRead: e.canRead ?? true }),
            GetUserRowLevelSecurityWhereClause: () => e.rowFilter ?? '',
        })),
    } as unknown as IMetadataProvider;
}

const USER = { ID: 'U1', Email: 'u@example.com' } as unknown as UserInfo;

class Probe extends ResolverBase {
    public Screen(sql: string, provider: IMetadataProvider, user: UserInfo | undefined = USER) {
        return this.assertFullQueryUsesReadableEntityViews(sql, provider, user, 'ad-hoc SQL');
    }

    /** Renders the SQL the way `ExecuteAdhocQuery` does, then screens the rendered text. */
    public ScreenRendered(sql: string, platform: DatabasePlatform, provider: IMetadataProvider) {
        const rendered = RenderPipeline.Run(sql, { Platform: platform, ContextUser: USER, RequireReadStatement: true });
        return this.Screen(rendered.Trace.AfterTemplates, provider);
    }
}

const PUBLIC_FOO: EntityShape = { Name: 'Public Foo', SchemaName: 'public', BaseView: 'vwFoo' };

describe('assertFullQueryUsesReadableEntityViews', () => {
    it('admits an unscoped readable base view', () => {
        expect(() => new Probe().Screen('SELECT ID FROM [public].[vwFoo]', fakeProvider([PUBLIC_FOO]))).not.toThrow();
    });

    it('does not resolve a schema-qualified reference through another schema', () => {
        expect(() => new Probe().Screen('SELECT ID FROM secret.vwFoo', fakeProvider([PUBLIC_FOO]))).toThrow(
            /entity base view, not 'secret.vwFoo'/,
        );
    });

    it('refuses an unqualified view name that exists in more than one schema', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Other Foo', SchemaName: 'other', BaseView: 'vwFoo' }]);
        expect(() => new Probe().Screen('SELECT ID FROM vwFoo', provider)).toThrow(/more than one schema/);
        expect(() => new Probe().Screen('SELECT ID FROM other.vwFoo', provider)).not.toThrow();
    });

    it('refuses an entity the caller cannot read', () => {
        expect(() => new Probe().Screen('SELECT ID FROM public.vwFoo', fakeProvider([{ ...PUBLIC_FOO, canRead: false }]))).toThrow(
            /read permission/,
        );
    });

    it('refuses an entity that is row-level-security filtered for the caller', () => {
        const provider = fakeProvider([{ ...PUBLIC_FOO, rowFilter: "(UserID = 'U1')" }]);
        expect(() => new Probe().Screen('SELECT ID, UserID FROM public.vwFoo', provider)).toThrow(/row-level-security/);
    });

    it('applies the scope check to every reference, including joins and subqueries', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Bar', SchemaName: 'public', BaseView: 'vwBar', rowFilter: '(1=0)' }]);
        expect(() =>
            new Probe().Screen('SELECT f.ID FROM public.vwFoo f WHERE f.ID IN (SELECT FooID FROM public.vwBar)', provider),
        ).toThrow(/'Bar' is row-level-security filtered/);
    });

    it('applies the scope check to a CASE subquery in the select list', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Bar', SchemaName: 'public', BaseView: 'vwBar', rowFilter: '(1=0)' }]);
        expect(() =>
            new Probe().Screen('SELECT CASE WHEN (SELECT COUNT(*) FROM public.vwBar) > 0 THEN 1 ELSE 0 END AS x FROM public.vwFoo', provider),
        ).toThrow(/'Bar' is row-level-security filtered/);
    });

    it('applies the scope check to every FROM item when an alias repeats', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Bar', SchemaName: 'public', BaseView: 'vwBar', rowFilter: '(1=0)' }]);
        expect(() =>
            new Probe().Screen('SELECT a.ID FROM public.vwBar a WHERE a.ID IN (SELECT a.ID FROM public.vwFoo a)', provider),
        ).toThrow(/'Bar' is row-level-security filtered/);
    });

    it('exempts CTE names the statement defines', () => {
        expect(() =>
            new Probe().Screen('WITH x AS (SELECT ID FROM public.vwFoo) SELECT ID FROM x', fakeProvider([PUBLIC_FOO])),
        ).not.toThrow();
    });
});

describe('assertFullQueryUsesReadableEntityViews — CTE names', () => {
    // The parser renames bracket identifiers it cannot read and maps the new names back. The CTE
    // exemption must only cover names the statement declares, so a name of the renamed form,
    // quoted or bare, is refused. Orders is row-filtered for the caller; Accounts is not.
    const ACCOUNTS: EntityShape = { Name: 'Accounts', SchemaName: 'dbo', BaseView: 'vwAccounts' };
    const ORDERS: EntityShape = { Name: 'Orders', SchemaName: 'dbo', BaseView: 'vwOrders', rowFilter: "(OwnerID = 'U1')" };
    const DIALECTS: Array<{ Name: string; Platform: DatabasePlatform; Quote: (name: string) => string }> = [
        { Name: 'SQL Server', Platform: 'sqlserver', Quote: (name) => `[${name}]` },
        { Name: 'PostgreSQL', Platform: 'postgresql', Quote: (name) => `"${name}"` },
    ];

    for (const { Name, Platform, Quote } of DIALECTS) {
        const provider = fakeProvider([ACCOUNTS, ORDERS], Platform);

        it(`refuses a CTE name reserved for the SQL parser, before reading any view (${Name})`, () => {
            const sql = `WITH ${Quote('a b')} AS (SELECT 1 AS x), _mjid_1 AS (SELECT 1 AS y) SELECT * FROM ${Quote('vwOrders')}`;

            expect(() => new Probe().ScreenRendered(sql, Platform, provider)).toThrow(/reserved for the SQL parser/);
        });

        it(`refuses a reserved name in any case or quoting (${Name})`, () => {
            for (const name of ['_MJID_1', Quote('_mjid_1'), '_mjid2_0']) {
                const sql = `WITH ${Quote('a b')} AS (SELECT 1 AS x), ${name} AS (SELECT 1 AS y) SELECT * FROM ${Quote('vwAccounts')}`;
                expect(() => new Probe().ScreenRendered(sql, Platform, provider)).toThrow(/reserved for the SQL parser/);
            }
        });

        it(`still exempts an ordinary quoted CTE name and screens its body (${Name})`, () => {
            const cte = Quote('Recent Accounts');
            const reads = (view: string) => `WITH ${cte} AS (SELECT ID FROM ${Quote(view)}) SELECT ID FROM ${cte}`;

            expect(() => new Probe().ScreenRendered(reads('vwAccounts'), Platform, provider)).not.toThrow();
            expect(() => new Probe().ScreenRendered(reads('vwOrders'), Platform, provider)).toThrow(/'Orders' is row-level-security filtered/);
        });

        it(`still refuses a row-filtered view read next to an ordinary quoted CTE (${Name})`, () => {
            const sql = `WITH ${Quote('a b')} AS (SELECT 1 AS x) SELECT * FROM ${Quote('vwOrders')}`;

            expect(() => new Probe().ScreenRendered(sql, Platform, provider)).toThrow(/'Orders' is row-level-security filtered/);
        });
    }
});

describe('assertFullQueryUsesReadableEntityViews — the CTE exemption covers only a CTE in scope', () => {
    // Orders is row-filtered for the caller; Accounts is not. Each refused statement reads the real
    // Orders view at a point where no CTE of that name is in scope, so the read must be checked.
    const ACCOUNTS: EntityShape = { Name: 'Accounts', SchemaName: 'dbo', BaseView: 'vwAccounts' };
    const ORDERS: EntityShape = { Name: 'Orders', SchemaName: 'dbo', BaseView: 'vwOrders', rowFilter: "(OwnerID = 'U1')" };
    const ROW_FILTERED = /'Orders' is row-level-security filtered/;
    const providers: Record<DatabasePlatform, IMetadataProvider> = {
        sqlserver: fakeProvider([ACCOUNTS, ORDERS], 'sqlserver'),
        postgresql: fakeProvider([ACCOUNTS, ORDERS], 'postgresql'),
    };
    const screen = (sql: string, platform: DatabasePlatform) => () => new Probe().ScreenRendered(sql, platform, providers[platform]);

    it('refuses a schema-qualified read of a view a CTE is named after (SQL Server dbo, PostgreSQL)', () => {
        expect(screen('WITH vwOrders AS (SELECT 1 AS y) SELECT * FROM dbo.vwOrders', 'sqlserver')).toThrow(ROW_FILTERED);
        expect(screen('WITH "vwOrders" AS (SELECT 1 AS y) SELECT * FROM dbo."vwOrders"', 'postgresql')).toThrow(ROW_FILTERED);
    });

    it('refuses a read outside the subquery or branch whose WITH declares the name (PostgreSQL)', () => {
        const statements = [
            'SELECT o.* FROM (WITH "vwOrders" AS (SELECT 1 AS a) SELECT * FROM "vwOrders") s CROSS JOIN "vwOrders" o',
            'SELECT "ID" FROM "vwAccounts" WHERE EXISTS (WITH "vwOrders" AS (SELECT 1 AS a) SELECT 1 FROM "vwOrders") AND "ID" IN (SELECT "ID" FROM "vwOrders")',
            'WITH a AS (WITH "vwOrders" AS (SELECT 1 AS x) SELECT * FROM "vwOrders") SELECT * FROM a, "vwOrders"',
            'SELECT * FROM ((WITH "vwOrders" AS (SELECT 1 AS "ID") SELECT "ID" FROM "vwOrders") UNION SELECT "ID" FROM "vwOrders") u',
        ];
        for (const sql of statements) {
            expect(screen(sql, 'postgresql')).toThrow(ROW_FILTERED);
        }
    });

    it('refuses a read in a CTE body that does not see that CTE yet (PostgreSQL without RECURSIVE, SQL Server)', () => {
        expect(screen('WITH "vwOrders" AS (SELECT * FROM "vwOrders") SELECT * FROM "vwOrders"', 'postgresql')).toThrow(ROW_FILTERED);
        expect(screen('WITH a AS (SELECT * FROM "vwOrders"), "vwOrders" AS (SELECT 1 AS y) SELECT * FROM a', 'postgresql')).toThrow(ROW_FILTERED);
        expect(screen('WITH a AS (SELECT * FROM vwOrders), vwOrders AS (SELECT 1 AS y) SELECT * FROM a', 'sqlserver')).toThrow(ROW_FILTERED);
    });

    it('refuses a quoted read whose name differs from the CTE name once PostgreSQL case rules apply', () => {
        expect(screen('WITH vworders AS (SELECT 1 AS y) SELECT * FROM "vwOrders"', 'postgresql')).toThrow(ROW_FILTERED);
        expect(screen('WITH "VWORDERS" AS (SELECT 1 AS y) SELECT * FROM "vwOrders"', 'postgresql')).toThrow(ROW_FILTERED);
    });

    it('still exempts ordinary CTE references (SQL Server)', () => {
        const statements = [
            'WITH Recent AS (SELECT ID FROM vwAccounts) SELECT ID FROM recent',
            'WITH r AS (SELECT ID FROM vwAccounts UNION ALL SELECT ID FROM r WHERE 1 = 0) SELECT ID FROM r',
            'WITH a AS (SELECT ID FROM vwAccounts), b AS (SELECT ID FROM a) SELECT ID FROM b WHERE ID IN (SELECT ID FROM a UNION SELECT ID FROM a)',
        ];
        for (const sql of statements) {
            expect(screen(sql, 'sqlserver')).not.toThrow();
        }
    });

    it('still exempts ordinary CTE references (PostgreSQL)', () => {
        const statements = [
            'WITH recent AS (SELECT "ID" FROM "vwAccounts") SELECT "ID" FROM Recent',
            'WITH "Recent" AS (SELECT "ID" FROM "vwAccounts") SELECT "ID" FROM "Recent"',
            'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT n FROM r',
            'WITH RECURSIVE a AS (SELECT * FROM b), b AS (SELECT "ID" FROM "vwAccounts") SELECT * FROM a',
            'SELECT * FROM (WITH x AS (SELECT "ID" FROM "vwAccounts") SELECT * FROM x) s',
            'WITH a AS (SELECT "ID" FROM "vwAccounts") SELECT "ID" FROM (SELECT "ID" FROM a) s WHERE "ID" IN (SELECT "ID" FROM a UNION SELECT "ID" FROM a)',
        ];
        for (const sql of statements) {
            expect(screen(sql, 'postgresql')).not.toThrow();
        }
    });
});
