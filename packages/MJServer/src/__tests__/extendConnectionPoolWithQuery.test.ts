/**
 * `ExtendConnectionPoolWithQuery` gives an mssql `ConnectionPool` a TypeORM-style `query`. On
 * PostgreSQL, `context.dataSource` is the PG compatibility pool, whose own `query` must survive:
 * replacing it with an mssql-backed one broke every caller on PostgreSQL (#3427).
 */
import { describe, it, expect } from 'vitest';
import sql from 'mssql';
import { ExtendConnectionPoolWithQuery } from '../util.js';

describe('ExtendConnectionPoolWithQuery', () => {
    it('returns a non-mssql pool unchanged, keeping its own query', () => {
        const ownQuery = async (): Promise<unknown[]> => [{ ok: true }];
        const pgLikePool = { query: ownQuery };
        const result = ExtendConnectionPoolWithQuery(pgLikePool as unknown as sql.ConnectionPool);
        expect(result).toBe(pgLikePool);
        expect(result.query).toBe(ownQuery);
    });

    it('adds a query method to an mssql ConnectionPool', () => {
        const pool = new sql.ConnectionPool({ server: 'localhost', database: 'x', user: 'u', password: 'p', options: { trustServerCertificate: true } });
        const result = ExtendConnectionPoolWithQuery(pool);
        expect(result).toBe(pool);
        expect(typeof result.query).toBe('function');
    });
});
