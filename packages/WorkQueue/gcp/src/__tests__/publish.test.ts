import { describe, it, expect } from 'vitest';
import {
    BuildOutgoingMessage,
    ChunkOutgoingMessages,
    MAX_PUBSUB_ATTRIBUTES,
    PUBSUB_BATCH_MAX_COUNT,
    PublishToPubSub,
} from '../driver/publish';
import { GcpGatewayError } from '../gateway/errors';
import { FakePubSubGateway } from '../testing/fakes';
import { TestGcpResources, TestGcpTopicBinding, TestMessage } from '../testing/fixtures';

describe('PublishToPubSub', () => {
    it('publishes batches, attaches orderingKey for FIFO topics, and aligns positional results', async () => {
        const res = TestGcpResources(true);
        const fake = new FakePubSubGateway()
            .AddTopic(res.TopicName)
            .AddSubscription(res.TopicName, res.SubscriptionName, { EnableMessageOrdering: true });
        const topic = TestGcpTopicBinding(true);

        const messages = [
            TestMessage(1, { PartitionKey: 'tenant-1', CorrelationID: 'c-1' }),
            TestMessage(2, { PartitionKey: 'tenant-2' }),
        ];
        const results = await PublishToPubSub(fake, topic, messages);
        expect(results).toEqual([
            { MessageID: messages[0].MessageID, Status: 'Accepted' },
            { MessageID: messages[1].MessageID, Status: 'Accepted' },
        ]);
        const stored = fake.Messages(res.SubscriptionName);
        expect(stored.map((m) => m.OrderingKey)).toEqual(['tenant-1', 'tenant-2']);
        expect(stored[0].Attributes['mj_correlation_id']).toBe('c-1');
    });

    it('rejects unbound topics, oversized envelopes, invalid attributes, and holds back same-key followers on failure', async () => {
        const res = TestGcpResources(true);
        const fake = new FakePubSubGateway()
            .AddTopic(res.TopicName)
            .AddSubscription(res.TopicName, res.SubscriptionName, { EnableMessageOrdering: true });
        const topic = TestGcpTopicBinding(true);

        const unbound = await PublishToPubSub(fake, { ...topic, Config: {} }, [TestMessage(1)]);
        expect(unbound[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TopicUnbound', Retryable: true } });

        const tooManyAttrs: Record<string, string> = {};
        for (let i = 0; i <= MAX_PUBSUB_ATTRIBUTES; i++) {
            tooManyAttrs[`k${i}`] = 'v';
        }
        const mBadAttrs = TestMessage(10, { Attributes: tooManyAttrs });
        const mGoogAttr = TestMessage(11, { Attributes: { googClient: 'x' } });
        const mEmptyAttr = TestMessage(12, { Attributes: { empty: '' } });
        const mBig = TestMessage(13, { Payload: { blob: 'x'.repeat(300_000) } });
        const precheckResults = await PublishToPubSub(fake, topic, [mBadAttrs, mGoogAttr, mEmptyAttr, mBig]);
        expect(precheckResults.map((r) => r.Error?.Code)).toEqual([
            'InvalidAttributes',
            'InvalidAttributes',
            'InvalidAttributes',
            'PayloadTooLarge',
        ]);

        // Hold-back on orderingKey failure
        const k1a = TestMessage(20, { PartitionKey: 'k1' });
        const k1b = TestMessage(21, { PartitionKey: 'k1' });
        const k2 = TestMessage(22, { PartitionKey: 'k2' });
        fake.FailedBatchMessages.set(k1a.MessageID, { Code: 'UNAVAILABLE', Message: 'busy', SenderFault: false });
        const holdResults = await PublishToPubSub(fake, topic, [k1a, k1b, k2]);
        expect(holdResults[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
        expect(holdResults[1]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
        expect(holdResults[2]).toEqual({ MessageID: k2.MessageID, Status: 'Accepted' });

        fake.ThrowOnPublishBatch = new GcpGatewayError('network down', 'GRPC_14', true);
        const batchFail = await PublishToPubSub(fake, topic, [TestMessage(30)]);
        expect(batchFail[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
    });

    it('chunks messages by count and one-entry-per-ordering-key when enabled', () => {
        const msgs = [
            BuildOutgoingMessage(TestMessage(1, { PartitionKey: 'k1' }), true),
            BuildOutgoingMessage(TestMessage(2, { PartitionKey: 'k1' }), true),
            BuildOutgoingMessage(TestMessage(3, { PartitionKey: 'k2' }), true),
        ];
        expect(ChunkOutgoingMessages(msgs, true)).toHaveLength(2);
        const many = Array.from({ length: PUBSUB_BATCH_MAX_COUNT + 5 }, (_, i) =>
            BuildOutgoingMessage(TestMessage(i), false),
        );
        expect(ChunkOutgoingMessages(many, false)).toHaveLength(2);
    });
});
