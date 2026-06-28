/**
 * Tests for the Data Explorer dashboard's pure agent-context helpers:
 * - buildDataExplorerAgentContext: state snapshot → agent context object
 * - isValidViewMode: view-mode validation for the SetViewMode client tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildDataExplorerAgentContext,
    isValidViewMode,
    AGENT_CONTEXT_NAME_LIST_CAP,
    DataExplorerAgentContextInput,
} from '../DataExplorer/data-explorer-agent-context';

function makeInput(overrides: Partial<DataExplorerAgentContextInput> = {}): DataExplorerAgentContextInput {
    return {
        SelectedEntityName: 'Users',
        ViewMode: 'grid',
        ActiveViewId: 'view-123',
        ActiveViewName: 'Active Users',
        AvailableViewNames: ['Active Users', 'All Users', 'Inactive Users'],
        VisibleColumnNames: ['ID', 'Name', 'Email'],
        FilterText: 'smith',
        TotalRecordCount: 100,
        FilteredRecordCount: 12,
        SelectedRecordName: 'John Smith',
        DetailPanelOpen: true,
        HomeViewMode: 'all',
        EntitySearchText: '',
        VisibleEntityCount: 42,
        AvailableEntityNames: ['Users', 'Accounts', 'Contacts'],
        ...overrides,
    };
}

/** Build a list of N distinct generated names. */
function names(prefix: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
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
        it('reports the full record-browsing context including the new view/column fields', () => {
            const ctx = buildDataExplorerAgentContext(makeInput());
            expect(ctx).toEqual({
                AtHomeLevel: false,
                SelectedEntityName: 'Users',
                ViewMode: 'grid',
                ActiveViewId: 'view-123',
                ActiveViewName: 'Active Users',
                FilterText: 'smith',
                TotalRecordCount: 100,
                FilteredRecordCount: 12,
                SelectedRecordName: 'John Smith',
                DetailPanelOpen: true,
                AvailableViews: ['Active Users', 'All Users', 'Inactive Users'],
                VisibleColumns: ['ID', 'Name', 'Email'],
            });
        });

        it('resolves the active view NAME (not just the id)', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ ActiveViewId: 'v-9', ActiveViewName: 'My Custom View' })
            );
            expect(ctx['ActiveViewId']).toBe('v-9');
            expect(ctx['ActiveViewName']).toBe('My Custom View');
        });

        it('carries a null active view name through when no view is active', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ ActiveViewId: null, ActiveViewName: null })
            );
            expect(ctx['ActiveViewId']).toBeNull();
            expect(ctx['ActiveViewName']).toBeNull();
        });

        it('lists available view NAMES so the co-agent can ask to open one', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ AvailableViewNames: ['Hot Leads', 'Cold Leads'] })
            );
            expect(ctx['AvailableViews']).toEqual(['Hot Leads', 'Cold Leads']);
            expect(ctx).not.toHaveProperty('AvailableViewCount'); // small list: no count
        });

        it('bounds AvailableViews to the cap and reports the true count when over', () => {
            const many = names('View', AGENT_CONTEXT_NAME_LIST_CAP + 10);
            const ctx = buildDataExplorerAgentContext(makeInput({ AvailableViewNames: many }));
            const published = ctx['AvailableViews'] as string[];
            expect(published).toHaveLength(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(published[0]).toBe('View 1');
            expect(ctx['AvailableViewCount']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 10);
        });

        it('emits an empty AvailableViews array when the entity has no saved views', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ AvailableViewNames: [] }));
            expect(ctx['AvailableViews']).toEqual([]);
            expect(ctx).not.toHaveProperty('AvailableViewCount');
        });

        it('omits VisibleColumns entirely when no columns are supplied', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ VisibleColumnNames: [] }));
            expect(ctx).not.toHaveProperty('VisibleColumns');
            expect(ctx).not.toHaveProperty('VisibleColumnCount');
        });

        it('bounds VisibleColumns and reports the true column count when over the cap', () => {
            const many = names('Col', AGENT_CONTEXT_NAME_LIST_CAP + 5);
            const ctx = buildDataExplorerAgentContext(makeInput({ VisibleColumnNames: many }));
            expect((ctx['VisibleColumns'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(ctx['VisibleColumnCount']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 5);
        });

        it('does not leak home-level fields when an entity is selected', () => {
            const ctx = buildDataExplorerAgentContext(makeInput());
            expect(ctx).not.toHaveProperty('HomeViewMode');
            expect(ctx).not.toHaveProperty('EntitySearchText');
            expect(ctx).not.toHaveProperty('VisibleEntityCount');
            expect(ctx).not.toHaveProperty('AvailableEntities');
        });

        it('carries null record selection through', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedRecordName: null, DetailPanelOpen: false, ActiveViewId: null, ActiveViewName: null })
            );
            expect(ctx['SelectedRecordName']).toBeNull();
            expect(ctx['DetailPanelOpen']).toBe(false);
            expect(ctx['ActiveViewId']).toBeNull();
        });
    });

    describe('home level (no entity selected)', () => {
        it('reports the entity-browsing context including available entity NAMES', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({
                    SelectedEntityName: null,
                    HomeViewMode: 'favorites',
                    EntitySearchText: 'acc',
                    VisibleEntityCount: 7,
                    AvailableEntityNames: ['Accounts', 'Activities'],
                })
            );
            expect(ctx).toEqual({
                AtHomeLevel: true,
                SelectedEntityName: null,
                HomeViewMode: 'favorites',
                EntitySearchText: 'acc',
                VisibleEntityCount: 7,
                AvailableEntities: ['Accounts', 'Activities'],
            });
        });

        it('bounds AvailableEntities and reports the true count when over the cap', () => {
            const many = names('Entity', AGENT_CONTEXT_NAME_LIST_CAP + 3);
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, AvailableEntityNames: many })
            );
            expect((ctx['AvailableEntities'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(ctx['AvailableEntityCount']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 3);
        });

        it('does not leak record-browsing fields at the home level', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: null }));
            expect(ctx).not.toHaveProperty('ViewMode');
            expect(ctx).not.toHaveProperty('FilterText');
            expect(ctx).not.toHaveProperty('TotalRecordCount');
            expect(ctx).not.toHaveProperty('DetailPanelOpen');
            expect(ctx).not.toHaveProperty('AvailableViews');
            expect(ctx).not.toHaveProperty('ActiveViewName');
            expect(ctx).not.toHaveProperty('VisibleColumns');
        });

        it('treats empty-string entity name as home level', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: '' }));
            expect(ctx['AtHomeLevel']).toBe(true);
        });
    });
});
