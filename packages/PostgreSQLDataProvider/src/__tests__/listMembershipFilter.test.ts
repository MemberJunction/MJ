import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, EntityFieldTSType, ListMembershipFilter, type EntityFieldInfo, type EntityInfo } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg so we can instantiate the provider without a real DB
vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

/**
 * The list-membership filter is built once, without knowing the platform (the browser cannot ask),
 * and sent as an ExtraFilter. On PostgreSQL it passes through `TransformExternalSQLClause` and then
 * the `ExecuteSQL` auto-quoter. The composite form must come out as valid PostgreSQL: `CONCAT`
 * stays a bare function, the `'OrderID|'` / `'||'` literals are untouched, and the mixed-case
 * columns and view are quoted (#5253, #5239).
 */
type ProviderWithTransform = { TransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string };

const ORDER_LINES = {
    Fields: [
        { Name: 'OrderID', TSType: EntityFieldTSType.String },
        { Name: 'LineNo', TSType: EntityFieldTSType.Number },
        { Name: 'Amount', TSType: EntityFieldTSType.Number },
    ],
} as unknown as EntityInfo;

describe('ListMembershipFilter on PostgreSQL', () => {
    const provider = new PostgreSQLDataProvider();
    const toPG = (clause: string) =>
        provider.AutoQuoteIdentifiers((provider as unknown as ProviderWithTransform).TransformExternalSQLClause(clause, ORDER_LINES));

    it('keeps CONCAT and the delimiter literals, and quotes the key columns and view', () => {
        const filter = ListMembershipFilter(
            [{ Name: 'OrderID', Type: 'uniqueidentifier' }, { Name: 'LineNo', Type: 'int' }],
            '__mj.vwListDetails',
            'list-1'
        );
        expect(toPG(filter)).toBe(
            `CONCAT('OrderID|', "OrderID", '||', 'LineNo|', "LineNo") IN ` +
            `(SELECT "RecordID" FROM __mj."vwListDetails" WHERE "ListID"='list-1')`
        );
    });

    // PostgreSQL metadata types a uuid key `uniqueidentifier` (vwSQLColumnsAndEntityFields maps it),
    // a type PostgreSQL does not have; the provider maps the cast to uuid before running it.
    it('maps the single-key cast from uniqueidentifier, the type metadata reports, to uuid', () => {
        const filter = ListMembershipFilter({ Name: 'OrderID', Type: 'uniqueidentifier' }, '__mj.vwListDetails', 'list-1');
        expect(toPG(filter)).toBe(
            `"OrderID" IN (SELECT CAST("RecordID" AS uuid) FROM __mj."vwListDetails" WHERE "ListID"='list-1')`
        );
    });

    it('keeps an integer key cast as written, valid on both platforms', () => {
        const filter = ListMembershipFilter({ Name: 'OrderID', Type: 'int' }, '__mj.vwListDetails', 'list-1');
        expect(toPG(filter)).toContain('CAST("RecordID" AS int)');
    });

    it('does not touch uniqueidentifier inside a string literal', () => {
        const pg = toPG(`"OrderID" = 'x AS uniqueidentifier)'`);
        expect(pg).toContain(`'x AS uniqueidentifier)'`);
    });
});

/**
 * Key filters built on the client (`CompositeKey.ToWhereClause` with an entity, SearchEntity's id
 * filter) carry SQL Server's `N'…'` prefix for an nvarchar key, and metadata reports text keys as
 * nvarchar on PostgreSQL too. On PostgreSQL `N'…'` is bpchar, which costs a varchar key its index,
 * so the provider drops the prefix from the code of a client clause (never from literal text).
 */
describe('TransformExternalSQLClause — T-SQL N prefix', () => {
    const provider = new PostgreSQLDataProvider();
    const toPG = (clause: string) => (provider as unknown as ProviderWithTransform).TransformExternalSQLClause(clause, ORDER_LINES);

    it.each([
        [`OrderID=N'K777'`, `"OrderID"='K777'`],
        [`OrderID IN (N'a',N'b', n'c')`, `"OrderID" IN ('a','b', 'c')`],
        [`(OrderID=N'A-1') OR (OrderID=N'B''2')`, `("OrderID"='A-1') OR ("OrderID"='B''2')`],
        [`"OrderID"=N'x'`, `"OrderID"='x'`],
    ])('drops the prefix: %s', (input, expected) => {
        expect(toPG(input)).toBe(expected);
    });

    it('leaves N inside a literal alone', () => {
        expect(toPG(`COLUMN='N'`)).toBe(`COLUMN='N'`);
        expect(toPG(`OrderID='N''x'`)).toBe(`"OrderID"='N''x'`);
    });

    it('keeps a word that ends in N right before a literal', () => {
        const out = toPG(`CASE WHEN OrderID IS NULL THEN'x' ELSE'y' END = 'x'`);
        expect(out).toContain(`THEN'x'`);
        expect(out).not.toContain(`THE'x'`);
    });
});

describe('BuildPrimaryKeyWhereClause on PostgreSQL — no N prefix', () => {
    type ProviderWithPKWhere = { BuildPrimaryKeyWhereClause(entityInfo: EntityInfo, key: CompositeKey): string };
    const provider = new PostgreSQLDataProvider() as unknown as ProviderWithPKWhere;

    it('writes a plain literal for a key metadata types nvarchar', () => {
        // UnicodePrefix is 'N' here, as for every nvarchar field; PostgreSQL must not use it.
        const pk = { Name: 'Code', CodeName: 'Code', NeedsQuotes: true, UnicodePrefix: 'N' } as unknown as EntityFieldInfo;
        const entity = { Name: 'Codes', PrimaryKeys: [pk], FirstPrimaryKey: pk } as unknown as EntityInfo;
        expect(provider.BuildPrimaryKeyWhereClause(entity, CompositeKey.FromKeyValuePair('Code', "K'777"))).toBe(`"Code"='K''777'`);
    });
});
