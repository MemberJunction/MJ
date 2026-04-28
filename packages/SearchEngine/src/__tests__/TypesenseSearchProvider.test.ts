/**
 * Tests for TypesenseSearchProvider (P5.2). Mocks fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });

import { TypesenseSearchProvider } from '../providers/TypesenseSearchProvider';
import type { UserInfo } from '@memberjunction/core';
import type { ScopeConstraints } from '../generic/search.types';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function basicConfig() {
    return {
        Name: 'TestTypesense',
        ProviderConfig: {
            nodeUrl: 'https://ts.example:8108',
            apiKey: 'fake-key',
            defaultCollection: 'docs',
            defaultQueryBy: 'content,title',
        },
        CredentialID: null,
        MaxResultsOverride: null,
        SupportsPreview: false,
        Priority: 100,
    };
}

function tsResponse(hits: Array<{ id: string; title?: string; content?: string; text_match: number }>): Response {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
        json: async () => ({
            found: hits.length,
            hits: hits.map(h => ({
                document: { id: h.id, title: h.title, content: h.content },
                text_match: h.text_match,
            })),
        }),
    } as unknown as Response;
}

function healthOk(): Response {
    return { ok: true, status: 200, text: async () => 'ok', json: async () => ({}) } as unknown as Response;
}

describe('TypesenseSearchProvider', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('lifecycle', () => {
        it('IsAvailable true after a 200 health check', async () => {
            mockFetch.mockResolvedValue(healthOk());
            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toBe('https://ts.example:8108/health');
        });

        it('IsAvailable false when health check throws', async () => {
            mockFetch.mockRejectedValue(new Error('connection refused'));
            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(false);
        });

        it('Initialize tolerates an empty ProviderConfig (Search returns empty)', async () => {
            const p = new TypesenseSearchProvider();
            await p.Initialize({ ...basicConfig(), ProviderConfig: null }, fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });

    describe('Search', () => {
        it('queries the default collection when no scope ExternalIndexes', async () => {
            mockFetch.mockResolvedValueOnce(healthOk()); // CheckAvailability
            mockFetch.mockResolvedValueOnce(tsResponse([
                { id: '1', title: 'High', content: 'a', text_match: 1000 },
                { id: '2', title: 'Mid', content: 'b', text_match: 500 },
            ]));

            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('hello', 10, undefined, fakeUser);

            expect(results).toHaveLength(2);
            expect(results[0].RecordID).toBe('1');
            expect(results[0].Score).toBeCloseTo(1);
            expect(results[1].Score).toBeCloseTo(0.5);

            // Inspect the search request URL
            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toContain('/collections/docs/documents/search');
            expect(url).toContain('q=hello');
            expect(url).toContain('query_by=content%2Ctitle');
            const headers = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
            expect(headers['X-TYPESENSE-API-KEY']).toBe('fake-key');
        });

        it('uses scope ExternalIndexes when present and merges results across collections', async () => {
            mockFetch.mockResolvedValueOnce(healthOk());
            mockFetch.mockResolvedValueOnce(tsResponse([{ id: 'a', text_match: 800 }]));
            mockFetch.mockResolvedValueOnce(tsResponse([{ id: 'b', text_match: 1200 }]));

            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    { IndexType: 'Typesense', ExternalIndexName: 'tickets' },
                    { IndexType: 'Typesense', ExternalIndexName: 'kb' },
                    { IndexType: 'Vector', VectorIndexID: 'ignored' },
                ],
            } as ScopeConstraints;

            const results = await p.Search('q', 10, undefined, fakeUser, scope);

            // Two parallel searches (skipping the ignored Vector row)
            const calls = mockFetch.mock.calls.slice(1).map(c => c[0] as string);
            expect(calls.some(u => u.includes('/collections/tickets/'))).toBe(true);
            expect(calls.some(u => u.includes('/collections/kb/'))).toBe(true);

            // Merged results sorted by text_match desc — kb's 1200 > tickets' 800
            expect(results[0].RecordID).toBe('b');
            expect(results[1].RecordID).toBe('a');
        });

        it('attaches scope MetadataFilter as filter_by query param (push-down)', async () => {
            mockFetch.mockResolvedValueOnce(healthOk());
            mockFetch.mockResolvedValueOnce(tsResponse([{ id: '1', text_match: 100 }]));

            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    {
                        IndexType: 'Typesense',
                        ExternalIndexName: 'docs',
                        MetadataFilter: 'tenant_id:=tenant-a',
                    },
                ],
            } as ScopeConstraints;
            await p.Search('q', 10, undefined, fakeUser, scope);

            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toContain('filter_by=tenant_id%3A%3Dtenant-a');
        });

        it('honors per-provider QueryTransforms[fulltext]', async () => {
            mockFetch.mockResolvedValueOnce(healthOk());
            mockFetch.mockResolvedValueOnce(tsResponse([{ id: '1', text_match: 100 }]));

            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope = { QueryTransforms: { fulltext: 'rewritten' } } as ScopeConstraints;
            await p.Search('original', 5, undefined, fakeUser, scope);

            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toContain('q=rewritten');
        });

        it('returns empty when neither scope nor providerConfig supplies a collection', async () => {
            mockFetch.mockResolvedValueOnce(healthOk());

            const p = new TypesenseSearchProvider();
            await p.Initialize({
                ...basicConfig(),
                ProviderConfig: { nodeUrl: 'https://ts.example', apiKey: 'k' },
            }, fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
            // Only the health check fired
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('returns empty + logs on Typesense non-2xx (does not throw)', async () => {
            mockFetch.mockResolvedValueOnce(healthOk());
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
                text: async () => 'kaput',
                json: async () => ({}),
            } as unknown as Response);

            const p = new TypesenseSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });
});
