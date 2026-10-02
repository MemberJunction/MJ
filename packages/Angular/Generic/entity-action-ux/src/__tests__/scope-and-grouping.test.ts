/**
 * Unit tests for the pure scope-building, value-display, and prompt-grouping helpers the runner + selector
 * delegate to.
 */
import { describe, it, expect } from 'vitest';
import { BuildRecordProcessScope, DisplayValue } from '../lib/scope';
import { FilterPromptGroups, GroupPromptsByCategory, type PromptOption } from '../lib/prompt-grouping';
import type { EntityActionUXContext } from '../lib/runtime-ux-context';

const ctx = (over: Partial<EntityActionUXContext>): EntityActionUXContext =>
    ({ EntityInfo: {} as EntityActionUXContext['EntityInfo'], ScopeKind: 'records', ...over });

describe('buildRecordProcessScope', () => {
    it('records → selected IDs (empty array when none)', () => {
        expect(BuildRecordProcessScope(ctx({ ScopeKind: 'records', SelectedRecordIDs: ['a', 'b'] }))).toEqual({ Kind: 'records', RecordIDs: ['a', 'b'] });
        expect(BuildRecordProcessScope(ctx({ ScopeKind: 'records' }))).toEqual({ Kind: 'records', RecordIDs: [] });
    });
    it('view / list / filter map through', () => {
        expect(BuildRecordProcessScope(ctx({ ScopeKind: 'view', ViewID: 'V1' }))).toEqual({ Kind: 'view', ViewID: 'V1' });
        expect(BuildRecordProcessScope(ctx({ ScopeKind: 'list', ListID: 'L1' }))).toEqual({ Kind: 'list', ListID: 'L1' });
        expect(BuildRecordProcessScope(ctx({ ScopeKind: 'filter', Filter: "X=1" }))).toEqual({ Kind: 'filter', Filter: 'X=1' });
    });
});

describe('displayValue', () => {
    it('renders empties as (empty)', () => {
        expect(DisplayValue(null)).toBe('(empty)');
        expect(DisplayValue(undefined)).toBe('(empty)');
        expect(DisplayValue('')).toBe('(empty)');
    });
    it('stringifies primitives and objects', () => {
        expect(DisplayValue(42)).toBe('42');
        expect(DisplayValue(false)).toBe('false');
        expect(DisplayValue({ a: 1 })).toBe('{"a":1}');
    });
});

describe('groupPromptsByCategory', () => {
    const prompts: PromptOption[] = [
        { ID: '1', Name: 'Summarize', Category: 'Content' },
        { ID: '2', Name: 'Classify', Category: 'Content' },
        { ID: '3', Name: 'Score', Category: 'Analysis' },
        { ID: '4', Name: 'Orphan', Category: '' },
    ];

    it('groups by category, preserving encounter order', () => {
        const groups = GroupPromptsByCategory(prompts);
        expect(groups.map((g) => g.Category)).toEqual(['Content', 'Analysis', 'Uncategorized']);
        expect(groups[0].Prompts).toHaveLength(2);
    });
    it('blank category becomes Uncategorized', () => {
        const groups = GroupPromptsByCategory([{ ID: 'x', Name: 'N', Category: '' }]);
        expect(groups[0].Category).toBe('Uncategorized');
    });
});

describe('filterPromptGroups', () => {
    const groups = GroupPromptsByCategory([
        { ID: '1', Name: 'Summarize', Category: 'Content' },
        { ID: '2', Name: 'Classify', Category: 'Content' },
        { ID: '3', Name: 'Score sentiment', Category: 'Analysis' },
    ]);

    it('returns all groups for an empty query', () => {
        expect(FilterPromptGroups(groups, '')).toBe(groups);
    });
    it('filters case-insensitively and drops emptied groups', () => {
        const result = FilterPromptGroups(groups, 'sCoRe');
        expect(result).toHaveLength(1);
        expect(result[0].Category).toBe('Analysis');
        expect(result[0].Prompts[0].Name).toBe('Score sentiment');
    });
});
