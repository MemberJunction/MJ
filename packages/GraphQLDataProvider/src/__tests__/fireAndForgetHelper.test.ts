import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { FireAndForgetHelper, type FireAndForgetConfig, type StallDecision } from '../fireAndForgetHelper';
import { GraphQLDataProvider } from '../graphQLDataProvider';

interface OpResult {
    ok: boolean;
    via?: string;
}

const FIELD = 'Op';

/** Builds a stub data provider whose PubSub stream is the supplied Subject. */
function makeDataProvider(stream: Subject<string>, ack: Record<string, unknown> = { success: true }) {
    return {
        sessionId: 'test-session',
        PushStatusUpdates: () => stream.asObservable(),
        ExecuteGQL: vi.fn().mockResolvedValue({ [FIELD]: ack }),
    } as unknown as GraphQLDataProvider;
}

/** Base config; tests override the bits they exercise. */
function baseConfig(
    dp: GraphQLDataProvider,
    overrides: Partial<FireAndForgetConfig<OpResult>> = {}
): FireAndForgetConfig<OpResult> {
    return {
        dataProvider: dp,
        mutation: 'mutation {}',
        variables: { fireAndForget: true },
        mutationFieldName: FIELD,
        validateAck: (ack) => ack?.success === true,
        isCompletionEvent: (parsed) => parsed.type === 'complete',
        extractResult: () => ({ ok: true, via: 'completion' }),
        createErrorResult: (msg) => ({ ok: false, via: msg }),
        operationLabel: 'TestOp',
        timeoutMs: 1000,
        ...overrides,
    };
}

/** Flush pending microtasks (e.g. the awaited mutation ack) under fake timers. */
async function flush() {
    await vi.advanceTimersByTimeAsync(0);
}

describe('FireAndForgetHelper.Execute', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('resolves when a matching completion event arrives', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 60000 }));

        await flush();
        stream.next(JSON.stringify({ type: 'complete' }));

        await expect(p).resolves.toEqual({ ok: true, via: 'completion' });
    });

    it('returns an error result when the server rejects the ack', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream, { success: false, errorMessage: 'nope' });
        const p = FireAndForgetHelper.Execute(baseConfig(dp));

        await flush();

        await expect(p).resolves.toEqual({ ok: false, via: 'nope' });
    });

    it('rejects after the idle window when no onStall hook is provided', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000 }));
        const settled = p.catch((e: Error) => e);

        await flush();
        await vi.advanceTimersByTimeAsync(1000);

        const result = await settled;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toContain('no updates');
    });

    it('does not reject early when activity keeps resetting the idle timer', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000 }));
        let done = false;
        p.then(() => { done = true; }, () => { done = true; });

        await flush();
        await vi.advanceTimersByTimeAsync(800);
        stream.next(JSON.stringify({ type: 'progress' })); // resets the timer
        await vi.advanceTimersByTimeAsync(800);             // 1600ms total, only 800 since reset
        expect(done).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);            // now exceed the window
        expect(done).toBe(true);
    });

    it('recovers a lost completion when onStall resolves', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const onStall = vi.fn<[], Promise<StallDecision<OpResult>>>()
            .mockResolvedValue({ resolve: { ok: true, via: 'reconciled' } });
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000, onStall }));

        await flush();
        await vi.advanceTimersByTimeAsync(1000);

        await expect(p).resolves.toEqual({ ok: true, via: 'reconciled' });
        expect(onStall).toHaveBeenCalledTimes(1);
    });

    it('rejects when onStall reports the run failed', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const onStall = vi.fn<[], Promise<StallDecision<OpResult>>>()
            .mockResolvedValue({ reject: new Error('run failed') });
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000, onStall }));
        const settled = p.catch((e: Error) => e);

        await flush();
        await vi.advanceTimersByTimeAsync(1000);

        expect(await settled).toMatchObject({ message: 'run failed' });
    });

    it('keeps waiting on continue, then resolves on a later completion event', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const onStall = vi.fn<[], Promise<StallDecision<OpResult>>>().mockResolvedValue('continue');
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000, onStall }));

        await flush();
        await vi.advanceTimersByTimeAsync(1000); // idle -> continue (re-arms)
        expect(onStall).toHaveBeenCalledTimes(1);

        stream.next(JSON.stringify({ type: 'complete' }));
        await expect(p).resolves.toEqual({ ok: true, via: 'completion' });
    });

    it('gives up after maxStallReconciles consecutive continues', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const onStall = vi.fn<[], Promise<StallDecision<OpResult>>>().mockResolvedValue('continue');
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 1000, onStall, maxStallReconciles: 2 }));
        const settled = p.catch((e: Error) => e);

        await flush();
        // 3 idle windows: continue, continue, then exceed cap -> reject
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);

        const result = await settled;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toContain('still reported as running');
        expect(onStall).toHaveBeenCalledTimes(3);
    });

    it('reconciles immediately when the PubSub stream ends', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const onStall = vi.fn<[], Promise<StallDecision<OpResult>>>()
            .mockResolvedValue({ reject: new Error('stream died') });
        const p = FireAndForgetHelper.Execute(baseConfig(dp, { timeoutMs: 60000, onStall }));
        const settled = p.catch((e: Error) => e);

        await flush();
        stream.complete(); // stream end -> reconcile without waiting the idle window
        await flush();

        expect(await settled).toMatchObject({ message: 'stream died' });
        expect(onStall).toHaveBeenCalledTimes(1);
    });
});
