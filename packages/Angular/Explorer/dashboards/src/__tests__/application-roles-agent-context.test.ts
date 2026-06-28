/**
 * Tests for the Application Roles dashboard's pure agent-context helper:
 * - buildApplicationRolesAgentContext: matrix-surface state snapshot → agent context object
 */
import { describe, it, expect } from 'vitest';
import {
    buildApplicationRolesAgentContext,
    ApplicationRolesAgentContextInput,
    AGENT_CONTEXT_ID_LIST_CAP,
} from '../ApplicationRoles/application-roles-agent-context';

function makeInput(overrides: Partial<ApplicationRolesAgentContextInput> = {}): ApplicationRolesAgentContextInput {
    return {
        ApplicationGroupCount: 3,
        TotalRoleAssignmentCount: 7,
        HasUnsavedChanges: false,
        IsLoading: false,
        ExpandedApplicationIds: [],
        ...overrides,
    };
}

describe('buildApplicationRolesAgentContext', () => {
    it('passes through the salient matrix-surface fields', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ApplicationGroupCount: 5,
            TotalRoleAssignmentCount: 12,
            HasUnsavedChanges: true,
            IsLoading: false,
            ExpandedApplicationIds: ['APP-1', 'APP-2'],
        }));
        expect(ctx['ApplicationGroupCount']).toBe(5);
        expect(ctx['TotalRoleAssignmentCount']).toBe(12);
        expect(ctx['HasUnsavedChanges']).toBe(true);
        expect(ctx['IsLoading']).toBe(false);
        expect(ctx['ExpandedApplicationIds']).toEqual(['APP-1', 'APP-2']);
    });

    it('omits the truncation-count field when the expanded list is within the cap', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ExpandedApplicationIds: ['APP-1', 'APP-2', 'APP-3'],
        }));
        expect(ctx['ExpandedApplicationCount']).toBeUndefined();
        expect((ctx['ExpandedApplicationIds'] as string[]).length).toBe(3);
    });

    it('caps the expanded-id list and reports the true total when over the cap', () => {
        const ids = Array.from({ length: AGENT_CONTEXT_ID_LIST_CAP + 10 }, (_, i) => `APP-${i}`);
        const ctx = buildApplicationRolesAgentContext(makeInput({ ExpandedApplicationIds: ids }));
        expect((ctx['ExpandedApplicationIds'] as string[]).length).toBe(AGENT_CONTEXT_ID_LIST_CAP);
        expect(ctx['ExpandedApplicationCount']).toBe(AGENT_CONTEXT_ID_LIST_CAP + 10);
    });

    it('reflects the loading flag', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({ IsLoading: true }));
        expect(ctx['IsLoading']).toBe(true);
    });

    it('does not leak any permission-bearing fields into the context', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ApplicationGroupCount: 2,
            TotalRoleAssignmentCount: 4,
            ExpandedApplicationIds: ['APP-1'],
        }));
        // Only the five expected keys (plus the optional truncation count, absent here).
        expect(Object.keys(ctx).sort()).toEqual([
            'ApplicationGroupCount',
            'ExpandedApplicationIds',
            'HasUnsavedChanges',
            'IsLoading',
            'TotalRoleAssignmentCount',
        ]);
    });
});
