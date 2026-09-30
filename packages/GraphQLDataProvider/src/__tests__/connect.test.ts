import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AllMetadata, EntityInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '../graphQLDataProvider';
import { ConnectGraphQLClient } from '../config';
import { ResetGraphQLProviderSingleton } from './support/wireTestHarness';

// Exercises the REAL GraphQLDataProvider (no module mocks): Connect must authenticate and
// register the provider without touching metadata, and must not break a later full boot.

function makeConfig(url = 'http://localhost:4000/'): GraphQLProviderConfigData {
    return new GraphQLProviderConfigData('test-token', url, 'ws://localhost:4000/');
}

describe('ConnectGraphQLClient (real provider)', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetGraphQLProviderSingleton();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
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
});
