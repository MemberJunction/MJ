import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { ChatMessage } from '@memberjunction/ai';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Action that executes any top-level AI Agent by name or ID.
 *
 * Serves two purposes:
 *  1. External callers (schedulers, workflows, MCP clients, other Runtime
 *     actions invoking via `utilities.actions.Invoke`) can run agents through
 *     the uniform Action catalog instead of reaching for the AgentRunner API.
 *  2. Gives us a concrete dispatch target for `AIAgent.ExposeAsAction` once
 *     the auto-registration pass lands — every exposed agent becomes callable
 *     as an action without a separate Custom class per agent.
 *
 * **Not used inside the Runtime Actions bridge.** Script code calling
 * `utilities.agents.Run(...)` from the sandbox bridges back to the host which
 * invokes `AgentRunner.RunAgent()` directly — skipping this wrapper because
 * the bridge already runs in-process with `contextUser` and doesn't need the
 * action-catalog indirection.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Execute Agent',
 *   Params: [
 *     { Name: 'AgentName', Value: 'Customer Sentiment Analyzer', Type: 'Input' },
 *     { Name: 'ConversationMessages', Value: [{ role: 'user', content: 'Analyze ticket 12345' }], Type: 'Input' },
 *     { Name: 'Data', Value: { ticketId: '12345' }, Type: 'Input' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Execute Agent')
export class ExecuteAgentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // ---- Resolve agent ----
            const agentID = this.getStringParam(params, 'agentid');
            const agentName = this.getStringParam(params, 'agentname');

            if (!agentID && !agentName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_AGENT_IDENTIFIER',
                    Message: 'Execute Agent requires either AgentID or AgentName parameter.'
                };
            }

            // Make sure AIEngine has agent metadata loaded before we look anything up.
            await AIEngine.Instance.Config(false, params.ContextUser);

            const agent = agentID
                ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, agentID))
                : AIEngine.Instance.Agents.find(
                      (a) => a.Name?.trim().toLowerCase() === agentName!.trim().toLowerCase()
                  );

            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: agentID
                        ? `No agent found with ID '${agentID}'`
                        : `No agent found with name '${agentName}'`
                };
            }

            // Sub-agents (ParentID set) can't be exposed — their contract is
            // governed by the parent; invoking them directly would bypass the
            // parent agent's payload filtering.
            if (agent.ParentID) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_IS_SUB_AGENT',
                    Message:
                        `Agent '${agent.Name}' is a sub-agent (ParentID is set). ` +
                        'Only top-level agents can be invoked through Execute Agent. ' +
                        "Run the parent agent instead, or invoke this sub-agent via the parent's workflow."
                };
            }

            // Only agents that the operator has explicitly flagged as callable
            // from outside may be dispatched this way. This is the
            // `ExposeAsAction` contract — once auto-registration lands, it
            // will only create catalog entries for agents that pass this check.
            if (!agent.ExposeAsAction) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_EXPOSED',
                    Message:
                        `Agent '${agent.Name}' is not exposed as an action (AIAgent.ExposeAsAction=false). ` +
                        'Enable ExposeAsAction on the agent record to allow invocation via Execute Agent.'
                };
            }

            // ---- Collect optional inputs ----
            const conversationMessages =
                (this.getParamValue(params, 'conversationmessages') as ChatMessage[] | undefined) ?? [];
            const data = this.getParamValue(params, 'data') as Record<string, unknown> | undefined;
            const conversationDetailId = this.getStringParam(params, 'conversationdetailid');
            const lastRunId = this.getStringParam(params, 'lastrunid');
            const maxExecutionTimeMs = this.getNumericParam(params, 'maxexecutiontimems');

            const runner = new AgentRunner();
            const runResult = await runner.RunAgent({
                agent: agent as MJAIAgentEntityExtended,
                conversationMessages,
                contextUser: params.ContextUser,
                data,
                conversationDetailId: conversationDetailId ?? undefined,
                lastRunId: lastRunId ?? undefined,
                maxExecutionTimeMs: maxExecutionTimeMs ?? undefined,
                cancellationToken: params.AbortSignal
            });

            // ---- Expose outputs for downstream action consumers ----
            this.setOutputParam(params, 'AgentRunID', runResult.agentRun?.ID ?? null);
            this.setOutputParam(params, 'Payload', runResult.payload ?? null);
            this.setOutputParam(params, 'AgentResult', runResult);

            if (runResult.success) {
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: runResult.agentRun?.Message ?? 'Agent execution completed successfully.',
                    Params: params.Params
                };
            }

            return {
                Success: false,
                ResultCode: 'AGENT_EXECUTION_FAILED',
                Message:
                    runResult.agentRun?.Message ??
                    `Agent '${agent.Name}' execution did not complete successfully.`,
                Params: params.Params
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ExecuteAgentAction error: ${message}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error executing agent: ${message}`
            };
        }
    }

    // ------------------------------------------------------------------------
    // Parameter helpers — each action keeps its own to match the existing
    // CoreActions convention (HTTP Request, Execute AI Prompt, etc.)
    // ------------------------------------------------------------------------

    private getParamValue(params: RunActionParams, name: string): unknown {
        const param = params.Params?.find((p) => p.Name?.trim().toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        const str = String(value).trim();
        return str.length > 0 ? str : undefined;
    }

    private getNumericParam(params: RunActionParams, name: string): number | undefined {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return undefined;
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params?.find(
            (p) => p.Name?.trim().toLowerCase() === name.toLowerCase()
        );
        if (existing) {
            existing.Value = value;
            existing.Type = existing.Type === 'Input' ? 'Both' : existing.Type || 'Output';
        } else {
            if (!params.Params) {
                params.Params = [];
            }
            const output = new ActionParam();
            output.Name = name;
            output.Value = value;
            output.Type = 'Output';
            params.Params.push(output);
        }
    }
}

/**
 * Tree-shaking prevention — importing this function forces the module to load
 * and the `@RegisterClass` decorator to run. Called from CoreActions' public
 * API barrel.
 */
export function LoadExecuteAgentAction(): void {
    // intentionally empty
}
