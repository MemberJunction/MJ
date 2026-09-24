import type { SqlBuilderContext, SqlStatement } from '../sql/WorkQueueSqlExecutor';
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
    ];
}
