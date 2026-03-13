/**
 * Unit tests for ChatHandlingOption functionality in sub-agent execution.
 *
 * These tests verify that when a sub-agent returns FinalStep='Chat',
 * the parent agent's ChatHandlingOption is respected and the Chat step
 * is remapped to Success/Failed/Retry as configured.
 *
 * @since 3.1.1
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Mock Types and Helpers
// ============================================================================

/**
 * Mock agent entity for testing
 */
interface MockAgent {
    ID: string;
    Name: string;
    ChatHandlingOption: 'Success' | 'Failed' | 'Retry' | null;
}

/**
 * Mock next step structure
 */
interface MockNextStep {
    step: 'Success' | 'Failed' | 'Chat' | 'Retry';
    terminate?: boolean;
    message?: string | null;
    previousPayload?: Record<string, unknown>;
    newPayload?: Record<string, unknown>;
    responseForm?: Record<string, unknown>;
    actionableCommands?: Record<string, unknown>[];
    automaticCommands?: Record<string, unknown>[];
}

/**
 * Mock params structure
 */
interface MockParams {
    agent: MockAgent;
    verbose?: boolean;
}

// ============================================================================
// Standalone Implementation of validateChatNextStep for Testing
// This mirrors the BaseAgent.validateChatNextStep() implementation
// ============================================================================

/**
 * Validates that the Chat next step is valid and can be executed by the current agent.
 * Implements ChatHandlingOption remapping logic.
 */
function validateChatNextStep(
    params: MockParams,
    nextStep: MockNextStep
): MockNextStep {
    const chatHandlingOption = params.agent.ChatHandlingOption;

    if (chatHandlingOption) {
        let mappedStep: 'Success' | 'Failed' | 'Retry';

        switch (chatHandlingOption) {
            case 'Success':
                mappedStep = 'Success';
                break;
            case 'Failed':
                mappedStep = 'Failed';
                break;
            case 'Retry':
                mappedStep = 'Retry';
                break;
            default:
                console.error(`Invalid ChatHandlingOption value: ${chatHandlingOption}`);
                return nextStep;
        }

        const remappedStep: MockNextStep = {
            ...nextStep,
            step: mappedStep
        };

        if (params.verbose) {
            console.log(`  [DEBUG] Remapping Chat step to ${chatHandlingOption}`);
        }

        return remappedStep;
    }

    return nextStep;
}

// ============================================================================
// Tests for ChatHandlingOption with Sub-Agent Execution
// ============================================================================

describe('ChatHandlingOption', () => {
    it('null (default behavior) - Chat step is not remapped', () => {
        const parentAgent: MockAgent = { ID: 'parent-1', Name: 'Parent Agent', ChatHandlingOption: null };
        const params: MockParams = { agent: parentAgent };
        const chatStep: MockNextStep = { step: 'Chat', terminate: true, message: 'Need user input', newPayload: { someData: 'test' } };

        const result = validateChatNextStep(params, chatStep);

        expect(result.step).toBe('Chat');
        expect(result.message).toBe('Need user input');
        expect(result.terminate).toBe(true);
    });

    it('"Success" - remap Chat to Success', () => {
        const parentAgent: MockAgent = { ID: 'parent-2', Name: 'Parent Agent', ChatHandlingOption: 'Success' };
        const params: MockParams = { agent: parentAgent };
        const chatStep: MockNextStep = {
            step: 'Chat', terminate: true, message: 'Need user input',
            newPayload: { someData: 'test' }, responseForm: { type: 'form' },
            actionableCommands: [{ command: 'approve' }]
        };

        const result = validateChatNextStep(params, chatStep);

        expect(result.step).toBe('Success');
        expect(result.message).toBe('Need user input');
        expect(result.terminate).toBe(true);
        expect(result.newPayload).toEqual({ someData: 'test' });
        expect(result.responseForm).toEqual({ type: 'form' });
    });

    it('"Failed" - remap Chat to Failed', () => {
        const parentAgent: MockAgent = { ID: 'parent-3', Name: 'Parent Agent', ChatHandlingOption: 'Failed' };
        const params: MockParams = { agent: parentAgent };
        const chatStep: MockNextStep = { step: 'Chat', terminate: true, message: 'Cannot proceed without user input', newPayload: { someData: 'test' } };

        const result = validateChatNextStep(params, chatStep);

        expect(result.step).toBe('Failed');
        expect(result.message).toBe('Cannot proceed without user input');
    });

    it('"Retry" - remap Chat to Retry', () => {
        const parentAgent: MockAgent = { ID: 'parent-4', Name: 'Parent Agent', ChatHandlingOption: 'Retry' };
        const params: MockParams = { agent: parentAgent };
        const chatStep: MockNextStep = { step: 'Chat', terminate: true, message: 'Need clarification', newPayload: { someData: 'test' } };

        const result = validateChatNextStep(params, chatStep);

        expect(result.step).toBe('Retry');
        expect(result.message).toBe('Need clarification');
    });
});

describe('Sub-Agent Chat Bubbling (Real-World Scenario)', () => {
    it('Parent remaps child Chat to Success', () => {
        const parentAgent: MockAgent = { ID: 'parent-5', Name: 'Technical Product Manager', ChatHandlingOption: 'Success' };

        const childFinalStep: MockNextStep = {
            step: 'Chat', terminate: true, message: 'Need design approval',
            newPayload: { technicalDesign: 'Component architecture' }
        };

        const parentParams: MockParams = { agent: parentAgent };
        const parentResult = validateChatNextStep(parentParams, childFinalStep);

        expect(parentResult.step).toBe('Success');
        expect(parentResult.message).toBe('Need design approval');
        expect(parentResult.newPayload).toEqual({ technicalDesign: 'Component architecture' });
    });
});

describe('Verbose Logging', () => {
    it('Chat remapped with verbose logging', () => {
        const parentAgent: MockAgent = { ID: 'parent-6', Name: 'Verbose Agent', ChatHandlingOption: 'Success' };
        const params: MockParams = { agent: parentAgent, verbose: true };
        const chatStep: MockNextStep = { step: 'Chat', terminate: true, message: 'Test' };

        const result = validateChatNextStep(params, chatStep);

        expect(result.step).toBe('Success');
    });
});
