import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { AIAgentPermissionHelper } from "@memberjunction/ai-engine-base";

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
    // Singleton initialization removed - AIEngine handles embedding lifecycle

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

            // Ensure AIEngine is loaded (embeddings computed during initialization)
            await AIEngine.Instance.Config(false, params.ContextUser);

            // Find similar agents using AIEngine's built-in method - no database round trip!
            const matchedAgents = await AIEngine.Instance.FindSimilarAgents(
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

            // Filter matched agents by permissions
            let permissionFilteredAgents = matchedAgents.filter(a => accessibleAgentIds.has(a.agentId));

            // Filter by status if not including inactive
            if (!includeInactive) {
                permissionFilteredAgents = permissionFilteredAgents.filter(a => a.status === 'Active');
            }

            // Filter by invocation mode - exclude Sub-Agent agents (only show Any or Top-Level)
            // Sub-Agents are meant to be called by other agents, not discovered by users/tools
            const invocationFilteredAgents = permissionFilteredAgents.filter(a =>
                a.invocationMode !== 'Sub-Agent'
            );

            // Limit to maxResults after all filtering
            const filteredAgents = invocationFilteredAgents.slice(0, maxResults);

            if (filteredAgents.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_AGENTS_FOUND',
                    Message: `No accessible agents found matching the criteria (minimum similarity: ${minimumSimilarityScore}). You may not have permission to run the matching agents.`
                };
            }

            // AIEngine already loaded above - use it to get agent actions
            // Create map of agentId -> action names
            const agentActionsMap = new Map<string, string[]>();
            for (const agent of filteredAgents) {
                const agentActions = AIEngine.Instance.AgentActions
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
                    agentId: a.agentId,  // Include agent ID for direct use with Load Agent Spec
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