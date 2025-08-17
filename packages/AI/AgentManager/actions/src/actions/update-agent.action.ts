import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIPromptEntityExtended, AIAgentPromptEntity } from "@memberjunction/core-entities";
import { RunView } from "@memberjunction/core";
import { BaseAction } from "@memberjunction/actions";

/**
 * Updates an existing AI agent's configuration.
 * This action is restricted to the Agent Manager agent only.
 * Optionally updates the agent's prompt text if provided.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Update Agent',
 *   Params: [
 *     { Name: 'AgentID', Value: 'agent-id-to-update' },
 *     { Name: 'Name', Value: 'New Agent Name' }, // Optional
 *     { Name: 'Description', Value: 'New description' }, // Optional
 *     { Name: 'Status', Value: 'Inactive' }, // Optional
 *     { Name: 'PromptText', Value: 'Updated prompt text...' } // Optional, updates prompt
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Update Agent")
export class UpdateAgentAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract required parameter
            const agentIDResult = this.getStringParam(params, 'AgentID');
            if (agentIDResult.error) return agentIDResult.error;

            // Extract optional parameters
            const nameResult = this.getStringParam(params, 'Name', false);
            const descriptionResult = this.getStringParam(params, 'Description', false);
            const statusResult = this.getStringParam(params, 'Status', false);
            const promptTextResult = this.getStringParam(params, 'PromptText', false);

            // Load the agent
            const agentResult = await this.loadAgent(agentIDResult.value!, params.ContextUser);
            if (agentResult.error) return agentResult.error;

            const agent = agentResult.agent!;
            let hasChanges = false;

            // Update fields if provided
            if (nameResult.value !== undefined) {
                agent.Name = nameResult.value;
                hasChanges = true;
            }

            if (descriptionResult.value !== undefined) {
                agent.Description = descriptionResult.value;
                hasChanges = true;
            }

            if (statusResult.value !== undefined) {
                agent.Status = statusResult.value;
                hasChanges = true;
            }

            // Save if there are changes
            if (hasChanges) {
                const saveResult = await agent.Save();
                
                if (!saveResult) {
                    const latestResult = agent.LatestResult;
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: latestResult?.Message || 'Failed to save agent updates'
                    };
                }
            }

            // Handle prompt text update if provided
            if (promptTextResult.value !== undefined) {
                const promptUpdateResult = await this.updateAgentPrompt(
                    agent,
                    promptTextResult.value,
                    params.ContextUser
                );
                
                if (!promptUpdateResult.success) {
                    return {
                        Success: hasChanges,
                        ResultCode: hasChanges ? 'PARTIAL_SUCCESS' : 'PROMPT_UPDATE_FAILED',
                        Message: hasChanges 
                            ? `Agent updated successfully, but prompt update failed: ${promptUpdateResult.error}`
                            : `Failed to update prompt: ${promptUpdateResult.error}`,
                        Params: params.Params
                    };
                }
                
                hasChanges = true;
                
                // Add prompt ID to output
                if (promptUpdateResult.promptId) {
                    params.Params.push({
                        Name: 'PromptID',
                        Value: promptUpdateResult.promptId,
                        Type: 'Output'
                    });
                }
            }

            if (hasChanges) {
                // Add output parameter
                params.Params.push({
                    Name: 'Success',
                    Value: true,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully updated agent '${agent.Name}'`,
                    Params: params.Params
                };
            } else {
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: 'No changes to update',
                    Params: params.Params
                };
            }

        } catch (e) {
            return this.handleError(e, 'update agent');
        }
    }

    /**
     * Updates or creates an agent's prompt
     */
    private async updateAgentPrompt(
        agent: any,
        promptText: string,
        contextUser: any
    ): Promise<{ success: boolean; promptId?: string; error?: string }> {
        try {
            const md = this.getMetadata();
            const rv = new RunView();
            
            // First, check if agent already has a prompt
            const agentPromptResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID = '${agent.ID}' AND Status = 'Active'`,
                OrderBy: 'ExecutionOrder',
                MaxRows: 1,
                ResultType: 'simple'
            }, contextUser);
            
            if (agentPromptResult.Success && agentPromptResult.Results && agentPromptResult.Results.length > 0) {
                // Update existing prompt
                const agentPrompt = agentPromptResult.Results[0];
                const prompt = await md.GetEntityObject<AIPromptEntityExtended>('AI Prompts', contextUser);
                
                if (!prompt) {
                    return { success: false, error: 'Failed to create AI Prompt entity object' };
                }
                
                const loadResult = await prompt.Load(agentPrompt.PromptID);
                if (!loadResult) {
                    return { success: false, error: 'Failed to load existing prompt' };
                }
                
                prompt.TemplateText = promptText;
                
                const saveResult = await prompt.Save();
                if (!saveResult) {
                    return { 
                        success: false, 
                        error: prompt.LatestResult?.Message || 'Failed to update prompt' 
                    };
                }
                
                return { success: true, promptId: prompt.ID };
                
            } else {
                // Create new prompt - use base class method
                return await this.createAndAssociatePrompt(agent, promptText, contextUser);
            }
            
        } catch (e) {
            return { 
                success: false, 
                error: e instanceof Error ? e.message : 'Unknown error updating prompt' 
            };
        }
    }
}

export function LoadUpdateAgentAction() {
    // This function exists to prevent tree shaking from removing the action class
}