import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import type { AzureTransportConfig } from '../config';

const RUN_LIVE = process.env.MJ_TEST_LIVE_AZURE_SERVICE_BUS === '1';
const CONNECTION_STRING = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const NAMESPACE = process.env.AZURE_SERVICE_BUS_NAMESPACE;

describe.skipIf(!RUN_LIVE)('Azure Service Bus Live Integration (opt-in MJ_TEST_LIVE_AZURE_SERVICE_BUS=1)', () => {
    const suffix = randomUUID().slice(0, 8);
    const topicName = `mj-wq-live-${suffix}`;
    const subName = `sub-${suffix}`;
    let driver: AzureTransportDriver | null = null;

    afterAll(async () => {
        if (driver) {
            await driver.DeleteSubscription(topicName, subName).catch(() => false);
            await driver.DeleteTopic(topicName).catch(() => false);
            await driver.Close().catch(() => undefined);
        }
    });

    it('provisions topic/subscription, publishes, receives, extends lock, completes, and checks health', async () => {
        const config: AzureTransportConfig = {
            Namespace: NAMESPACE ?? 'mj-wq-live.servicebus.windows.net',
            Endpoint: null,
            UseEmulator: false,
        };
        driver = AzureTransportDriver.Create(
            config,
            CONNECTION_STRING ? { ConnectionString: CONNECTION_STRING } : undefined,
        );

        const health = await driver.CheckHealth();
        expect(health.Healthy).toBe(true);

        await driver.EnsureTopic(topicName);
        await driver.EnsureSubscription(topicName, subName, {
            RequiresSession: false,
            MaxDeliveryCount: 7,
            LockDurationSeconds: 60,
        });

        const topicBinding = {
            TopicName: 'live.test',
            IsFifo: false,
            MaxPayloadBytes: 262_144,
            Config: { ServiceBusTopicName: topicName },
        };
        const subBinding = {
            Policy: {
                SubscriptionName: 'live.test.sub',
                TopicName: 'live.test',
                PartitionMode: 'None' as const,
                MaxAttempts: 2,
                BackoffBaseSeconds: 1,
                BackoffMaxSeconds: 10,
                LeaseSeconds: 60,
                HeartbeatMode: 'Auto' as const,
            },
            Filter: null,
            HostType: 'MJWorker' as const,
            Config: {
                Namespace: NAMESPACE ?? null,
                ServiceBusTopicName: topicName,
                SubscriptionName: subName,
                RequiresSession: false,
                LockDurationSeconds: 60,
            },
        };

        const issues = await driver.ValidateBindings(topicBinding, [subBinding]);
        expect(issues).toEqual([]);

        const messageId = randomUUID();
        const [pub] = await driver.Publish(topicBinding, [{
            MessageID: messageId,
            Topic: 'live.test',
            Attributes: { env: 'live' },
            Payload: { hello: 'azure' },
            PublishedAt: new Date().toISOString(),
        }], [subBinding]);
        expect(pub.Status).toBe('Accepted');

        const consumer = driver.OpenConsumer(subBinding);
        try {
            const received = await consumer.Receive(1, 10, AbortSignal.timeout(15_000));
            expect(received).toHaveLength(1);
            expect(received[0].Message.MessageID).toBe(messageId);
            expect(await consumer.ExtendLease(received[0], 60)).toBe('Held');
            expect(await consumer.Complete(received[0])).toEqual({
                Kind: 'Settled',
                DeliveryID: messageId,
                Status: 'Completed',
            });
        } finally {
            await consumer.Close();
        }
    });
});
