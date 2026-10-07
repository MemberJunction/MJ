import type {
    BindingValidationIssue, DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition,
    PartitionStateRecord, SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { BACKLOG_COUNT_CAP } from '../../constants';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { BacklogRow, DeadLetterRow, IsolationRow, PartitionRow, StatsRow } from '../../sql/rows';
import { ExecuteRows, ExecuteWrite, ToBoolean, ToIsoString, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource } from '../../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../OwnedExecutor';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import { ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, MessageFromColumns, NormalizeRowID, TruncateNote } from './rowMapping';

/** The status can flip between the two guarded statements of a Discard (03 §5.2), so the pair is tried twice. */
const DISCARD_PASSES = 2;

export interface SubscriptionBacklog {
    Claimable: number;
    InFlight: number;
    /** A count stopped at BACKLOG_COUNT_CAP; the true figure is at least that. */
    Capped: boolean;
}

/**
 * The Database transport's operator (03 §5.2). It never executes on the shared source: it mints one independent
 * executor on first use, runs every statement there, and releases it in Close(). It opens no transaction on that
 * executor — every operator action is a single guarded procedure call.
 */
export class DatabaseTransportOperator implements ITransportOperator {
    private readonly sql: WorkQueueSqlBuilder;
    private readonly owned: OwnedExecutor;

    constructor(source: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(source);
        this.owned = new OwnedExecutor(source);
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const ids = ReadSubscriptionIDs(subscription);
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await this.rows<StatsRow>(this.sql.Operator.SubscriptionStats(ids.SubscriptionID, ordered));
        const row = rows[0];
        const age = ToNumber(row?.OldestPendingAgeSeconds);
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: ToNumber(row?.Pending) ?? 0,
            InFlight: ToNumber(row?.InFlight) ?? 0,
            DeadLettered: ToNumber(row?.DeadLettered) ?? 0,
            BlockedKeys: ordered ? ToNumber(row?.BlockedKeys) ?? 0 : null,
            OldestPendingAgeSeconds: age === null ? null : Math.max(0, age),
            CompletedLastHour: ToNumber(row?.CompletedLastHour) ?? 0,
            AsOf: new Date().toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord>> {
        const ids = ReadSubscriptionIDs(subscription);
        const size = ClampPageSize(pageSize);
        const after = cursor ? { DeliveryID: DecodeCursorField(cursor, 'DeliveryID') } : null;
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await this.rows<DeadLetterRow>(this.sql.Operator.ListDeadLetters(ids.SubscriptionID, ordered, after, size + 1));
        const page = rows.slice(0, size);
        const last = page[page.length - 1];
        return {
            Items: page.map(row => this.deadLetterFromRow(row, subscription.Policy.TopicName)),
            NextCursor: rows.length > size && last ? EncodeCursor({ DeliveryID: last.DeliveryID }) : null,
        };
    }

    public async ListPartitions(subscription: SubscriptionBinding, condition: PartitionCondition | null,
                                cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord>> {
        if (subscription.Policy.PartitionMode === 'None') {
            return { Items: [], NextCursor: null };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const size = ClampPageSize(pageSize);
        const afterKey = cursor ? DecodeCursorField(cursor, 'PartitionKey') : null;
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await this.rows<PartitionRow>(this.sql.Operator.ListPartitions(ids.SubscriptionID, ordered, condition, afterKey, size + 1));
        const page = rows.slice(0, size);
        const last = page[page.length - 1];
        return {
            Items: page.map(row => ({
                PartitionKey: row.PartitionKey,
                Condition: row.Condition,
                HeadDeliveryID: row.HeadDeliveryID === null ? null : NormalizeRowID(row.HeadDeliveryID),
                WaitingItems: ToNumber(row.WaitingItems) ?? 0,
            })),
            NextCursor: rows.length > size && last ? EncodeCursor({ PartitionKey: last.PartitionKey }) : null,
        };
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        if (!IsUUID(deliveryID)) {
            return { Supported: true, Changed: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const count = await this.write(this.sql.Operator.ReplayDelivery(ids.SubscriptionID, deliveryID, actorUserID, TruncateNote(note)));
        this.deps.Log.Info(`Replay of delivery ${deliveryID} on '${subscription.Policy.SubscriptionName}': ${count === 1 ? 'replayed' : 'not dead-lettered'}`);
        return { Supported: true, Changed: count === 1 };
    }

    /**
     * Pending or DeadLettered → Discarded at once. InFlight → the cancel flag is set (03 §7, F2): the lease token is left
     * unchanged, so the holder learns of it on its next heartbeat (≤ 30 s), stops, and acknowledges — freeing an
     * Exclusive/Ordered key immediately. If the holder is dead, ExpireLeases discards the row when the lease runs out.
     */
    public async Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        if (!IsUUID(deliveryID)) {
            return { Supported: true, Changed: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const name = subscription.Policy.SubscriptionName;
        const note = TruncateNote(reason) ?? '';
        for (let pass = 1; pass <= DISCARD_PASSES; pass++) {
            const discarded = await this.write(this.sql.Operator.DiscardDelivery(ids.SubscriptionID, deliveryID, true, actorUserID, note));
            if (discarded === 1) {
                this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': discarded (${note})`);
                return { Supported: true, Changed: true };
            }
            const cancelled = await this.write(this.sql.Operator.CancelInFlightDelivery(ids.SubscriptionID, deliveryID, actorUserID, note));
            if (cancelled === 1) {
                this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': in flight, cancel requested (${note})`);
                return { Supported: true, Changed: true, CancelRequested: true };
            }
        }
        this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': not discardable (${note})`);
        return { Supported: true, Changed: false };
    }

    /**
     * Autoscaler metric (03 §11). `Claimable` applies the partition rules, so a blocked Ordered key contributes
     * nothing; `InFlight` is reported separately because scalers subtract running executions from the metric. Each
     * count is capped (the procedure stops counting at the cap); `Capped` says a cap was hit.
     */
    public async GetBacklog(subscription: SubscriptionBinding): Promise<SubscriptionBacklog> {
        const ids = ReadSubscriptionIDs(subscription);
        const rows = await this.rows<BacklogRow>(
            this.sql.Consume.SubscriptionBacklog(ids.SubscriptionID, subscription.Policy.PartitionMode, BACKLOG_COUNT_CAP));
        const claimable = ToNumber(rows[0]?.Claimable) ?? 0;
        const inFlight = ToNumber(rows[0]?.InFlight) ?? 0;
        return {
            Claimable: Math.min(claimable, BACKLOG_COUNT_CAP),
            InFlight: Math.min(inFlight, BACKLOG_COUNT_CAP),
            Capped: claimable >= BACKLOG_COUNT_CAP || inFlight >= BACKLOG_COUNT_CAP,
        };
    }

    /** Database prerequisites (03 §6 "Isolation"): without snapshot reads, publishers, claimers and the scaler block each other. */
    public async CheckPrerequisites(): Promise<BindingValidationIssue[]> {
        const rows = await this.rows<IsolationRow>(this.sql.Operator.ReadCommittedSnapshotState());
        if (rows.length > 0 && !ToBoolean(rows[0].SnapshotOn)) {
            return [{
                Severity: 'Error',
                Subject: 'Database transport',
                Message: 'READ_COMMITTED_SNAPSHOT is OFF for this SQL Server database. The Database transport requires it '
                    + '(ALTER DATABASE [<name>] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;).',
            }];
        }
        return [];
    }

    /** Releases the operator's independent executor (03 §11). */
    public Close(): Promise<void> {
        return this.owned.Release();
    }

    private async rows<T>(statement: SqlStatement): Promise<T[]> {
        return ExecuteRows<T>(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private async write(statement: SqlStatement): Promise<number> {
        return ExecuteWrite(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private deadLetterFromRow(row: DeadLetterRow, topicName: string): DeadLetterRecord {
        return {
            DeliveryID: NormalizeRowID(row.DeliveryID),
            Message: MessageFromColumns(row, topicName),
            PartitionKey: row.DeliveryPartitionKey ?? row.PartitionKey,
            Attempts: ToNumber(row.AttemptCount) ?? 0,
            Reason: row.DeadLetterReason ?? 'Unknown',
            LastError: row.LastError,
            DeadLetteredAt: ToIsoString(row.DeadLetteredAt),
            BlocksKey: ToBoolean(row.BlocksKey),
        };
    }
}
