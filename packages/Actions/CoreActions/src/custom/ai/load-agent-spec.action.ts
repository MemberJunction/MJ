import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AgentSpecSync } from "@memberjunction/ai-agent-manager";

/**
 * Action that loads the complete AgentSpec structure for an existing agent by ID.
 *
 * This action retrieves the full agent specification including all nested structures:
 * Actions, SubAgents, Prompts, Steps, and Paths. The result is the complete AgentSpec
 * JSON structure suitable for analysis, modification, or display.
 *
 * @example
 * ```typescript
 * // Load an agent's complete specification
 * await runAction({
 *   ActionName: 'Load Agent Spec',
 *   Params: [{
 *     Name: 'AgentID',
 *     Value: 'agent-uuid-here'
 *   }, {
 *     Name: 'IncludeSubAgents',
 *     Value: true  // Optional, defaults to true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Load Agent Spec")
export class LoadAgentSpecAction extends BaseAction {
    /**
     * Executes the Load Agent Spec action.
     *
     * @param params - The action parameters containing:
     *   - AgentID: The UUID of the agent to load (required)
     *   - IncludeSubAgents: Whether to load nested sub-agents recursively (optional, default: true)
     *
     * @returns Action result with complete AgentSpec structure
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract and validate input parameters
            const agentId = this.getParamValue(params, 'agentid');
            const includeSubAgents = this.getBooleanParam(params, 'includesubagents', true);

            // Validate required input
            if (!agentId || agentId.trim().length === 0) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'AgentID parameter is required and cannot be empty'
                };
            }

            // Validate agentId format (basic UUID check)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(agentId.trim())) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_INPUT',
                    Message: 'AgentID must be a valid UUID format'
                };
            }

            // Validate contextUser is provided for database operations
            if (!params.ContextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'User context required for loading agent from database'
                };
            }

            // Load agent from database using AgentSpecSync
            const specSync = await AgentSpecSync.LoadFromDatabase(
                agentId.trim(),
                params.ContextUser,
                includeSubAgents
            );

            if (!specSync) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Agent with ID "${agentId}" not found in database`
                };
            }

            // Get complete AgentSpec as JSON
            const agentSpec = specSync.toJSON();

            // Add output parameters
            params.Params.push({
                Name: 'AgentSpec',
                Type: 'Output',
                Value: agentSpec
            });

            params.Params.push({
                Name: 'AgentName',
                Type: 'Output',
                Value: agentSpec.Name
            });

            params.Params.push({
                Name: 'AgentType',
                Type: 'Output',
                Value: agentSpec.TypeID
            });

            // Build response message with summary
            const responseData = {
                message: `Successfully loaded agent "${agentSpec.Name}"`,
                agentId: agentSpec.ID,
                agentName: agentSpec.Name,
                agentType: agentSpec.TypeID,
                status: agentSpec.Status,
                description: agentSpec.Description,
                actionCount: agentSpec.Actions?.length || 0,
                subAgentCount: agentSpec.SubAgents?.length || 0,
                promptCount: agentSpec.Prompts?.length || 0,
                stepCount: agentSpec.Steps?.length || 0,
                pathCount: agentSpec.Paths?.length || 0,
                agentSpec: agentSpec  // Complete structure
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
                Message: `Failed to load agent spec: ${error instanceof Error ? error.message : String(error)}`
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
 * Loader function to ensure the LoadAgentSpecAction class is included in the bundle
 */
export function LoadLoadAgentSpecAction() {
    // Stub function to prevent tree shaking
}
