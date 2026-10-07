import { DELIVERY_INSERT_CHUNK } from '../constants';
import { ProcedureCallBuilder } from './ProcedureCallBuilder';
import { WorkQueueProcedures } from './procedures';
import type { DeliveryInsertRow, MessageInsertRow } from './rows';
import type { SqlStatement } from './WorkQueueSqlExecutor';
import { PublishOrderLockResource, type PublishSqlBuilder } from './WorkQueueSqlBuilder';

/**
 * Publish and deduplication-ledger calls (03 §2.1, F1, F10). The rules — insert only when no message has the ID,
 * PublishedAt from the database clock, re-take only this MessageID's own Reserved row — live in the procedures; this
 * class binds arguments in declared order.
 */
export class WorkQueuePublishSql extends ProcedureCallBuilder implements PublishSqlBuilder {
    /** The timeout is an argument of the lock procedure on both platforms, so nothing is prepared per transaction. */
    public PreparePublishOrderLock(_timeoutMs: number): SqlStatement | null {
        return null;
    }

    public AcquirePublishOrderLock(topicID: string, partitionKey: string, timeoutMs: number): SqlStatement {
        return this.Call(WorkQueueProcedures.AcquirePublishOrderLock, [
            { Name: 'Resource', Value: PublishOrderLockResource(topicID, partitionKey) },
            { Name: 'TimeoutMs', Value: timeoutMs },
        ]);
    }

    public InsertMessage(row: MessageInsertRow): SqlStatement {
        return this.Call(WorkQueueProcedures.InsertMessage, [
            { Name: 'ID', Value: row.ID },
            { Name: 'TopicID', Value: row.TopicID },
            { Name: 'PartitionKey', Value: row.PartitionKey },
            { Name: 'Attributes', Value: row.AttributesJSON },
            { Name: 'Payload', Value: row.PayloadJSON },
            { Name: 'PayloadRef', Value: row.PayloadRefJSON },
            { Name: 'CorrelationID', Value: row.CorrelationID },
            { Name: 'PublishedByUserID', Value: row.PublishedByUserID },
        ]);
    }

    public SelectMessage(messageID: string): SqlStatement {
        return this.Call(WorkQueueProcedures.SelectMessage, [{ Name: 'MessageID', Value: messageID }]);
    }

    /** The rows travel as one JSON array argument (OPENJSON / json_to_recordset), bounded per call by the driver's chunking. */
    public InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement {
        if (rows.length === 0 || rows.length > DELIVERY_INSERT_CHUNK) {
            throw new RangeError(`InsertDeliveries takes 1–${DELIVERY_INSERT_CHUNK} rows per call; got ${rows.length}`);
        }
        const deliveries = rows.map(row => ({
            MessageID: row.MessageID,
            SubscriptionID: row.SubscriptionID,
            PartitionKey: row.PartitionKey,
            OrderKey: row.OrderKey,
        }));
        return this.Call(WorkQueueProcedures.InsertDeliveries, [{ Name: 'Deliveries', Value: JSON.stringify(deliveries) }]);
    }

    public ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ReserveDeduplication, [
            { Name: 'TopicID', Value: topicID },
            { Name: 'DeduplicationKey', Value: key },
            { Name: 'MessageID', Value: messageID },
            { Name: 'ReserveSeconds', Value: reserveSeconds },
        ]);
    }

    public SelectDeduplicationOwner(topicID: string, key: string): SqlStatement {
        return this.Call(WorkQueueProcedures.SelectDeduplicationOwner, [
            { Name: 'TopicID', Value: topicID },
            { Name: 'DeduplicationKey', Value: key },
        ]);
    }

    public ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement {
        return this.Call(WorkQueueProcedures.ConfirmDeduplication, [
            { Name: 'TopicID', Value: topicID },
            { Name: 'DeduplicationKey', Value: key },
            { Name: 'MessageID', Value: messageID },
            { Name: 'TtlSeconds', Value: ttlSeconds },
        ]);
    }

    public ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement {
        return this.Call(WorkQueueProcedures.ReleaseDeduplication, [
            { Name: 'TopicID', Value: topicID },
            { Name: 'DeduplicationKey', Value: key },
            { Name: 'MessageID', Value: messageID },
        ]);
    }

    public PurgeExpiredDeduplications(batchSize: number): SqlStatement {
        return this.Call(WorkQueueProcedures.PurgeExpiredDeduplications, [{ Name: 'BatchSize', Value: batchSize }]);
    }
}
