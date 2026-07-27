import { describe, it, expect, vi, beforeEach } from 'vitest';

// UserCache lives in the SQL Server provider package (its relocation is a tracked follow-up),
// which drags mssql in on import. Mock it down to the one method the feeder calls so this stays
// a real unit test with no driver and no database.
const { mockRefreshFromRows } = vi.hoisted(() => ({ mockRefreshFromRows: vi.fn() }));
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    UserCache: { Instance: { RefreshFromRows: mockRefreshFromRows } },
}));

import { feedUserCacheFromPG } from '../pg-user-cache';
import type { PostgresQueryable } from '../pg-user-cache';
import type { IMetadataProvider } from '@memberjunction/core';

const provider = { ConfigData: { MJCoreSchemaName: '__mj' } } as unknown as IMetadataProvider;

/** A pg.Pool stand-in that answers each query in call order. */
function queryable(...responses: Record<string, unknown>[][]): PostgresQueryable & { sql: string[] } {
    const sql: string[] = [];
    let call = 0;
    return {
        sql,
        query: async (text: string) => {
            sql.push(text);
            return { rows: responses[call++] ?? [] };
        },
    };
}

describe('feedUserCacheFromPG', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should hand the fetched rows to the platform-neutral cache seam', async () => {
        const users = [{ ID: 'u1', Name: 'Alice' }];
        const roles = [{ UserID: 'u1', Role: 'Developer' }];

        await feedUserCacheFromPG(queryable(users, roles), '__mj', provider);

        expect(mockRefreshFromRows).toHaveBeenCalledWith(users, roles, provider);
    });

    it('should double-quote the schema so a mixed-case name is not folded to lowercase', async () => {
        const db = queryable([{ ID: 'u1' }], []);

        await feedUserCacheFromPG(db, 'MyCore', provider);

        expect(db.sql[0]).toBe('SELECT * FROM "MyCore"."vwUsers"');
        expect(db.sql[1]).toBe('SELECT * FROM "MyCore"."vwUserRoles"');
    });

    it('should read users before roles, since the role join is keyed off the user rows', async () => {
        const db = queryable([{ ID: 'u1' }], []);
        await feedUserCacheFromPG(db, '__mj', provider);
        expect(db.sql.map(s => (s.includes('vwUserRoles') ? 'roles' : 'users'))).toEqual(['users', 'roles']);
    });

    it('should wrap a query failure with the schema and remediation, and never populate the cache', async () => {
        const db: PostgresQueryable = {
            query: async () => { throw new Error('relation "__mj.vwUsers" does not exist'); },
        };

        await expect(feedUserCacheFromPG(db, '__mj', provider)).rejects.toThrow(/vwUsers.*__mj|__mj.*vwUsers/);
        await expect(feedUserCacheFromPG(db, '__mj', provider)).rejects.toThrow(/migrations-pg/);
        expect(mockRefreshFromRows).not.toHaveBeenCalled();
    });

    it('should preserve the original driver error as the cause', async () => {
        const original = new Error('connection terminated unexpectedly');
        const db: PostgresQueryable = { query: async () => { throw original; } };

        await expect(feedUserCacheFromPG(db, '__mj', provider)).rejects.toMatchObject({ cause: original });
    });

    it('should reject a missing connection rather than failing later inside the cache', async () => {
        await expect(
            feedUserCacheFromPG(undefined as unknown as PostgresQueryable, '__mj', provider)
        ).rejects.toThrow(/connection is required/i);
        expect(mockRefreshFromRows).not.toHaveBeenCalled();
    });

    it('should reject a missing core schema rather than emitting SQL against ""', async () => {
        await expect(feedUserCacheFromPG(queryable([]), '', provider)).rejects.toThrow(/schema name is required/i);
        expect(mockRefreshFromRows).not.toHaveBeenCalled();
    });

    it('should let the cache seam own the empty-users decision rather than second-guessing it', async () => {
        // The feeder deliberately does NOT pre-check for zero users — RefreshFromRows is the single
        // place that decision lives, so both platforms fail identically.
        mockRefreshFromRows.mockImplementation(() => { throw new Error('returned zero users'); });

        await expect(feedUserCacheFromPG(queryable([], []), '__mj', provider)).rejects.toThrow(/zero users/);
        expect(mockRefreshFromRows).toHaveBeenCalledWith([], [], provider);
    });
});
