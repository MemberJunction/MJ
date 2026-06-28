/**
 * Tests for the Knowledge Hub Configuration surface's pure agent-context helpers:
 * - buildKnowledgeConfigAgentContext: deep config state → agent context (bounded lists, gated sub-sections)
 * - resolveConfigSection: id → label → contains resolution
 * - resolveByIDOrName: id → name → contains resolution for scopes/indexes
 * - buildConfigNotFoundError: tolerant "available names" error
 */
import { describe, it, expect } from 'vitest';
import {
    buildKnowledgeConfigAgentContext,
    resolveConfigSection,
    resolveByIDOrName,
    buildConfigNotFoundError,
    KnowledgeConfigAgentContextInput,
    ConfigSectionCandidate,
} from '../KnowledgeHub/components/config/knowledge-config-agent-context';

const SECTIONS: ConfigSectionCandidate[] = [
    { ID: 'pipeline', Label: 'Pipeline' },
    { ID: 'vectordb', Label: 'Vector Database' },
    { ID: 'search-scopes', Label: 'Search Scopes' },
];

function makeInput(overrides: Partial<KnowledgeConfigAgentContextInput> = {}): KnowledgeConfigAgentContextInput {
    return {
        ActiveSection: 'pipeline',
        ActiveSectionLabel: 'Pipeline',
        Sections: SECTIONS,
        IsLoading: false,
        HasUnsavedChanges: false,
        VectorSetupComplete: false,
        SetupStepsCompleted: 1,
        VectorDBProviderCount: 1,
        VectorDBProviderNames: ['Pinecone'],
        VectorIndexCount: 0,
        VectorIndexes: [],
        EmbeddingModelName: 'text-embedding-3-small',
        EmbeddingModelCount: 2,
        FTSEntityCount: 40,
        EnabledFTSCount: 40,
        FTSFilterText: '',
        SearchScopes: [],
        ActiveScopeID: null,
        ActiveScopeName: null,
        ActiveScopeTab: 'definition',
        ShowCreateIndexForm: false,
        AnalyticsLoaded: false,
        AnalyticsTotalRuns: 0,
        PermissionsLoaded: false,
        PermissionsRowCount: 0,
        ...overrides,
    };
}

describe('resolveConfigSection', () => {
    it('resolves by exact id (case-insensitive)', () => {
        expect(resolveConfigSection('VectorDB', SECTIONS)?.ID).toBe('vectordb');
    });
    it('resolves by exact label (case-insensitive)', () => {
        expect(resolveConfigSection('vector database', SECTIONS)?.ID).toBe('vectordb');
    });
    it('falls back to a contains match', () => {
        expect(resolveConfigSection('scopes', SECTIONS)?.ID).toBe('search-scopes');
    });
    it('returns null on empty / miss', () => {
        expect(resolveConfigSection('  ', SECTIONS)).toBeNull();
        expect(resolveConfigSection('nope', SECTIONS)).toBeNull();
    });
});

describe('resolveByIDOrName', () => {
    const candidates = [
        { ID: 'aaa-111', Name: 'Global' },
        { ID: 'bbb-222', Name: 'HR Policies' },
    ];
    it('resolves by exact id', () => {
        expect(resolveByIDOrName('AAA-111', candidates)?.Name).toBe('Global');
    });
    it('resolves by exact name', () => {
        expect(resolveByIDOrName('hr policies', candidates)?.ID).toBe('bbb-222');
    });
    it('falls back to contains on name', () => {
        expect(resolveByIDOrName('policies', candidates)?.ID).toBe('bbb-222');
    });
    it('returns null on miss', () => {
        expect(resolveByIDOrName('zzz', candidates)).toBeNull();
    });
});

describe('buildConfigNotFoundError', () => {
    it('lists a bounded sample of available names', () => {
        const names = Array.from({ length: 15 }, (_, i) => `scope-${i}`);
        const msg = buildConfigNotFoundError('xyz', 'search scope', names);
        expect(msg).toContain('No search scope matches "xyz"');
        expect(msg).toContain('scope-0');
        expect(msg).toContain('(+5 more)');
    });
});

describe('buildKnowledgeConfigAgentContext', () => {
    it('publishes core navigation + setup fields', () => {
        const ctx = buildKnowledgeConfigAgentContext(makeInput());
        expect(ctx['ActiveSection']).toBe('pipeline');
        expect(ctx['SectionCount']).toBe(3);
        expect(ctx['AvailableSections']).toEqual(['pipeline', 'vectordb', 'search-scopes']);
        expect(ctx['VectorDBProviderNames']).toEqual(['Pinecone']);
        expect(ctx['EmbeddingModelName']).toBe('text-embedding-3-small');
    });

    it('gates analytics + permissions detail until loaded', () => {
        const unloaded = buildKnowledgeConfigAgentContext(makeInput());
        expect(unloaded['AnalyticsLoaded']).toBeUndefined();
        expect(unloaded['PermissionsLoaded']).toBeUndefined();

        const loaded = buildKnowledgeConfigAgentContext(makeInput({
            AnalyticsLoaded: true, AnalyticsTotalRuns: 42,
            PermissionsLoaded: true, PermissionsRowCount: 7,
        }));
        expect(loaded['AnalyticsLoaded']).toBe(true);
        expect(loaded['AnalyticsTotalRuns']).toBe(42);
        expect(loaded['PermissionsRowCount']).toBe(7);
    });

    it('bounds the scope name list and flags truncation', () => {
        const scopes = Array.from({ length: 30 }, (_, i) => ({ ID: `s-${i}`, Name: `Scope ${i}` }));
        const ctx = buildKnowledgeConfigAgentContext(makeInput({ SearchScopes: scopes }));
        expect((ctx['SearchScopeNames'] as string[]).length).toBe(25);
        expect(ctx['SearchScopeCount']).toBe(30);
        expect(ctx['SearchScopeNamesTruncated']).toBe(true);
    });

    it('surfaces the active scope id + name', () => {
        const ctx = buildKnowledgeConfigAgentContext(makeInput({
            ActiveScopeID: 'bbb-222', ActiveScopeName: 'HR Policies', ActiveScopeTab: 'providers',
        }));
        expect(ctx['ActiveScopeID']).toBe('bbb-222');
        expect(ctx['ActiveScopeName']).toBe('HR Policies');
        expect(ctx['ActiveScopeTab']).toBe('providers');
    });
});
