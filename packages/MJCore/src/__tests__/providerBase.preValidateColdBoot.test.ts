/**
 * Tests for ProviderBase.preValidateAndRefresh() right after a cold boot (#4887).
 *
 * A cold boot's Config() loads the metadata graph from the server, and GetAllMetadata fetches
 * the current user with it. preValidateAndRefresh() runs next; it must not re-fetch that same
 * user (a serialized duplicate round-trip). A provider that did NOT just adopt server metadata
 * (warm/fast-start from a local cache) must still perform its check.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

describe('ProviderBase preValidateAndRefresh after a cold boot', () => {
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not re-fetch the current user that Config just loaded', async () => {
        const provider = new TestMetadataProvider();
        provider.setMockDelay(5);
        const getCurrentUserSpy = vi.spyOn(provider as never, 'GetCurrentUser' as never);

        await provider.Config(testConfig);
        await provider.preValidateAndRefresh();

        expect(getCurrentUserSpy).toHaveBeenCalledTimes(1);
        expect(provider.Entities.length).toBeGreaterThan(0);
    });

    it('still checks when the provider has not just adopted server metadata', async () => {
        // TestMetadataProvider's LocalStorageProvider is not persistent, so a warm cache cannot be
        // seeded across instances; a provider that never loaded from the server stands in for the
        // fast-start path (Config returned from the local cache without adopting a snapshot).
        const provider = new TestMetadataProvider();
        provider.setMockDelay(5);
        const refreshTimestampsSpy = vi.spyOn(
            provider as never,
            'RefreshRemoteMetadataTimestamps' as never
        ).mockResolvedValue(true as never);

        await provider.preValidateAndRefresh();

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
    });
});
