/**
 * Deleting a connection an archive seed created: its pending-work rows and the connection go as one
 * unit, and the seed's data source only once that unit has committed.
 *
 * The cascade (`DeleteConnectionCore`) deletes the connection inside a TransactionGroup, where a
 * delete only queues and returns true before anything persists. These tests pin that, in a group,
 * the rows are queued in the SAME group (so a rolled-back group leaves them), and the data source is
 * deleted only after the group commits (so a rolled-back group leaves the connection pointing at a
 * data source that still exists). The ungrouped path keeps its provider transaction.
 *
 * The generated base is mocked to a stub whose `Delete()` mimics BaseEntity: immediate without a
 * group, queued with one, and finalized (the record reset) when the group commits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const state = vi.hoisted(() => ({
    rows: [] as Array<{ ID: string; Status: string; PayloadJSON: string; Deleted: boolean; TransactionGroup: unknown; Delete(): Promise<boolean> }>,
    dataSource: undefined as { ID: string; Deleted: boolean; Delete(): Promise<boolean> } | undefined,
    transactions: 0,
    rolledBack: 0,
    errors: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (message: string) => { state.errors.push(message); },
        RunView: class {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName === 'MJ: RSU Pending Works') {
                    return { Success: true, Results: state.rows };
                }
                return { Success: true, Results: state.dataSource ? [state.dataSource] : [] };
            }
        },
        RunInEntityTransaction: async (_provider: unknown, work: () => Promise<void>) => {
            state.transactions++;
            try {
                await work();
            } catch (err) {
                state.rolledBack++;
                throw err;
            }
        },
    };
});

vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationConnectorCreationPipeline: class {},
    IntegrationEngine: {},
    ConnectorFactory: {},
}));
vi.mock('../custom/IntegrationLLMPKCallback', () => ({ BuildIntegrationLLMPKCallback: async () => undefined }));

/** The minimal TransactionGroup surface the entity and its rows use. */
class FakeGroup {
    public Queued: Array<() => void> = [];
    private listeners: Array<(n: { success: boolean }) => void> = [];

    public get TransactionNotifications$() {
        return {
            subscribe: (listener: (n: { success: boolean }) => void) => {
                this.listeners.push(listener);
                return { unsubscribe: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
            },
        };
    }

    public Queue(apply: () => void): void {
        this.Queued.push(apply);
    }

    /** Commits (runs every queued delete) or rolls back (runs none), then notifies, as Submit() does. */
    public async Submit(succeeds: boolean): Promise<boolean> {
        if (succeeds) {
            this.Queued.forEach(apply => apply());
            this.Queued = [];
        }
        [...this.listeners].forEach(l => l({ success: succeeds }));
        return succeeds;
    }
}

vi.mock('@memberjunction/core-entities', () => {
    class StubCompanyIntegrationEntity {
        public ID = 'ci-1';
        public Configuration: string | null = null;
        public ContextCurrentUser: { ID: string } | null = { ID: 'u-1' };
        public TransactionGroup: FakeGroup | null = null;
        public Deleted = false;
        public Results: Array<{ Success: boolean; Message: string }> = [];
        public get RunViewProviderToUse(): object { return {}; }
        public get ProviderToUse(): object { return {}; }

        public async Delete(): Promise<boolean> {
            const group = this.TransactionGroup;
            if (!group) {
                this.Deleted = true;
                return true;
            }
            group.Queue(() => { this.Deleted = true; });
            // BaseEntity resets the record once the group commits.
            group.TransactionNotifications$.subscribe(({ success }) => { if (success) this.ID = ''; });
            return true;
        }

        public RegisterResultHistoryEntry(result: { Success: boolean; Message: string }): void {
            this.Results.push(result);
        }
    }
    return {
        MJCompanyIntegrationEntity: StubCompanyIntegrationEntity,
        MJExternalDataSourceEntity: class {},
        MJIntegrationEntity: class {},
        MJRSUPendingWorkEntity: class {},
    };
});

import { MJCompanyIntegrationEntityServer } from '../custom/MJCompanyIntegrationEntityServer.server';

/** The stub's own members, which the server class does not declare. */
interface StubState {
    Deleted: boolean;
    Results: Array<{ Success: boolean; Message: string }>;
    TransactionGroup: FakeGroup | null;
    Configuration: string | null;
}

function Row(id: string, status: string, payload: object) {
    const row = {
        ID: id,
        Status: status,
        PayloadJSON: JSON.stringify(payload),
        Deleted: false,
        TransactionGroup: null as FakeGroup | null,
        async Delete() {
            if (row.TransactionGroup) {
                row.TransactionGroup.Queue(() => { row.Deleted = true; });
            } else {
                row.Deleted = true;
            }
            return true;
        },
    };
    return row;
}

function SeededConnection(): MJCompanyIntegrationEntityServer & StubState {
    const ci = new MJCompanyIntegrationEntityServer() as MJCompanyIntegrationEntityServer & StubState;
    ci.Configuration = JSON.stringify({ seededFromBackup: { jobID: 'job-1' }, externalDataSourceID: 'eds-1' });
    return ci;
}

/** Lets the detached post-commit data source delete run. */
async function Settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

beforeEach(() => {
    state.rows = [
        Row('job-1', 'Completed', { WorkType: 'archive-seed', ArchiveSeed: { State: 'Done' } }),
        Row('apply-1', 'Failed', { WorkType: 'apply-objects' }),
    ];
    const ds = { ID: 'eds-1', Deleted: false, async Delete() { ds.Deleted = true; return true; } };
    state.dataSource = ds;
    state.transactions = 0;
    state.rolledBack = 0;
    state.errors = [];
});

describe('MJCompanyIntegrationEntityServer.Delete — seeded connection', () => {
    describe('without a TransactionGroup', () => {
        it('deletes the rows and the connection in one transaction, then the data source', async () => {
            const ci = SeededConnection();
            await expect(ci.Delete()).resolves.toBe(true);
            expect(state.transactions).toBe(1);
            expect(state.rows.every(r => r.Deleted)).toBe(true);
            expect(ci.Deleted).toBe(true);
            expect(state.dataSource?.Deleted).toBe(true);
        });

        it('refuses while the seed is still running and deletes nothing', async () => {
            state.rows = [Row('job-1', 'Pending', { WorkType: 'archive-seed', ArchiveSeed: { State: 'Loading' } })];
            const ci = SeededConnection();
            await expect(ci.Delete()).resolves.toBe(false);
            expect(ci.Results.at(-1)?.Message).toMatch(/still running/);
            expect(state.rows[0].Deleted).toBe(false);
            expect(ci.Deleted).toBe(false);
            expect(state.dataSource?.Deleted).toBe(false);
        });
    });

    describe('in a TransactionGroup', () => {
        it('queues the rows in the group ahead of the connection and opens no transaction of its own', async () => {
            const group = new FakeGroup();
            const ci = SeededConnection();
            ci.TransactionGroup = group;

            await expect(ci.Delete()).resolves.toBe(true);

            expect(state.transactions).toBe(0);
            expect(state.rows.every(r => r.TransactionGroup === group)).toBe(true);
            expect(group.Queued).toHaveLength(3);
            expect(state.rows.some(r => r.Deleted)).toBe(false);
            expect(ci.Deleted).toBe(false);
            expect(state.dataSource?.Deleted).toBe(false);
        });

        it('deletes the rows, the connection and then the data source when the group commits', async () => {
            const group = new FakeGroup();
            const ci = SeededConnection();
            ci.TransactionGroup = group;
            await ci.Delete();

            await expect(group.Submit(true)).resolves.toBe(true);
            await Settle();

            expect(state.rows.every(r => r.Deleted)).toBe(true);
            expect(ci.Deleted).toBe(true);
            expect(state.dataSource?.Deleted).toBe(true);
            expect(state.errors).toEqual([]);
        });

        it('leaves the rows, the connection and the data source when the group rolls back', async () => {
            const group = new FakeGroup();
            const ci = SeededConnection();
            ci.TransactionGroup = group;
            await ci.Delete();

            await expect(group.Submit(false)).resolves.toBe(false);
            await Settle();

            expect(state.rows.some(r => r.Deleted)).toBe(false);
            expect(ci.Deleted).toBe(false);
            expect(state.dataSource?.Deleted).toBe(false);
        });

        it('still deletes the data source when a retried submit commits after a rollback', async () => {
            const group = new FakeGroup();
            const ci = SeededConnection();
            ci.TransactionGroup = group;
            await ci.Delete();

            await group.Submit(false);
            await Settle();
            expect(state.dataSource?.Deleted).toBe(false);

            await group.Submit(true);
            await Settle();
            expect(state.dataSource?.Deleted).toBe(true);
        });

        it('refuses while the seed is still running and queues nothing', async () => {
            state.rows = [Row('job-1', 'Pending', { WorkType: 'archive-seed', ArchiveSeed: { State: 'Restoring' } })];
            const group = new FakeGroup();
            const ci = SeededConnection();
            ci.TransactionGroup = group;

            await expect(ci.Delete()).resolves.toBe(false);
            expect(group.Queued).toHaveLength(0);
        });
    });
});
