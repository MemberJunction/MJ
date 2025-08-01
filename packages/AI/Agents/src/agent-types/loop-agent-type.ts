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
import { AIPromptRunResult, BaseAgentNextStep, AIPromptParams, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { LogError, LogStatusEx } from '@memberjunction/core';
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
    public async DetermineNextStep<P>(
        promptResult: AIPromptRunResult | null, 
        params: ExecuteAgentParams<any, P>
    ): Promise<BaseAgentNextStep<P>> {
        try {
            // Ensure we have a successful result
            if (!promptResult.success || !promptResult.result) {
                return this.createNextStep('Failed', {
                    errorMessage: promptResult.errorMessage || 'Prompt execution failed'
                });
            }

            // Parse the response using the base class utility
            const response = this.parseJSONResponse<LoopAgentResponse>(promptResult);
            if (!response) {
                return this.createRetryStep('Failed to parse JSON response');
            }
            
            // Validate the response structure
            const validationResult = this.isValidLoopResponse(response);
            if (!validationResult.success) {
                return this.createRetryStep(validationResult.message);
            }

            // Check if task is complete
            if (response.taskComplete) {
                LogStatusEx({
                    message: '✅ Loop Agent: Task completed successfully. Message: ' + response.message,
                    verboseOnly: true
                });
                return this.createSuccessStep({
                    message: response.message,
                    reasoning: response.reasoning,
                    confidence: response.confidence,
                    payloadChangeRequest: response.payloadChangeRequest
                });
            }

            // Handle when nextStep is not provided but task is not complete
            if (!response.nextStep) {
                return this.createRetryStep('Task not complete but no next step provided');
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
                        retVal.step = 'Retry';
                        retVal.errorMessage = 'Chat type specified but no user message provided';
                    }
                    else {
                        retVal.step = 'Chat';
                        retVal.message = response.message;
                        retVal.terminate = true; // when chat request, this agent needs to return back to the caller/user
                    }
                    break;
                default:
                    retVal.step = 'Retry';
                    retVal.errorMessage = `Unknown next step type: ${response.nextStep.type}`;
                    break;
            }
            return retVal as BaseAgentNextStep<P>;
        } catch (error) {
            LogError(`Error in LoopAgentType.DetermineNextStep: ${error.message}`);
            return this.createRetryStep(`Failed to parse loop agent response: ${error.message}`);
        }
    }

    /**
     * Validates that the response conforms to the expected LoopAgentResponse structure.
     * 
     * @param {any} response - The response to validate
     * @returns {boolean} True if the response is valid, false otherwise
     * 
     * @protected
     */
    protected isValidLoopResponse(simpleResponse: unknown): {success: boolean, message?: string} {
        // Check required fields, first cast the simpleResponse to LoopAgentResponse
        // so we get the benefit of TypeScript's type checking below in this method
        const response = simpleResponse as LoopAgentResponse;

        if (typeof response !== 'object' || response === null) {
            return {success: false, message: 'Invalid response format'};
        }

        if (!response.taskComplete) {
            // if not provided, default to false to make processing work
            response.taskComplete = false;
        }

        if (typeof response.taskComplete !== 'boolean') {
            LogError('LoopAgentResponse missing required field: taskComplete');
            return {success: false, message: 'Missing required field: taskComplete'};
        }

        // nextStep is optional when taskComplete is true
        if (!response.taskComplete && !response.nextStep) {
            if (response.message?.trim().length > 0 || 
                (
                    typeof response.reasoning === 'string' && 
                    response.reasoning?.trim().length > 0
                )) {
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
            else if (response.payloadChangeRequest?.newElements ||
                    response.payloadChangeRequest?.updateElements ||
                    response.payloadChangeRequest?.removeElements) {
                // the AI forgot to mark taskComplete as true but provided a payloadChangeRequest
                // with changes to the elements, so we can consider this a valid response
                // and we can consider it attempting to have a taskComplete = true
                // and validation will catch if it didn't actually complete and drive a retry
                response.message = 'taskComplete set to true automatically due to payloadChangeRequest and no nextStep provided by AI';
                response.taskComplete = true;
            }
            else {
                LogError('LoopAgentResponse requires nextStep when taskComplete is false');
                return {
                        success: false,
                        message: `Missing nextStep is a required field when taskComplete is false
                                  Per the LoopAgentResponse structure, nextStep is an object with a key called type that can be: 
                                  - "Actions", 
                                  - "Sub-Agent"
                                  - "Chat"
                                  If taskComplete is true, nextStep is optional.
                                  If taskComplete is false, nextStep is required and fill in type with the appropriate value!`};
            }
        }

        // Validate nextStep structure if present
        if (response.nextStep) {
            const validStepTypes = ['actions', 'sub-agent', 'chat'];
            let lcaseType = response.nextStep.type?.toLowerCase().trim();
            // allow the AI to mess up the case, but we need to validate it

            // be smart/lenient about missing types. if type is missing but we have a nextStep.subAgent, default to sub-agent and if type is missing and we have nextStep.actions, default to actions
            if (!lcaseType && response.nextStep.subAgent) {
                response.nextStep.type = 'Sub-Agent'; // update the data structure to have the correct type
                lcaseType = 'sub-agent';
            } else if (!lcaseType && response.nextStep.actions && response.nextStep.actions.length > 0) {
                response.nextStep.type = 'Actions'; // update the data structure to have the correct type
                lcaseType = 'actions';
            }

            if (!validStepTypes.includes(lcaseType)) {
                const message = `LoopAgentResponse has invalid nextStep.type: ${response.nextStep.type}`;
                LogError(message);
                return {success: false, message};
            }

            // Validate specific fields based on type
            if (lcaseType === 'actions' && !response.nextStep.actions) {
                const message = 'LoopAgentResponse requires actions array for action type';
                LogError(message);
                return {success: false, message};
            }

            if (lcaseType === 'sub-agent' && !response.nextStep.subAgent) {
                const message = 'LoopAgentResponse requires subAgent object for sub-agent type';
                LogError(message);
                return {success: false, message};
            }

            if (lcaseType === 'chat' && !response.message) {
                // check to see if we have reasoning, if so, use that, otherwise we have to fail
                if (!response.reasoning || response.reasoning.trim().length === 0) {
                    const message = 'LoopAgentResponse requires message for chat type';
                    LogError(message);
                    return {success: false, message};
                } else {
                    // if we have reasoning, use that as the message
                    response.message = response.reasoning;
                }
            }
        }

        return {success: true};
    }
    /**
     * Injects a payload into the prompt parameters.
     * For LoopAgentType, this could be used to inject previous loop results or context.
     * 
     * @param {T} payload - The payload to inject
     * @param {AIPromptParams} prompt - The prompt parameters to update
     * @param {object} agentInfo - Agent identification info (unused by LoopAgentType)
     */
    public async InjectPayload<T = any>(
        payload: T, 
        prompt: AIPromptParams,
        agentInfo: { agentId: string; agentRunId?: string }
    ): Promise<void> {
        if (!prompt)
            throw new Error('Prompt parameters are required for payload injection');
        if (!prompt.data )
            prompt.data = {};

        prompt.data[BaseAgentType.CURRENT_PAYLOAD_PLACEHOLDER] = payload || {};
    }

    /**
     * Determines the initial step for loop agent types.
     * 
     * Loop agents always start with a prompt execution to determine the initial actions.
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @returns {Promise<BaseAgentNextStep<P> | null>} Always returns null to use default behavior
     * 
     * @override
     * @since 2.76.0
     */
    public async DetermineInitialStep<P = any>(params: ExecuteAgentParams<P>): Promise<BaseAgentNextStep<P> | null> {
        // Loop agents always start with a prompt execution
        return null;
    }

    /**
     * Pre-processes retry steps for loop agent types.
     * 
     * Loop agents use the default retry behavior which executes the prompt again.
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @param {BaseAgentNextStep} retryStep - The retry step that was returned
     * @returns {Promise<BaseAgentNextStep<P> | null>} Always returns null to use default behavior
     * 
     * @override
     * @since 2.76.0
     */
    public async PreProcessRetryStep<P = any>(
        params: ExecuteAgentParams<P>,
        retryStep: BaseAgentNextStep<P>
    ): Promise<BaseAgentNextStep<P> | null> {
        // Loop agents use default retry behavior (execute prompt)
        return null;
    }
}

/**
 * Export a load function to ensure the class is registered with the ClassFactory
 */
export function LoadLoopAgentType() {
    // This function ensures the class isn't tree-shaken
}