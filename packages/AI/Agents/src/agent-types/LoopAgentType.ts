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
import { BaseAgentType } from '../base-agent-type';
import { BaseAgentNextStep } from '../types';
import { AIPromptRunResult } from '@memberjunction/ai-prompts';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Response structure expected from the Loop Agent Type system prompt.
 * This interface matches the JSON schema defined in the loop agent type template.
 */
interface LoopAgentResponse {
    taskComplete: boolean;
    reasoning: string;
    nextStep: {
        type: 'action' | 'sub-agent' | 'continue' | 'none';
        target?: string;
        parameters?: Record<string, unknown>;
    };
    result?: Record<string, unknown>;
    progress?: {
        percentage: number;
        message: string;
    };
    error?: {
        occurred: boolean;
        message?: string;
    };
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

            // Parse the result as LoopAgentResponse
            const response = promptResult.result as LoopAgentResponse;
            
            // Validate the response structure
            if (!this.isValidLoopResponse(response)) {
                return {
                    step: 'failed',
                    errorMessage: 'Invalid response structure from loop agent prompt'
                };
            }

            // Log the agent's reasoning
            LogStatus(`🔄 Loop Agent Reasoning: ${response.reasoning}`);
            
            // Log progress if available
            if (response.progress) {
                LogStatus(`📊 Progress: ${response.progress.percentage}% - ${response.progress.message}`);
            }

            // Check for errors first
            if (response.error?.occurred) {
                return {
                    step: 'failed',
                    errorMessage: response.error.message || 'Agent reported an error'
                };
            }

            // Check if task is complete
            if (response.taskComplete) {
                LogStatus('✅ Loop Agent: Task completed successfully');
                return {
                    step: 'success',
                    returnValue: response.result || response
                };
            }

            // Determine next step based on type
            switch (response.nextStep.type) {
                case 'sub-agent':
                    if (!response.nextStep.target) {
                        return {
                            step: 'failed',
                            errorMessage: 'Sub-agent target not specified'
                        };
                    }
                    return {
                        step: 'sub-agent',
                        subAgentName: response.nextStep.target,
                        subAgentInstructions: response.nextStep.parameters as Record<string, unknown>
                    };

                case 'action':
                    if (!response.nextStep.target) {
                        return {
                            step: 'failed',
                            errorMessage: 'Action target not specified'
                        };
                    }
                    return {
                        step: 'action',
                        actionName: response.nextStep.target,
                        actionParameters: response.nextStep.parameters
                    };

                case 'continue':
                    // Agent wants to continue processing in the next iteration
                    return {
                        step: 'retry',
                        retryReason: 'Agent requested continuation',
                        retryInstructions: response.reasoning
                    };

                case 'none':
                    // No action needed but task not complete - this might be an error condition
                    LogStatus('⚠️ Loop Agent: No next step but task not complete');
                    return {
                        step: 'retry',
                        retryReason: 'No action specified but task incomplete'
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

        if (!response.nextStep || typeof response.nextStep !== 'object') {
            LogError('LoopAgentResponse missing required field: nextStep');
            return false;
        }

        const validStepTypes = ['action', 'sub-agent', 'continue', 'none'];
        if (!validStepTypes.includes(response.nextStep.type)) {
            LogError(`LoopAgentResponse has invalid nextStep.type: ${response.nextStep.type}`);
            return false;
        }

        // Validate that target is provided for action and sub-agent types
        if ((response.nextStep.type === 'action' || response.nextStep.type === 'sub-agent') && 
            !response.nextStep.target) {
            LogError(`LoopAgentResponse requires target for nextStep.type: ${response.nextStep.type}`);
            return false;
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