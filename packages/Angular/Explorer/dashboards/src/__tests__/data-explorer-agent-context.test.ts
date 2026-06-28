/**
 * Tests for the Data Explorer dashboard's pure agent-context helpers:
 * - buildDataExplorerAgentContext: state snapshot → agent context object
 * - isValidViewMode: view-mode validation for the SetViewMode client tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildDataExplorerAgentContext,
    isValidViewMode,
    isValidEntityBrowserMode,
    computeTotalPages,
    entityDisplayName,
    stripMJPrefix,
    resolveEntityByName,
    resolveRecordSelection,
    AGENT_CONTEXT_NAME_LIST_CAP,
    AGENT_CONTEXT_APP_GROUP_CAP,
    AGENT_CONTEXT_RECORD_LIST_CAP,
    AppGroupSummary,
    EntityNameCandidate,
    DataExplorerAgentContextInput,
} from '../DataExplorer/data-explorer-agent-context';

function makeInput(overrides: Partial<DataExplorerAgentContextInput> = {}): DataExplorerAgentContextInput {
    return {
        SelectedEntityName: 'Users',
        ViewMode: 'grid',
        AvailableViewTypes: ['grid', 'cards', 'timeline'],
        ActiveViewId: 'view-123',
        ActiveViewName: 'Active Users',
        AvailableViewNames: ['Active Users', 'All Users', 'Inactive Users'],
        VisibleColumnNames: ['ID', 'Name', 'Email'],
        FilterText: 'smith',
        TotalRecordCount: 100,
        FilteredRecordCount: 12,
        PageSize: 100,
        CurrentPage: null,
        TotalPages: null,
        SortColumn: null,
        SortDirection: null,
        RelatedEntityNames: [],
        SelectedRecordName: 'John Smith',
        DetailPanelOpen: true,
        VisibleRecordNames: [],
        LoadedRecordCount: 0,
        HomeViewMode: 'all',
        EntitySearchText: '',
        VisibleEntityCount: 42,
        FavoriteEntityCount: 3,
        AvailableEntityNames: ['Users', 'Accounts', 'Contacts'],
        AppGroups: [],
        ...overrides,
    };
}

/** Build N application-group summaries with the given expanded flag. */
function appGroups(count: number, expanded = false): AppGroupSummary[] {
    return Array.from({ length: count }, (_, i) => ({
        Name: `App ${i + 1}`,
        EntityCount: i + 1,
        Expanded: expanded,
    }));
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

describe('isValidEntityBrowserMode', () => {
    it('accepts the two known modes', () => {
        expect(isValidEntityBrowserMode('all')).toBe(true);
        expect(isValidEntityBrowserMode('favorites')).toBe(true);
    });

    it('rejects unknown / non-string values', () => {
        expect(isValidEntityBrowserMode('All')).toBe(false); // case-sensitive
        expect(isValidEntityBrowserMode('')).toBe(false);
        expect(isValidEntityBrowserMode(null)).toBe(false);
        expect(isValidEntityBrowserMode(undefined)).toBe(false);
        expect(isValidEntityBrowserMode(1)).toBe(false);
    });
});

describe('computeTotalPages', () => {
    it('rounds up partial pages', () => {
        expect(computeTotalPages(250, 100)).toBe(3);
        expect(computeTotalPages(100, 100)).toBe(1);
        expect(computeTotalPages(101, 100)).toBe(2);
    });

    it('returns 1 for empty or non-positive inputs', () => {
        expect(computeTotalPages(0, 100)).toBe(1);
        expect(computeTotalPages(50, 0)).toBe(1);
        expect(computeTotalPages(50, -5)).toBe(1);
        expect(computeTotalPages(50, NaN)).toBe(1);
    });
});

describe('buildDataExplorerAgentContext', () => {
    describe('entity selected (record-browsing surface)', () => {
        it('reports the full record-browsing context including the new view/column/pagination fields', () => {
            const ctx = buildDataExplorerAgentContext(makeInput());
            expect(ctx).toEqual({
                AtHomeLevel: false,
                SelectedEntityName: 'Users',
                ViewMode: 'grid',
                AvailableViewTypes: ['grid', 'cards', 'timeline'],
                ActiveViewId: 'view-123',
                ActiveViewName: 'Active Users',
                FilterText: 'smith',
                TotalRecordCount: 100,
                FilteredRecordCount: 12,
                PageSize: 100,
                CurrentPage: 1, // no live grid page reported → defaults to 1
                TotalPages: 1, // 12 filtered records / 100 page size → 1 page
                SelectedRecordName: 'John Smith',
                DetailPanelOpen: true,
                AvailableViews: ['Active Users', 'All Users', 'Inactive Users'],
                VisibleColumns: ['ID', 'Name', 'Email'],
            });
        });

        it('derives TotalPages from the filtered record count and page size', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ FilteredRecordCount: 250, PageSize: 100 })
            );
            expect(ctx['PageSize']).toBe(100);
            expect(ctx['TotalPages']).toBe(3); // ceil(250 / 100)
        });

        it('reports TotalPages of 1 when there are no records', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ FilteredRecordCount: 0, PageSize: 100 })
            );
            expect(ctx['TotalPages']).toBe(1);
        });

        it('prefers the LIVE grid page/total-page count over the derived values', () => {
            // Live grid reports page 2 of 5; derived from counts would be 1 — live wins.
            const ctx = buildDataExplorerAgentContext(
                makeInput({ CurrentPage: 2, TotalPages: 5, FilteredRecordCount: 12, PageSize: 100 })
            );
            expect(ctx['CurrentPage']).toBe(2);
            expect(ctx['TotalPages']).toBe(5);
        });

        it('defaults CurrentPage to 1 and derives TotalPages when the grid has not reported yet', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ CurrentPage: null, TotalPages: null, FilteredRecordCount: 250, PageSize: 100 })
            );
            expect(ctx['CurrentPage']).toBe(1);
            expect(ctx['TotalPages']).toBe(3); // ceil(250 / 100)
        });

        it('publishes the sort column + direction only when sorted', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SortColumn: 'CreatedAt', SortDirection: 'desc' })
            );
            expect(ctx['SortColumn']).toBe('CreatedAt');
            expect(ctx['SortDirection']).toBe('desc');
        });

        it('defaults sort direction to asc when a column is present without a direction', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SortColumn: 'Name', SortDirection: null })
            );
            expect(ctx['SortColumn']).toBe('Name');
            expect(ctx['SortDirection']).toBe('asc');
        });

        it('omits sort fields entirely when the grid is unsorted', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SortColumn: null, SortDirection: null })
            );
            expect(ctx).not.toHaveProperty('SortColumn');
            expect(ctx).not.toHaveProperty('SortDirection');
        });

        it('publishes related entity names so the agent can suggest NavigateToRelated targets', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ RelatedEntityNames: ['Orders', 'Invoices', 'Contacts'] })
            );
            expect(ctx['RelatedEntities']).toEqual(['Orders', 'Invoices', 'Contacts']);
            expect(ctx).not.toHaveProperty('RelatedEntityCount'); // small list: no count
        });

        it('bounds RelatedEntities to the cap and reports the true count when over', () => {
            const many = names('Related', AGENT_CONTEXT_NAME_LIST_CAP + 7);
            const ctx = buildDataExplorerAgentContext(makeInput({ RelatedEntityNames: many }));
            expect((ctx['RelatedEntities'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(ctx['RelatedEntityCount']).toBe(AGENT_CONTEXT_NAME_LIST_CAP + 7);
        });

        it('omits RelatedEntities entirely when the entity has no related entities', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ RelatedEntityNames: [] }));
            expect(ctx).not.toHaveProperty('RelatedEntities');
            expect(ctx).not.toHaveProperty('RelatedEntityCount');
        });

        it('publishes the view types the current entity supports', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ AvailableViewTypes: ['grid', 'cards', 'map'] })
            );
            expect(ctx['AvailableViewTypes']).toEqual(['grid', 'cards', 'map']);
        });

        it('omits AvailableViewTypes when none are supplied', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ AvailableViewTypes: [] }));
            expect(ctx).not.toHaveProperty('AvailableViewTypes');
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
            const ctx = buildDataExplorerAgentContext(makeInput({ AppGroups: appGroups(3) }));
            expect(ctx).not.toHaveProperty('HomeViewMode');
            expect(ctx).not.toHaveProperty('EntityBrowserMode');
            expect(ctx).not.toHaveProperty('EntitySearchText');
            expect(ctx).not.toHaveProperty('VisibleEntityCount');
            expect(ctx).not.toHaveProperty('FavoriteEntityCount');
            expect(ctx).not.toHaveProperty('AvailableEntities');
            expect(ctx).not.toHaveProperty('AppGroups');
            expect(ctx).not.toHaveProperty('ExpandedAppGroups');
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
                    FavoriteEntityCount: 5,
                    AvailableEntityNames: ['Accounts', 'Activities'],
                    AppGroups: [],
                })
            );
            expect(ctx).toEqual({
                AtHomeLevel: true,
                SelectedEntityName: null,
                HomeViewMode: 'favorites',
                EntityBrowserMode: 'favorites',
                EntitySearchText: 'acc',
                VisibleEntityCount: 7,
                FavoriteEntityCount: 5,
                AvailableEntities: ['Accounts', 'Activities'],
            });
        });

        it('surfaces EntityBrowserMode as an alias of HomeViewMode', () => {
            const all = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: null, HomeViewMode: 'all' }));
            expect(all['EntityBrowserMode']).toBe('all');
            const favs = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: null, HomeViewMode: 'favorites' }));
            expect(favs['EntityBrowserMode']).toBe('favorites');
        });

        it('publishes application-group summaries and the expanded subset', () => {
            const groups: AppGroupSummary[] = [
                { Name: 'AI', EntityCount: 12, Expanded: true },
                { Name: 'Admin', EntityCount: 8, Expanded: false },
                { Name: 'Archiving', EntityCount: 3, Expanded: true },
            ];
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, AppGroups: groups })
            );
            expect(ctx['AppGroups']).toEqual(groups);
            expect(ctx['ExpandedAppGroups']).toEqual(['AI', 'Archiving']);
            expect(ctx).not.toHaveProperty('AppGroupCount'); // small list: no count
        });

        it('omits AppGroups entirely when there are none (single-application scope)', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, AppGroups: [] })
            );
            expect(ctx).not.toHaveProperty('AppGroups');
            expect(ctx).not.toHaveProperty('ExpandedAppGroups');
            expect(ctx).not.toHaveProperty('AppGroupCount');
        });

        it('bounds AppGroups to the cap and reports the true count when over', () => {
            const many = appGroups(AGENT_CONTEXT_APP_GROUP_CAP + 4);
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, AppGroups: many })
            );
            expect((ctx['AppGroups'] as AppGroupSummary[]).length).toBe(AGENT_CONTEXT_APP_GROUP_CAP);
            expect(ctx['AppGroupCount']).toBe(AGENT_CONTEXT_APP_GROUP_CAP + 4);
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
            expect(ctx).not.toHaveProperty('CurrentPage');
            expect(ctx).not.toHaveProperty('TotalPages');
            expect(ctx).not.toHaveProperty('SortColumn');
            expect(ctx).not.toHaveProperty('SortDirection');
            expect(ctx).not.toHaveProperty('RelatedEntities');
        });

        it('treats empty-string entity name as home level', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ SelectedEntityName: '' }));
            expect(ctx['AtHomeLevel']).toBe(true);
        });
    });

    describe('VisibleRecordNames (FIX 2: row-selection awareness)', () => {
        it('publishes the loaded record display values + count when records are loaded', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ VisibleRecordNames: ['Betty Bot', 'Charlie Cat', 'Dana Dog'], LoadedRecordCount: 3 })
            );
            expect(ctx['VisibleRecordNames']).toEqual(['Betty Bot', 'Charlie Cat', 'Dana Dog']);
            expect(ctx['LoadedRecordCount']).toBe(3);
        });

        it('bounds VisibleRecordNames to the cap while LoadedRecordCount reports the true total', () => {
            const many = names('Rec', AGENT_CONTEXT_RECORD_LIST_CAP + 12);
            const ctx = buildDataExplorerAgentContext(
                makeInput({ VisibleRecordNames: many, LoadedRecordCount: many.length })
            );
            expect((ctx['VisibleRecordNames'] as string[]).length).toBe(AGENT_CONTEXT_RECORD_LIST_CAP);
            expect(ctx['LoadedRecordCount']).toBe(AGENT_CONTEXT_RECORD_LIST_CAP + 12);
        });

        it('omits VisibleRecordNames + LoadedRecordCount entirely when nothing is loaded', () => {
            const ctx = buildDataExplorerAgentContext(makeInput({ VisibleRecordNames: [], LoadedRecordCount: 0 }));
            expect(ctx).not.toHaveProperty('VisibleRecordNames');
            expect(ctx).not.toHaveProperty('LoadedRecordCount');
        });

        it('does not leak VisibleRecordNames at the home level', () => {
            const ctx = buildDataExplorerAgentContext(
                makeInput({ SelectedEntityName: null, VisibleRecordNames: ['x'], LoadedRecordCount: 1 })
            );
            expect(ctx).not.toHaveProperty('VisibleRecordNames');
            expect(ctx).not.toHaveProperty('LoadedRecordCount');
        });
    });
});

describe('stripMJPrefix', () => {
    it('strips the "MJ: " schema prefix when present', () => {
        expect(stripMJPrefix('MJ: ML Models')).toBe('ML Models');
        expect(stripMJPrefix('MJ: AI Models')).toBe('AI Models');
    });

    it('returns the name unchanged when there is no prefix', () => {
        expect(stripMJPrefix('Users')).toBe('Users');
        expect(stripMJPrefix('Accounts')).toBe('Accounts');
    });

    it('only strips the exact leading prefix (not a mid-string occurrence)', () => {
        expect(stripMJPrefix('Legacy MJ: Models')).toBe('Legacy MJ: Models');
    });
});

describe('entityDisplayName (FIX 1: users say the display name)', () => {
    it('uses an explicit DisplayName verbatim when present', () => {
        expect(entityDisplayName('MJ: ML Models', 'Machine Learning Models')).toBe('Machine Learning Models');
    });

    it('strips the "MJ: " prefix from the Name when no DisplayName is set', () => {
        expect(entityDisplayName('MJ: ML Models')).toBe('ML Models');
        expect(entityDisplayName('MJ: AI Models', null)).toBe('AI Models');
    });

    it('returns the Name unchanged for a non-prefixed entity with no DisplayName', () => {
        expect(entityDisplayName('Users')).toBe('Users');
    });
});

describe('resolveEntityByName (FIX 1: tolerant entity resolution)', () => {
    const candidates: EntityNameCandidate[] = [
        { Name: 'MJ: ML Models', DisplayName: null },
        { Name: 'MJ: AI Models', DisplayName: null },
        { Name: 'Users', DisplayName: null },
        { Name: 'MJ: Tagged Items', DisplayName: 'Tags' },
    ];

    it('resolves by the display name the user says (prefix stripped)', () => {
        expect(resolveEntityByName('ML Models', candidates)?.Name).toBe('MJ: ML Models');
        expect(resolveEntityByName('AI Models', candidates)?.Name).toBe('MJ: AI Models');
    });

    it('resolves by the exact registered Name (case-insensitive)', () => {
        expect(resolveEntityByName('mj: ml models', candidates)?.Name).toBe('MJ: ML Models');
        expect(resolveEntityByName('users', candidates)?.Name).toBe('Users');
    });

    it('resolves by an explicit DisplayName', () => {
        expect(resolveEntityByName('Tags', candidates)?.Name).toBe('MJ: Tagged Items');
    });

    it('resolves an input that itself carries the "MJ: " prefix against the stripped display name', () => {
        // Input "MJ: ML Models" does match the exact Name here, but verify a DisplayName entity too:
        expect(resolveEntityByName('MJ: Tags', [{ Name: 'X', DisplayName: 'Tags' }])?.Name).toBe('X');
    });

    it('returns null on a miss and on empty input', () => {
        expect(resolveEntityByName('Nonexistent', candidates)).toBeNull();
        expect(resolveEntityByName('   ', candidates)).toBeNull();
    });
});

describe('resolveRecordSelection (FIX 2: pick a row)', () => {
    const recs = ['Betty Bot', 'Charlie Cat', 'Dana Dog'];

    it('resolves "first" and "last" positions', () => {
        expect(resolveRecordSelection(recs, { position: 'first' })).toEqual({ ok: true, index: 0 });
        expect(resolveRecordSelection(recs, { position: 'last' })).toEqual({ ok: true, index: 2 });
    });

    it('resolves a 1-based index position to a 0-based index', () => {
        expect(resolveRecordSelection(recs, { position: 1 })).toEqual({ ok: true, index: 0 });
        expect(resolveRecordSelection(recs, { position: 3 })).toEqual({ ok: true, index: 2 });
    });

    it('errors with a range hint when the index is out of bounds', () => {
        const r = resolveRecordSelection(recs, { position: 9 });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('out of range');
            expect(r.error).toContain('3 records');
        }
    });

    it('resolves by an exact case-insensitive name match', () => {
        expect(resolveRecordSelection(recs, { name: 'betty bot' })).toEqual({ ok: true, index: 0 });
    });

    it('falls back to a contains match when there is no exact match', () => {
        expect(resolveRecordSelection(recs, { name: 'cat' })).toEqual({ ok: true, index: 1 });
    });

    it('prefers position over name when both are supplied', () => {
        expect(resolveRecordSelection(recs, { position: 'last', name: 'Betty Bot' })).toEqual({ ok: true, index: 2 });
    });

    it('errors clearly when no records are loaded', () => {
        const r = resolveRecordSelection([], { position: 'first' });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('No records are currently loaded');
        }
    });

    it('errors when neither a position nor a name is given', () => {
        const r = resolveRecordSelection(recs, {});
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('Provide either a position');
        }
    });

    it('errors with a sample list when the name does not match', () => {
        const r = resolveRecordSelection(recs, { name: 'zebra' });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('No loaded record matches "zebra"');
            expect(r.error).toContain('Betty Bot');
        }
    });
});
