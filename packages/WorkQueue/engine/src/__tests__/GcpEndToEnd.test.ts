import { describe, it, expect } from 'vitest';
import {
    ConsumerRuntime,
    FatalWorkError,
    NULL_WORK_LOGGER,
    Outcome,
    TransientWorkError,
    type WorkContext,
    type WorkHandler,
    type WorkJson,
    type WorkMessage,
    type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { ResolveTopic, ToSubscriptionBinding, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { GcpTransportDriver } from '@memberjunction/work-queue-gcp';
import { FakePubSubGateway, TestGcpResources } from '@memberjunction/work-queue-gcp/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { GcpPublishCoordinator } from '../gcp/GcpPublishCoordinator';
import type { LedgerOperations } from '../publish/WorkQueuePublishCoordinator';
import { RecordingExecutor, RecordingLogger } from './fakes';

class InMemoryLedger implements LedgerOperations {
    private readonly seen = new Map<string, string>();
    public async Reserve(_topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        const existing = this.seen.get(key);
        if (existing) {
            return { Kind: 'Duplicate', OwnerMessageID: existing };
        }
        this.seen.set(key, messageID);
        return { Kind: 'Reserved' };
    }
    public async Confirm(): Promise<boolean> { return true; }
    public async Release(_topicID: string, key: string): Promise<boolean> {
        this.seen.delete(key);
        return true;
    }
}

function readMode(payload: WorkJson | undefined): string | undefined {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return undefined;
    }
    const mode = payload['mode'];
    return typeof mode === 'string' ? mode : undefined;
}

describe('WorkQueue Engine + Google Cloud Pub/Sub end-to-end round-trip', () => {
    it('publishes via coordinator, runs retries + dead-letters via ConsumerRuntime, and replays via GcpTransportOperator', async () => {
        const res = TestGcpResources(true);
        const fake = new FakePubSubGateway();
        fake.AddTopic(res.TopicName)
            .AddTopic(res.DeadLetterTopicName)
            .AddSubscription(res.DeadLetterTopicName, res.DeadLetterSubscriptionName, { EnableMessageOrdering: true })
            .AddSubscription(res.TopicName, res.SubscriptionName, {
                EnableMessageOrdering: true,
                DeadLetterTopicName: res.DeadLetterTopicName,
                MaxDeliveryAttempts: 8,
                AckDeadlineSeconds: 60,
            });
        const driver = new GcpTransportDriver(fake, fake, { Now: () => fake.Now, ProjectId: fake.ProjectId });

        const transport: TransportRow = {
            ...TRANSPORT_ROW_FIXTURE,
            ID: 'A0000000-0000-0000-0000-000000000003',
            Name: 'GCP-e2e',
            DriverClass: 'GCP',
            Configuration: JSON.stringify({ ProjectId: fake.ProjectId }),
        };
        const topic: TopicRow = {
            ...TOPIC_ROW_FIXTURE,
            Name: 'email.events',
            TransportID: transport.ID,
            IsFifo: true,
            BindingConfig: JSON.stringify({ ProjectId: res.ProjectId, TopicName: res.TopicName }),
        };
        const subRow = {
            ...SUBSCRIPTION_ROW_FIXTURE,
            Name: 'email.unsubscribe',
            TopicID: topic.ID,
            PartitionMode: 'Exclusive' as const,
            MaxAttempts: 3,
            BackoffBaseSeconds: 0,
            BackoffMaxSeconds: 0,
            BindingConfig: JSON.stringify({
                ProjectId: res.ProjectId,
                TopicName: res.TopicName,
                SubscriptionName: res.SubscriptionName,
                DeadLetterTopicName: res.DeadLetterTopicName,
                DeadLetterSubscriptionName: res.DeadLetterSubscriptionName,
                EnableMessageOrdering: true,
                AckDeadlineSeconds: 60,
            }),
        };

        const snapshot = { Transports: [TRANSPORT_ROW_FIXTURE, transport], Topics: [topic], Subscriptions: [subRow] };
        let seq = 0;
        const coordinator = new GcpPublishCoordinator({
            ResolveTopic: (name) => ResolveTopic(snapshot, name),
            GetDriver: async () => driver,
            Executor: new RecordingExecutor(),
            CreateLedger: () => new InMemoryLedger(),
            NewID: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
            Now: () => new Date(fake.Now),
            NotifyPublished: () => undefined,
            Log: new RecordingLogger(),
        });

        const [pubOk, pubFatal] = await coordinator.Publish('email.events', [
            { PartitionKey: 'tenant-1', DeduplicationKey: 'ok-1', Payload: { mode: 'ok' } },
            { PartitionKey: 'tenant-2', DeduplicationKey: 'fatal-1', Payload: { mode: 'fatal' } },
        ], { UserID: 'u-1', External: false, CallerExecutor: null });

        expect(pubOk.Status).toBe('Accepted');
        expect(pubFatal.Status).toBe('Accepted');

        const subBinding = ToSubscriptionBinding(subRow, topic, driver.Capabilities.Filters);
        const consumer = driver.OpenConsumer(subBinding);
        const processed: string[] = [];
        let allowRecovered = false;

        class RoundTripHandler implements WorkHandler {
            public async Handle(message: WorkMessage, _ctx: WorkContext): Promise<WorkOutcome> {
                const mode = readMode(message.Payload);
                if (mode === 'fatal' && !allowRecovered) {
                    throw new FatalWorkError('upstream bad');
                }
                if (mode === 'ok' && processed.length === 0) {
                    processed.push('transient-once');
                    throw new TransientWorkError('retry immediately', 0);
                }
                processed.push(message.MessageID);
                return Outcome.Complete();
            }
        }

        const runtime = new ConsumerRuntime(
            consumer,
            () => new RoundTripHandler(),
            subBinding.Policy,
            { Concurrency: 2, ReceiveBatchSize: 10, IdlePollMinMs: 5, IdlePollMaxMs: 20, ShutdownDrainMs: 200 },
            NULL_WORK_LOGGER,
            () => fake.Now,
        );

        runtime.Start();
        await new Promise((r) => setTimeout(r, 150));
        await runtime.Stop();

        expect(processed).toEqual(['transient-once', pubOk.MessageID]);
        const dlqPage = await driver.Operator().ListDeadLetters(subBinding, null, 20);
        expect(dlqPage?.Items).toHaveLength(1);
        expect(dlqPage?.Items[0].DeliveryID).toBe(pubFatal.MessageID);

        allowRecovered = true;
        expect(await driver.Operator().Replay(subBinding, pubFatal.MessageID, 'admin-1', 'fixed')).toEqual({ Supported: true, Changed: true });
        const runtime2 = new ConsumerRuntime(
            consumer,
            () => new RoundTripHandler(),
            subBinding.Policy,
            { Concurrency: 1, ReceiveBatchSize: 10, IdlePollMinMs: 5, IdlePollMaxMs: 20, ShutdownDrainMs: 200 },
            NULL_WORK_LOGGER,
            () => fake.Now,
        );
        runtime2.Start();
        await new Promise((r) => setTimeout(r, 100));
        await runtime2.Stop();

        expect(processed).toContain(pubFatal.MessageID);
        expect(fake.Messages(res.SubscriptionName)).toHaveLength(0);
        expect(fake.Messages(res.DeadLetterSubscriptionName)).toHaveLength(0);

        await consumer.Close();
        await driver.Close();
    });
});
