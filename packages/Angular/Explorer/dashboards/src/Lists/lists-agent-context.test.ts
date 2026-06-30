import { describe, it, expect } from 'vitest';
import {
    capListNames,
    resolveNamedRecord,
    buildNotFoundError,
    buildListBrowseAgentContext,
    buildListCategoriesAgentContext,
    buildListOperationsAgentContext,
    LISTS_AGENT_CONTEXT_NAME_LIST_CAP,
    type NamedRecord,
    type CategoryNodeSummary,
    type OperandSummary,
    type VennRegionSummary,
} from './lists-agent-context';

describe('capListNames', () => {
    it('returns the list unchanged when under the cap', () => {
        const names = ['a', 'b', 'c'];
        expect(capListNames(names)).toEqual(['a', 'b', 'c']);
    });

    it('caps the list at the documented maximum', () => {
        const names = Array.from({ length: 100 }, (_, i) => `n${i}`);
        expect(capListNames(names).length).toBe(LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
    });

    it('does not mutate the input array', () => {
        const names = Array.from({ length: 30 }, (_, i) => `n${i}`);
        const copy = [...names];
        capListNames(names);
        expect(names).toEqual(copy);
    });
});

describe('resolveNamedRecord', () => {
    const records: NamedRecord[] = [
        { ID: 'AAAA-1111', Name: 'Active Members' },
        { ID: 'BBBB-2222', Name: 'Lapsed Donors' },
        { ID: 'CCCC-3333', Name: 'Active Volunteers' },
    ];

    it('matches an exact ID (case-insensitive)', () => {
        expect(resolveNamedRecord('aaaa-1111', records)?.Name).toBe('Active Members');
    });

    it('matches an exact name (case- and whitespace-insensitive)', () => {
        expect(resolveNamedRecord('  lapsed donors ', records)?.ID).toBe('BBBB-2222');
    });

    it('falls back to a contains match on the name', () => {
        // "Volunteers" appears in exactly one name.
        expect(resolveNamedRecord('volunteers', records)?.ID).toBe('CCCC-3333');
    });

    it('returns the FIRST contains match when ambiguous', () => {
        // "Active" appears in two names; the first in order wins (tolerant, deterministic).
        expect(resolveNamedRecord('active', records)?.Name).toBe('Active Members');
    });

    it('returns null on an empty input', () => {
        expect(resolveNamedRecord('   ', records)).toBeNull();
    });

    it('returns null on a complete miss', () => {
        expect(resolveNamedRecord('Nonexistent', records)).toBeNull();
    });

    it('prefers an exact name over a contains match', () => {
        const recs: NamedRecord[] = [
            { ID: '1', Name: 'Members Extended' },
            { ID: '2', Name: 'Members' },
        ];
        // Exact "members" must win over the earlier "Members Extended" contains candidate.
        expect(resolveNamedRecord('members', recs)?.ID).toBe('2');
    });
});

describe('buildNotFoundError', () => {
    it('samples the available names and names the noun', () => {
        const records: NamedRecord[] = [
            { ID: '1', Name: 'Alpha' },
            { ID: '2', Name: 'Beta' },
        ];
        const msg = buildNotFoundError('Gamma', records, 'list');
        expect(msg).toContain('Gamma');
        expect(msg).toContain('Alpha, Beta');
        expect(msg).toContain('list');
    });

    it('handles an empty candidate list', () => {
        expect(buildNotFoundError('x', [], 'category')).toContain('(none)');
    });
});

describe('buildListBrowseAgentContext', () => {
    it('includes core fields and bounds the visible-name list', () => {
        const names = Array.from({ length: 30 }, (_, i) => `List ${i}`);
        const ctx = buildListBrowseAgentContext({
            SearchTerm: 'mem',
            ViewMode: 'table',
            AllListCount: 30,
            FilteredListCount: 30,
            VisibleListNames: names,
        });
        expect(ctx['SearchTerm']).toBe('mem');
        expect(ctx['ViewMode']).toBe('table');
        expect((ctx['VisibleListNames'] as string[]).length).toBe(LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleListNameCount']).toBe(30);
    });

    it('omits optional filter fields that are not supplied', () => {
        const ctx = buildListBrowseAgentContext({
            SearchTerm: '',
            ViewMode: 'grid',
            AllListCount: 2,
            FilteredListCount: 2,
            VisibleListNames: ['a', 'b'],
        });
        expect('SelectedSort' in ctx).toBe(false);
        expect('SelectedOwner' in ctx).toBe(false);
        expect('ShowOnlyFavorites' in ctx).toBe(false);
        expect('VisibleListNameCount' in ctx).toBe(false);
    });

    it('includes optional filter fields when supplied (including false favorites)', () => {
        const ctx = buildListBrowseAgentContext({
            SearchTerm: '',
            ViewMode: 'table',
            AllListCount: 5,
            FilteredListCount: 3,
            VisibleListNames: ['a'],
            SelectedSort: 'name',
            ActiveFilterCount: 2,
            SelectedOwner: 'mine',
            SelectedEntity: 'all',
            ShowOnlyFavorites: false,
        });
        expect(ctx['SelectedSort']).toBe('name');
        expect(ctx['ActiveFilterCount']).toBe(2);
        expect(ctx['SelectedOwner']).toBe('mine');
        expect(ctx['ShowOnlyFavorites']).toBe(false);
    });
});

describe('buildListCategoriesAgentContext', () => {
    const nodes: CategoryNodeSummary[] = [
        { Name: 'Marketing', ListCount: 4, Expanded: true },
        { Name: 'Sales', ListCount: 2, Expanded: false },
    ];

    it('reports selection id+name, counts, member-list names, and expanded nodes', () => {
        const ctx = buildListCategoriesAgentContext({
            SelectedCategoryId: 'cat-1',
            SelectedCategoryName: 'Marketing',
            CategoryCount: 2,
            SelectedCategoryListCount: 2,
            SelectedCategoryListNames: ['Newsletter', 'Webinar'],
            CategoryNodes: nodes,
        });
        expect(ctx['SelectedCategoryId']).toBe('cat-1');
        expect(ctx['SelectedCategoryName']).toBe('Marketing');
        expect(ctx['SelectedCategoryListNames']).toEqual(['Newsletter', 'Webinar']);
        expect(ctx['ExpandedCategoryNames']).toEqual(['Marketing']);
        expect(ctx['CategoryNodes']).toHaveLength(2);
    });

    it('omits member-list names and node fields when empty', () => {
        const ctx = buildListCategoriesAgentContext({
            SelectedCategoryId: null,
            SelectedCategoryName: null,
            CategoryCount: 0,
            SelectedCategoryListCount: 0,
            SelectedCategoryListNames: [],
            CategoryNodes: [],
        });
        expect('SelectedCategoryListNames' in ctx).toBe(false);
        expect('CategoryNodes' in ctx).toBe(false);
        expect('ExpandedCategoryNames' in ctx).toBe(false);
    });
});

describe('buildListOperationsAgentContext', () => {
    const operands: OperandSummary[] = [
        { Name: 'List A', Kind: 'list', EntityName: 'Members' },
        { Name: 'View B', Kind: 'view', EntityName: 'Members' },
    ];
    const regions: VennRegionSummary[] = [
        { Label: 'A ∩ B', Size: 12 },
        { Label: 'Only A', Size: 30 },
    ];

    it('reports operands, locked entity, regions, selection, and last op', () => {
        const ctx = buildListOperationsAgentContext({
            Operands: operands,
            ListOperandCount: 1,
            ViewOperandCount: 1,
            TotalOperandCount: 2,
            MaxOperands: 4,
            LockedEntityName: 'Members',
            ComposeOp: 'union',
            AvailableEntityNames: ['Members', 'Accounts'],
            AvailableRegions: regions,
            SelectedRegionLabel: 'A ∩ B',
            SelectedRegionSize: 12,
            PreviewRecordNames: ['Alice', 'Bob'],
            LastOperation: { operation: 'union', resultCount: 42 },
        });
        expect(ctx['Operands']).toHaveLength(2);
        expect(ctx['LockedEntityName']).toBe('Members');
        expect(ctx['AvailableRegions']).toHaveLength(2);
        expect(ctx['SelectedRegionLabel']).toBe('A ∩ B');
        expect(ctx['PreviewRecordNames']).toEqual(['Alice', 'Bob']);
        expect(ctx['LastOperation']).toEqual({ operation: 'union', resultCount: 42 });
    });

    it('omits operand/region/preview arrays when empty (empty canvas)', () => {
        const ctx = buildListOperationsAgentContext({
            Operands: [],
            ListOperandCount: 0,
            ViewOperandCount: 0,
            TotalOperandCount: 0,
            MaxOperands: 4,
            LockedEntityName: null,
            ComposeOp: 'union',
            AvailableEntityNames: [],
            AvailableRegions: [],
            SelectedRegionLabel: null,
            SelectedRegionSize: null,
            PreviewRecordNames: [],
            LastOperation: null,
        });
        expect('Operands' in ctx).toBe(false);
        expect('AvailableRegions' in ctx).toBe(false);
        expect('PreviewRecordNames' in ctx).toBe(false);
        expect(ctx['TotalOperandCount']).toBe(0);
    });
});
