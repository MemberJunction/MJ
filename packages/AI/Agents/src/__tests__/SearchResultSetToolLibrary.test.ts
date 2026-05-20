import { describe, it, expect, vi } from 'vitest';

// Partial mock so transitive imports of `@memberjunction/global` (e.g.
// BaseSingleton from MJCore) keep working.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

import { SearchResultSetToolLibrary } from '../artifact-tools/SearchResultSetToolLibrary';

const SAMPLE_SPEC = JSON.stringify({
    Query: 'employee benefits',
    ScopeIDs: ['scope-hr'],
    Provider: 'fusion',
    Reranker: 'Cohere',
    Results: [
        { ID: 'uuid-1', Title: 'PTO Policy',         Snippet: 'Vacation days...', Score: 0.95, EntityName: 'ContentItems', RecordID: 'rec-1', SourceProvider: 'vector',   Chunk: 'Long PTO chunk',  SourceUrl: 'https://example.com/pto' },
        { ID: 'uuid-2', Title: '401k Match',         Snippet: 'We match 6%...',   Score: 0.82, EntityName: 'ContentItems', RecordID: 'rec-2', SourceProvider: 'fulltext' },
        { ID: 'uuid-3', Title: 'Health Insurance',   Snippet: 'BCBS plan...',     Score: 0.71, EntityName: 'ContentItems', RecordID: 'rec-3', SourceProvider: 'vector' },
        { ID: 'uuid-4', Title: 'Vision Plan',        Snippet: 'Annual exam...',   Score: 0.42, EntityName: 'ContentItems', RecordID: 'rec-4', SourceProvider: 'entity' },
        { ID: 'uuid-5', Title: 'Random File',        Snippet: 'Storage hit',      Score: 0.30,                                                  SourceProvider: 'storage' },
    ],
});

describe('SearchResultSetToolLibrary', () => {
    const lib = new SearchResultSetToolLibrary();

    it('registers the five spec-mandated tools plus inherited get_full', () => {
        const tools = lib.GetToolList().map(t => t.name);
        expect(tools).toEqual([
            'get_full',
            'filterByScore',
            'groupBySourceProvider',
            'getMatchingChunks',
            'followSourceLink',
            'rerankInline',
        ]);
    });

    describe('filterByScore', () => {
        it('keeps rows at or above minScore', async () => {
            const r = await lib.InvokeTool('filterByScore', { minScore: 0.7 }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { count: number; rows: Array<{ Title: string }> };
            expect(data.count).toBe(3);
            expect(data.rows.map(x => x.Title)).toEqual(['PTO Policy', '401k Match', 'Health Insurance']);
        });

        it('respects maxScore upper bound', async () => {
            const r = await lib.InvokeTool('filterByScore', { minScore: 0.4, maxScore: 0.8 }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { count: number };
            // 0.71 and 0.42 fit, 0.30 < 0.4, 0.82 > 0.8, 0.95 > 0.8
            expect(data.count).toBe(2);
        });

        it('rejects when minScore missing', async () => {
            const r = await lib.InvokeTool('filterByScore', {}, SAMPLE_SPEC);
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/minScore/);
        });

        it('strips internal UUID from agent-facing rows', async () => {
            const r = await lib.InvokeTool('filterByScore', { minScore: 0.9 }, SAMPLE_SPEC);
            const data = r.data as { rows: Array<Record<string, unknown>> };
            expect(data.rows[0]).not.toHaveProperty('ID');
            expect(data.rows[0].AlphaID).toBe('A');
        });
    });

    describe('groupBySourceProvider', () => {
        it('returns counts and avg scores per provider', async () => {
            const r = await lib.InvokeTool('groupBySourceProvider', {}, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { groups: Array<{ Provider: string; Count: number; AvgScore: number }>; markdown: string };
            const vector = data.groups.find(g => g.Provider === 'vector');
            expect(vector?.Count).toBe(2);
            expect(vector?.AvgScore).toBeCloseTo(0.83, 2);
            expect(data.markdown).toContain('| Provider | Count | Avg Score |');
        });
    });

    describe('getMatchingChunks', () => {
        it('returns chunk + URL by alpha ID', async () => {
            const r = await lib.InvokeTool('getMatchingChunks', { rowId: 'A' }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { rowId: string; chunk: string; sourceUrl: string };
            expect(data.rowId).toBe('A');
            expect(data.chunk).toBe('Long PTO chunk');
            expect(data.sourceUrl).toBe('https://example.com/pto');
        });

        it('falls back to snippet when chunk is absent', async () => {
            const r = await lib.InvokeTool('getMatchingChunks', { rowId: 'B' }, SAMPLE_SPEC);
            const data = r.data as { chunk: string; sourceUrl: string | null };
            expect(data.chunk).toBe('We match 6%...');
            expect(data.sourceUrl).toBeNull();
        });

        it('errors on unknown row ID', async () => {
            const r = await lib.InvokeTool('getMatchingChunks', { rowId: 'ZZ' }, SAMPLE_SPEC);
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/not found/);
        });

        it('uses case-insensitive alpha ID matching', async () => {
            const r = await lib.InvokeTool('getMatchingChunks', { rowId: 'a' }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
        });
    });

    describe('followSourceLink', () => {
        it('returns the upstream entity reference + RLS-recheck note', async () => {
            const r = await lib.InvokeTool('followSourceLink', { rowId: 'A' }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { entityName: string; recordId: string; rlsCheckRequired: boolean };
            expect(data.entityName).toBe('ContentItems');
            expect(data.recordId).toBe('rec-1');
            expect(data.rlsCheckRequired).toBe(true);
        });

        it('errors when row has no upstream entity (storage-only)', async () => {
            const r = await lib.InvokeTool('followSourceLink', { rowId: 'E' }, SAMPLE_SPEC);
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/no upstream entity/);
        });
    });

    describe('rerankInline', () => {
        it('returns a runtime request payload, not a re-ranked list', async () => {
            const r = await lib.InvokeTool('rerankInline', { rerankerName: 'Voyage' }, SAMPLE_SPEC);
            expect(r.success).toBe(true);
            const data = r.data as { rerankerName: string; originalReranker: string; originalOrder: string[] };
            expect(data.rerankerName).toBe('Voyage');
            expect(data.originalReranker).toBe('Cohere');
            expect(data.originalOrder).toEqual(['A', 'B', 'C', 'D', 'E']);
        });

        it('rejects empty rerankerName', async () => {
            const r = await lib.InvokeTool('rerankInline', { rerankerName: '' }, SAMPLE_SPEC);
            expect(r.success).toBe(false);
        });
    });

    describe('error handling', () => {
        it('reports invalid JSON cleanly', async () => {
            const r = await lib.InvokeTool('filterByScore', { minScore: 0 }, '{ not json');
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/not valid JSON/i);
        });

        it('reports missing Results array', async () => {
            const r = await lib.InvokeTool('filterByScore', { minScore: 0 }, JSON.stringify({ Query: 'x' }));
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/Results array/);
        });

        it('rejects unknown tool names', async () => {
            const r = await lib.InvokeTool('frobnicate', {}, SAMPLE_SPEC);
            expect(r.success).toBe(false);
            expect(r.errorMessage).toMatch(/Unknown tool/);
        });
    });
});
