import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AgentEmbeddingService } from "@memberjunction/ai-agents";
import { AIAgentPermissionHelper, AIEngineBase } from "@memberjunction/ai-engine-base";

/**
 * Action that finds the best-matching AI agents for a given task using embedding-based semantic search.
 *
 * This action uses local embeddings to perform fast similarity search across all available agents,
 * returning the most relevant agents based on their descriptions and capabilities.
 *
 * @example
 * ```typescript
 * // Find agents for a research task
 * await runAction({
 *   ActionName: 'Find Best Agent',
 *   Params: [{
 *     Name: 'TaskDescription',
 *     Value: 'Research market trends and compile a comprehensive report'
 *   }, {
 *     Name: 'MaxResults',
 *     Value: 5
 *   }, {
 *     Name: 'MinimumSimilarityScore',
 *     Value: 0.7
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Best Agent")
export class FindBestAgentAction extends BaseAction {

    private static embeddingService: AgentEmbeddingService | null = null;
    private static initializationPromise: Promise<void> | null = null;

    /**
     * Ensures the embedding service is initialized.
     * Uses a singleton pattern to avoid multiple initializations.
     */
    private async ensureInitialized(contextUser?: any): Promise<void> {
        // If already initialized, return immediately
        if (FindBestAgentAction.embeddingService?.isInitialized) {
            return;
        }

        // If initialization is in progress, wait for it
        if (FindBestAgentAction.initializationPromise) {
            return FindBestAgentAction.initializationPromise;
        }

        // Start initialization
        FindBestAgentAction.initializationPromise = (async () => {
            try {
                FindBestAgentAction.embeddingService = new AgentEmbeddingService();
                await FindBestAgentAction.embeddingService.initialize(contextUser, false);
            } finally {
                FindBestAgentAction.initializationPromise = null;
            }
        })();

        return FindBestAgentAction.initializationPromise;
    }

    /**
     * Executes the Find Best Agent action.
     *
     * @param params - The action parameters containing:
     *   - TaskDescription: Description of the task to find agents for (required)
     *   - MaxResults: Maximum number of agents to return (optional, default: 5)
     *   - MinimumSimilarityScore: Minimum similarity score 0-1 (optional, default: 0.5)
     *   - IncludeInactive: Include inactive agents (optional, default: false)
     *
     * @returns Action result with matched agents
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract and validate input parameters
            const taskDescription = this.getParamValue(params, 'taskdescription');
            const maxResults = parseInt(this.getParamValue(params, 'maxresults') || '5');
            const minimumSimilarityScore = parseFloat(this.getParamValue(params, 'minimumsimilarityscore') || '0.5');
            const includeInactive = this.getBooleanParam(params, 'includeinactive', false);

            // Validate required input
            if (!taskDescription || taskDescription.trim().length === 0) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'TaskDescription parameter is required and cannot be empty'
                };
            }

            // Validate numeric ranges
            if (maxResults < 1 || maxResults > 20) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'MaxResults must be between 1 and 20'
                };
            }

            if (minimumSimilarityScore < 0 || minimumSimilarityScore > 1) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'MinimumSimilarityScore must be between 0 and 1'
                };
            }

            // Validate contextUser is provided for permission filtering
            if (!params.ContextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'User context required for permission filtering'
                };
            }

            // Ensure embedding service is initialized
            await this.ensureInitialized(params.ContextUser);

            if (!FindBestAgentAction.embeddingService) {
                return {
                    Success: false,
                    ResultCode: 'INITIALIZATION_ERROR',
                    Message: 'Failed to initialize agent embedding service'
                };
            }

            // Find similar agents - get more results to account for permission filtering
            const matchedAgents = await FindBestAgentAction.embeddingService.findSimilarAgents(
                taskDescription,
                maxResults * 3, // Get 3x results to account for filtering
                minimumSimilarityScore
            );

            // Filter by user permissions - user must have 'run' permission
            const accessibleAgents = await AIAgentPermissionHelper.GetAccessibleAgents(
                params.ContextUser,
                'run'
            );
            const accessibleAgentIds = new Set(accessibleAgents.map(a => a.ID));

            // Filter matched agents by permissions AND status
            const permissionFilteredAgents = matchedAgents.filter(a => accessibleAgentIds.has(a.agentId));
            const statusFilteredAgents = includeInactive
                ? permissionFilteredAgents
                : permissionFilteredAgents.filter(a => a.status === 'Active');

            // Limit to maxResults after all filtering
            const filteredAgents = statusFilteredAgents.slice(0, maxResults);

            if (filteredAgents.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_AGENTS_FOUND',
                    Message: `No accessible agents found matching the criteria (minimum similarity: ${minimumSimilarityScore}). You may not have permission to run the matching agents.`
                };
            }

            // Load AIEngineBase to get agent actions
            await AIEngineBase.Instance.Config(false, params.ContextUser);

            // Create map of agentId -> action names
            const agentActionsMap = new Map<string, string[]>();
            for (const agent of filteredAgents) {
                const agentActions = AIEngineBase.Instance.AgentActions
                    .filter(aa => aa.AgentID === agent.agentId && aa.Status === 'Active')
                    .map(aa => aa.Action);  // Get action name
                agentActionsMap.set(agent.agentId, agentActions);
            }

            // Add output parameters
            params.Params.push({
                Name: 'MatchedAgents',
                Type: 'Output',
                Value: filteredAgents
            });

            params.Params.push({
                Name: 'MatchCount',
                Type: 'Output',
                Value: filteredAgents.length
            });

            // Build response message with full descriptions and actions
            const responseData = {
                message: `Found ${filteredAgents.length} accessible agent(s)`,
                taskDescription: taskDescription,
                matchCount: filteredAgents.length,
                allMatches: filteredAgents.map(a => ({
                    agentName: a.agentName,
                    similarityScore: Math.round(a.similarityScore * 100) / 100, // Round to 2 decimal places
                    description: a.description,  // Full description, no truncation
                    actions: agentActionsMap.get(a.agentId) || []
                }))
            };

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(responseData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Failed to find best agent: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Get boolean parameter with default
     */
    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}

/**
 * Loader function to ensure the FindBestAgentAction class is included in the bundle
 */
export function LoadFindBestAgentAction() {
    // Stub function to prevent tree shaking
}
