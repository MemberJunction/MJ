/**
 * @fileoverview MJServer's implementation of the task-graph `TaskAgentRunner` seam.
 *
 * The dispatcher knows *when* a task should run and *what* it depends on, but nothing about how an
 * agent executes. That is injected, so the package stays testable without standing up the agent
 * framework and so a host with a different execution strategy (a queue, a remote worker) can
 * substitute its own.
 *
 * This adapter is the thin translation between the two: it turns a task's input payload and its
 * dependencies' outputs into agent messages, runs the agent, and maps the result back into the
 * shape the dispatcher persists.
 *
 * @module @memberjunction/server
 */
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { IRunViewProvider, LogError, RunView } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import type { AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import type { TaskAgentRunner, TaskAgentRunParams, TaskAgentRunResult } from '@memberjunction/task-graph';

/** Maximum number of ancestor `ParentRunID` hops to walk when reconstructing `parentAgentHierarchy`. */
const MAX_ANCESTOR_HOPS = 25;

interface AncestorRunRow {
    ID: string;
    ParentRunID: string | null;
    Agent: string | null;
}

export class TaskGraphAgentRunner implements TaskAgentRunner {
    public async RunAgentForTask(params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        try {
            const agent = await params.Provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', params.ContextUser);
            if (!(await agent.Load(params.AgentID))) {
                return { Success: false, ErrorMessage: `Agent ${params.AgentID} could not be loaded.` };
            }

            const parentRun = await this.loadSubmittingRun(params);
            let configurationId: string | undefined;
            const requestedPreset = params.ConfigurationPresetName?.trim();
            if (requestedPreset) {
                const matched = AIEngine.Instance.FindActiveAgentConfigurationPreset(agent.ID, requestedPreset);
                if (!matched) {
                    const presets = AIEngine.Instance.GetAgentConfigurationPresets(agent.ID, true);
                    const available = presets.map((p) => p.Name).join(', ') || 'none';
                    return {
                        Success: false,
                        ErrorMessage: `Agent '${agent.Name || params.AgentID}' has no active preset '${requestedPreset}'. Available: ${available}.`,
                    };
                }
                configurationId = matched.AIConfigurationID ?? undefined;
            } else {
                configurationId = parentRun?.ConfigurationID ?? undefined;
            }

            const parentAgentHierarchy = await this.buildParentAgentHierarchy(parentRun, params);

            const result = await new AgentRunner().RunAgent({
                agent,
                conversationMessages: [{ role: ChatMessageRole.user, content: this.buildPrompt(params) }],
                contextUser: params.ContextUser,
                // Inherited from the graph, so a graph this run goes on to emit is one hop deeper
                // rather than starting the chain over. Without it MAX_REINVOKE_DEPTH never fires.
                continuationDepth: params.ContinuationDepth ?? 0,
                parentRun,
                parentAgentHierarchy,
                configurationId,
                // The bridge from the agent's own progress stream up to graph-level observers: the
                // dispatcher turns these into rate-limited `NodeProgress` frames, which is how a
                // running Agent step shows "what it is doing right now" on the workflow canvas.
                onProgress: this.bridgeProgress(params),
            });

            const success = result?.success === true;
            return {
                Success: success,
                Output: this.extractOutput(result),
                ErrorMessage: success ? undefined : (result?.agentRun?.ErrorMessage ?? 'Agent execution failed'),
                AgentRunID: result?.agentRun?.ID,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphAgentRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Adapts the agent framework's progress callback onto the dispatcher's plain sink.
     *
     * Undefined when nobody is listening, so the agent run pays nothing for observability it is not
     * providing. Never throws — a progress announcement must not be able to fail the step.
     */
    private bridgeProgress(params: TaskAgentRunParams): AgentExecutionProgressCallback | undefined {
        const sink = params.OnProgress;
        if (!sink) return undefined;
        return (progress) => {
            try {
                sink(progress.message, progress.percentage);
            } catch {
                // The dispatcher's sink already guards itself; this is belt over braces.
            }
        };
    }

    /**
     * The run that submitted this graph, as the entity `RunAgent` wants for `parentRun`.
     *
     * **Why this link is worth a load.** It sets `ParentRunID` on the spawned run, which turns a
     * workflow's total cost into one indexed sum over `RootParentRunID` rather than a walk of the
     * graph, and gives the run a "started by" trail someone can follow back. Without it every
     * dispatched run looks like it began from nowhere.
     *
     * Undefined — never a throw — when there is no submitting run or it cannot be read. A graph
     * submitted by a schedule, by MCP, or by a person genuinely has no parent run, and failing the
     * step because its provenance is unavailable would trade real work for a bookkeeping detail.
     */
    private async loadSubmittingRun(params: TaskAgentRunParams): Promise<MJAIAgentRunEntityExtended | undefined> {
        if (!params.SubmittingAgentRunID) return undefined;
        try {
            const run = await params.Provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                'MJ: AI Agent Runs',
                params.ContextUser,
            );
            return (await run.Load(params.SubmittingAgentRunID)) ? run : undefined;
        } catch (e) {
            LogError(
                `[TaskGraphAgentRunner] Task ${params.TaskID}: submitting run ` +
                `${params.SubmittingAgentRunID} could not be loaded; the spawned run will have no ` +
                `parent link. ${e instanceof Error ? e.message : String(e)}`,
            );
            return undefined;
        }
    }

    /**
     * Reconstructs the root-first ancestor agent name hierarchy starting from `parentRun` and
     * walking `ParentRunID` up to `MAX_ANCESTOR_HOPS` hops via `RunView`.
     *
     * Fails soft: on an invalid UUID or any `RunView` error, logs with `LogError` and returns the
     * hierarchy collected so far so the dispatcher's depth cap remains the backstop.
     */
    private async buildParentAgentHierarchy(
        parentRun: MJAIAgentRunEntityExtended | undefined,
        params: TaskAgentRunParams,
    ): Promise<string[] | undefined> {
        if (!parentRun) {
            return undefined;
        }

        const leafToRootNames: string[] = [];
        const submittingAgentName = this.resolveAgentName(parentRun.Agent, parentRun.AgentID);
        if (submittingAgentName) {
            leafToRootNames.push(submittingAgentName);
        }

        let nextParentRunId: string | null | undefined = parentRun.ParentRunID;
        let hops = 0;

        while (nextParentRunId && hops < MAX_ANCESTOR_HOPS) {
            const candidateId = nextParentRunId.trim();
            if (!IsValidUUID(candidateId)) {
                LogError(
                    `[TaskGraphAgentRunner] Task ${params.TaskID}: invalid ParentRunID '${nextParentRunId}' encountered while walking ancestor runs; stopping hierarchy walk.`,
                );
                break;
            }

            hops++;
            try {
                const rv = new RunView(params.Provider as unknown as IRunViewProvider);
                const rvResult = await rv.RunView<AncestorRunRow>(
                    {
                        EntityName: 'MJ: AI Agent Runs',
                        ExtraFilter: `ID='${candidateId}'`,
                        Fields: ['ID', 'ParentRunID', 'Agent'],
                        ResultType: 'simple',
                    },
                    params.ContextUser,
                );

                if (!rvResult.Success) {
                    LogError(
                        `[TaskGraphAgentRunner] Task ${params.TaskID}: failed to load ancestor run ${candidateId}: ${rvResult.ErrorMessage ?? 'Unknown RunView error'}`,
                    );
                    break;
                }

                const row = rvResult.Results?.[0];
                if (!row) {
                    break;
                }

                const ancestorName = row.Agent?.trim();
                if (ancestorName) {
                    leafToRootNames.push(ancestorName);
                }
                nextParentRunId = row.ParentRunID;
            } catch (e) {
                LogError(
                    `[TaskGraphAgentRunner] Task ${params.TaskID}: error loading ancestor run ${candidateId}: ${e instanceof Error ? e.message : String(e)}`,
                );
                break;
            }
        }

        return leafToRootNames.length > 0 ? leafToRootNames.reverse() : undefined;
    }

    private resolveAgentName(agentName: string | null | undefined, agentId?: string | null): string | undefined {
        const trimmed = agentName?.trim();
        if (trimmed) {
            return trimmed;
        }
        if (agentId) {
            const fromEngine = AIEngine.Instance.Agents?.find((a) => UUIDsEqual(a.ID, agentId))?.Name?.trim();
            if (fromEngine) {
                return fromEngine;
            }
        }
        return undefined;
    }

    /**
     * Builds the agent's instruction from the task's own input plus its dependencies' outputs.
     *
     * Dependency outputs are included inline because a task's whole reason for depending on another
     * is to consume what it produced. They are rendered as labelled JSON rather than prose so the
     * agent can parse them reliably rather than inferring structure from formatting.
     */
    private buildPrompt(params: TaskAgentRunParams): string {
        const sections: string[] = [];

        if (params.InputPayload != null) {
            sections.push(`## Task input\n\`\`\`json\n${JSON.stringify(params.InputPayload, null, 2)}\n\`\`\``);
        }

        if (params.DependencyOutputs.size > 0) {
            const rendered = [...params.DependencyOutputs.entries()]
                .map(([taskID, output]) => `### Output of task ${taskID}\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``)
                .join('\n\n');
            sections.push(`## Results from prerequisite tasks\n\n${rendered}`);
        }

        return sections.length > 0
            ? sections.join('\n\n')
            : 'Execute this task.';
    }

    /** Prefers a structured payload over prose, so downstream tasks get data rather than text. */
    private extractOutput(result: unknown): unknown {
        const r = result as { payload?: unknown; agentRun?: { Message?: string } } | null;
        if (r?.payload != null) return r.payload;
        return r?.agentRun?.Message ?? null;
    }
}
