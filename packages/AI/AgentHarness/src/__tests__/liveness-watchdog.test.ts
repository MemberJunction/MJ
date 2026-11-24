import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AIPromptRunResult, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { CanonicalizeToolInput, HarnessAgentBase } from '../HarnessAgentBase.js';
import { HarnessAgentType } from '../HarnessAgentType.js';
import { BaseHarnessAdapter } from '../adapters/BaseHarnessAdapter.js';
import { CodexAdapter } from '../adapters/CodexAdapter.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from '../sandbox/SandboxExecutor.js';
import {
    HarnessActivityHeartbeatInfo,
    HarnessCapabilities,
    HarnessRunConfig,
    HarnessSessionConfig,
    HarnessTurnEvent,
    HarnessTurnResult,
} from '../types.js';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

/** Manual push-driven async iterable for deterministic stream testing. */
class PushStream<T> implements AsyncIterable<T> {
    private readonly buffer: T[] = [];
    private resolver: ((value: IteratorResult<T, undefined>) => void) | null = null;
    private closed = false;

    public Push(item: T): void {
        if (this.closed) {
            return;
        }
        if (this.resolver) {
            const resolve = this.resolver;
            this.resolver = null;
            resolve({ value: item, done: false });
            return;
        }
        this.buffer.push(item);
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.resolver) {
            const resolve = this.resolver;
            this.resolver = null;
            resolve({ value: undefined, done: true });
        }
    }

    public [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
        return {
            next: (): Promise<IteratorResult<T, undefined>> => {
                if (this.buffer.length > 0) {
                    return Promise.resolve({ value: this.buffer.shift()!, done: false });
                }
                if (this.closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise<IteratorResult<T, undefined>>((resolve) => {
                    this.resolver = resolve;
                });
            },
            return: (): Promise<IteratorResult<T, undefined>> => {
                this.Close();
                return Promise.resolve({ value: undefined, done: true });
            },
        };
    }
}

/** Controllable fake adapter for exercising HarnessAgentBase.runTurn directly. */
class ControllableAdapter extends BaseHarnessAdapter {
    public readonly Stream = new PushStream<HarnessTurnEvent>();
    public EndSessionCalls = 0;
    public TailLines: string[] = [];
    public CloseStreamOnEndSession = true;

    public async StartSession(_config: HarnessSessionConfig): Promise<void> {}

    public RunTurn(_input: string): AsyncIterable<HarnessTurnEvent> {
        return this.Stream;
    }

    public async RespondToPermission(): Promise<void> {}

    public async EndSession(): Promise<void> {
        this.EndSessionCalls++;
        if (this.CloseStreamOnEndSession) {
            this.Stream.Close();
        }
    }

    public override get RecentOutputLines(): readonly string[] {
        return [...this.TailLines];
    }

    public get Capabilities(): HarnessCapabilities {
        return { PermissionHooks: false, SessionResume: false } as HarnessCapabilities;
    }
}

/** Controllable SandboxExecutor backed by PushStreams for BaseCliHarnessAdapter tests. */
class ControllableCliExecutor implements SandboxExecutor {
    public readonly Stdout = new PushStream<string>();
    public readonly Stderr = new PushStream<string>();
    public KillCalls = 0;
    private resolveExit: ((code: number | null) => void) | null = null;
    private readonly exitPromise: Promise<number | null>;

    public constructor() {
        this.exitPromise = new Promise<number | null>((resolve) => {
            this.resolveExit = resolve;
        });
    }

    public Run(_spec: HarnessProcessSpec): HarnessProcess {
        return {
            Stdout: this.Stdout,
            Stderr: this.Stderr,
            ExitCode: this.exitPromise,
            Kill: () => {
                this.KillCalls++;
                this.Stdout.Close();
                this.Stderr.Close();
                this.resolveExit?.(143);
            },
        };
    }

    public Complete(exitCode = 0): void {
        this.Stdout.Close();
        this.Stderr.Close();
        this.resolveExit?.(exitCode);
    }
}

class WatchdogTestAgent extends HarnessAgentBase {
    public AttachAdapter(adapter: BaseHarnessAdapter, env: Record<string, string> = {}): void {
        this.adapter = adapter;
        this.sessionEnvironment = env;
    }

    public RunTurnForTest(
        input: string,
        configOrMaxWallClock?: number | HarnessRunConfig,
    ): Promise<HarnessTurnResult> {
        return this.runTurn(input, configOrMaxWallClock);
    }

    public DetermineNextStepForTest<P>(
        params: ExecuteAgentParams<Record<string, string>, P>,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
    ) {
        return this.determineNextStep(params, agentType, promptResult, currentPayload);
    }
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('CanonicalizeToolInput', () => {
    it('sorts object keys recursively while preserving array order', () => {
        const a = JSON.stringify({ z: 1, nested: { b: true, a: [2, 1] }, a: 'hello' });
        const b = JSON.stringify({ a: 'hello', nested: { a: [2, 1], b: true }, z: 1 });
        const c = JSON.stringify({ a: 'hello', nested: { a: [1, 2], b: true }, z: 1 });

        expect(CanonicalizeToolInput(a)).toBe(CanonicalizeToolInput(b));
        expect(CanonicalizeToolInput(a)).not.toBe(CanonicalizeToolInput(c));
    });

    it('falls back to trimmed raw text for non-JSON strings and empty for undefined', () => {
        expect(CanonicalizeToolInput(undefined)).toBe('');
        expect(CanonicalizeToolInput('   ')).toBe('');
        expect(CanonicalizeToolInput('  npm test --watch=false  ')).toBe('npm test --watch=false');
    });
});

describe('HarnessAgentBase liveness watchdog & loop circuit breaker', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('triggers idle stall when stream goes silent past maxIdleSeconds, includes tail diagnostics, scrubs secrets, and ends session', async () => {
        vi.useFakeTimers();
        const adapter = new ControllableAdapter();
        adapter.TailLines = [
            '[stderr] Retrying API request with token sk-super-secret-value-1234',
            '[stdout] Waiting for compiler lock...',
        ];
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter, { OPENAI_API_KEY: 'sk-super-secret-value-1234' });

        const turnPromise = agent.RunTurnForTest('build app', {
            limits: { maxIdleSeconds: 5 },
        });

        // Emit one initial event, then go silent past maxIdleSeconds.
        adapter.Stream.Push({ Type: 'assistant-text', Text: 'Starting build' });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(4999);
        expect(adapter.EndSessionCalls).toBe(0);

        await vi.advanceTimersByTimeAsync(2);
        const result = await turnPromise;

        expect(result.Stalled).toBe(true);
        expect(result.TimedOut).toBeUndefined();
        expect(result.StallReason).toContain('limits.maxIdleSeconds (5s)');
        expect(result.StallReason).toContain('last event: assistant-text');
        expect(result.StallReason).toContain('Waiting for compiler lock...');
        expect(result.StallReason).not.toContain('sk-super-secret-value-1234');
        expect(result.ErrorMessage).toContain('limits.maxIdleSeconds (5s)');
        expect(result.ErrorMessage).not.toContain('sk-super-secret-value-1234');
        expect(adapter.EndSessionCalls).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts cleanly on idle timeout even if the underlying adapter stream ignores EndSession and stays wedged', async () => {
        vi.useFakeTimers();
        const adapter = new ControllableAdapter();
        adapter.CloseStreamOnEndSession = false;
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('wedged turn', {
            limits: { maxIdleSeconds: 3 },
        });

        await vi.advanceTimersByTimeAsync(3001);
        const result = await turnPromise;

        expect(result.Stalled).toBe(true);
        expect(result.StallReason).toContain('limits.maxIdleSeconds (3s)');
        expect(adapter.EndSessionCalls).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resets the rolling idle timer on every HarnessTurnEvent so active turns exceeding maxIdleSeconds succeed', async () => {
        vi.useFakeTimers();
        const adapter = new ControllableAdapter();
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('long active turn', {
            limits: { maxIdleSeconds: 5, maxWallClockSeconds: 60 },
        });

        // Total duration will be 12s (> maxIdleSeconds 5s), with an event every 3s.
        await vi.advanceTimersByTimeAsync(3000);
        adapter.Stream.Push({ Type: 'thinking-delta', Text: 'analyzing...' });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(3000);
        adapter.Stream.Push({ Type: 'sandbox-activity', Description: 'running tests' });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(3000);
        adapter.Stream.Push({
            Type: 'liveness-heartbeat',
            Source: 'stdout',
            Timestamp: new Date().toISOString(),
        });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(3000);
        adapter.Stream.Push({ Type: 'usage', InputTokens: 100, OutputTokens: 50, CostUsd: 0.01 });
        adapter.Stream.Push({ Type: 'turn-complete', RawText: '{"taskComplete":true,"message":"ok"}' });
        adapter.Stream.Close();

        const result = await turnPromise;

        expect(result.Stalled).toBeUndefined();
        expect(result.StallReason).toBeUndefined();
        expect(result.TimedOut).toBeUndefined();
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.RawText).toBe('{"taskComplete":true,"message":"ok"}');
        expect(result.InputTokens).toBe(100);
        expect(result.OutputTokens).toBe(50);
        expect(adapter.EndSessionCalls).toBe(0);
        // Zero leaked timers after normal completion.
        expect(vi.getTimerCount()).toBe(0);
    });

    it('still enforces maxWallClockSeconds when stream stays active past the hard wall-clock ceiling', async () => {
        vi.useFakeTimers();
        const adapter = new ControllableAdapter();
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('runaway active turn', {
            limits: { maxIdleSeconds: 5, maxWallClockSeconds: 10 },
        });

        await vi.advanceTimersByTimeAsync(4000);
        adapter.Stream.Push({ Type: 'liveness-heartbeat', Source: 'stdout' });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(4000);
        adapter.Stream.Push({ Type: 'liveness-heartbeat', Source: 'stdout' });
        await flushMicrotasks();

        await vi.advanceTimersByTimeAsync(2005);
        const result = await turnPromise;

        expect(result.TimedOut).toBe(true);
        expect(result.Stalled).toBeUndefined();
        expect(result.ErrorMessage).toContain('limits.maxWallClockSeconds (10s)');
        expect(adapter.EndSessionCalls).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('detects consecutive identical tool calls despite differing JSON key order and intervening non-tool events', async () => {
        const adapter = new ControllableAdapter();
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('looping turn', {
            limits: { maxConsecutiveIdenticalToolCalls: 3 },
        });

        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: 'tc-1',
            ToolName: 'run_command',
            ArgumentsJson: '{"cmd":"pnpm test","flags":{"ci":true,"silent":false}}',
        });
        adapter.Stream.Push({
            Type: 'tool-result',
            ToolCallId: 'tc-1',
            ToolName: 'run_command',
            Output: 'exit 1',
            IsError: true,
        });
        adapter.Stream.Push({ Type: 'thinking-delta', Text: 'retrying same command' });
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: 'tc-2',
            ToolName: 'run_command',
            ArgumentsJson: '{"flags":{"silent":false,"ci":true},"cmd":"pnpm test"}',
        });
        adapter.Stream.Push({
            Type: 'tool-result',
            ToolCallId: 'tc-2',
            ToolName: 'run_command',
            Output: 'exit 1',
            IsError: true,
        });
        // Third consecutive canonically identical call triggers the circuit breaker.
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: 'tc-3',
            ToolName: 'run_command',
            ArgumentsJson: '{ "cmd": "pnpm test", "flags": { "ci": true, "silent": false } }',
        });

        const result = await turnPromise;

        expect(result.Stalled).toBe(true);
        expect(result.TimedOut).toBeUndefined();
        expect(result.StallReason).toContain("repeated identical tool call 'run_command' 3 consecutive times");
        expect(result.StallReason).toContain('limits.maxConsecutiveIdenticalToolCalls=3');
        expect(result.ErrorMessage).toContain('limits.maxConsecutiveIdenticalToolCalls=3');
        expect(adapter.EndSessionCalls).toBe(1);
    });

    it('resets the consecutive identical tool call counter when toolName or canonical input changes', async () => {
        const adapter = new ControllableAdapter();
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('varied tool calls', {
            limits: { maxConsecutiveIdenticalToolCalls: 3 },
        });

        // Two identical calls -> count=2 (<3)
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '1',
            ToolName: 'read_file',
            ArgumentsJson: '{"path":"a.ts"}',
        });
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '2',
            ToolName: 'read_file',
            ArgumentsJson: '{"path":"a.ts"}',
        });
        // Different input resets counter to 1
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '3',
            ToolName: 'read_file',
            ArgumentsJson: '{"path":"b.ts"}',
        });
        // Different tool name resets counter to 1
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '4',
            ToolName: 'edit_file',
            ArgumentsJson: '{"path":"b.ts"}',
        });
        // Back to first tool twice -> count=2 (<3)
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '5',
            ToolName: 'read_file',
            ArgumentsJson: '{"path":"a.ts"}',
        });
        adapter.Stream.Push({
            Type: 'tool-use-start',
            ToolCallId: '6',
            ToolName: 'read_file',
            ArgumentsJson: '{"path":"a.ts"}',
        });
        adapter.Stream.Push({ Type: 'turn-complete', RawText: '{"taskComplete":true,"message":"done"}' });
        adapter.Stream.Close();

        const result = await turnPromise;

        expect(result.Stalled).toBeUndefined();
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.RawText).toBe('{"taskComplete":true,"message":"done"}');
        expect(adapter.EndSessionCalls).toBe(0);
    });

    it('invokes onActivityHeartbeat throttled by heartbeatIntervalSeconds and tolerates callback errors', async () => {
        vi.useFakeTimers();
        const adapter = new ControllableAdapter();
        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const pulses: HarnessActivityHeartbeatInfo[] = [];
        agent.SetActivityHeartbeatCallback(async (info) => {
            pulses.push(info);
            if (pulses.length === 1) {
                throw new Error('transient lease renewal error');
            }
        });

        const turnPromise = agent.RunTurnForTest('heartbeat turn', {
            limits: { maxIdleSeconds: 30, heartbeatIntervalSeconds: 10 },
        });

        await vi.advanceTimersByTimeAsync(1000);
        adapter.Stream.Push({ Type: 'assistant-text', Text: 'step 1' });
        await flushMicrotasks();

        // Within 10s throttle window -> should NOT fire second pulse.
        await vi.advanceTimersByTimeAsync(5000);
        adapter.Stream.Push({ Type: 'liveness-heartbeat', Source: 'stderr' });
        await flushMicrotasks();

        // Past 10s throttle window -> SHOULD fire second pulse.
        await vi.advanceTimersByTimeAsync(6000);
        adapter.Stream.Push({ Type: 'sandbox-activity', Description: 'compiled' });
        await flushMicrotasks();

        adapter.Stream.Push({ Type: 'turn-complete', RawText: '{"taskComplete":true,"message":"ok"}' });
        adapter.Stream.Close();

        const result = await turnPromise;

        expect(result.Stalled).toBeUndefined();
        expect(result.ErrorMessage).toBeUndefined();
        expect(pulses).toHaveLength(2);
        expect(pulses[0]).toEqual({ ElapsedMs: 1000, LastEventType: 'assistant-text' });
        expect(pulses[1]).toEqual({ ElapsedMs: 12000, LastEventType: 'sandbox-activity' });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('terminates immediately in determineNextStep for idle stall and tool-loop stall without retries', async () => {
        const agent = new WatchdogTestAgent();
        Reflect.set(agent, '_agentTypeInstance', new HarnessAgentType());
        const params = {
            conversationMessages: [],
        } as ExecuteAgentParams<Record<string, string>, Record<string, string>>;
        const agentType = { Name: 'HarnessAgentType' } as MJAIAgentTypeEntity;

        const idleStep = await agent.DetermineNextStepForTest(
            params,
            agentType,
            {
                success: false,
                result: '',
                rawResult: '',
                errorMessage: 'Harness turn stalled: no stream activity for configured limits.maxIdleSeconds (300s).',
            } as AIPromptRunResult,
            {},
        );
        expect(idleStep.step).toBe('Failed');
        expect(idleStep.terminate).toBe(true);

        const loopStep = await agent.DetermineNextStepForTest(
            params,
            agentType,
            {
                success: false,
                result: '',
                rawResult: '',
                errorMessage:
                    "Harness turn stalled: repeated identical tool call 'bash' 6 consecutive times (exceeded limits.maxConsecutiveIdenticalToolCalls=6).",
            } as AIPromptRunResult,
            {},
        );
        expect(loopStep.step).toBe('Failed');
        expect(loopStep.terminate).toBe(true);
    });
});

describe('BaseCliHarnessAdapter liveness heartbeats & rolling output ring buffer', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('resets HarnessAgentBase idle timer from raw non-JSON stdout and stderr lines while stdout JSON is silent', async () => {
        vi.useFakeTimers();
        const executor = new ControllableCliExecutor();
        const adapter = new CodexAdapter();
        adapter.SetLivenessHeartbeatThrottleMs(1000);
        await adapter.StartSession({
            Executor: executor,
            WorkspacePath: '/workspace',
            Environment: {},
        });

        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('build project', {
            limits: { maxIdleSeconds: 5 },
        });

        // 3s: raw non-JSON stdout progress line resets idle timer.
        await vi.advanceTimersByTimeAsync(3000);
        executor.Stdout.Push('⠸ Compiling TypeScript packages...');
        await flushMicrotasks();

        // 6s (3s later): stdout stays silent, stderr emits compiler progress -> resets idle timer!
        await vi.advanceTimersByTimeAsync(3000);
        executor.Stderr.Push('webpack: 65% building modules...');
        await flushMicrotasks();

        // 9s (3s later): unmapped JSON bookkeeping line on stdout -> resets idle timer!
        await vi.advanceTimersByTimeAsync(3000);
        executor.Stdout.Push(JSON.stringify({ type: 'keepalive_ping' }));
        await flushMicrotasks();

        // 11s: actual terminal JSON arrives -> succeeds with zero stall!
        await vi.advanceTimersByTimeAsync(2000);
        executor.Stdout.Push(
            JSON.stringify({ type: 'task_complete', last_agent_message: '{"taskComplete":true,"message":"built"}' }),
        );
        executor.Complete(0);

        const result = await turnPromise;

        expect(result.Stalled).toBeUndefined();
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.RawText).toBe('{"taskComplete":true,"message":"built"}');
        expect(adapter.RecentOutputLines).toContain('[stdout] ⠸ Compiling TypeScript packages...');
        expect(adapter.RecentOutputLines).toContain('[stderr] webpack: 65% building modules...');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('throttles bursts of raw output into sparse liveness-heartbeat events and caps the ring buffer at 20 lines', async () => {
        vi.useFakeTimers();
        const executor = new ControllableCliExecutor();
        const adapter = new CodexAdapter();
        adapter.SetLivenessHeartbeatThrottleMs(2000);
        await adapter.StartSession({
            Executor: executor,
            WorkspacePath: '/workspace',
            Environment: {},
        });

        const collected: HarnessTurnEvent[] = [];
        const consumePromise = (async () => {
            for await (const event of adapter.RunTurn('noisy build')) {
                collected.push(event);
            }
        })();

        // Burst of 25 non-JSON stdout lines in the same millisecond -> only 1 heartbeat emitted.
        for (let i = 1; i <= 25; i++) {
            executor.Stdout.Push(`progress line ${i}`);
        }
        await flushMicrotasks();

        // Advance past throttle window and emit stderr -> 1 more heartbeat emitted.
        await vi.advanceTimersByTimeAsync(2500);
        executor.Stderr.Push('stderr progress 1');
        executor.Stderr.Push('stderr progress 2');
        await flushMicrotasks();

        executor.Stdout.Push(
            JSON.stringify({ type: 'task_complete', last_agent_message: '{"taskComplete":true}' }),
        );
        executor.Complete(0);
        await consumePromise;

        const heartbeats = collected.filter((e) => e.Type === 'liveness-heartbeat');
        expect(heartbeats).toHaveLength(2);
        expect(heartbeats[0]).toMatchObject({ Type: 'liveness-heartbeat', Source: 'stdout' });
        expect(heartbeats[1]).toMatchObject({ Type: 'liveness-heartbeat', Source: 'stderr' });

        // Rolling ring buffer retains only the last 20 lines (oldest lines evicted).
        const tail = adapter.RecentOutputLines;
        expect(tail).toHaveLength(20);
        expect(tail[0]).not.toContain('progress line 1');
        expect(tail).toContain('[stderr] stderr progress 1');
        expect(tail).toContain('[stderr] stderr progress 2');
    });

    it('surfaces CLI adapter tail lines in StallReason and kills the hung process when idle timeout fires', async () => {
        vi.useFakeTimers();
        const executor = new ControllableCliExecutor();
        const adapter = new CodexAdapter();
        await adapter.StartSession({
            Executor: executor,
            WorkspacePath: '/workspace',
            Environment: {},
        });

        const agent = new WatchdogTestAgent();
        agent.AttachAdapter(adapter);

        const turnPromise = agent.RunTurnForTest('hung cli process', {
            limits: { maxIdleSeconds: 4 },
        });

        executor.Stderr.Push('Downloading dependency tarball...');
        await flushMicrotasks();

        // Now go completely silent past 4s.
        await vi.advanceTimersByTimeAsync(4005);
        const result = await turnPromise;

        expect(result.Stalled).toBe(true);
        expect(result.StallReason).toContain('limits.maxIdleSeconds (4s)');
        expect(result.StallReason).toContain('[stderr] Downloading dependency tarball...');
        expect(executor.KillCalls).toBeGreaterThanOrEqual(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
