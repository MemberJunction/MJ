import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AllMetadata, EntityInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '../graphQLDataProvider';
import { ConnectGraphQLClient } from '../config';
import { ResetGraphQLProviderSingleton } from './support/wireTestHarness';

// Exercises the REAL GraphQLDataProvider (no module mocks): Connect must authenticate and
// register the provider without touching metadata, and must not break a later full boot.

function makeConfig(url = 'http://localhost:4000/', token = 'test-token'): GraphQLProviderConfigData {
    return new GraphQLProviderConfigData(token, url, 'ws://localhost:4000/');
}

/** A GraphQL success response for the fetch the client makes. */
function okResponse(): Response {
    return new Response(JSON.stringify({ data: { Ok: true } }), { headers: { 'content-type': 'application/json' } });
}

/** The Authorization header of the request the client sent in fetch call `n`. */
function authorizationOfCall(fetchSpy: ReturnType<typeof vi.spyOn>, n: number): string | null {
    const init = fetchSpy.mock.calls[n][1] as RequestInit;
    return new Headers(init.headers).get('authorization');
}

describe('ConnectGraphQLClient (real provider)', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetGraphQLProviderSingleton();
        // Fails any request a test did not stub, so a regression cannot reach the network.
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        ResetGraphQLProviderSingleton();
    });

    it('stores the config on the singleton, loads no metadata and makes no request', async () => {
        const cfg = makeConfig();
        const provider = await ConnectGraphQLClient(cfg);

        expect(provider).toBe(GraphQLDataProvider.Instance);
        expect(GraphQLDataProvider.Instance.ConfigData).toBe(cfg);
        expect(provider.Entities.length).toBe(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when the provider already has metadata loaded', async () => {
        const first = makeConfig('http://first/');
        const provider = await ConnectGraphQLClient(first);
        vi.spyOn(provider, 'Entities', 'get').mockReturnValue([{ Name: 'Stub' } as EntityInfo]);
        const connectSpy = vi.spyOn(provider, 'Connect');

        const again = await ConnectGraphQLClient(makeConfig('http://second/'));

        expect(again).toBe(provider);
        expect(connectSpy).not.toHaveBeenCalled();
        expect(provider.ConfigData).toBe(first);
    });

    it('leaves the instance able to run the FULL metadata boot afterwards', async () => {
        const cfg = makeConfig();
        const provider = await ConnectGraphQLClient(cfg);

        // The instance is now Metadata.Provider; CopyMetadataFromGlobalProvider excludes `this`,
        // so Config must fall through to the real load rather than short-circuit on itself.
        const getAllMetadata = vi.spyOn(provider as never, 'GetAllMetadata' as never)
            .mockResolvedValue(new AllMetadata() as never);
        vi.spyOn(provider as never, 'CheckToSeeIfRefreshNeeded' as never).mockResolvedValue(true as never);
        vi.spyOn(provider as never, 'RefreshRemoteMetadataTimestamps' as never).mockResolvedValue(true as never);
        vi.spyOn(provider as never, 'SaveLocalMetadataToStorage' as never).mockResolvedValue(undefined as never);
        vi.spyOn(provider as never, 'LoadLocalMetadataFromStorage' as never).mockResolvedValue(undefined as never);

        await provider.Config(cfg);

        expect(getAllMetadata).toHaveBeenCalledTimes(1);
    });

    it('rebuilds the client when a later connect brings different credentials (#4887)', async () => {
        // An anonymous embed connects, then the user logs in on the same provider: requests must
        // carry the new token, not the one the first client was built with.
        const provider = await ConnectGraphQLClient(makeConfig(undefined, 'anon-token'));
        await provider.Connect(makeConfig(undefined, 'user-token'));
        fetchSpy.mockResolvedValueOnce(okResponse());

        await provider.ExecuteGQL('query { Ok }', null);

        expect(authorizationOfCall(fetchSpy, 0)).toBe('Bearer user-token');
    });

    it('keeps the client and session id when a later connect brings the same credentials', async () => {
        const provider = await ConnectGraphQLClient(makeConfig());
        const client = (provider as never)['_client'];
        const sessionId = provider.sessionId;

        await provider.Connect(makeConfig());

        expect((provider as never)['_client']).toBe(client);
        expect(provider.sessionId).toBe(sessionId);
    });

    it('keeps the session id when it rebuilds the client', async () => {
        const provider = await ConnectGraphQLClient(makeConfig(undefined, 'anon-token'));
        const sessionId = provider.sessionId;

        await provider.Connect(makeConfig(undefined, 'user-token'));

        expect(provider.sessionId).toBe(sessionId);
    });
});
