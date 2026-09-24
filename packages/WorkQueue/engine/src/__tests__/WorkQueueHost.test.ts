import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { ShutdownRegistry } from '@memberjunction/global';
import { WorkQueueHost } from '../host/WorkQueueHost';
import type { HostSweeper, WorkQueueHostConfig, WorkQueueHostDependencies } from '../host/WorkQueueHost';
import {
    BuildHostScenario, FakeRuntime, MakeContext, MakeMessage, RecordingWorkHandler, SilentLogger,
    TEST_PROVIDER, TEST_USER, TestHandlerResolver,
} from './runtimeFakes';
import type { FakeHostEngine } from './runtimeFakes';
import { RecordingExecutor } from './fakes';

interface HostHarness {
    Host: WorkQueueHost;
    Runtimes: FakeRuntime[];
    ProviderCalls: () => number;
}

const hosts: WorkQueueHost[] = [];

function makeHost(engine: FakeHostEngine, config: Partial<WorkQueueHostConfig> = {}, dependencies: Partial<WorkQueueHostDependencies> = {}): HostHarness {
    const runtimes: FakeRuntime[] = [];
    let providerCalls = 0;
    const host = new WorkQueueHost(
        {
            InstanceID: 'test-host', Subscriptions: [{ Name: '*', Concurrency: 2 }], IdlePollMinMs: 100, IdlePollMaxMs: 1000,
            ShutdownDrainMs: 500, SweeperIntervalMs: 0, ReconcileIntervalMs: 0, ...config,
        },
        engine, TEST_USER, new RecordingExecutor(), new SilentLogger(),
        {
            ProviderSource: {
                CreateProvider: async (): Promise<IMetadataProvider> => {
                    providerCalls++;
                    return TEST_PROVIDER;
                },
            },
            CreateRuntime: args => {
                const runtime = new FakeRuntime(args);
                runtimes.push(runtime);
                return runtime;
            },
            ResolveHandler: TestHandlerResolver,
            ...dependencies,
        },
    );
    hosts.push(host);
    return { Host: host, Runtimes: runtimes, ProviderCalls: () => providerCalls };
}

function runtimeFor(runtimes: FakeRuntime[], name: string): FakeRuntime {
    const matches = runtimes.filter(r => r.SubscriptionName === name);
    const runtime = matches[matches.length - 1];
    if (!runtime) {
        throw new Error(`no runtime for ${name}`);
    }
    return runtime;
}

function states(host: WorkQueueHost): Record<string, string> {
    return Object.fromEntries(host.GetHealth().Subscriptions.map(s => [s.Name, s.State]));
}

afterEach(async () => {
    for (const host of hosts.splice(0)) {
        await host.Shutdown();
    }
    vi.useRealTimers();
});

describe('WorkQueueHost start', () => {
    it('starts a runtime per runnable subscription and reports every state', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        expect(states(Host)).toEqual({
            'email.ordered': 'Unsupported', 'email.subscriber-update': 'Running', 'integration.apply': 'Running',
            'integration.audit': 'HandlerNotRegistered', 'integration.paused': 'Paused',
        });
        expect(Runtimes.map(r => [r.SubscriptionName, r.Started]).sort()).toEqual([
            ['email.subscriber-update', 1], ['integration.apply', 1],
        ]);
        expect(Host.IsStarted).toBe(true);
        expect(WorkQueueHost.Active).toBe(Host);
        expect(ShutdownRegistry.Instance.List()).toContain(Host);
    });

    it("opens each subscription on its topic's driver and passes the runtime options", async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        expect(scenario.DatabaseDriver.OpenedBindings.map(b => b.Policy.SubscriptionName)).toEqual(['integration.apply']);
        expect(scenario.AwsDriver.OpenedBindings.map(b => b.Policy.SubscriptionName)).toEqual(['email.subscriber-update']);
        expect(runtimeFor(Runtimes, 'integration.apply').Args.Options).toEqual({
            Concurrency: 2, ReceiveBatchSize: 2, IdlePollMinMs: 100, IdlePollMaxMs: 1000, ShutdownDrainMs: 500,
        });
    });

    it('binds each delivery to the context user and a freshly sourced provider, constructing handlers only per delivery', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes, ProviderCalls } = makeHost(Engine);
        await Host.Start();
        await Host.Reconcile();
        const constructedByPlanning = RecordingWorkHandler.Constructed;
        const handler = runtimeFor(Runtimes, 'integration.apply').Args.HandlerFactory();
        expect(await handler.Handle(MakeMessage(), MakeContext())).toEqual({ Kind: 'Complete' });
        expect(RecordingWorkHandler.LastBoundUserID).toBe(TEST_USER.ID);
        expect(ProviderCalls()).toBe(1);
        expect(RecordingWorkHandler.Constructed).toBe(constructedByPlanning + 1);
    });

    it('reports Error for a subscription whose consumer cannot be opened and still starts the others', async () => {
        const scenario = BuildHostScenario();
        scenario.AwsDriver.OpenError = new Error('queue url missing');
        const { Host } = makeHost(scenario.Engine);
        await Host.Start();
        const health = Host.GetHealth().Subscriptions.find(s => s.Name === 'email.subscriber-update');
        expect(health).toMatchObject({ State: 'Error', Reason: 'queue url missing' });
        expect(states(Host)['integration.apply']).toBe('Running');
    });

    it('closes the opened consumer when the runtime cannot be created', async () => {
        const scenario = BuildHostScenario();
        const { Host } = makeHost(scenario.Engine, { Subscriptions: [{ Name: 'integration.apply', Concurrency: 1 }] }, {
            CreateRuntime: () => {
                throw new Error('runtime refused');
            },
        });
        await Host.Start();
        expect(states(Host)['integration.apply']).toBe('Error');
        expect(scenario.DatabaseDriver.OpenedConsumers.map(c => c.Closed)).toEqual([1]);
    });
});

describe('WorkQueueHost kicks', () => {
    it('kicks a subscription by name and every runtime of a published topic', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        Host.Kick('EMAIL.SUBSCRIBER-UPDATE');
        Engine.EmitPublished('Email.Events');
        expect(runtimeFor(Runtimes, 'email.subscriber-update').Kicks).toBe(2);
        expect(runtimeFor(Runtimes, 'integration.apply').Kicks).toBe(0);
    });
});

describe('WorkQueueHost reconcile', () => {
    it('stops paused subscriptions, closes their consumers and starts newly active ones', async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        Object.assign(scenario.Engine.Subscription('integration.apply'), { Status: 'Paused' });
        Object.assign(scenario.Engine.Subscription('integration.paused'), { Status: 'Active' });
        await Host.Reconcile();
        expect(runtimeFor(Runtimes, 'integration.apply').Stopped).toBe(1);
        expect(scenario.DatabaseDriver.OpenedConsumers[0].Closed).toBe(1);
        expect(runtimeFor(Runtimes, 'integration.paused').Started).toBe(1);
        expect(states(Host)).toMatchObject({ 'integration.apply': 'Paused', 'integration.paused': 'Running' });
    });

    it('restarts a runtime whose binding changed and leaves unchanged runtimes alone', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine);
        await Host.Start();
        const original = runtimeFor(Runtimes, 'email.subscriber-update');
        const untouched = runtimeFor(Runtimes, 'integration.apply');
        Object.assign(Engine.Subscription('email.subscriber-update'), { LeaseSeconds: 120 });
        await Host.Reconcile();
        const replacement = runtimeFor(Runtimes, 'email.subscriber-update');
        expect(original.Stopped).toBe(1);
        expect(replacement).not.toBe(original);
        expect(replacement.Started).toBe(1);
        expect(untouched.Stopped).toBe(0);
        expect(Runtimes).toHaveLength(3);
    });

    it('shares one planning pass between concurrent reconcile calls', async () => {
        const { Engine } = BuildHostScenario();
        const { Host } = makeHost(Engine);
        await Host.Start();
        const beforeShared = Engine.GetDriverCalls;
        await Promise.all([Host.Reconcile(), Host.Reconcile()]);
        const shared = Engine.GetDriverCalls - beforeShared;
        const beforeSingle = Engine.GetDriverCalls;
        await Host.Reconcile();
        expect(shared).toBe(Engine.GetDriverCalls - beforeSingle);
    });
});

describe('WorkQueueHost sweeper and shutdown', () => {
    it('runs the sweeper on its interval and survives a failing pass', async () => {
        vi.useFakeTimers();
        const { Engine } = BuildHostScenario();
        const runOnce = vi.fn<HostSweeper['RunOnce']>()
            .mockResolvedValueOnce({ ExpireLeases: 1 })
            .mockRejectedValue(new Error('deadlock victim'));
        const { Host } = makeHost(Engine, { SweeperIntervalMs: 1000 }, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        await Host.Start();
        await vi.advanceTimersByTimeAsync(1000);
        expect(runOnce).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(runOnce).toHaveBeenCalledTimes(2);
        await expect(Host.RunSweeperOnce()).resolves.toEqual({});
    });

    it('shuts down once, stops every runtime, closes every consumer, clears Active and unregisters', async () => {
        const scenario = BuildHostScenario();
        const { Host, Runtimes } = makeHost(scenario.Engine);
        await Host.Start();
        await Host.Shutdown();
        await Host.Shutdown();
        expect(Runtimes.every(r => r.Stopped === 1)).toBe(true);
        expect([...scenario.DatabaseDriver.OpenedConsumers, ...scenario.AwsDriver.OpenedConsumers].every(c => c.Closed === 1)).toBe(true);
        expect(WorkQueueHost.Active).toBeNull();
        expect(ShutdownRegistry.Instance.List()).not.toContain(Host);
        expect(scenario.Engine.ListenerCount).toBe(0);
        expect(Host.IsStarted).toBe(false);
        expect(Host.GetHealth().Subscriptions.find(s => s.Name === 'integration.apply')).toMatchObject({ State: 'Paused', Reason: 'Host is shut down' });
    });

    it('gives a caller that arrives mid-shutdown the same promise, which resolves only after the drain', async () => {
        const { Engine } = BuildHostScenario();
        const { Host, Runtimes } = makeHost(Engine, { Subscriptions: [{ Name: 'integration.apply', Concurrency: 1 }] });
        await Host.Start();
        let openGate: () => void = () => undefined;
        runtimeFor(Runtimes, 'integration.apply').StopGate = new Promise<void>(resolve => { openGate = resolve; });
        const first = Host.Shutdown();
        let secondResolved = false;
        const second = Host.Shutdown().then(() => { secondResolved = true; });
        await Promise.resolve();
        await Promise.resolve();
        expect(secondResolved).toBe(false);
        openGate();
        await Promise.all([first, second]);
        expect(secondResolved).toBe(true);
    });

    it('waits for an in-flight sweeper pass before resolving', async () => {
        const { Engine } = BuildHostScenario();
        let finishSweep: () => void = () => undefined;
        let sweepDone = false;
        const runOnce = (): Promise<Record<string, number>> => new Promise(resolve => {
            finishSweep = () => { sweepDone = true; resolve({}); };
        });
        const { Host } = makeHost(Engine, {}, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        await Host.Start();
        const pass = Host.RunSweeperOnce();
        const shutdown = Host.Shutdown().then(() => sweepDone);
        finishSweep();
        expect(await shutdown).toBe(true);
        await pass;
    });

    it('arms no timers and no publish listener when Shutdown arrives while Start is still reconciling', async () => {
        vi.useFakeTimers();
        const { Engine } = BuildHostScenario();
        const runOnce = vi.fn<HostSweeper['RunOnce']>().mockResolvedValue({});
        const { Host } = makeHost(Engine, { SweeperIntervalMs: 1000, ReconcileIntervalMs: 1000 }, { CreateSweeper: () => ({ RunOnce: runOnce }) });
        const starting = Host.Start();
        const stopping = Host.Shutdown();
        await Promise.all([starting, stopping]);
        await vi.advanceTimersByTimeAsync(5000);
        expect(runOnce).not.toHaveBeenCalled();
        expect(Engine.ListenerCount).toBe(0);
        expect(Host.IsStarted).toBe(false);
    });
});
