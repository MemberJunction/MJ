/**
 * Unit tests for ChatHandlingOption functionality in sub-agent execution.
 *
 * These tests verify that when a sub-agent returns FinalStep='Chat',
 * the parent agent's ChatHandlingOption is respected and the Chat step
 * is remapped to Success/Failed/Retry as configured.
 *
 * To run these tests:
 *   npx ts-node src/__tests__/chat-handling-option.test.ts
 *
 * @since 3.1.1
 */

// ============================================================================
// Test Helpers - Simple assertion and test runner
// ============================================================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
    testCount++;
    if (condition) {
        passCount++;
        console.log(`  ✓ ${message}`);
    } else {
        failCount++;
        console.log(`  ✗ FAILED: ${message}`);
    }
}

function assertDeepEqual(actual: any, expected: any, message: string): void {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    assert(actualStr === expectedStr, message);
}

function testGroup(description: string, testFn: () => void): void {
    console.log(`\n${description}:`);
    testFn();
}

function printSummary(): void {
    console.log('\n' + '='.repeat(70));
    console.log('Test Summary');
    console.log('='.repeat(70));
    console.log(`Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
    if (failCount === 0) {
        console.log('\n✅ All tests passed!\n');
    } else {
        console.log(`\n❌ ${failCount} test(s) failed\n`);
        process.exit(1);
    }
}

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
    previousPayload?: any;
    newPayload?: any;
    responseForm?: any;
    actionableCommands?: any[];
    automaticCommands?: any[];
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
 * Implements ChatHandlingOption remapping logic - if the agent has ChatHandlingOption set,
 * the Chat step is remapped to the specified value (Success, Failed, or Retry).
 */
function validateChatNextStep(
    params: MockParams,
    nextStep: MockNextStep
): MockNextStep {
    // Check if the agent has ChatHandlingOption configured
    const chatHandlingOption = params.agent.ChatHandlingOption;

    if (chatHandlingOption) {
        // Use a switch to validate and map the ChatHandlingOption value
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
                // Invalid option - treat as null and allow Chat to propagate
                console.error(`Invalid ChatHandlingOption value: ${chatHandlingOption}`);
                return nextStep;
        }

        // Remap the Chat step to the configured option
        const remappedStep: MockNextStep = {
            ...nextStep,
            step: mappedStep
        };

        if (params.verbose) {
            console.log(`  [DEBUG] Remapping Chat step to ${chatHandlingOption}`);
        }

        return remappedStep;
    }

    // Default behavior: let Chat propagate up (no remapping)
    return nextStep;
}

// ============================================================================
// Tests for ChatHandlingOption with Sub-Agent Execution
// ============================================================================

testGroup('ChatHandlingOption = null (default behavior)', () => {
    const parentAgent: MockAgent = {
        ID: 'parent-1',
        Name: 'Parent Agent',
        ChatHandlingOption: null
    };

    const params: MockParams = { agent: parentAgent };

    const chatStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Need user input',
        newPayload: { someData: 'test' }
    };

    const result = validateChatNextStep(params, chatStep);

    assert(result.step === 'Chat', 'Chat step is not remapped when ChatHandlingOption is null');
    assert(result.message === 'Need user input', 'Message is preserved');
    assert(result.terminate === true, 'Terminate flag is preserved');
});

testGroup('ChatHandlingOption = "Success" (remap Chat to Success)', () => {
    const parentAgent: MockAgent = {
        ID: 'parent-2',
        Name: 'Parent Agent with Success Override',
        ChatHandlingOption: 'Success'
    };

    const params: MockParams = { agent: parentAgent };

    const chatStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Need user input',
        newPayload: { someData: 'test' },
        responseForm: { type: 'form' },
        actionableCommands: [{ command: 'approve' }]
    };

    const result = validateChatNextStep(params, chatStep);

    assert(result.step === 'Success', 'Chat step is remapped to Success');
    assert(result.message === 'Need user input', 'Message is preserved');
    assert(result.terminate === true, 'Terminate flag is preserved');
    assertDeepEqual(result.newPayload, { someData: 'test' }, 'Payload is preserved');
    assertDeepEqual(result.responseForm, { type: 'form' }, 'Response form is preserved');
});

testGroup('ChatHandlingOption = "Failed" (remap Chat to Failed)', () => {
    const parentAgent: MockAgent = {
        ID: 'parent-3',
        Name: 'Parent Agent with Failed Override',
        ChatHandlingOption: 'Failed'
    };

    const params: MockParams = { agent: parentAgent };

    const chatStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Cannot proceed without user input',
        newPayload: { someData: 'test' }
    };

    const result = validateChatNextStep(params, chatStep);

    assert(result.step === 'Failed', 'Chat step is remapped to Failed');
    assert(result.message === 'Cannot proceed without user input', 'Message is preserved');
});

testGroup('ChatHandlingOption = "Retry" (remap Chat to Retry)', () => {
    const parentAgent: MockAgent = {
        ID: 'parent-4',
        Name: 'Parent Agent with Retry Override',
        ChatHandlingOption: 'Retry'
    };

    const params: MockParams = { agent: parentAgent };

    const chatStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Need clarification',
        newPayload: { someData: 'test' }
    };

    const result = validateChatNextStep(params, chatStep);

    assert(result.step === 'Retry', 'Chat step is remapped to Retry');
    assert(result.message === 'Need clarification', 'Message is preserved');
});

testGroup('Sub-Agent Chat Bubbling (Real-World Scenario)', () => {
    // Scenario: Child agent returns Chat, parent has ChatHandlingOption = "Success"
    // Expected: Parent should remap Chat to Success and continue execution

    const childAgent: MockAgent = {
        ID: 'child-1',
        Name: 'Software Architect',
        ChatHandlingOption: null // Child allows Chat to propagate
    };

    const parentAgent: MockAgent = {
        ID: 'parent-5',
        Name: 'Technical Product Manager',
        ChatHandlingOption: 'Success' // Parent remaps Chat to Success
    };

    // Step 1: Child agent returns Chat (simulated)
    const childFinalStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Need design approval',
        newPayload: { technicalDesign: 'Component architecture' }
    };

    // Step 2: Parent receives child's Chat and validates through its ChatHandlingOption
    const parentParams: MockParams = { agent: parentAgent };
    const parentResult = validateChatNextStep(parentParams, childFinalStep);

    assert(parentResult.step === 'Success', 'Parent remaps child Chat to Success');
    assert(parentResult.message === 'Need design approval', 'Message from child is preserved');
    assertDeepEqual(
        parentResult.newPayload,
        { technicalDesign: 'Component architecture' },
        'Payload from child is preserved'
    );
});

testGroup('Verbose Logging', () => {
    const parentAgent: MockAgent = {
        ID: 'parent-6',
        Name: 'Verbose Agent',
        ChatHandlingOption: 'Success'
    };

    const params: MockParams = {
        agent: parentAgent,
        verbose: true
    };

    const chatStep: MockNextStep = {
        step: 'Chat',
        terminate: true,
        message: 'Test'
    };

    console.log('  Expected debug output:');
    const result = validateChatNextStep(params, chatStep);

    assert(result.step === 'Success', 'Chat remapped with verbose logging');
});

// ============================================================================
// Run Tests and Print Summary
// ============================================================================

printSummary();
