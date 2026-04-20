/**
 * Unit tests for credential error handling in AI Agent execution.
 *
 * These tests verify:
 * 1. isFatalPromptError() correctly identifies missing-credential errors as fatal
 * 2. The max consecutive failed steps safety net terminates infinite retry loops
 * 3. Error messages propagate correctly through the agent run to the UI
 *
 * Uses standalone implementations mirroring BaseAgent logic, following the
 * same pattern as other agent test files (action-changes, chat-handling, etc.).
 *
 * @since 5.6.0 (credential error / infinite loop fix)
 */

import { describe, it, expect } from 'vitest';
import { AIErrorInfo, AIErrorType, ErrorSeverity } from '@memberjunction/ai';

// ============================================================================
// Mock Types
// ============================================================================

/**
 * Mock ChatResult for testing
 */
interface MockChatResult {
    success: boolean;
    errorMessage?: string;
    errorInfo?: AIErrorInfo;
}

/**
 * Mock AIPromptRunResult for testing
 */
interface MockPromptRunResult {
    success: boolean;
    errorMessage?: string;
    chatResult?: MockChatResult;
}

/**
 * Mock next step for execution loop testing
 */
interface MockNextStep {
    step: 'Success' | 'Failed' | 'Retry' | 'Chat' | 'Actions' | 'Sub-Agent';
    terminate: boolean;
    errorMessage?: string;
}

// ============================================================================
// Standalone Implementation of isFatalPromptError for Testing
// This mirrors the BaseAgent.isFatalPromptError() implementation
// ============================================================================

const FATAL_ERROR_TYPES: AIErrorType[] = [
    'ContextLengthExceeded',
    'Authentication',
    'NoCredentials',
    'InvalidRequest'
];

/**
 * Determines if a prompt error is fatal and should not be retried.
 */
function isFatalPromptError(promptResult: MockPromptRunResult): boolean {
    // First check error message for template rendering errors
    if (promptResult?.errorMessage) {
        const templateErrorPattern = /Failed to render/i;
        if (templateErrorPattern.test(promptResult.errorMessage)) {
            return true;
        }

        // Credential/configuration errors are permanent — retrying won't help.
        if (promptResult.errorMessage.includes('No suitable model found') ||
            promptResult.errorMessage.includes('No credentials found') ||
            promptResult.errorMessage.includes('No valid API credentials')) {
            return true;
        }
    }

    // If no error info, not fatal (might be transient)
    if (!promptResult?.chatResult?.errorInfo) {
        return false;
    }

    const errorInfo = promptResult.chatResult.errorInfo;

    // Check severity first
    if (errorInfo.severity === 'Fatal') {
        return true;
    }

    return FATAL_ERROR_TYPES.includes(errorInfo.errorType);
}

// ============================================================================
// Standalone Implementation of executeAgentInternal safety net for Testing
// This mirrors the consecutive-failure tracking in BaseAgent.executeAgentInternal()
// ============================================================================

const MAX_CONSECUTIVE_FAILED_STEPS = 10;

/**
 * Simulates the agent execution loop with the consecutive failure safety net.
 * Returns the final step and total step count.
 */
function simulateExecutionLoop(
    stepProducer: (stepIndex: number) => MockNextStep
): { finalStep: MockNextStep; stepCount: number } {
    let continueExecution = true;
    let currentNextStep: MockNextStep | null = null;
    let stepCount = 0;
    let consecutiveFailedSteps = 0;

    while (continueExecution) {
        const nextStep = stepProducer(stepCount);
        stepCount++;

        // Track consecutive failed steps
        if (nextStep.step === 'Failed' && !nextStep.terminate) {
            consecutiveFailedSteps++;
            if (consecutiveFailedSteps >= MAX_CONSECUTIVE_FAILED_STEPS) {
                nextStep.terminate = true;
                nextStep.errorMessage = `Agent terminated after ${consecutiveFailedSteps} consecutive failed steps. ` +
                    `Last error: ${nextStep.errorMessage || 'Unknown'}`;
            }
        } else if (nextStep.step !== 'Failed') {
            consecutiveFailedSteps = 0;
        }

        if (nextStep.terminate) {
            continueExecution = false;
        }

        currentNextStep = nextStep;
    }

    return { finalStep: currentNextStep!, stepCount };
}

// ============================================================================
// Tests for isFatalPromptError
// ============================================================================

describe('isFatalPromptError - Credential Error Detection', () => {
    describe('error message pattern detection (safety net)', () => {
        it('should detect "No suitable model found" as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'No suitable model found for prompt Sage - System Prompt. ' +
                    'No valid API credentials/keys are configured for any of the candidate ' +
                    'model-vendor combinations. Tried: GPT-4/OpenAI, Claude/Anthropic.'
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect "No credentials found" as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'No credentials found for any model-vendor combination. ' +
                    'Tried: GPT-4/OpenAI, Claude/Anthropic'
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect "No valid API credentials" as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'No valid API credentials configured for driver OpenAILLM'
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect fatal even without errorInfo (the safety net case)', () => {
            // This is the exact scenario from the bug: error message is set but
            // chatResult has no errorInfo, so we must detect by message pattern
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'No suitable model found for prompt System Prompt',
                chatResult: { success: false, errorMessage: 'No suitable model found' }
                // Note: no errorInfo! This was the original bug.
            };

            expect(isFatalPromptError(result)).toBe(true);
        });
    });

    describe('errorInfo-based detection (primary path)', () => {
        it('should detect NoCredentials errorType as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'No suitable model found',
                chatResult: {
                    success: false,
                    errorMessage: 'No suitable model found',
                    errorInfo: {
                        errorType: 'NoCredentials',
                        severity: 'Fatal',
                        canFailover: false
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect Authentication errorType as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Invalid API key',
                chatResult: {
                    success: false,
                    errorMessage: 'Invalid API key',
                    errorInfo: {
                        errorType: 'Authentication',
                        severity: 'Fatal',
                        canFailover: true
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect Fatal severity as fatal regardless of errorType', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Some fatal error',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'Unknown',
                        severity: 'Fatal',
                        canFailover: false
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect ContextLengthExceeded as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Context length exceeded',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'ContextLengthExceeded',
                        severity: 'Fatal',
                        canFailover: true
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(true);
        });

        it('should detect InvalidRequest as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Malformed JSON',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'InvalidRequest',
                        severity: 'Fatal',
                        canFailover: false
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(true);
        });
    });

    describe('non-fatal error detection', () => {
        it('should NOT treat RateLimit as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Rate limit exceeded',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'RateLimit',
                        severity: 'Retriable',
                        canFailover: true
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(false);
        });

        it('should NOT treat NetworkError as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Connection timeout',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'NetworkError',
                        severity: 'Retriable',
                        canFailover: true
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(false);
        });

        it('should NOT treat ServiceUnavailable as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Service unavailable',
                chatResult: {
                    success: false,
                    errorInfo: {
                        errorType: 'ServiceUnavailable',
                        severity: 'Retriable',
                        canFailover: true
                    }
                }
            };

            expect(isFatalPromptError(result)).toBe(false);
        });

        it('should NOT treat errors without errorInfo as fatal (generic transient)', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Some unknown transient error',
                chatResult: { success: false }
            };

            expect(isFatalPromptError(result)).toBe(false);
        });
    });

    describe('template rendering errors', () => {
        it('should treat "Failed to render" as fatal', () => {
            const result: MockPromptRunResult = {
                success: false,
                errorMessage: 'Failed to render template for prompt System Prompt'
            };

            expect(isFatalPromptError(result)).toBe(true);
        });
    });
});

// ============================================================================
// Tests for Max Consecutive Failed Steps Safety Net
// ============================================================================

describe('executeAgentInternal - Max Consecutive Failed Steps Safety Net', () => {
    it('should terminate after MAX_CONSECUTIVE_FAILED_STEPS non-terminating failures', () => {
        // Simulate the exact bug scenario: every step returns Failed with terminate=false
        const { finalStep, stepCount } = simulateExecutionLoop(
            () => ({
                step: 'Failed',
                terminate: false,
                errorMessage: 'No suitable model found for prompt System Prompt'
            })
        );

        expect(stepCount).toBe(MAX_CONSECUTIVE_FAILED_STEPS);
        expect(finalStep.terminate).toBe(true);
        expect(finalStep.step).toBe('Failed');
        expect(finalStep.errorMessage).toContain('consecutive failed steps');
        expect(finalStep.errorMessage).toContain('No suitable model found');
    });

    it('should reset counter when a non-Failed step occurs', () => {
        let callCount = 0;
        const { finalStep, stepCount } = simulateExecutionLoop(
            (index) => {
                callCount++;
                // First 5 steps fail, then succeed, then 5 more fail, then succeed, then terminate
                if (index < 5) {
                    return { step: 'Failed', terminate: false, errorMessage: 'Transient error' };
                } else if (index === 5) {
                    return { step: 'Retry', terminate: false }; // Resets counter
                } else if (index < 11) {
                    return { step: 'Failed', terminate: false, errorMessage: 'Another error' };
                } else {
                    return { step: 'Success', terminate: true }; // Terminates normally
                }
            }
        );

        // Should complete normally because the counter was reset at step 5
        expect(finalStep.step).toBe('Success');
        expect(finalStep.terminate).toBe(true);
        expect(stepCount).toBe(12);
    });

    it('should not trigger for Failed steps with terminate=true (already terminating)', () => {
        const { finalStep, stepCount } = simulateExecutionLoop(
            () => ({
                step: 'Failed',
                terminate: true, // Already terminating, safety net should not interfere
                errorMessage: 'Fatal error detected'
            })
        );

        expect(stepCount).toBe(1);
        expect(finalStep.terminate).toBe(true);
        expect(finalStep.errorMessage).toBe('Fatal error detected');
        // Should NOT contain the safety net message
        expect(finalStep.errorMessage).not.toContain('consecutive failed steps');
    });

    it('should not trigger for non-Failed steps', () => {
        let callCount = 0;
        const { finalStep, stepCount } = simulateExecutionLoop(
            (index) => {
                callCount++;
                if (index < 15) {
                    return { step: 'Retry', terminate: false }; // Retry is not Failed
                }
                return { step: 'Success', terminate: true };
            }
        );

        // Should complete normally even with many retries
        expect(finalStep.step).toBe('Success');
        expect(stepCount).toBe(16);
    });

    it('should include last error message in the safety net termination message', () => {
        const { finalStep } = simulateExecutionLoop(
            () => ({
                step: 'Failed',
                terminate: false,
                errorMessage: 'No suitable model found for prompt Sage - System Prompt'
            })
        );

        expect(finalStep.errorMessage).toContain('No suitable model found for prompt Sage - System Prompt');
        expect(finalStep.errorMessage).toContain(`${MAX_CONSECUTIVE_FAILED_STEPS} consecutive failed steps`);
    });

    it('should handle undefined error messages in the safety net', () => {
        const { finalStep } = simulateExecutionLoop(
            () => ({
                step: 'Failed',
                terminate: false
                // No errorMessage set
            })
        );

        expect(finalStep.errorMessage).toContain('consecutive failed steps');
        expect(finalStep.errorMessage).toContain('Unknown');
    });
});

// ============================================================================
// Tests for Error Message Propagation to UI
// ============================================================================

describe('Error message propagation to conversation detail', () => {
    /**
     * Simulates how AgentRunner.RunAgentInConversation sets the conversation
     * detail message on failure, matching the real implementation.
     */
    function getConversationDetailMessage(
        agentRunMessage: string | null | undefined,
        agentRunErrorMessage: string | null | undefined,
        success: boolean
    ): string {
        return agentRunMessage ||
            (success
                ? '✅ Completed'
                : agentRunErrorMessage || '❌ Failed');
    }

    it('should show ErrorMessage when Message is null and agent failed', () => {
        const message = getConversationDetailMessage(
            null,
            'No suitable model found for prompt System Prompt. No valid API credentials/keys are configured.',
            false
        );

        expect(message).toContain('No suitable model found');
        expect(message).toContain('No valid API credentials');
    });

    it('should prefer Message over ErrorMessage when both are set', () => {
        const message = getConversationDetailMessage(
            'Agent completed with warnings',
            'Some error occurred',
            false
        );

        expect(message).toBe('Agent completed with warnings');
    });

    it('should fall back to generic failure when both Message and ErrorMessage are null', () => {
        const message = getConversationDetailMessage(null, null, false);

        expect(message).toBe('❌ Failed');
    });

    it('should show success message when agent succeeds', () => {
        const message = getConversationDetailMessage(null, null, true);

        expect(message).toBe('✅ Completed');
    });

    it('should show custom Message on success if available', () => {
        const message = getConversationDetailMessage(
            'Analysis complete: found 3 results',
            null,
            true
        );

        expect(message).toBe('Analysis complete: found 3 results');
    });
});
