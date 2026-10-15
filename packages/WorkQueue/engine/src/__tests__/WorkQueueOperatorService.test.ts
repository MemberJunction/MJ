import { describe, it, expect } from 'vitest';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingValidationIssue, DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats, TopicBinding,
} from '@memberjunction/work-queue-core';
import { WorkQueueOperatorService } from '../operations/WorkQueueOperatorService';
import type { WorkQueueOperatorEngine } from '../operations/WorkQueueOperatorService';
import { BuildHostScenario, FakeHostEngine, TEST_USER } from './runtimeFakes';
import type { FakeTransportDriver } from './runtimeFakes';

const DELIVERY_ID = 'DDDDDDDD-4444-4444-8444-000000000001';

const STATS: SubscriptionStats = {
    SubscriptionName: 'set-by-fake', Pending: 4, InFlight: 1, DeadLettered: 2, BlockedKeys: 1,
    OldestPendingAgeSeconds: 30, CompletedLastHour: 12, AsOf: '2026-09-16T12:00:00.000Z',
};

const DEAD_LETTER: DeadLetterRecord = {
    DeliveryID: DELIVERY_ID,
    Message: {
        MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', PartitionKey: 'venue-42',
        Attributes: { source: 'ddx' }, Payload: { batchId: 7 }, PublishedAt: '2026-09-16T11:00:00.000Z',
    },
    PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'bad row 12',
    DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
};

const PARTITION: PartitionStateRecord = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY_ID, WaitingItems: 3,
};

class FakeOperator implements ITransportOperator {
    public Stats: SubscriptionStats | Error = STATS;
    public DeadLetters: Page<DeadLetterRecord> | null = { Items: [DEAD_LETTER], NextCursor: 'cursor-2' };
    public Partitions: Page<PartitionStateRecord> | null = { Items: [PARTITION], NextCursor: null };
    public Result: OperatorResult = { Supported: true, Changed: true };
    public Calls = 0;
    public LastArgs: Array<string | number | null> = [];

    public async GetStats(binding: SubscriptionBinding): Promise<SubscriptionStats> {
        this.Calls++;
        if (this.Stats instanceof Error) {
            throw this.Stats;
        }
        return { ...this.Stats, SubscriptionName: binding.Policy.SubscriptionName };
    }

    public async ListDeadLetters(_binding: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        this.Calls++;
        this.LastArgs = [cursor, pageSize];
        return this.DeadLetters;
    }

    public async ListPartitions(_binding: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord> | null> {
        this.Calls++;
        this.LastArgs = [condition, cursor, pageSize];
        return this.Partitions;
    }

    public async Replay(_binding: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        this.Calls++;
        this.LastArgs = [deliveryID, actorUserID, note];
        return this.Result;
    }

    public async Discard(_binding: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        this.Calls++;
        this.LastArgs = [deliveryID, reason, actorUserID];
        return this.Result;
    }
}

class FakeOperatorEngine extends FakeHostEngine implements WorkQueueOperatorEngine {
    public readonly Operators = new Map<string, FakeOperator>();
    public TopologyIssues: BindingValidationIssue[] = [];
    public Backlog = { Supported: true, Claimable: 3, InFlight: 1, Total: 4, Capped: false };

    public async GetBacklog(_subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }> {
        return this.Backlog;
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return this.Subscriptions.find(s => s.Name.toLowerCase() === name.trim().toLowerCase());
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return { TopicName: topic.Name, IsFifo: false, MaxPayloadBytes: 262144, Config: {} };
    }

    public async GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator> {
        return this.OperatorFor(subscription.Name);
    }

    public async ValidateTopology(): Promise<BindingValidationIssue[]> {
        return this.TopologyIssues;
    }

    public OperatorFor(name: string): FakeOperator {
        let operator = this.Operators.get(name);
        if (!operator) {
            operator = new FakeOperator();
            this.Operators.set(name, operator);
        }
        return operator;
    }
}

interface OperatorScenario {
    Engine: FakeOperatorEngine;
    Service: WorkQueueOperatorService;
    DatabaseDriver: FakeTransportDriver;
}

function scenario(): OperatorScenario {
    const base = BuildHostScenario();
    const engine = new FakeOperatorEngine();
    engine.Transports = base.Engine.Transports;
    engine.Topics = base.Engine.Topics;
    engine.Subscriptions = base.Engine.Subscriptions;
    for (const [id, driver] of base.Engine.Drivers) {
        engine.Drivers.set(id, driver);
    }
    return { Engine: engine, Service: new WorkQueueOperatorService(engine), DatabaseDriver: base.DatabaseDriver };
}

describe('WorkQueueOperatorService stats', () => {
    it('reads one named subscription, matching the name case-insensitively', async () => {
        const { Service } = scenario();
        const output = await Service.GetSubscriptionStats({ subscriptionName: ' INTEGRATION.APPLY ' });
        expect(output.failures).toEqual([]);
        expect(output.subscriptions).toEqual([{ ...STATS, SubscriptionName: 'integration.apply' }]);
    });

    it('reads every subscription in name order and reports per-subscription failures', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('integration.audit').Stats = new Error('view missing');
        const output = await Service.GetSubscriptionStats({});
        expect(output.subscriptions.map(s => s.SubscriptionName)).toEqual([
            'email.dashboard', 'email.ordered', 'email.subscriber-update', 'integration.apply', 'integration.paused',
        ]);
        // camelCase rows (03 §8) carrying a sanitised message: raw driver text never leaves the server
        expect(output.failures).toEqual([{ subscriptionName: 'integration.audit', error: 'Stats are unavailable for this subscription' }]);
    });

    it('rejects an unknown subscription', async () => {
        const { Service } = scenario();
        await expect(Service.GetSubscriptionStats({ subscriptionName: 'nope' })).rejects.toThrow("Unknown work queue subscription 'nope'");
    });
});

describe('WorkQueueOperatorService listings', () => {
    it('maps dead letters, serializing the payload, with the default page size', async () => {
        const { Engine, Service } = scenario();
        const output = await Service.ListDeadLetters({ subscriptionName: 'integration.apply' });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([null, 50]);
        expect(output.supported).toBe(true);
        expect(output.nextCursor).toBe('cursor-2');
        expect(output.items[0]).toEqual({
            DeliveryID: DELIVERY_ID, PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded', LastError: 'bad row 12',
            DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
            Message: {
                MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', PartitionKey: 'venue-42',
                Attributes: { source: 'ddx' }, PayloadJSON: '{"batchId":7}', PublishedAt: '2026-09-16T11:00:00.000Z',
            },
        });
    });

    it('answers unsupported when the transport cannot list dead letters', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('email.subscriber-update').DeadLetters = null;
        expect(await Service.ListDeadLetters({ subscriptionName: 'email.subscriber-update', cursor: 'abc', pageSize: 10 }))
            .toEqual({ supported: false, items: [], nextCursor: null });
    });

    it('rejects a page size outside 1–500 and an oversized cursor without calling the transport', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ListDeadLetters({ subscriptionName: 'integration.apply', pageSize: 501 })).rejects.toThrow(WorkQueueConfigurationError);
        await expect(Service.ListDeadLetters({ subscriptionName: 'integration.apply', cursor: 'c'.repeat(501) })).rejects.toThrow('cursor must be at most 500 characters');
        expect((await Service.ListDeadLetters({ subscriptionName: 'integration.apply', pageSize: 500 })).supported).toBe(true);
        Engine.OperatorFor('integration.apply').Calls = 0;
        await expect(Service.ListPartitions({ subscriptionName: 'integration.apply', pageSize: 0 })).rejects.toThrow('pageSize');
        expect(Engine.OperatorFor('integration.apply').Calls).toBe(0);
    });

    it('validates the partition condition and passes it through', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ListPartitions({ subscriptionName: 'integration.apply', condition: 'Stuck' as unknown as 'Blocked' })).rejects.toThrow('condition must be one of');
        const output = await Service.ListPartitions({ subscriptionName: 'integration.apply', condition: 'Blocked', cursor: 'c1', pageSize: 25 });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual(['Blocked', 'c1', 25]);
        expect(output).toEqual({ supported: true, items: [PARTITION], nextCursor: null });
    });
});

describe('WorkQueueOperatorService repairs', () => {
    it('replays by UUID with the acting user and note', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: "1'; DROP TABLE x" }, TEST_USER)).rejects.toThrow('deliveryID must be a UUID');
        expect(await Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, note: 'fixed mapping' }, TEST_USER))
            .toEqual({ supported: true, replayed: true });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([DELIVERY_ID, TEST_USER.ID, 'fixed mapping']);
    });

    it('requires a discard reason and maps an unsupported transport', async () => {
        const { Engine, Service } = scenario();
        await expect(Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: '  ' }, TEST_USER)).rejects.toThrow('reason is required');
        Engine.OperatorFor('email.subscriber-update').Result = { Supported: false };
        expect(await Service.DiscardDelivery({ subscriptionName: 'email.subscriber-update', deliveryID: DELIVERY_ID, reason: 'test data' }, TEST_USER))
            .toEqual({ supported: false, discarded: false, cancelRequested: false });
    });

    it('bounds free-text input and rejects a null input instead of throwing a TypeError', async () => {
        const { Engine, Service } = scenario();
        const long = 'x'.repeat(1001);
        await expect(Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: long }, TEST_USER)).rejects.toThrow('reason must be at most 1000 characters');
        await expect(Service.ReplayDeadLetter({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, note: long }, TEST_USER)).rejects.toThrow('note must be at most 1000 characters');
        await expect(Service.GetBacklog({ subscriptionName: 'n'.repeat(201) })).rejects.toThrow('subscriptionName must be at most 200 characters');
        await expect(Service.ListDeadLetters(null as unknown as { subscriptionName: string })).rejects.toThrow('input must be an object');
        await expect(Service.DiscardDelivery('nope' as unknown as { subscriptionName: string; deliveryID: string; reason: string }, TEST_USER)).rejects.toThrow(WorkQueueConfigurationError);
        expect(Engine.OperatorFor('integration.apply').Calls).toBe(0);
    });

    it('reports a requested cancel when an in-flight delivery is discarded', async () => {
        const { Engine, Service } = scenario();
        Engine.OperatorFor('integration.apply').Result = { Supported: true, Changed: true, CancelRequested: true };
        expect(await Service.DiscardDelivery({ subscriptionName: 'integration.apply', deliveryID: DELIVERY_ID, reason: 'operator cancel' }, TEST_USER))
            .toEqual({ supported: true, discarded: true, cancelRequested: true });
        expect(Engine.OperatorFor('integration.apply').LastArgs).toEqual([DELIVERY_ID, 'operator cancel', TEST_USER.ID]);
    });

    it('returns the autoscaler backlog and rejects an unknown subscription', async () => {
        const { Engine, Service } = scenario();
        Engine.Backlog = { Supported: true, Claimable: 1000, InFlight: 2, Total: 1002, Capped: true };
        expect(await Service.GetBacklog({ subscriptionName: ' integration.apply ' }))
            .toEqual({ supported: true, claimable: 1000, inFlight: 2, total: 1002, capped: true });
        Engine.Backlog = { Supported: false, Claimable: 0, InFlight: 0, Total: 0, Capped: false };
        expect(await Service.GetBacklog({ subscriptionName: 'integration.apply' }))
            .toEqual({ supported: false, claimable: 0, inFlight: 0, total: 0, capped: false });
        await expect(Service.GetBacklog({ subscriptionName: 'nope' })).rejects.toThrow("Unknown work queue subscription 'nope'");
    });
});

describe('WorkQueueOperatorService bindings', () => {
    it('validates the whole topology, or one transport topic by topic', async () => {
        const { Engine, DatabaseDriver, Service } = scenario();
        Engine.TopologyIssues = [{ Severity: 'Warning', Subject: 'email.events', Message: 'IsFifo should be 1' }];
        expect(await Service.ValidateBindings({})).toEqual({ issues: Engine.TopologyIssues });

        const seen: Array<[string, string[]]> = [];
        DatabaseDriver.ValidateBindings = async (topic: TopicBinding, subscriptions: SubscriptionBinding[]) => {
            seen.push([topic.TopicName, subscriptions.map(s => s.Policy.SubscriptionName)]);
            return [{ Severity: 'Error', Subject: topic.TopicName, Message: 'table missing' }];
        };
        const output = await Service.ValidateBindings({ transportName: 'database' });
        expect(seen).toEqual([['integration.batch-ready', ['integration.apply', 'integration.audit', 'integration.paused']]]);
        expect(output.issues).toEqual([{ Severity: 'Error', Subject: 'integration.batch-ready', Message: 'table missing' }]);
        await expect(Service.ValidateBindings({ transportName: 'nope' })).rejects.toThrow("Unknown work queue transport 'nope'");
    });
});
