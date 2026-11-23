import { describe, it, expect } from 'vitest';
import { ResolveTopic, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { GcpGatewayError, GcpTransportDriver } from '@memberjunction/work-queue-gcp';
import { FakePubSubGateway, TestGcpResources } from '@memberjunction/work-queue-gcp/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { GcpPublishCoordinator } from '../gcp/GcpPublishCoordinator';
import type { LedgerOperations, PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import { RecordingExecutor, RecordingLogger } from './fakes';

const GCP_TRANSPORT: TransportRow = {
    ...TRANSPORT_ROW_FIXTURE,
    ID: 'A0000000-0000-0000-0000-000000000003',
    Name: 'GCP-test',
    DriverClass: 'GCP',
    Configuration: '{"ProjectId":"mj-wq-test"}',
};
const OWNER = 'EEEEEEEE-0000-4000-8000-000000000001';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];

    public async Reserve(_topicID: string, key: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        if (key === 'confirmed') return { Kind: 'Duplicate', OwnerMessageID: OWNER };
        if (key === 'in-flight') return { Kind: 'Pending', OwnerMessageID: OWNER };
        return { Kind: 'Reserved' };
    }
    public async Confirm(_topicID: string, key: string, _messageID: string, ttlSeconds: number): Promise<boolean> {
        this.Events.push(`confirm:${key}:${ttlSeconds}`);
        return true;
    }
    public async Release(_topicID: string, key: string): Promise<boolean> {
        this.Events.push(`release:${key}`);
        return true;
    }
}

function setup() {
    const fake = new FakePubSubGateway();
    const resources = TestGcpResources(true);
    fake.AddTopic(resources.TopicName).AddSubscription(resources.TopicName, resources.SubscriptionName, { EnableMessageOrdering: true });
    const driver = new GcpTransportDriver(fake, fake, { ProjectId: fake.ProjectId });
    const ledger = new FakeLedger();
    const topic: TopicRow = {
        ...TOPIC_ROW_FIXTURE,
        Name: 'email.events',
        TransportID: GCP_TRANSPORT.ID,
        IsFifo: true,
        AllowExternalPublish: true,
        BindingConfig: JSON.stringify({ ProjectId: resources.ProjectId, TopicName: resources.TopicName }),
    };
    const snapshot = {
        Transports: [TRANSPORT_ROW_FIXTURE, GCP_TRANSPORT],
        Topics: [topic],
        Subscriptions: [{ ...SUBSCRIPTION_ROW_FIXTURE, PartitionMode: 'None' as const }],
    };
    let id = 100;
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: (name) => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: new RecordingExecutor(),
        CreateLedger: () => ledger,
        NewID: () => `00000000-0000-4000-8000-000000000${++id}`,
        Now: () => new Date('2026-09-16T12:00:00Z'),
        NotifyPublished: () => undefined,
        Log: new RecordingLogger(),
    };
    return { coordinator: new GcpPublishCoordinator(deps), fake, ledger, resources };
}

const OPTIONS = { UserID: 'U1', External: false, CallerExecutor: null };

describe('GcpPublishCoordinator with GcpTransportDriver', () => {
    it('publishes with Pub/Sub orderingKey, skips confirmed dedup keys, and confirms accepted keys', async () => {
        const { coordinator, fake, ledger, resources } = setup();
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, PartitionKey: 'subscriber-9', DeduplicationKey: 'click:1', DeduplicationTTLSeconds: 3600, Attributes: { eventType: 'click' } },
            { MessageID: M2, DeduplicationKey: 'confirmed', Attributes: { eventType: 'click' } },
            { MessageID: M3, Attributes: { eventType: 'open' } },
        ], OPTIONS);

        expect(results.map((r) => r.Status)).toEqual(['Accepted', 'Duplicate', 'Accepted']);
        expect(results[1].MessageID.toLowerCase()).toBe(OWNER.toLowerCase());
        const msgs = fake.Messages(resources.SubscriptionName);
        expect(msgs).toHaveLength(2);
        expect(msgs.map((m) => m.OrderingKey)).toEqual(['subscriber-9', M3]);
        expect(ledger.Events).toEqual(['reserve:click:1', 'reserve:confirmed', 'confirm:click:1:3600']);
    });

    it('releases dedup reservation when Pub/Sub batch fails', async () => {
        const { coordinator, fake, ledger } = setup();
        fake.ThrowOnPublishBatch = new GcpGatewayError('PubSub PublishBatch failed: UNAVAILABLE', 'GRPC_14', true);
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, DeduplicationKey: 'a' },
            { MessageID: M2, DeduplicationKey: 'b' },
        ], OPTIONS);
        expect(results.every((r) => r.Status === 'Rejected' && r.Error?.Retryable === true)).toBe(true);
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'release:a', 'release:b']);
    });
});
