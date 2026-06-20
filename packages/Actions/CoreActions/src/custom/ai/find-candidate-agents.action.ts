import { RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJAIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { BaseFindAgentsAction } from "./base-find-agents.action";
import { getActionBooleanParam } from "./semantic-entity-search.helper";

/**
 * Finds candidate AI agents for a given task using semantic search.
 *
 * Backed by the unified `Provider.SearchEntity` pipeline (semantic mode over the
 * daily-synced "AI Agents Search" EntityDocument). Extends the shared agent base
 * (see {@link BaseFindAgentsAction}) to additionally surface each agent's
 * sub-agents and default artifact type, and to optionally exclude Sub-Agents and
 * child agents via the `ExcludeSubAgents` parameter.
 *
 * Inputs: `TaskDescription` (required), `MaxResults` (default 5), `MinimumSimilarityScore`
 * (cosine 0-1, default 0.5), `IncludeInactive` (default false), `ExcludeSubAgents` (default true).
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Find Candidate Agents',
 *   Params: [{ Name: 'TaskDescription', Value: 'Research market trends' }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Candidate Agents")
export class FindCandidateAgentsAction extends BaseFindAgentsAction {
    protected get actionLabel(): string { return 'find candidate agents'; }
    protected get includeSubAgentDetails(): boolean { return true; }

    protected override applyInvocationFilter(agents: MJAIAgentEntityExtended[], params: RunActionParams): MJAIAgentEntityExtended[] {
        const excludeSubAgents = getActionBooleanParam(params, 'excludesubagents', true);
        if (excludeSubAgents) {
            // Sub-Agents and child agents are meant to be called by other agents, not discovered directly
            return agents.filter(a => a.InvocationMode !== 'Sub-Agent' && !a.ParentID);
        }
        return agents;
    }
}
