import { UUIDsEqual } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { ExpiredDeadLetterRow } from '../sql/rows';
import { ExecuteRows, ExecuteWrite } from '../sql/sqlExecution';
import { TryAcquireSweepLock } from '../sql/sweepLock';
import type { SweepLock } from '../sql/sweepLock';
import type { OperatorSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource, WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';

export interface WorkQueueSweeperEngine {
    /** Used only to name a dead-lettered delivery's subscription in the event. */
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    /** Public on the server engine (03 §11); fans out to OnDeadLettered listeners in THIS process. */
    NotifyDeadLettered(event: DeadLetteredEvent): void;
}

export interface WorkQueueSweeperOptions {
    PurgeBatchSize: number;
    MaxPurgeBatchesPerRun: number;
    /** Test seam. Default: plan 05's TryAcquireSweepLock — an independent executor guarded by the transaction-owned sweep lock. */
    AcquireLock?: (source: WorkQueueExecutorSource, contextUser: UserInfo) => Promise<SweepLock | null>;
    /** Test seam. Default: a DeduplicationLedger over the lock's executor. */
    CreateLedger?: (executor: WorkQueueSqlExecutor, contextUser: UserInfo) => Pick<DeduplicationLedger, 'PurgeExpired'>;
}

export const DEFAULT_SWEEPER_OPTIONS: WorkQueueSweeperOptions = { PurgeBatchSize: 1000, MaxPurgeBatchesPerRun: 20 };

/**
 * Idempotent maintenance for the Database transport. Statements come from the operator call builder (plan 05), so
 * the claim path and the sweeper can never disagree about lease expiry; this class takes the sweep lock, sequences
 * the calls on the lock's own executor (never the shared provider, F8), repeats purges and reports counts. One
 * sweeper runs at a time across all instances (03 §7, F9).
 */
export class WorkQueueSweeper {
    private running = false;
    private readonly options: WorkQueueSweeperOptions;

    constructor(
        private readonly executor: WorkQueueExecutorSource,
        private readonly engine: WorkQueueSweeperEngine,
        private readonly contextUser: UserInfo,
        private readonly log: WorkLogger,
        options: Partial<WorkQueueSweeperOptions> = {},
    ) {
        this.options = { ...DEFAULT_SWEEPER_OPTIONS, ...options };
    }

    /**
     * Runs one pass. Returns {} when a pass is already running here or another instance holds the sweep lock;
     * a failed step reports -1. ExpireLeases is the number of deliveries the pass DEAD-LETTERED.
     */
    public async RunOnce(): Promise<Record<string, number>> {
        if (this.running) {
            return {};
        }
        this.running = true;
        let lock: SweepLock | null = null;
        try {
            lock = await (this.options.AcquireLock ?? TryAcquireSweepLock)(this.executor, this.contextUser);
            if (!lock) {
                return {};
            }
            return await this.sweep(lock.Executor);
        } finally {
            await this.release(lock);
            this.running = false;
        }
    }

    private async sweep(executor: WorkQueueSqlExecutor): Promise<Record<string, number>> {
        const sql = CreateWorkQueueSqlBuilder(executor).Operator;
        const ledger = (this.options.CreateLedger ?? ((e, user) => new DeduplicationLedger(e, user)))(executor, this.contextUser);
        const result: Record<string, number> = {};
        result.ExpireLeases = await this.step('ExpireLeases', () => this.expireLeases(executor, sql));
        result.PurgeRetention = await this.step('PurgeRetention', () => this.purgeRetention(executor, sql));
        result.PurgeDeduplications = await this.step('PurgeDeduplications', () =>
            ledger.PurgeExpired(this.options.PurgeBatchSize, this.options.MaxPurgeBatchesPerRun));
        this.report(result);
        return result;
    }

    private async step(name: string, work: () => Promise<number>): Promise<number> {
        try {
            return await work();
        } catch (error) {
            this.log.Error(`Sweeper step ${name} failed`, error instanceof Error ? error : new Error(String(error)));
            return -1;
        }
    }

    /**
     * ExpireLeasesAll returns only the deliveries it dead-lettered (03 §7), so every lease-expiry dead letter reaches
     * the engine. Rows returned to Pending, or discarded because a cancel was pending, are not returned.
     */
    private async expireLeases(executor: WorkQueueSqlExecutor, sql: OperatorSqlBuilder): Promise<number> {
        const deadLettered = await ExecuteRows<ExpiredDeadLetterRow>(executor, sql.ExpireLeasesAll(), this.contextUser);
        for (const row of deadLettered) {
            this.engine.NotifyDeadLettered({
                SubscriptionName: this.subscriptionName(row.SubscriptionID),
                DeliveryID: row.DeliveryID,
                Reason: 'LeaseExpired',
                PartitionKey: row.PartitionKey,
            });
        }
        return deadLettered.length;
    }

    /** Falls back to the ID when metadata has not caught up with a subscription created since the last refresh. */
    private subscriptionName(subscriptionID: string): string {
        return this.engine.Subscriptions.find(s => UUIDsEqual(s.ID, subscriptionID))?.Name ?? subscriptionID;
    }

    private async purgeRetention(executor: WorkQueueSqlExecutor, sql: OperatorSqlBuilder): Promise<number> {
        const deliveries = await this.purgeInBatches(executor, size => sql.PurgeTerminalDeliveries(size));
        const messages = await this.purgeInBatches(executor, size => sql.PurgeOrphanMessages(size));
        return deliveries + messages;
    }

    private async purgeInBatches(executor: WorkQueueSqlExecutor, build: (batchSize: number) => SqlStatement): Promise<number> {
        let total = 0;
        for (let batch = 0; batch < this.options.MaxPurgeBatchesPerRun; batch++) {
            const deleted = await ExecuteWrite(executor, build(this.options.PurgeBatchSize), this.contextUser);
            total += deleted;
            if (deleted < this.options.PurgeBatchSize) {
                break;
            }
        }
        return total;
    }

    private async release(lock: SweepLock | null): Promise<void> {
        if (!lock) {
            return;
        }
        try {
            await lock.Release();
        } catch (error) {
            this.log.Error('Releasing the sweep lock failed', error instanceof Error ? error : new Error(String(error)));
        }
    }

    private report(result: Record<string, number>): void {
        const changed = Object.entries(result).filter(([, count]) => count > 0);
        if (changed.length > 0) {
            this.log.Info('Sweeper pass', Object.fromEntries(changed.map(([name, count]) => [name === 'ExpireLeases' ? 'DeadLetteredByLeaseExpiry' : name, count])));
        }
    }
}
