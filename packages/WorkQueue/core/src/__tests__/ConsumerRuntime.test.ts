import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsumerRuntime } from '../runtime/ConsumerRuntime';
import { Outcome } from '../handler';
import type { WorkContext, WorkOutcome } from '../handler';
import type { WorkMessage } from '../envelope';
import type { SubscriptionPolicy } from '../policy';
import type { ReceivedDelivery } from '../transport';
import type { ConsumerRuntimeOptions } from '../runtime/types';
import { CreateDeferred, HandlerFrom, MakeDelivery, MakePolicy, RecordingLogger, ScriptedConsumer, WithPartitionKey } from './fakes';
import type { Deferred } from './fakes';

const OPTIONS: ConsumerRuntimeOptions = {
    Concurrency: 2,
    ReceiveBatchSize: 10,
    IdlePollMinMs: 100,
    IdlePollMaxMs: 400,
    ShutdownDrainMs: 1000,
};

interface RuntimeOverrides {
    Options?: Partial<ConsumerRuntimeOptions>;
    Policy?: Partial<SubscriptionPolicy>;
    Logger?: RecordingLogger;
}

function createRuntime(
    consumer: ScriptedConsumer,
    handle: (message: WorkMessage, context: WorkContext) => Promise<WorkOutcome>,
    overrides: RuntimeOverrides = {},
): ConsumerRuntime {
    return new ConsumerRuntime(
        consumer,
        HandlerFrom(handle),
        MakePolicy({ HeartbeatMode: 'Manual', ...overrides.Policy }),
        { ...OPTIONS, ...overrides.Options },
        overrides.Logger ?? new RecordingLogger(),
    );
}

function gates(ids: string[]): (id: string) => Deferred<WorkOutcome> {
    const map = new Map(ids.map((id) => [`msg-${id}`, CreateDeferred<WorkOutcome>()]));
    return (messageID: string) => {
        const gate = map.get(messageID.startsWith('msg-') ? messageID : `msg-${messageID}`);
        if (gate === undefined) {
            throw new Error(`No gate for ${messageID}`);
        }
        return gate;
    };
}

describe('ConsumerRuntime loop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('receives a batch and settles every delivery', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1'), MakeDelivery('d2')]);
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Complete').map((call) => call.DeliveryID).sort()).toEqual(['d1', 'd2']);
        expect(runtime.InFlightCount).toBe(0);
        await runtime.Stop();
    });

    it('never runs more handlers than Concurrency', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        const gate = gates(['d1', 'd2', 'd3']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Receive')).toEqual([{ Op: 'Receive', Max: 2, WaitSeconds: 0 }]);
        expect(runtime.InFlightCount).toBe(2);
        await vi.advanceTimersByTimeAsync(300);
        expect(consumer.Count('Receive')).toBe(1);
        gate('d1').Resolve(Outcome.Complete());
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.CallsOf('Receive')[1]).toEqual({ Op: 'Receive', Max: 1, WaitSeconds: 0 });
        expect(runtime.InFlightCount).toBe(2);
        gate('d2').Resolve(Outcome.Complete());
        gate('d3').Resolve(Outcome.Complete());
        await runtime.Stop();
        expect(consumer.Count('Complete')).toBe(3);
    });

    it('doubles the idle delay up to IdlePollMaxMs', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        await vi.advanceTimersByTimeAsync(99);
        expect(consumer.Count('Receive')).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(2);
        await vi.advanceTimersByTimeAsync(199);
        expect(consumer.Count('Receive')).toBe(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(3);
        await vi.advanceTimersByTimeAsync(400);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(400);
        expect(consumer.Count('Receive')).toBe(5);
        await runtime.Stop();
    });

    it('wakes immediately on Kick', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete(), { Options: { IdlePollMinMs: 1000, IdlePollMaxMs: 1000 } });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        runtime.Kick();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(2);
        await runtime.Stop();
    });

    it('resets the idle delay after receiving work', async () => {
        const consumer = new ScriptedConsumer();
        const gate = gates(['d1']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(100);
        expect(consumer.Count('Receive')).toBe(2);
        consumer.Batches.push([MakeDelivery('d1')]);
        await vi.advanceTimersByTimeAsync(200);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(99);
        expect(consumer.Count('Receive')).toBe(4);
        await vi.advanceTimersByTimeAsync(1);
        expect(consumer.Count('Receive')).toBe(5);
        gate('d1').Resolve(Outcome.Complete());
        await runtime.Stop();
    });

    it('logs a failed receive and keeps polling', async () => {
        const consumer = new ScriptedConsumer();
        consumer.ReceiveError = new Error('network');
        const logger = new RecordingLogger();
        const runtime = createRuntime(consumer, async () => Outcome.Complete(), { Logger: logger });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(logger.Has('Error', 'Receive failed')).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(consumer.Count('Receive')).toBe(2);
        await runtime.Stop();
    });

    it('tracks executions by delivery and lease token, so a re-claimed delivery does not evict a running one', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1', { LeaseToken: 'first-claim' })]);
        const gate = CreateDeferred<WorkOutcome>();
        const runtime = createRuntime(consumer, async () => gate.Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.InFlightCount).toBe(1);
        // The first handler ignored its abort after a lease loss; the transport hands the same delivery out again.
        consumer.Batches.push([MakeDelivery('d1', { LeaseToken: 'second-claim' })]);
        runtime.Kick();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.InFlightCount).toBe(2);
        gate.Resolve(Outcome.Complete());
        await runtime.Stop();
        expect(runtime.InFlightCount).toBe(0);
    });

    it('is idempotent on Start', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, async () => Outcome.Complete());
        runtime.Start();
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        expect(consumer.Count('Receive')).toBe(1);
        expect(runtime.IsRunning).toBe(true);
        await runtime.Stop();
        expect(runtime.IsRunning).toBe(false);
    });
});

describe('ConsumerRuntime.Stop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for in-flight handlers to drain and stops receiving', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1')]);
        const gate = gates(['d1']);
        const runtime = createRuntime(consumer, async (message) => gate(message.MessageID).Promise);
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        let stopped = false;
        const stopping = runtime.Stop().then(() => {
            stopped = true;
        });
        await vi.advanceTimersByTimeAsync(500);
        expect(stopped).toBe(false);
        gate('d1').Resolve(Outcome.Complete());
        await stopping;
        expect(consumer.Count('Complete')).toBe(1);
        expect(consumer.Count('Release')).toBe(0);
        const receives = consumer.Count('Receive');
        await vi.advanceTimersByTimeAsync(5000);
        expect(consumer.Count('Receive')).toBe(receives);
    });

    it('aborts handlers after the drain period and releases unfinished deliveries', async () => {
        const consumer = new ScriptedConsumer();
        consumer.Batches.push([MakeDelivery('d1')]);
        const runtime = createRuntime(consumer, async (_message, context) => {
            await new Promise<void>((resolve) => context.Signal.addEventListener('abort', () => resolve()));
            throw new Error('interrupted');
        });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        const stopping = runtime.Stop();
        await vi.advanceTimersByTimeAsync(1000);
        await stopping;
        expect(consumer.CallsOf('Release').map((call) => call.DeliveryID)).toEqual(['d1']);
        expect(consumer.Count('Retry')).toBe(0);
    });

    it('releases deliveries returned by a receive that finished after Stop', async () => {
        const consumer = new ScriptedConsumer();
        const late = CreateDeferred<ReceivedDelivery[]>();
        consumer.ReceiveImpl = () => late.Promise;
        const handled: string[] = [];
        const runtime = createRuntime(consumer, async (message) => {
            handled.push(message.MessageID);
            return Outcome.Complete();
        });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        const stopping = runtime.Stop();
        late.Resolve([MakeDelivery('late')]);
        await stopping;
        expect(consumer.CallsOf('Release').map((call) => call.DeliveryID)).toEqual(['late']);
        expect(handled).toEqual([]);
    });

    it('does not hang when Receive ignores the abort signal', async () => {
        const consumer = new ScriptedConsumer();
        consumer.ReceiveImpl = () => new Promise<ReceivedDelivery[]>(() => undefined);
        const logger = new RecordingLogger();
        const runtime = createRuntime(consumer, async () => Outcome.Complete(), { Logger: logger });
        runtime.Start();
        await vi.advanceTimersByTimeAsync(0);
        let stopped = false;
        const stopping = runtime.Stop().then(() => {
            stopped = true;
        });
        await vi.advanceTimersByTimeAsync(999);
        expect(stopped).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await stopping;
        expect(logger.Has('Warn', 'Receive did not return')).toBe(true);
    });
});

describe('ConsumerRuntime.ProcessBatch', () => {
    const outcomeFor = (outcomes: Record<string, WorkOutcome>) => async (message: WorkMessage): Promise<WorkOutcome> =>
        outcomes[message.MessageID] ?? Outcome.Complete();

    it('processes every delivery and aligns results with the input', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, outcomeFor({ 'msg-d2': Outcome.DeadLetter('poison') }));
        const results = await runtime.ProcessBatch([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        expect(results).toEqual([
            { Kind: 'Settled', DeliveryID: 'd1', Status: 'Completed' },
            { Kind: 'Settled', DeliveryID: 'd2', Status: 'DeadLettered' },
            { Kind: 'Settled', DeliveryID: 'd3', Status: 'Completed' },
        ]);
    });

    it('releases the rest of a partition, unrun, after a delivery that did not complete', async () => {
        const consumer = new ScriptedConsumer();
        const handled: string[] = [];
        const runtime = createRuntime(
            consumer,
            async (message) => {
                handled.push(message.MessageID);
                return message.MessageID === 'msg-a1' ? Outcome.Retry('busy') : Outcome.Complete();
            },
            { Policy: { PartitionMode: 'Exclusive' } },
        );
        const results = await runtime.ProcessBatch([
            WithPartitionKey(MakeDelivery('a1'), 'A'),
            WithPartitionKey(MakeDelivery('a2'), 'A'),
            WithPartitionKey(MakeDelivery('b1'), 'B'),
        ]);
        expect(results).toEqual([
            { Kind: 'Settled', DeliveryID: 'a1', Status: 'Pending' },
            { Kind: 'Settled', DeliveryID: 'a2', Status: 'Pending' },
            { Kind: 'Settled', DeliveryID: 'b1', Status: 'Completed' },
        ]);
        expect(handled.sort()).toEqual(['msg-a1', 'msg-b1']);
        expect(consumer.CallsOf('Retry').map((call) => call.DeliveryID)).toEqual(['a1']);
        expect(consumer.CallsOf('Release').map((call) => call.DeliveryID)).toEqual(['a2']);
    });

    it('does not group by partition key when PartitionMode is None', async () => {
        const consumer = new ScriptedConsumer();
        const runtime = createRuntime(consumer, outcomeFor({ 'msg-a1': Outcome.Retry('busy') }));
        const results = await runtime.ProcessBatch([
            WithPartitionKey(MakeDelivery('a1'), 'A'),
            WithPartitionKey(MakeDelivery('a2'), 'A'),
        ]);
        expect(results[1]).toEqual({ Kind: 'Settled', DeliveryID: 'a2', Status: 'Completed' });
    });

    it('runs at most Concurrency lanes at once', async () => {
        const consumer = new ScriptedConsumer();
        let active = 0;
        let peak = 0;
        const runtime = createRuntime(
            consumer,
            async () => {
                active += 1;
                peak = Math.max(peak, active);
                await Promise.resolve();
                await Promise.resolve();
                active -= 1;
                return Outcome.Complete();
            },
            { Options: { Concurrency: 1 } },
        );
        await runtime.ProcessBatch([MakeDelivery('d1'), MakeDelivery('d2'), MakeDelivery('d3')]);
        expect(peak).toBe(1);
        expect(consumer.Count('Complete')).toBe(3);
    });
});
