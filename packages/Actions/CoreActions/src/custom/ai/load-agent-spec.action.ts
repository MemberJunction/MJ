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

            // Ensure FunctionalRequirements and TechnicalDesign are always present (even if null)
            if (!('FunctionalRequirements' in agentSpec)) {
                agentSpec.FunctionalRequirements = null;
            }
            if (!('TechnicalDesign' in agentSpec)) {
                agentSpec.TechnicalDesign = null;
            }

            // Create truncated version for both output param and Message
            const truncatedSpec = this.truncatePromptTexts(agentSpec);

            // Add truncated AgentSpec as output parameter
            params.Params.push({
                Name: 'AgentSpec',
                Type: 'Output',
                Value: truncatedSpec
            });

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(truncatedSpec, null, 2)
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

    /**
     * Truncates PromptText fields in SubAgents (and nested SubAgents) recursively.
     * Top-level agent prompts are NOT truncated - only subagent prompts.
     * Applied to both the AgentSpec output parameter and Message to avoid super long outputs.
     */
    private truncatePromptTexts(spec: any, maxLength: number = 100): any {
        // Deep clone to avoid modifying the original
        const truncated = JSON.parse(JSON.stringify(spec));

        // Recursively truncate SubAgents only (not top-level prompts)
        if (truncated.SubAgents && Array.isArray(truncated.SubAgents)) {
            for (const subAgentWrapper of truncated.SubAgents) {
                if (subAgentWrapper.SubAgent) {
                    this.truncateSubAgent(subAgentWrapper.SubAgent, maxLength);
                }
            }
        }

        return truncated;
    }

    /**
     * Recursively truncates PromptText in a subagent and its nested subagents
     */
    private truncateSubAgent(subAgent: any, maxLength: number): void {
        // Truncate prompts in this subagent
        if (subAgent.Prompts && Array.isArray(subAgent.Prompts)) {
            for (const prompt of subAgent.Prompts) {
                if (prompt.PromptText && typeof prompt.PromptText === 'string' && prompt.PromptText.length > maxLength) {
                    prompt.PromptText = prompt.PromptText.substring(0, maxLength) + '...';
                }
            }
        }

        // Recursively process nested subagents
        if (subAgent.SubAgents && Array.isArray(subAgent.SubAgents)) {
            for (const nestedWrapper of subAgent.SubAgents) {
                if (nestedWrapper.SubAgent) {
                    this.truncateSubAgent(nestedWrapper.SubAgent, maxLength);
                }
            }
        }
    }
}