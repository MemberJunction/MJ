import { describe, it, expect } from 'vitest';
import { BuildTopologyManifest, type SubscriptionRow, type TopicRow, type TransportRow } from '@memberjunction/work-queue-base';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { AWS_DRIVER_CLASS, EnrichAwsManifest } from '../aws/AwsManifestEnricher';
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';

const AWS_TRANSPORT: TransportRow = { ...TRANSPORT_ROW_FIXTURE, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-test', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const AWS_TOPIC: TopicRow = { ...TOPIC_ROW_FIXTURE, Name: 'email.events', TransportID: AWS_TRANSPORT.ID, IsFifo: true };
const FILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'email.unsubscribe', PartitionMode: 'Exclusive', HostType: 'External', HandlerKey: null, Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"unsubscribe"}]}' };
const UNFILTERED: SubscriptionRow = { ...SUBSCRIPTION_ROW_FIXTURE, ID: 'BBBBBBBB-0000-0000-0000-000000000003', Name: 'email.archive', PartitionMode: 'None', Filter: null };

function build(transportName: string, subscriptions: SubscriptionRow[]) {
    const snapshot = { Transports: [TRANSPORT_ROW_FIXTURE, AWS_TRANSPORT], Topics: [TOPIC_ROW_FIXTURE, AWS_TOPIC], Subscriptions: subscriptions };
    return BuildTopologyManifest(snapshot, transportName, new Date('2026-09-16T12:00:00Z'));
}

describe('EnrichAwsManifest', () => {
    it('renders SNS filter policies for every subscription of an AWS manifest', () => {
        const manifest = EnrichAwsManifest(build('AWS-test', [FILTERED, UNFILTERED]));
        const byName = Object.fromEntries(manifest.Topics[0].Subscriptions.map(s => [s.Name, s]));
        expect(byName['email.unsubscribe'].DriverArtifacts).toEqual({ SnsFilterPolicy: '{"eventType":["unsubscribe"]}' });
        expect(byName['email.archive'].DriverArtifacts).toEqual({ SnsFilterPolicy: null });
    });

    it('refuses a filter SNS cannot express', () => {
        const or = (field: string, count: number) => ({
            logic: 'or',
            filters: Array.from({ length: count }, (_, i) => ({ field, operator: 'eq', value: String(i) })),
        });
        // 6 × 6 × 5 = 180 value combinations, above the SNS limit of 150 (Task 2).
        const wide: SubscriptionRow = { ...FILTERED, Filter: JSON.stringify({ logic: 'and', filters: [or('a', 6), or('b', 6), or('c', 5)] }) };
        expect(() => EnrichAwsManifest(build('AWS-test', [wide]))).toThrow(WorkQueueConfigurationError);
    });

    it('refuses an Ordered subscription: Ordered requires the Database transport', () => {
        const ordered: SubscriptionRow = { ...UNFILTERED, PartitionMode: 'Ordered', HostType: 'MJWorker' };
        expect(() => EnrichAwsManifest(build('AWS-test', [ordered]))).toThrow('Ordered requires the Database transport');
    });
});

describe('ManifestEnricherRegistry', () => {
    it('applies the enricher registered for the manifest transport and leaves Database manifests alone', () => {
        const registry = ManifestEnricherRegistry.Instance;
        registry.Register(AWS_DRIVER_CLASS, EnrichAwsManifest);
        expect(registry.Apply(build('AWS-test', [UNFILTERED])).Topics[0].Subscriptions[0].DriverArtifacts).toEqual({ SnsFilterPolicy: null });
        expect(registry.Apply(build('Database', [SUBSCRIPTION_ROW_FIXTURE])).Topics[0].Subscriptions[0].DriverArtifacts).toBeUndefined();
    });

    it('names the missing import when a cloud manifest has no enricher', () => {
        const manifest = { ...build('AWS-test', [UNFILTERED]), Transport: { Name: 'Azure-test', DriverClass: 'Azure', Configuration: {} } };
        expect(() => ManifestEnricherRegistry.Instance.Apply(manifest)).toThrow("No manifest enricher is registered for DriverClass 'Azure'");
    });
});
