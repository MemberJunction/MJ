/**
 * An agent run is server work, even when a client's own CRUD request started it: answering a request
 * through the API resumes its agent without waiting, and the async scope would otherwise carry the
 * client's boundary into the run, so a save the run makes would read as that person's own act (a
 * task-graph Human step's completer, an agent request's responder).
 */
import { describe, it, expect } from 'vitest';
import { ServerOperationScopeManager } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

/** An agent whose run only records whether it ran as a client's own request. */
function recordingAgent(): { agent: BaseAgent; seen: { client?: boolean } } {
    const agent = new BaseAgent();
    const seen: { client?: boolean } = {};
    (agent as unknown as { executeRun(params: ExecuteAgentParams): Promise<ExecuteAgentResult> }).executeRun = async () => {
        seen.client = ServerOperationScopeManager.Instance.IsInDirectClientCrud();
        return { success: true } as ExecuteAgentResult;
    };
    return { agent, seen };
}

describe('BaseAgent.Execute: a run is server work', () => {
    it("runs outside the client's request that started it", async () => {
        const { agent, seen } = recordingAgent();
        await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => agent.Execute({} as ExecuteAgentParams));
        expect(seen.client).toBe(false);
    });
});
