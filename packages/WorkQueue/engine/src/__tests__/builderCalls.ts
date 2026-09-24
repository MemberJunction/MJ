import type { SqlBuilderContext, SqlStatement } from '../sql/WorkQueueSqlExecutor';
import { WorkQueueConsumeSql } from '../sql/WorkQueueConsumeSql';
import { WorkQueuePublishSql } from '../sql/WorkQueuePublishSql';

export const TOPIC = 'AAAAAAAA-0000-0000-0000-000000000001';
export const SUB = 'BBBBBBBB-0000-0000-0000-000000000001';
export const MSG = 'CCCCCCCC-0000-0000-0000-000000000001';
export const DELIVERY = 'DDDDDDDD-0000-0000-0000-000000000001';
export const TOKEN = 'EEEEEEEE-0000-0000-0000-000000000001';
export const USER = 'FFFFFFFF-0000-0000-0000-000000000001';

export interface SampleCall {
    Method: string;
    Statement: SqlStatement;
}

/**
 * One representative invocation of every builder method that calls a procedure, so the parity test can check each
 * call's procedure name and argument order against the migration. Grows with each builder (Tasks 3–5).
 */
export function SampleCalls(context: SqlBuilderContext): SampleCall[] {
    const publish = new WorkQueuePublishSql(context);
    const consume = new WorkQueueConsumeSql(context);
    return [
        { Method: 'Publish.AcquirePublishOrderLock', Statement: publish.AcquirePublishOrderLock(TOPIC, 'venue-42', 5000) },
        { Method: 'Publish.InsertMessage', Statement: publish.InsertMessage({
            ID: MSG, TopicID: TOPIC, PartitionKey: 'venue-42', AttributesJSON: '{}', PayloadJSON: '{}', PayloadRefJSON: null,
            CorrelationID: null, PublishedByUserID: null,
        }) },
        { Method: 'Publish.SelectMessage', Statement: publish.SelectMessage(MSG) },
        { Method: 'Publish.InsertDeliveries', Statement: publish.InsertDeliveries([{ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 1 }]) },
        { Method: 'Publish.ReserveDeduplication', Statement: publish.ReserveDeduplication(TOPIC, 'k1', MSG, 120) },
        { Method: 'Publish.SelectDeduplicationOwner', Statement: publish.SelectDeduplicationOwner(TOPIC, 'k1') },
        { Method: 'Publish.ConfirmDeduplication', Statement: publish.ConfirmDeduplication(TOPIC, 'k1', MSG, 86400) },
        { Method: 'Publish.ReleaseDeduplication', Statement: publish.ReleaseDeduplication(TOPIC, 'k1', MSG) },
        { Method: 'Publish.PurgeExpiredDeduplications', Statement: publish.PurgeExpiredDeduplications(500) },
        { Method: 'Consume.ExpireLeases', Statement: consume.ExpireLeases(SUB, 5) },
        { Method: 'Consume.SubscriptionBacklog', Statement: consume.SubscriptionBacklog(SUB, 'Ordered', 1000) },
        { Method: 'Consume.ClaimUnpartitioned', Statement: consume.ClaimUnpartitioned(SUB, 'worker-1', 60, 10) },
        { Method: 'Consume.SelectPartitionCandidates', Statement: consume.SelectPartitionCandidates(SUB, 'Exclusive', 10) },
        { Method: 'Consume.ClaimPartitionCandidate', Statement: consume.ClaimPartitionCandidate(SUB, DELIVERY, 'Ordered', 'worker-1', 60) },
        { Method: 'Consume.ExtendLease', Statement: consume.ExtendLease(DELIVERY, TOKEN, 60, null) },
        { Method: 'Consume.SelectLeaseState', Statement: consume.SelectLeaseState(DELIVERY, TOKEN) },
        { Method: 'Consume.CompleteDelivery', Statement: consume.CompleteDelivery(DELIVERY, TOKEN) },
        { Method: 'Consume.RetryDelivery', Statement: consume.RetryDelivery(DELIVERY, TOKEN, 30, 'boom') },
        { Method: 'Consume.DeadLetterDelivery', Statement: consume.DeadLetterDelivery(DELIVERY, TOKEN, 'MaxAttempts', 'boom') },
        { Method: 'Consume.ReleaseDelivery', Statement: consume.ReleaseDelivery(DELIVERY, TOKEN) },
        { Method: 'Consume.AcknowledgeCancel', Statement: consume.AcknowledgeCancel(DELIVERY, TOKEN) },
    ];
}
