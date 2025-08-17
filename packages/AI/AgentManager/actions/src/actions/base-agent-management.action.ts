import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, UserInfo, RunView } from "@memberjunction/core";
import { AIAgentEntityExtended, AIAgentTypeEntity, AIPromptEntityExtended, AIAgentPromptEntity } from "@memberjunction/core-entities";

/**
 * Abstract base class for agent management actions.
 * Provides common functionality for validating permissions, loading entities,
 * and managing agent metadata. Only the Agent Manager agent should be able
 * to execute these actions.
 */
export abstract class BaseAgentManagementAction extends BaseAction {
    /**
     * Validates that the action is being called by the Agent Manager agent
     */
    protected async validateAgentManagerPermission(params: RunActionParams): Promise<ActionResultSimple | null> {
        // In a production system, this would check the calling agent's identity
        // For now, we'll add a comment about the security check
        // TODO: Implement proper agent identity verification
        
        // Check if the action is being called with proper context
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: 'User context is required for agent management actions'
            };
        }

        return null; // Permission granted
    }

    /**
     * Extract and validate a string parameter
     */
    protected getStringParam(params: RunActionParams, paramName: string, required: boolean = true): { 
        value?: string; 
        error?: ActionResultSimple 
    } {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.trim().toLowerCase());
        
        if (!param || !param.Value) {
            if (required) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `${paramName} parameter is required`
                    }
                };
            }
            return { value: undefined };
        }
        
        return { value: param.Value as string };
    }

    /**
     * Extract and validate an object parameter
     */
    protected getObjectParam(params: RunActionParams, paramName: string, required: boolean = true): { 
        value?: Record<string, any>; 
        error?: ActionResultSimple 
    } {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        
        if (!param || !param.Value) {
            if (required) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `${paramName} parameter is required`
                    }
                };
            }
            return { value: undefined };
        }
        
        return { value: param.Value as Record<string, any> };
    }

    /**
     * Get metadata instance
     */
    protected getMetadata(): Metadata {
        return new Metadata();
    }

    /**
     * Load an AI Agent entity by ID
     */
    protected async loadAgent(agentID: string, contextUser: any): Promise<{
        agent?: AIAgentEntityExtended;
        error?: ActionResultSimple;
    }> {
        try {
            const md = this.getMetadata();
            const agent = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents', contextUser);
            
            if (!agent) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'FAILED',
                        Message: 'Failed to create AI Agent entity object'
                    }
                };
            }

            const loaded = await agent.Load(agentID);
            if (!loaded) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'NOT_FOUND',
                        Message: `Agent with ID '${agentID}' not found`
                    }
                };
            }

            return { agent };
        } catch (e) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: `Error loading agent: ${e instanceof Error ? e.message : 'Unknown error'}`
                }
            };
        }
    }

    /**
     * Validate agent type exists
     */
    protected async validateAgentType(typeID: string, contextUser: any): Promise<{
        type?: AIAgentTypeEntity;
        error?: ActionResultSimple;
    }> {
        try {
            const md = this.getMetadata();
            const agentType = await md.GetEntityObject<AIAgentTypeEntity>('MJ: AI Agent Types', contextUser);
            
            if (!agentType) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'FAILED',
                        Message: 'Failed to create AI Agent Type entity object'
                    }
                };
            }

            const loaded = await agentType.Load(typeID);
            if (!loaded) {
                return {
                    error: {
                        Success: false,
                        ResultCode: 'INVALID_TYPE',
                        Message: `Agent Type with ID '${typeID}' not found`
                    }
                };
            }

            return { type: agentType };
        } catch (e) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: `Error validating agent type: ${e instanceof Error ? e.message : 'Unknown error'}`
                }
            };
        }
    }

    /**
     * Common error handler
     */
    protected handleError(error: any, operation: string): ActionResultSimple {
        const message = error instanceof Error ? error.message : 'Unknown error';
        LogError(`Agent Management Action error during ${operation}: ${message}`);
        
        return {
            Success: false,
            ResultCode: 'ERROR',
            Message: `Failed to ${operation}: ${message}`
        };
    }

    /**
     * Creates a prompt and associates it with an agent
     */
    protected async createAndAssociatePrompt(
        agent: AIAgentEntityExtended,
        promptText: string,
        contextUser: UserInfo
    ): Promise<{ success: boolean; promptId?: string; error?: string }> {
        try {
            const md = this.getMetadata();
            
            // Create the prompt
            const prompt = await md.GetEntityObject<AIPromptEntityExtended>('AI Prompts', contextUser);
            if (!prompt) {
                return { success: false, error: 'Failed to create AI Prompt entity object' };
            }
            
            prompt.NewRecord();
            prompt.Name = `${agent.Name} System Prompt`;
            prompt.Description = `System prompt for ${agent.Name} agent`;
            prompt.TypeID = await this.getPromptTypeID('Chat', contextUser);
            prompt.Status = 'Active';
            prompt.ResponseFormat = 'JSON';
            prompt.PromptRole = 'System';
            prompt.PromptPosition = 'First';
            prompt.TemplateText = promptText; // This uses the extended property
            
            const promptSaved = await prompt.Save();
            if (!promptSaved) {
                return { 
                    success: false, 
                    error: prompt.LatestResult?.Message || 'Failed to save prompt' 
                };
            }
            
            // Create the agent-prompt association
            const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts', contextUser);
            if (!agentPrompt) {
                return { success: false, error: 'Failed to create AI Agent Prompt entity object' };
            }
            
            agentPrompt.NewRecord();
            agentPrompt.AgentID = agent.ID;
            agentPrompt.PromptID = prompt.ID;
            agentPrompt.ExecutionOrder = 1;
            agentPrompt.Status = 'Active';
            
            const associationSaved = await agentPrompt.Save();
            if (!associationSaved) {
                // Try to clean up the prompt since association failed
                await prompt.Delete();
                return { 
                    success: false, 
                    error: agentPrompt.LatestResult?.Message || 'Failed to associate prompt with agent' 
                };
            }
            
            return { success: true, promptId: prompt.ID };
            
        } catch (e) {
            return { 
                success: false, 
                error: e instanceof Error ? e.message : 'Unknown error creating prompt' 
            };
        }
    }

    /**
     * Gets the prompt type ID for a given type name
     */
    private async getPromptTypeID(typeName: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'AI Prompt Types',
            ExtraFilter: `Name = '${typeName}'`,
            MaxRows: 1,
            ResultType: 'simple'
        }, contextUser);
        
        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        
        throw new Error(`Prompt type '${typeName}' not found`);
    }
}