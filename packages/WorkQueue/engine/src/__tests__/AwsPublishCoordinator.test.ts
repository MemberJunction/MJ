import { describe, it, expect } from 'vitest';
import { AwsGatewayError, AwsTransportDriver } from '@memberjunction/work-queue-aws';
import { FakeSnsGateway, FakeSqsGateway, TestAwsResources } from '@memberjunction/work-queue-aws/testing';
import { ResolveTopic, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { WorkQueuePublishCoordinator, type LedgerOperations, type PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import { RecordingExecutor, RecordingLogger } from './fakes';

const TRANSPORT_ROW = TRANSPORT_ROW_FIXTURE;
const TOPIC_ROW = TOPIC_ROW_FIXTURE;
const SUBSCRIPTION_ROW = SUBSCRIPTION_ROW_FIXTURE;
const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const OWNER = 'EEEEEEEE-0000-4000-8000-000000000001';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];

    public async Reserve(topicID: string, key: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        if (key === 'confirmed') return { Kind: 'Duplicate', OwnerMessageID: OWNER };   // a Confirmed row: the only duplicate (F1)
        if (key === 'in-flight') return { Kind: 'Pending', OwnerMessageID: OWNER };     // Reserved by another MessageID
        return { Kind: 'Reserved' };                                                    // new, or re-taken by the same MessageID
    }
    public async Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean> {
        this.Events.push(`confirm:${key}:${ttlSeconds}`);
        return true;
    }
    public async Release(topicID: string, key: string): Promise<boolean> {
        this.Events.push(`release:${key}`);
        return true;
    }
}

function Setup() {
    const sns = new FakeSnsGateway();
    const driver = new AwsTransportDriver(sns, new FakeSqsGateway());
    const ledger = new FakeLedger();
    const topic: TopicRow = {
        ...TOPIC_ROW, Name: 'email.events', TransportID: AWS_TRANSPORT.ID, IsFifo: true, AllowExternalPublish: true,
        BindingConfig: JSON.stringify({ SnsTopicArn: TestAwsResources(true).TopicArn }),
    };
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }] };
    let id = 100;
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: name => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: new RecordingExecutor(),
        CreateLedger: () => ledger,
        NewID: () => `00000000-0000-4000-8000-000000000${++id}`,
        Now: () => new Date('2026-09-16T12:00:00Z'),
        NotifyPublished: () => undefined,
        Log: new RecordingLogger(),
    };
    return { coordinator: new WorkQueuePublishCoordinator(deps), sns, ledger };
}

const OPTIONS = { UserID: 'U1', External: false, CallerExecutor: null };

describe('WorkQueuePublishCoordinator with the AWS transport driver', () => {
    it('sends one SNS batch with FIFO IDs, skips a confirmed key and confirms accepted keys with their TTL', async () => {
        const { coordinator, sns, ledger } = Setup();
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, PartitionKey: 'subscriber-9', DeduplicationKey: 'click:1', DeduplicationTTLSeconds: 3600, Attributes: { eventType: 'click' } },
            { MessageID: M2, DeduplicationKey: 'confirmed', Attributes: { eventType: 'click' } },
            { MessageID: M3, Attributes: { eventType: 'open' } },
        ], OPTIONS);
        expect(results.map(r => r.Status)).toEqual(['Accepted', 'Duplicate', 'Accepted']);
        expect(results[1].MessageID.toLowerCase()).toBe(OWNER.toLowerCase());
        expect(sns.Batches).toHaveLength(1);
        expect(sns.Batches[0].Entries.map(e => [e.MessageGroupId, e.MessageDeduplicationId, e.MessageAttributes])).toEqual([
            ['subscriber-9', M1, { eventType: 'click' }],
            [M3, M3, { eventType: 'open' }],
        ]);
        expect(ledger.Events).toEqual(['reserve:click:1', 'reserve:confirmed', 'confirm:click:1:3600']);
    });

    it('does not call a reservation held by another publish a duplicate: it is retryable, and nothing is sent', async () => {
        const { coordinator, sns, ledger } = Setup();
        const results = await coordinator.Publish('email.events', [{ MessageID: M1, DeduplicationKey: 'in-flight', Attributes: { eventType: 'click' } }], OPTIONS);
        expect(results[0]).toMatchObject({ Status: 'Rejected', Error: { Code: 'DeduplicationPending', Retryable: true } });
        expect(sns.Batches).toHaveLength(0);
        expect(ledger.Events).toEqual(['reserve:in-flight']);
    });

    it('releases the key of an entry SNS fails, and reports it as retryable', async () => {
        const { coordinator, sns, ledger } = Setup();
        sns.FailedEntries.set(M1, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await coordinator.Publish('email.events', [{ MessageID: M1, DeduplicationKey: 'click:1', Attributes: { eventType: 'click' } }], OPTIONS);
        expect(results[0]).toEqual({ MessageID: M1, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'SNS InternalError: try again', Retryable: true } });
        expect(ledger.Events).toEqual(['reserve:click:1', 'release:click:1']);
    });

    it('releases every key when the whole SNS call fails', async () => {
        const { coordinator, sns, ledger } = Setup();
        sns.ThrowOnPublish = new AwsGatewayError('SNS PublishBatch failed: Throttling', 'Throttling', true);
        const results = await coordinator.Publish('email.events', [
            { MessageID: M1, DeduplicationKey: 'a' },
            { MessageID: M2, DeduplicationKey: 'b' },
        ], OPTIONS);
        expect(results.every(r => r.Status === 'Rejected' && r.Error?.Retryable === true)).toBe(true);
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'release:a', 'release:b']);
    });
});
