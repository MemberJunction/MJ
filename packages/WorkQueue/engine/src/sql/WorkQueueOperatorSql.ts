import type { PartitionCondition } from '@memberjunction/work-queue-core';
import { EXPIRE_LEASES_BATCH } from '../constants';
import { ProcedureCallBuilder } from './ProcedureCallBuilder';
import { WorkQueueProcedures } from './procedures';
import type { DeadLetterCursor } from './rows';
import type { SqlStatement } from './WorkQueueSqlExecutor';
import type { OperatorSqlBuilder } from './WorkQueueSqlBuilder';

/**
 * Operator, sweeper and topology-validation calls (03 §5.2, §7). Partition conditions are derived from the delivery
 * rows alone inside the procedures (InFlight, Blocked for an Ordered head that is dead-lettered, else Idle); stats are
 * per-status index seeks; cancel-in-flight stamps the flag and leaves the lease token unchanged (F2).
 */
export class WorkQueueOperatorSql extends ProcedureCallBuilder implements OperatorSqlBuilder {
    public SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement {
        return this.Call(WorkQueueProcedures.SubscriptionStats, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'Ordered', Value: ordered },
        ]);
    }

    public ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ListDeadLetters, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'Ordered', Value: ordered },
            { Name: 'AfterDeliveryID', Value: after?.DeliveryID ?? null },
            { Name: 'PageSize', Value: pageSize },
        ]);
    }

    public ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null, afterPartitionKey: string | null, pageSize: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ListPartitions, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'Ordered', Value: ordered },
            { Name: 'Condition', Value: condition },
            { Name: 'AfterPartitionKey', Value: afterPartitionKey },
            { Name: 'PageSize', Value: pageSize },
        ]);
    }

    public ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement {
        return this.Call(WorkQueueProcedures.ReplayDelivery, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'ActorUserID', Value: actorUserID },
            { Name: 'Note', Value: note },
        ]);
    }

    public DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement {
        return this.Call(WorkQueueProcedures.DiscardDelivery, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'AllowPending', Value: allowPending },
            { Name: 'ActorUserID', Value: actorUserID },
            { Name: 'Reason', Value: reason },
        ]);
    }

    public CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement {
        return this.Call(WorkQueueProcedures.CancelInFlightDelivery, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'ActorUserID', Value: actorUserID },
            { Name: 'Reason', Value: reason },
        ]);
    }

    public ExpireLeasesAll(batchSize: number = EXPIRE_LEASES_BATCH): SqlStatement {
        return this.Call(WorkQueueProcedures.ExpireLeasesAll, [{ Name: 'BatchSize', Value: batchSize }]);
    }

    public AcquireSweepLock(resource: string): SqlStatement {
        return this.Call(WorkQueueProcedures.AcquireSweepLock, [{ Name: 'Resource', Value: resource }]);
    }

    public ReadCommittedSnapshotState(): SqlStatement {
        return this.Call(WorkQueueProcedures.ReadCommittedSnapshotState, []);
    }

    public PurgeTerminalDeliveries(batchSize: number): SqlStatement {
        return this.Call(WorkQueueProcedures.PurgeTerminalDeliveries, [{ Name: 'BatchSize', Value: batchSize }]);
    }

    public PurgeOrphanMessages(batchSize: number): SqlStatement {
        return this.Call(WorkQueueProcedures.PurgeOrphanMessages, [{ Name: 'BatchSize', Value: batchSize }]);
    }
}
