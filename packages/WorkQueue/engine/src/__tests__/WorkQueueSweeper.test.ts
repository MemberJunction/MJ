import { describe, it, expect } from 'vitest';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { WorkQueueSweeper } from '../host/WorkQueueSweeper';
import type { WorkQueueSweeperEngine, WorkQueueSweeperOptions } from '../host/WorkQueueSweeper';
import { RecordingExecutor } from './fakes';
import { FakeSubscription, IDS, SilentLogger, TEST_USER } from './runtimeFakes';

const SWEEPER_SUBSCRIPTION = FakeSubscription({ ID: IDS.IntegrationSubscription, Name: 'integration.apply', TopicID: IDS.IntegrationTopic });

function engine(events: DeadLetteredEvent[] = []): WorkQueueSweeperEngine {
    return { Subscriptions: [SWEEPER_SUBSCRIPTION], NotifyDeadLettered: event => { events.push(event); } };
}

interface LedgerCall {
    BatchSize: number | undefined;
    MaxBatches: number | undefined;
}

interface SweepHarness {
    Options: Partial<WorkQueueSweeperOptions>;
    LedgerCalls: LedgerCall[];
    Released: () => number;
}

/** The pass runs on `lockExecutor` — the executor the sweep lock holds — never on the source passed to the constructor. */
function harness(lockExecutor: RecordingExecutor | null, ledgerResult: number | Error = 0, extra: Partial<WorkQueueSweeperOptions> = {}): SweepHarness {
    const ledgerCalls: LedgerCall[] = [];
    let released = 0;
    return {
        LedgerCalls: ledgerCalls,
        Released: () => released,
        Options: {
            AcquireLock: async () => (lockExecutor ? { Executor: lockExecutor, Release: async () => { released++; } } : null),
            CreateLedger: () => ({
                PurgeExpired: async (batchSize?: number, maxBatches?: number) => {
                    ledgerCalls.push({ BatchSize: batchSize, MaxBatches: maxBatches });
                    if (ledgerResult instanceof Error) {
                        throw ledgerResult;
                    }
                    return ledgerResult;
                },
            }),
            ...extra,
        },
    };
}

describe('WorkQueueSweeper.RunOnce', () => {
    it("runs plan 05's operator procedures in order on the lock's executor and reports counts", async () => {
        const source = new RecordingExecutor();
        const locked = new RecordingExecutor()
            .QueueRows([
                { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
                { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: null },
            ])
            .QueueRows([{ AffectedRows: 3 }])
            .QueueRows([{ AffectedRows: 4 }]);
        const h = harness(locked, 5, { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 5 });
        const sweeper = new WorkQueueSweeper(source, engine(), TEST_USER, new SilentLogger(), h.Options);
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: 2, PurgeRetention: 7, PurgeDeduplications: 5 });

        const operator = CreateWorkQueueSqlBuilder(locked).Operator;
        expect(locked.Calls.map(call => call.SQL)).toEqual([
            operator.ExpireLeasesAll().SQL,
            operator.PurgeTerminalDeliveries(10).SQL,
            operator.PurgeOrphanMessages(10).SQL,
        ]);
        expect(locked.Calls.every(call => call.Options?.isMutation === true)).toBe(true);
        expect(source.Calls).toHaveLength(0);                           // nothing rides the shared provider (F8)
        expect(h.LedgerCalls).toEqual([{ BatchSize: 10, MaxBatches: 5 }]);
        expect(h.Released()).toBe(1);
    });

    it('skips the pass when another instance holds the sweep lock', async () => {
        const source = new RecordingExecutor();
        const h = harness(null);
        const sweeper = new WorkQueueSweeper(source, engine(), TEST_USER, new SilentLogger(), h.Options);
        expect(await sweeper.RunOnce()).toEqual({});
        expect(source.Calls).toHaveLength(0);
        expect(h.LedgerCalls).toEqual([]);
    });

    it('raises every lease-expiry dead letter through the engine, with the subscription name resolved', async () => {
        const locked = new RecordingExecutor().QueueRows([
            { DeliveryID: IDS.DeliveryA, SubscriptionID: IDS.IntegrationSubscription, PartitionKey: 'venue-42' },
            { DeliveryID: IDS.DeliveryB, SubscriptionID: IDS.UnknownSubscription, PartitionKey: null },
        ]);
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(events), TEST_USER, new SilentLogger(), harness(locked).Options);
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(2);
        expect(events).toEqual([
            { SubscriptionName: 'integration.apply', DeliveryID: IDS.DeliveryA, Reason: 'LeaseExpired', PartitionKey: 'venue-42' },
            { SubscriptionName: IDS.UnknownSubscription, DeliveryID: IDS.DeliveryB, Reason: 'LeaseExpired', PartitionKey: null },
        ]);
    });

    it('reports zero dead letters when expired leases were only retried or discarded', async () => {
        const locked = new RecordingExecutor().QueueRows([]);
        const events: DeadLetteredEvent[] = [];
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(events), TEST_USER, new SilentLogger(), harness(locked).Options);
        expect((await sweeper.RunOnce()).ExpireLeases).toBe(0);
        expect(events).toEqual([]);
    });

    it('repeats a purge while batches come back full, up to the per-run cap', async () => {
        const locked = new RecordingExecutor()
            .QueueRows([])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 10 }])
            .QueueRows([{ AffectedRows: 0 }]);
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, new SilentLogger(),
            harness(locked, 0, { PurgeBatchSize: 10, MaxPurgeBatchesPerRun: 2 }).Options);
        const result = await sweeper.RunOnce();
        expect(result.PurgeRetention).toBe(20);
        expect(locked.Calls).toHaveLength(4);
    });

    it('works on PostgreSQL with the same step order', async () => {
        const locked = new RecordingExecutor('postgresql');
        const sweeper = new WorkQueueSweeper(new RecordingExecutor('postgresql'), engine(), TEST_USER, new SilentLogger(), harness(locked).Options);
        await sweeper.RunOnce();
        expect(locked.Calls[0].SQL).toBe(CreateWorkQueueSqlBuilder(locked).Operator.ExpireLeasesAll().SQL);
        expect(locked.Calls[0].SQL).toContain('SELECT * FROM __mj."spWorkQueueExpireLeasesAll"($1)');
    });

    it('reports a failing step as -1, still runs the rest, and releases the lock', async () => {
        const locked = new RecordingExecutor().QueueError(new Error('deadlock victim'));
        const log = new SilentLogger();
        const h = harness(locked, new Error('ledger down'));
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, log, h.Options);
        expect(await sweeper.RunOnce()).toEqual({ ExpireLeases: -1, PurgeRetention: 0, PurgeDeduplications: -1 });
        expect(log.Lines.filter(line => line.startsWith('error:'))).toHaveLength(2);
        expect(h.Released()).toBe(1);
    });

    it('returns an empty result when a pass is already running in this process', async () => {
        let release: () => void = () => {};
        const slow: Partial<WorkQueueSweeperOptions> = {
            ...harness(new RecordingExecutor()).Options,
            CreateLedger: () => ({ PurgeExpired: () => new Promise<number>(resolve => { release = () => resolve(0); }) }),
        };
        const sweeper = new WorkQueueSweeper(new RecordingExecutor(), engine(), TEST_USER, new SilentLogger(), slow);
        const first = sweeper.RunOnce();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(await sweeper.RunOnce()).toEqual({});
        release();
        expect(await first).toMatchObject({ PurgeDeduplications: 0 });
    });
});
