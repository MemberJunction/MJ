import { describe, expect, it } from 'vitest';
import { FatalWorkError, TransientWorkError, type WorkContext, type WorkJson, type WorkLogger, type WorkMessage } from '@memberjunction/work-queue-core';
import { IsWorkHandlerRegistered } from '@memberjunction/work-queue-engine';
import { HELLO_WORLD_HANDLER_KEY, HelloWorldHandler, ReadHelloWorldPayload, SleepUnlessAborted, type HelloWorldPayload } from '../HelloWorldHandler';

class RecordingLogger implements WorkLogger {
    public readonly Infos: Array<{ Message: string; Data?: Record<string, WorkJson> }> = [];
    public Info(message: string, data?: Record<string, WorkJson>): void { this.Infos.push({ Message: message, Data: data }); }
    public Warn(): void { /* not used */ }
    public Error(): void { /* not used */ }
}

function message(payload: HelloWorldPayload | WorkJson, partitionKey?: string): WorkMessage<HelloWorldPayload> {
    return { MessageID: 'm-1', Topic: 'samples.hello', PartitionKey: partitionKey, Attributes: {}, Payload: payload as HelloWorldPayload, PublishedAt: '2026-09-25T00:00:00Z' };
}

function context(overrides: Partial<WorkContext> = {}, log = new RecordingLogger()): WorkContext & { Log: RecordingLogger } {
    return {
        SubscriptionName: 'samples.hello-log', DeliveryID: 'd-1', Attempt: 1, MaxAttempts: 3, IsReplay: false,
        Signal: new AbortController().signal, Heartbeat: async () => true, Log: log, ...overrides, 
    } as WorkContext & { Log: RecordingLogger };
}

describe('HelloWorldHandler', () => {
    it('is registered under samples.hello once the package is imported', () => {
        expect(IsWorkHandlerRegistered(HELLO_WORLD_HANDLER_KEY)).toBe(true);
    });

    it('greets by name, logs the delivery details and completes', async () => {
        const ctx = context();
        const outcome = await new HelloWorldHandler().Handle(message({ name: 'Paul' }, 'k1'), ctx);
        expect(outcome).toEqual({ Kind: 'Complete' });
        expect(ctx.Log.Infos).toHaveLength(1);
        expect(ctx.Log.Infos[0].Message).toBe('Hello, Paul!');
        expect(ctx.Log.Infos[0].Data).toMatchObject({ Subscription: 'samples.hello-log', MessageID: 'm-1', DeliveryID: 'd-1', Attempt: 1, PartitionKey: 'k1' });
    });

    it('greets the world for an empty or non-object payload', async () => {
        const ctx = context();
        await new HelloWorldHandler().Handle(message({}), ctx);
        await new HelloWorldHandler().Handle(message('just a string'), ctx);
        expect(ctx.Log.Infos.map(i => i.Message)).toEqual(['Hello, World!', 'Hello, World!']);
    });

    it("fail: 'fatal' throws FatalWorkError (dead-letter now)", async () => {
        await expect(new HelloWorldHandler().Handle(message({ fail: 'fatal' }), context())).rejects.toBeInstanceOf(FatalWorkError);
    });

    it("fail: 'transient' throws TransientWorkError (retry with backoff)", async () => {
        await expect(new HelloWorldHandler().Handle(message({ fail: 'transient' }), context())).rejects.toBeInstanceOf(TransientWorkError);
    });

    it('failUntilAttempt fails transiently before that attempt and completes on it', async () => {
        const handler = new HelloWorldHandler();
        await expect(handler.Handle(message({ failUntilAttempt: 2 }), context({ Attempt: 1 }))).rejects.toBeInstanceOf(TransientWorkError);
        expect(await handler.Handle(message({ failUntilAttempt: 2 }), context({ Attempt: 2 }))).toEqual({ Kind: 'Complete' });
    });

    it('sleepMs holds the delivery and completes when the sleep ends', async () => {
        expect(await new HelloWorldHandler().Handle(message({ sleepMs: 5 }), context())).toEqual({ Kind: 'Complete' });
    });

    it('a sleeping handler stops as soon as its Signal aborts and reports the reason', async () => {
        const controller = new AbortController();
        const pending = new HelloWorldHandler().Handle(message({ sleepMs: 60000 }), context({ Signal: controller.signal }));
        controller.abort('Cancelled');
        expect(await pending).toEqual({ Kind: 'Retry', Reason: 'stopped while sleeping: Cancelled' });
    });
});

describe('ReadHelloWorldPayload', () => {
    it('keeps only the known, well-typed fields', () => {
        expect(ReadHelloWorldPayload({ name: 'A', sleepMs: 10, fail: 'fatal', failUntilAttempt: 2, extra: true })).toEqual({ name: 'A', sleepMs: 10, fail: 'fatal', failUntilAttempt: 2 });
        expect(ReadHelloWorldPayload({ name: 5, sleepMs: 'x', fail: 'later', failUntilAttempt: 1.5 })).toEqual({});
        expect(ReadHelloWorldPayload(undefined)).toEqual({});
        expect(ReadHelloWorldPayload([1, 2])).toEqual({});
    });
});

describe('SleepUnlessAborted', () => {
    it('resolves false immediately for an already-aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();
        expect(await SleepUnlessAborted(1000, controller.signal)).toBe(false);
    });
});
