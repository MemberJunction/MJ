import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RunView } from "@memberjunction/core";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIAgentPromptEntity } from "@memberjunction/core-entities";

/**
 * Deactivates an AI agent by setting its status to 'Inactive'.
 * This is a soft delete operation that preserves the agent record but marks it as inactive.
 * Restricted to Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Deactivate Agent',
 *   Params: [
 *     { Name: 'AgentID', Value: '12345678-1234-1234-1234-123456789012' },
 *     { Name: 'Reason', Value: 'No longer needed' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Deactivate Agent")
export class DeactivateAgentAction extends BaseAgentManagementAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Validate permissions
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) {
                return permissionError;
            }

            // 2. Extract and validate parameters
            const agentIdResult = this.getStringParam(params, 'AgentID');
            if (agentIdResult.error) {
                return agentIdResult.error;
            }

            const reasonResult = this.getStringParam(params, 'Reason', false);
            const reason = reasonResult.value || 'Deactivated by Agent Manager';

            // 3. Load the agent
            const agentResult = await this.loadAgent(agentIdResult.value!, params.ContextUser);
            if (agentResult.error) {
                return agentResult.error;
            }

            const agent = agentResult.agent!;

            // 4. Check if agent is already disabled
            if (agent.Status === 'Disabled') {
                return this.createSuccessResult(params, false, 'Agent is already disabled');
            }

            // 5. Update agent status to disabled
            agent.Status = 'Disabled';
            
            // Add deactivation note to description if there's a reason
            if (reason !== 'Deactivated by Agent Manager') {
                const currentDescription = agent.Description || '';
                const deactivationNote = `\n\n[DEACTIVATED: ${new Date().toISOString()}] ${reason}`;
                agent.Description = currentDescription + deactivationNote;
            }

            // 6. Save the agent
            const saved = await agent.Save();
            if (!saved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: agent.LatestResult?.Message || 'Failed to save agent deactivation'
                };
            }

            // 7. Also deactivate any associated prompts
            await this.deactivateAgentPrompts(agent.ID, params.ContextUser);

            // 8. Return success result
            return this.createSuccessResult(params, true, `Agent '${agent.Name}' has been deactivated successfully`);

        } catch (e) {
            return this.handleError(e, 'deactivate agent');
        }
    }

    /**
     * Deactivates all prompts associated with the agent
     */
    private async deactivateAgentPrompts(agentId: string, contextUser: any): Promise<void> {
        try {
            const md = this.getMetadata();
            
            // Get all agent prompt associations
            const agentPrompt = await md.GetEntityObject('MJ: AI Agent Prompts', contextUser);
            if (!agentPrompt) {
                return;
            }

            // Find all active prompt associations for this agent
            const rv = new RunView();
            const result = await rv.RunView<AIAgentPromptEntity>({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID = '${agentId}' AND Status = 'Active'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results) {
                // Deactivate each prompt association
                for (const promptAssoc of result.Results) {
                    promptAssoc.Status = 'Inactive';
                    await promptAssoc.Save();
                }
            }
        } catch (e) {
            // Log error but don't fail the main operation
            console.error('Error deactivating agent prompts:', e);
        }
    }

    /**
     * Creates a success result with the appropriate output parameters
     */
    private createSuccessResult(params: RunActionParams, success: boolean, message: string): ActionResultSimple {
        // Add Success output parameter
        params.Params.push({
            Name: 'Success',
            Value: success.toString(),
            Type: 'Output'
        });

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: message,
            Params: params.Params
        };
    }
}

/**
 * Function to load the action and prevent tree shaking
 */
export function LoadDeactivateAgentAction() {
    return DeactivateAgentAction;
}