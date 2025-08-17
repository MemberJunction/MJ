import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { AIAgentEntityExtended } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Gets detailed information about a specific agent including its full hierarchy
 * (sub-agents, sub-sub-agents, etc.) and associated actions at each level.
 * This action is restricted to the Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Get Agent Details',
 *   Params: [
 *     { Name: 'AgentID', Value: 'agent-id' },
 *     { Name: 'IncludePrompts', Value: 'true' } // Optional, default false
 *   ]
 * });
 * // Returns AgentDetails object in output params
 * ```
 */
@RegisterClass(BaseAction, "Get Agent Details")
export class GetAgentDetailsAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract parameters
            const agentIDResult = this.getStringParam(params, 'AgentID');
            if (agentIDResult.error) return agentIDResult.error;

            const includePromptsResult = this.getBooleanParam(params, 'IncludePrompts', false);
            const includePrompts = includePromptsResult.value ?? false;

            // Load the agent
            const agentResult = await this.loadAgent(agentIDResult.value!, params.ContextUser);
            if (agentResult.error) return agentResult.error;

            // Get full agent details including hierarchy
            const agentDetails = await this.getAgentDetailsWithHierarchy(
                agentResult.agent!,
                includePrompts,
                params.ContextUser
            );

            // Add output parameter
            params.Params.push({
                Name: 'AgentDetails',
                Value: agentDetails,
                Type: 'Output'
            });

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved details for agent '${agentResult.agent!.Name}'`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'get agent details');
        }
    }

    /**
     * Recursively builds the agent hierarchy with all sub-agents and their actions
     */
    private async getAgentDetailsWithHierarchy(
        agent: AIAgentEntityExtended,
        includePrompts: boolean,
        contextUser: any
    ): Promise<any> {
        const rv = new RunView();

        // Build the views to run in parallel
        const viewsToRun = [
            {
                EntityName: 'AI Agent Actions',
                ExtraFilter: `AgentID = '${agent.ID}' AND Status = 'Active'`,
                OrderBy: 'CreatedAt',
                ResultType: 'entity_object' as const
            },
            {
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID = '${agent.ID}'`,
                OrderBy: 'ExecutionOrder, Name',
                ResultType: 'entity_object' as const
            }
        ];

        // Add prompts view if requested
        if (includePrompts) {
            viewsToRun.push({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID = '${agent.ID}' AND Status = 'Active'`,
                OrderBy: 'ExecutionOrder',
                ResultType: 'entity_object' as const
            });
        }

        // Run all views in parallel with a single database operation
        const results = await rv.RunViews(viewsToRun, contextUser);

        // Extract results
        const actionsResult = results[0];
        const subAgentsResult = results[1];
        const promptsResult = includePrompts ? results[2] : null;

        const actions = actionsResult.Success ? (actionsResult.Results || []) : [];
        const subAgents = subAgentsResult.Success ? (subAgentsResult.Results || []) : [];
        const prompts = promptsResult?.Success ? (promptsResult.Results || []) : [];

        // Recursively get details for each sub-agent
        const subAgentDetails = await Promise.all(
            subAgents.map(subAgent => 
                this.getAgentDetailsWithHierarchy(subAgent, includePrompts, contextUser)
            )
        );

        // Build the result object
        const details: any = {
            ID: agent.ID,
            Name: agent.Name,
            Description: agent.Description,
            Type: agent.Type,
            Status: agent.Status,
            ExecutionOrder: agent.ExecutionOrder,
            ExposeAsAction: agent.ExposeAsAction,
            ParentID: agent.ParentID,
            Actions: actions.map(a => ({
                ID: a.ID,
                ActionID: a.ActionID,
                ActionName: a.Action,
                Status: a.Status
            }))
        };

        if (includePrompts) {
            details.Prompts = prompts.map(p => ({
                ID: p.ID,
                PromptID: p.PromptID,
                PromptName: p.Prompt,
                ExecutionOrder: p.ExecutionOrder,
                Status: p.Status
            }));
        }

        if (subAgentDetails.length > 0) {
            details.SubAgents = subAgentDetails;
        }

        return details;
    }

    /**
     * Helper to parse boolean parameters
     */
    private getBooleanParam(params: RunActionParams, paramName: string, isRequired: boolean = true): 
        { value?: boolean; error?: ActionResultSimple } {
        const param = params.Params.find(p => p.Name === paramName);
        
        if (!param) {
            if (isRequired) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'MISSING_PARAMETER',
                        Message: `Required parameter '${paramName}' not found`
                    }
                };
            }
            return { value: undefined };
        }

        const value = param.Value === 'true' || param.Value === true || param.Value === '1' || param.Value === 1;
        return { value };
    }
}

export function LoadGetAgentDetailsAction() {
    // This function exists to prevent tree shaking from removing the action class
}