/**
 * Unit tests for Runtime Action Changes functionality.
 *
 * These tests verify the core logic for action change processing:
 * - doesChangeScopeApply(): Determines if a change applies to an agent
 * - applyActionChanges(): Applies changes to a base action set
 * - filterActionChangesForSubAgent(): Filters changes for sub-agent propagation
 *
 * To run these tests, you can use ts-node:
 *   npx ts-node src/__tests__/action-changes.test.ts
 *
 * @since 2.123.0
 */

import { ActionChange, ActionChangeScope } from '@memberjunction/ai-core-plus';

// ============================================================================
// Test Helpers - Standalone implementations of the methods for testing
// These mirror the implementations in BaseAgent but without class dependencies
// ============================================================================

/**
 * Determines if an action change scope applies to the current agent.
 */
function doesChangeScopeApply(
    scope: ActionChangeScope,
    agentId: string,
    isRoot: boolean,
    agentIds?: string[]
): boolean {
    switch (scope) {
        case 'global':
            return true;
        case 'root':
            return isRoot;
        case 'all-subagents':
            return !isRoot;
        case 'specific':
            return agentIds?.includes(agentId) ?? false;
        default:
            return false;
    }
}

/**
 * Mock action type for testing
 */
interface MockAction {
    ID: string;
    Name: string;
    Status: string;
}

/**
 * Mock action registry for testing applyActionChanges
 */
const mockActionRegistry: MockAction[] = [
    { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
    { ID: 'action-2', Name: 'Create Record', Status: 'Active' },
    { ID: 'action-3', Name: 'Delete Record', Status: 'Active' },
    { ID: 'action-4', Name: 'Execute SQL', Status: 'Active' },
    { ID: 'action-5', Name: 'LMS Query', Status: 'Active' },
    { ID: 'action-6', Name: 'CRM Search', Status: 'Active' },
];

/**
 * Applies runtime action changes to a base set of actions.
 */
function applyActionChanges(
    baseActions: MockAction[],
    actionChanges: ActionChange[],
    agentId: string,
    isRoot: boolean
): MockAction[] {
    let actions = [...baseActions];

    for (const change of actionChanges) {
        if (!doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) {
            continue;
        }

        if (change.mode === 'add') {
            for (const actionId of change.actionIds) {
                if (!actions.some(a => a.ID === actionId)) {
                    const actionToAdd = mockActionRegistry.find(a => a.ID === actionId);
                    if (actionToAdd) {
                        actions.push(actionToAdd);
                    }
                }
            }
        } else if (change.mode === 'remove') {
            actions = actions.filter(a => !change.actionIds.includes(a.ID));
        }
    }

    return actions;
}

/**
 * Filters and transforms action changes for propagation to a sub-agent.
 */
function filterActionChangesForSubAgent(
    actionChanges: ActionChange[] | undefined
): ActionChange[] | undefined {
    if (!actionChanges?.length) {
        return undefined;
    }

    const filtered: ActionChange[] = [];

    for (const change of actionChanges) {
        switch (change.scope) {
            case 'root':
                // Don't propagate - only applied to root
                continue;

            case 'global':
                // Propagate as-is - applies to everyone
                filtered.push(change);
                break;

            case 'all-subagents':
                // Propagate as 'global' since from sub-agent's perspective,
                // it and its children should all get this
                filtered.push({ ...change, scope: 'global' });
                break;

            case 'specific':
                // Propagate as-is, each agent checks if it's in the list
                filtered.push(change);
                break;
        }
    }

    return filtered.length > 0 ? filtered : undefined;
}

// ============================================================================
// Test Framework (simple assertion-based)
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ❌ ${message}`);
        testsFailed++;
    }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    if (actualStr === expectedStr) {
        console.log(`  ✅ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ❌ ${message}`);
        console.log(`     Expected: ${expectedStr}`);
        console.log(`     Actual: ${actualStr}`);
        testsFailed++;
    }
}

function testGroup(name: string, fn: () => void): void {
    console.log(`\n📋 ${name}`);
    fn();
}

// ============================================================================
// Tests for doesChangeScopeApply
// ============================================================================

testGroup('doesChangeScopeApply - global scope', () => {
    assert(
        doesChangeScopeApply('global', 'agent-1', true) === true,
        'global scope applies to root agent'
    );
    assert(
        doesChangeScopeApply('global', 'agent-2', false) === true,
        'global scope applies to sub-agent'
    );
});

testGroup('doesChangeScopeApply - root scope', () => {
    assert(
        doesChangeScopeApply('root', 'agent-1', true) === true,
        'root scope applies to root agent'
    );
    assert(
        doesChangeScopeApply('root', 'agent-2', false) === false,
        'root scope does NOT apply to sub-agent'
    );
});

testGroup('doesChangeScopeApply - all-subagents scope', () => {
    assert(
        doesChangeScopeApply('all-subagents', 'agent-1', true) === false,
        'all-subagents scope does NOT apply to root agent'
    );
    assert(
        doesChangeScopeApply('all-subagents', 'agent-2', false) === true,
        'all-subagents scope applies to sub-agent'
    );
});

testGroup('doesChangeScopeApply - specific scope', () => {
    const specificAgents = ['agent-2', 'agent-3'];
    assert(
        doesChangeScopeApply('specific', 'agent-1', true, specificAgents) === false,
        'specific scope does NOT apply to agent not in list (root)'
    );
    assert(
        doesChangeScopeApply('specific', 'agent-2', false, specificAgents) === true,
        'specific scope applies to agent in list'
    );
    assert(
        doesChangeScopeApply('specific', 'agent-4', false, specificAgents) === false,
        'specific scope does NOT apply to agent not in list (sub-agent)'
    );
    assert(
        doesChangeScopeApply('specific', 'agent-1', true, undefined) === false,
        'specific scope with undefined agentIds returns false'
    );
    assert(
        doesChangeScopeApply('specific', 'agent-1', true, []) === false,
        'specific scope with empty agentIds returns false'
    );
});

// ============================================================================
// Tests for applyActionChanges
// ============================================================================

testGroup('applyActionChanges - add mode with global scope', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        { scope: 'global', mode: 'add', actionIds: ['action-5', 'action-6'] }
    ];

    const result = applyActionChanges(baseActions, changes, 'agent-1', true);

    assert(result.length === 3, 'should have 3 actions after adding 2');
    assert(
        result.some(a => a.ID === 'action-5'),
        'should include action-5 (LMS Query)'
    );
    assert(
        result.some(a => a.ID === 'action-6'),
        'should include action-6 (CRM Search)'
    );
});

testGroup('applyActionChanges - add mode does not duplicate', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
        { ID: 'action-5', Name: 'LMS Query', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        { scope: 'global', mode: 'add', actionIds: ['action-5', 'action-6'] }
    ];

    const result = applyActionChanges(baseActions, changes, 'agent-1', true);

    assert(result.length === 3, 'should have 3 actions (no duplicate action-5)');
    assert(
        result.filter(a => a.ID === 'action-5').length === 1,
        'should have exactly one action-5'
    );
});

testGroup('applyActionChanges - remove mode', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
        { ID: 'action-3', Name: 'Delete Record', Status: 'Active' },
        { ID: 'action-4', Name: 'Execute SQL', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        { scope: 'global', mode: 'remove', actionIds: ['action-3', 'action-4'] }
    ];

    const result = applyActionChanges(baseActions, changes, 'agent-1', true);

    assert(result.length === 1, 'should have 1 action after removing 2');
    assert(
        result[0].ID === 'action-1',
        'should only have action-1 remaining'
    );
});

testGroup('applyActionChanges - scope filtering (root only)', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        { scope: 'root', mode: 'add', actionIds: ['action-5'] }
    ];

    const rootResult = applyActionChanges(baseActions, changes, 'root-agent', true);
    const subAgentResult = applyActionChanges(baseActions, changes, 'sub-agent', false);

    assert(rootResult.length === 2, 'root agent should have 2 actions');
    assert(subAgentResult.length === 1, 'sub-agent should still have 1 action (change not applied)');
});

testGroup('applyActionChanges - scope filtering (all-subagents)', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
        { ID: 'action-3', Name: 'Delete Record', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        { scope: 'all-subagents', mode: 'remove', actionIds: ['action-3'] }
    ];

    const rootResult = applyActionChanges(baseActions, changes, 'root-agent', true);
    const subAgentResult = applyActionChanges(baseActions, changes, 'sub-agent', false);

    assert(rootResult.length === 2, 'root agent should still have 2 actions (change not applied)');
    assert(subAgentResult.length === 1, 'sub-agent should have 1 action after removal');
});

testGroup('applyActionChanges - scope filtering (specific)', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        {
            scope: 'specific',
            mode: 'add',
            actionIds: ['action-5'],
            agentIds: ['special-agent']
        }
    ];

    const normalResult = applyActionChanges(baseActions, changes, 'normal-agent', false);
    const specialResult = applyActionChanges(baseActions, changes, 'special-agent', false);

    assert(normalResult.length === 1, 'normal agent should have 1 action (not in agentIds)');
    assert(specialResult.length === 2, 'special agent should have 2 actions (in agentIds)');
});

testGroup('applyActionChanges - multiple changes applied in order', () => {
    const baseActions: MockAction[] = [
        { ID: 'action-1', Name: 'Send Email', Status: 'Active' },
        { ID: 'action-2', Name: 'Create Record', Status: 'Active' },
    ];

    const changes: ActionChange[] = [
        // First remove action-2
        { scope: 'global', mode: 'remove', actionIds: ['action-2'] },
        // Then add action-5
        { scope: 'global', mode: 'add', actionIds: ['action-5'] }
    ];

    const result = applyActionChanges(baseActions, changes, 'agent-1', true);

    assert(result.length === 2, 'should have 2 actions');
    assert(
        !result.some(a => a.ID === 'action-2'),
        'should not have action-2 (removed)'
    );
    assert(
        result.some(a => a.ID === 'action-5'),
        'should have action-5 (added)'
    );
});

// ============================================================================
// Tests for filterActionChangesForSubAgent
// ============================================================================

testGroup('filterActionChangesForSubAgent - empty/undefined input', () => {
    assert(
        filterActionChangesForSubAgent(undefined) === undefined,
        'undefined input returns undefined'
    );
    assert(
        filterActionChangesForSubAgent([]) === undefined,
        'empty array returns undefined'
    );
});

testGroup('filterActionChangesForSubAgent - global scope propagated as-is', () => {
    const changes: ActionChange[] = [
        { scope: 'global', mode: 'add', actionIds: ['action-1'] }
    ];

    const result = filterActionChangesForSubAgent(changes);

    assert(result !== undefined, 'should return a result');
    assert(result!.length === 1, 'should have 1 change');
    assert(result![0].scope === 'global', 'scope should remain global');
    assert(result![0].mode === 'add', 'mode should remain add');
    assertDeepEqual(result![0].actionIds, ['action-1'], 'actionIds should be preserved');
});

testGroup('filterActionChangesForSubAgent - root scope NOT propagated', () => {
    const changes: ActionChange[] = [
        { scope: 'root', mode: 'add', actionIds: ['action-1'] }
    ];

    const result = filterActionChangesForSubAgent(changes);

    assert(result === undefined, 'root scope should not be propagated');
});

testGroup('filterActionChangesForSubAgent - all-subagents becomes global', () => {
    const changes: ActionChange[] = [
        { scope: 'all-subagents', mode: 'remove', actionIds: ['action-3'] }
    ];

    const result = filterActionChangesForSubAgent(changes);

    assert(result !== undefined, 'should return a result');
    assert(result!.length === 1, 'should have 1 change');
    assert(result![0].scope === 'global', 'scope should be transformed to global');
    assert(result![0].mode === 'remove', 'mode should remain remove');
});

testGroup('filterActionChangesForSubAgent - specific scope propagated as-is', () => {
    const changes: ActionChange[] = [
        { scope: 'specific', mode: 'add', actionIds: ['action-5'], agentIds: ['agent-x', 'agent-y'] }
    ];

    const result = filterActionChangesForSubAgent(changes);

    assert(result !== undefined, 'should return a result');
    assert(result!.length === 1, 'should have 1 change');
    assert(result![0].scope === 'specific', 'scope should remain specific');
    assertDeepEqual(result![0].agentIds, ['agent-x', 'agent-y'], 'agentIds should be preserved');
});

testGroup('filterActionChangesForSubAgent - mixed scopes', () => {
    const changes: ActionChange[] = [
        { scope: 'global', mode: 'add', actionIds: ['action-1'] },
        { scope: 'root', mode: 'add', actionIds: ['action-2'] },
        { scope: 'all-subagents', mode: 'remove', actionIds: ['action-3'] },
        { scope: 'specific', mode: 'add', actionIds: ['action-4'], agentIds: ['agent-x'] }
    ];

    const result = filterActionChangesForSubAgent(changes);

    assert(result !== undefined, 'should return a result');
    assert(result!.length === 3, 'should have 3 changes (root filtered out)');

    // Check each expected change
    const globalChange = result!.find(c => c.actionIds.includes('action-1'));
    const transformedChange = result!.find(c => c.actionIds.includes('action-3'));
    const specificChange = result!.find(c => c.actionIds.includes('action-4'));

    assert(globalChange !== undefined, 'global change should be present');
    assert(globalChange!.scope === 'global', 'global change should remain global');

    assert(transformedChange !== undefined, 'all-subagents change should be transformed');
    assert(transformedChange!.scope === 'global', 'all-subagents should become global');

    assert(specificChange !== undefined, 'specific change should be present');
    assert(specificChange!.scope === 'specific', 'specific change should remain specific');
});

// ============================================================================
// Test Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(60));

if (testsFailed > 0) {
    process.exit(1);
}
