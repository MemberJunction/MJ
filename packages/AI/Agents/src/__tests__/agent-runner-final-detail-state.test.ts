/**
 * The status and message an agent's reply detail ends with, from the run result.
 *
 * A run the user stopped used to land as `Status='Error'` with the cancellation text, so a
 * deliberate stop rendered as a red failure. It now ends Complete with a "stopped" message;
 * every other outcome keeps its long-standing mapping. Pure function, no DB.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: async () => undefined, AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

type RunShape = { Status?: string; CancellationReason?: string | null; ErrorMessage?: string | null; Message?: string | null };

function result(success: boolean, run: RunShape | undefined): ExecuteAgentResult {
    return { success, agentRun: run } as unknown as ExecuteAgentResult;
}

describe('AgentRunner.ResolveFinalDetailState', () => {
    it('a user-stopped run ends Complete with a stopped message, not Error', () => {
        const state = AgentRunner.ResolveFinalDetailState(result(false, {
            Status: 'Cancelled', CancellationReason: 'User Request', ErrorMessage: 'Cancelled by user request',
        }));
        expect(state).toEqual({ Status: 'Complete', Message: '⏹️ Stopped by user' });
    });

    it('a run cancelled for another reason ends Complete and names the reason', () => {
        const state = AgentRunner.ResolveFinalDetailState(result(false, {
            Status: 'Cancelled', CancellationReason: 'Timeout', ErrorMessage: "Agent 'X' exceeded maxExecutionTimeMs (10ms)",
        }));
        expect(state.Status).toBe('Complete');
        expect(state.Message).toBe("⏹️ Stopped: Agent 'X' exceeded maxExecutionTimeMs (10ms)");
    });

    it('a successful run keeps its own message, or Completed when it wrote none', () => {
        expect(AgentRunner.ResolveFinalDetailState(result(true, { Status: 'Completed', Message: 'Here you go' })))
            .toEqual({ Status: 'Complete', Message: 'Here you go' });
        expect(AgentRunner.ResolveFinalDetailState(result(true, { Status: 'Completed', Message: null })))
            .toEqual({ Status: 'Complete', Message: '✅ Completed' });
    });

    it('a failed run ends Error with its error message, or Failed when it has none', () => {
        expect(AgentRunner.ResolveFinalDetailState(result(false, { Status: 'Failed', ErrorMessage: 'boom' })))
            .toEqual({ Status: 'Error', Message: 'boom' });
        expect(AgentRunner.ResolveFinalDetailState(result(false, undefined)))
            .toEqual({ Status: 'Error', Message: '❌ Failed' });
    });
});
