import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { UUIDsEqual, NormalizeUUID } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { AIAgentPermissionHelper } from "@memberjunction/ai-engine-base";
import { MJAIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { runSemanticEntitySearch, getActionParamValue, getActionBooleanParam } from "./semantic-entity-search.helper";

/**
 * Shared base for the "Find Best Agent" / "Find Candidate Agents" wrappers.
 *
 * Both rank agents for a task description via the unified
 * {@link IRunViewProvider.SearchEntity} pipeline (semantic mode, backed by the
 * daily-synced "AI Agents Search" EntityDocument), then permission-filter to
 * agents the user can run, drop Sub-Agents, and hydrate agent metadata from
 * AIEngine's cache. Subclasses tune the invocation filter and whether sub-agent
 * details are included in the output.
 *
 * Carries **no** `@RegisterClass` decorator so importing it does not register an
 * extra action.
 */
export abstract class BaseFindAgentsAction extends BaseAction {
    /** Entity searched by this action. */
    protected get entityName(): string { return 'MJ: AI Agents'; }
    /** Verb used in error messages. */
    protected abstract get actionLabel(): string;
    /** Whether each result includes sub-agent details + default artifact type (candidate variant). */
    protected get includeSubAgentDetails(): boolean { return false; }

    /**
     * Variant-specific invocation/parent filtering. Default excludes agents whose
     * invocation mode is 'Sub-Agent' (they're meant to be called by other agents).
     */
    protected applyInvocationFilter(agents: MJAIAgentEntityExtended[], _params: RunActionParams): MJAIAgentEntityExtended[] {
        return agents.filter(a => a.InvocationMode !== 'Sub-Agent');
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const taskDescription = getActionParamValue(params, 'taskdescription') as string | undefined;
            const maxResults = parseInt(String(getActionParamValue(params, 'maxresults') ?? '5'));
            const minimumSimilarityScore = parseFloat(String(getActionParamValue(params, 'minimumsimilarityscore') ?? '0.5'));
            const includeInactive = getActionBooleanParam(params, 'includeinactive', false);

            if (!taskDescription || taskDescription.trim().length === 0) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'TaskDescription parameter is required and cannot be empty' };
            }
            if (maxResults < 1 || maxResults > 20) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'MaxResults must be between 1 and 20' };
            }
            if (minimumSimilarityScore < 0 || minimumSimilarityScore > 1) {
                return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'MinimumSimilarityScore must be between 0 and 1' };
            }
            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_USER_CONTEXT', Message: 'User context required for permission filtering' };
            }

            // Rank via the unified SearchEntity pipeline (over-fetch 3x for post-filtering)
            const search = await runSemanticEntitySearch(params, this.entityName, taskDescription, maxResults * 3, minimumSimilarityScore);
            if (!search.ok) {
                return { Success: false, ResultCode: search.resultCode ?? 'SEARCH_FAILED', Message: search.message ?? 'Semantic search failed' };
            }

            // Hydrate agent metadata from AIEngine's cache (no DB round trip)
            await AIEngine.Instance.Config(false, params.ContextUser);
            const agentsById = new Map<string, MJAIAgentEntityExtended>();
            for (const a of AIEngine.Instance.Agents) {
                agentsById.set(NormalizeUUID(a.ID), a);
            }

            const scoreById = new Map<string, number>();
            let matched: MJAIAgentEntityExtended[] = [];
            for (const r of search.results) {
                const agent = agentsById.get(NormalizeUUID(r.recordId));
                if (agent) {
                    matched.push(agent);
                    scoreById.set(NormalizeUUID(agent.ID), r.score);
                }
            }

            // Permission-filter to agents the user can 'run'
            const accessibleAgents = await AIAgentPermissionHelper.GetAccessibleAgents(params.ContextUser, 'run');
            const accessibleAgentIds = new Set(accessibleAgents.map(a => NormalizeUUID(a.ID)));
            matched = matched.filter(a => accessibleAgentIds.has(NormalizeUUID(a.ID)));

            if (!includeInactive) {
                matched = matched.filter(a => a.Status === 'Active');
            }

            matched = this.applyInvocationFilter(matched, params).slice(0, maxResults);

            if (matched.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_AGENTS_FOUND',
                    Message: `No accessible agents found matching the criteria (minimum similarity: ${minimumSimilarityScore}). You may not have permission to run the matching agents.`
                };
            }

            const allMatches = matched.map(a => this.buildAgentResult(a, scoreById.get(NormalizeUUID(a.ID)) ?? 0));

            params.Params.push({ Name: 'MatchedAgents', Type: 'Output', Value: allMatches });
            params.Params.push({ Name: 'MatchCount', Type: 'Output', Value: allMatches.length });

            const responseData = {
                message: `Found ${allMatches.length} accessible agent(s)`,
                taskDescription,
                matchCount: allMatches.length,
                allMatches
            };

            return { Success: true, ResultCode: 'SUCCESS', Message: JSON.stringify(responseData, null, 2) };
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Failed to ${this.actionLabel}: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /** Action names available to the given agent. */
    protected getAgentActionNames(agentId: string): string[] {
        return AIEngine.Instance.AgentActions
            .filter(aa => UUIDsEqual(aa.AgentID, agentId) && aa.Status === 'Active')
            .map(aa => aa.Action);
    }

    /** Sub-agents (direct children + relationship-linked) for the given agent. */
    protected getSubAgents(agentId: string): Array<{ name: string; description: string }> {
        const subAgents: Array<{ name: string; description: string }> = [];

        const childAgents = AIEngine.Instance.Agents.filter(a =>
            UUIDsEqual(a.ParentID, agentId) && a.Status === 'Active'
        );
        subAgents.push(...childAgents.map(a => ({ name: a.Name, description: a.Description || '' })));

        const relationships = AIEngine.Instance.AgentRelationships.filter(r =>
            UUIDsEqual(r.AgentID, agentId) && r.Status === 'Active'
        );
        for (const rel of relationships) {
            const relatedAgent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, rel.SubAgentID));
            if (relatedAgent && relatedAgent.Status === 'Active') {
                subAgents.push({ name: relatedAgent.Name, description: relatedAgent.Description || '' });
            }
        }
        return subAgents;
    }

    /** Builds the per-agent result object, including sub-agent details for the candidate variant. */
    protected buildAgentResult(agent: MJAIAgentEntityExtended, score: number): Record<string, unknown> {
        const base: Record<string, unknown> = {
            agentId: agent.ID,
            agentName: agent.Name,
            similarityScore: Math.round(score * 100) / 100,
            description: agent.Description,
            actions: this.getAgentActionNames(agent.ID)
        };
        if (this.includeSubAgentDetails) {
            base.subAgents = this.getSubAgents(agent.ID);
            base.defaultArtifactType = agent.DefaultArtifactType || null;
        }
        return base;
    }
}
