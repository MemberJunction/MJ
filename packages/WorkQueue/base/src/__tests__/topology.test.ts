import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';
import { FindByName, ResolveTopic, ToSubscriptionBinding, ToTopicBinding } from '../topology/bindings';
import type { TopologySnapshot } from '../topology/bindings';
import { ValidateTopologyRows } from '../topology/validateTopology';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

const DATABASE_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true, SupportsExternalHosts: false,
    CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
    Filters: WORK_QUEUE_FILTER_SUPPORT,
};
const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const AWS_CAPABILITIES: TransportCapabilities = {
    ...DATABASE_CAPABILITIES, SupportsOrdered: false, SupportsExternalHosts: true, CancelPending: false, CancelInFlight: false,
    ListPartitions: false, PeekDeadLetters: 'BestEffort', CompletedCounts: false, PersistsProgress: false,
    DetectsMessageIDDuplicates: false, MaxRetryDelaySeconds: 43200,
    // A cloud transport that cannot express prefix matching, so `startswith` must be rejected at save time.
    Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq', 'neq', 'isnull', 'isnotnull'] },
};

function Snapshot(overrides: Partial<TopologySnapshot> = {}): TopologySnapshot {
    return { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [TOPIC_ROW], Subscriptions: [SUBSCRIPTION_ROW], ...overrides };
}

describe('bindings', () => {
    it('adds row IDs to binding config and builds the policy', () => {
        expect(ToTopicBinding({ ...TOPIC_ROW, BindingConfig: '{"SnsTopicArn":"arn"}' }).Config).toEqual({ SnsTopicArn: 'arn', TopicID: TOPIC_ROW.ID });
        const binding = ToSubscriptionBinding({ ...SUBSCRIPTION_ROW, MaxProcessingSeconds: 120 }, TOPIC_ROW);
        expect(binding.Config).toEqual({ SubscriptionID: SUBSCRIPTION_ROW.ID, TopicID: TOPIC_ROW.ID });
        expect(binding.Policy).toMatchObject({ SubscriptionName: 'venue-import', TopicName: 'import.ready', PartitionMode: 'Ordered', MaxProcessingSeconds: 120 });
        expect(ToTopicBinding(TOPIC_ROW)).toEqual({ TopicName: 'import.ready', IsFifo: false, MaxPayloadBytes: 262144, Config: { TopicID: TOPIC_ROW.ID } });
    });

    it('resolves a topic by trimmed case-insensitive name with its non-disabled subscriptions', () => {
        const disabled = { ...SUBSCRIPTION_ROW, ID: 'B2', Name: 'old', Status: 'Disabled' as const };
        const resolved = ResolveTopic(Snapshot({ Subscriptions: [SUBSCRIPTION_ROW, disabled] }), '  IMPORT.READY ');
        expect(resolved?.Transport.Name).toBe('Database');
        expect(resolved?.Subscriptions.map(s => s.Policy.SubscriptionName)).toEqual(['venue-import']);
        expect(ResolveTopic(Snapshot(), 'missing')).toBeUndefined();
        expect(FindByName([TOPIC_ROW], 'Import.Ready')).toBe(TOPIC_ROW);
    });

    it('fails loudly when the topic points at a transport that does not exist', () => {
        expect(() => ResolveTopic(Snapshot({ Transports: [] }), 'import.ready')).toThrow('transport that does not exist');
    });
});

describe('ValidateTopologyRows', () => {
    const capabilities: Record<string, TransportCapabilities> = { Database: DATABASE_CAPABILITIES, AWS: AWS_CAPABILITIES };
    const EXCLUSIVE = { ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' as const };

    it('passes a valid Database topology', () => {
        expect(ValidateTopologyRows(Snapshot(), capabilities)).toEqual([]);
    });

    it('requires FIFO for Exclusive subscriptions on cloud topics', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, BindingConfig: '{"SnsTopicArn":"arn"}' };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [EXCLUSIVE] }), capabilities);
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Subject: 'import.ready', Message: expect.stringContaining('IsFifo') })]);
        const unpartitioned = { ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const };
        expect(ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [unpartitioned] }), capabilities)).toEqual([]);
    });

    it('warns about IsFifo on a Database topic and a disabled transport', () => {
        const disabled = { ...TRANSPORT_ROW, Status: 'Disabled' as const };
        const issues = ValidateTopologyRows(Snapshot({ Transports: [disabled], Topics: [{ ...TOPIC_ROW, IsFifo: true }] }), capabilities);
        expect(issues.map(i => i.Severity)).toEqual(['Warning', 'Warning']);
    });

    it('rejects Ordered subscriptions on every cloud transport, whatever the host', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        for (const row of [SUBSCRIPTION_ROW, { ...SUBSCRIPTION_ROW, HostType: 'External' as const, HandlerKey: null }]) {
            const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [row] }), capabilities);
            expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Subject: 'venue-import', Message: expect.stringContaining('Ordered') })]);
        }
    });

    it('warns about processing times above the external host ceiling', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const lambda = { ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' as const, HostType: 'External' as const, HandlerKey: null, MaxProcessingSeconds: 1800 };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [lambda] }), capabilities);
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Warning', Subject: 'venue-import' })]);
    });

    it('reports unavailable drivers and unparseable filters', () => {
        expect(ValidateTopologyRows(Snapshot(), {})[0]).toMatchObject({ Severity: 'Error', Subject: 'import.ready', Message: expect.stringContaining("DriverClass 'Database'") });
        const badFilter = { ...SUBSCRIPTION_ROW, Filter: '{"eventType":"click"}' };
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [badFilter] }), capabilities)[0].Subject).toBe('venue-import');
    });

    it('rejects a filter the topic transport cannot express, naming field and operator', () => {
        const startswith = '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}';
        const row = { ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const, Filter: startswith };
        // Valid on Database (full subset)…
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [row] }), capabilities)).toEqual([]);
        // …and an Error on the cloud transport whose FilterSupport omits `startswith`.
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const issue = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [row] }), capabilities)[0];
        expect(issue).toMatchObject({ Severity: 'Error', Subject: 'venue-import' });
        expect(issue.Message).toContain('startswith');
        expect(issue.Message).toContain('tenant');
    });
});
