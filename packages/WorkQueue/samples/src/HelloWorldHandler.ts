import { RegisterClass } from '@memberjunction/global';
import { FatalWorkError, Outcome, TransientWorkError, type WorkContext, type WorkJson, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';

/** The HandlerKey the sample subscriptions name (metadata-optional/work-queue-samples). */
export const HELLO_WORLD_HANDLER_KEY = 'samples.hello';

/**
 * What a Hello World message may carry. Every field is optional, so `{}` is a valid message; the extra fields
 * exist to exercise one queue behaviour each from a single topic:
 *
 * - `name` — who to greet (default "World").
 * - `sleepMs` — hold the delivery in flight this long. Long enough to watch it with `mj queue stats`, or to cancel it
 *   with `mj queue discard` and see the handler stop through its Signal.
 * - `fail` — `'transient'` retries with backoff until MaxAttempts, then dead-letters; `'fatal'` dead-letters at once.
 * - `failUntilAttempt` — fail transiently while `Attempt < failUntilAttempt`, then succeed: a retry that recovers.
 */
export type HelloWorldPayload = {
    name?: string;
    sleepMs?: number;
    fail?: 'transient' | 'fatal';
    failUntilAttempt?: number;
};

/**
 * The simplest possible MJ work handler: log a greeting and complete. Registered under `samples.hello`; any
 * subscription whose HandlerKey is `samples.hello` runs it. It does no data access — a real handler would use
 * `this.Provider` / `this.ContextUser`, the host's system user, for every call.
 */
@RegisterClass(BaseWorkHandler, HELLO_WORLD_HANDLER_KEY)
export class HelloWorldHandler extends BaseWorkHandler<HelloWorldPayload> {
    public async Handle(message: WorkMessage<HelloWorldPayload>, context: WorkContext): Promise<WorkOutcome> {
        const payload = ReadHelloWorldPayload(message.Payload);
        const greeting = `Hello, ${payload.name ?? 'World'}!`;
        context.Log.Info(greeting, {
            Subscription: context.SubscriptionName,
            MessageID: message.MessageID,
            DeliveryID: context.DeliveryID,
            Attempt: context.Attempt,
            MaxAttempts: context.MaxAttempts,
            PartitionKey: message.PartitionKey ?? null,
            IsReplay: context.IsReplay,
        });
        this.failOnRequest(payload, context, greeting);
        if (payload.sleepMs !== undefined && payload.sleepMs > 0) {
            const finished = await SleepUnlessAborted(payload.sleepMs, context.Signal);
            if (!finished) {
                // Cancelled: the runtime acknowledges the cancel and ignores this outcome. Shutdown or a lost lease: the
                // delivery goes back to the queue; Retry says so honestly if the outcome is ever read.
                return Outcome.Retry(`stopped while sleeping: ${String(context.Signal.reason)}`);
            }
        }
        return Outcome.Complete();
    }

    private failOnRequest(payload: HelloWorldPayload, context: WorkContext, greeting: string): void {
        if (payload.failUntilAttempt !== undefined && context.Attempt < payload.failUntilAttempt) {
            throw new TransientWorkError(`${greeting} Failing attempt ${context.Attempt} on purpose; will succeed on attempt ${payload.failUntilAttempt}`);
        }
        if (payload.fail === 'fatal') {
            throw new FatalWorkError(`${greeting} Dead-lettering on purpose (fail: 'fatal')`);
        }
        if (payload.fail === 'transient') {
            throw new TransientWorkError(`${greeting} Retrying on purpose (fail: 'transient'), attempt ${context.Attempt} of ${context.MaxAttempts}`);
        }
    }
}

/** Reads the optional fields off whatever JSON was published, ignoring anything unexpected. */
export function ReadHelloWorldPayload(payload: WorkJson | undefined): HelloWorldPayload {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return {};
    }
    const result: HelloWorldPayload = {};
    if (typeof payload.name === 'string') {
        result.name = payload.name;
    }
    if (typeof payload.sleepMs === 'number' && Number.isFinite(payload.sleepMs)) {
        result.sleepMs = payload.sleepMs;
    }
    if (payload.fail === 'transient' || payload.fail === 'fatal') {
        result.fail = payload.fail;
    }
    if (typeof payload.failUntilAttempt === 'number' && Number.isInteger(payload.failUntilAttempt)) {
        result.failUntilAttempt = payload.failUntilAttempt;
    }
    return result;
}

/** Resolves true after `ms`, or false as soon as the signal aborts. */
export function SleepUnlessAborted(ms: number, signal: AbortSignal): Promise<boolean> {
    return new Promise<boolean>(resolve => {
        if (signal.aborted) {
            resolve(false);
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve(true);
        }, ms);
        const onAbort = (): void => {
            clearTimeout(timer);
            resolve(false);
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
