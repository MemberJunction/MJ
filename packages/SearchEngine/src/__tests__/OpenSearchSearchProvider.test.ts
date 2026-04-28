/**
 * Tests for OpenSearchSearchProvider (P5.4). Mocks fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });

import { OpenSearchSearchProvider } from '../providers/OpenSearchSearchProvider';
import type { UserInfo } from '@memberjunction/core';
import type { ScopeConstraints } from '../generic/search.types';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function basicConfig() {
    return {
        Name: 'TestOpenSearch',
        ProviderConfig: {
            node: 'https://os.example:9200',
            username: 'admin',
            password: 'admin',
            defaultIndex: 'docs',
            defaultField: 'content',
        },
        CredentialID: null,
        MaxResultsOverride: null,
        SupportsPreview: false,
        Priority: 100,
    };
}

function probeOk(): Response {
    return { ok: true, status: 200, statusText: 'OK', text: async () => '', json: async () => ({}) } as unknown as Response;
}

function searchResponse(hits: Array<{ _id: string; _score: number; _index?: string; _source?: Record<string, unknown> }>): Response {
    return {
        ok: true, status: 200, statusText: 'OK', text: async () => '',
        json: async () => ({
            hits: { hits: hits.map(h => ({ _id: h._id, _score: h._score, _index: h._index ?? 'docs', _source: h._source })) },
        }),
    } as unknown as Response;
}

describe('OpenSearchSearchProvider', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('lifecycle', () => {
        it('IsAvailable true after probe 200', async () => {
            mockFetch.mockResolvedValue(probeOk());
            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
        });

        it('IsAvailable true on 401 (host reachable, auth wrong is still operationally up)', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauth', text: async () => '', json: async () => ({}) } as unknown as Response);
            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
        });

        it('IsAvailable false when probe throws', async () => {
            mockFetch.mockRejectedValue(new Error('connection refused'));
            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(false);
        });

        it('Initialize tolerates an empty ProviderConfig', async () => {
            const p = new OpenSearchSearchProvider();
            await p.Initialize({ ...basicConfig(), ProviderConfig: null }, fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });

    describe('Search', () => {
        it('queries the default index when no scope ExternalIndexes', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([
                { _id: '1', _score: 8.0, _source: { title: 'High', content: 'lorem' } },
                { _id: '2', _score: 4.0, _source: { title: 'Mid', content: 'ipsum' } },
            ]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('hello', 10, undefined, fakeUser);

            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toBe('https://os.example:9200/docs/_search');
            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.size).toBe(10);
            expect(body.query.bool.must[0].match.content).toBe('hello');
            expect(results).toHaveLength(2);
            expect(results[0].Score).toBeCloseTo(1);
            expect(results[1].Score).toBeCloseTo(0.5);
        });

        it('uses scope ExternalIndexes when present (comma-separated url path)', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([
                { _id: '1', _score: 5.0, _index: 'tickets', _source: { content: 'a' } },
            ]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    { IndexType: 'OpenSearch', ExternalIndexName: 'tickets' },
                    { IndexType: 'OpenSearch', ExternalIndexName: 'kb' },
                    { IndexType: 'Vector', VectorIndexID: 'ignored' },
                ],
            } as ScopeConstraints;
            await p.Search('q', 10, undefined, fakeUser, scope);

            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toBe('https://os.example:9200/tickets,kb/_search');
        });

        it('composes scope MetadataFilter into bool.filter (push-down)', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([{ _id: '1', _score: 1, _source: {} }]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    { IndexType: 'OpenSearch', ExternalIndexName: 'docs', MetadataFilter: { term: { tenant_id: 'tenant-a' } } },
                ],
            } as ScopeConstraints;
            await p.Search('q', 10, undefined, fakeUser, scope);

            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.query.bool.filter).toEqual([{ term: { tenant_id: 'tenant-a' } }]);
        });

        it('honors per-provider QueryTransforms[fulltext]', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([{ _id: '1', _score: 1, _source: {} }]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            await p.Search('original', 5, undefined, fakeUser, {
                QueryTransforms: { fulltext: 'rewritten' },
            } as ScopeConstraints);
            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.query.bool.must[0].match.content).toBe('rewritten');
        });

        it('uses Basic auth header when username + password configured', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([{ _id: '1', _score: 1, _source: {} }]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            await p.Search('q', 5, undefined, fakeUser);

            const headers = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
            const expected = `Basic ${Buffer.from('admin:admin').toString('base64')}`;
            expect(headers['Authorization']).toBe(expected);
        });

        it('uses awsAuthHeader pre-signed Authorization when configured', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce(searchResponse([{ _id: '1', _score: 1, _source: {} }]));

            const p = new OpenSearchSearchProvider();
            await p.Initialize({
                ...basicConfig(),
                ProviderConfig: { node: 'https://os.example', defaultIndex: 'docs', awsAuthHeader: 'AWS4-HMAC-SHA256 ...' },
            }, fakeUser);
            await p.CheckAvailability(fakeUser);
            await p.Search('q', 5, undefined, fakeUser);

            const headers = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
            expect(headers['Authorization']).toBe('AWS4-HMAC-SHA256 ...');
        });

        it('returns empty + logs on non-2xx (does not throw)', async () => {
            mockFetch.mockResolvedValueOnce(probeOk()).mockResolvedValueOnce({
                ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom', json: async () => ({}),
            } as unknown as Response);

            const p = new OpenSearchSearchProvider();
            await p.Initialize(basicConfig(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });
});
