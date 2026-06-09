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
});
