import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeliveryExecution, ExecutionKeyOf } from '../runtime/DeliveryExecution';
import type { DeliveryExecutionOptions } from '../runtime/DeliveryExecution';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import type { WorkContext, WorkOutcome } from '../handler';
import type { WorkMessage } from '../envelope';
import type { SubscriptionPolicy } from '../policy';
import type { LeaseExtension, ReceivedDelivery } from '../transport';
import { CreateDeferred, HandlerFrom, MakeDelivery, MakePolicy, RecordingLogger, ScriptedConsumer } from './fakes';

interface Setup {
    Execution: DeliveryExecution;
    Consumer: ScriptedConsumer;
    Logger: RecordingLogger;
}

function setup(
    handle: (message: WorkMessage, context: WorkContext) => Promise<WorkOutcome>,
    policy: Partial<SubscriptionPolicy> = {},
    delivery: ReceivedDelivery = MakeDelivery('d1'),
    extra: Partial<DeliveryExecutionOptions> = {},
): Setup {
    const consumer = new ScriptedConsumer();
    const logger = new RecordingLogger();
    const execution = new DeliveryExecution({
        Delivery: delivery,
        Consumer: consumer,
        HandlerFactory: HandlerFrom(handle),
        Policy: MakePolicy(policy),
        Log: logger,
        Random: () => 1,
        ...extra,
    });
    return { Execution: execution, Consumer: consumer, Logger: logger };
}

describe('DeliveryExecution outcomes', () => {
    it('settles Complete', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Complete());
        expect(await Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Completed' });
        expect(Consumer.CallsOf('Complete')).toHaveLength(1);
    });

    it('retries with backoff while attempts remain', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Retry('busy'), {}, MakeDelivery('d1', { Attempt: 2 }));
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')).toEqual([{ Op: 'Retry', DeliveryID: 'd1', DelaySeconds: 20, Error: 'busy' }]);
    });

    it('dead-letters as MaxAttemptsExceeded on the final attempt', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Retry('busy'), { MaxAttempts: 5 }, MakeDelivery('d1', { Attempt: 5 }));
        await Execution.Run();
        expect(Consumer.CallsOf('DeadLetter')).toEqual([{ Op: 'DeadLetter', DeliveryID: 'd1', Reason: 'MaxAttemptsExceeded', Error: 'busy' }]);
    });

    it('dead-letters with the handler reason', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.DeadLetter('unknown subscriber'));
        expect(await Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'DeadLettered' });
        expect(Consumer.CallsOf('DeadLetter')[0]).toMatchObject({ Reason: 'unknown subscriber', Error: null });
    });

    it('maps FatalWorkError to DeadLetter', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new FatalWorkError('malformed payload');
        });
        await Execution.Run();
        const call = Consumer.CallsOf('DeadLetter')[0];
        expect(call.Reason).toBe('malformed payload');
        expect(call.Error?.startsWith('FatalWorkError: malformed payload')).toBe(true);
    });

    it('maps TransientWorkError to Retry with its delay', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new TransientWorkError('throttled', 120);
        });
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')[0].DelaySeconds).toBe(120);
    });

    it('maps other thrown errors to Retry and records the error text', async () => {
        const { Execution, Consumer } = setup(async () => {
            throw new Error('connection reset');
        });
        await Execution.Run();
        expect(Consumer.CallsOf('Retry')[0].Error.startsWith('Error: connection reset')).toBe(true);
    });

    it('maps a throwing handler factory to Retry', async () => {
        const consumer = new ScriptedConsumer();
        const execution = new DeliveryExecution({
            Delivery: MakeDelivery('d1'),
            Consumer: consumer,
            HandlerFactory: () => {
                throw new Error('no handler registered');
            },
            Policy: MakePolicy(),
            Log: new RecordingLogger(),
            Random: () => 1,
        });
        await execution.Run();
        expect(consumer.CallsOf('Retry')[0].Error).toContain('no handler registered');
    });

    it('populates the context', async () => {
        const seen: WorkContext[] = [];
        const { Execution } = setup(
            async (_message, context) => {
                seen.push(context);
                return Outcome.Complete();
            },
            { SubscriptionName: 'email.unsubscribe', MaxAttempts: 7 },
            MakeDelivery('d9', { Attempt: 3, IsReplay: true }),
        );
        await Execution.Run();
        expect(seen[0]).toMatchObject({ SubscriptionName: 'email.unsubscribe', DeliveryID: 'd9', Attempt: 3, MaxAttempts: 7, IsReplay: true });
        expect(seen[0].Signal.aborted).toBe(false);
    });

    it('returns Failed when settling throws', async () => {
        const { Execution, Consumer } = setup(async () => Outcome.Complete());
        Consumer.SettleError = new Error('db down');
        expect(await Execution.Run()).toEqual({ Kind: 'Failed', DeliveryID: 'd1', Error: 'db down' });
    });

    it('identifies an execution by delivery and lease token, because a DeliveryID is reused across attempts', () => {
        const first = MakeDelivery('d1', { LeaseToken: 'token-a' });
        const second = MakeDelivery('d1', { LeaseToken: 'token-b' });
        expect(ExecutionKeyOf(first)).not.toBe(ExecutionKeyOf(second));
        expect(setup(async () => Outcome.Complete(), {}, first).Execution.ExecutionKey).toBe(ExecutionKeyOf(first));
    });
});

/** Resolves when the handler's signal aborts; used by handlers that cooperate with an abort. */
function aborted(context: WorkContext): Promise<void> {
    return new Promise<void>((resolve) => context.Signal.addEventListener('abort', () => resolve()));
}

describe('DeliveryExecution leases', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // MakeDelivery leases run to now + 60 s, so the default horizon is 00:01:00 (+ 5 s grace).
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Auto mode heartbeats every LeaseSeconds / 3', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Auto', LeaseSeconds: 30 });
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(25_000);
        expect(Consumer.CallsOf('ExtendLease')).toHaveLength(2);
        expect(Consumer.CallsOf('ExtendLease')[0]).toMatchObject({ LeaseSeconds: 30 });
        gate.Resolve(Outcome.Complete());
        await run;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(Consumer.CallsOf('ExtendLease')).toHaveLength(2);
    });

    it('Auto mode never waits longer than 30 s between heartbeats, however long the lease', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Auto', LeaseSeconds: 1200 });
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(65_000);
        expect(Consumer.CallsOf('ExtendLease')).toHaveLength(2);
        expect(Consumer.CallsOf('ExtendLease')[0]).toMatchObject({ LeaseSeconds: 1200 });
        gate.Resolve(Outcome.Complete());
        await run;
    });

    it('Manual mode heartbeats only when the handler asks', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const held: boolean[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                held.push(await context.Heartbeat({ Percent: 50, Message: 'halfway' }));
                return gate.Promise;
            },
            { HeartbeatMode: 'Manual', LeaseSeconds: 30 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(20_000);
        expect(Consumer.CallsOf('ExtendLease')).toEqual([
            { Op: 'ExtendLease', DeliveryID: 'd1', LeaseSeconds: 30, Progress: { Percent: 50, Message: 'halfway' } },
        ]);
        expect(held).toEqual([true]);
        gate.Resolve(Outcome.Complete());
        await run;
    });

    it('lease loss aborts the handler and skips settling', async () => {
        const seen: unknown[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                seen.push(await context.Heartbeat(), context.Signal.aborted, String(context.Signal.reason));
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = 'Lost';
        expect(await Execution.Run()).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(seen).toEqual([false, true, 'LeaseLost']);
        expect(Consumer.Count('Complete')).toBe(0);
        expect(Consumer.Count('AcknowledgeCancel')).toBe(0);
        expect(Execution.StopReason).toBe('LeaseLost');
    });

    it('treats a failed heartbeat call as still held and logs it', async () => {
        const held: boolean[] = [];
        const { Execution, Consumer, Logger } = setup(
            async (_message, context) => {
                held.push(await context.Heartbeat());
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = new Error('network');
        expect(await Execution.Run()).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
        expect(held).toEqual([true]);
        expect(Logger.Has('Warn', 'Heartbeat failed')).toBe(true);
    });

    it('retries a failed heartbeat on the next tick and keeps the handler running', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer, Logger } = setup(async () => gate.Promise, { HeartbeatMode: 'Auto', LeaseSeconds: 30 });
        Consumer.ExtendLeaseSequence = [new Error('network blip')];
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        expect(Logger.Has('Warn', 'Heartbeat failed')).toBe(true);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(2);
        expect(Execution.StopReason).toBeNull();
        gate.Resolve(Outcome.Complete());
        expect(await run).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
        expect(Consumer.Count('Complete')).toBe(1);
    });

    it('aborts with LeaseLost once the lease horizon passes while every heartbeat fails', async () => {
        const contexts: WorkContext[] = [];
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer, Logger } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Auto', LeaseSeconds: 30 },
        );
        Consumer.ExtendLeaseResult = new Error('database unreachable');
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(64_000);
        expect(contexts[0].Signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(contexts[0].Signal.aborted).toBe(true);
        expect(String(contexts[0].Signal.reason)).toBe('LeaseLost');
        expect(Execution.StopReason).toBe('LeaseLost');
        expect(Logger.Has('Warn', 'Lease horizon passed')).toBe(true);
        gate.Resolve(Outcome.Complete());
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(Consumer.Count('Complete')).toBe(0);
    });

    it('a hung ExtendLease cannot wedge the delivery: the horizon still aborts and Run still returns', async () => {
        const contexts: WorkContext[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                contexts.push(context);
                await aborted(context);
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Auto', LeaseSeconds: 30 },
        );
        // A stalled socket or an exhausted pool: the call neither resolves nor rejects.
        Consumer.ExtendLeaseImpl = () => new Promise<LeaseExtension>(() => undefined);
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(64_000);
        expect(contexts[0].Signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(String(contexts[0].Signal.reason)).toBe('LeaseLost');
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(Consumer.Count('ExtendLease')).toBe(1);
        expect(Consumer.Count('Complete')).toBe(0);
    });

    it('Manual mode enforces the lease horizon when the handler stops heartbeating', async () => {
        const contexts: WorkContext[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                contexts.push(context);
                await aborted(context);
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual', LeaseSeconds: 30 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(66_000);
        expect(String(contexts[0].Signal.reason)).toBe('LeaseLost');
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(Consumer.Count('ExtendLease')).toBe(0);
        expect(Consumer.Count('Complete')).toBe(0);
    });

    it('re-arms the lease horizon on every Held', async () => {
        const contexts: WorkContext[] = [];
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Manual', LeaseSeconds: 30 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(50_000);
        expect(await contexts[0].Heartbeat()).toBe(true);
        // Horizon is now 00:01:20 (+ 5 s): the original 00:01:05 deadline must not fire.
        await vi.advanceTimersByTimeAsync(20_000);
        expect(contexts[0].Signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(16_000);
        expect(String(contexts[0].Signal.reason)).toBe('LeaseLost');
        gate.Resolve(Outcome.Complete());
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
    });

    it('an operator cancel aborts with Cancelled, discards the outcome and acknowledges so the key frees at once', async () => {
        const seen: unknown[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                seen.push(await context.Heartbeat(), context.Signal.aborted, String(context.Signal.reason));
                // Ignored: a cancelled delivery is never completed, retried or dead-lettered.
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseResult = 'Cancelled';
        Consumer.AcknowledgeCancelStatus = 'Discarded';
        expect(await Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Discarded' });
        expect(seen).toEqual([false, true, 'Cancelled']);
        expect(Consumer.Count('Complete')).toBe(0);
        expect(Consumer.Count('AcknowledgeCancel')).toBe(1);
        expect(Execution.StopReason).toBe('Cancelled');
    });

    it('acknowledges a cancel after CancelDrainMs when the handler ignores the abort', async () => {
        const { Execution, Consumer, Logger } = setup(
            async () => new Promise<WorkOutcome>(() => undefined),
            { HeartbeatMode: 'Auto', LeaseSeconds: 30 },
            MakeDelivery('d1'),
            { CancelDrainMs: 5_000 },
        );
        Consumer.ExtendLeaseResult = 'Cancelled';
        Consumer.AcknowledgeCancelStatus = 'Discarded';
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('AcknowledgeCancel')).toBe(0);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(await run).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Discarded' });
        expect(Logger.Has('Warn', 'did not stop')).toBe(true);
    });

    it('acknowledges once when a settle reports LeaseLost, so a late cancel still frees the key', async () => {
        const cancelled = setup(async () => Outcome.Complete(), { HeartbeatMode: 'Manual' });
        cancelled.Consumer.SettleLeaseLost = true;
        cancelled.Consumer.AcknowledgeCancelStatus = 'Discarded';
        expect(await cancelled.Execution.Run()).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Discarded' });
        expect(cancelled.Consumer.Count('Complete')).toBe(1);
        expect(cancelled.Consumer.Count('AcknowledgeCancel')).toBe(1);

        const takenOver = setup(async () => Outcome.Complete(), { HeartbeatMode: 'Manual' });
        takenOver.Consumer.SettleLeaseLost = true;
        expect(await takenOver.Execution.Run()).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(takenOver.Consumer.Count('AcknowledgeCancel')).toBe(1);
    });

    it('coalesces concurrent heartbeats onto one ExtendLease call', async () => {
        const extension = CreateDeferred<LeaseExtension>();
        const results: boolean[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                const first = context.Heartbeat({ Percent: 10 });
                const second = context.Heartbeat({ Percent: 20 });
                extension.Resolve('Held');
                results.push(await first, await second);
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseImpl = () => extension.Promise;
        await Execution.Run();
        expect(results).toEqual([true, true]);
        expect(Consumer.CallsOf('ExtendLease')).toEqual([
            { Op: 'ExtendLease', DeliveryID: 'd1', LeaseSeconds: 60, Progress: { Percent: 10 } },
        ]);
    });

    it('waits for a heartbeat still in flight when the handler returns, and honours its result', async () => {
        const extension = CreateDeferred<LeaseExtension>();
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                void context.Heartbeat();
                return Outcome.Complete();
            },
            { HeartbeatMode: 'Manual' },
        );
        Consumer.ExtendLeaseImpl = () => extension.Promise;
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(0);
        expect(Consumer.Count('Complete')).toBe(0);
        extension.Resolve('Lost');
        expect(await run).toEqual({ Kind: 'LeaseLost', DeliveryID: 'd1' });
        expect(Consumer.Count('Complete')).toBe(0);
    });

    it('MaxProcessingSeconds aborts the handler and stops renewing', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const contexts: WorkContext[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Auto', LeaseSeconds: 30, MaxProcessingSeconds: 15 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(contexts[0].Signal.aborted).toBe(true);
        expect(String(contexts[0].Signal.reason)).toBe('MaxProcessingSeconds');
        await vi.advanceTimersByTimeAsync(20_000);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        expect(await contexts[0].Heartbeat()).toBe(false);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        gate.Resolve(Outcome.Complete());
        expect(await run).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
    });

    it('a shutdown that arrives after the cap still releases instead of retrying', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Manual', MaxProcessingSeconds: 15 });
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(Execution.StopReason).toBe('MaxProcessingSeconds');
        Execution.Abort('Shutdown');
        gate.Resolve(Outcome.Retry('interrupted'));
        expect(await run).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Pending' });
        expect(Consumer.Count('Release')).toBe(1);
        expect(Consumer.Count('Retry')).toBe(0);
        expect(Execution.StopReason).toBe('MaxProcessingSeconds');
    });

    it('a cap that fires after a shutdown still stops manual renewals', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const contexts: WorkContext[] = [];
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Manual', MaxProcessingSeconds: 15 },
        );
        const run = Execution.Run();
        Execution.Abort('Shutdown');
        expect(await contexts[0].Heartbeat()).toBe(true);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(await contexts[0].Heartbeat()).toBe(false);
        expect(Consumer.Count('ExtendLease')).toBe(1);
        gate.Resolve(Outcome.Complete());
        await run;
    });

    it('clamps a MaxProcessingSeconds beyond the timer limit instead of firing at once', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const contexts: WorkContext[] = [];
        const { Execution } = setup(
            async (_message, context) => {
                contexts.push(context);
                return gate.Promise;
            },
            { HeartbeatMode: 'Manual', MaxProcessingSeconds: 3_000_000 },
        );
        const run = Execution.Run();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(contexts[0].Signal.aborted).toBe(false);
        gate.Resolve(Outcome.Complete());
        expect(await run).toMatchObject({ Kind: 'Settled', Status: 'Completed' });
    });

    it('releases a delivery that did not complete after a shutdown abort', async () => {
        const { Execution, Consumer } = setup(
            async (_message, context) => {
                await aborted(context);
                throw new Error('interrupted');
            },
            { HeartbeatMode: 'Manual' },
        );
        const run = Execution.Run();
        Execution.Abort('Shutdown');
        expect(await run).toEqual({ Kind: 'Settled', DeliveryID: 'd1', Status: 'Pending' });
        expect(Consumer.Count('Release')).toBe(1);
        expect(Consumer.Count('Retry')).toBe(0);
    });

    it('still completes a delivery whose handler finished after a shutdown abort', async () => {
        const gate = CreateDeferred<WorkOutcome>();
        const { Execution, Consumer } = setup(async () => gate.Promise, { HeartbeatMode: 'Manual' });
        const run = Execution.Run();
        Execution.Abort('Shutdown');
        gate.Resolve(Outcome.Complete());
        await run;
        expect(Consumer.Count('Complete')).toBe(1);
        expect(Consumer.Count('Release')).toBe(0);
    });
});
