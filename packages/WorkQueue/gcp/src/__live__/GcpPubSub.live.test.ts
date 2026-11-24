import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import type { GcpTransportConfig } from '../config';
import { GcpTransportDriver } from '../driver/GcpTransportDriver';

const RUN_LIVE = process.env.MJ_TEST_LIVE_GCP_PUBSUB === '1';
const PROJECT_ID = process.env.GCP_PUBSUB_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'mj-wq-live-test';
const EMULATOR_HOST = process.env.PUBSUB_EMULATOR_HOST ?? null;

describe.skipIf(!RUN_LIVE)('Google Cloud Pub/Sub Live Integration (opt-in MJ_TEST_LIVE_GCP_PUBSUB=1)', () => {
    const suffix = randomUUID().slice(0, 8);
    const topicName = `mj-wq-live-${suffix}`;
    const subName = `mj-wq-live-sub-${suffix}`;
    const dlqTopicName = `mj-wq-live-dlq-${suffix}`;
    const dlqSubName = `mj-wq-live-dlq-sub-${suffix}`;
    let driver: GcpTransportDriver | null = null;

    afterAll(async () => {
        if (driver) {
            await driver.DeleteSubscription(subName).catch(() => false);
            await driver.DeleteSubscription(dlqSubName).catch(() => false);
            await driver.DeleteTopic(topicName).catch(() => false);
            await driver.DeleteTopic(dlqTopicName).catch(() => false);
            await driver.Close().catch(() => undefined);
        }
    });

    it('provisions topic/subscription/DLQ, publishes, pulls, extends ack deadline, completes, and checks health', async () => {
        const config: GcpTransportConfig = {
            ProjectId: PROJECT_ID,
            ApiEndpoint: EMULATOR_HOST,
            UseEmulator: EMULATOR_HOST !== null,
        };
        driver = GcpTransportDriver.Create(config);

        const health = await driver.CheckHealth();
        expect(health.Healthy).toBe(true);

        await driver.EnsureTopic(topicName);
        await driver.EnsureTopic(dlqTopicName);
        await driver.EnsureSubscription(dlqTopicName, dlqSubName, {
            AckDeadlineSeconds: 60,
            EnableMessageOrdering: false,
        });
        await driver.EnsureSubscription(topicName, subName, {
            AckDeadlineSeconds: 60,
            EnableMessageOrdering: false,
            DeadLetterTopicName: dlqTopicName,
            MaxDeliveryAttempts: 7,
        });

        const topicBinding = {
            TopicName: 'live.test',
            IsFifo: false,
            MaxPayloadBytes: 262_144,
            Config: { ProjectId: PROJECT_ID, TopicName: topicName },
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
                ProjectId: PROJECT_ID,
                TopicName: topicName,
                SubscriptionName: subName,
                DeadLetterTopicName: dlqTopicName,
                DeadLetterSubscriptionName: dlqSubName,
                EnableMessageOrdering: false,
                AckDeadlineSeconds: 60,
            },
        };

        const issues = await driver.ValidateBindings(topicBinding, [subBinding]);
        expect(issues).toEqual([]);

        const messageId = randomUUID();
        const [pub] = await driver.Publish(topicBinding, [{
            MessageID: messageId,
            Topic: 'live.test',
            Attributes: { env: 'live' },
            Payload: { hello: 'gcp-pubsub' },
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
