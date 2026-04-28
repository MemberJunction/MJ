/**
 * Tests for ElasticsearchSearchProvider (P5.1). Mocks @elastic/elasticsearch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearch, mockPing } = vi.hoisted(() => ({
    mockSearch: vi.fn(),
    mockPing: vi.fn(),
}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@elastic/elasticsearch', () => ({
    Client: class {
        constructor(_opts: unknown) { /* options captured for assertion via separate hoisted mock if needed */ }
        search = mockSearch;
        ping = mockPing;
    },
}));

import {
    ElasticsearchSearchProvider,
    __resetElasticsearchClientLoaderForTests,
} from '../providers/ElasticsearchSearchProvider';
import type { UserInfo } from '@memberjunction/core';
import type { ScopeConstraints } from '../generic/search.types';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function basicConfig() {
    return {
        Name: 'TestES',
        ProviderConfig: {
            node: 'https://es.example/',
            apiKey: 'fake',
            defaultField: 'content',
            defaultIndex: 'docs',
        },
        CredentialID: null,
        MaxResultsOverride: null,
        SupportsPreview: false,
        Priority: 100,
    };
}

describe('ElasticsearchSearchProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetElasticsearchClientLoaderForTests();
        mockPing.mockResolvedValue({});
    });

    describe('lifecycle', () => {
        it('IsAvailable returns true after a successful ping', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
        });

        it('IsAvailable returns false when ping throws', async () => {
            mockPing.mockRejectedValueOnce(new Error('connection refused'));
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(false);
        });

        it('Initialize tolerates an empty ProviderConfig (returns empty results from Search later)', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize({ ...basicConfig(), ProviderConfig: null }, fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
            expect(mockSearch).not.toHaveBeenCalled();
        });
    });

    describe('Search', () => {
        beforeEach(() => {
            mockSearch.mockResolvedValue({
                hits: {
                    hits: [
                        { _index: 'docs', _id: 'doc-1', _score: 8.4, _source: { title: 'High match', content: 'lorem' } },
                        { _index: 'docs', _id: 'doc-2', _score: 4.2, _source: { title: 'Lower match', content: 'ipsum' } },
                    ],
                },
            });
        });

        it('queries the default index when no scope external-indexes are provided', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('plain query', 10, undefined, fakeUser);

            expect(mockSearch).toHaveBeenCalledTimes(1);
            const call = mockSearch.mock.calls[0][0] as { index: string[]; size: number; query: Record<string, unknown> };
            expect(call.index).toEqual(['docs']);
            expect(call.size).toBe(10);
            expect(results).toHaveLength(2);
            expect(results[0].RecordID).toBe('doc-1');
            // Score normalized to [0,1] with the top hit at 1
            expect(results[0].Score).toBeCloseTo(1);
            expect(results[1].Score).toBeCloseTo(0.5);
        });

        it('uses scope external-indexes when present (overrides defaultIndex)', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    { IndexType: 'Elasticsearch', ExternalIndexName: 'support-tickets' },
                    { IndexType: 'Elasticsearch', ExternalIndexName: 'kb-articles' },
                    { IndexType: 'Vector', VectorIndexID: 'ignored' }, // not for this provider
                ],
            } as ScopeConstraints;

            await p.Search('q', 5, undefined, fakeUser, scope);
            const call = mockSearch.mock.calls[0][0] as { index: string[] };
            expect(call.index).toEqual(['support-tickets', 'kb-articles']);
        });

        it('composes scope MetadataFilter into bool.filter (permission / tenant push-down)', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    {
                        IndexType: 'Elasticsearch',
                        ExternalIndexName: 'docs',
                        MetadataFilter: { term: { tenant_id: 'tenant-a' } },
                    },
                ],
            } as ScopeConstraints;

            await p.Search('q', 10, undefined, fakeUser, scope);
            const body = mockSearch.mock.calls[0][0] as { query: { bool: { filter?: unknown[] } } };
            expect(body.query.bool.filter).toBeDefined();
            expect(body.query.bool.filter![0]).toEqual({ term: { tenant_id: 'tenant-a' } });
        });

        it('honors a per-provider query transform from scopeConstraints.QueryTransforms', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope = {
                QueryTransforms: { fulltext: 'rewritten query' },
            } as ScopeConstraints;
            await p.Search('original', 5, undefined, fakeUser, scope);

            const body = mockSearch.mock.calls[0][0] as {
                query: { bool: { must: Array<{ match: Record<string, string> }> } };
            };
            expect(body.query.bool.must[0].match.content).toBe('rewritten query');
        });

        it('returns empty when neither scope nor providerConfig supplies an index', async () => {
            const p = new ElasticsearchSearchProvider();
            await p.Initialize({ ...basicConfig(), ProviderConfig: { node: 'x', apiKey: 'k' } }, fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
            expect(mockSearch).not.toHaveBeenCalled();
        });

        it('returns empty + logs on Elasticsearch errors (does not throw)', async () => {
            mockSearch.mockRejectedValueOnce(new Error('shards unavailable'));
            const p = new ElasticsearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });
});
