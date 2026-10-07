import { describe, it, expect } from 'vitest';
import type { TopologySnapshot } from '../topology/bindings';
import { BuildTopologyManifest, PlanBindingImport } from '../topology/manifest';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };

function Snapshot(overrides: Partial<TopologySnapshot> = {}): TopologySnapshot {
    return { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [TOPIC_ROW], Subscriptions: [SUBSCRIPTION_ROW], ...overrides };
}

describe('manifest', () => {
    it('exports active topics and non-disabled subscriptions of one transport, sorted by name', () => {
        const other = { ...TOPIC_ROW, ID: 'T2', Name: 'aaa.first' };
        const manifest = BuildTopologyManifest(Snapshot({ Topics: [TOPIC_ROW, other] }), 'Database', new Date('2026-01-01T00:00:00Z'));
        expect(manifest.ManifestVersion).toBe(1);
        expect(manifest.GeneratedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(manifest.Transport).toEqual({ Name: 'Database', DriverClass: 'Database', Configuration: {} });
        expect(manifest.Topics.map(t => t.Name)).toEqual(['aaa.first', 'import.ready']);
        expect(manifest.Topics[1]).toMatchObject({ Name: 'import.ready', IsFifo: false, MaxPayloadBytes: 262144 });
        expect(manifest.Topics[1].Subscriptions[0]).toEqual({
            Name: 'venue-import', Filter: null, HostType: 'MJWorker', Status: 'Active', ExternalRef: null,
            Policy: expect.objectContaining({ SubscriptionName: 'venue-import', PartitionMode: 'Ordered' }),
        });
    });

    it('exports Paused subscriptions with their status and leaves Disabled ones out', () => {
        const paused = { ...SUBSCRIPTION_ROW, ID: 'B2', Name: 'paused-one', Status: 'Paused' as const };
        const disabled = { ...SUBSCRIPTION_ROW, ID: 'B3', Name: 'retired', Status: 'Disabled' as const };
        const manifest = BuildTopologyManifest(Snapshot({ Subscriptions: [SUBSCRIPTION_ROW, paused, disabled] }), 'Database', new Date());
        expect(manifest.Topics[0].Subscriptions.map(s => [s.Name, s.Status])).toEqual([['paused-one', 'Paused'], ['venue-import', 'Active']]);
    });

    it('exports the transport configuration as an object and only that transport’s topics', () => {
        const manifest = BuildTopologyManifest(Snapshot(), 'AWS-dev', new Date());
        expect(manifest.Transport.Configuration).toEqual({ Region: 'us-east-1' });
        expect(manifest.Topics).toEqual([]);
    });

    it('fails for an unknown transport', () => {
        expect(() => BuildTopologyManifest(Snapshot(), 'Nope', new Date())).toThrow("Transport 'Nope'");
    });

    it('plans binding updates and reports unknown names and versions', () => {
        const plan = PlanBindingImport(Snapshot(), {
            ManifestVersion: 1,
            Topics: [{ Name: 'import.ready', BindingConfig: { SnsTopicArn: 'arn' } }, { Name: 'ghost', BindingConfig: {} }],
            Subscriptions: [{ Name: 'venue-import', BindingConfig: { QueueUrl: 'https://q' } }],
        });
        expect(plan.TopicUpdates).toEqual([{ ID: TOPIC_ROW.ID, Name: 'import.ready', BindingConfig: '{"SnsTopicArn":"arn"}' }]);
        expect(plan.SubscriptionUpdates).toEqual([{ ID: SUBSCRIPTION_ROW.ID, Name: 'venue-import', BindingConfig: '{"QueueUrl":"https://q"}' }]);
        expect(plan.Issues).toEqual([{ Severity: 'Error', Subject: 'ghost', Message: 'No topic named ghost exists' }]);
    });
});
