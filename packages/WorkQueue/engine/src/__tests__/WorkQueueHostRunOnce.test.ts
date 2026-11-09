import { describe, it, expect, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ITransportConsumer } from '@memberjunction/work-queue-core';
import { WorkQueueHost } from '../host/WorkQueueHost';
import type { WorkQueueHostConfig, WorkQueueHostDependencies } from '../host/WorkQueueHost';
import {
    BuildHostScenario, FakeRuntime, MakeReceivedDelivery, ScriptedConsumer, SilentLogger, TEST_PROVIDER, TEST_USER,
    TestHandlerResolver,
} from './runtimeFakes';
import type { FakeHostEngine } from './runtimeFakes';
import { RecordingExecutor } from './fakes';

const SIGNAL = new AbortController().signal;
const hosts: WorkQueueHost[] = [];

interface RunOnceHarness {
    Host: WorkQueueHost;
    Runtimes: FakeRuntime[];
    Consumers: ITransportConsumer[];
}

function hostConfig(config: Partial<WorkQueueHostConfig>): WorkQueueHostConfig {
    return {
        InstanceID: 'job-host', Subscriptions: [{ Name: 'integration.apply', Concurrency: 2 }], IdlePollMinMs: 10,
        IdlePollMaxMs: 20, ShutdownDrainMs: 200, SweeperIntervalMs: 0, ReconcileIntervalMs: 0, ...config,
    };
}

/** One runnable subscription ('integration.apply' on the Database driver) whose consumer the test drives. */
function makeRunOnceHost(engine: FakeHostEngine, config: Partial<WorkQueueHostConfig> = {}, dependencies: Partial<WorkQueueHostDependencies> = {}): RunOnceHarness {
    const runtimes: FakeRuntime[] = [];
    const consumers: ITransportConsumer[] = [];
    const host = new WorkQueueHost(hostConfig(config), engine, TEST_USER, new RecordingExecutor(), new SilentLogger(), {
        ProviderSource: { CreateProvider: async (): Promise<IMetadataProvider> => TEST_PROVIDER },
        ResolveHandler: TestHandlerResolver,
        RunOnceTickMs: 5,
        CreateRuntime: args => {
            consumers.push(args.Consumer);
            const runtime = new FakeRuntime(args);
            runtimes.push(runtime);
            return runtime;
        },
        ...dependencies,
    });
    hosts.push(host);
    return { Host: host, Runtimes: runtimes, Consumers: consumers };
}

/** The same host over a REAL ConsumerRuntime (no CreateRuntime seam): the path `mj queue work --once` runs. */
function makeRealRuntimeHost(engine: FakeHostEngine, concurrency: number): WorkQueueHost {
    const host = new WorkQueueHost(
        hostConfig({ Subscriptions: [{ Name: 'integration.apply', Concurrency: concurrency }] }),
        engine, TEST_USER, new RecordingExecutor(), new SilentLogger(),
        { ProviderSource: { CreateProvider: async (): Promise<IMetadataProvider> => TEST_PROVIDER }, ResolveHandler: TestHandlerResolver, RunOnceTickMs: 1 },
    );
    hosts.push(host);
    return host;
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${label}`);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

afterEach(async () => {
    for (const host of hosts.splice(0)) {
        await host.Shutdown();
    }
});

describe('WorkQueueHost.RunOnce over a real ConsumerRuntime', () => {
    it('processes the one delivery of the default job (--max 1 --concurrency 1) even though the claim is slower than a tick', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 30;                                   // the claim is real I/O; the exit loop ticks every 1 ms
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const host = makeRealRuntimeHost(scenario.Engine, 1);

        expect(await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000 })).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
        expect(scripted.Completed).toEqual(['d1']);
        expect(scripted.Released).toEqual([]);                          // the delivery ran; it was not handed back
        expect(scripted.Closed).toBe(1);
    });

    it('exits Idle on an empty queue only after the transport has answered', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 40;                                   // longer than IdleExitMs: idle must wait for the answer
        scenario.DatabaseDriver.NextConsumer = scripted;
        const host = makeRealRuntimeHost(scenario.Engine, 1);

        expect(await host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 10 })).toEqual({ Processed: 0, Reason: 'Idle' });
        expect(scripted.OfferedMax.length).toBeGreaterThanOrEqual(1);
    });
});

describe('WorkQueueHost.RunOnce budget', () => {
    it('never claims more than MaxDeliveries and lets unused reservations lapse', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')], [MakeReceivedDelivery('d2'), MakeReceivedDelivery('d3')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 3, IdleExitMs: 50 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        const consumer = Consumers[0]!;

        expect((await consumer.Receive(10, 0, SIGNAL)).map(d => d.DeliveryID)).toEqual(['d1']);
        expect(scripted.OfferedMax).toEqual([3]);                       // capped to the budget, not the caller's 10
        expect((await consumer.Receive(10, 0, SIGNAL)).map(d => d.DeliveryID)).toEqual(['d2', 'd3']);
        expect(scripted.OfferedMax).toEqual([3, 2]);                    // the unused reservation lapsed
        expect(await consumer.Receive(10, 0, SIGNAL)).toEqual([]);      // nothing left: the transport is not touched again
        expect(scripted.OfferedMax).toEqual([3, 2]);

        expect(await run).toEqual({ Processed: 3, Reason: 'MaxDeliveries' });
    });

    it('does not exit MaxDeliveries while a reservation is still pending', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.ReceiveDelayMs = 60;
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 5000 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        let settled = false;
        void run.then(() => { settled = true; });
        const receiving = Consumers[0]!.Receive(1, 0, SIGNAL);          // reserved, not yet received
        await new Promise(resolve => setTimeout(resolve, 25));          // several exit-loop ticks pass
        expect(settled).toBe(false);
        expect((await receiving).map(d => d.DeliveryID)).toEqual(['d1']);
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
    });

    it('waits for in-flight work and drains the runtime before resolving', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers, Runtimes } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ MaxDeliveries: 1, IdleExitMs: 50 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        Runtimes[0]!.InFlightCount = 1;
        await Consumers[0]!.Receive(5, 0, SIGNAL);

        let settled = false;
        void run.then(() => { settled = true; });
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(settled).toBe(false);                                     // still running the handler

        Runtimes[0]!.InFlightCount = 0;
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDeliveries' });
        expect(Runtimes[0]!.Stopped).toBe(1);                            // drained through Shutdown()
        expect(Host.IsStarted).toBe(false);
    });
});

describe('WorkQueueHost.RunOnce exits', () => {
    it('does not exit Idle before any receive has completed', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);                        // FakeRuntime never calls Receive
        expect(await Host.RunOnce({ IdleExitMs: 10, MaxDurationMs: 80 })).toEqual({ Processed: 0, Reason: 'MaxDuration' });
    });

    it('exits MaxDuration while work is still arriving', async () => {
        const scenario = BuildHostScenario();
        const scripted = new ScriptedConsumer();
        scripted.Batches.push([MakeReceivedDelivery('d1')]);
        scenario.DatabaseDriver.NextConsumer = scripted;
        const { Host, Consumers } = makeRunOnceHost(scenario.Engine);

        const run = Host.RunOnce({ IdleExitMs: 10000, MaxDurationMs: 60 });
        await waitFor(() => Consumers.length === 1, 'the consumer to be wrapped');
        await Consumers[0]!.Receive(5, 0, SIGNAL);
        expect(await run).toEqual({ Processed: 1, Reason: 'MaxDuration' });
    });

    it('exits Shutdown when another caller stops the host, and resolves only after that drain', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        const run = Host.RunOnce({ IdleExitMs: 10000 });
        await waitFor(() => Host.IsStarted, 'the host to start');
        await Host.Shutdown();
        expect(await run).toEqual({ Processed: 0, Reason: 'Shutdown' });
        expect(Host.IsStarted).toBe(false);
    });

    it('returns at once when no requested subscription could run, leaving the reason in GetHealth', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine, { Subscriptions: [{ Name: 'integration.audit', Concurrency: 1 }] });
        expect(await Host.RunOnce({ IdleExitMs: 60000 })).toEqual({ Processed: 0, Reason: 'Idle' });
        expect(Host.GetHealth().Subscriptions).toEqual([
            { Name: 'integration.audit', State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey 'handler.missing'", InFlight: 0 },
        ]);
    });

    it('refuses a started host and a budget below one', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeRunOnceHost(Engine);
        await expect(Host.RunOnce({ MaxDeliveries: 0 })).rejects.toThrow('MaxDeliveries must be an integer >= 1');
        await Host.Start();
        await expect(Host.RunOnce({})).rejects.toThrow('RunOnce cannot be called on a started host');
    });
});
