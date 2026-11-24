import { describe, it, expect } from 'vitest';
import { BuildTopologyManifest, type SubscriptionRow, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { EnrichGcpManifest, GCP_DRIVER_CLASS } from '../gcp/GcpManifestEnricher';
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';

const GCP_TRANSPORT: TransportRow = {
    ...TRANSPORT_ROW_FIXTURE,
    ID: 'A0000000-0000-0000-0000-000000000003',
    Name: 'GCP-test',
    DriverClass: 'GCP',
    Configuration: '{"ProjectId":"mj-wq-test"}',
};
const GCP_TOPIC: TopicRow = { ...TOPIC_ROW_FIXTURE, Name: 'email.events', TransportID: GCP_TRANSPORT.ID, IsFifo: true };
const FILTERED: SubscriptionRow = {
    ...SUBSCRIPTION_ROW_FIXTURE,
    ID: 'BBBBBBBB-0000-0000-0000-000000000002',
    Name: 'email.unsubscribe',
    PartitionMode: 'Exclusive',
    HostType: 'External',
    HandlerKey: null,
    Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"unsubscribe"}]}',
};
const UNFILTERED: SubscriptionRow = {
    ...SUBSCRIPTION_ROW_FIXTURE,
    ID: 'BBBBBBBB-0000-0000-0000-000000000003',
    Name: 'email.archive',
    PartitionMode: 'None',
    Filter: null,
};

function build(transportName: string, subscriptions: SubscriptionRow[]) {
    const snapshot = {
        Transports: [TRANSPORT_ROW_FIXTURE, GCP_TRANSPORT],
        Topics: [TOPIC_ROW_FIXTURE, GCP_TOPIC],
        Subscriptions: subscriptions,
    };
    return BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z'));
}

describe('EnrichGcpManifest', () => {
    it('renders Google Cloud Pub/Sub filter expressions for every subscription of a GCP manifest', () => {
        const manifest = EnrichGcpManifest(build('GCP-test', [FILTERED, UNFILTERED]));
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map((s) => [s.Name, s]));
        expect(byName['email.unsubscribe'].DriverArtifacts).toEqual({ PubSubFilter: 'attributes.eventType = "unsubscribe"' });
        expect(byName['email.archive'].DriverArtifacts).toEqual({ PubSubFilter: null });
    });

    it('refuses an Ordered subscription: Ordered requires the Database transport', () => {
        const ordered: SubscriptionRow = { ...UNFILTERED, PartitionMode: 'Ordered', HostType: 'MJWorker' };
        expect(() => EnrichGcpManifest(build('GCP-test', [ordered]))).toThrow('Ordered requires the Database transport');
    });

    it('refuses filters exceeding Pub/Sub combination caps', () => {
        const or = (field: string, count: number) => ({
            logic: 'or',
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq', value: String(i) })),
        });
        const wide: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ logic: 'and', filters: [or('a', 6), or('b', 6), or('c', 5)] }) };
        expect(() => EnrichGcpManifest(build('GCP-test', [wide]))).toThrow(WorkQueueConfigurationError);
    });

    it('registers the GCP enricher in ManifestEnricherRegistry', () => {
        const registry = ManifestEnricherRegistry.Instance;
        registry.Register(GCP_DRIVER_CLASS, EnrichGcpManifest);
        expect(registry.Apply(build('GCP-test', [UNFILTERED])).Topics[0].Subscriptions[0].DriverArtifacts).toEqual({ PubSubFilter: null });
    });
});
