/**
 * Unit tests for {@link RealtimeToolBroker} — the topology-agnostic tool-execution path shared by
 * the server-bridged {@link RealtimeSessionRunner} and the client-direct relay resolver. All
 * collaborators are injected; no network, no DB.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RealtimeToolCall } from '@memberjunction/ai';
import {
    RealtimeToolBroker,
    INVOKE_TARGET_AGENT_TOOL_NAME,
    type DelegateToTargetRequest,
    type DelegatedResult,
    type ToolExecutionResult,
    type RealtimeToolBrokerDeps,
} from '../realtime/realtime-tool-broker';

function buildBroker(overrides: Partial<RealtimeToolBrokerDeps> = {}): {
    broker: RealtimeToolBroker;
    delegate: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
} {
    const delegate = vi.fn(async (_req: DelegateToTargetRequest): Promise<DelegatedResult> => ({
        Success: true,
        Output: 'delegated-ok',
    }));
    const execute = vi.fn(async (_call: RealtimeToolCall): Promise<ToolExecutionResult> => ({
        Success: true,
        Output: 'tool-ok',
    }));
    const broker = new RealtimeToolBroker({ DelegateToTarget: delegate, ExecuteTool: execute, ...overrides });
    return { broker, delegate, execute };
}

const targetCall: RealtimeToolCall = {
    CallID: 'c1',
    ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
    Arguments: '{"request":"do work"}',
};
const otherCall: RealtimeToolCall = { CallID: 'c2', ToolName: 'ShowChart', Arguments: '{}' };

describe('RealtimeToolBroker', () => {
    it('routes the invoke-target tool to DelegateToTarget with an abort signal', async () => {
        const { broker, delegate, execute } = buildBroker();
        const result = await broker.ExecuteToolCall(targetCall);

        expect(delegate).toHaveBeenCalledTimes(1);
        expect(execute).not.toHaveBeenCalled();
        const req = delegate.mock.calls[0][0] as DelegateToTargetRequest;
        expect(req.CallID).toBe('c1');
        expect(req.AbortSignal).toBeInstanceOf(AbortSignal);
        expect(result.Success).toBe(true);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'delegated-ok' });
    });

    it('routes a non-target tool to ExecuteTool', async () => {
        const { broker, delegate, execute } = buildBroker();
        const result = await broker.ExecuteToolCall(otherCall);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(delegate).not.toHaveBeenCalled();
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'tool-ok' });
    });

    it('serializes a structured error when DelegateToTarget throws', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async () => {
                throw new Error('target exploded');
            }),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, error: 'target exploded' });
    });

    it('serializes a structured error when ExecuteTool throws', async () => {
        const { broker } = buildBroker({
            ExecuteTool: vi.fn(async () => {
                throw new Error('tool exploded');
            }),
        });
        const result = await broker.ExecuteToolCall(otherCall);
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, error: 'tool exploded' });
    });

    it('propagates a delegated failure result as success:false without throwing', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (): Promise<DelegatedResult> => ({ Success: false, Output: 'no data' })),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, output: 'no data' });
    });

    it('threads the delegated RunID into ResultJson as runId and onto ExecutedToolCall', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (): Promise<DelegatedResult> => ({
                CallID: 'c1',
                Success: true,
                Output: 'delegated-ok',
                RunID: 'run-123',
            })),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.RunID).toBe('run-123');
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'delegated-ok', runId: 'run-123' });
    });

    it('omits runId from ResultJson when the delegation produced no run', async () => {
        const { broker } = buildBroker();
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.RunID).toBeUndefined();
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'delegated-ok' });
    });

    it('threads delegated Artifacts into ResultJson as artifacts and onto ExecutedToolCall', async () => {
        const artifacts = [{ ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }];
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (): Promise<DelegatedResult> => ({
                CallID: 'c1',
                Success: true,
                Output: 'delegated-ok',
                RunID: 'run-123',
                Artifacts: artifacts,
            })),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.Artifacts).toEqual(artifacts);
        expect(JSON.parse(result.ResultJson)).toEqual({
            success: true,
            output: 'delegated-ok',
            runId: 'run-123',
            artifacts: [{ artifactId: 'a-1', artifactVersionId: 'av-1', name: 'Weather Report' }],
        });
    });

    it('omits artifacts from ResultJson when the delegation produced an empty list', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (): Promise<DelegatedResult> => ({
                CallID: 'c1',
                Success: true,
                Output: 'delegated-ok',
                Artifacts: [],
            })),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.Artifacts).toBeUndefined();
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'delegated-ok' });
    });

    it('aborts the in-flight delegated controller on AbortInFlight (barge-in)', async () => {
        let capturedSignal: AbortSignal | null = null;
        let resolveDelegate: ((r: DelegatedResult) => void) | null = null;
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn((req: DelegateToTargetRequest) => {
                capturedSignal = req.AbortSignal;
                return new Promise<DelegatedResult>((resolve) => {
                    resolveDelegate = resolve;
                });
            }),
        });

        const pending = broker.ExecuteToolCall(targetCall);
        await Promise.resolve(); // let runInvokeTarget reach the delegate call
        expect(capturedSignal).not.toBeNull();
        expect(capturedSignal!.aborted).toBe(false);

        broker.AbortInFlight();
        expect(capturedSignal!.aborted).toBe(true);

        resolveDelegate!({ Success: false, Output: 'cancelled' });
        await pending; // does not throw
    });

    it('AbortInFlight is a safe no-op when nothing is in flight', () => {
        const { broker } = buildBroker();
        expect(() => broker.AbortInFlight()).not.toThrow();
    });

    it('propagates PausedRunID from the delegate onto ExecutedToolCall (AwaitingFeedback resume linkage)', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (): Promise<DelegatedResult> => ({
                CallID: 'c1',
                Success: true,
                Output: 'Ask the user: include archived rows?',
                PausedRunID: 'paused-run-7',
                RunID: 'paused-run-7',
            })),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.PausedRunID).toBe('paused-run-7');
        expect(result.RunID).toBe('paused-run-7');
        // PausedRunID is transport metadata only — it is NOT serialized into the model's tool_response.
        expect(JSON.parse(result.ResultJson)).toEqual({
            success: true,
            output: 'Ask the user: include archived rows?',
            runId: 'paused-run-7',
        });
    });

    it('leaves PausedRunID/RunID/Artifacts undefined on the structured-error path', async () => {
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async () => {
                throw new Error('target exploded');
            }),
        });
        const result = await broker.ExecuteToolCall(targetCall);
        expect(result.PausedRunID).toBeUndefined();
        expect(result.RunID).toBeUndefined();
        expect(result.Artifacts).toBeUndefined();
    });

    it('clears the per-call controller after completion — a later AbortInFlight never aborts a finished call', async () => {
        let firstSignal: AbortSignal | null = null;
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn(async (req: DelegateToTargetRequest): Promise<DelegatedResult> => {
                firstSignal = req.AbortSignal;
                return { CallID: req.CallID, Success: true, Output: 'done' };
            }),
        });

        await broker.ExecuteToolCall(targetCall);
        expect(firstSignal).not.toBeNull();

        // The finally block must have cleared the controller — AbortInFlight is a no-op now.
        broker.AbortInFlight();
        expect(firstSignal!.aborted).toBe(false);
    });

    it('AbortInFlight aborts only the CURRENT delegation when a second call replaced the controller', async () => {
        const signals: AbortSignal[] = [];
        const resolvers: Array<(r: DelegatedResult) => void> = [];
        const { broker } = buildBroker({
            DelegateToTarget: vi.fn((req: DelegateToTargetRequest) => {
                signals.push(req.AbortSignal);
                return new Promise<DelegatedResult>((resolve) => resolvers.push(resolve));
            }),
        });

        const first = broker.ExecuteToolCall(targetCall);
        await Promise.resolve();
        // Complete the first delegation, then start a second one.
        resolvers[0]({ CallID: 'c1', Success: true, Output: 'first done' });
        await first;

        const second = broker.ExecuteToolCall({ ...targetCall, CallID: 'c2' });
        await Promise.resolve();
        expect(signals).toHaveLength(2);

        broker.AbortInFlight();
        expect(signals[0].aborted).toBe(false); // finished call untouched
        expect(signals[1].aborted).toBe(true);  // in-flight call cancelled

        resolvers[1]({ CallID: 'c2', Success: false, Output: 'cancelled' });
        await second;
    });
});
