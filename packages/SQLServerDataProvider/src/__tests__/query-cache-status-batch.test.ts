/**
 * SQLServerDataProvider's batched cache-status check for RunQuery client validation.
 *
 * A query's CacheValidationSQL returns `MaxUpdatedAt` and a row count. The field's documentation
 * tells authors to call the count `TotalRows`; older queries call it `RowCount`. The shared
 * implementation in GenericDatabaseProvider accepts both. This SQL Server override must too: when
 * it read only `RowCount`, a query written from the documentation reported no row count, never
 * validated as current, and every client check re-ran the whole query.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import type { RunQueryWithCacheCheckParams, UserInfo } from '@memberjunction/core';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

type CacheStatus = { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string };
type StatusItem = { index: number; item: RunQueryWithCacheCheckParams; query: MJQueryEntityExtended };

/** Answers every batched statement with the row the test supplies, and exposes the protected check. */
class StatusTestProvider extends SQLServerDataProvider {
    public Rows: Record<string, unknown>[][] = [];

    public override async ExecuteSQLBatch(queries: string[]): Promise<unknown[][]> {
        return queries.map((_sql, i) => this.Rows[i] ?? []);
    }

    public Check(items: StatusItem[], user?: UserInfo): Promise<Map<number, CacheStatus>> {
        return this.getBatchedQueryCacheStatus(items, user);
    }
}

function item(index: number): StatusItem {
    return {
        index,
        item: { params: { QueryID: `q-${index}` } },
        query: { ID: `q-${index}`, CacheValidationSQL: 'SELECT 1' } as unknown as MJQueryEntityExtended,
    };
}

describe('SQLServerDataProvider.getBatchedQueryCacheStatus', () => {
    it('reads the row count from a TotalRows column, as the CacheValidationSQL documentation asks', async () => {
        const provider = new StatusTestProvider();
        provider.Rows = [[{ MaxUpdatedAt: '2026-01-01T00:00:00Z', TotalRows: 7 }]];

        const status = (await provider.Check([item(0)])).get(0);

        expect(status).toEqual({ success: true, rowCount: 7, maxUpdatedAt: '2026-01-01T00:00:00.000Z' });
    });

    it('still reads a RowCount column', async () => {
        const provider = new StatusTestProvider();
        provider.Rows = [[{ MaxUpdatedAt: new Date('2026-01-01T00:00:00Z'), RowCount: 3 }]];

        expect((await provider.Check([item(0)])).get(0)).toEqual({ success: true, rowCount: 3, maxUpdatedAt: '2026-01-01T00:00:00.000Z' });
    });

    it('maps each result set to its own query, and an empty one to zero rows', async () => {
        const provider = new StatusTestProvider();
        provider.Rows = [[{ MaxUpdatedAt: null, RowCount: 0 }], []];

        const statuses = await provider.Check([item(4), item(9)]);

        expect(statuses.get(4)).toEqual({ success: true, rowCount: 0, maxUpdatedAt: undefined });
        expect(statuses.get(9)).toEqual({ success: true, rowCount: 0, maxUpdatedAt: undefined });
    });
});
