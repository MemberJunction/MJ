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
import { LogError } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import type { TaskAgentRunner, TaskAgentRunParams, TaskAgentRunResult } from '@memberjunction/task-graph';

export class TaskGraphAgentRunner implements TaskAgentRunner {
    public async RunAgentForTask(params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        try {
            const agent = await params.Provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', params.ContextUser);
            if (!(await agent.Load(params.AgentID))) {
                return { Success: false, ErrorMessage: `Agent ${params.AgentID} could not be loaded.` };
            }

            const result = await new AgentRunner().RunAgent({
                agent,
                conversationMessages: [{ role: ChatMessageRole.user, content: this.buildPrompt(params) }],
                contextUser: params.ContextUser,
                // Inherited from the graph, so a graph this run goes on to emit is one hop deeper
                // rather than starting the chain over. Without it MAX_REINVOKE_DEPTH never fires.
                continuationDepth: params.ContinuationDepth ?? 0,
                parentRun: await this.loadSubmittingRun(params),
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
