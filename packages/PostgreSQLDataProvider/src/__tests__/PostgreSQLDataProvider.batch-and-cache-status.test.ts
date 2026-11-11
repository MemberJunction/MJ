import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import {
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    RunViewWithCacheCheckParams,
} from '@memberjunction/core';
import {
    NamedQueryParameter,
    TypedQueryParameter,
    ExecuteSQLBatchOptions,
} from '@memberjunction/generic-database-provider';

// Mock pg module
vi.mock('pg', () => {
    const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release: vi.fn(),
    };

    const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };

    return {
        default: {
            Pool: vi.fn(() => mockPool),
        },
    };
});

type CapturedClient = {
    queries: string[];
    released: boolean;
    releaseError?: Error;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null } | Array<{ rows: unknown[]; rowCount?: number | null }>>;
    release: (err?: Error) => void;
};

class TestablePostgreSQLDataProvider extends PostgreSQLDataProvider {
    public override getBatchedServerCacheStatus(
        items: Array<{
            index: number;
            item: RunViewWithCacheCheckParams;
            entityInfo: EntityInfo;
            whereSQL: string;
            queryParameters?: NamedQueryParameter[];
        }>,
        contextUser?: UserInfo,
    ) {
        return super.getBatchedServerCacheStatus(items, contextUser);
    }
}

function installCustomFakeClient(provider: PostgreSQLDataProvider): CapturedClient {
    const client: CapturedClient = {
        queries: [],
        released: false,
        query: vi.fn(async (sql: string) => {
            client.queries.push(sql);
            return { rows: [] };
        }),
        release: vi.fn((err?: Error) => {
            client.released = true;
            client.releaseError = err;
        }),
    };

    const mockPool = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
            return client.query(sql, params);
        }),
        connect: vi.fn(async () => client),
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0,
    };

    const cm = (provider as unknown as {
        _connectionManager: {
            AcquireClient: () => Promise<CapturedClient>;
            InitializeWithExistingPool: (pool: unknown, config: unknown) => void;
        };
    })._connectionManager;

    cm.InitializeWithExistingPool(mockPool, {
        Host: 'localhost',
        Database: 'testdb',
        User: 'testuser',
        Password: 'testpassword',
    });
    cm.AcquireClient = vi.fn(async () => client);
    return client;
}

function mockEntityWithFields(name: string, schemaName: string, hasUpdatedAt: boolean): EntityInfo {
    const fields: EntityFieldInfo[] = [
        {
            Name: 'ID',
            IsUpdatedAtField: false,
        } as unknown as EntityFieldInfo,
    ];
    if (hasUpdatedAt) {
        fields.push({
            Name: '__mj_UpdatedAt',
            IsUpdatedAtField: true,
        } as unknown as EntityFieldInfo);
    }
    return {
        Name: name,
        SchemaName: schemaName,
        BaseView: `vw${name}`,
        Fields: fields,
    } as unknown as EntityInfo;
}

describe('PostgreSQLDataProvider - ExecuteSQLBatch & getBatchedServerCacheStatus', () => {
    let provider: TestablePostgreSQLDataProvider;

    beforeEach(() => {
        provider = new TestablePostgreSQLDataProvider();
    });

    describe('ExecuteSQLBatch', () => {
        it('returns empty array for empty queries without acquiring connection', async () => {
            const client = installCustomFakeClient(provider);
            const cm = (provider as unknown as { _connectionManager: { AcquireClient: unknown } })._connectionManager;

            const result = await provider.ExecuteSQLBatch([]);
            expect(result).toEqual([]);
            expect(cm.AcquireClient).not.toHaveBeenCalled();
            expect(client.queries).toHaveLength(0);
        });

        it('delegates single query to ExecuteSQL and returns single-element array', async () => {
            const client = installCustomFakeClient(provider);
            client.query = vi.fn(async () => ({ rows: [{ val: 42 }] }));

            const result = await provider.ExecuteSQLBatch(['SELECT 42 AS val']);
            expect(result).toEqual([[{ val: 42 }]]);
        });

        it('executes multiple unparameterized queries in a single client checkout and 1 network round-trip', async () => {
            const client = installCustomFakeClient(provider);
            const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<CapturedClient> } })._connectionManager;

            client.query = vi.fn(async (sql: string) => {
                client.queries.push(sql);
                if (sql.includes('pg_advisory_unlock_all')) {
                    return { rows: [] };
                }
                return [
                    { rows: [{ a: 1 }], rowCount: 1 },
                    { rows: [{ b: 2 }], rowCount: 1 },
                    { rows: [{ c: 3 }], rowCount: 1 },
                ];
            });

            const queries = ['SELECT 1 AS a', 'SELECT 2 AS b', 'SELECT 3 AS c'];
            const result = await provider.ExecuteSQLBatch(queries);

            // Verified: Exactly 1 checkout from pool
            expect(cm.AcquireClient).toHaveBeenCalledTimes(1);

            // Verified: Exactly 1 multi-statement query executed on client
            const mainQueries = client.queries.filter(q => !q.includes('pg_advisory_unlock_all'));
            expect(mainQueries).toHaveLength(1);

            // Verified: Semicolon separated statements
            expect(mainQueries[0]).toContain('SELECT 1 AS a');
            expect(mainQueries[0]).toContain('SELECT 2 AS b');
            expect(mainQueries[0]).toContain('SELECT 3 AS c');

            // Verified: Client released in finally
            expect(client.released).toBe(true);

            // Verified: Exact result array ordering
            expect(result).toEqual([
                [{ a: 1 }],
                [{ b: 2 }],
                [{ c: 3 }],
            ]);
        });

        it('safely handles trailing line comments (-- comment) without commenting out subsequent queries', async () => {
            const client = installCustomFakeClient(provider);

            client.query = vi.fn(async (sql: string) => {
                client.queries.push(sql);
                if (sql.includes('pg_advisory_unlock_all')) return { rows: [] };
                return [
                    { rows: [{ a: 1 }], rowCount: 1 },
                    { rows: [{ b: 2 }], rowCount: 1 },
                ];
            });

            const queries = [
                'SELECT 1 AS a -- trailing line comment without newline',
                'SELECT 2 AS b',
            ];
            const result = await provider.ExecuteSQLBatch(queries);

            const mainQueries = client.queries.filter(q => !q.includes('pg_advisory_unlock_all'));
            expect(mainQueries).toHaveLength(1);

            // Line comment must be separated by \n before the semicolon so the semicolon and next query are not commented out
            const executedSql = mainQueries[0];
            expect(executedSql).toMatch(/SELECT 1 AS a -- trailing line comment without newline\n;\nSELECT 2 AS b/);
            expect(result).toEqual([[{ a: 1 }], [{ b: 2 }]]);
        });

        it('safely handles queries that end with semicolon and trailing comments', async () => {
            const client = installCustomFakeClient(provider);

            client.query = vi.fn(async (sql: string) => {
                client.queries.push(sql);
                if (sql.includes('pg_advisory_unlock_all')) return { rows: [] };
                return [
                    { rows: [{ a: 1 }], rowCount: 1 },
                    { rows: [{ b: 2 }], rowCount: 1 },
                ];
            });

            const queries = [
                'SELECT 1 AS a; -- comment after semicolon',
                'SELECT 2 AS b;',
            ];
            const result = await provider.ExecuteSQLBatch(queries);

            const mainQueries = client.queries.filter(q => !q.includes('pg_advisory_unlock_all'));
            expect(mainQueries).toHaveLength(1);
            expect(result).toEqual([[{ a: 1 }], [{ b: 2 }]]);
        });

        it('executes parameterized queries sequentially on the SAME single checked-out connection', async () => {
            const client = installCustomFakeClient(provider);
            const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<CapturedClient> } })._connectionManager;

            const capturedParams: unknown[][] = [];
            client.query = vi.fn(async (sql: string, params?: unknown[]) => {
                client.queries.push(sql);
                if (params) capturedParams.push(params);
                if (sql.includes('pg_advisory_unlock_all')) return { rows: [] };
                if (sql.includes('users')) return { rows: [{ id: params?.[0], name: 'User 1' }] };
                if (sql.includes('orders')) return { rows: [{ id: params?.[0], total: 100 }] };
                return { rows: [] };
            });

            const queries = [
                'SELECT * FROM users WHERE id = $1',
                'SELECT * FROM orders WHERE user_id = $1',
            ];
            const params = [['u-101'], ['u-101']];

            const result = await provider.ExecuteSQLBatch(queries, params);

            // Single client acquired and released once
            expect(cm.AcquireClient).toHaveBeenCalledTimes(1);
            expect(client.released).toBe(true);

            // Two queries run sequentially on that same client with respective parameters
            const queryCalls = client.queries.filter(q => !q.includes('pg_advisory_unlock_all'));
            expect(queryCalls).toHaveLength(2);
            expect(capturedParams).toEqual([['u-101'], ['u-101']]);

            expect(result).toEqual([
                [{ id: 'u-101', name: 'User 1' }],
                [{ id: 'u-101', total: 100 }],
            ]);
        });

        it('releases checked-out connection in finally block even when a query fails', async () => {
            const client = installCustomFakeClient(provider);

            client.query = vi.fn(async (sql: string) => {
                if (sql.includes('pg_advisory_unlock_all')) return { rows: [] };
                throw new Error('Database syntax error in batch');
            });

            await expect(provider.ExecuteSQLBatch(['SELECT 1', 'SELECT 2'])).rejects.toThrow('Database syntax error in batch');

            // Verified: Connection is released in finally even on error
            expect(client.released).toBe(true);
        });

        it('uses ambient transaction connection without releasing it prematurely', async () => {
            const client = installCustomFakeClient(provider);

            client.query = vi.fn(async (sql: string) => {
                client.queries.push(sql);
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
                return [
                    { rows: [{ x: 10 }] },
                    { rows: [{ y: 20 }] },
                ];
            });

            await provider.BeginTransaction();
            expect(provider.IsInTransaction).toBe(true);

            const result = await provider.ExecuteSQLBatch(['SELECT 10 AS x', 'SELECT 20 AS y']);
            expect(result).toEqual([[{ x: 10 }], [{ y: 20 }]]);

            // The client must NOT be released while the ambient transaction is still active!
            expect(client.released).toBe(false);

            await provider.CommitTransaction();
            expect(client.released).toBe(true);
        });

        it('acquires and releases a separate client when ignoreAmbientTransaction is true inside a transaction', async () => {
            const txClient = installCustomFakeClient(provider);
            txClient.query = vi.fn(async (sql: string) => {
                txClient.queries.push(sql);
                return { rows: [] };
            });

            await provider.BeginTransaction();

            // Prepare a second client for the non-transactional batch
            const poolClient: CapturedClient = {
                queries: [],
                released: false,
                query: vi.fn(async (sql: string) => {
                    poolClient.queries.push(sql);
                    if (sql.includes('pg_advisory_unlock_all')) return { rows: [] };
                    return [{ rows: [{ a: 1 }] }, { rows: [{ b: 2 }] }];
                }),
                release: vi.fn(() => { poolClient.released = true; }),
            };

            const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<CapturedClient> } })._connectionManager;
            cm.AcquireClient = vi.fn(async () => poolClient);

            const options: ExecuteSQLBatchOptions = { ignoreAmbientTransaction: true };
            const result = await provider.ExecuteSQLBatch(['SELECT 1 AS a', 'SELECT 2 AS b'], undefined, options);

            expect(result).toEqual([[{ a: 1 }], [{ b: 2 }]]);
            expect(poolClient.released).toBe(true);
            expect(txClient.released).toBe(false);

            await provider.CommitTransaction();
            expect(txClient.released).toBe(true);
        });
    });

    describe('getBatchedServerCacheStatus', () => {
        it('returns empty Map for empty items array', async () => {
            const results = await provider.getBatchedServerCacheStatus([]);
            expect(results.size).toBe(0);
        });

        it('combines status checks into a single UNION ALL query and correctly maps row count and maxUpdatedAt', async () => {
            const entityA = mockEntityWithFields('Customers', 'crm', true);
            const entityB = mockEntityWithFields('AuditLogs', '__mj', false);

            let capturedSql = '';
            vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
                capturedSql = sql;
                return [
                    {
                        ItemIndex: 0,
                        TotalRows: '150',
                        MaxUpdatedAt: '2026-11-10T15:30:00.000Z',
                    },
                    {
                        ItemIndex: 1,
                        TotalRows: '500',
                        MaxUpdatedAt: null,
                    },
                ] as never;
            });

            const items: Array<{
                index: number;
                item: RunViewWithCacheCheckParams;
                entityInfo: EntityInfo;
                whereSQL: string;
                queryParameters?: NamedQueryParameter[];
            }> = [
                {
                    index: 0,
                    item: { params: { EntityName: 'Customers' } },
                    entityInfo: entityA,
                    whereSQL: '"Status" = \'Active\'',
                },
                {
                    index: 1,
                    item: { params: { EntityName: 'AuditLogs' } },
                    entityInfo: entityB,
                    whereSQL: '',
                },
            ];

            const results = await provider.getBatchedServerCacheStatus(items);

            // Verified: Generates a single UNION ALL query
            expect(capturedSql).toContain('UNION ALL');

            // Branch 0 has __mj_UpdatedAt casting to timestamptz
            expect(capturedSql).toContain('SELECT 0 AS "ItemIndex", COUNT(*) AS "TotalRows", MAX("__mj_UpdatedAt")::timestamptz AS "MaxUpdatedAt" FROM "crm"."vwCustomers" WHERE "Status" = \'Active\'');

            // Branch 1 lacks updated at column and uses CAST(NULL AS timestamptz)
            expect(capturedSql).toContain('SELECT 1 AS "ItemIndex", COUNT(*) AS "TotalRows", CAST(NULL AS timestamptz) AS "MaxUpdatedAt" FROM "__mj"."vwAuditLogs"');

            // Result mapping
            expect(results.get(0)).toEqual({
                success: true,
                rowCount: 150,
                maxUpdatedAt: '2026-11-10T15:30:00.000Z',
            });
            expect(results.get(1)).toEqual({
                success: true,
                rowCount: 500,
                maxUpdatedAt: undefined,
            });
        });

        it('correctly handles an empty table returning 0 rows and null maxUpdatedAt', async () => {
            const entity = mockEntityWithFields('EmptyTable', '__mj', true);

            vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async () => {
                return [
                    {
                        ItemIndex: 0,
                        TotalRows: '0',
                        MaxUpdatedAt: null,
                    },
                ] as never;
            });

            const items = [
                {
                    index: 0,
                    item: { params: { EntityName: 'EmptyTable' } },
                    entityInfo: entity,
                    whereSQL: '',
                },
            ];

            const results = await provider.getBatchedServerCacheStatus(items);
            expect(results.get(0)).toEqual({
                success: true,
                rowCount: 0,
                maxUpdatedAt: undefined,
            });
        });

        it('falls back to super per-item probe when the UNION ALL query throws', async () => {
            const entityA = mockEntityWithFields('ValidTable', '__mj', true);
            const entityB = mockEntityWithFields('BrokenTable', '__mj', true);

            let unionAttempted = false;
            let individualQueriesRun = 0;

            vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
                if (sql.includes('UNION ALL')) {
                    unionAttempted = true;
                    throw new Error('relation "__mj"."vwBrokenTable" does not exist');
                }
                individualQueriesRun++;
                if (sql.includes('BrokenTable')) {
                    throw new Error('relation "__mj"."vwBrokenTable" does not exist');
                }
                return [{ TotalRows: '10', MaxUpdatedAt: '2026-11-10T10:00:00.000Z' }] as never;
            });

            const items = [
                {
                    index: 0,
                    item: { params: { EntityName: 'ValidTable' } },
                    entityInfo: entityA,
                    whereSQL: '',
                },
                {
                    index: 1,
                    item: { params: { EntityName: 'BrokenTable' } },
                    entityInfo: entityB,
                    whereSQL: '',
                },
            ];

            const results = await provider.getBatchedServerCacheStatus(items);

            expect(unionAttempted).toBe(true);
            expect(individualQueriesRun).toBe(2);

            // ValidTable succeeded in individual probe
            expect(results.get(0)?.success).toBe(true);
            expect(results.get(0)?.rowCount).toBe(10);

            // BrokenTable reported error
            expect(results.get(1)?.success).toBe(false);
            expect(results.get(1)?.errorMessage).toContain('does not exist');
        });

        it('falls back to per-item probe when any item has bound queryParameters', async () => {
            const entity = mockEntityWithFields('ParameterizedTable', '__mj', true);

            let unionAttempted = false;
            vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
                if (sql.includes('UNION ALL')) {
                    unionAttempted = true;
                }
                return [{ TotalRows: '5', MaxUpdatedAt: '2026-11-10T08:00:00.000Z' }] as never;
            });

            const items = [
                {
                    index: 0,
                    item: { params: { EntityName: 'ParameterizedTable' } },
                    entityInfo: entity,
                    whereSQL: '"Status" = $1',
                    queryParameters: [new NamedQueryParameter('$1', 'Active')],
                },
            ];

            const results = await provider.getBatchedServerCacheStatus(items);
            expect(unionAttempted).toBe(false);
            expect(results.get(0)?.success).toBe(true);
            expect(results.get(0)?.rowCount).toBe(5);
        });
    });

    describe('Positional $1, $2 parameter handling in ExecuteSQL', () => {
        it('passes raw string and number positional parameters to driver', async () => {
            const client = installCustomFakeClient(provider);
            let capturedParams: unknown[] | undefined;

            client.query = vi.fn(async (sql: string, params?: unknown[]) => {
                client.queries.push(sql);
                capturedParams = params;
                return { rows: [{ id: 'user-1', age: 30 }] };
            });

            const query = 'SELECT * FROM __mj.vwUsers WHERE "ID" = $1 AND "Age" = $2';
            const params = ['user-1', 30];

            const rows = await provider.ExecuteSQL<{ id: string; age: number }>(query, params);
            expect(rows).toEqual([{ id: 'user-1', age: 30 }]);
            expect(capturedParams).toEqual(['user-1', 30]);
            expect(client.queries[0]).toContain('WHERE "ID" = $1 AND "Age" = $2');
        });

        it('unwraps NamedQueryParameter and TypedQueryParameter to positional parameter values', async () => {
            const client = installCustomFakeClient(provider);
            let capturedParams: unknown[] | undefined;

            client.query = vi.fn(async (sql: string, params?: unknown[]) => {
                client.queries.push(sql);
                capturedParams = params;
                return { rows: [{ count: 1 }] };
            });

            const query = 'SELECT COUNT(*) AS count FROM __mj.vwUsers WHERE "ID" = $1 AND "Status" = $2';
            const params = [
                new NamedQueryParameter('$1', 'user-abc'),
                new TypedQueryParameter('Status', 'varchar', 'Active'),
            ];

            const rows = await provider.ExecuteSQL<{ count: number }>(query, params);
            expect(rows).toEqual([{ count: 1 }]);
            expect(capturedParams).toEqual(['user-abc', 'Active']);
        });

        it('auto-quotes PascalCase identifiers while preserving positional $1, $2 parameter placeholders', async () => {
            const client = installCustomFakeClient(provider);

            client.query = vi.fn(async (sql: string) => {
                client.queries.push(sql);
                return { rows: [{ TestRun: 'Run-1' }] };
            });

            const rawQuery = 'SELECT TestRun, CreatedAt FROM __mj.vwAIAgentRuns WHERE Status = $1 AND AgentID = $2';
            await provider.ExecuteSQL(rawQuery, ['Completed', 'agent-99']);

            const executedSql = client.queries[0];
            expect(executedSql).toContain('"TestRun"');
            expect(executedSql).toContain('"CreatedAt"');
            expect(executedSql).toContain('"Status" = $1');
            expect(executedSql).toContain('"AgentID" = $2');
        });
    });
});
