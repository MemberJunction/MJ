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
                LogStatusEx({
                    message: '✅ Loop Agent: Task completed successfully',
                    verboseOnly: true
                });
                return {
                    terminate: response.taskComplete,
                    step: 'success',
                    payload: response.payload,                    
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
            const retVal: Partial<BaseAgentNextStep<LoopAgentResponse<P>>> = {
                payload: response.payload,
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
            return retVal as BaseAgentNextStep<P>;
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
        }

        return true;
    }

    /**
     * Retrieves the payload from the prompt result.
     * For LoopAgentType, this returns the parsed LoopAgentResponse.
     * 
     * @param {AIPromptRunResult} promptResult - The result from executing the agent's prompt
     * @returns {Promise<T>} The extracted payload
     */
    public async RetrievePayload<T = LoopAgentResponse>(promptResult: AIPromptRunResult): Promise<T> {
        // the promptResult.result should be the LoopAgentResponse
        if (!promptResult.success || !promptResult.result) {
            throw new Error('Prompt execution failed or returned no result');
        }

        const loopAgentResponse = promptResult.result as LoopAgentResponse;
        if (!this.isValidLoopResponse(loopAgentResponse)) {
            throw new Error('Invalid LoopAgentResponse structure');
        }

        // Return the response as the payload
        return loopAgentResponse.payload as T;
    }


    public static CURRENT_PAYLOAD_PLACHOLDER = '<< __currentPayload__ >>';
    /**
     * Injects a payload into the prompt parameters.
     * For LoopAgentType, this could be used to inject previous loop results or context.
     * 
     * @param {T} payload - The payload to inject
     * @param {AIPromptParams} prompt - The prompt parameters to update
     */
    public async InjectPayload<T = any>(payload: T, prompt: AIPromptParams): Promise<void> {
        // for Loop Agent Type we are using a special placeholder in all of the system prompts
        // of << __currentPayload__ >> which will be replaced with the payload
        if (!prompt || !prompt.conversationMessages || prompt.conversationMessages.length === 0) {
            throw new Error('Prompt does not contain conversation messages to inject payload into');
        }
        const sysPrompt = prompt.conversationMessages[0];
        if (!sysPrompt || sysPrompt.role !== 'system' || !sysPrompt.content) {
            throw new Error('Invalid system prompt structure');
        }

        // if we get here we now have the SYSTEM prompt in our hands and we an do what we need
        // Replace the placeholder with the actual payload
        // check to see if sysPrompt.content is of type ChatMessageContentBlock or string
        // if string we just do a simple replace, otherwise we need to cast to ChatMessageContentBlock[]
        // and replace the placeholder in its .content property

        // first create a regex to match the placeholder
        const placeholderRegex = new RegExp(LoopAgentType.CURRENT_PAYLOAD_PLACHOLDER, 'g');

        if (typeof sysPrompt.content === 'string') {
            // replace all instances of the placeholder in the string
            sysPrompt.content = sysPrompt.content.replace(placeholderRegex, JSON.stringify(payload));
        } else if (Array.isArray(sysPrompt.content)) {
            // assuming sysPrompt.content is a ChatMessageContentBlock[]
            sysPrompt.content.forEach(block => {
                if (typeof block.content === 'string') {
                    block.content = block.content.replace(placeholderRegex, JSON.stringify(payload));
                }
            });
        } else {
            throw new Error('System prompt content is not a string or ChatMessageContentBlock');
        }
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadLoopAgentType() {
    // This function ensures the class isn't tree-shaken
}