import { describe, it, expect, vi } from 'vitest';
import { EntityFieldTSType, ListMembershipFilter, type EntityInfo } from '@memberjunction/core';
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
            [{ Name: 'OrderID', Type: 'uuid' }, { Name: 'LineNo', Type: 'integer' }],
            '__mj.vwListDetails',
            'list-1'
        );
        expect(toPG(filter)).toBe(
            `EXISTS (SELECT 1 FROM __mj."vwListDetails" ld WHERE ld."ListID"='list-1' AND ld."RecordID" = ` +
            `CONCAT('OrderID|', "OrderID", '||', 'LineNo|', "LineNo"))`
        );
    });

    it('keeps the single-key cast intact', () => {
        const filter = ListMembershipFilter({ Name: 'OrderID', Type: 'uuid' }, '__mj.vwListDetails', 'list-1');
        expect(toPG(filter)).toBe(
            `"OrderID" IN (SELECT CAST("RecordID" AS uuid) FROM __mj."vwListDetails" WHERE "ListID"='list-1')`
        );
    });
});
