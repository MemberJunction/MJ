import type { UserInfo } from '@memberjunction/core';
import { ShutdownRegistry } from '@memberjunction/global';
import type { IShutdownable } from '@memberjunction/global';
import { ConsumerRuntime } from '@memberjunction/work-queue-core';
import type { ConsumerRuntimeOptions, ITransportConsumer, SubscriptionPolicy, WorkHandler, WorkLogger } from '@memberjunction/work-queue-core';
import { BoundWorkHandler } from '../handlers/BoundWorkHandler';
import type { WorkHandlerResolver, WorkQueueProviderSource } from '../handlers/BoundWorkHandler';
import { IsWorkHandlerRegistered, ResolveWorkHandler } from '../handlers/ResolveWorkHandler';
import type { WorkHandlerProbe } from '../handlers/ResolveWorkHandler';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import { PlanHostedSubscriptions } from './HostedSubscriptionPlanner';
import type { HostedSubscriptionPlan, HostedSubscriptionState, RunnableSubscriptionPlan, WorkQueueHostEngine } from './HostedSubscriptionPlanner';
import { WorkQueueSweeper } from './WorkQueueSweeper';

export interface WorkQueueHostConfig {
    InstanceID: string;
    /** Name '*' = every MJWorker subscription. */
    Subscriptions: { Name: string; Concurrency: number }[];
    IdlePollMinMs: number;
    IdlePollMaxMs: number;
    ShutdownDrainMs: number;
    /** 0 disables the sweeper on this instance. */
    SweeperIntervalMs: number;
    /** 0 disables periodic re-planning (Reconcile can still be called directly). */
    ReconcileIntervalMs: number;
}

export interface HostRuntime {
    Start(): void;
    Stop(): Promise<void>;
    Kick(): void;
    readonly InFlightCount: number;
}

export interface HostRuntimeArgs {
    Consumer: ITransportConsumer;
    HandlerFactory: () => WorkHandler;
    Policy: SubscriptionPolicy;
    Options: ConsumerRuntimeOptions;
    Log: WorkLogger;
}

export interface HostSweeper {
    RunOnce(): Promise<Record<string, number>>;
}

export interface WorkQueueHostDependencies {
    ProviderSource: WorkQueueProviderSource;
    CreateRuntime?: (args: HostRuntimeArgs) => HostRuntime;
    CreateSweeper?: () => HostSweeper;
    ResolveHandler?: WorkHandlerResolver;
}

export interface WorkQueueHostHealth {
    InstanceID: string;
    Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[];
}

interface HostedState {
    Name: string;
    State: HostedSubscriptionState;
    Reason: string | null;
}

interface RunningSubscription {
    Plan: RunnableSubscriptionPlan;
    Runtime: HostRuntime;
    Consumer: ITransportConsumer;
}

type IntervalHandle = ReturnType<typeof setInterval>;

/** The Reason a subscription that WAS Running reports after Shutdown(); lets a caller tell "ran" from "never could". */
export const HOST_SHUT_DOWN_REASON = 'Host is shut down';

/**
 * Runs this instance's share of work-queue subscriptions (03 §11). Every claim is atomic against shared state, so any
 * number of hosts may run the same subscription; each host only decides what IT runs. Start, Reconcile and Shutdown
 * are serialized; Shutdown() is one shared promise that resolves only when the drain has finished. Consumers are
 * opened by the host and closed by the host — ConsumerRuntime.Stop() does not close its consumer.
 */
export class WorkQueueHost implements IShutdownable {
    private static active: WorkQueueHost | null = null;

    private readonly running = new Map<string, RunningSubscription>();
    private readonly createRuntime: (args: HostRuntimeArgs) => HostRuntime;
    private readonly resolveHandler: WorkHandlerResolver;
    private readonly handlerRegistered: WorkHandlerProbe;
    private states: HostedState[] = [];
    private started = false;
    private shutdownPromise: Promise<void> | null = null;
    private reconciling: Promise<void> | null = null;
    private sweeping: Promise<Record<string, number>> | null = null;
    private reconcileTimer: IntervalHandle | null = null;
    private sweeperTimer: IntervalHandle | null = null;
    private sweeper: HostSweeper | null = null;
    private unsubscribePublished: (() => void) | null = null;

    constructor(
        private readonly config: WorkQueueHostConfig,
        private readonly engine: WorkQueueHostEngine,
        private readonly contextUser: UserInfo,
        private readonly executor: WorkQueueExecutorSource,
        private readonly log: WorkLogger,
        private readonly dependencies: WorkQueueHostDependencies,
    ) {
        this.createRuntime = dependencies.CreateRuntime
            ?? (args => new ConsumerRuntime(args.Consumer, args.HandlerFactory, args.Policy, args.Options, args.Log));
        this.resolveHandler = dependencies.ResolveHandler ?? ResolveWorkHandler;
        // Planning runs on every reconcile, so it must not construct handlers. With the default resolver the
        // ClassFactory answers directly; an injected resolver (tests) is probed once per key and remembered.
        this.handlerRegistered = dependencies.ResolveHandler ? MemoizedProbe(dependencies.ResolveHandler) : IsWorkHandlerRegistered;
    }

    /** The most recently started host in this process, for health reporting. */
    public static get Active(): WorkQueueHost | null {
        return WorkQueueHost.active;
    }

    public get ShutdownName(): string {
        return `WorkQueueHost:${this.config.InstanceID}`;
    }

    public get IsStarted(): boolean {
        return this.started;
    }

    public async Start(): Promise<void> {
        if (this.started) {
            return;
        }
        this.started = true;
        this.shutdownPromise = null;
        ShutdownRegistry.Instance.Register(this);
        WorkQueueHost.active = this;
        await this.Reconcile();
        if (this.shutdownPromise) {
            return;   // Shutdown() began while we were reconciling: arm nothing on a host that is going away
        }
        this.unsubscribePublished = this.engine.OnPublished(topicName => this.kickTopic(topicName));
        this.startTimers();
        const runningCount = this.states.filter(s => s.State === 'Running').length;
        this.log.Info(`Host ${this.config.InstanceID} started`, { Running: runningCount, NotRunning: this.states.length - runningCount });
    }

    /** Re-plans and converges runtimes; concurrent calls share one pass. A planning failure keeps the current runtimes. */
    public Reconcile(): Promise<void> {
        if (!this.started || this.shutdownPromise) {
            return Promise.resolve();
        }
        if (!this.reconciling) {
            this.reconciling = this.reconcileNow().finally(() => {
                this.reconciling = null;
            });
        }
        return this.reconciling;
    }

    /** Never throws: a failed pass is logged and reported as {}. */
    public RunSweeperOnce(): Promise<Record<string, number>> {
        if (!this.sweeping) {
            this.sweeping = this.sweepNow().finally(() => {
                this.sweeping = null;
            });
        }
        return this.sweeping;
    }

    public Kick(subscriptionName: string): void {
        this.running.get(Key(subscriptionName))?.Runtime.Kick();
    }

    public GetHealth(): WorkQueueHostHealth {
        return {
            InstanceID: this.config.InstanceID,
            Subscriptions: this.states.map(s => ({ ...s, InFlight: this.running.get(Key(s.Name))?.Runtime.InFlightCount ?? 0 })),
        };
    }

    /** Idempotent: concurrent callers share one promise, which resolves only when the drain has finished (03 §11). */
    public Shutdown(): Promise<void> {
        if (!this.started) {
            return this.shutdownPromise ?? Promise.resolve();
        }
        this.shutdownPromise ??= this.shutdownNow();
        return this.shutdownPromise;
    }

    private async shutdownNow(): Promise<void> {
        this.stopTimers();
        this.unsubscribePublished?.();
        this.unsubscribePublished = null;
        await Promise.allSettled([this.reconciling ?? Promise.resolve(), this.sweeping ?? Promise.resolve()]);
        const entries = [...this.running.values()];
        this.running.clear();
        await Promise.all(entries.map(entry => this.stopEntry(entry)));
        this.states = this.states.map(s => (s.State === 'Running' ? { Name: s.Name, State: 'Paused', Reason: HOST_SHUT_DOWN_REASON } : s));
        this.started = false;
        if (WorkQueueHost.active === this) {
            WorkQueueHost.active = null;
        }
        ShutdownRegistry.Instance.Unregister(this);
    }

    private async sweepNow(): Promise<Record<string, number>> {
        try {
            this.sweeper ??= this.newSweeper();
            return await this.sweeper.RunOnce();
        } catch (error) {
            this.log.Error('Sweeper pass failed', AsError(error));
            return {};
        }
    }

    private async reconcileNow(): Promise<void> {
        let plans: HostedSubscriptionPlan[];
        try {
            plans = await PlanHostedSubscriptions(this.config.Subscriptions, this.engine, this.handlerRegistered);
        } catch (error) {
            this.log.Error('Planning hosted subscriptions failed; keeping current runtimes', AsError(error));
            return;
        }
        await this.stopObsolete(plans);
        const next: HostedState[] = [];
        for (const plan of plans) {
            next.push(plan.Kind === 'Runnable' ? await this.ensureRunning(plan) : { Name: plan.Name, State: plan.State, Reason: plan.Reason });
        }
        this.states = next;
    }

    private async stopObsolete(plans: HostedSubscriptionPlan[]): Promise<void> {
        const desired = new Map<string, RunnableSubscriptionPlan>();
        for (const plan of plans) {
            if (plan.Kind === 'Runnable') {
                desired.set(Key(plan.Name), plan);
            }
        }
        const stopping: Promise<void>[] = [];
        for (const [name, entry] of this.running) {
            if (desired.get(name)?.Signature !== entry.Plan.Signature) {
                this.running.delete(name);
                stopping.push(this.stopEntry(entry));
            }
        }
        await Promise.all(stopping);
    }

    private async ensureRunning(plan: RunnableSubscriptionPlan): Promise<HostedState> {
        if (this.running.has(Key(plan.Name))) {
            return { Name: plan.Name, State: 'Running', Reason: null };
        }
        try {
            this.running.set(Key(plan.Name), await this.startEntry(plan));
            return { Name: plan.Name, State: 'Running', Reason: null };
        } catch (error) {
            this.log.Error(`Could not start subscription '${plan.Name}'`, AsError(error));
            return { Name: plan.Name, State: 'Error', Reason: AsError(error).message };
        }
    }

    private async startEntry(plan: RunnableSubscriptionPlan): Promise<RunningSubscription> {
        const consumer = this.openConsumer(plan);
        try {
            const runtime = this.createRuntime({
                Consumer: consumer,
                HandlerFactory: () => new BoundWorkHandler(plan.HandlerKey, this.contextUser, this.dependencies.ProviderSource, this.resolveHandler),
                Policy: plan.Binding.Policy,
                Options: {
                    Concurrency: plan.Concurrency, ReceiveBatchSize: plan.Concurrency, IdlePollMinMs: this.config.IdlePollMinMs,
                    IdlePollMaxMs: this.config.IdlePollMaxMs, ShutdownDrainMs: this.config.ShutdownDrainMs,
                },
                Log: this.log,
            });
            runtime.Start();
            return { Plan: plan, Runtime: runtime, Consumer: consumer };
        } catch (error) {
            await this.closeConsumer(consumer, plan.Name);   // it owns an independent executor (03 §11) — never leak it
            throw error;
        }
    }

    /** Task 3b wraps this consumer in a delivery budget for RunOnce. */
    protected openConsumer(plan: RunnableSubscriptionPlan): ITransportConsumer {
        return plan.ConsumerDriver.OpenConsumer(plan.Binding);
    }

    private async stopEntry(entry: RunningSubscription): Promise<void> {
        try {
            await entry.Runtime.Stop();
        } catch (error) {
            this.log.Error(`Stopping subscription '${entry.Plan.Name}' failed`, AsError(error));
        }
        await this.closeConsumer(entry.Consumer, entry.Plan.Name);
    }

    private async closeConsumer(consumer: ITransportConsumer, name: string): Promise<void> {
        try {
            await consumer.Close();
        } catch (error) {
            this.log.Error(`Closing the consumer of subscription '${name}' failed`, AsError(error));
        }
    }

    private kickTopic(topicName: string): void {
        for (const entry of this.running.values()) {
            if (Key(entry.Plan.Topic.Name) === Key(topicName)) {
                entry.Runtime.Kick();
            }
        }
    }

    private startTimers(): void {
        if (this.config.ReconcileIntervalMs > 0) {
            this.reconcileTimer = setInterval(() => void this.Reconcile(), this.config.ReconcileIntervalMs);
            this.reconcileTimer.unref();
        }
        if (this.config.SweeperIntervalMs > 0) {
            this.sweeperTimer = setInterval(() => void this.RunSweeperOnce(), this.config.SweeperIntervalMs);
            this.sweeperTimer.unref();
        }
    }

    private stopTimers(): void {
        for (const timer of [this.reconcileTimer, this.sweeperTimer]) {
            if (timer) {
                clearInterval(timer);
            }
        }
        this.reconcileTimer = null;
        this.sweeperTimer = null;
    }

    private newSweeper(): HostSweeper {
        // Lease-expiry dead letters found by the sweeper are raised through engine.NotifyDeadLettered (03 §11).
        return this.dependencies.CreateSweeper?.() ?? new WorkQueueSweeper(this.executor, this.engine, this.contextUser, this.log);
    }
}

function MemoizedProbe(resolve: WorkHandlerResolver): WorkHandlerProbe {
    const known = new Map<string, boolean>();
    return handlerKey => {
        const cached = known.get(handlerKey);
        if (cached !== undefined) {
            return cached;
        }
        const registered = resolve(handlerKey) !== null;
        known.set(handlerKey, registered);
        return registered;
    };
}

function Key(value: string): string {
    return value.trim().toLowerCase();
}

function AsError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
