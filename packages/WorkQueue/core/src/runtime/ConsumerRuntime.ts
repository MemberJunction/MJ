import type { WorkJson } from '../envelope';
import type { WorkHandler, WorkLogger } from '../handler';
import type { SubscriptionPolicy } from '../policy';
import type { ITransportConsumer, ReceivedDelivery, SettleResult } from '../transport';
import { DeliveryExecution } from './DeliveryExecution';
import { ErrorMessageOf } from './outcomes';
import type { ConsumerRuntimeOptions } from './types';

interface RunningExecution<TPayload extends WorkJson> {
    Execution: DeliveryExecution<TPayload>;
    Done: Promise<SettleResult>;
}

/** Transport-agnostic loop: receive → run handler with lease management → settle. */
export class ConsumerRuntime<TPayload extends WorkJson = WorkJson> {
    private running = false;
    private loopPromise: Promise<void> | null = null;
    /** Keyed by DeliveryExecution.ExecutionKey (DeliveryID + LeaseToken), never by DeliveryID alone. */
    private readonly executions = new Map<string, RunningExecution<TPayload>>();
    private receiveController = new AbortController();
    private wakeResolver: (() => void) | null = null;
    private wakeTimer: ReturnType<typeof setTimeout> | null = null;
    private kickPending = false;

    constructor(
        private readonly consumer: ITransportConsumer<TPayload>,
        private readonly handlerFactory: () => WorkHandler<TPayload>,
        private readonly policy: SubscriptionPolicy,
        private readonly options: ConsumerRuntimeOptions,
        private readonly log: WorkLogger,
        private readonly now: () => number = () => Date.now(),
    ) {}

    public get InFlightCount(): number {
        return this.executions.size;
    }

    public get IsRunning(): boolean {
        return this.running;
    }

    public Start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        this.receiveController = new AbortController();
        this.loopPromise = this.loop().catch((error: unknown) => {
            // The loop catches everything it awaits; this is the backstop for a throwing logger or similar.
            this.running = false;
            this.log.Error('Consumer loop stopped unexpectedly', error instanceof Error ? error : undefined, {
                Subscription: this.policy.SubscriptionName,
                Error: ErrorMessageOf(error),
            });
        });
    }

    /** Wake an idle loop immediately (used after in-process publish). */
    public Kick(): void {
        this.kickPending = true;
        this.wake();
    }

    /** Stops receiving, waits up to ShutdownDrainMs, then aborts remaining handlers and releases their deliveries. */
    public async Stop(): Promise<void> {
        this.running = false;
        this.receiveController.abort();
        this.wake();
        if (this.loopPromise !== null) {
            const loopEnded = await this.within(this.loopPromise.then(() => true), this.options.ShutdownDrainMs);
            if (!loopEnded) {
                this.log.Warn('Receive did not return after the abort signal; shutting down without it', {
                    Subscription: this.policy.SubscriptionName,
                });
            }
            this.loopPromise = null;
        }
        if (await this.waitForExecutions(this.options.ShutdownDrainMs)) {
            return;
        }
        for (const running of this.executions.values()) {
            running.Execution.Abort('Shutdown');
        }
        if (!(await this.waitForExecutions(this.options.ShutdownDrainMs))) {
            this.log.Warn('Handlers still running after shutdown; their leases will expire and the deliveries will be redelivered', {
                Subscription: this.policy.SubscriptionName,
                Remaining: this.executions.size,
            });
        }
    }

    /** Process exactly the given deliveries (Lambda mode: no loop). Results align with the input. */
    public async ProcessBatch(deliveries: ReceivedDelivery<TPayload>[]): Promise<SettleResult[]> {
        const results: SettleResult[] = [];
        const lanes = [...this.groupIntoLanes(deliveries).values()];
        let nextLane = 0;
        const workerCount = Math.max(1, Math.min(this.options.Concurrency, lanes.length));
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextLane < lanes.length) {
                const lane = lanes[nextLane];
                nextLane += 1;
                await this.runLane(lane, deliveries, results);
            }
        });
        await Promise.all(workers);
        return results;
    }

    private async loop(): Promise<void> {
        let idleMs = this.options.IdlePollMinMs;
        while (this.running) {
            const free = this.options.Concurrency - this.executions.size;
            if (free <= 0) {
                await this.sleep(this.options.IdlePollMaxMs);
                continue;
            }
            this.kickPending = false;
            const deliveries = await this.receive(Math.min(free, this.options.ReceiveBatchSize));
            if (!this.running) {
                await this.releaseUnstarted(deliveries);
                return;
            }
            if (deliveries.length > 0) {
                idleMs = this.options.IdlePollMinMs;
                deliveries.forEach((delivery) => {
                    void this.startExecution(delivery);
                });
                continue;
            }
            if (this.kickPending) {
                idleMs = this.options.IdlePollMinMs;
                continue;
            }
            await this.sleep(idleMs);
            idleMs = this.kickPending ? this.options.IdlePollMinMs : Math.min(idleMs * 2, this.options.IdlePollMaxMs);
        }
    }

    private async receive(max: number): Promise<ReceivedDelivery<TPayload>[]> {
        try {
            return await this.consumer.Receive(max, this.options.ReceiveWaitSeconds ?? 0, this.receiveController.signal);
        } catch (error) {
            if (this.running) {
                this.log.Error('Receive failed; backing off', error instanceof Error ? error : undefined, {
                    Subscription: this.policy.SubscriptionName,
                    Error: ErrorMessageOf(error),
                });
            }
            return [];
        }
    }

    private async releaseUnstarted(deliveries: ReceivedDelivery<TPayload>[]): Promise<void> {
        for (const delivery of deliveries) {
            try {
                await this.consumer.Release(delivery);
            } catch (error) {
                this.log.Warn('Release of an unstarted delivery failed; its lease will expire', {
                    Subscription: this.policy.SubscriptionName,
                    DeliveryID: delivery.DeliveryID,
                    Error: ErrorMessageOf(error),
                });
            }
        }
    }

    private startExecution(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        const execution = new DeliveryExecution<TPayload>({
            Delivery: delivery,
            Consumer: this.consumer,
            HandlerFactory: this.handlerFactory,
            Policy: this.policy,
            Log: this.log,
            Now: this.now,
            LeaseExpiryGraceMs: this.options.LeaseExpiryGraceMs,
            CancelDrainMs: this.options.ShutdownDrainMs,
        });
        const key = execution.ExecutionKey;
        const done = execution
            .Run()
            .catch((error: unknown): SettleResult => ({ Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorMessageOf(error) }))
            .then((result) => {
                this.executions.delete(key);
                this.reportSettle(result);
                this.wake();
                return result;
            });
        this.executions.set(key, { Execution: execution, Done: done });
        return done;
    }

    private reportSettle(result: SettleResult): void {
        if (result.Kind === 'Failed') {
            this.log.Error('Delivery settle failed', undefined, {
                Subscription: this.policy.SubscriptionName,
                DeliveryID: result.DeliveryID,
                Error: result.Error,
            });
        }
    }

    private async waitForExecutions(timeoutMs: number): Promise<boolean> {
        if (this.executions.size === 0) {
            return true;
        }
        const allDone = Promise.all([...this.executions.values()].map((running) => running.Done)).then(() => true);
        return this.within(allDone, timeoutMs);
    }

    /** Resolves true when `work` finishes within `timeoutMs`, false otherwise. Never rejects on timeout. */
    private async within(work: Promise<boolean>, timeoutMs: number): Promise<boolean> {
        const deadline: { Timer: ReturnType<typeof setTimeout> | null } = { Timer: null };
        const timedOut = new Promise<boolean>((resolve) => {
            deadline.Timer = setTimeout(() => resolve(false), timeoutMs);
        });
        try {
            return await Promise.race([work, timedOut]);
        } finally {
            if (deadline.Timer !== null) {
                clearTimeout(deadline.Timer);
            }
        }
    }

    private groupIntoLanes(deliveries: ReceivedDelivery<TPayload>[]): Map<string, number[]> {
        const lanes = new Map<string, number[]>();
        const partitioned = this.policy.PartitionMode !== 'None';
        deliveries.forEach((delivery, index) => {
            const key = delivery.Message.PartitionKey;
            const laneKey = partitioned && key !== undefined ? `key:${key}` : `item:${index}`;
            lanes.set(laneKey, [...(lanes.get(laneKey) ?? []), index]);
        });
        return lanes;
    }

    private async runLane(indices: number[], deliveries: ReceivedDelivery<TPayload>[], results: SettleResult[]): Promise<void> {
        let blocked = false;
        for (const index of indices) {
            const delivery = deliveries[index];
            if (blocked) {
                // Spec 03 §3.2: later items of the key are released unrun, so an SQS FIFO group keeps its order.
                results[index] = await this.releaseSkipped(delivery);
                continue;
            }
            const result = await this.startExecution(delivery);
            results[index] = result;
            blocked = !(result.Kind === 'Settled' && result.Status === 'Completed');
        }
    }

    private async releaseSkipped(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        try {
            return await this.consumer.Release(delivery);
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorMessageOf(error) };
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            this.wakeResolver = resolve;
            this.wakeTimer = setTimeout(() => this.wake(), ms);
        });
    }

    private wake(): void {
        if (this.wakeTimer !== null) {
            clearTimeout(this.wakeTimer);
            this.wakeTimer = null;
        }
        const resolve = this.wakeResolver;
        this.wakeResolver = null;
        if (resolve !== null) {
            resolve();
        }
    }
}
