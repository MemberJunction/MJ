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
    RealtimeToolDefinition,
    RealtimeSessionError
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
    /** Post-start RegisterTools calls — the runner must NOT make this redundant call. */
    public RegisterToolsCallCount = 0;
    public Closed = false;
    public CloseError: Error | null = null;
    public SentToolResults: { CallID: string; Output: string }[] = [];

    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;

    SendInput(_chunk: ArrayBuffer): void { /* no-op for tests */ }

    async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.RegisterToolsCallCount++;
        this.RegisteredTools = tools;
    }

    OnOutput(_handler: (chunk: ArrayBuffer) => void): void { /* not exercised here */ }
    OnTranscript(handler: (t: RealtimeTranscript) => void): void { this.transcriptHandler = handler; }
    OnToolCall(handler: (call: RealtimeToolCall) => void): void { this.toolCallHandler = handler; }
    OnInterruption(handler: () => void): void { this.interruptionHandler = handler; }
    OnUsage(handler: (u: RealtimeUsage) => void): void { this.usageHandler = handler; }
    OnError(handler: (error: RealtimeSessionError) => void): void { this.errorHandler = handler; }

    async SendToolResult(callID: string, output: string): Promise<void> {
        this.SentToolResults.push({ CallID: callID, Output: output });
    }

    async Close(): Promise<void> {
        if (this.CloseError) throw this.CloseError;
        this.Closed = true;
    }

    // --- test drivers ---
    fireTranscript(t: RealtimeTranscript): void { this.transcriptHandler?.(t); }
    fireToolCall(call: RealtimeToolCall): void { this.toolCallHandler?.(call); }
    fireUsage(u: RealtimeUsage): void { this.usageHandler?.(u); }
    fireInterruption(): void { this.interruptionHandler?.(); }
    fireError(error: RealtimeSessionError): void { this.errorHandler?.(error); }

    hasInterruptionHandler(): boolean { return this.interruptionHandler !== null; }
    hasErrorHandler(): boolean { return this.errorHandler !== null; }
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
        it('always registers the invoke-target-agent tool (via StartSession params)', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            const names = (h.model.LastParams?.Tools ?? []).map((t) => t.Name);
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

            const names = (h.model.LastParams?.Tools ?? []).map((t) => t.Name);
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

        it('does NOT make a redundant post-start RegisterTools call (StartSession params are the registration)', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            expect(h.session.RegisterToolsCallCount).toBe(0);
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

    // ── Tool-result round-trip (SendToolResult) ───────────────────────

    // Drains all pending microtasks (real timers are active in this block) so the
    // assertions don't depend on the exact number of async hops between OnToolCall
    // and SendToolResult (the shared RealtimeToolBroker adds an await layer).
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    describe('tool-result round-trip', () => {
        it('sends the serialized delegated result back via SendToolResult after invoke-target', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({
                CallID: 'call-1',
                ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
                Arguments: '{"request":"do work"}'
            });
            // Let the delegate promise and the subsequent SendToolResult hop settle.
            await settle();

            expect(h.session.SentToolResults).toHaveLength(1);
            expect(h.session.SentToolResults[0].CallID).toBe('call-1');
            expect(JSON.parse(h.session.SentToolResults[0].Output)).toEqual({ success: true, output: 'done' });
            await runner.Stop();
        });

        it('sends the serialized tool result back via SendToolResult after a non-target tool', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({ CallID: 'call-2', ToolName: 'ShowChart', Arguments: '{}' });
            await settle();

            expect(h.session.SentToolResults).toHaveLength(1);
            expect(h.session.SentToolResults[0].CallID).toBe('call-2');
            expect(JSON.parse(h.session.SentToolResults[0].Output)).toEqual({ success: true, output: 'tool-ok' });
            await runner.Stop();
        });

        it('sends a structured error result when the delegated run throws', async () => {
            const delegate = vi.fn(async (_req: DelegateToTargetRequest): Promise<DelegatedResult> => {
                throw new Error('target exploded');
            });
            const h = buildHarness({ DelegateToTarget: delegate });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({
                CallID: 'call-err',
                ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
                Arguments: '{}'
            });
            await settle();

            expect(h.session.SentToolResults).toHaveLength(1);
            expect(h.session.SentToolResults[0].CallID).toBe('call-err');
            expect(JSON.parse(h.session.SentToolResults[0].Output)).toEqual({ success: false, error: 'target exploded' });
            await runner.Stop();
        });

        it('sends a structured error result when a non-target tool throws', async () => {
            const executeTool = vi.fn(async (_call: RealtimeToolCall): Promise<ToolExecutionResult> => {
                throw new Error('tool exploded');
            });
            const h = buildHarness({ ExecuteTool: executeTool });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireToolCall({ CallID: 'call-err2', ToolName: 'ShowChart', Arguments: '{}' });
            await settle();

            expect(h.session.SentToolResults).toHaveLength(1);
            expect(h.session.SentToolResults[0].CallID).toBe('call-err2');
            expect(JSON.parse(h.session.SentToolResults[0].Output)).toEqual({ success: false, error: 'tool exploded' });
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

        it('re-marks usage dirty when a checkpoint fails so the close flush retries it (nothing lost)', async () => {
            vi.useFakeTimers();
            const errorSpy = vi.fn();
            const h = buildHarness({ LogError: errorSpy });
            // First flush fails; the retry (at close) succeeds.
            h.checkpointSpy.mockRejectedValueOnce(new Error('db hiccup'));
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireUsage({ InputTokens: 6, OutputTokens: 3 });
            await vi.advanceTimersByTimeAsync(5000); // debounce fires → checkpoint throws

            expect(h.checkpointSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('checkpointing usage'));

            const result = await runner.Stop(); // close flush retries the SAME cumulative total
            expect(h.checkpointSpy).toHaveBeenCalledTimes(2);
            expect(h.checkpointSpy.mock.calls[1][0]).toEqual({ InputTokens: 6, OutputTokens: 3 });
            expect(result.FinalUsage).toEqual({ InputTokens: 6, OutputTokens: 3 });
        });
    });

    // ── Failure containment ───────────────────────────────────────────

    describe('failure containment', () => {
        it('logs (does not throw) and does not count a transcript turn whose persistence fails', async () => {
            const errorSpy = vi.fn();
            const persist = vi.fn(async (_t: RealtimeTranscript) => {
                throw new Error('detail save failed');
            });
            const h = buildHarness({ PersistTranscript: persist, LogError: errorSpy });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireTranscript({ Role: 'user', Text: 'hi', IsFinal: true });
            await settle();

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('persisting transcript'));
            const result = await runner.Stop();
            expect(result.TranscriptTurnCount).toBe(0);
            expect(result.Success).toBe(true); // a persistence failure never fails the session
        });

        it('logs (does not throw) when SendToolResult fails on the live session', async () => {
            const errorSpy = vi.fn();
            const h = buildHarness({ LogError: errorSpy });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            h.session.SendToolResult = vi.fn(async () => {
                throw new Error('socket gone');
            });

            h.session.fireToolCall({ CallID: 'call-1', ToolName: 'ShowChart', Arguments: '{}' });
            await settle();

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('sending tool result'));
            const result = await runner.Stop();
            expect(result.Success).toBe(true);
        });
    });

    // ── Stop aborts in-flight work ────────────────────────────────────

    describe('Stop with in-flight delegation', () => {
        it('aborts a still-running delegated run before tearing the session down', async () => {
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

            const result = await runner.Stop();
            expect(capturedSignal!.aborted).toBe(true);
            expect(result.Success).toBe(true);
        });

        it('Stop before Start is a safe no-op returning a successful empty result', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            const result = await runner.Stop();
            expect(result.Success).toBe(true);
            expect(result.TranscriptTurnCount).toBe(0);
            expect(result.FinalUsage).toEqual({ InputTokens: 0, OutputTokens: 0 });
            expect(h.session.Closed).toBe(false); // never opened, never closed
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

    // ── Session errors (OnError consumption) ──────────────────────────

    describe('session errors (OnError)', () => {
        it('wires the error handler on the session', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            expect(h.session.hasErrorHandler()).toBe(true);
            await runner.Stop();
        });

        it('a FATAL error finalizes the session cleanly via Stop (close + final usage flush)', async () => {
            const errors: string[] = [];
            const h = buildHarness({ LogError: (msg) => errors.push(msg) });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            h.session.fireUsage({ InputTokens: 7, OutputTokens: 3 });

            h.session.fireError({ Message: 'ephemeral token expired', Code: 'token_expired', Fatal: true });
            await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget Stop() settle

            expect(h.session.Closed).toBe(true);
            // the close-path flush persisted the accumulated usage — nothing lost
            expect(h.checkpointSpy).toHaveBeenCalledWith({ InputTokens: 7, OutputTokens: 3 });
            expect(errors.some((m) => m.includes('Fatal') && m.includes('ephemeral token expired') && m.includes('[token_expired]'))).toBe(true);
        });

        it('a fatal error followed by an explicit Stop stays idempotent', async () => {
            const h = buildHarness();
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireError({ Message: 'socket dropped', Fatal: true });
            await new Promise((r) => setTimeout(r, 0));
            expect(h.session.Closed).toBe(true);

            const result = await runner.Stop(); // second finalization is a safe no-op
            expect(result.Success).toBe(true);
        });

        it('a NON-FATAL error is logged and the session continues', async () => {
            const errors: string[] = [];
            const h = buildHarness({ LogError: (msg) => errors.push(msg) });
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();

            h.session.fireError({ Message: 'transient provider hiccup', Fatal: false });
            await Promise.resolve();

            expect(h.session.Closed).toBe(false);
            expect(errors.some((m) => m.includes('non-fatal') && m.includes('transient provider hiccup'))).toBe(true);

            // the session is still fully usable — e.g. transcripts keep persisting
            h.session.fireTranscript({ Role: 'assistant', Text: 'still here', IsFinal: true });
            await new Promise((r) => setTimeout(r, 0));
            expect(h.persistSpy).toHaveBeenCalledTimes(1);
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

    // ── Delegated-run progress narration (server-bridged B3) ─────────

    describe('delegated-run progress narration', () => {
        /** Mock session that ALSO implements the optional narration capabilities. */
        class NarratingMockSession extends MockRealtimeSession {
            public ContextNotes: string[] = [];
            public SpokenUpdates: string[] = [];
            SendContextNote(text: string): void { this.ContextNotes.push(text); }
            RequestSpokenUpdate(instructions: string): void { this.SpokenUpdates.push(instructions); }
        }

        interface NarrationHarness {
            session: NarratingMockSession;
            deps: RealtimeSessionRunnerDeps;
            /** Resolves the hanging delegate (the delegated run "finishes"). */
            finishDelegate: (result?: Partial<DelegatedResult>) => void;
            /** The OnProgress callback the runner threaded into the delegate request. */
            progress: () => NonNullable<DelegateToTargetRequest['OnProgress']>;
        }

        /** Harness whose delegate HANGS until the test finishes it, capturing the threaded OnProgress. */
        function buildNarrationHarness(overrides: Partial<RealtimeSessionRunnerDeps> = {}): NarrationHarness {
            const session = new NarratingMockSession();
            const model = new MockRealtimeModel(session);
            let request: DelegateToTargetRequest | null = null;
            let resolveDelegate: ((r: DelegatedResult) => void) | null = null;

            const deps: RealtimeSessionRunnerDeps = {
                Model: model,
                SessionParams: { Model: 'mock-realtime', SystemPrompt: 'You are the voice for Sage.' },
                DelegateToTarget: vi.fn(
                    (req: DelegateToTargetRequest) =>
                        new Promise<DelegatedResult>((resolve) => {
                            request = req;
                            resolveDelegate = resolve;
                        })
                ),
                ExecuteTool: vi.fn(async (call: RealtimeToolCall): Promise<ToolExecutionResult> => ({
                    CallID: call.CallID, Success: true, Output: 'tool-ok'
                })),
                PersistTranscript: vi.fn(async () => undefined),
                CheckpointUsage: vi.fn(async () => undefined),
                ...overrides
            };

            return {
                session,
                deps,
                finishDelegate: (result = {}) =>
                    resolveDelegate?.({ CallID: request?.CallID ?? 'c1', Success: true, Output: 'done', ...result }),
                progress: () => {
                    if (!request?.OnProgress) {
                        throw new Error('the runner did not thread OnProgress into the delegate request');
                    }
                    return request.OnProgress;
                }
            };
        }

        /** Starts the runner and fires one invoke-target tool call whose delegate hangs. */
        async function startWithHangingDelegation(h: NarrationHarness): Promise<RealtimeSessionRunner> {
            const runner = new RealtimeSessionRunner(h.deps);
            await runner.Start();
            h.session.fireToolCall({ CallID: 'call-1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: '{"request":"work"}' });
            await Promise.resolve(); // let the async tool-call handler reach the hanging delegate
            await Promise.resolve();
            return runner;
        }

        const significant = (message: string): Parameters<NonNullable<DelegateToTargetRequest['OnProgress']>>[0] =>
            ({ step: 'prompt_execution', message });

        it('threads OnProgress into the delegate request and injects EVERY significant event as a context note', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Analyzing the request'));
            h.progress()({ step: 'action_execution', message: 'Running the query', percentage: 40 });

            expect(h.session.ContextNotes).toEqual([
                '[delegated-agent progress] Analyzing the request',
                '[delegated-agent progress] Running the query'
            ]);

            h.finishDelegate();
            await runner.Stop();
        });

        it('drops insignificant steps (initialization noise) — no note, no spoken update', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()({ step: 'initialization', message: 'warming up' });
            h.progress()({ step: 'finalization', message: 'cleaning up' });
            await vi.advanceTimersByTimeAsync(30000);

            expect(h.session.ContextNotes).toEqual([]);
            expect(h.session.SpokenUpdates).toEqual([]);

            h.finishDelegate();
            await runner.Stop();
        });

        it('speaks the FIRST update no earlier than ~5s into the burst, with the digest aggregated', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Analyzing the request'));
            h.progress()(significant('Gathering data'));

            await vi.advanceTimersByTimeAsync(4999);
            expect(h.session.SpokenUpdates).toEqual([]);

            await vi.advanceTimersByTimeAsync(1);
            expect(h.session.SpokenUpdates).toHaveLength(1);
            expect(h.session.SpokenUpdates[0]).toContain('Analyzing the request → Gathering data');

            h.finishDelegate();
            await runner.Stop();
        });

        it('spaces SUBSEQUENT updates at >=8s and aggregates the flood between them', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Step one'));
            await vi.advanceTimersByTimeAsync(5000); // first update fires
            expect(h.session.SpokenUpdates).toHaveLength(1);

            h.progress()(significant('Step two'));
            h.progress()(significant('Step three'));
            await vi.advanceTimersByTimeAsync(7999);
            expect(h.session.SpokenUpdates).toHaveLength(1); // spacing floor not reached

            await vi.advanceTimersByTimeAsync(1);
            expect(h.session.SpokenUpdates).toHaveLength(2);
            expect(h.session.SpokenUpdates[1]).toContain('Step two → Step three');

            h.finishDelegate();
            await runner.Stop();
        });

        it('uses the documented built-in FIRST-PERSON fallback wording when no template is supplied', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Crunching the numbers'));
            await vi.advanceTimersByTimeAsync(5000);

            const spoken = h.session.SpokenUpdates[0];
            expect(spoken).toContain('Crunching the numbers');
            expect(spoken).toContain('FIRST PERSON');
            expect(spoken).toContain('spoken update #1');

            h.finishDelegate();
            await runner.Stop();
        });

        it('substitutes the DB template ({{ progressMessage }} / {{ updateNumber }}) when supplied', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness({
                NarrationInstructionsTemplate: 'Update {{ updateNumber }}: narrate "{{ progressMessage }}" briefly.'
            });
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Loading accounts'));
            await vi.advanceTimersByTimeAsync(5000);

            expect(h.session.SpokenUpdates).toEqual(['Update 1: narrate "Loading accounts" briefly.']);

            h.finishDelegate();
            await runner.Stop();
        });

        it('feature-detects the optional capabilities — a session WITHOUT them narrates nothing and never throws', async () => {
            vi.useFakeTimers();
            // Build a harness whose session is the PLAIN mock (no SendContextNote / RequestSpokenUpdate).
            const plainSession = new MockRealtimeSession();
            let request: DelegateToTargetRequest | null = null;
            let resolveDelegate: ((r: DelegatedResult) => void) | null = null;
            const deps: RealtimeSessionRunnerDeps = {
                Model: new MockRealtimeModel(plainSession),
                SessionParams: { Model: 'mock-realtime', SystemPrompt: 'voice' },
                DelegateToTarget: vi.fn(
                    (req: DelegateToTargetRequest) =>
                        new Promise<DelegatedResult>((resolve) => {
                            request = req;
                            resolveDelegate = resolve;
                        })
                ),
                ExecuteTool: vi.fn(),
                PersistTranscript: vi.fn(async () => undefined),
                CheckpointUsage: vi.fn(async () => undefined)
            };
            const runner = new RealtimeSessionRunner(deps);
            await runner.Start();
            plainSession.fireToolCall({ CallID: 'c1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: '{}' });
            await Promise.resolve();
            await Promise.resolve();

            expect(() => request?.OnProgress?.(significant('progress on a capability-less provider'))).not.toThrow();
            await vi.advanceTimersByTimeAsync(30000); // no timer should have produced anything

            resolveDelegate?.({ CallID: 'c1', Success: true, Output: 'done' });
            await runner.Stop();
        });

        it('cancels a pending spoken update when the delegation finishes first (the result is about to be voiced)', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Almost done'));
            h.finishDelegate(); // result lands BEFORE the 5s anchor
            await Promise.resolve(); // let the delegation's finally (narration cancel) settle
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(30000);

            expect(h.session.SpokenUpdates).toEqual([]);
            expect(h.session.SentToolResults).toHaveLength(1); // the real result was still relayed

            await runner.Stop();
        });

        it('cancels a pending spoken update on barge-in (the user took the floor)', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness();
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('Working on it'));
            h.session.fireInterruption(); // barge-in — also aborts the broker's in-flight controller
            await vi.advanceTimersByTimeAsync(30000);

            expect(h.session.SpokenUpdates).toEqual([]);

            h.finishDelegate();
            await runner.Stop();
        });

        it('numbers updates across the burst (the template sees update 2 on the second utterance)', async () => {
            vi.useFakeTimers();
            const h = buildNarrationHarness({
                NarrationInstructionsTemplate: '#{{ updateNumber }}: {{ progressMessage }}'
            });
            const runner = await startWithHangingDelegation(h);

            h.progress()(significant('one'));
            await vi.advanceTimersByTimeAsync(5000);
            h.progress()(significant('two'));
            await vi.advanceTimersByTimeAsync(8000);

            expect(h.session.SpokenUpdates).toEqual(['#1: one', '#2: two']);

            h.finishDelegate();
            await runner.Stop();
        });
    });
});
