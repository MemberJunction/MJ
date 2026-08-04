import { describe, it, expect } from 'vitest';
import {
    buildTagsAgentContext,
    isValidTagsTab,
    resolveTaxNode,
    buildTagsNotFoundError,
    capTagNames,
    TAGS_AGENT_CONTEXT_NAME_LIST_CAP,
    TaxNodeCandidate,
    TagsAgentContextInput,
} from '../AI/components/tags/tags-agent-context';

const nodes: TaxNodeCandidate[] = [
    { ID: 'T1', Name: 'finance', DisplayName: 'Finance' },
    { ID: 'T2', Name: 'hr', DisplayName: 'Human Resources' },
];

function baseInput(over: Partial<TagsAgentContextInput> = {}): TagsAgentContextInput {
    return {
        ActiveTab: 'tags',
        SourceCount: 0,
        ContentItemCount: 0,
        ContentTagCount: 0,
        TagLibraryCount: 0,
        FilteredTagCount: 0,
        TagSearchQuery: '',
        TaxonomyNodeCount: 0,
        SelectedTaxNodeID: null,
        SelectedTaxNodeName: null,
        SuggestionCount: 0,
        IsRunning: false,
        PipelineProgress: 0,
        ShowPipelineConfig: false,
        TagLibraryNames: [],
        TaxonomyNodeNames: [],
        ...over,
    };
}

describe('isValidTagsTab', () => {
    it('accepts known tabs incl suggestions/health, rejects junk', () => {
        expect(isValidTagsTab('suggestions')).toBe(true);
        expect(isValidTagsTab('health')).toBe(true);
        expect(isValidTagsTab('taxonomy')).toBe(true);
        expect(isValidTagsTab('bogus')).toBe(false);
        expect(isValidTagsTab(null)).toBe(false);
    });
});

describe('capTagNames', () => {
    it('caps without mutating', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        expect(capTagNames(names)).toHaveLength(TAGS_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names).toHaveLength(40);
    });
});

describe('resolveTaxNode', () => {
    it('resolves by id, name, display name, partial', () => {
        expect((resolveTaxNode('t2', nodes) as { ok: true; value: TaxNodeCandidate }).value.Name).toBe('hr');
        expect((resolveTaxNode('finance', nodes) as { ok: true; value: TaxNodeCandidate }).value.ID).toBe('T1');
        expect((resolveTaxNode('Human Resources', nodes) as { ok: true; value: TaxNodeCandidate }).value.ID).toBe('T2');
        expect((resolveTaxNode('fin', nodes) as { ok: true; value: TaxNodeCandidate }).value.ID).toBe('T1');
    });
    it('errors tolerantly listing display names', () => {
        const r = resolveTaxNode('zzz', nodes);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Finance');
    });
    it('errors on empty', () => {
        expect(resolveTaxNode('  ', nodes).ok).toBe(false);
    });
});

describe('buildTagsNotFoundError', () => {
    it('handles empty list', () => {
        expect(buildTagsNotFoundError('x', [])).toContain('No tags are loaded');
    });
});

describe('buildTagsAgentContext', () => {
    it('reports core counts + idle pipeline', () => {
        const ctx = buildTagsAgentContext(baseInput({ TagLibraryCount: 12, FilteredTagCount: 5, TaxonomyNodeCount: 8 }));
        expect(ctx['TagLibraryCount']).toBe(12);
        expect(ctx['FilteredTagCount']).toBe(5);
        expect(ctx['TaxonomyNodeCount']).toBe(8);
        expect(ctx['PipelineStatus']).toBe('idle');
    });
    it('omits TagSearchQuery when empty, includes when set', () => {
        expect(buildTagsAgentContext(baseInput())['TagSearchQuery']).toBeUndefined();
        expect(buildTagsAgentContext(baseInput({ TagSearchQuery: 'rev' }))['TagSearchQuery']).toBe('rev');
    });
    it('passes the selected taxonomy node id+name', () => {
        const ctx = buildTagsAgentContext(baseInput({ SelectedTaxNodeID: 'T1', SelectedTaxNodeName: 'Finance' }));
        expect(ctx['SelectedTaxNodeID']).toBe('T1');
        expect(ctx['SelectedTaxNodeName']).toBe('Finance');
    });
    it('bounds + counts name lists', () => {
        const many = Array.from({ length: 30 }, (_, i) => `Tag${i}`);
        const ctx = buildTagsAgentContext(baseInput({ TagLibraryNames: many, TaxonomyNodeNames: ['Finance'] }));
        expect((ctx['TopTagNames'] as string[]).length).toBe(TAGS_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['TagLibraryNameCount']).toBe(30);
        expect(ctx['TaxonomyNodeNames']).toEqual(['Finance']);
        expect(ctx['TaxonomyNodeNameCount']).toBeUndefined();
    });
});
