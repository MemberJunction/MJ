import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

/**
 * PostgreSQL dialect of the batched IS-A child discovery statement
 * (`BuildChildDiscoveryBatchSQL`): double-quoted identifiers, `CAST(... AS TEXT)`, single-quoted
 * literals with doubled quotes, one SELECT per keyed child joined by UNION ALL.
 */

interface ProviderTestSurface {
    BuildChildDiscoveryBatchSQL(childEntities: EntityInfo[], recordPKValues: string[]): string;
}

function child(name: string, baseView: string, pk: string | null, schema = '__mj'): EntityInfo {
    const pks = pk ? [{ Name: pk }] : [];
    return { Name: name, SchemaName: schema, BaseView: baseView, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

describe('PostgreSQLDataProvider.BuildChildDiscoveryBatchSQL', () => {
    const provider = new PostgreSQLDataProvider() as unknown as ProviderTestSurface;

    it('emits one SELECT per child joined by UNION ALL with pg quoting, a TEXT cast and a 1-based priority', () => {
        const sql = provider.BuildChildDiscoveryBatchSQL(
            [child('Meetings', 'vwMeetings', 'ID'), child('Publications', 'vwPublications', 'ID', 'sales')],
            ['a1', 'b2']
        );
        const parts = sql.split(' UNION ALL ');
        expect(parts).toHaveLength(2);
        expect(parts[0]).toBe(
            `SELECT 'Meetings' AS "EntityName", CAST("ID" AS TEXT) AS "RecordPK", 1 AS "Priority" FROM "__mj"."vwMeetings" WHERE "ID" IN ('a1', 'b2')`
        );
        expect(parts[1]).toContain('2 AS "Priority"');
        expect(parts[1]).toContain('FROM "sales"."vwPublications"');
    });

    it('escapes quotes in keys and names, skips children without a primary key, and returns empty for no keys', () => {
        const sql = provider.BuildChildDiscoveryBatchSQL(
            [child("O'Brien Types", 'vwOBrien', 'ID'), child('NoKey', 'vwNoKey', null)],
            ["x'y"]
        );
        expect(sql).not.toContain('UNION ALL');
        expect(sql).toContain(`'O''Brien Types' AS "EntityName"`);
        expect(sql).toContain(`IN ('x''y')`);
        expect(sql).not.toContain('vwNoKey');
        expect(provider.BuildChildDiscoveryBatchSQL([child('Meetings', 'vwMeetings', 'ID')], [])).toBe('');
    });
});
