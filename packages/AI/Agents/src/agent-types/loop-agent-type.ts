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
import { LoopAgentResponse } from './loop-agent-response-type';

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
    public async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep<LoopAgentResponse>> {
        try {
            // Ensure we have a successful result
            if (!promptResult.success || !promptResult.result) {
                return {
                    terminate: false,
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
                    terminate: false,
                    step: 'failed',
                    errorMessage: `Failed to parse JSON response: ${parseError.message}`
                };
            }
            
            // Validate the response structure
            if (!this.isValidLoopResponse(response)) {
                return {
                    terminate: false,
                    step: 'failed',
                    errorMessage: 'Invalid response structure from loop agent prompt'
                };
            }

            // Check if task is complete
            if (response.taskComplete) {
                LogStatus('✅ Loop Agent: Task completed successfully');
                return {
                    terminate: response.taskComplete,
                    step: 'success',
                    returnValue: response,                    
                };
            }

            // Handle when nextStep is not provided but task is not complete
            if (!response.nextStep) {
                return {
                    terminate: false,
                    step: 'failed',
                    errorMessage: 'Task not complete but no next step provided'
                };
            }

            // Determine next step based on type
            const retVal: Partial<BaseAgentNextStep<LoopAgentResponse>> = {
                returnValue: response, // we always return the full response as the return value
                terminate: response.taskComplete
            }
            switch (response.nextStep.type) {
                case 'sub-agent':
                    if (!response.nextStep.subAgent) {
                        retVal.step = 'failed';
                        retVal.errorMessage = 'Sub-agent details not specified';
                    }
                    else {
                        retVal.step = 'sub-agent';
                        retVal.subAgent = {
                            id: response.nextStep.subAgent.id,
                            name: response.nextStep.subAgent.name,
                            message: response.nextStep.subAgent.message,
                            terminateAfter: response.nextStep.subAgent.terminateAfter,
                            templateParameters: response.nextStep.subAgent.templateParameters || {}
                        }
                    }
                    break;
                case 'action':
                    if (!response.nextStep.actions || response.nextStep.actions.length === 0) {
                        retVal.step = 'failed';
                        retVal.errorMessage = 'Actions not specified for action type';
                    }
                    else {
                        retVal.step = 'actions',
                        retVal.actions = response.nextStep.actions.map(action => ({
                            id: action.id,
                            name: action.name,
                            params: action.params
                        }))
                    }
                    break;
                case 'chat':
                    if (!response.message) {
                        retVal.step = 'failed';
                        retVal.errorMessage = 'Chat type specified but no user message provided';
                    }
                    else {
                        retVal.step = 'chat';
                        retVal.userMessage = response.message;
                        retVal.terminate = true; // when chat request, this agent needs to return back to the caller/user
                    }
                    break;
                default:
                    retVal.step = 'failed';
                    retVal.errorMessage = `Unknown next step type: ${response.nextStep.type}`;
                    break;
            }
            return retVal as BaseAgentNextStep<LoopAgentResponse>;
        } catch (error) {
            LogError(`Error in LoopAgentType.DetermineNextStep: ${error.message}`);
            return {
                terminate: false,
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