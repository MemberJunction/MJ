import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { RunView } from "@memberjunction/core";
import { MJActionParamEntity } from "@memberjunction/core-entities";

/**
 * Action that finds the best-matching actions for a given task using embedding-based semantic search.
 *
 * This action uses local embeddings to perform fast similarity search across all available actions,
 * returning the most relevant actions based on their descriptions and capabilities.
 *
 * @example
 * ```typescript
 * // Find actions for a web search task
 * await runAction({
 *   ActionName: 'Find Candidate Actions',
 *   Params: [{
 *     Name: 'TaskDescription',
 *     Value: 'Search the internet for information on a topic'
 *   }, {
 *     Name: 'MaxResults',
 *     Value: 5
 *   }, {
 *     Name: 'MinimumSimilarityScore',
 *     Value: 0.6
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Find Candidate Actions")
export class FindBestActionAction extends BaseAction {
    /**
     * Executes the Find Candidate Actions action.
     *
     * @param params - The action parameters containing:
     *   - TaskDescription: Description of the task to find actions for (required)
     *   - MaxResults: Maximum number of actions to return (optional, default: 10)
     *   - MinimumSimilarityScore: Minimum similarity score 0-1 (optional, default: 0.5)
     *   - ExcludeAgentManagement: Exclude Agent Management actions (optional, default: true)
     *
     * @returns Action result with matched actions
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract and validate input parameters
            const taskDescription = this.getParamValue(params, 'taskdescription');
            const maxResults = parseInt(this.getParamValue(params, 'maxresults') || '10');
            const minimumSimilarityScore = parseFloat(this.getParamValue(params, 'minimumsimilarityscore') || '0.5');
            const excludeAgentManagement = this.getBooleanParam(params, 'excludeagentmanagement', true);

            // Validate required input
            if (!taskDescription || taskDescription.trim().length === 0) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'TaskDescription parameter is required and cannot be empty'
                };
            }

            // Validate numeric ranges
            if (maxResults < 1 || maxResults > 50) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'MaxResults must be between 1 and 50'
                };
            }

            if (minimumSimilarityScore < 0 || minimumSimilarityScore > 1) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'MinimumSimilarityScore must be between 0 and 1'
                };
            }

            // Validate contextUser is provided
            if (!params.ContextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'User context required'
                };
            }

            // Ensure AIEngine is loaded (embeddings computed during initialization)
            await AIEngine.Instance.Config(false, params.ContextUser);

            // Find similar actions using AIEngine's built-in method - no database round trip!
            const matchedActions = await AIEngine.Instance.FindSimilarActions(
                taskDescription,
                maxResults * 2, // Get 2x results to account for filtering
                minimumSimilarityScore
            );

            // Filter out Agent Management actions if requested
            let filteredActions = matchedActions;
            if (excludeAgentManagement) {
                filteredActions = matchedActions.filter(a =>
                    a.categoryName !== 'Agent Management'
                );
            }

            // Limit to maxResults after filtering
            filteredActions = filteredActions.slice(0, maxResults);

            if (filteredActions.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_ACTIONS_FOUND',
                    Message: `No actions found matching the criteria (minimum similarity: ${minimumSimilarityScore}).`
                };
            }

            // Load action parameters for all matched actions
            const actionIds = filteredActions.map(a => a.actionId);
            const rv = new RunView();
            const paramsResult = await rv.RunView<MJActionParamEntity>({
                EntityName: 'MJ: Action Params',
                ExtraFilter: `ActionID IN ('${actionIds.join("','")}')`,
                OrderBy: 'ActionID, Name',
                ResultType: 'entity_object'
            }, params.ContextUser);

            // Group parameters by action ID
            const paramsByActionId = new Map<string, MJActionParamEntity[]>();
            if (paramsResult.Success && paramsResult.Results) {
                for (const param of paramsResult.Results) {
                    const actionId = param.ActionID;
                    if (!paramsByActionId.has(actionId)) {
                        paramsByActionId.set(actionId, []);
                    }
                    paramsByActionId.get(actionId)!.push(param);
                }
            }

            // Build response with parameters included
            const actionsWithParams = filteredActions.map(a => ({
                actionId: a.actionId,
                actionName: a.actionName,
                similarityScore: Math.round(a.similarityScore * 100) / 100,
                description: a.description,
                categoryName: a.categoryName,
                status: a.status,
                driverClass: a.driverClass,
                parameters: (paramsByActionId.get(a.actionId) || []).map(p => ({
                    name: p.Name,
                    type: p.Type, // Input/Output
                    valueType: p.ValueType,
                    isArray: p.IsArray,
                    description: p.Description,
                    isRequired: p.IsRequired,
                    defaultValue: p.DefaultValue
                }))
            }));

            // Add output parameters
            params.Params.push({
                Name: 'MatchedActions',
                Type: 'Output',
                Value: actionsWithParams
            });

            params.Params.push({
                Name: 'MatchCount',
                Type: 'Output',
                Value: filteredActions.length
            });

            // Build response message with full descriptions and parameters
            const responseData = {
                message: `Found ${filteredActions.length} relevant action(s)`,
                taskDescription: taskDescription,
                matchCount: filteredActions.length,
                allMatches: actionsWithParams
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
                Message: `Failed to Find Candidate Actions: ${error instanceof Error ? error.message : String(error)}`
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