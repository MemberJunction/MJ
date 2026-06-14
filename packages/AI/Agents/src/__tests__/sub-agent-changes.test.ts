/**
 * Unit tests for Runtime Sub-Agent Changes functionality (Wave 3 / #12).
 *
 * Mirrors action-changes.test.ts. Verifies the core logic for sub-agent change processing:
 * - doesChangeScopeApply(): Determines if a change applies to an agent (shared with actions)
 * - applySubAgentChanges(): Applies changes to a base sub-agent set
 * - filterSubAgentChangesForSubAgent(): Filters changes for sub-agent propagation
 *
 * As with action-changes.test.ts, these use standalone re-implementations that mirror BaseAgent's
 * methods without the class dependency graph.
 *
 * @since 2.132.0
 */

import { describe, it, expect } from 'vitest';
import { SubAgentChange, ActionChangeScope } from '@memberjunction/ai-core-plus';

function doesChangeScopeApply(scope: ActionChangeScope, agentId: string, isRoot: boolean, agentIds?: string[]): boolean {
    switch (scope) {
        case 'global': return true;
        case 'root': return isRoot;
        case 'all-subagents': return !isRoot;
        case 'specific': return agentIds?.includes(agentId) ?? false;
        default: return false;
    }
}

interface MockAgent { ID: string; Name: string; }

const mockAgentRegistry: MockAgent[] = [
    { ID: 'sub-1', Name: 'Researcher' },
    { ID: 'sub-2', Name: 'Writer' },
    { ID: 'sub-3', Name: 'Fraud Specialist' },
    { ID: 'sub-4', Name: 'Risky Sub-Agent' },
];

function applySubAgentChanges(
    baseSubAgents: MockAgent[],
    subAgentChanges: SubAgentChange[],
    agentId: string,
    isRoot: boolean
): MockAgent[] {
    let subAgents = [...baseSubAgents];
    for (const change of subAgentChanges) {
        if (!doesChangeScopeApply(change.scope, agentId, isRoot, change.agentIds)) continue;
        if (change.mode === 'add') {
            for (const id of change.subAgentIds) {
                if (!subAgents.some(a => a.ID === id)) {
                    const toAdd = mockAgentRegistry.find(a => a.ID === id);
                    if (toAdd) subAgents.push(toAdd);
                }
            }
        } else if (change.mode === 'remove') {
            subAgents = subAgents.filter(a => !change.subAgentIds.includes(a.ID));
        }
    }
    return subAgents;
}

function filterSubAgentChangesForSubAgent(subAgentChanges: SubAgentChange[] | undefined): SubAgentChange[] | undefined {
    if (!subAgentChanges?.length) return undefined;
    const filtered: SubAgentChange[] = [];
    for (const change of subAgentChanges) {
        switch (change.scope) {
            case 'root': continue;
            case 'global': filtered.push(change); break;
            case 'all-subagents': filtered.push({ ...change, scope: 'global' }); break;
            case 'specific': filtered.push(change); break;
        }
    }
    return filtered.length > 0 ? filtered : undefined;
}

describe('Sub-Agent Changes', () => {
    const base: MockAgent[] = [{ ID: 'sub-1', Name: 'Researcher' }, { ID: 'sub-2', Name: 'Writer' }];

    describe('applySubAgentChanges', () => {
        it('adds a new sub-agent (global)', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'add', subAgentIds: ['sub-3'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2', 'sub-3']);
        });

        it('does not duplicate an already-present sub-agent', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'add', subAgentIds: ['sub-1'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('removes a sub-agent', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'remove', subAgentIds: ['sub-1'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-2']);
        });

        it('ignores unknown sub-agent IDs on add', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'add', subAgentIds: ['nope'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('does NOT mutate the base array (clone semantics)', () => {
            const baseCopy = [...base];
            applySubAgentChanges(base, [{ scope: 'global', mode: 'add', subAgentIds: ['sub-3'] }], 'agent-x', true);
            expect(base).toEqual(baseCopy);
        });

        it('respects scope: root applies only to the root agent', () => {
            const change: SubAgentChange = { scope: 'root', mode: 'add', subAgentIds: ['sub-3'] };
            expect(applySubAgentChanges(base, [change], 'root', true).map(a => a.ID)).toContain('sub-3');
            expect(applySubAgentChanges(base, [change], 'child', false).map(a => a.ID)).not.toContain('sub-3');
        });

        it('respects scope: all-subagents skips the root', () => {
            const change: SubAgentChange = { scope: 'all-subagents', mode: 'add', subAgentIds: ['sub-3'] };
            expect(applySubAgentChanges(base, [change], 'root', true).map(a => a.ID)).not.toContain('sub-3');
            expect(applySubAgentChanges(base, [change], 'child', false).map(a => a.ID)).toContain('sub-3');
        });

        it('respects scope: specific only applies to listed agentIds', () => {
            const change: SubAgentChange = { scope: 'specific', mode: 'add', subAgentIds: ['sub-3'], agentIds: ['agent-a'] };
            expect(applySubAgentChanges(base, [change], 'agent-a', false).map(a => a.ID)).toContain('sub-3');
            expect(applySubAgentChanges(base, [change], 'agent-b', false).map(a => a.ID)).not.toContain('sub-3');
        });
    });

    describe('filterSubAgentChangesForSubAgent', () => {
        it('returns undefined for empty/undefined input', () => {
            expect(filterSubAgentChangesForSubAgent(undefined)).toBeUndefined();
            expect(filterSubAgentChangesForSubAgent([])).toBeUndefined();
        });

        it('drops root-scoped changes (not propagated)', () => {
            expect(filterSubAgentChangesForSubAgent([{ scope: 'root', mode: 'add', subAgentIds: ['sub-3'] }])).toBeUndefined();
        });

        it('propagates global as-is', () => {
            const out = filterSubAgentChangesForSubAgent([{ scope: 'global', mode: 'add', subAgentIds: ['sub-3'] }]);
            expect(out).toEqual([{ scope: 'global', mode: 'add', subAgentIds: ['sub-3'] }]);
        });

        it('rewrites all-subagents to global for propagation', () => {
            const out = filterSubAgentChangesForSubAgent([{ scope: 'all-subagents', mode: 'remove', subAgentIds: ['sub-4'] }]);
            expect(out).toEqual([{ scope: 'global', mode: 'remove', subAgentIds: ['sub-4'] }]);
        });

        it('propagates specific as-is', () => {
            const change: SubAgentChange = { scope: 'specific', mode: 'add', subAgentIds: ['sub-3'], agentIds: ['x'] };
            expect(filterSubAgentChangesForSubAgent([change])).toEqual([change]);
        });
    });
});
