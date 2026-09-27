import { describe, it, expect, beforeEach } from 'vitest';
import { BuildOutboundMessage, ChunkMessages, MessageBytes, PublishToServiceBus, SERVICE_BUS_BATCH_MAX_ENTRIES } from '../driver/publish';
import { AzureGatewayError } from '../gateway/errors';
import { FakeServiceBus } from '../testing/fakes';
import { SeedValidAzureResources, TestAzureResources, TestMessage, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

let bus: FakeServiceBus;
const r = TestAzureResources(true);

beforeEach(() => {
    bus = new FakeServiceBus();
    SeedValidAzureResources(bus, TestTopicBinding(true), TestSubscriptionBinding(true));
});

describe('BuildOutboundMessage', () => {
    it('maps a message on a standard topic without a session', () => {
        const message = TestMessage(1, { Attributes: { eventType: 'click' }, CorrelationID: 'corr' });
        expect(BuildOutboundMessage(message, false)).toEqual({
            MessageId: message.MessageID, Body: JSON.stringify(message), ApplicationProperties: { eventType: 'click' }, ContentType: 'application/json', CorrelationId: 'corr',
        });
    });

    it('sets the session on a partitioned topic', () => {
        expect(BuildOutboundMessage(TestMessage(2, { PartitionKey: 'k9' }), true).SessionId).toBe('k9');
        expect(BuildOutboundMessage(TestMessage(3), true).SessionId).toBe(TestMessage(3).MessageID);
    });
});

describe('ChunkMessages', () => {
    it('splits at the entry cap and before a chunk would exceed the byte cap', () => {
        const many = Array.from({ length: SERVICE_BUS_BATCH_MAX_ENTRIES + 3 }, (_, i) => BuildOutboundMessage(TestMessage(i), false));
        expect(ChunkMessages(many).map((c) => c.length)).toEqual([SERVICE_BUS_BATCH_MAX_ENTRIES, 3]);
        const big = 'x'.repeat(100_000);
        const large = [0, 1, 2].map((i) => BuildOutboundMessage(TestMessage(i, { Payload: big }), false));
        expect(MessageBytes(large[0])).toBeGreaterThan(100_000);
        expect(ChunkMessages(large).map((c) => c.length)).toEqual([2, 1]);
    });
});

describe('PublishToServiceBus', () => {
    it('accepts every message in input order and delivers to the matching subscription', async () => {
        const messages = [TestMessage(1, { PartitionKey: 'a' }), TestMessage(2, { PartitionKey: 'b' })];
        const results = await PublishToServiceBus(bus, TestTopicBinding(true), messages);
        expect(results).toEqual(messages.map((m) => ({ MessageID: m.MessageID, Status: 'Accepted' })));
        expect(bus.Messages(r.TopicName, r.SubscriptionName).map((m) => m.SessionId)).toEqual(['a', 'b']);
    });

    it('rejects an unbound topic as TopicUnbound, oversize and empty-attribute messages before sending', async () => {
        const [unbound] = await PublishToServiceBus(bus, TestTopicBinding(true, { Config: {} }), [TestMessage(1)]);
        expect(unbound).toMatchObject({ Status: 'Rejected', Error: { Code: 'TopicUnbound', Retryable: true } });
        const results = await PublishToServiceBus(bus, TestTopicBinding(true), [
            TestMessage(2, { Payload: 'x'.repeat(300_000) }), TestMessage(3, { Attributes: { empty: '' } }), TestMessage(4),
        ]);
        expect(results.map((x) => x.Status)).toEqual(['Rejected', 'Rejected', 'Accepted']);
        expect(results[0].Error?.Code).toBe('PayloadTooLarge');
        expect(results[1].Error?.Code).toBe('InvalidAttributes');
        expect(bus.Messages(r.TopicName, r.SubscriptionName)).toHaveLength(1);
    });

    it('rejects a whole chunk when the send fails, retryable by the gateway verdict', async () => {
        bus.FailNext('Send', new AzureGatewayError('Service Bus sendMessages failed: busy', 'ServiceBusy', true));
        const [a, b] = await PublishToServiceBus(bus, TestTopicBinding(true), [TestMessage(1), TestMessage(2)]);
        expect(a).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
        expect(b.Error?.Code).toBe('TransportUnavailable');
        bus.FailNext('Send', new AzureGatewayError('Service Bus sendMessages failed: too big', 'MessageSizeExceeded', false));
        const [c] = await PublishToServiceBus(bus, TestTopicBinding(true), [TestMessage(3)]);
        expect(c).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportRejected', Retryable: false } });
    });

    it('reports a silently deduplicated republish as Accepted', async () => {
        await PublishToServiceBus(bus, TestTopicBinding(true), [TestMessage(1)]);
        const [again] = await PublishToServiceBus(bus, TestTopicBinding(true), [TestMessage(1)]);
        expect(again.Status).toBe('Accepted');
        expect(bus.Messages(r.TopicName, r.SubscriptionName)).toHaveLength(1);
    });
});
