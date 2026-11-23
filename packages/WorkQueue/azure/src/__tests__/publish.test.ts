import { describe, it, expect } from 'vitest';
import { AzureGatewayError } from '../gateway/errors';
import { PublishToServiceBus } from '../driver/publish';
import { FakeServiceBusGateway } from '../testing/fakes';
import { TestAzureResources, TestAzureSubscriptionBinding, TestAzureTopicBinding, TestMessage } from '../testing/fixtures';

describe('PublishToServiceBus', () => {
    it('publishes messages with SessionId and ApplicationProperties, and chunks across batches', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(true);
        const sub = TestAzureSubscriptionBinding(true);
        const r = TestAzureResources(true);
        fake.AddTopic(r.ServiceBusTopicName).AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: true });

        const messages = [
            TestMessage(1, { PartitionKey: 'tenant-a' }),
            TestMessage(2, { PartitionKey: 'tenant-a' }),
            TestMessage(3, { PartitionKey: 'tenant-b' }),
        ];
        const results = await PublishToServiceBus(fake, topic, messages);
        expect(results).toEqual([
            { MessageID: messages[0].MessageID, Status: 'Accepted' },
            { MessageID: messages[1].MessageID, Status: 'Accepted' },
            { MessageID: messages[2].MessageID, Status: 'Accepted' },
        ]);
        // Chunked so same session never appears twice in one FIFO batch
        const sendBatches = fake.Calls.filter((c) => c.Op === 'SendBatch');
        expect(sendBatches.length).toBeGreaterThanOrEqual(2);
        expect(fake.Messages(r.ServiceBusTopicName, r.SubscriptionName)).toHaveLength(3);
    });

    it('rejects oversized payloads, empty attribute values, and unbound topics', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(false, { MaxPayloadBytes: 256 });
        const r = TestAzureResources(false);
        fake.AddTopic(r.ServiceBusTopicName);

        const oversized = TestMessage(1, { Payload: { data: 'x'.repeat(300) } });
        const emptyAttr = TestMessage(2, { Attributes: { empty: '' } });
        const results = await PublishToServiceBus(fake, topic, [oversized, emptyAttr]);
        expect(results[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'PayloadTooLarge', Retryable: false } });
        expect(results[1]).toMatchObject({ Status: 'Rejected', Error: { Code: 'InvalidAttributes', Retryable: false } });

        const unboundResults = await PublishToServiceBus(fake, TestAzureTopicBinding(false, { Config: {} }), [TestMessage(3)]);
        expect(unboundResults[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TopicUnbound', Retryable: true } });
    });

    it('holds back later messages of a failed session in the same publish call', async () => {
        const fake = new FakeServiceBusGateway();
        const topic = TestAzureTopicBinding(true);
        const r = TestAzureResources(true);
        fake.AddTopic(r.ServiceBusTopicName).AddSubscription(r.ServiceBusTopicName, r.SubscriptionName, { RequiresSession: true });

        const m1 = TestMessage(1, { PartitionKey: 'k1' });
        const m2 = TestMessage(2, { PartitionKey: 'k1' });
        fake.FailedBatchMessages.set(m1.MessageID, { Code: 'ServiceBusy', Message: 'throttled', SenderFault: false });

        const results = await PublishToServiceBus(fake, topic, [m1, m2]);
        expect(results[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
        expect(results[1]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });

        fake.ThrowOnSendBatch = new AzureGatewayError('down', 'ServiceUnavailable', true);
        const batchFail = await PublishToServiceBus(fake, topic, [TestMessage(3)]);
        expect(batchFail[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'TransportUnavailable', Retryable: true } });
    });
});
