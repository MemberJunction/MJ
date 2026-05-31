/**
 * Tests for AzureAISearchProvider (P5.3). Mocks fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });

import { AzureAISearchProvider } from '../providers/AzureAISearchProvider';
import type { UserInfo } from '@memberjunction/core';
import type { ScopeConstraints } from '../generic/search.types';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function configByServiceName() {
    return {
        Name: 'TestAzureSearch',
        ProviderConfig: {
            serviceName: 'mysearch',
            apiKey: 'fake-key',
            apiVersion: '2024-07-01',
            defaultIndex: 'docs',
        },
        CredentialID: null,
        MaxResultsOverride: null,
        SupportsPreview: false,
        Priority: 100,
    };
}

function searchResponse(value: Array<Record<string, unknown>>): Response {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
        json: async () => ({ value }),
    } as unknown as Response;
}

function probeResponse(status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'probe',
        text: async () => '',
        json: async () => ({}),
    } as unknown as Response;
}

describe('AzureAISearchProvider', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('lifecycle', () => {
        it('IsAvailable true when probe returns 200', async () => {
            mockFetch.mockResolvedValue(probeResponse(200));
            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
        });

        it('IsAvailable true when probe returns 401 (host reachable, key wrong is still operationally up)', async () => {
            mockFetch.mockResolvedValue(probeResponse(401));
            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(true);
        });

        it('IsAvailable false when probe throws', async () => {
            mockFetch.mockRejectedValue(new Error('DNS failure'));
            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            expect(p.IsAvailable()).toBe(false);
        });

        it('Resolves endpoint from serviceName when no endpoint URL is supplied', async () => {
            mockFetch.mockResolvedValue(probeResponse(200));
            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toMatch(/^https:\/\/mysearch\.search\.windows\.net\/\?api-version=2024-07-01$/);
        });

        it('Honors a full endpoint URL when supplied', async () => {
            mockFetch.mockResolvedValue(probeResponse(200));
            const p = new AzureAISearchProvider();
            await p.Initialize({
                ...configByServiceName(),
                ProviderConfig: { endpoint: 'https://custom.search.windows.net/', apiKey: 'k' },
            }, fakeUser);
            await p.CheckAvailability(fakeUser);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toMatch(/^https:\/\/custom\.search\.windows\.net\//);
        });
    });

    describe('Search', () => {
        it('queries the default index when no scope ExternalIndexes', async () => {
            mockFetch
                .mockResolvedValueOnce(probeResponse(200))
                .mockResolvedValueOnce(searchResponse([
                    { id: '1', title: 'High', content: 'lorem', '@search.score': 9.0 },
                    { id: '2', title: 'Mid',  content: 'ipsum', '@search.score': 4.5 },
                ]));

            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('hello', 10, undefined, fakeUser);

            const url = mockFetch.mock.calls[1][0] as string;
            expect(url).toContain('/indexes/docs/docs/search?api-version=2024-07-01');
            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.search).toBe('hello');
            expect(body.top).toBe(10);
            expect(results).toHaveLength(2);
            expect(results[0].RecordID).toBe('1');
            expect(results[0].Score).toBeCloseTo(1);
            expect(results[1].Score).toBeCloseTo(0.5);
        });

        it('uses scope ExternalIndexes when present and merges results across indexes', async () => {
            mockFetch
                .mockResolvedValueOnce(probeResponse(200))
                .mockResolvedValueOnce(searchResponse([{ id: 'a', '@search.score': 6.0 }]))
                .mockResolvedValueOnce(searchResponse([{ id: 'b', '@search.score': 9.0 }]));

            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    { IndexType: 'AzureAISearch', ExternalIndexName: 'tickets' },
                    { IndexType: 'AzureAISearch', ExternalIndexName: 'kb' },
                    { IndexType: 'Vector', VectorIndexID: 'ignored' },
                ],
            } as ScopeConstraints;
            const results = await p.Search('q', 10, undefined, fakeUser, scope);

            const calls = mockFetch.mock.calls.slice(1).map(c => c[0] as string);
            expect(calls.some(u => u.includes('/indexes/tickets/'))).toBe(true);
            expect(calls.some(u => u.includes('/indexes/kb/'))).toBe(true);
            expect(results[0].RecordID).toBe('b');
            expect(results[1].RecordID).toBe('a');
        });

        it('attaches scope MetadataFilter as the OData $filter (push-down)', async () => {
            mockFetch
                .mockResolvedValueOnce(probeResponse(200))
                .mockResolvedValueOnce(searchResponse([{ id: '1', '@search.score': 1 }]));

            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);

            const scope: ScopeConstraints = {
                ExternalIndexes: [
                    {
                        IndexType: 'AzureAISearch',
                        ExternalIndexName: 'docs',
                        MetadataFilter: "tenantId eq 'tenant-a'",
                    },
                ],
            } as ScopeConstraints;
            await p.Search('q', 10, undefined, fakeUser, scope);

            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.filter).toBe("tenantId eq 'tenant-a'");
        });

        it('honors per-provider QueryTransforms[fulltext]', async () => {
            mockFetch
                .mockResolvedValueOnce(probeResponse(200))
                .mockResolvedValueOnce(searchResponse([{ id: '1', '@search.score': 1 }]));

            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);

            await p.Search('original', 5, undefined, fakeUser, {
                QueryTransforms: { fulltext: 'rewritten' },
            } as ScopeConstraints);
            const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
            expect(body.search).toBe('rewritten');
        });

        it('returns empty + logs on non-2xx (does not throw)', async () => {
            mockFetch
                .mockResolvedValueOnce(probeResponse(200))
                .mockResolvedValueOnce({
                    ok: false,
                    status: 503,
                    statusText: 'Service Unavailable',
                    text: async () => 'kaput',
                    json: async () => ({}),
                } as unknown as Response);

            const p = new AzureAISearchProvider();
            await p.Initialize(configByServiceName(), fakeUser);
            await p.CheckAvailability(fakeUser);
            const results = await p.Search('q', 10, undefined, fakeUser);
            expect(results).toEqual([]);
        });
    });
});
