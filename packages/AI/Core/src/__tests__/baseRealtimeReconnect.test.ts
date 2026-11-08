import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    BaseRealtimeModel,
    BaseRealtimeSession,
    ClampSessionSecondsValue,
    DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS,
    ExtractRealtimeTimingConfig,
    REALTIME_SHARED_CONFIG_KEYS,
    type IRealtimeSession,
    type RealtimeDriverFacts,
    type RealtimeInputFrame,
    type RealtimeReconnectContext,
    type RealtimeSessionError,
    type RealtimeSessionParams,
    type RealtimeToolCall,
    type RealtimeToolDefinition,
    type RealtimeTranscript,
    type RealtimeUsage,
} from '../generic/baseRealtime';

class TestRealtimeSession extends BaseRealtimeSession {
    public readonly ReconnectContexts: RealtimeReconnectContext[] = [];
    public readonly Errors: Array<{ Error: RealtimeSessionError; Code?: string }> = [];
    public ReconnectBehavior: (context: RealtimeReconnectContext) => Promise<void> = async () => undefined;
    private runtimeOverride: number | undefined;
    private errorHandler?: (error: RealtimeSessionError) => void;

    public SetRuntimeCallDurationSeconds(seconds: number | undefined): void {
        this.runtimeOverride = seconds;
    }

    protected override get RuntimeCallDurationSeconds(): number | undefined {
        return this.runtimeOverride ?? super.RuntimeCallDurationSeconds;
    }

    protected override onReconnectFailed(error: Error, code = 'reconnect-failed'): void {
        const payload: RealtimeSessionError = {
            Message: error.message,
            Code: code,
            Fatal: true,
        };
        this.Errors.push({ Error: payload, Code: code });
        this.errorHandler?.(payload);
    }

    public SendInput(_frame: RealtimeInputFrame): void {}
    public async RegisterTools(_tools: RealtimeToolDefinition[]): Promise<void> {}
    public OnOutput(_handler: (chunk: ArrayBuffer) => void): void {}
    public OnTranscript(_handler: (t: RealtimeTranscript) => void): void {}
    public OnToolCall(_handler: (call: RealtimeToolCall) => void): void {}
    public async SendToolResult(_callID: string, _output: string): Promise<void> {}
    public OnInterruption(_handler: () => void): void {}
    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.errorHandler = handler;
    }
    public OnUsage(_handler: (u: RealtimeUsage) => void): void {}
    public async Close(): Promise<void> {
        this.DisposeReconnectTimers();
    }
}

class TestRealtimeModel extends BaseRealtimeModel {
    public static override readonly DriverFacts: Readonly<RealtimeDriverFacts> = Object.freeze({
        ProviderMaxSessionSeconds: 600,
    });

    public TrustNative = false;
    public RuntimeDuration: number | undefined = undefined;

    public override get TrustsNativeResumption(): boolean {
        return this.TrustNative;
    }

    public override get RuntimeCallDurationSeconds(): number | undefined {
        return this.RuntimeDuration;
    }

    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        return new TestRealtimeSession(this, params.Config);
    }

    protected async ReconnectSession(
        session: IRealtimeSession,
        context: RealtimeReconnectContext
    ): Promise<void> {
        const testSession = session as TestRealtimeSession;
        testSession.ReconnectContexts.push(context);
        await testSession.ReconnectBehavior(context);
    }
}

describe('BaseRealtimeModel & BaseRealtimeSession — long-call reconnect contract', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('includes the 4 shared reconnect keys in REALTIME_SHARED_CONFIG_KEYS', () => {
        expect(REALTIME_SHARED_CONFIG_KEYS).toContain('connectionMaxSeconds');
        expect(REALTIME_SHARED_CONFIG_KEYS).toContain('sessionMaxSeconds');
        expect(REALTIME_SHARED_CONFIG_KEYS).toContain('reconnectBufferSeconds');
        expect(REALTIME_SHARED_CONFIG_KEYS).toContain('trustNativeResumption');
    });

    it('ClampSessionSecondsValue accepts null and undefined and picks the smallest positive integer', () => {
        expect(ClampSessionSecondsValue(null, undefined, 600, 120)).toBe(120);
        expect(ClampSessionSecondsValue(45, 120, 600)).toBe(45);
        expect(ClampSessionSecondsValue(null, undefined, 0, -5, 1.5)).toBeUndefined();
    });

    it('resolves CallDurationSeconds across 3 layers without shadowing state-dependent caps or tighter overrides', async () => {
        const model = new TestRealtimeModel('test-key');
        expect(model.CallDurationSeconds).toBe(600);
        expect(model.ReconnectBufferSeconds).toBe(DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS);

        // 1. Default from driver when no config or runtime cap is set
        const s1 = (await model.StartSession({ Model: 'test', SystemPrompt: 'sys' })) as TestRealtimeSession;
        expect(s1.CallDurationSeconds).toBe(600);

        // 2. Seeded metadata ConnectionMaxSeconds (600) + dynamic runtime cap (120s uncompressed video) -> 120s
        const s2 = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
            Config: { connectionMaxSeconds: 600 },
        })) as TestRealtimeSession;
        s2.SetRuntimeCallDurationSeconds(120);
        expect(s2.CallDurationSeconds).toBe(120);

        // 3. Tighter custom metadata override (45s) + dynamic runtime cap (120s) -> 45s
        const s3 = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
            Config: { connectionMaxSeconds: 45, reconnectBufferSeconds: 5 },
        })) as TestRealtimeSession;
        s3.SetRuntimeCallDurationSeconds(120);
        expect(s3.CallDurationSeconds).toBe(45);
        expect(s3.ReconnectBufferSeconds).toBe(5);
    });

    it('fires proactive reconnect on duration-expiry and passes native handle when TrustsNativeResumption is true', async () => {
        const model = new TestRealtimeModel('test-key');
        model.TrustNative = true;
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
            Config: { connectionMaxSeconds: 40, reconnectBufferSeconds: 10 },
        })) as TestRealtimeSession;

        session.RecordResumptionHandle('handle-abc');
        session.RecordTurnEntry({ Kind: 'user', Text: 'Hello there' });
        session.ArmConnectionDurationTimer();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(session.ReconnectContexts).toHaveLength(1);
        expect(session.ReconnectContexts[0].Reason).toBe('duration-expiry');
        expect(session.ReconnectContexts[0].UseNativeResumption).toBe(true);
        expect(session.ReconnectContexts[0].ResumptionHandle).toBe('handle-abc');
        expect(session.ReconnectContexts[0].ConversationSeed).toBeNull();
        await session.Close();
    });

    it('falls back on Attempt 2 to ConversationSeed when Attempt 1 with native handle fails', async () => {
        const model = new TestRealtimeModel('test-key');
        model.TrustNative = true;
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
            Config: { connectionMaxSeconds: 40, reconnectBufferSeconds: 10 },
        })) as TestRealtimeSession;

        session.RecordResumptionHandle('expired-handle');
        session.RecordTurnEntry({ Kind: 'user', Text: 'Remember AURORA-55' });
        session.RecordTurnEntry({ Kind: 'assistant', Text: 'Noted AURORA-55' });

        let callCount = 0;
        session.ReconnectBehavior = async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('1007 Invalid resumption handle');
            }
        };

        const promise = session.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(1_500);
        const ok = await promise;

        expect(ok).toBe(true);
        expect(session.ReconnectContexts).toHaveLength(2);
        // Attempt 1 tried native resumption
        expect(session.ReconnectContexts[0].Attempt).toBe(1);
        expect(session.ReconnectContexts[0].UseNativeResumption).toBe(true);
        expect(session.ReconnectContexts[0].ResumptionHandle).toBe('expired-handle');
        expect(session.ReconnectContexts[0].ConversationSeed).toBeNull();
        // Attempt 2 automatically fell back to history seeding
        expect(session.ReconnectContexts[1].Attempt).toBe(2);
        expect(session.ReconnectContexts[1].UseNativeResumption).toBe(false);
        expect(session.ReconnectContexts[1].ResumptionHandle).toBeNull();
        expect(session.ReconnectContexts[1].ConversationSeed?.Entries).toHaveLength(2);
        await session.Close();
    });

    it('surfaces Fatal: true error after all 3 attempts fail', async () => {
        const model = new TestRealtimeModel('test-key');
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
        })) as TestRealtimeSession;

        session.ReconnectBehavior = async () => {
            throw new Error('socket refused');
        };

        const promise = session.TriggerReconnect('connection-lost');
        await vi.advanceTimersByTimeAsync(5_000);
        const ok = await promise;

        expect(ok).toBe(false);
        expect(session.ReconnectContexts).toHaveLength(3);
        expect(session.Errors).toHaveLength(1);
        expect(session.Errors[0].Error.Fatal).toBe(true);
        expect(session.Errors[0].Code).toBe('reconnect-failed');
    });

    it('ExtractRealtimeTimingConfig extracts camelCase and PascalCase keys and rejects non-integer fractions (#15)', () => {
        expect(
            ExtractRealtimeTimingConfig({
                connectionMaxSeconds: 600,
                sessionMaxSeconds: 1800,
                reconnectBufferSeconds: 10,
                trustNativeResumption: false,
            })
        ).toEqual({
            ConnectionMaxSeconds: 600,
            SessionMaxSeconds: 1800,
            ReconnectBufferSeconds: 10,
            TrustNativeResumption: false,
        });
        expect(
            ExtractRealtimeTimingConfig({
                connectionMaxSeconds: 0.5,
                sessionMaxSeconds: 12.7,
                reconnectBufferSeconds: -3,
            })
        ).toEqual({});
    });

    it('narrows CallDurationSeconds with metadata and never widens past DriverFacts.ProviderMaxSessionSeconds (#15)', async () => {
        const model = new TestRealtimeModel('test-key');
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
            Config: { connectionMaxSeconds: 7200 },
        })) as TestRealtimeSession;
        // Driver ceiling is 600s; metadata 7200s must not widen past 600s
        expect(session.CallDurationSeconds).toBe(600);
        expect(model.ResolveConnectionDurationSeconds({ connectionMaxSeconds: 7200 })).toBe(600);
        expect(model.ResolveConnectionDurationSeconds({ connectionMaxSeconds: 300 })).toBe(300);
        await session.Close();
    });

    it('marks timed-out reconnect attempt as Abandoned and aborts its Signal before starting Attempt 2 (#7, #21)', async () => {
        const model = new TestRealtimeModel('test-key');
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
        })) as TestRealtimeSession;

        let attempt1Context: RealtimeReconnectContext | undefined;
        let attempt1LateFinishedWhileAbandoned = false;

        session.ReconnectBehavior = async (ctx) => {
            if (ctx.Attempt === 1) {
                attempt1Context = ctx;
                await new Promise<void>((resolve) => setTimeout(resolve, 20_000));
                attempt1LateFinishedWhileAbandoned = ctx.Abandoned;
                return;
            }
        };

        const promise = session.TriggerReconnect('connection-lost');
        // Advance past the 15s attempt 1 timeout + 1s retry delay
        await vi.advanceTimersByTimeAsync(16_500);
        const ok = await promise;

        expect(ok).toBe(true);
        expect(session.ReconnectContexts).toHaveLength(2);
        expect(attempt1Context?.Abandoned).toBe(true);
        expect(attempt1Context?.Signal.aborted).toBe(true);

        // Advance the remaining 4s of attempt 1's late timer and verify it saw Abandoned = true
        await vi.advanceTimersByTimeAsync(5_000);
        expect(attempt1LateFinishedWhileAbandoned).toBe(true);
        await session.Close();
    });

    it('marks in-flight reconnect attempt as Abandoned when Close() is called during reconnect (#21)', async () => {
        const model = new TestRealtimeModel('test-key');
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
        })) as TestRealtimeSession;

        let capturedContext: RealtimeReconnectContext | undefined;
        session.ReconnectBehavior = async (ctx) => {
            capturedContext = ctx;
            await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
        };

        const promise = session.TriggerReconnect('connection-lost');
        await vi.advanceTimersByTimeAsync(1_000);
        expect(capturedContext?.Abandoned).toBe(false);

        await session.Close();
        expect(capturedContext?.Abandoned).toBe(true);
        expect(capturedContext?.Signal.aborted).toBe(true);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(await promise).toBe(false);
        expect(session.Errors).toHaveLength(0);
    });

    it('trips the rapid-reconnect circuit breaker with code reconnect-loop-breaker (#18, #21)', async () => {
        const model = new TestRealtimeModel('test-key');
        const session = (await model.StartSession({
            Model: 'test',
            SystemPrompt: 'sys',
        })) as TestRealtimeSession;

        for (let i = 0; i < 5; i++) {
            const ok = await session.TriggerReconnect('connection-lost');
            expect(ok).toBe(true);
        }
        const sixthOk = await session.TriggerReconnect('connection-lost');
        expect(sixthOk).toBe(false);
        expect(session.Errors).toHaveLength(1);
        expect(session.Errors[0].Code).toBe('reconnect-loop-breaker');
        expect(session.Errors[0].Error.Fatal).toBe(true);
        await session.Close();
    });
});
