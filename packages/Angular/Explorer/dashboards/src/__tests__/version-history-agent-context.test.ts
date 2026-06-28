/**
 * Tests for the Version History surfaces' pure agent-context helpers:
 * - buildVersionHistoryRestoreAgentContext + isValidRestoreStatusFilter (Restore surface)
 * - buildVersionHistoryGraphAgentContext (Dependency Graph surface)
 *
 * These cover only the pure helpers (no Angular). The surfaces' destructive
 * operations (restore/rollback, label mutation, schema/entity edits) are NOT
 * represented here because they are intentionally never exposed to the agent.
 */
import { describe, it, expect } from 'vitest';
import {
    buildVersionHistoryRestoreAgentContext,
    isValidRestoreStatusFilter,
    RESTORE_STATUS_FILTERS,
    VersionHistoryRestoreAgentContextInput,
} from '../VersionHistory/version-history-restore-agent-context';
import {
    buildVersionHistoryGraphAgentContext,
    VERSION_HISTORY_GRAPH_NAME_LIST_CAP,
    VersionHistoryGraphAgentContextInput,
} from '../VersionHistory/version-history-graph-agent-context';

function makeRestoreInput(
    overrides: Partial<VersionHistoryRestoreAgentContextInput> = {},
): VersionHistoryRestoreAgentContextInput {
    return {
        TotalRestores: 10,
        SuccessfulRestores: 7,
        FailedRestores: 2,
        PartialRestores: 1,
        StatusFilter: '',
        FilteredRestoreCount: 10,
        ...overrides,
    };
}

function makeGraphInput(
    overrides: Partial<VersionHistoryGraphAgentContextInput> = {},
): VersionHistoryGraphAgentContextInput {
    return {
        SelectedEntityName: null,
        TotalEntities: 100,
        EntitiesWithDependents: 40,
        TotalRelationships: 250,
        SearchText: '',
        SchemaFilter: '',
        VisibleEntityCount: 100,
        VisibleEntityNames: [],
        AvailableSchemas: ['dbo', '__mj'],
        ...overrides,
    };
}

describe('isValidRestoreStatusFilter', () => {
    it('accepts every known status value', () => {
        for (const s of RESTORE_STATUS_FILTERS) {
            expect(isValidRestoreStatusFilter(s)).toBe(true);
        }
    });

    it('accepts the empty string (clear filter)', () => {
        expect(isValidRestoreStatusFilter('')).toBe(true);
    });

    it('rejects unknown / non-string values', () => {
        expect(isValidRestoreStatusFilter('Bogus')).toBe(false);
        expect(isValidRestoreStatusFilter('complete')).toBe(false); // case-sensitive
        expect(isValidRestoreStatusFilter(undefined)).toBe(false);
        expect(isValidRestoreStatusFilter(42)).toBe(false);
        expect(isValidRestoreStatusFilter(null)).toBe(false);
    });
});

describe('buildVersionHistoryRestoreAgentContext', () => {
    it('maps every stat field straight through', () => {
        const ctx = buildVersionHistoryRestoreAgentContext(
            makeRestoreInput({
                TotalRestores: 12,
                SuccessfulRestores: 8,
                FailedRestores: 3,
                PartialRestores: 1,
                StatusFilter: 'Error',
                FilteredRestoreCount: 3,
            }),
        );
        expect(ctx).toEqual({
            TotalRestores: 12,
            SuccessfulRestores: 8,
            FailedRestores: 3,
            PartialRestores: 1,
            StatusFilter: 'Error',
            FilteredRestoreCount: 3,
        });
    });

    it('reflects the no-filter state with FilteredRestoreCount === TotalRestores', () => {
        const ctx = buildVersionHistoryRestoreAgentContext(makeRestoreInput());
        expect(ctx['StatusFilter']).toBe('');
        expect(ctx['FilteredRestoreCount']).toBe(ctx['TotalRestores']);
    });
});

describe('buildVersionHistoryGraphAgentContext', () => {
    it('reports the home (no-selection) state with null SelectedEntityName', () => {
        const ctx = buildVersionHistoryGraphAgentContext(makeGraphInput());
        expect(ctx['SelectedEntityName']).toBeNull();
        expect(ctx['TotalEntities']).toBe(100);
        expect(ctx['EntitiesWithDependents']).toBe(40);
        expect(ctx['TotalRelationships']).toBe(250);
        expect(ctx['AvailableSchemas']).toEqual(['dbo', '__mj']);
    });

    it('reports the selected entity and active filters', () => {
        const ctx = buildVersionHistoryGraphAgentContext(
            makeGraphInput({
                SelectedEntityName: 'Users',
                SearchText: 'use',
                SchemaFilter: 'dbo',
                VisibleEntityCount: 3,
                VisibleEntityNames: ['User Roles', 'Users', 'User Views'],
            }),
        );
        expect(ctx['SelectedEntityName']).toBe('Users');
        expect(ctx['SearchText']).toBe('use');
        expect(ctx['SchemaFilter']).toBe('dbo');
        expect(ctx['VisibleEntityCount']).toBe(3);
        expect(ctx['VisibleEntities']).toEqual(['User Roles', 'Users', 'User Views']);
    });

    it('caps the visible-entity name list and surfaces the true total', () => {
        const names = Array.from({ length: VERSION_HISTORY_GRAPH_NAME_LIST_CAP + 5 }, (_, i) => `Entity${i}`);
        const ctx = buildVersionHistoryGraphAgentContext(
            makeGraphInput({ VisibleEntityNames: names, VisibleEntityCount: names.length }),
        );
        expect((ctx['VisibleEntities'] as string[]).length).toBe(VERSION_HISTORY_GRAPH_NAME_LIST_CAP);
        expect(ctx['VisibleEntityNameCount']).toBe(names.length);
    });

    it('omits the truncation-count field when the list fits under the cap', () => {
        const ctx = buildVersionHistoryGraphAgentContext(
            makeGraphInput({ VisibleEntityNames: ['A', 'B'], VisibleEntityCount: 2 }),
        );
        expect(ctx['VisibleEntityNameCount']).toBeUndefined();
        expect(ctx['AvailableSchemaCount']).toBeUndefined();
    });
});
