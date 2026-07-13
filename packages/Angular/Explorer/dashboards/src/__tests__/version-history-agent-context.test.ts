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
    resolveRestore,
    RESTORE_STATUS_FILTERS,
    RESTORE_LIST_CAP,
    RestoreSnapshot,
    RestoreSummaryItem,
    VersionHistoryRestoreAgentContextInput,
} from '../VersionHistory/version-history-restore-agent-context';
import {
    buildVersionHistoryGraphAgentContext,
    resolveGraphEntity,
    VERSION_HISTORY_GRAPH_NAME_LIST_CAP,
    VersionHistoryGraphAgentContextInput,
    VersionHistoryGraphSelectedEntitySummary,
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
        RecentRestores: [],
        SelectedRestoreId: null,
        SelectedRestoreName: null,
        ...overrides,
    };
}

function restore(id: string, name: string, status = 'Complete'): RestoreSnapshot {
    return { ID: id, Name: name, Status: status };
}

function makeGraphInput(
    overrides: Partial<VersionHistoryGraphAgentContextInput> = {},
): VersionHistoryGraphAgentContextInput {
    return {
        SelectedEntityName: null,
        SelectedEntityId: null,
        SelectedEntitySummary: null,
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

function makeSelectedSummary(
    overrides: Partial<VersionHistoryGraphSelectedEntitySummary> = {},
): VersionHistoryGraphSelectedEntitySummary {
    return {
        ID: 'e-1',
        Name: 'Users',
        SchemaName: 'dbo',
        ReferencedByCount: 2,
        DependsOnCount: 1,
        ReferencedByEntityNames: ['User Roles', 'User Views'],
        DependsOnEntityNames: ['Employees'],
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
            SelectedRestoreId: null,
            SelectedRestoreName: null,
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

    it('omits SelectedEntity when no entity is selected (never fabricated zeros)', () => {
        const ctx = buildVersionHistoryGraphAgentContext(makeGraphInput());
        expect(ctx).not.toHaveProperty('SelectedEntity');
        expect(ctx['SelectedEntityId']).toBeNull();
    });

    it('publishes the selected entity dependency summary when selected', () => {
        const ctx = buildVersionHistoryGraphAgentContext(
            makeGraphInput({
                SelectedEntityName: 'Users',
                SelectedEntityId: 'e-1',
                SelectedEntitySummary: makeSelectedSummary(),
            }),
        );
        const summary = ctx['SelectedEntity'] as Record<string, unknown>;
        expect(summary['Name']).toBe('Users');
        expect(summary['ReferencedByCount']).toBe(2);
        expect(summary['DependsOnCount']).toBe(1);
        expect(summary['ReferencedByEntities']).toEqual(['User Roles', 'User Views']);
        expect(summary['DependsOnEntities']).toEqual(['Employees']);
    });

    it('caps the selected entity neighbour lists and surfaces the true total', () => {
        const refs = Array.from({ length: VERSION_HISTORY_GRAPH_NAME_LIST_CAP + 3 }, (_, i) => `Ref${i}`);
        const ctx = buildVersionHistoryGraphAgentContext(
            makeGraphInput({
                SelectedEntityName: 'Users',
                SelectedEntityId: 'e-1',
                SelectedEntitySummary: makeSelectedSummary({ ReferencedByEntityNames: refs, ReferencedByCount: refs.length }),
            }),
        );
        const summary = ctx['SelectedEntity'] as Record<string, unknown>;
        expect((summary['ReferencedByEntities'] as string[]).length).toBe(VERSION_HISTORY_GRAPH_NAME_LIST_CAP);
        expect(summary['ReferencedByEntityCount']).toBe(refs.length);
    });
});

describe('resolveRestore', () => {
    const restores = [restore('r-1', 'Nightly rollback', 'Complete'), restore('r-2', 'Q1 audit fix', 'Error')];

    it('matches by exact ID, exact name, then contains', () => {
        expect((resolveRestore('R-1', restores) as { ok: true; restore: RestoreSnapshot }).restore.Name).toBe('Nightly rollback');
        expect((resolveRestore('q1 audit fix', restores) as { ok: true; restore: RestoreSnapshot }).restore.ID).toBe('r-2');
        expect((resolveRestore('rollback', restores) as { ok: true; restore: RestoreSnapshot }).restore.ID).toBe('r-1');
    });

    it('returns a tolerant error listing available restores on a miss', () => {
        const r = resolveRestore('nope', restores);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('Nightly rollback');
        }
    });

    it('errors on empty input and empty restore list', () => {
        expect(resolveRestore('  ', restores).ok).toBe(false);
        expect(resolveRestore('x', []).ok).toBe(false);
    });
});

describe('buildVersionHistoryRestoreAgentContext — deep fields', () => {
    it('publishes the selected restore and a bounded recent-restore list', () => {
        const recent: RestoreSummaryItem[] = [
            { ID: 'r-1', Name: 'Nightly', Status: 'Complete' },
            { ID: 'r-2', Name: 'Audit', Status: 'Error' },
        ];
        const ctx = buildVersionHistoryRestoreAgentContext(
            makeRestoreInput({ RecentRestores: recent, SelectedRestoreId: 'r-1', SelectedRestoreName: 'Nightly' }),
        );
        expect(ctx['SelectedRestoreId']).toBe('r-1');
        expect(ctx['SelectedRestoreName']).toBe('Nightly');
        expect(ctx['RecentRestores']).toEqual(recent);
        expect(ctx).not.toHaveProperty('RecentRestoreCount');
    });

    it('omits RecentRestores when empty and counts when truncated', () => {
        const empty = buildVersionHistoryRestoreAgentContext(makeRestoreInput());
        expect(empty).not.toHaveProperty('RecentRestores');

        const many: RestoreSummaryItem[] = Array.from({ length: RESTORE_LIST_CAP + 2 }, (_, i) => ({
            ID: `r-${i}`,
            Name: `R${i}`,
            Status: 'Complete',
        }));
        const ctx = buildVersionHistoryRestoreAgentContext(makeRestoreInput({ RecentRestores: many }));
        expect((ctx['RecentRestores'] as unknown[]).length).toBe(RESTORE_LIST_CAP);
        expect(ctx['RecentRestoreCount']).toBe(many.length);
    });
});

describe('resolveGraphEntity', () => {
    const candidates = [
        { ID: 'e-1', Name: 'Users' },
        { ID: 'e-2', Name: 'User Roles' },
    ];

    it('matches by exact ID, exact name, then contains', () => {
        expect((resolveGraphEntity('E-1', candidates) as { ok: true; entity: { Name: string } }).entity.Name).toBe('Users');
        expect((resolveGraphEntity('user roles', candidates) as { ok: true; entity: { ID: string } }).entity.ID).toBe('e-2');
        // 'user' contains-matches the first candidate by ordering
        expect((resolveGraphEntity('user', candidates) as { ok: true; entity: { ID: string } }).entity.ID).toBe('e-1');
    });

    it('returns a tolerant error listing available entities on a miss', () => {
        const r = resolveGraphEntity('Widgets', candidates);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('Users');
        }
    });

    it('errors on empty input', () => {
        expect(resolveGraphEntity('   ', candidates).ok).toBe(false);
    });
});
