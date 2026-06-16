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

    // =============================================================================================
    // Deepened edge coverage (mirrors base-agent.ts applySubAgentChanges /
    // filterSubAgentChangesForSubAgent / doesChangeScopeApply exactly).
    // =============================================================================================

    describe('doesChangeScopeApply — full truth table', () => {
        it('global applies regardless of root/child', () => {
            expect(doesChangeScopeApply('global', 'a', true)).toBe(true);
            expect(doesChangeScopeApply('global', 'a', false)).toBe(true);
        });
        it('root applies only to root', () => {
            expect(doesChangeScopeApply('root', 'a', true)).toBe(true);
            expect(doesChangeScopeApply('root', 'a', false)).toBe(false);
        });
        it('all-subagents applies only to non-root', () => {
            expect(doesChangeScopeApply('all-subagents', 'a', true)).toBe(false);
            expect(doesChangeScopeApply('all-subagents', 'a', false)).toBe(true);
        });
        it('specific requires the agentId to be in agentIds', () => {
            expect(doesChangeScopeApply('specific', 'a', false, ['a', 'b'])).toBe(true);
            expect(doesChangeScopeApply('specific', 'z', false, ['a', 'b'])).toBe(false);
        });
        it("specific with NO agentIds applies to nobody (?? false)", () => {
            expect(doesChangeScopeApply('specific', 'a', false, undefined)).toBe(false);
            expect(doesChangeScopeApply('specific', 'a', false, [])).toBe(false);
        });
        it('unknown scope value applies to nobody (default branch)', () => {
            expect(doesChangeScopeApply('nonsense' as ActionChangeScope, 'a', true)).toBe(false);
        });
    });

    describe('applySubAgentChanges — deeper edge cases', () => {
        it('an empty change list returns a fresh copy of the base set (no mutation, equal contents)', () => {
            const result = applySubAgentChanges(base, [], 'agent-x', true);
            expect(result).not.toBe(base);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('a non-applicable scope leaves the set untouched', () => {
            // root-scoped change evaluated against a child agent — skipped entirely.
            const result = applySubAgentChanges(base, [{ scope: 'root', mode: 'add', subAgentIds: ['sub-3'] }], 'child', false);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('removing a non-existent sub-agent is a no-op', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'remove', subAgentIds: ['not-here'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('duplicate add IDs within one change only add once', () => {
            const result = applySubAgentChanges(base, [{ scope: 'global', mode: 'add', subAgentIds: ['sub-3', 'sub-3'] }], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2', 'sub-3']);
        });

        it('add then remove of the same ID across two changes nets to removed', () => {
            const result = applySubAgentChanges(base, [
                { scope: 'global', mode: 'add', subAgentIds: ['sub-3'] },
                { scope: 'global', mode: 'remove', subAgentIds: ['sub-3'] },
            ], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2']);
        });

        it('remove then re-add of the same ID nets to present (and re-appended at the end)', () => {
            const result = applySubAgentChanges(base, [
                { scope: 'global', mode: 'remove', subAgentIds: ['sub-1'] },
                { scope: 'global', mode: 'add', subAgentIds: ['sub-1'] },
            ], 'agent-x', true);
            expect(result.map(a => a.ID).sort()).toEqual(['sub-1', 'sub-2']);
        });

        it('mixed scopes are each evaluated independently against the same agent', () => {
            // For a CHILD agent: root-scoped add is skipped, all-subagents add applies, specific (miss) skipped.
            const result = applySubAgentChanges(base, [
                { scope: 'root', mode: 'add', subAgentIds: ['sub-3'] },
                { scope: 'all-subagents', mode: 'add', subAgentIds: ['sub-4'] },
                { scope: 'specific', mode: 'add', subAgentIds: ['sub-3'], agentIds: ['someone-else'] },
            ], 'child-1', false);
            expect(result.map(a => a.ID)).toEqual(['sub-1', 'sub-2', 'sub-4']);
        });

        it('changes apply in order — a later add can re-introduce an earlier removal target', () => {
            const result = applySubAgentChanges(base, [
                { scope: 'global', mode: 'remove', subAgentIds: ['sub-1', 'sub-2'] },
                { scope: 'global', mode: 'add', subAgentIds: ['sub-2', 'sub-3'] },
            ], 'agent-x', true);
            expect(result.map(a => a.ID)).toEqual(['sub-2', 'sub-3']);
        });
    });

    describe('filterSubAgentChangesForSubAgent — propagation over a mixed list', () => {
        it('drops root, keeps global, rewrites all-subagents→global, keeps specific — preserving order', () => {
            const changes: SubAgentChange[] = [
                { scope: 'root', mode: 'add', subAgentIds: ['sub-1'] },
                { scope: 'global', mode: 'add', subAgentIds: ['sub-2'] },
                { scope: 'all-subagents', mode: 'remove', subAgentIds: ['sub-3'] },
                { scope: 'specific', mode: 'add', subAgentIds: ['sub-4'], agentIds: ['x'] },
            ];
            expect(filterSubAgentChangesForSubAgent(changes)).toEqual([
                { scope: 'global', mode: 'add', subAgentIds: ['sub-2'] },
                { scope: 'global', mode: 'remove', subAgentIds: ['sub-3'] },
                { scope: 'specific', mode: 'add', subAgentIds: ['sub-4'], agentIds: ['x'] },
            ]);
        });

        it('returns undefined when every change is root-scoped (all dropped)', () => {
            const changes: SubAgentChange[] = [
                { scope: 'root', mode: 'add', subAgentIds: ['sub-1'] },
                { scope: 'root', mode: 'remove', subAgentIds: ['sub-2'] },
            ];
            expect(filterSubAgentChangesForSubAgent(changes)).toBeUndefined();
        });

        it('the all-subagents→global rewrite is a copy, not a mutation of the input', () => {
            const original: SubAgentChange = { scope: 'all-subagents', mode: 'remove', subAgentIds: ['sub-4'] };
            const out = filterSubAgentChangesForSubAgent([original]);
            expect(out).toEqual([{ scope: 'global', mode: 'remove', subAgentIds: ['sub-4'] }]);
            // The source change object must be untouched.
            expect(original.scope).toBe('all-subagents');
        });
    });
});
