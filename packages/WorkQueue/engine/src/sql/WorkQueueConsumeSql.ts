import { WorkQueueTables } from '../constants';
import { ProcedureCallBuilder } from './ProcedureCallBuilder';
import { WorkQueueProcedures } from './procedures';
import type { BacklogPartitionMode, ClaimPartitionMode } from './rows';
import type { SqlStatement } from './WorkQueueSqlExecutor';
import type { ConsumeSqlBuilder } from './WorkQueueSqlBuilder';

/**
 * Consumer calls (03 §7): expire, claim, heartbeat, settle, acknowledge a cancel. The claim rules (single flight per
 * key, Ordered head-of-line, skip-locked scans), the holder fence (ID + LeaseToken + InFlight + no cancel) and the
 * one-clock rule live in the procedures; the mode arguments here select the static predicate arms inside them.
 */
export class WorkQueueConsumeSql extends ProcedureCallBuilder implements ConsumeSqlBuilder {
    public ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ExpireLeases, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'MaxAttempts', Value: maxAttempts },
        ]);
    }

    public SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, cap: number): SqlStatement {
        return this.Call(WorkQueueProcedures.SubscriptionBacklog, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'Mode', Value: mode },
            { Name: 'Cap', Value: cap },
        ]);
    }

    public ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ClaimUnpartitioned, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'LeaseOwner', Value: leaseOwner },
            { Name: 'LeaseSeconds', Value: leaseSeconds },
            { Name: 'MaxRows', Value: maxRows },
        ]);
    }

    public SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, maxRows: number): SqlStatement {
        return this.Call(WorkQueueProcedures.SelectPartitionCandidates, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'Ordered', Value: mode === 'Ordered' },
            { Name: 'MaxRows', Value: maxRows },
        ]);
    }

    public ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode, leaseOwner: string, leaseSeconds: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ClaimPartitionCandidate, [
            { Name: 'SubscriptionID', Value: subscriptionID },
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'Ordered', Value: mode === 'Ordered' },
            { Name: 'LeaseOwner', Value: leaseOwner },
            { Name: 'LeaseSeconds', Value: leaseSeconds },
        ]);
    }

    public ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement {
        return this.Call(WorkQueueProcedures.ExtendLease, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
            { Name: 'LeaseSeconds', Value: leaseSeconds },
            { Name: 'Progress', Value: progressJSON },
        ]);
    }

    public SelectLeaseState(deliveryID: string, leaseToken: string): SqlStatement {
        return this.Call(WorkQueueProcedures.SelectLeaseState, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
        ]);
    }

    public CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        return this.Call(WorkQueueProcedures.CompleteDelivery, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
        ]);
    }

    public RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement {
        return this.Call(WorkQueueProcedures.RetryDelivery, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
            { Name: 'DelaySeconds', Value: delaySeconds },
            { Name: 'Error', Value: error },
        ]);
    }

    public DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement {
        return this.Call(WorkQueueProcedures.DeadLetterDelivery, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
            { Name: 'Reason', Value: reason },
            { Name: 'Error', Value: error },
        ]);
    }

    public ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        return this.Call(WorkQueueProcedures.ReleaseDelivery, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
        ]);
    }

    public AcknowledgeCancel(deliveryID: string, leaseToken: string): SqlStatement {
        return this.Call(WorkQueueProcedures.AcknowledgeCancel, [
            { Name: 'DeliveryID', Value: deliveryID },
            { Name: 'LeaseToken', Value: leaseToken },
        ]);
    }

    /**
     * The one raw statement, and deliberately not a procedure: it exists so the conformance harness can age rows
     * without waiting, runs under the developer login, and must never be grantable to a runtime role. Wrapped in the
     * dialect's affected-row-count form so `ExecuteWrite` reads it exactly as it reads a procedure.
     */
    public ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const secs = p.Add(seconds);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const update = this.Context.PlatformKey === 'postgresql'
            ? `UPDATE ${deliveries}
SET "VisibleAt" = "VisibleAt" - make_interval(secs => ${secs}::int), "LeaseExpiresAt" = "LeaseExpiresAt" - make_interval(secs => ${secs}::int)
WHERE "SubscriptionID" = ${sub}::uuid AND "Status" IN ('Pending', 'InFlight')`
            : `UPDATE ${deliveries}
SET [VisibleAt] = DATEADD(SECOND, -${secs}, [VisibleAt]), [LeaseExpiresAt] = DATEADD(SECOND, -${secs}, [LeaseExpiresAt])
WHERE [SubscriptionID] = ${sub} AND [Status] IN (N'Pending', N'InFlight')`;
        return this.Statement(this.Context.Dialect.AffectedRowCountSQL(update, 'AffectedRows'), p);
    }
}
