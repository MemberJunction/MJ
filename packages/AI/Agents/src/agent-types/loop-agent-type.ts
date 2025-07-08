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
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams } from '@memberjunction/ai-core-plus';
import { LogError, LogStatusEx, IsVerboseLoggingEnabled } from '@memberjunction/core';
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
 *     console.log('Task completed:', nextStep.payload);
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
    public async DetermineNextStep<P>(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep<P>> {
        try {
            // Ensure we have a successful result
            if (!promptResult.success || !promptResult.result) {
                return {
                    terminate: false,
                    step: 'Failed',
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
                    step: 'Failed',
                    errorMessage: `Failed to parse JSON response: ${parseError.message}`
                };
            }
            
            // Validate the response structure
            if (!this.isValidLoopResponse(response)) {
                return {
                    terminate: false,
                    step: 'Failed',
                    errorMessage: 'Invalid response structure from loop agent prompt'
                };
            }

            // Check if task is complete
            if (response.taskComplete) {
                LogStatusEx({
                    message: '✅ Loop Agent: Task completed successfully. Message: ' + response.message,
                    verboseOnly: true
                });
                return {
                    terminate: response.taskComplete,
                    message: response.message,
                    reasoning: response.reasoning,
                    confidence: response.confidence,
                    step: 'Success',
                    payloadChangeRequest: response.payloadChangeRequest,                    
                };
            }

            // Handle when nextStep is not provided but task is not complete
            if (!response.nextStep) {
                return {
                    terminate: false,
                    step: 'Failed',
                    errorMessage: 'Task not complete but no next step provided'
                };
            }

            // Determine next step based on type
            const retVal: Partial<BaseAgentNextStep<P>> = {
                payloadChangeRequest: response.payloadChangeRequest,
                terminate: response.taskComplete
            }
            switch (response.nextStep.type) {
                case 'Sub-Agent':
                    if (!response.nextStep.subAgent) {
                        retVal.step = 'Retry';
                        retVal.message = 'When nextStep.type == "Sub-Agent", subAgent details must be specified';
                        retVal.errorMessage = 'Sub-agent details not specified';
                    }
                    else {
                        retVal.step = 'Sub-Agent';
                        retVal.subAgent = {
                            name: response.nextStep.subAgent.name,
                            message: response.nextStep.subAgent.message,
                            terminateAfter: response.nextStep.subAgent.terminateAfter,
                            templateParameters: response.nextStep.subAgent.templateParameters || {}
                        }
                    }
                    break;
                case 'Actions':
                    if (!response.nextStep.actions || response.nextStep.actions.length === 0) {
                        retVal.step = 'Retry';
                        retVal.message = 'When nextStep.type == "Actions", 1 or more actions must be specified in the nextStep.actions array';
                        retVal.errorMessage = 'Actions not specified for action type';
                    }
                    else {
                        retVal.step = 'Actions',
                        retVal.actions = response.nextStep.actions.map(action => ({
                            name: action.name,
                            params: action.params
                        }))
                    }
                    break;
                case 'Chat':
                    if (!response.message) {
                        retVal.step = 'Failed';
                        retVal.errorMessage = 'Chat type specified but no user message provided';
                    }
                    else {
                        retVal.step = 'Chat';
                        retVal.message = response.message;
                        retVal.terminate = true; // when chat request, this agent needs to return back to the caller/user
                    }
                    break;
                default:
                    retVal.step = 'Failed';
                    retVal.errorMessage = `Unknown next step type: ${response.nextStep.type}`;
                    break;
            }
            return retVal as BaseAgentNextStep<P>;
        } catch (error) {
            LogError(`Error in LoopAgentType.DetermineNextStep: ${error.message}`);
            return {
                terminate: false,
                step: 'Failed',
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
    private isValidLoopResponse(simpleResponse: any): boolean {
        // Check required fields, first cast the simpleResponse to LoopAgentResponse
        // so we get the benefit of TypeScript's type checking below in this method
        const response = simpleResponse as LoopAgentResponse;

        if (typeof response !== 'object' || response === null) {
            return false;
        }

        if (typeof response.taskComplete !== 'boolean') {
            LogError('LoopAgentResponse missing required field: taskComplete');
            return false;
        }

        // nextStep is optional when taskComplete is true
        if (!response.taskComplete && !response.nextStep) {
            if (response.message?.trim().length > 0 || response.reasoning?.trim().length > 0) {
                // in this situation we have a message or reasoning coming back but a malformed response
                // so we can consider it a chat response becuase it is trying to communicate
                // something back, better to provide that back than discarding it entirely
                // possibly we will make this configurable in the future
                response.nextStep = {
                    type: 'Chat'
                };

                if (response.message?.trim().length === 0) {
                    // this means reasoning was provided but no message, copy reasoning to message 
                    // as you shouldn't ever have that but we can handle it gracefully
                    response.message = response.reasoning;
                }
            }
            else {
                LogError('LoopAgentResponse requires nextStep when taskComplete is false');
                return false;
            }
        }

        // Validate nextStep structure if present
        if (response.nextStep) {
            const validStepTypes = ['actions', 'sub-agent', 'chat'];
            const lcaseType = response.nextStep.type?.toLowerCase().trim();
            // allow the AI to mess up the case, but we need to validate it
            if (!validStepTypes.includes(lcaseType)) {
                LogError(`LoopAgentResponse has invalid nextStep.type: ${response.nextStep.type}`);
                return false;
            }

            // Validate specific fields based on type
            if (lcaseType === 'actions' && !response.nextStep.actions) {
                LogError('LoopAgentResponse requires actions array for action type');
                return false;
            }

            if (lcaseType === 'sub-agent' && !response.nextStep.subAgent) {
                LogError('LoopAgentResponse requires subAgent object for sub-agent type');
                return false;
            }

            if (lcaseType === 'chat' && !response.message) {
                // check to see if we have reasoning, if so, use that, otherwise we have to fail
                if (!response.reasoning || response.reasoning.trim().length === 0) {
                    LogError('LoopAgentResponse requires message for chat type');
                    return false;
                } else {
                    // if we have reasoning, use that as the message
                    response.message = response.reasoning;
                }
            }
        }

        return true;
    }

    // /**
    //  * Retrieves the payload from the prompt result.
    //  * For LoopAgentType, this returns the parsed LoopAgentResponse.
    //  * 
    //  * @param {AIPromptRunResult} promptResult - The result from executing the agent's prompt
    //  * @returns {Promise<T>} The extracted payload
    //  */
    // public async RetrievePayload<T = LoopAgentResponse>(promptResult: AIPromptRunResult): Promise<T> {
    //     // the promptResult.result should be the LoopAgentResponse
    //     if (!promptResult.success || !promptResult.result) {
    //         throw new Error('Prompt execution Failed or returned no result');
    //     }

    //     const loopAgentResponse = promptResult.result as LoopAgentResponse;
    //     if (!this.isValidLoopResponse(loopAgentResponse)) {
    //         throw new Error('Invalid LoopAgentResponse structure');
    //     }

    //     // Return the response (the framework will handle applying payload changes)
    //     return loopAgentResponse.payloadChangeRequest as T;
    // }


    public static CURRENT_PAYLOAD_PLACHOLDER = '_CURRENT_PAYLOAD';
    /**
     * Injects a payload into the prompt parameters.
     * For LoopAgentType, this could be used to inject previous loop results or context.
     * 
     * @param {T} payload - The payload to inject
     * @param {AIPromptParams} prompt - The prompt parameters to update
     */
    public async InjectPayload<T = any>(payload: T, prompt: AIPromptParams): Promise<void> {
        if (!prompt)
            throw new Error('Prompt parameters are required for payload injection');
        if (!prompt.data )
            prompt.data = {};

        prompt.data[LoopAgentType.CURRENT_PAYLOAD_PLACHOLDER] = payload || {};
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadLoopAgentType() {
    // This function ensures the class isn't tree-shaken
}