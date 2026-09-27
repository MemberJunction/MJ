import { describe, it, expect } from 'vitest';
import { BuildTopologyManifest, type SubscriptionRow, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { AZURE_DRIVER_CLASS, EnrichAzureManifest } from '../azure/AzureManifestEnricher';
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';

const AZURE_TRANSPORT: TransportRow = { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000002', Name: 'Azure-test', DriverClass: 'Azure', Configuration: '{"FullyQualifiedNamespace":"contoso.servicebus.windows.net"}' };
const AZURE_TOPIC: TopicRow = { ...TOPIC_ROW_FIXTURE, Name: 'email.events', TransportID: AZURE_TRANSPORT.ID, IsFifo: true };
const FILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000012', Name: 'email.unsubscribe', PartitionMode: 'Exclusive', HostType: 'External', HandlerKey: null, Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"unsubscribe"}]}' };
const UNFILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000013', Name: 'email.archive', PartitionMode: 'None', Filter: null };

function build(transportName: string, subscriptions: SubscriptionRow[]) {
    const snapshot = { Transports: [TRANSPORT_ROW_FIXTURE, AZURE_TRANSPORT], Topics: [TOPIC_ROW_FIXTURE, AZURE_TOPIC], Subscriptions: subscriptions };
    return BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z'));
}

describe('EnrichAzureManifest', () => {
    it('renders the rule SQL and session flag for every subscription of an Azure manifest', () => {
        const manifest = EnrichAzureManifest(build('Azure-test', [FILTERED, UNFILTERED]));
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map(s => [s.Name, s]));
        expect(byName['email.unsubscribe'].DriverArtifacts).toEqual({
            ServiceBusRuleSql: "(NOT EXISTS(mj_target) OR mj_target = 'email.unsubscribe') AND (eventType = 'unsubscribe')",
            RequiresSession: true,
        });
        expect(byName['email.archive'].DriverArtifacts).toEqual({ ServiceBusRuleSql: "(NOT EXISTS(mj_target) OR mj_target = 'email.archive')", RequiresSession: false });
    });

    it('refuses a filter Service Bus SQL cannot express and an Ordered subscription', () => {
        const twice: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ logic: 'and', filters: [{ field: 'a', operator: 'eq', value: '1' }, { field: 'a', operator: 'neq', value: '2' }] }) };
        expect(() => EnrichAzureManifest(build('Azure-test', [twice]))).toThrow(WorkQueueConfigurationError);
        const ordered: SubscriptionRow = { ...UNFILTERED, PartitionMode: 'Ordered', HostType: 'MJWorker' };
        expect(() => EnrichAzureManifest(build('Azure-test', [ordered]))).toThrow('Ordered requires the Database transport');
    });

    it('is applied by the registry for Azure manifests only', () => {
        const registry = ManifestEnricherRegistry.Instance;
        registry.Register(AZURE_DRIVER_CLASS, EnrichAzureManifest);
        expect(registry.Apply(build('Azure-test', [UNFILTERED])).Topics[0].Subscriptions[0].DriverArtifacts).toMatchObject({ RequiresSession: false });
        expect(registry.Apply(build('Database', [SUBSCRIPTION_ROW_FIXTURE])).Topics[0].Subscriptions[0].DriverArtifacts).toBeUndefined();
    });
});
