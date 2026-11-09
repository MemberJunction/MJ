import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '../testing/rowFixtures';
import { SeededWorkQueueEngineBase } from '../testing/SeededWorkQueueEngineBase';
import type { TopologySnapshot } from '../topology/bindings';

const USER = { ID: '11111111-0000-0000-0000-000000000001' } as UserInfo;
const SNAPSHOT: TopologySnapshot = { Transports: [TRANSPORT_ROW_FIXTURE], Topics: [TOPIC_ROW_FIXTURE], Subscriptions: [SUBSCRIPTION_ROW_FIXTURE] };

function Seeded(snapshot: TopologySnapshot = SNAPSHOT): SeededWorkQueueEngineBase {
    const engine = SeededWorkQueueEngineBase.Instance;
    engine.Seed(snapshot, USER);
    return engine;
}

describe('WorkQueueEngineBase', () => {
    it('looks up topics and subscriptions by trimmed, case-insensitive name', () => {
        const engine = Seeded();
        expect(engine.GetTopicByName(' IMPORT.READY ')?.Name).toBe('import.ready');
        expect(engine.GetSubscriptionByName('VENUE-IMPORT')?.Name).toBe('venue-import');
        expect(engine.SubscriptionsForTopic(TOPIC_ROW_FIXTURE.ID.toLowerCase())).toHaveLength(1);
    });

    it('navigates subscription → topic → transport, answering undefined for dangling references', () => {
        const engine = Seeded();
        const topic = engine.TopicOf(engine.Subscriptions[0]);
        expect(topic?.Name).toBe('import.ready');
        expect(topic && engine.TransportOf(topic)?.Name).toBe('Database');
        const dangling = Seeded({ ...SNAPSHOT, Topics: [] });
        expect(dangling.TopicOf(dangling.Subscriptions[0])).toBeUndefined();
    });

    it('builds bindings and policies, and parses filters against a given support', () => {
        const filter = '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}';
        const engine = Seeded({ ...SNAPSHOT, Subscriptions: [{ ...SUBSCRIPTION_ROW_FIXTURE, Filter: filter }] });
        const subscription = engine.Subscriptions[0];
        expect(engine.BuildSubscriptionBinding(subscription).Config).toEqual({ SubscriptionID: SUBSCRIPTION_ROW_FIXTURE.ID, TopicID: TOPIC_ROW_FIXTURE.ID });
        expect(engine.BuildSubscriptionPolicy(subscription)).toMatchObject({ SubscriptionName: 'venue-import', PartitionMode: 'Ordered' });
        expect(engine.ParseFilter(subscription, WORK_QUEUE_FILTER_SUPPORT)).not.toBeNull();
        const noPrefix = { ...WORK_QUEUE_FILTER_SUPPORT, Operators: WORK_QUEUE_FILTER_SUPPORT.Operators.filter(o => o !== 'startswith') };
        expect(() => engine.ParseFilter(subscription, noPrefix)).toThrow('startswith');
    });

    it('refuses to build a binding for a subscription whose topic is missing', () => {
        const engine = Seeded({ ...SNAPSHOT, Topics: [] });
        expect(() => engine.BuildSubscriptionBinding(engine.Subscriptions[0])).toThrow(WorkQueueConfigurationError);
    });

    it('validates the topology against capabilities keyed by driver class', () => {
        const engine = Seeded();
        expect(engine.ValidateTopologyRows({})[0].Message).toContain("DriverClass 'Database'");
        const database: TransportCapabilities = {
            Filters: WORK_QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true,
            SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
            ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
        };
        expect(engine.ValidateTopologyRows({ Database: database })).toEqual([]);
    });

    it('exposes the snapshot the pure helpers work over, and the seeded system user', () => {
        const engine = Seeded();
        expect(engine.Snapshot).toEqual(SNAPSHOT);
        expect(engine.ContextUser).toBe(USER);
        expect(engine.Loaded).toBe(true);
    });
});
