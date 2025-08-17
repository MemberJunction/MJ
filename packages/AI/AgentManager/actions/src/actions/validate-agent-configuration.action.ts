import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { AIAgentEntity } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Validates that an agent has all required prompts and actions configured.
 * This action is restricted to the Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Validate Agent Configuration',
 *   Params: [
 *     { Name: 'AgentID', Value: 'agent-id-to-validate' }
 *   ]
 * });
 * // Returns IsValid boolean and ValidationErrors array in output params
 * ```
 */
@RegisterClass(BaseAction, "__ValidateAgentConfiguration")
export class ValidateAgentConfigurationAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract required parameter
            const agentIDResult = this.getStringParam(params, 'AgentID');
            if (agentIDResult.error) return agentIDResult.error;

            // Load the agent
            const agentResult = await this.loadAgent(agentIDResult.value!, params.ContextUser);
            if (agentResult.error) return agentResult.error;

            // Perform validation
            const validationResult = await this.validateAgentConfiguration(
                agentResult.agent!,
                params.ContextUser
            );

            // Add output parameters
            params.Params.push({
                Name: 'IsValid',
                Value: validationResult.isValid,
                Type: 'Output'
            });

            params.Params.push({
                Name: 'ValidationErrors',
                Value: validationResult.errors,
                Type: 'Output'
            });

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: validationResult.isValid 
                    ? `Agent '${agentResult.agent!.Name}' configuration is valid`
                    : `Agent '${agentResult.agent!.Name}' configuration has ${validationResult.errors.length} validation error(s)`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'validate agent configuration');
        }
    }

    /**
     * Validates the agent configuration and returns validation results
     */
    private async validateAgentConfiguration(
        agent: AIAgentEntity,
        contextUser: any
    ): Promise<{ isValid: boolean; errors: string[] }> {
        const errors: string[] = [];
        
        try {
            // Check if agent is active
            if (agent.Status !== 'Active') {
                errors.push(`Agent status is '${agent.Status}', should be 'Active'`);
            }

            // Check if agent has a valid type
            if (!agent.TypeID) {
                errors.push('Agent must have a TypeID assigned');
            } else {
                const typeValidation = await this.validateAgentType(agent.TypeID, contextUser);
                if (typeValidation.error) {
                    errors.push(`Invalid agent type: ${typeValidation.error.Message}`);
                }
            }

            // Validate prompts configuration
            const promptErrors = await this.validateAgentPrompts(agent, contextUser);
            errors.push(...promptErrors);

            // Validate actions configuration
            const actionErrors = await this.validateAgentActions(agent, contextUser);
            errors.push(...actionErrors);

            // Validate agent hierarchy (if it's a parent agent)
            const hierarchyErrors = await this.validateAgentHierarchy(agent, contextUser);
            errors.push(...hierarchyErrors);

            return {
                isValid: errors.length === 0,
                errors
            };

        } catch (error) {
            errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                isValid: false,
                errors
            };
        }
    }

    /**
     * Validates that the agent has proper prompts configured
     */
    private async validateAgentPrompts(agent: AIAgentEntity, contextUser: any): Promise<string[]> {
        const errors: string[] = [];
        
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID = '${agent.ID}' AND Status = 'Active'`,
                OrderBy: 'ExecutionOrder',
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                errors.push('Failed to load agent prompts for validation');
                return errors;
            }

            const prompts = result.Results || [];

            // Check if agent has at least one active prompt
            if (prompts.length === 0) {
                errors.push('Agent must have at least one active prompt configured');
            } else {
                // Once we enforce these, we can uncomment the checks below

                // Check for system prompt (should be first in execution order)
                // const systemPrompt = prompts.find(p => p.ExecutionOrder === 1);
                // if (!systemPrompt) {
                //     errors.push('Agent should have a system prompt with ExecutionOrder = 1');
                // }

                // // Check for duplicate execution orders
                // const executionOrders = prompts.map(p => p.ExecutionOrder);
                // const duplicateOrders = executionOrders.filter((order, index) => executionOrders.indexOf(order) !== index);
                // if (duplicateOrders.length > 0) {
                //     errors.push(`Duplicate execution orders found in prompts: ${duplicateOrders.join(', ')}`);
                // }
            }

        } catch (error) {
            errors.push(`Error validating agent prompts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return errors;
    }

    /**
     * Validates that the agent has proper actions configured
     */
    private async validateAgentActions(agent: AIAgentEntity, contextUser: any): Promise<string[]> {
        const errors: string[] = [];
        
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'AI Agent Actions',
                ExtraFilter: `AgentID = '${agent.ID}' AND Status = 'Active'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                errors.push('Failed to load agent actions for validation');
                return errors;
            }

            const actions = result.Results || [];

            // Ensure that all actions have an ActionID
            if (actions.filter(a => !a.ActionID).length > 0) {
                errors.push('All agent actions must have a valid ActionID');
            }

            const actionIDStr = actions.map(a => `'${a.ActionID}'`).join(', ');

            // Validate that the referenced action exists and is active
            const actionResult = await rv.RunView({
                EntityName: 'Actions',
                ExtraFilter: `ID in (${actionIDStr})`,
                ResultType: 'simple'
            }, contextUser);

            if (!actionResult.Success || !actionResult.Results || actionResult.Results.length !== actions.length) {
                errors.push(`Referenced actions not found or mismatch in count. Expected ${actions.length}, found ${actionResult.Results ? actionResult.Results.length : 0}`);
            } else {
                for (const action of actionResult.Results) {
                    if (action.Status !== 'Active') {
                        errors.push(`Referenced action '${action.Name}' is not active (Status: ${action.Status})`);
                    }
                }
            }

        } catch (error) {
            errors.push(`Error validating agent actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return errors;
    }

    /**
     * Validates agent hierarchy if the agent has sub-agents
     */
    private async validateAgentHierarchy(agent: AIAgentEntity, contextUser: any): Promise<string[]> {
        const errors: string[] = [];
        
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID = '${agent.ID}'`,
                OrderBy: 'ExecutionOrder',
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                errors.push('Failed to load sub-agents for validation');
                return errors;
            }

            const subAgents = result.Results || [];

            if (subAgents.length > 0) {
                // Once we enforce these, we can uncomment the checks below

                // // Check for duplicate execution orders in sub-agents
                // const executionOrders = subAgents.map(a => a.ExecutionOrder);
                // const duplicateOrders = executionOrders.filter((order, index) => executionOrders.indexOf(order) !== index);
                // if (duplicateOrders.length > 0) {
                //     errors.push(`Duplicate execution orders found in sub-agents: ${duplicateOrders.join(', ')}`);
                // }

                // Check that all sub-agents are active (or at least not disabled)
                const inactiveSubAgents = subAgents.filter(a => a.Status === 'Disabled');
                if (inactiveSubAgents.length > 0) {
                    const names = inactiveSubAgents.map(a => a.Name).join(', ');
                    errors.push(`Sub-agents are disabled: ${names}`);
                }
            }

        } catch (error) {
            errors.push(`Error validating agent hierarchy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return errors;
    }
}

export function LoadValidateAgentConfigurationAction() {
    // This function exists to prevent tree shaking from removing the action class
}