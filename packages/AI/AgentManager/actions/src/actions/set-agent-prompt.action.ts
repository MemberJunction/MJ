import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIAgentPromptEntity, AIPromptEntity } from "@memberjunction/core-entities";

/**
 * Associates or updates a prompt for an AI agent. This action creates or updates the relationship
 * between an agent and a prompt, including execution order and status.
 * Restricted to Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Set Agent Prompt',
 *   Params: [
 *     { Name: 'AgentID', Value: '12345678-1234-1234-1234-123456789012' },
 *     { Name: 'PromptID', Value: '87654321-4321-4321-4321-210987654321' },
 *     { Name: 'ExecutionOrder', Value: '1' },
 *     { Name: 'Status', Value: 'Active' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Set Agent Prompt")
export class SetAgentPromptAction extends BaseAgentManagementAction {
    
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

            const promptIdResult = this.getStringParam(params, 'PromptID');
            if (promptIdResult.error) {
                return promptIdResult.error;
            }

            const executionOrderResult = this.getStringParam(params, 'ExecutionOrder', false);
            const executionOrder = parseInt(executionOrderResult.value || '0');

            const statusResult = this.getStringParam(params, 'Status', false);
            const status = statusResult.value || 'Active';

            // Validate status
            const statusValidation = this.validateStatus(status);
            if (statusValidation) {
                return statusValidation;
            }

            // 3. Validate that the agent exists
            const agentResult = await this.loadAgent(agentIdResult.value!, params.ContextUser);
            if (agentResult.error) {
                return agentResult.error;
            }

            // 4. Validate that the prompt exists
            const promptResult = await this.loadPrompt(promptIdResult.value!, params.ContextUser);
            if (promptResult.error) {
                return promptResult.error;
            }

            // 5. Check if association already exists
            const existingAssociation = await this.findExistingAssociation(
                agentIdResult.value!,
                promptIdResult.value!,
                params.ContextUser
            );

            let associationId: string;

            if (existingAssociation) {
                // Update existing association
                associationId = await this.updateAssociation(
                    existingAssociation,
                    executionOrder,
                    status
                );
            } else {
                // Create new association
                const createResult = await this.createAssociation(
                    agentIdResult.value!,
                    promptIdResult.value!,
                    executionOrder,
                    status,
                    params.ContextUser
                );

                if (createResult.error) {
                    return createResult.error;
                }

                associationId = createResult.associationId!;
            }

            // 6. Add association ID as output parameter
            params.Params.push({
                Name: 'AssociationID',
                Value: associationId,
                Type: 'Output'
            });

            // 7. Return success result
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Prompt association ${existingAssociation ? 'updated' : 'created'} successfully`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'set agent prompt');
        }
    }

    /**
     * Loads a prompt by ID
     */
    private async loadPrompt(promptId: string, contextUser: any): Promise<{
        prompt?: AIPromptEntity;
        error?: ActionResultSimple;
    }> {
        try {
            const md = this.getMetadata();
            const prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts', contextUser);
            
            if (!prompt) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'FAILED',
                        Message: 'Failed to create AI Prompt entity object'
                    }
                };
            }

            const loaded = await prompt.Load(promptId);
            if (!loaded) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'NOT_FOUND',
                        Message: `Prompt with ID '${promptId}' not found`
                    }
                };
            }

            return { prompt };
        } catch (e) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: `Error loading prompt: ${e instanceof Error ? e.message : 'Unknown error'}`
                }
            };
        }
    }

    /**
     * Finds an existing association between agent and prompt
     */
    private async findExistingAssociation(
        agentId: string,
        promptId: string,
        contextUser: any
    ): Promise<AIAgentPromptEntity | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID = '${agentId}' AND PromptID = '${promptId}'`,
                MaxRows: 1,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0] as AIAgentPromptEntity;
            }

            return null;
        } catch (e) {
            console.error('Error finding existing association:', e);
            return null;
        }
    }

    /**
     * Creates a new agent-prompt association
     */
    private async createAssociation(
        agentId: string,
        promptId: string,
        executionOrder: number,
        status: string,
        contextUser: any
    ): Promise<{ associationId?: string; error?: ActionResultSimple }> {
        try {
            const md = this.getMetadata();
            const association = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts', contextUser);
            
            if (!association) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'FAILED',
                        Message: 'Failed to create AI Agent Prompt entity object'
                    }
                };
            }

            association.NewRecord();
            association.AgentID = agentId;
            association.PromptID = promptId;
            association.ExecutionOrder = executionOrder;
            association.Status = status as 'Active' | 'Inactive' | 'Deprecated' | 'Preview';

            const saved = await association.Save();
            if (!saved) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: association.LatestResult?.Message || 'Failed to save agent prompt association'
                    }
                };
            }

            return { associationId: association.ID };
        } catch (e) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: `Error creating association: ${e instanceof Error ? e.message : 'Unknown error'}`
                }
            };
        }
    }

    /**
     * Updates an existing agent-prompt association
     */
    private async updateAssociation(
        association: AIAgentPromptEntity,
        executionOrder: number,
        status: string
    ): Promise<string> {
        association.ExecutionOrder = executionOrder;
        association.Status = status as 'Active' | 'Inactive' | 'Deprecated' | 'Preview';

        const saved = await association.Save();
        if (!saved) {
            throw new Error(association.LatestResult?.Message || 'Failed to update agent prompt association');
        }

        return association.ID;
    }

    /**
     * Validates execution order is reasonable
     */
    private validateExecutionOrder(executionOrder: number): ActionResultSimple | null {
        if (executionOrder < 0) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'ExecutionOrder must be non-negative'
            };
        }

        if (executionOrder > 1000) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: 'ExecutionOrder must be less than or equal to 1000'
            };
        }

        return null;
    }

    /**
     * Validates status value
     */
    private validateStatus(status: string): ActionResultSimple | null {
        const validStatuses = ['Active', 'Inactive', 'Deprecated', 'Preview'];
        
        if (!validStatuses.includes(status)) {
            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: `Status must be one of: ${validStatuses.join(', ')}`
            };
        }

        return null;
    }
}

/**
 * Function to load the action and prevent tree shaking
 */
export function LoadSetAgentPromptAction() {
    return SetAgentPromptAction;
}