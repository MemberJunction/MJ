/**
 * @fileoverview Persists a workflow's graph as a Flow agent, via `AgentSpecSync`.
 *
 * This is the host side of the seam `WorkflowSpecSync` declares. It lives here, in the agent-manager,
 * because `AgentSpecSync` is the **one place that writes an agent** — it already owns atomic
 * multi-entity writes and the mutation audit, and a second writer would be a second set of rules
 * about what a valid agent record is.
 *
 * The conversion itself is `ConvertTaskGraphToAgentSpec`, shipped in Phase 4. That it is reusable
 * here without modification is the practical payoff of the convergence: "save a runtime graph as a
 * workflow" and "persist a workflow's graph" turn out to be the same operation, because after Phase 4
 * they are the same model.
 *
 * @module @memberjunction/ai-agent-manager
 */
import { LogError, RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    ConvertTaskGraphToAgentSpec,
    FormatSaveAsWorkflowLosses,
    type WorkflowSpec,
} from '@memberjunction/ai-core-plus';
import { AgentSpecSync } from './agent-spec-sync';

/** ClassFactory key under which hosts resolve the writer. */
export const WORKFLOW_AGENT_WRITER_KEY = 'WorkflowAgentWriter';

/** Base so hosts can resolve an implementation without importing this package directly. */
export abstract class WorkflowAgentWriterBase {
    public abstract PersistFlowAgent(
        spec: WorkflowSpec,
        context: { ContextUser: UserInfo; Provider: IMetadataProvider },
    ): Promise<string>;
}

@RegisterClass(WorkflowAgentWriterBase, WORKFLOW_AGENT_WRITER_KEY)
export class WorkflowAgentWriter extends WorkflowAgentWriterBase {
    /**
     * Converts the workflow's graph to a Flow `AgentSpec` and persists it.
     *
     * **Losses are logged, not swallowed.** The converter reports what it could not carry across —
     * human steps, unresolvable agents, run-specific inputs. Dropping that silently would hand
     * someone a workflow missing an approval they believed they had saved, and they would only find
     * out by running it. The save still proceeds: a workflow that is 90% right and says so is more
     * useful than a refusal, and the losses are surfaced to the caller by the operation above.
     */
    public async PersistFlowAgent(
        spec: WorkflowSpec,
        context: { ContextUser: UserInfo; Provider: IMetadataProvider },
    ): Promise<string> {
        const flowTypeID = await this.resolveFlowAgentTypeID(context);
        const agentIDsByName = await this.buildAgentNameIndex(context);

        let counter = 0;
        const result = ConvertTaskGraphToAgentSpec(spec.graph, {
            // Deterministic within one call, and unique because AgentSpecSync assigns real keys on
            // insert — these only have to correlate steps to paths inside this payload.
            AgentID: `workflow-${Date.now()}-${counter}`,
            NextID: () => `wf-node-${++counter}`,
            ResolveAgentID: (name) => agentIDsByName.get(name.trim().toLowerCase()) ?? null,
            FlowAgentTypeID: flowTypeID,
            Name: spec.name,
        });

        if (!result.Success || !result.Spec) {
            throw new Error(result.ErrorMessage ?? 'The workflow graph could not be converted to an agent.');
        }
        if (result.Losses.length > 0) {
            LogError(
                `[WorkflowAgentWriter] "${spec.name}" saved with losses:\n${FormatSaveAsWorkflowLosses(result.Losses)}`,
            );
        }

        result.Spec.Description = spec.description ?? result.Spec.Description;
        // A Draft or Paused workflow persists as an Inactive agent, so nothing can invoke it before
        // its author has turned it on — the schedule side makes the same choice for the same reason.
        result.Spec.Status = spec.status === 'Active' ? 'Active' : 'Inactive';

        const sync = AgentSpecSync.FromRawSpec(result.Spec, context.ContextUser, context.Provider);
        // AgentSpecSyncResult uses camelCase — it predates the PascalCase-public convention and is
        // consumed by MCP tools, so it is left alone rather than renamed under this change.
        const saved = await sync.SaveToDatabase();
        if (!saved?.success) {
            throw new Error(`Could not save the workflow's agent "${spec.name}".`);
        }
        return saved.agentId;
    }

    /** Resolves the Flow agent type, so the persisted agent is a Flow rather than a Loop. */
    private async resolveFlowAgentTypeID(context: { ContextUser: UserInfo; Provider: IMetadataProvider }): Promise<string> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: AI Agent Types', ExtraFilter: `Name='Flow'`, Fields: ['ID'], ResultType: 'simple' },
            context.ContextUser,
        );
        const id = result.Results?.[0]?.ID;
        if (!id) throw new Error("The 'Flow' agent type was not found — has the metadata seed been pushed?");
        return id;
    }

    /** Name → ID for every agent, lowercased so a spec's human-entered name still resolves. */
    private async buildAgentNameIndex(
        context: { ContextUser: UserInfo; Provider: IMetadataProvider },
    ): Promise<Map<string, string>> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );
        return new Map((result.Results ?? []).map((a) => [a.Name.trim().toLowerCase(), a.ID]));
    }
}

/** Prevents tree-shaking of the registered writer. */
export function LoadWorkflowAgentWriter(): void {
    void WorkflowAgentWriter;
}
