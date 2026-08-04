/**
 * Unit tests for the pure scope-building, value-display, and prompt-grouping helpers the runner + selector
 * delegate to.
 */
import { describe, it, expect } from 'vitest';
import { buildRecordProcessScope, displayValue } from '../lib/scope';
import { filterPromptGroups, groupPromptsByCategory, type PromptOption } from '../lib/prompt-grouping';
import type { EntityActionUXContext } from '../lib/runtime-ux-context';

const ctx = (over: Partial<EntityActionUXContext>): EntityActionUXContext =>
    ({ EntityInfo: {} as EntityActionUXContext['EntityInfo'], ScopeKind: 'records', ...over });

describe('buildRecordProcessScope', () => {
    it('records → selected IDs (empty array when none)', () => {
        expect(buildRecordProcessScope(ctx({ ScopeKind: 'records', SelectedRecordIDs: ['a', 'b'] }))).toEqual({ Kind: 'records', RecordIDs: ['a', 'b'] });
        expect(buildRecordProcessScope(ctx({ ScopeKind: 'records' }))).toEqual({ Kind: 'records', RecordIDs: [] });
    });
    it('view / list / filter map through', () => {
        expect(buildRecordProcessScope(ctx({ ScopeKind: 'view', ViewID: 'V1' }))).toEqual({ Kind: 'view', ViewID: 'V1' });
        expect(buildRecordProcessScope(ctx({ ScopeKind: 'list', ListID: 'L1' }))).toEqual({ Kind: 'list', ListID: 'L1' });
        expect(buildRecordProcessScope(ctx({ ScopeKind: 'filter', Filter: "X=1" }))).toEqual({ Kind: 'filter', Filter: 'X=1' });
    });
});

describe('displayValue', () => {
    it('renders empties as (empty)', () => {
        expect(displayValue(null)).toBe('(empty)');
        expect(displayValue(undefined)).toBe('(empty)');
        expect(displayValue('')).toBe('(empty)');
    });
    it('stringifies primitives and objects', () => {
        expect(displayValue(42)).toBe('42');
        expect(displayValue(false)).toBe('false');
        expect(displayValue({ a: 1 })).toBe('{"a":1}');
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
        const groups = groupPromptsByCategory(prompts);
        expect(groups.map((g) => g.Category)).toEqual(['Content', 'Analysis', 'Uncategorized']);
        expect(groups[0].Prompts).toHaveLength(2);
    });
    it('blank category becomes Uncategorized', () => {
        const groups = groupPromptsByCategory([{ ID: 'x', Name: 'N', Category: '' }]);
        expect(groups[0].Category).toBe('Uncategorized');
    });
});

describe('filterPromptGroups', () => {
    const groups = groupPromptsByCategory([
        { ID: '1', Name: 'Summarize', Category: 'Content' },
        { ID: '2', Name: 'Classify', Category: 'Content' },
        { ID: '3', Name: 'Score sentiment', Category: 'Analysis' },
    ]);

    it('returns all groups for an empty query', () => {
        expect(filterPromptGroups(groups, '')).toBe(groups);
    });
    it('filters case-insensitively and drops emptied groups', () => {
        const result = filterPromptGroups(groups, 'sCoRe');
        expect(result).toHaveLength(1);
        expect(result[0].Category).toBe('Analysis');
        expect(result[0].Prompts[0].Name).toBe('Score sentiment');
    });
});
