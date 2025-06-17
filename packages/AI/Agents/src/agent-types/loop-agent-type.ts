/**
 * @fileoverview Implementation of the Loop Agent Type for iterative task execution.
 * 
 * The LoopAgentType enables agents to operate in a continuous loop, making decisions
 * about task completion and next steps based on the current state. It parses structured
 * JSON responses from the AI model and translates them into BaseAgentNextStep directives.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAgentType } from './base-agent-type';
import { BaseAgentNextStep } from '@memberjunction/aiengine';
import { AIPromptRunResult } from '@memberjunction/ai';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Response structure expected from the Loop Agent Type system prompt.
 * This interface matches the JSON schema defined in the loop agent type template.
 * 
 * @interface LoopAgentResponse
 */
interface LoopAgentResponse {
    /**
     * Indicates whether the entire task has been completed successfully.
     * When true, the agent loop will terminate and return the final result.
     * When false, the agent will continue processing based on nextStep.
     */
    taskComplete: boolean;
    
    /**
     * The agent's reasoning about the current state and decision made.
     * This should be a clear, concise explanation of why the agent chose
     * the specific next step, helping with debugging and transparency.
     */
    reasoning: string;
    
    /**
     * Defines what the agent should do next. Only required when taskComplete is false.
     * The agent must specify exactly one type of next step (action, sub-agent, or chat).
     * @optional
     */
    nextStep?: {
        /**
         * The type of operation to perform next:
         * - 'action': Execute one or more actions in parallel
         * - 'sub-agent': Delegate to a single sub-agent
         * - 'chat': Send a message back to the user
         */
        type: 'action' | 'sub-agent' | 'chat';
        
        /**
         * Array of actions to execute. Required when type is 'action'.
         * All actions in the array will be executed in parallel.
         * @optional
         */
        actions?: Array<{
            /**
             * The unique identifier (UUID) of the action to execute.
             * Must match an action ID from the available actions list.
             */
            id: string;
            
            /**
             * The human-readable name of the action.
             * Should match the name from the available actions list.
             */
            name: string;
            
            /**
             * Parameters to pass to the action.
             * Keys must match the parameter names defined in the action's schema.
             * Values should match the expected types for each parameter.
             */
            params: Record<string, unknown>;
        }>;
        
        /**
         * Sub-agent to invoke. Required when type is 'sub-agent'.
         * Only one sub-agent can be invoked at a time.
         * @optional
         */
        subAgent?: {
            /**
             * The unique identifier (UUID) of the sub-agent to execute.
             * Must match a sub-agent ID from the available sub-agents list.
             */
            id: string;
            
            /**
             * The human-readable name of the sub-agent.
             * Should match the name from the available sub-agents list.
             */
            name: string;
            
            /**
             * The message/context to send to the sub-agent.
             * This should include all necessary information for the sub-agent
             * to complete its task, as it does NOT receive the full conversation
             * history. Can be plain text or include JSON data.
             */
            message: string;
            
            /**
             * Whether to terminate the parent agent after the sub-agent completes.
             * - true: Return sub-agent result directly to user, parent agent stops
             * - false: Return sub-agent result to parent agent for further processing
             */
            terminateAfter: boolean;
        };
        
        /**
         * Message to send to the user. Required when type is 'chat'.
         * This is used when the agent needs to ask for clarification,
         * provide information, or communicate with the user.
         * @optional
         */
        userMessage?: string;
    };
    
    /**
     * The agent's confidence level in its decision (0.0 to 1.0).
     * Higher values indicate greater certainty about the chosen action.
     * Can be used for logging, debugging, or conditional logic.
     * @optional
     */
    confidence?: number;
}

/**
 * Implementation of the Loop Agent Type pattern.
 * 
 * This agent type enables iterative execution where the agent continues
 * processing until a task is marked complete. It supports:
 * - Task completion detection
 * - Sub-agent delegation
 * - Action execution
 * - Progress tracking
 * - Error handling
 * - Result accumulation across iterations
 * 
 * @class LoopAgentType
 * @extends BaseAgentType
 * 
 * @example
 * ```typescript
 * // The agent will execute in a loop until taskComplete is true
 * const loopAgent = new LoopAgentType();
 * const nextStep = await loopAgent.DetermineNextStep(promptResult);
 * 
 * switch (nextStep.step) {
 *   case 'success':
 *     console.log('Task completed:', nextStep.returnValue);
 *     break;
 *   case 'sub-agent':
 *     console.log('Delegating to:', nextStep.subAgentName);
 *     break;
 *   case 'action':
 *     console.log('Executing action:', nextStep.actionName);
 *     break;
 * }
 * ```
 */
@RegisterClass(BaseAgentType, "LoopAgentType")
export class LoopAgentType extends BaseAgentType {
    /**
     * Determines the next step based on the structured response from the AI model.
     * 
     * This method parses the JSON response from the loop agent prompt and translates
     * it into appropriate BaseAgentNextStep directives. It handles task completion,
     * sub-agent delegation, action execution, and error conditions.
     * 
     * @param {AIPromptRunResult} promptResult - The result from executing the agent's prompt
     * @returns {Promise<BaseAgentNextStep>} The next step to take in the agent execution
     * 
     * @throws {Error} Implicitly through failed parsing, but returns failed step instead
     */
    public async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep> {
        try {
            // Ensure we have a successful result
            if (!promptResult.success || !promptResult.result) {
                return {
                    step: 'failed',
                    errorMessage: promptResult.errorMessage || 'Prompt execution failed'
                };
            }

            // Try to parse the result as JSON if it's a string
            let response: LoopAgentResponse;
            try {
                if (typeof promptResult.result === 'string') {
                    response = JSON.parse(promptResult.result);
                } else {
                    response = promptResult.result as LoopAgentResponse;
                }
            } catch (parseError) {
                return {
                    step: 'failed',
                    errorMessage: `Failed to parse JSON response: ${parseError.message}`
                };
            }
            
            // Validate the response structure
            if (!this.isValidLoopResponse(response)) {
                return {
                    step: 'failed',
                    errorMessage: 'Invalid response structure from loop agent prompt'
                };
            }

            // Log the agent's reasoning
            LogStatus(`🔄 Loop Agent Reasoning: ${response.reasoning}`);
            
            // Log confidence if available
            if (response.confidence !== undefined) {
                LogStatus(`🎯 Confidence: ${(response.confidence * 100).toFixed(0)}%`);
            }

            // Check if task is complete
            if (response.taskComplete) {
                LogStatus('✅ Loop Agent: Task completed successfully');
                return {
                    step: 'success',
                    returnValue: response
                };
            }

            // Handle when nextStep is not provided but task is not complete
            if (!response.nextStep) {
                return {
                    step: 'failed',
                    errorMessage: 'Task not complete but no next step provided'
                };
            }

            // Determine next step based on type
            switch (response.nextStep.type) {
                case 'sub-agent':
                    if (!response.nextStep.subAgent) {
                        return {
                            step: 'failed',
                            errorMessage: 'Sub-agent details not specified'
                        };
                    }
                    return {
                        step: 'sub-agent',
                        subAgent: {
                            id: response.nextStep.subAgent.id,
                            name: response.nextStep.subAgent.name,
                            message: response.nextStep.subAgent.message,
                            terminateAfter: response.nextStep.subAgent.terminateAfter
                        }
                    };

                case 'action':
                    if (!response.nextStep.actions || response.nextStep.actions.length === 0) {
                        return {
                            step: 'failed',
                            errorMessage: 'Actions not specified'
                        };
                    }
                    return {
                        step: 'actions',
                        actions: response.nextStep.actions.map(action => ({
                            id: action.id,
                            name: action.name,
                            params: action.params
                        }))
                    };

                case 'chat':
                    if (!response.nextStep.userMessage) {
                        return {
                            step: 'failed',
                            errorMessage: 'Chat type specified but no user message provided'
                        };
                    }
                    return {
                        step: 'chat',
                        userMessage: response.nextStep.userMessage
                    };

                default:
                    return {
                        step: 'failed',
                        errorMessage: `Unknown next step type: ${response.nextStep.type}`
                    };
            }

        } catch (error) {
            LogError(`Error in LoopAgentType.DetermineNextStep: ${error.message}`);
            return {
                step: 'failed',
                errorMessage: `Failed to parse loop agent response: ${error.message}`
            };
        }
    }

    /**
     * Validates that the response conforms to the expected LoopAgentResponse structure.
     * 
     * @param {any} response - The response to validate
     * @returns {boolean} True if the response is valid, false otherwise
     * 
     * @private
     */
    private isValidLoopResponse(response: any): response is LoopAgentResponse {
        // Check required fields
        if (typeof response !== 'object' || response === null) {
            return false;
        }

        if (typeof response.taskComplete !== 'boolean') {
            LogError('LoopAgentResponse missing required field: taskComplete');
            return false;
        }

        if (typeof response.reasoning !== 'string') {
            LogError('LoopAgentResponse missing required field: reasoning');
            return false;
        }

        // nextStep is optional when taskComplete is true
        if (!response.taskComplete && !response.nextStep) {
            LogError('LoopAgentResponse requires nextStep when taskComplete is false');
            return false;
        }

        // Validate nextStep structure if present
        if (response.nextStep) {
            const validStepTypes = ['action', 'sub-agent', 'chat'];
            if (!validStepTypes.includes(response.nextStep.type)) {
                LogError(`LoopAgentResponse has invalid nextStep.type: ${response.nextStep.type}`);
                return false;
            }

            // Validate specific fields based on type
            if (response.nextStep.type === 'action' && !response.nextStep.actions) {
                LogError('LoopAgentResponse requires actions array for action type');
                return false;
            }

            if (response.nextStep.type === 'sub-agent' && !response.nextStep.subAgent) {
                LogError('LoopAgentResponse requires subAgent object for sub-agent type');
                return false;
            }

            if (response.nextStep.type === 'chat' && !response.nextStep.userMessage) {
                LogError('LoopAgentResponse requires userMessage for chat type');
                return false;
            }
        }

        return true;
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadLoopAgentType() {
    // This function ensures the class isn't tree-shaken
}