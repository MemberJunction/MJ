import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import {
    BuildDeliveryPlan, PublishOrderKeys, ResolveExistingMessage, ToDeliveryRows, ToMessageInsertRow,
} from '../transports/database/deliveryPlan';
import type { ExistingMessageRow } from '../sql/rows';
import { SubscriptionBindingFixture, TOPIC_ID } from './fakes';

const MESSAGE: WorkMessage = {
    MessageID: 'CCCCCCCC-0000-0000-0000-000000000001',
    Topic: 'import.ready',
    PartitionKey: 'venue-42',
    Attributes: { eventType: 'import', source: 'tessitura' },
    Payload: { importId: 'x', tables: 3 },
    PublishedAt: '2026-01-01T00:00:00.000Z',
};

const NONE = SubscriptionBindingFixture({ SubscriptionName: 'archive', PartitionMode: 'None' }, { SubscriptionID: 'S-NONE' });
const EXCLUSIVE = SubscriptionBindingFixture({ SubscriptionName: 'update', PartitionMode: 'Exclusive' }, { SubscriptionID: 'S-EXCL' });
const ORDERED = SubscriptionBindingFixture({ SubscriptionName: 'apply', PartitionMode: 'Ordered' }, { SubscriptionID: 'S-ORD' });

describe('BuildDeliveryPlan', () => {
    it('includes only subscriptions whose filter matches', () => {
        const filtered = {
            ...EXCLUSIVE,
            Filter: { logic: 'and' as const, filters: [{ field: 'eventType', operator: 'eq' as const, value: 'click' }] },
        };
        const plan = BuildDeliveryPlan(MESSAGE, [NONE, filtered]);
        expect(plan.Deliveries.map(d => d.SubscriptionID)).toEqual(['S-NONE']);
    });

    it('requires the publish-order lock only for keyed messages with a matching Ordered subscription', () => {
        expect(BuildDeliveryPlan(MESSAGE, [NONE, EXCLUSIVE]).NeedsPublishOrderLock).toBe(false);
        expect(BuildDeliveryPlan(MESSAGE, [ORDERED]).NeedsPublishOrderLock).toBe(true);
        const keyless = { ...MESSAGE, PartitionKey: undefined };
        expect(BuildDeliveryPlan(keyless, [ORDERED]).NeedsPublishOrderLock).toBe(false);
    });

    it('lists the distinct keys that need a publish-order lock in sorted order', () => {
        const messages = [{ ...MESSAGE, PartitionKey: 'b' }, { ...MESSAGE, PartitionKey: 'a' }, { ...MESSAGE, PartitionKey: 'b' }, { ...MESSAGE, PartitionKey: undefined }];
        expect(PublishOrderKeys(messages, [ORDERED])).toEqual(['a', 'b']);
        expect(PublishOrderKeys(messages, [EXCLUSIVE])).toEqual([]);
    });
});

describe('row builders', () => {
    it('stores the partition key only on partitioned deliveries, and the publish ordinal as the order key', () => {
        const plan = BuildDeliveryPlan(MESSAGE, [NONE, EXCLUSIVE]);
        expect(ToDeliveryRows(MESSAGE, plan, 17)).toEqual([
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-NONE', PartitionKey: null, OrderKey: 17 },
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-EXCL', PartitionKey: 'venue-42', OrderKey: 17 },
        ]);
    });

    it('serialises the envelope for insert, leaving PublishedAt to the database', () => {
        expect(ToMessageInsertRow(MESSAGE, TOPIC_ID, 'U1')).toEqual({
            ID: MESSAGE.MessageID, TopicID: TOPIC_ID, PartitionKey: 'venue-42',
            AttributesJSON: '{"eventType":"import","source":"tessitura"}', PayloadJSON: '{"importId":"x","tables":3}', PayloadRefJSON: null,
            CorrelationID: null, PublishedByUserID: 'U1',
        });
    });
});

describe('ResolveExistingMessage (03 §2.1, F10)', () => {
    const existing = (overrides: Partial<ExistingMessageRow> = {}): ExistingMessageRow => ({
        ID: MESSAGE.MessageID.toLowerCase(), TopicID: TOPIC_ID.toLowerCase(), PartitionKey: 'venue-42',
        Attributes: '{"source":"tessitura","eventType":"import"}',     // stored with a different key order
        Payload: '{"tables":3,"importId":"x"}', PayloadRef: null, CorrelationID: null, ...overrides,
    });

    it('treats the same canonical envelope on the same topic as a duplicate, whatever the key order', () => {
        expect(ResolveExistingMessage(existing(), MESSAGE, TOPIC_ID)).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Duplicate' });
    });

    it('rejects a reused ID with a different envelope', () => {
        const result = ResolveExistingMessage(existing({ Payload: '{"importId":"y"}' }), MESSAGE, TOPIC_ID);
        expect(result.Status).toBe('Rejected');
        expect(result.Error).toMatchObject({ Code: 'MessageIDConflict', Retryable: false });
    });

    it('rejects a reused ID on another topic: MessageID is globally unique', () => {
        const result = ResolveExistingMessage(existing({ TopicID: 'AAAAAAAA-0000-0000-0000-000000000099' }), MESSAGE, TOPIC_ID);
        expect(result.Error?.Code).toBe('MessageIDConflict');
    });

    it('asks the caller to retry when the conflicting row is no longer visible', () => {
        const result = ResolveExistingMessage(undefined, MESSAGE, TOPIC_ID);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: expect.stringContaining('retry'), Retryable: true });
    });
});
