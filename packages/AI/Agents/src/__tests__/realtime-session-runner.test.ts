/**
 * Tests for {@link RealtimeSessionRunner}.
 *
 * Uses a {@link MockRealtimeSession} / {@link MockRealtimeModel} that capture the registered
 * handlers + tools and expose `fire*` helpers so a test can drive provider events deterministically
 * — no network, no DB, no real timers (debounce is exercised with `vi.useFakeTimers`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeToolDefinition
} from '@memberjunction/ai';
import {
    RealtimeSessionRunner,
    RealtimeSessionRunnerDeps,
    DelegateToTargetRequest,
    DelegatedResult,
    ToolExecutionResult,
    INVOKE_TARGET_AGENT_TOOL_NAME
} from '../realtime/realtime-session-runner';

// ════════════════════════════════════════════════════════════════════
// Mock realtime model + session
// ════════════════════════════════════════════════════════════════════

/**
 * Mock duplex session: captures registered tools + handlers and exposes `fire*` helpers so the
 * test can synchronously simulate inbound provider frames.
 */
class MockRealtimeSession implements IRealtimeSession {
    public RegisteredTools: RealtimeToolDefinition[] = [];
    public Closed = false;
    public CloseError: Error | null = null;

    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;

    SendInput(_chunk: ArrayBuffer): void { /* no-op for tests */ }

    async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.RegisteredTools = tools;
    }

    OnOutput(_handler: (chunk: ArrayBuffer) => void): void { /* not exercised here */ }
    OnTranscript(handler: (t: RealtimeTranscript) => void): void { this.transcriptHandler = handler; }
    OnToolCall(handler: (call: RealtimeToolCall) => void): void { this.toolCallHandler = handler; }
    OnInterruption(handler: () => void): void { this.interruptionHandler = handler; }
    OnUsage(handler: (u: RealtimeUsage) => void): void { this.usageHandler = handler; }

    async Close(): Promise<void> {
        if (this.CloseError) throw this.CloseError;
        this.Closed = true;
    }

    // --- test drivers ---
    fireTranscript(t: RealtimeTranscript): void { this.transcriptHandler?.(t); }
    fireToolCall(call: RealtimeToolCall): void { this.toolCallHandler?.(call); }
    fireUsage(u: RealtimeUsage): void { this.usageHandler?.(u); }
    fireInterruption(): void { this.interruptionHandler?.(); }

    hasInterruptionHandler(): boolean { return this.interruptionHandler !== null; }
}

/**
 * Mock model whose StartSession returns the supplied mock session and records the params.
 */
class MockRealtimeModel extends BaseRealtimeModel {
    public LastParams: RealtimeSessionParams | null = null;
    public StartError: Error | null = null;

    constructor(private mockSession: MockRealtimeSession) {
        // BaseModel's constructor takes an apiKey string; a dummy is fine for the mock.
        super('mock-api-key');
    }

    async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        if (this.StartError) throw this.StartError;
        this.LastParams = params;
        return this.mockSession;
    }
}

// ════════════════════════════════════════════════════════════════════
// Test harness
// ════════════════════════════════════════════════════════════════════

interface Harness {
    session: MockRealtimeSession;
    model: MockRealtimeModel;
    deps: RealtimeSessionRunnerDeps;
    delegateSpy: ReturnType<typeof vi.fn>;
    executeToolSpy: ReturnType<typeof vi.fn>;
    persistSpy: ReturnType<typeof vi.fn>;
    checkpointSpy: ReturnType<typeof vi.fn>;
    capturedDelegateRequests: DelegateToTargetRequest[];
}

function buildHarness(overrides: Partial<RealtimeSessionRunnerDeps> = {}): Harness {
    const session = new MockRealtimeSession();
    const model = new MockRealtimeModel(session);
    const capturedDelegateRequests: DelegateToTargetRequest[] = [];

    const delegateSpy = vi.fn(async (req: DelegateToTargetRequest): Promise<DelegatedResult> => {
        capturedDelegateRequests.push(req);
        return { CallID: req.CallID, Success: true, Output: 'done' };
    });
    const executeToolSpy = vi.fn(async (call: RealtimeToolCall): Promise<ToolExecutionResult> => {
        return { CallID: call.CallID, Success: true, Output: 'tool-ok' };
    });
    const persistSpy = vi.fn(async (_t: RealtimeTranscript): Promise<void> => undefined);
    const checkpointSpy = vi.fn(async (_u: RealtimeUsage): Promise<void> => undefined);

    const deps: RealtimeSessionRunnerDeps = {
        Model: model,
        SessionParams: { Model: 'mock-realtime', SystemPrompt: 'You are the voice for Sage.' },
        DelegateToTarget: delegateSpy,
        ExecuteTool: executeToolSpy,
        PersistTranscript: persistSpy,
        CheckpointUsage: checkpointSpy,
        UsageCheckpointDebounceMs: 5000,
        ...overrides
    };

    return { session, model, deps, delegateSpy, executeToolSpy, persistSpy, checkpointSpy, capturedDelegateRequests };
}

describe('RealtimeSessionRunner', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    // ── Tool set ──────────────────────────────────────────────────────

    describe('tool set (target-independent)', () => {
        it('always registers the invoke-target-agent tool', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            const names = h.session.RegisteredTools.map((t) => t.Name);
            expect(names).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
            expect(names[0]).toBe(INVOKE_TARGET_AGENT_TOOL_NAME);
            await runner.Stop();
        });

        it('registers extra tools after the invoke-target-agent tool', async () => {
            const extra: RealtimeToolDefinition = {
                Name: 'ShowChart',
                Description: 'Render a chart',
                ParametersSchema: { type: 'object', properties: {} }
            };
            const h = buildHarness({ ExtraTools: [extra] });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            const names = h.session.RegisteredTools.map((t) => t.Name);
            expect(names).toEqual([INVOKE_TARGET_AGENT_TOOL_NAME, 'ShowChart']);
            await runner.Stop();
        });

        it('passes the tool set through StartSession params', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            expect(h.model.LastParams?.Tools?.[0]?.Name).toBe(INVOKE_TARGET_AGENT_TOOL_NAME);
            await runner.Stop();
        });
    });

    // ── Tool-call routing ─────────────────────────────────────────────

    describe('tool-call routing', () => {
        it('routes invoke-target-agent to DelegateToTarget with an abort signal', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({
                CallID: 'call-1',
                ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
                Arguments: '{"request":"do work"}'
            });
            await Promise.resolve(); // let the async handler settle

            expect(h.delegateSpy).toHaveBeenCalledTimes(1);
            expect(h.executeToolSpy).not.toHaveBeenCalled();
            const req = h.capturedDelegateRequests[0];
            expect(req.CallID).toBe('call-1');
            expect(req.Arguments).toBe('{"request":"do work"}');
            expect(req.AbortSignal).toBeInstanceOf(AbortSignal);
            expect(req.AbortSignal.aborted).toBe(false);
            await runner.Stop();
        });

        it('routes a non-target tool call to ExecuteTool', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({ CallID: 'call-2', ToolName: 'ShowChart', Arguments: '{}' });
            await Promise.resolve();

            expect(h.executeToolSpy).toHaveBeenCalledTimes(1);
            expect(h.delegateSpy).not.toHaveBeenCalled();
            expect(h.executeToolSpy.mock.calls[0][0].ToolName).toBe('ShowChart');
            await runner.Stop();
        });
    });

    // ── Transcript persistence ────────────────────────────────────────

    describe('transcript persistence', () => {
        it('persists each transcript turn and counts it', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireTranscript({ Role: 'user', Text: 'hi', IsFinal: true });
            h.session.fireTranscript({ Role: 'assistant', Text: 'hello', IsFinal: true });
            await Promise.resolve();
            await Promise.resolve();

            expect(h.persistSpy).toHaveBeenCalledTimes(2);
            const result = await runner.Stop();
            expect(result.TranscriptTurnCount).toBe(2);
        });
    });

    // ── Usage accumulation + debounced checkpoint ─────────────────────

    describe('usage accumulation + debounced checkpoint', () => {
        it('accumulates deltas and flushes one cumulative checkpoint after the debounce window', async () => {
            vi.useFakeTimers();
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireUsage({ InputTokens: 10, OutputTokens: 5 });
            h.session.fireUsage({ InputTokens: 3, OutputTokens: 2 });
            // Before the window elapses, no checkpoint yet.
            expect(h.checkpointSpy).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(5000);

            expect(h.checkpointSpy).toHaveBeenCalledTimes(1);
            expect(h.checkpointSpy.mock.calls[0][0]).toEqual({ InputTokens: 13, OutputTokens: 7 });
            await runner.Stop();
        });

        it('coalesces rapid deltas into a single flush', async () => {
            vi.useFakeTimers();
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            for (let i = 0; i < 5; i++) {
                h.session.fireUsage({ InputTokens: 1, OutputTokens: 1 });
            }
            await vi.advanceTimersByTimeAsync(5000);

            expect(h.checkpointSpy).toHaveBeenCalledTimes(1);
            expect(h.checkpointSpy.mock.calls[0][0]).toEqual({ InputTokens: 5, OutputTokens: 5 });
            await runner.Stop();
        });

        it('flushes pending usage on close even if the debounce window has not elapsed', async () => {
            vi.useFakeTimers();
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireUsage({ InputTokens: 8, OutputTokens: 4 });
            // Close before the timer fires.
            const result = await runner.Stop();

            expect(h.checkpointSpy).toHaveBeenCalledTimes(1);
            expect(h.checkpointSpy.mock.calls[0][0]).toEqual({ InputTokens: 8, OutputTokens: 4 });
            expect(result.FinalUsage).toEqual({ InputTokens: 8, OutputTokens: 4 });
        });

        it('does not checkpoint when no usage was reported', async () => {
            vi.useFakeTimers();
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            await runner.Stop();
            expect(h.checkpointSpy).not.toHaveBeenCalled();
        });
    });

    // ── Interruption (barge-in) ───────────────────────────────────────

    describe('interruption (barge-in)', () => {
        it('aborts the in-flight delegated controller on interruption', async () => {
            // DelegateToTarget hangs until aborted, so we can observe the signal flip.
            let capturedSignal: AbortSignal | null = null;
            const delegate = vi.fn((req: DelegateToTargetRequest) => {
                capturedSignal = req.AbortSignal;
                return new Promise<DelegatedResult>((resolve) => {
                    req.AbortSignal.addEventListener('abort', () =>
                        resolve({ CallID: req.CallID, Success: false, Output: 'aborted' })
                    );
                });
            });
            const h = buildHarness({ DelegateToTarget: delegate });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({
                CallID: 'call-1',
                ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
                Arguments: '{}'
            });
            await Promise.resolve();
            expect(capturedSignal).not.toBeNull();
            expect(capturedSignal!.aborted).toBe(false);

            h.session.fireInterruption();
            expect(capturedSignal!.aborted).toBe(true);
            await runner.Stop();
        });

        it('is a safe no-op when there is no in-flight delegation', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            expect(() => h.session.fireInterruption()).not.toThrow();
            await runner.Stop();
        });

        it('wires the interruption handler on the session', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            expect(h.session.hasInterruptionHandler()).toBe(true);
            await runner.Stop();
        });
    });

    // ── Lifecycle / finalization ──────────────────────────────────────

    describe('lifecycle', () => {
        it('closes the underlying session on Stop and reports success', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            const result = await runner.Stop();
            expect(h.session.Closed).toBe(true);
            expect(result.Success).toBe(true);
        });

        it('Stop is idempotent (second call does not re-close or double-checkpoint)', async () => {
            vi.useFakeTimers();
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            h.session.fireUsage({ InputTokens: 2, OutputTokens: 1 });
            await runner.Stop();
            await runner.Stop();
            expect(h.checkpointSpy).toHaveBeenCalledTimes(1);
        });

        it('throws if Start is called twice', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            await expect(runner.Start()).rejects.toThrow(/already active/);
            await runner.Stop();
        });

        it('Run returns a failed result if the model fails to start a session', async () => {
            const h = buildHarness();
            h.model.StartError = new Error('socket refused');
            const errorSpy = vi.fn();
            const runner = new RealtimeSessionRunner({ ...h.deps, LogError: errorSpy });
            const result = await runner.Run();
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('socket refused');
            expect(errorSpy).toHaveBeenCalled();
        });

        it('Run reports failure when Close throws but still returns a result', async () => {
            const h = buildHarness();
            h.session.CloseError = new Error('close failed');
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            const result = await runner.Stop();
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('close failed');
        });
    });
});
