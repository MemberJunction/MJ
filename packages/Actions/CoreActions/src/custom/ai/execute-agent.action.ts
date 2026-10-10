import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, type BaseEntity } from '@memberjunction/core';
import { ChatMessage } from '@memberjunction/ai';
import { ExecuteAgentResult, MJAIAgentEntityExtended, type AgentRunAudience, type ExecuteAgentParams } from '@memberjunction/ai-core-plus';
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
 * **`Data` cannot change what the run is.** Whoever calls this action — a browser
 * through `RunAction`, a user routine, or a model inside another agent's run —
 * authors `Data`, so the run is never marked `TrustReservedRunData`: `BaseAgent`
 * drops the reserved scope and agent-type keys from it (see
 * `ExecuteAgentParams.TrustReservedRunData`). Everything else in `Data` reaches
 * the agent as template data.
 *
 * **Inside an agent run the nested run keeps the caller's bounds.** The calling run's scope
 * (`RunActionParams.RunScope`) becomes the nested run's first-class `PrimaryScopeEntityName` /
 * `PrimaryScopeRecordID` / `SecondaryScopes` — `Data` cannot carry them — so it searches the same
 * tenant; its audience (`RunActionParams.Audience`) becomes an `'Intersection'` of the readers' IDs,
 * which the nested run validates and hydrates again. The action does not declare `SupportsAudience`, so
 * under an audience the engine refuses it before it runs: the nested run's output comes back as the
 * whole `AgentResult` (its run record, memory context and payload), which nothing yet limits to what
 * every reader may see.
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
            const resolved = await this.resolveAgent(params);
            if ('result' in resolved) {
                return resolved.result;
            }
            const { agent } = resolved;

            // ---- Collect optional inputs ----
            const conversationMessages =
                (this.getParamValue(params, 'conversationmessages') as ChatMessage[] | undefined) ?? [];
            const data = this.getParamValue(params, 'data') as Record<string, unknown> | undefined;
            const conversationDetailId = this.getStringParam(params, 'conversationdetailid');
            const lastRunId = this.getStringParam(params, 'lastrunid');
            const maxExecutionTimeMs = this.getNumericParam(params, 'maxexecutiontimems');

            const runner = new AgentRunner();
            // Never TrustReservedRunData: Data is caller- or model-authored (see the class doc).
            const runResult = await runner.RunAgent({
                agent: agent as MJAIAgentEntityExtended,
                conversationMessages,
                contextUser: params.ContextUser,
                // The calling run's credential scope; see execute-ai-prompt. Without keys, a 'RuntimeOnly'
                // nested run fails rather than spending the platform's.
                CredentialScope: params.CredentialScope,
                // The calling run's tenant and audience, as first-class fields (see the class doc).
                ...this.callerRunBounds(params),
                data,
                conversationDetailId: conversationDetailId ?? undefined,
                lastRunId: lastRunId ?? undefined,
                maxExecutionTimeMs: maxExecutionTimeMs ?? undefined,
                cancellationToken: params.AbortSignal
            });

            // ---- Expose outputs for downstream action consumers ----
            this.setOutputParam(params, 'AgentRunID', runResult.agentRun?.ID ?? null);
            this.setOutputParam(params, 'Payload', runResult.payload ?? null);
            this.setOutputParam(params, 'AgentResult', this.toStorableAgentResult(runResult));

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

    /**
     * The agent this call names — `AgentID`, else `AgentName` — when it is a top-level agent exposed as an action,
     * or the refusal to return.
     */
    private async resolveAgent(params: RunActionParams): Promise<{ agent: MJAIAgentEntityExtended } | { result: ActionResultSimple }> {
        const agentID = this.getStringParam(params, 'agentid');
        const agentName = this.getStringParam(params, 'agentname');
        if (!agentID && !agentName) {
            const message = 'Execute Agent requires either AgentID or AgentName parameter.';
            return { result: { Success: false, ResultCode: 'MISSING_AGENT_IDENTIFIER', Message: message } };
        }

        // Make sure AIEngine has agent metadata loaded before we look anything up.
        await AIEngine.Instance.Config(false, params.ContextUser);
        const agent = agentID
            ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, agentID))
            : AIEngine.Instance.Agents.find((a) => a.Name?.trim().toLowerCase() === agentName?.trim().toLowerCase());
        if (!agent) {
            const message = agentID ? `No agent found with ID '${agentID}'` : `No agent found with name '${agentName}'`;
            return { result: { Success: false, ResultCode: 'AGENT_NOT_FOUND', Message: message } };
        }
        const refusal = this.exposureRefusal(agent);
        return refusal ? { result: refusal } : { agent: agent as MJAIAgentEntityExtended };
    }

    /**
     * Why an agent may not be dispatched this way, or null. Sub-agents (ParentID set) can't be exposed — their contract is
     * governed by the parent; invoking them directly would bypass the parent agent's payload filtering. And only agents
     * the operator has explicitly flagged as callable from outside (`ExposeAsAction`) may be — once auto-registration
     * lands, it will only create catalog entries for agents that pass this check.
     */
    private exposureRefusal(agent: Pick<MJAIAgentEntityExtended, 'Name' | 'ParentID' | 'ExposeAsAction'>): ActionResultSimple | null {
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
        if (!agent.ExposeAsAction) {
            return {
                Success: false,
                ResultCode: 'AGENT_NOT_EXPOSED',
                Message:
                    `Agent '${agent.Name}' is not exposed as an action (AIAgent.ExposeAsAction=false). ` +
                    'Enable ExposeAsAction on the agent record to allow invocation via Execute Agent.'
            };
        }
        return null;
    }

    /**
     * The calling run's bounds for the nested run, as its first-class fields: the scope (`RunActionParams.RunScope` —
     * the calling run's validated tenant and secondary dimensions; nulls become absent) and the audience
     * ({@link nestedRunAudience}). Outside an agent run there is no `RunScope`, and the nested run is unscoped as before.
     */
    private callerRunBounds(
        params: RunActionParams
    ): Pick<ExecuteAgentParams, 'PrimaryScopeEntityName' | 'PrimaryScopeRecordID' | 'SecondaryScopes' | 'Audience'> {
        const scope = params.RunScope;
        return {
            PrimaryScopeEntityName: scope?.PrimaryScopeEntityName ?? undefined,
            PrimaryScopeRecordID: scope?.PrimaryScopeRecordID ?? undefined,
            SecondaryScopes: scope?.SecondaryScopes ?? undefined,
            Audience: this.nestedRunAudience(params.Audience),
        };
    }

    /**
     * The calling run's audience for the nested run: an `'Intersection'` of the readers' IDs, which the nested run
     * validates and hydrates again. None when there is no audience or it names no reader. A malformed one (no
     * `Readers` array, a reader with no ID) becomes an audience the nested run refuses — never no audience.
     */
    private nestedRunAudience(audience: RunActionParams['Audience']): AgentRunAudience | undefined {
        if (audience === undefined) {
            return undefined;
        }
        const readers: unknown = audience?.Readers;
        if (!Array.isArray(readers)) {
            return { Mode: 'Intersection', UserIDs: [] };
        }
        const list: unknown[] = readers;
        return list.length === 0 ? undefined : { Mode: 'Intersection', UserIDs: list.map((reader) => this.readerID(reader)) };
    }

    /** A reader's ID, or `''` (which the nested run refuses) when it has none. */
    private readerID(reader: unknown): string {
        return reader !== null && typeof reader === 'object' && 'ID' in reader && typeof reader.ID === 'string' ? reader.ID : '';
    }

    /**
     * The run result as plain data, for the `AgentResult` output param.
     *
     * Output params are DATA: a durable (task-graph) run stores them on the Task row as JSON. The run
     * result carries live entities bound to the provider — `agentRun`, and the notes and examples in
     * `memoryContext` when the agent injects memory — whose event plumbing is circular, so passing
     * any of them through fails the task after the agent has already run. Their field values carry
     * the same information; the entities themselves stay in-process.
     */
    private toStorableAgentResult(runResult: ExecuteAgentResult) {
        const { memoryContext } = runResult;
        return {
            ...runResult,
            agentRun: runResult.agentRun?.GetAll() ?? null,
            memoryContext: memoryContext && {
                notes: memoryContext.notes.map((note: BaseEntity) => note.GetAll()),
                examples: memoryContext.examples.map((example: BaseEntity) => example.GetAll())
            }
        };
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
