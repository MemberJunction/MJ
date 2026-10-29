/**
 * Provider-scoped PostgreSQLTransactionGroup lifecycle tests (Item 1.3).
 *
 * Verifies that `PostgreSQLDataProvider.CreateTransactionGroup()` binds the owning provider
 * instance instead of acquiring a separate `pool.connect()` client or reading global
 * `Metadata.Provider`, nests via `SAVEPOINT` inside an outer `provider.BeginTransaction()`,
 * and defers `RunAfterCommit` tasks until outermost commit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseEntity, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { Metadata, TransactionItem } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

vi.mock('pg', () => ({
    default: {
        Pool: vi.fn(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() })),
    },
}));

type PgRow = Record<string, string>;

interface FakePgClient {
    queries: string[];
    released: number;
    query: (sql: string, params?: PgRow[keyof PgRow][]) => Promise<{ rows: PgRow[] }>;
    release: () => void;
    escapeLiteral: (v: string) => string;
}

interface ConnectionManagerSurface {
    _connectionManager: {
        AcquireClient: () => Promise<FakePgClient>;
        Pool: FakePgClient;
    };
}

class TestPostgreSQLProvider extends PostgreSQLDataProvider {
    public QueuePostCommitTask(task: () => void | Promise<void>, label: string): void {
        this.RunAfterCommit(task, label);
    }
}

describe('PostgreSQLTransactionGroup — provider-scoped transaction lifecycle', () => {
    let provider: TestPostgreSQLProvider;
    let client: FakePgClient;
    let pool: FakePgClient;
    let acquireClientSpy: ReturnType<typeof vi.fn>;
    let globalSpyProvider: { ProcessEntityRows: ReturnType<typeof vi.fn> };
    let previousGlobalProvider: IMetadataProvider | undefined;
    let nextFailureSql: string | null;

    beforeEach(() => {
        nextFailureSql = null;
        const makeClient = (): FakePgClient => {
            const c: FakePgClient = {
                queries: [],
                released: 0,
                query: vi.fn(async (sql: string) => {
                    c.queries.push(sql);
                    if (nextFailureSql && sql.includes(nextFailureSql)) {
                        throw new Error(`PG error on ${sql}`);
                    }
                    if (
                        sql === 'BEGIN' ||
                        sql === 'COMMIT' ||
                        sql === 'ROLLBACK' ||
                        sql.startsWith('SAVEPOINT ') ||
                        sql.startsWith('RELEASE SAVEPOINT ') ||
                        sql.startsWith('ROLLBACK TO SAVEPOINT ')
                    ) {
                        return { rows: [] };
                    }
                    return { rows: [{ ID: 'pg-row-1', Name: 'Saved' }] };
                }),
                release: vi.fn(() => {
                    c.released++;
                }),
                escapeLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
            };
            return c;
        };

        provider = new TestPostgreSQLProvider();
        client = makeClient();
        pool = makeClient();
        acquireClientSpy = vi.fn(async () => client);
        const cm = (provider as object as ConnectionManagerSurface)._connectionManager;
        cm.AcquireClient = acquireClientSpy;
        Object.defineProperty(cm, 'Pool', { value: pool, configurable: true });

        vi.spyOn(provider, 'ProcessEntityRows').mockImplementation(
            async (rows: PgRow[], _info: EntityInfo, _user?: UserInfo) => rows,
        );

        globalSpyProvider = {
            ProcessEntityRows: vi.fn(async (rows: PgRow[]) => rows),
        };
        previousGlobalProvider = Metadata.Provider;
        Metadata.Provider = globalSpyProvider as object as IMetadataProvider;
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider as IMetadataProvider;
    });

    function makeItem(
        sql: string,
        onCallback?: (row: PgRow, success: boolean) => void | Promise<void>,
    ): TransactionItem {
        const fakeEntity = {
            EntityInfo: { Name: 'Widgets' },
            ContextCurrentUser: { ID: 'u-1' },
            ProviderToUse: provider,
        } as object as BaseEntity;
        return new TransactionItem(
            fakeEntity,
            'Create',
            sql,
            null,
            { dataSource: pool, entityName: 'Widgets', parameters: ['Alpha'] },
            async (row: PgRow, success: boolean) => {
                if (onCallback) {
                    await onCallback(row, success);
                }
            },
        );
    }

    it('uses the owning PostgreSQLDataProvider client & lifecycle rather than global Metadata.Provider or raw pool.connect()', async () => {
        const events: string[] = [];
        const tg = await provider.CreateTransactionGroup();
        tg.AddTransaction(
            makeItem('SELECT * FROM sp_create_widget($1)', (_row, ok) => {
                if (ok) {
                    events.push(`callback:inTx=${provider.IsInTransaction}`);
                    provider.QueuePostCommitTask(() => {
                        events.push(`afterCommit:inTx=${provider.IsInTransaction}`);
                    }, 'pg-after-commit');
                }
            }),
        );

        const ok = await tg.Submit();

        expect(ok).toBe(true);
        expect(acquireClientSpy).toHaveBeenCalledTimes(1);
        expect(globalSpyProvider.ProcessEntityRows).not.toHaveBeenCalled();
        expect(client.queries).toEqual([
            'BEGIN',
            'SELECT * FROM sp_create_widget($1)',
            'COMMIT',
        ]);
        expect(client.released).toBe(1);
        expect(events).toEqual([
            'callback:inTx=true',
            'afterCommit:inTx=false',
        ]);
    });

    it('shares the single active PoolClient via SAVEPOINT when nested inside provider.BeginTransaction() and recovers cleanly on group failure', async () => {
        const fired: string[] = [];
        await provider.BeginTransaction();
        provider.QueuePostCommitTask(() => {
            fired.push('outer');
        }, 'outer-task');

        // First nested group fails on statement 2 after statement 1 ran inside the savepoint —
        // should ROLLBACK TO SAVEPOINT without releasing the outer client and discard any inner tasks
        nextFailureSql = 'sp_create_bad';
        const failingGroup = await provider.CreateTransactionGroup();
        failingGroup.AddTransaction(
            makeItem('SELECT * FROM sp_create_first_in_savepoint($1)', (_row, ok) => {
                if (ok) {
                    provider.QueuePostCommitTask(() => {
                        fired.push('should-not-fire-callback');
                    }, 'discarded-cb');
                }
            }),
        );
        failingGroup.AddTransaction(
            makeItem('SELECT * FROM sp_create_bad($1)', (_row, ok) => {
                if (ok) {
                    provider.QueuePostCommitTask(() => {
                        fired.push('should-not-fire');
                    }, 'discarded');
                }
            }),
        );
        expect(await failingGroup.Submit()).toBe(false);
        expect(provider.IsInTransaction).toBe(true);
        expect(client.released).toBe(0);

        // Second nested group on the same outer transaction succeeds!
        nextFailureSql = null;
        const okGroup = await provider.CreateTransactionGroup();
        okGroup.AddTransaction(
            makeItem('SELECT * FROM sp_create_good($1)', (_row, ok) => {
                if (ok) {
                    provider.QueuePostCommitTask(() => {
                        fired.push('nested-good');
                    }, 'nested-good');
                }
            }),
        );
        expect(await okGroup.Submit()).toBe(true);
        expect(fired).toEqual([]); // Still deferred until outer CommitTransaction()!

        await provider.CommitTransaction();
        expect(provider.IsInTransaction).toBe(false);
        expect(acquireClientSpy).toHaveBeenCalledTimes(1); // Only ONE PoolClient checked out for the entire outer+nested flow!
        expect(client.released).toBe(1);
        expect(fired).toEqual(['outer', 'nested-good']);
        expect(client.queries).toEqual([
            'BEGIN',
            'SAVEPOINT mj_sp_1',
            'SELECT * FROM sp_create_first_in_savepoint($1)',
            'SELECT * FROM sp_create_bad($1)',
            'ROLLBACK TO SAVEPOINT mj_sp_1',
            'RELEASE SAVEPOINT mj_sp_1',
            'SAVEPOINT mj_sp_2',
            'SELECT * FROM sp_create_good($1)',
            'RELEASE SAVEPOINT mj_sp_2',
            'COMMIT',
        ]);
    });
});
