import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { BaseEntity, Metadata, LogError, RunView, UserInfo } from "@memberjunction/core";
import { DatabaseProviderBase } from "@memberjunction/core";
import { MJAIAgentTypeEntity, MJAIAgentPromptEntity } from "@memberjunction/core-entities";
import { AIPromptEntityExtended, AIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { 
    AgentLoadResult,
    ParameterResult,
    AgentTypeValidationResult, 
    PromptCreationResult, 
    ObjectParameter 
} from "../types/agent-management.types";

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
    protected getStringParam(params: RunActionParams, paramName: string, required: boolean = true): ParameterResult<string> {
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
    protected getObjectParam(params: RunActionParams, paramName: string, required: boolean = true): ParameterResult<ObjectParameter> {
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
        
        return { value: param.Value as ObjectParameter };
    }

    /**
     * Get metadata instance
     */
    protected getMetadata(): Metadata {
        return new Metadata();
    }

    /**
     * Validates if a string is a valid UUID format
     */
    protected isValidUUID(uuid: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Extract and validate a UUID parameter
     */
    protected getUuidParam(params: RunActionParams, paramName: string, required: boolean = true): ParameterResult<string> {
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

        const value = param.Value as string;
        
        // Validate UUID format (including NULL check)
        if (!value || 
            value.trim().toUpperCase() === 'NULL' || 
            value.trim() === '' ||
            !this.isValidUUID(value.trim())) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid ${paramName} format: '${value}'. Must be a valid UUID.`
                }
            };
        }
        
        return { value: value.trim() };
    }

    /**
     * Get database provider with transaction support validation
     * 
     * @example
     * ```typescript
     * // Example usage for implementing transactions in actions:
     * const providerResult = this.getTransactionProvider();
     * if (providerResult.error) return providerResult.error;
     * const provider = providerResult.provider!;
     * 
     * // Begin transaction for multi-record operations
     * await provider.BeginTransaction();
     * 
     * try {
     *     // Perform multiple database operations
     *     const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
     *     await agent.Save();
     *     
     *     const prompt = await md.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', contextUser);
     *     await prompt.Save();
     *     
     *     // Commit transaction - all operations succeeded
     *     await provider.CommitTransaction();
     *     
     *     return { Success: true, ResultCode: 'SUCCESS', Message: 'All operations completed successfully' };
     * 
     * } catch (transactionError) {
     *     // Rollback transaction on any error
     *     await provider.RollbackTransaction();
     *     throw transactionError; // Re-throw to be caught by outer try-catch
     * }
     * ```
     */
    protected getTransactionProvider(): { 
        provider?: DatabaseProviderBase; 
        error?: ActionResultSimple 
    } {
        // Get the database provider for transaction management
        const provider = BaseEntity.Provider as unknown as DatabaseProviderBase;
        if (!provider) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'NO_PROVIDER',
                    Message: 'No database provider available for transaction management'
                }
            };
        }

        // Verify the provider supports transaction management
        if (typeof provider.BeginTransaction !== 'function' || 
            typeof provider.CommitTransaction !== 'function' || 
            typeof provider.RollbackTransaction !== 'function') {
            return {
                error: {
                    Success: false,
                    ResultCode: 'NO_TRANSACTION_SUPPORT',
                    Message: 'Database provider does not support transaction management'
                }
            };
        }

        return { provider };
    }

    /**
     * Load an AI Agent entity by ID
     */
    protected async loadAgent(agentID: string, contextUser: UserInfo): Promise<AgentLoadResult> {
        try {
            const md = this.getMetadata();
            const agent = await md.GetEntityObject<AIAgentEntityExtended>('MJ: AI Agents', contextUser);
            
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
    protected async validateAgentType(typeID: string, contextUser: UserInfo): Promise<AgentTypeValidationResult> {
        try {
            const md = this.getMetadata();
            const agentType = await md.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', contextUser);
            
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
    protected handleError(error: unknown, operation: string): ActionResultSimple {
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
    ): Promise<PromptCreationResult> {
        try {
            const md = this.getMetadata();
            
            // Create the prompt
            const prompt = await md.GetEntityObject<AIPromptEntityExtended>('MJ: AI Prompts', contextUser);
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
            const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts', contextUser);
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
            EntityName: 'MJ: AI Prompt Types',
            ExtraFilter: `Name = '${typeName}'`,
            MaxRows: 1,
            ResultType: 'simple'
        }, contextUser);
        
        if (!result.Success) {
            throw new Error(`Failed to query prompt types: ${result.ErrorMessage || 'Unknown error'}`);
        }
        
        if (result.Results && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        
        throw new Error(`Prompt type '${typeName}' not found`);
    }
}