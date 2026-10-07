import { describe, it, expect, afterEach } from 'vitest';
import type { TopologyManifest } from '@memberjunction/work-queue-core';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TopologySnapshot, WorkQueueEngineBase } from '@memberjunction/work-queue-base';
import {
    SeededWorkQueueEngineBase, SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE,
} from '@memberjunction/work-queue-base/testing';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { WorkQueueEngine } from '../WorkQueueEngine';
import { RecordingExecutor, TEST_USER } from './fakes';

/** The facade with its two collaborators replaced; everything else is the production code. */
class TestEngine extends WorkQueueEngine {
    public static override get Instance(): TestEngine {
        return super.getInstance<TestEngine>();
    }
    public Source: RecordingExecutor = new RecordingExecutor();
    public Enriched: TopologyManifest[] = [];

    public override get Metadata(): WorkQueueEngineBase {
        return SeededWorkQueueEngineBase.Instance;
    }
    protected override get Executor(): WorkQueueExecutorSource {
        return this.Source;
    }
    protected override EnrichManifest(manifest: TopologyManifest): TopologyManifest {
        this.Enriched.push(manifest);
        return manifest;
    }
}

const SNAPSHOT: TopologySnapshot = { Transports: [TRANSPORT_ROW_FIXTURE], Topics: [TOPIC_ROW_FIXTURE], Subscriptions: [SUBSCRIPTION_ROW_FIXTURE] };

function Engine(snapshot: TopologySnapshot = SNAPSHOT): TestEngine {
    SeededWorkQueueEngineBase.Instance.Seed(snapshot, TEST_USER);
    const engine = TestEngine.Instance;
    engine.Source = new RecordingExecutor();
    engine.Enriched = [];
    return engine;
}

afterEach(async () => {
    await TestEngine.Instance.Shutdown();
});

describe('WorkQueueEngine proxies (03 §11)', () => {
    it('forwards the closed proxy list to the metadata tier', () => {
        const engine = Engine();
        expect(engine.Transports).toHaveLength(1);
        expect(engine.Topics[0].Name).toBe('import.ready');
        expect(engine.Subscriptions[0].Name).toBe('venue-import');
        expect(engine.GetTopicByName(' IMPORT.READY ')?.ID).toBe(TOPIC_ROW_FIXTURE.ID);
        expect(engine.GetSubscriptionByName('venue-import')?.ID).toBe(SUBSCRIPTION_ROW_FIXTURE.ID);
        expect(engine.SubscriptionsForTopic(TOPIC_ROW_FIXTURE.ID)).toHaveLength(1);
        expect(engine.BuildTopicBinding(engine.Topics[0]).Config).toEqual({ TopicID: TOPIC_ROW_FIXTURE.ID });
        expect(engine.BuildSubscriptionBinding(engine.Subscriptions[0], WORK_QUEUE_FILTER_SUPPORT).Policy.PartitionMode).toBe('Ordered');
    });

    it('no longer carries the members Revision 4 removed from the 03 §11 surface', () => {
        const engine = Engine();
        for (const gone of ['IsStagedToDatabase', 'GetDatabaseDriver', 'Loaded', 'ContextUser', 'ProviderToUse', 'HandleStartup']) {
            expect(gone in engine).toBe(false);
        }
    });
});

describe('WorkQueueEngine drivers', () => {
    it('hands out ONE driver instance per transport, however it is reached', async () => {
        const engine = Engine();
        const driver = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        expect(driver).toBeInstanceOf(DatabaseTransportDriver);
        expect(await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID.toLowerCase())).toBe(driver);
        expect(await engine.GetOperator(engine.Subscriptions[0])).toBe(driver.Operator());
    });

    it('rebuilds the driver when the transport changes, and closes the one it replaces', async () => {
        const engine = Engine();
        const first = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        engine.Source.QueueRows([{ AffectedRows: 0 }]);
        await first.Operator().Replay(engine.BuildSubscriptionBinding(engine.Subscriptions[0]), 'EEEEEEEE-0000-0000-0000-000000000001', null, null);
        SeededWorkQueueEngineBase.Instance.Seed({ ...SNAPSHOT, Transports: [{ ...TRANSPORT_ROW_FIXTURE, Configuration: '{"x":1}' }] }, TEST_USER);
        const second = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        expect(second).not.toBe(first);
        expect(engine.Source.Events).toEqual(['independent', 'release']);
    });

    it('fails clearly for an unknown transport', async () => {
        await expect(Engine().GetDriver('00000000-0000-0000-0000-00000000dead')).rejects.toThrow('does not exist');
    });
});

describe('WorkQueueEngine.GetBacklog', () => {
    it('reports capped counts with their total for a Database subscription', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ Claimable: 1000, InFlight: 3 }]);
        expect(await engine.GetBacklog('venue-import')).toEqual({ Supported: true, Claimable: 1000, InFlight: 3, Total: 1003, Capped: true });
    });

    it('rejects an unknown subscription', async () => {
        await expect(Engine().GetBacklog('nope')).rejects.toThrow("'nope' does not exist");
    });
});

describe('WorkQueueEngine dead-letter events', () => {
    it('fans NotifyDeadLettered out to OnDeadLettered listeners until they unsubscribe', () => {
        const engine = Engine();
        const seen: DeadLetteredEvent[] = [];
        const off = engine.OnDeadLettered(event => seen.push(event));
        const event = { SubscriptionName: 'venue-import', DeliveryID: 'D1', Reason: 'LeaseExpired', PartitionKey: null };
        engine.NotifyDeadLettered(event);
        off();
        engine.NotifyDeadLettered(event);
        expect(seen).toEqual([event]);
    });
});

describe('WorkQueueEngine.ValidateTopology', () => {
    it('reports READ_COMMITTED_SNAPSHOT OFF as an Error (F9)', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ SnapshotOn: 0 }]);
        const issues = await engine.ValidateTopology();
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Message: expect.stringContaining('READ_COMMITTED_SNAPSHOT') })]);
    });

    it('passes a healthy Database topology', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ SnapshotOn: 1 }]);
        expect(await engine.ValidateTopology()).toEqual([]);
    });

    it('reports a transport whose driver is not registered instead of throwing', async () => {
        const azure = { ...TRANSPORT_ROW_FIXTURE, DriverClass: 'Azure' };
        const issues = await Engine({ ...SNAPSHOT, Transports: [azure] }).ValidateTopology();
        expect(issues[0]).toMatchObject({ Severity: 'Error', Subject: 'Database', Message: expect.stringContaining("DriverClass 'Azure'") });
    });
});

describe('WorkQueueEngine publishing and manifest', () => {
    it('publishes through the cached driver and tells OnPublished listeners', async () => {
        const engine = Engine();
        const published: string[] = [];
        const off = engine.OnPublished(name => published.push(name));
        engine.Source.QueueRows([{ ID: 'CCCCCCCC-0000-0000-0000-000000000001', PublishOrdinal: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const [result] = await engine.PublishAs('import.ready', [{ MessageID: 'CCCCCCCC-0000-0000-0000-000000000001' }], { ContextUser: TEST_USER });
        off();
        expect(result.Status).toBe('Accepted');
        expect(published).toEqual(['import.ready']);
        expect(engine.Source.CallsOn('source')).toHaveLength(0);
    });

    it('passes the exported manifest through the single enrichment step', () => {
        const engine = Engine();
        const manifest = engine.ExportManifest('Database');
        expect(manifest.Topics[0].Name).toBe('import.ready');
        expect(engine.Enriched).toEqual([manifest]);
    });
});
