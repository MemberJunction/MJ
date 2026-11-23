import { describe, it, expect } from 'vitest';
import { BuildTopologyManifest, type SubscriptionRow, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { AZURE_DRIVER_CLASS, EnrichAzureManifest } from '../azure/AzureManifestEnricher';
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';

const AZURE_TRANSPORT: TransportRow = {
    ...TRANSPORT_ROW_FIXTURE,
    ID: 'A0000000-0000-0000-0000-000000000002',
    Name: 'Azure-test',
    DriverClass: 'Azure',
    Configuration: '{"Namespace":"mj-wq-test.servicebus.windows.net"}',
};
const AZURE_TOPIC: TopicRow = { ...TOPIC_ROW_FIXTURE, Name: 'email.events', TransportID: AZURE_TRANSPORT.ID, IsFifo: true };
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
        Transports: [TRANSPORT_ROW_FIXTURE, AZURE_TRANSPORT],
        Topics: [TOPIC_ROW_FIXTURE, AZURE_TOPIC],
        Subscriptions: subscriptions,
    };
    return BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z'));
}

describe('EnrichAzureManifest', () => {
    it('renders Service Bus SQL filter expressions for every subscription of an Azure manifest', () => {
        const manifest = EnrichAzureManifest(build('Azure-test', [FILTERED, UNFILTERED]));
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map((s) => [s.Name, s]));
        expect(byName['email.unsubscribe'].DriverArtifacts).toEqual({ SqlFilterExpression: "user.[eventType] = 'unsubscribe'" });
        expect(byName['email.archive'].DriverArtifacts).toEqual({ SqlFilterExpression: null });
    });

    it('refuses an Ordered subscription: Ordered requires the Database transport', () => {
        const ordered: SubscriptionRow = { ...UNFILTERED, PartitionMode: 'Ordered', HostType: 'MJWorker' };
        expect(() => EnrichAzureManifest(build('Azure-test', [ordered]))).toThrow('Ordered requires the Database transport');
    });

    it('refuses filters exceeding Service Bus combination caps', () => {
        const or = (field: string, count: number) => ({
            logic: 'or',
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq', value: String(i) })),
        });
        const wide: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ logic: 'and', filters: [or('a', 6), or('b', 6), or('c', 5)] }) };
        expect(() => EnrichAzureManifest(build('Azure-test', [wide]))).toThrow(WorkQueueConfigurationError);
    });

    it('registers the Azure enricher in ManifestEnricherRegistry', () => {
        const registry = ManifestEnricherRegistry.Instance;
        registry.Register(AZURE_DRIVER_CLASS, EnrichAzureManifest);
        expect(registry.Apply(build('Azure-test', [UNFILTERED])).Topics[0].Subscriptions[0].DriverArtifacts).toEqual({ SqlFilterExpression: null });
    });
});
