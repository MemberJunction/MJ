import { describe, it, expect } from 'vitest';
import { DELIVERY_INSERT_CHUNK } from '../constants';
import { WorkQueuePublishSql } from '../sql/WorkQueuePublishSql';
import { PublishOrderLockResource } from '../sql/WorkQueueSqlBuilder';
import type { MessageInsertRow } from '../sql/rows';
import { MSG, SUB, TOPIC } from './builderCalls';
import { RecordingExecutor } from './fakes';

const sql = new WorkQueuePublishSql(new RecordingExecutor('sqlserver'));
const pg = new WorkQueuePublishSql(new RecordingExecutor('postgresql'));

const MESSAGE: MessageInsertRow = {
    ID: MSG,
    TopicID: TOPIC,
    PartitionKey: 'venue-42',
    AttributesJSON: '{"eventType":"import"}',
    PayloadJSON: '{"importId":"x"}',
    PayloadRefJSON: null,
    CorrelationID: 'corr-1',
    PublishedByUserID: null,
};

describe('PublishOrderLockResource', () => {
    it('normalises the topic ID and keeps the key exactly as supplied', () => {
        expect(PublishOrderLockResource(TOPIC, 'Venue-42')).toBe('wq:aaaaaaaa-0000-0000-0000-000000000001:Venue-42');
        expect(PublishOrderLockResource(TOPIC, 'venue-42')).not.toBe(PublishOrderLockResource(TOPIC, 'Venue-42'));
    });
});

describe('WorkQueuePublishSql publish-order lock', () => {
    it('needs no per-transaction preparation: the timeout is an argument of the procedure', () => {
        expect(sql.PreparePublishOrderLock(5000)).toBeNull();
        expect(pg.PreparePublishOrderLock(5000)).toBeNull();
    });

    it('calls the lock procedure with the per-key resource and the timeout', () => {
        const statement = sql.AcquirePublishOrderLock(TOPIC, 'venue-42', 5000);
        expect(statement.SQL).toBe('EXEC [__mj].[spWorkQueueAcquirePublishOrderLock] @Resource=@p0, @TimeoutMs=@p1');
        expect(statement.Params).toEqual([PublishOrderLockResource(TOPIC, 'venue-42'), 5000]);
    });
});

describe('WorkQueuePublishSql message calls', () => {
    it('binds every message column in declared order and leaves PublishedAt to the database clock', () => {
        const statement = sql.InsertMessage(MESSAGE);
        expect(statement.SQL).toBe('EXEC [__mj].[spWorkQueueInsertMessage] @ID=@p0, @TopicID=@p1, @PartitionKey=@p2, @Attributes=@p3, @Payload=@p4, @PayloadRef=@p5, @CorrelationID=@p6, @PublishedByUserID=@p7');
        expect(statement.Params).toEqual([MSG, TOPIC, 'venue-42', '{"eventType":"import"}', '{"importId":"x"}', null, 'corr-1', null]);
    });

    it('renders the same call positionally on PostgreSQL', () => {
        const statement = pg.InsertMessage(MESSAGE);
        expect(statement.SQL).toBe('SELECT * FROM __mj."spWorkQueueInsertMessage"($1, $2, $3, $4, $5, $6, $7, $8)');
        expect(statement.Params).toEqual(sql.InsertMessage(MESSAGE).Params);
    });

    it('reads an existing message for the canonical-envelope comparison', () => {
        const existing = sql.SelectMessage(MSG);
        expect(existing.SQL).toBe('EXEC [__mj].[spWorkQueueSelectMessage] @MessageID=@p0');
        expect(existing.Params).toEqual([MSG]);
    });
});

describe('WorkQueuePublishSql.InsertDeliveries', () => {
    it('sends the rows as one JSON array argument with exactly the four columns the procedure reads', () => {
        const statement = sql.InsertDeliveries([
            { MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 10 },
            { MessageID: MSG, SubscriptionID: 'DDDDDDDD-0000-0000-0000-000000000001', PartitionKey: 'venue-42', OrderKey: 10 },
        ]);
        expect(statement.SQL).toBe('EXEC [__mj].[spWorkQueueInsertDeliveries] @Deliveries=@p0');
        expect(statement.Params).toHaveLength(1);
        expect(JSON.parse(statement.Params[0] as string)).toEqual([
            { MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 10 },
            { MessageID: MSG, SubscriptionID: 'DDDDDDDD-0000-0000-0000-000000000001', PartitionKey: 'venue-42', OrderKey: 10 },
        ]);
    });

    it('rejects empty and oversized batches', () => {
        expect(() => sql.InsertDeliveries([])).toThrow(RangeError);
        const tooMany = Array.from({ length: DELIVERY_INSERT_CHUNK + 1 }, () => ({ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 1 }));
        expect(() => sql.InsertDeliveries(tooMany)).toThrow(RangeError);
        expect(() => sql.InsertDeliveries(tooMany.slice(1))).not.toThrow();
    });
});

describe('WorkQueuePublishSql deduplication ledger (03 §2.1, F1)', () => {
    it('reserves with topic, key, message and reservation lifetime', () => {
        const reserve = sql.ReserveDeduplication(TOPIC, 'k1', MSG, 120);
        expect(reserve.SQL).toBe('EXEC [__mj].[spWorkQueueReserveDeduplication] @TopicID=@p0, @DeduplicationKey=@p1, @MessageID=@p2, @ReserveSeconds=@p3');
        expect(reserve.Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reads the owner of a key', () => {
        const owner = sql.SelectDeduplicationOwner(TOPIC, 'k1');
        expect(owner.SQL).toBe('EXEC [__mj].[spWorkQueueSelectDeduplicationOwner] @TopicID=@p0, @DeduplicationKey=@p1');
        expect(owner.Params).toEqual([TOPIC, 'k1']);
    });

    it('confirms with the topic TTL and releases only its own reservation', () => {
        const confirm = sql.ConfirmDeduplication(TOPIC, 'k1', MSG, 86400);
        expect(confirm.SQL).toBe('EXEC [__mj].[spWorkQueueConfirmDeduplication] @TopicID=@p0, @DeduplicationKey=@p1, @MessageID=@p2, @TtlSeconds=@p3');
        expect(confirm.Params).toEqual([TOPIC, 'k1', MSG, 86400]);

        const release = sql.ReleaseDeduplication(TOPIC, 'k1', MSG);
        expect(release.SQL).toBe('EXEC [__mj].[spWorkQueueReleaseDeduplication] @TopicID=@p0, @DeduplicationKey=@p1, @MessageID=@p2');
        expect(release.Params).toEqual([TOPIC, 'k1', MSG]);
    });

    it('purges expired rows in bounded batches', () => {
        const purge = sql.PurgeExpiredDeduplications(500);
        expect(purge.SQL).toBe('EXEC [__mj].[spWorkQueuePurgeExpiredDeduplications] @BatchSize=@p0');
        expect(purge.Params).toEqual([500]);
    });
});

describe('the ledger procedure text (reviewed as SQL, in the migration)', () => {
    it('replaces an expired row in place, re-takes only its own Reserved row and inserts under a range lock', async () => {
        const { readFileSync } = await import('node:fs');
        const { PROCEDURES_MIGRATION } = await import('./migrationProcedures');
        const text = readFileSync(PROCEDURES_MIGRATION, 'utf8');
        const body = text.slice(text.indexOf('[spWorkQueueReserveDeduplication]\n'), text.indexOf('[spWorkQueueSelectDeduplicationOwner]'));
        expect(body).toContain("SET [MessageID] = @MessageID, [Status] = N'Reserved', [ExpiresAt] = DATEADD(SECOND, @ReserveSeconds, SYSDATETIMEOFFSET())");
        expect(body).toContain("([ExpiresAt] <= SYSDATETIMEOFFSET() OR ([Status] = N'Reserved' AND [MessageID] = @MessageID))");
        expect(body).not.toContain("N'Confirmed' AND");
        expect(body).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(body).toContain('IF NOT EXISTS (SELECT 1 FROM @Reservation)');
        expect(body).toContain('SELECT [MessageID], [Status] FROM @Reservation;');
    });
});
