/**
 * Tests for the Data Explorer dashboard's pure agent-context helpers:
 * - buildDataExplorerAgentContext: state snapshot → agent context object
 * - isValidViewMode: view-mode validation for the SetViewMode client tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildDataExplorerAgentContext,
    isValidViewMode,
    DataExplorerAgentContextInput,
} from '../DataExplorer/data-explorer-agent-context';

function makeInput(overrides: Partial<DataExplorerAgentContextInput> = {}): DataExplorerAgentContextInput {
    return {
        SelectedEntityName: 'Users',
        ViewMode: 'grid',
        ActiveViewId: 'view-123',
        FilterText: 'smith',
        TotalRecordCount: 100,
        FilteredRecordCount: 12,
        SelectedRecordName: 'John Smith',
        DetailPanelOpen: true,
        HomeViewMode: 'all',
        EntitySearchText: '',
        VisibleEntityCount: 42,
        ...overrides,
    };
}

describe('isValidViewMode', () => {
    it('accepts the four known modes', () => {
        expect(isValidViewMode('grid')).toBe(true);
        expect(isValidViewMode('cards')).toBe(true);
        expect(isValidViewMode('timeline')).toBe(true);
        expect(isValidViewMode('map')).toBe(true);
    });

    it('rejects unknown strings', () => {
        expect(isValidViewMode('list')).toBe(false);
        expect(isValidViewMode('Grid')).toBe(false); // case-sensitive
        expect(isValidViewMode('')).toBe(false);
    });

    it('rejects non-string values', () => {
        expect(isValidViewMode(null)).toBe(false);
        expect(isValidViewMode(undefined)).toBe(false);
        expect(isValidViewMode(42)).toBe(false);
        expect(isValidViewMode({})).toBe(false);
    });
});

describe('buildDataExplorerAgentContext', () => {
    describe('entity selected (record-browsing surface)', () => {
        it('reports the full record-browsing context', () => {
            const ctx = buildDataExplorerAgentContext(makeInput());
            expect(ctx).toEqual({
                AtHomeLevel: false,
                SelectedEntityName: 'Users',
                ViewMode: 'grid',
                ActiveViewId: 'view-123',
                FilterText: 'smith',
                TotalRecordCount: 100,
                FilteredRecordCount: 12,
                SelectedRecordName: 'John Smith',
                DetailPanelOpen: true,
            });
        });

        it('does not leak home-level fields when an entity is selected', () => {
            const ctx = buildDataExplorerAgentContext(makeInput());
            expect(ctx).not.toHaveProperty('HomeViewMode');
            expect(ctx).not.toHaveProperty('EntitySearchText');
            expect(ctx).not.toHaveProperty('VisibleEntityCount');
        });

        it('carries null record selection through', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedRecordName: null, DetailPanelOpen: false, ActiveViewId: null })
            );
            expect(ctx['SelectedRecordName']).toBeNull();
            expect(ctx['DetailPanelOpen']).toBe(false);
            expect(ctx['ActiveViewId']).toBeNull();
        });
    });

    describe('home level (no entity selected)', () => {
        it('reports the entity-browsing context', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, HomeViewMode: 'favorites', EntitySearchText: 'acc', VisibleEntityCount: 7 })
            );
            expect(ctx).toEqual({
                AtHomeLevel: true,
                SelectedEntityName: null,
                HomeViewMode: 'favorites',
                EntitySearchText: 'acc',
                VisibleEntityCount: 7,
            });
        });

        it('does not leak record-browsing fields at the home level', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: null }));
            expect(ctx).not.toHaveProperty('ViewMode');
            expect(ctx).not.toHaveProperty('FilterText');
            expect(ctx).not.toHaveProperty('TotalRecordCount');
            expect(ctx).not.toHaveProperty('DetailPanelOpen');
        });

        it('treats empty-string entity name as home level', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: '' }));
            expect(ctx['AtHomeLevel']).toBe(true);
        });
    });
});
