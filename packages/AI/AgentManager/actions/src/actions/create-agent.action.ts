import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { AIAgentEntityExtended } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIEngineBase } from "@memberjunction/ai-engine-base";
import { BaseAction } from "@memberjunction/actions";

/**
 * Creates a new AI agent with specified configuration.
 * This action is restricted to the Agent Manager agent only.
 * Supports creating both top-level agents and sub-agents.
 * Optionally creates and associates a system prompt if PromptText is provided.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Create Agent',
 *   Params: [
 *     { Name: 'Name', Value: 'Customer Feedback Analyzer' },
 *     { Name: 'Description', Value: 'Analyzes customer feedback...' },
 *     { Name: 'Type', Value: 'Loop' }, // Optional, use Type OR TypeID
 *     { Name: 'TypeID', Value: 'loop-agent-type-id' }, // Optional, use Type OR TypeID
 *     { Name: 'PromptText', Value: 'You are a feedback analyzer...' }, // Optional, creates prompt
 *     { Name: 'ParentID', Value: 'parent-agent-id' } // Optional, for sub-agents
 *   ]
 * });
 * // Returns AgentID and optionally PromptID in output params
 * ```
 */
@RegisterClass(BaseAction, "Create Agent")
export class CreateAgentAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract parameters
            const nameResult = this.getStringParam(params, 'Name');
            if (nameResult.error) return nameResult.error;

            const descriptionResult = this.getStringParam(params, 'Description');
            if (descriptionResult.error) return descriptionResult.error;

            // Handle Type/TypeID - one is required
            const typeResult = this.getStringParam(params, 'Type', false);
            const typeIDResult = this.getStringParam(params, 'TypeID', false);
            
            if (!typeResult.value && !typeIDResult.value) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'Either Type or TypeID parameter is required'
                };
            }

            // Resolve TypeID if Type was provided
            let resolvedTypeID: string;
            if (typeIDResult.value) {
                resolvedTypeID = typeIDResult.value;
            } else {
                // Look up TypeID from Type name
                const aiEngine = AIEngineBase.Instance;
                const agentType = aiEngine.AgentTypes.find((t: any) => 
                    t.Name.toLowerCase() === typeResult.value!.toLowerCase()
                );
                
                if (!agentType) {
                    return {
                        Success: false,
                        ResultCode: 'INVALID_TYPE',
                        Message: `Agent type '${typeResult.value}' not found. Available types: ${aiEngine.AgentTypes.map((t: any) => t.Name).join(', ')}`
                    };
                }
                
                resolvedTypeID = agentType.ID;
            }

            const promptTextResult = this.getStringParam(params, 'PromptText', false);
            if (promptTextResult.error) return promptTextResult.error;

            const parentIDResult = this.getStringParam(params, 'ParentID', false);
            if (parentIDResult.error) return parentIDResult.error;

            // Validate agent type exists
            const typeValidation = await this.validateAgentType(resolvedTypeID, params.ContextUser);
            if (typeValidation.error) return typeValidation.error;

            // Validate parent agent exists if provided
            if (parentIDResult.value) {
                const parentValidation = await this.loadAgent(parentIDResult.value, params.ContextUser);
                if (parentValidation.error) return parentValidation.error;
            }

            // Create new agent
            const md = this.getMetadata();
            const agent = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents', params.ContextUser);
            
            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: 'Failed to create AI Agent entity object'
                };
            }

            // Set agent properties
            agent.NewRecord();
            agent.Name = nameResult.value!;
            agent.Description = descriptionResult.value!;
            agent.TypeID = resolvedTypeID;
            agent.Status = 'Active';
            agent.ExecutionOrder = 0;
            agent.ExposeAsAction = false; // Default to not exposed

            if (parentIDResult.value) {
                agent.ParentID = parentIDResult.value;
            }

            // Save the agent
            const saveResult = await agent.Save();
            
            if (saveResult) {
                // Add output parameter with the new agent ID
                params.Params.push({
                    Name: 'AgentID',
                    Value: agent.ID,
                    Type: 'Output'
                });

                // If prompt text was provided, create and associate the prompt
                if (promptTextResult.value) {
                    const promptResult = await this.createAndAssociatePrompt(
                        agent,
                        promptTextResult.value,
                        params.ContextUser
                    );
                    
                    if (!promptResult.success) {
                        // Agent was created but prompt failed - return partial success
                        return {
                            Success: true,
                            ResultCode: 'PARTIAL_SUCCESS',
                            Message: `Agent '${agent.Name}' created successfully, but prompt creation failed: ${promptResult.error}`,
                            Params: params.Params
                        };
                    }
                    
                    // Add prompt ID to output
                    params.Params.push({
                        Name: 'PromptID',
                        Value: promptResult.promptId,
                        Type: 'Output'
                    });
                }

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully created agent '${agent.Name}' with ID ${agent.ID}`,
                    Params: params.Params
                };
            } else {
                const latestResult = agent.LatestResult;
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: latestResult?.Message || 'Failed to save agent'
                };
            }

        } catch (e) {
            return this.handleError(e, 'create agent');
        }
    }
}

export function LoadCreateAgentAction() {
    // This function exists to prevent tree shaking from removing the action class
    // The side effect of loading this file is that the @RegisterClass decorator runs
}