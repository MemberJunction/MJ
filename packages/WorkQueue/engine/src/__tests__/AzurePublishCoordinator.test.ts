import { describe, it, expect } from 'vitest';
import { AzureGatewayError, AzureTransportDriver } from '@memberjunction/work-queue-azure';
import { FakeServiceBusGateway, TestAzureResources } from '@memberjunction/work-queue-azure/testing';
import { ResolveTopic, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { WorkQueuePublishCoordinator, type LedgerOperations, type PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import { RecordingExecutor, RecordingLogger } from './fakes';

const TRANSPORT_ROW = TRANSPORT_ROW_FIXTURE;
const TOPIC_ROW = TOPIC_ROW_FIXTURE;
const SUBSCRIPTION_ROW = SUBSCRIPTION_ROW_FIXTURE;
const AZURE_TRANSPORT: TransportRow = {
    ...TRANSPORT_ROW,
    ID: 'A0000000-0000-0000-0000-000000000002',
    Name: 'Azure-test',
    DriverClass: 'Azure',
    Configuration: '{"Namespace":"mj-wq-test.servicebus.windows.net"}',
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

function Setup() {
    const fake = new FakeServiceBusGateway();
    const resources = TestAzureResources(true);
    fake.AddTopic(resources.ServiceBusTopicName).AddSubscription(resources.ServiceBusTopicName, resources.SubscriptionName, { RequiresSession: true });
    const driver = new AzureTransportDriver(fake, fake);
    const ledger = new FakeLedger();
    const topic: TopicRow = {
        ...TOPIC_ROW,
        Name: 'email.events',
        TransportID: AZURE_TRANSPORT.ID,
        IsFifo: true,
        AllowExternalPublish: true,
        BindingConfig: JSON.stringify({ ServiceBusTopicName: resources.ServiceBusTopicName }),
    };
    const snapshot = {
        Transports: [TRANSPORT_ROW, AZURE_TRANSPORT],
        Topics: [topic],
        Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }],
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
    return { coordinator: new WorkQueuePublishCoordinator(deps), fake, ledger, resources };
}

const OPTIONS = { UserID: 'U1', External: false, CallerExecutor: null };

describe('WorkQueuePublishCoordinator with AzureTransportDriver', () => {
    it('publishes with Service Bus SessionId, skips confirmed dedup keys, and confirms accepted keys', async () => {
        const { coordinator, fake, ledger, resources } = Setup();
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, PartitionKey: 'subscriber-9', DeduplicationKey: 'click:1', DeduplicationTTLSeconds: 3600, Attributes: { eventType: 'click' } },
            { MessageID: M2, DeduplicationKey: 'confirmed', Attributes: { eventType: 'click' } },
            { MessageID: M3, Attributes: { eventType: 'open' } },
        ], OPTIONS);

        expect(results.map((r) => r.Status)).toEqual(['Accepted', 'Duplicate', 'Accepted']);
        expect(results[1].MessageID.toLowerCase()).toBe(OWNER.toLowerCase());
        const msgs = fake.Messages(resources.ServiceBusTopicName, resources.SubscriptionName);
        expect(msgs).toHaveLength(2);
        expect(msgs.map((m) => m.SessionId)).toEqual(['subscriber-9', M3]);
        expect(ledger.Events).toEqual(['reserve:click:1', 'reserve:confirmed', 'confirm:click:1:3600']);
    });

    it('releases dedup reservation when Service Bus batch fails', async () => {
        const { coordinator, fake, ledger } = Setup();
        fake.ThrowOnSendBatch = new AzureGatewayError('ServiceBus SendBatch failed: ServiceBusy', 'ServiceBusy', true);
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, DeduplicationKey: 'a' },
            { MessageID: M2, DeduplicationKey: 'b' },
        ], OPTIONS);
        expect(results.every((r) => r.Status === 'Rejected' && r.Error?.Retryable === true)).toBe(true);
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'release:a', 'release:b']);
    });
});
