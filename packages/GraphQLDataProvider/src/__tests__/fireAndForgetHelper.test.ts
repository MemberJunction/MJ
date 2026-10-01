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

    // ===== Headless / non-browser providers (no PushStatusUpdates channel) =====

    /** Stub provider WITHOUT a PushStatusUpdates method — mirrors a headless GraphQL client. */
    function makeHeadlessProvider(ack: Record<string, unknown> = { success: true, result: 'sync-payload' }) {
        const ExecuteGQL = vi.fn().mockResolvedValue({ [FIELD]: ack });
        return {
            provider: { sessionId: 'test-session', ExecuteGQL } as unknown as GraphQLDataProvider,
            ExecuteGQL,
        };
    }

    it('runs synchronously when the provider has no PushStatusUpdates channel', async () => {
        const { provider, ExecuteGQL } = makeHeadlessProvider();
        const result = await FireAndForgetHelper.Execute(baseConfig(provider, {
            variables: { fireAndForget: true },
            extractSyncResult: (ack) => ({ ok: ack.success === true, via: String(ack.result) }),
        }));

        expect(result).toEqual({ ok: true, via: 'sync-payload' });
        // The mutation must be sent with fireAndForget disabled so the resolver runs inline.
        expect(ExecuteGQL).toHaveBeenCalledTimes(1);
        expect(ExecuteGQL.mock.calls[0][1]).toMatchObject({ fireAndForget: false });
    });

    it('degrades to an error result (no crash) when no synchronous extractor is configured', async () => {
        const { provider } = makeHeadlessProvider();
        const result = await FireAndForgetHelper.Execute(baseConfig(provider));
        // Previously this path crashed with "PushStatusUpdates is not a function".
        expect(result).toMatchObject({ ok: false });
        expect(String((result as OpResult).via)).toContain('PushStatusUpdates');
    });
});

describe('FireAndForgetHelper — per-operation idle attribution (MJ #4222)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("another operation's traffic does not hold this operation's idle timer open", async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        const stalls: number[] = [];

        const promise = FireAndForgetHelper.Execute<OpResult>(
            baseConfig(dp, {
                // This operation is watching detail A only.
                isRelevantMessage: (parsed) => parsed.detailId === 'A',
                onStall: async (): Promise<StallDecision<OpResult>> => {
                    stalls.push(Date.now());
                    return { resolve: { ok: true, via: 'stall' } };
                },
            })
        );
        await vi.advanceTimersByTimeAsync(0);

        // A different concurrent run chatters away on the SAME session stream. The push topic is
        // per-session, not per-operation, so before this change every one of these reset our
        // timer — meaning a dead operation stayed "live" for as long as any sibling was noisy.
        for (let i = 0; i < 20; i++) {
            stream.next(JSON.stringify({ detailId: 'B', type: 'progress' }));
            await vi.advanceTimersByTimeAsync(100);
        }
        await vi.advanceTimersByTimeAsync(1000);

        expect(stalls).toHaveLength(1);
        await expect(promise).resolves.toEqual({ ok: true, via: 'stall' });
    });

    it("this operation's own traffic does keep it alive", async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        let stalled = false;

        const promise = FireAndForgetHelper.Execute<OpResult>(
            baseConfig(dp, {
                isRelevantMessage: (parsed) => parsed.detailId === 'A',
                onStall: async (): Promise<StallDecision<OpResult>> => {
                    stalled = true;
                    return { resolve: { ok: false, via: 'stall' } };
                },
            })
        );
        await vi.advanceTimersByTimeAsync(0);

        for (let i = 0; i < 5; i++) {
            stream.next(JSON.stringify({ detailId: 'A', type: 'progress' }));
            await vi.advanceTimersByTimeAsync(600);
        }

        expect(stalled).toBe(false);
        stream.next(JSON.stringify({ detailId: 'A', type: 'complete' }));
        await expect(promise).resolves.toEqual({ ok: true, via: 'completion' });
    });

    it('treats an unattributable message as activity, never as someone else\'s', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        let stalled = false;

        const promise = FireAndForgetHelper.Execute<OpResult>(
            baseConfig(dp, {
                // Mirrors the real predicates: anything without an operation id fails OPEN.
                isRelevantMessage: (parsed) => parsed.detailId === undefined || parsed.detailId === 'A',
                onStall: async (): Promise<StallDecision<OpResult>> => {
                    stalled = true;
                    return { resolve: { ok: false, via: 'stall' } };
                },
            })
        );
        await vi.advanceTimersByTimeAsync(0);

        // A liveness pulse carries a runId but no conversationDetailId. Misreading it as another
        // operation's traffic would time out a perfectly healthy long-running agent.
        for (let i = 0; i < 5; i++) {
            stream.next(JSON.stringify({ type: 'Heartbeat' }));
            await vi.advanceTimersByTimeAsync(600);
        }

        expect(stalled).toBe(false);
        stream.next(JSON.stringify({ detailId: 'A', type: 'complete' }));
        await expect(promise).resolves.toEqual({ ok: true, via: 'completion' });
    });

    it('still treats every message as activity when no predicate is supplied', async () => {
        const stream = new Subject<string>();
        const dp = makeDataProvider(stream);
        let stalled = false;

        const promise = FireAndForgetHelper.Execute<OpResult>(
            baseConfig(dp, {
                onStall: async (): Promise<StallDecision<OpResult>> => {
                    stalled = true;
                    return { resolve: { ok: false, via: 'stall' } };
                },
            })
        );
        await vi.advanceTimersByTimeAsync(0);

        // Backwards compatibility: callers that never opt in keep the pre-#4222 semantics.
        for (let i = 0; i < 5; i++) {
            stream.next(JSON.stringify({ detailId: 'B', type: 'progress' }));
            await vi.advanceTimersByTimeAsync(600);
        }

        expect(stalled).toBe(false);
        stream.next(JSON.stringify({ type: 'complete' }));
        await expect(promise).resolves.toEqual({ ok: true, via: 'completion' });
    });
});
