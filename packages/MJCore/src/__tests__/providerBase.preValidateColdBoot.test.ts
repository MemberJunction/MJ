/**
 * Tests for ProviderBase.preValidateAndRefresh() right after a cold boot (#4887).
 *
 * A cold boot's Config() loads the metadata graph from the server, and GetAllMetadata fetches
 * the current user with it. preValidateAndRefresh() runs next; it must not re-fetch that same
 * user (a serialized duplicate round-trip). The skip is one-shot and belongs to Config's load: a
 * provider that did NOT just load in Config (warm/fast-start from a local cache, or a snapshot
 * adopted by a background refresh) must still perform its check.
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

    it('skips only once: a second preValidate after the cold boot checks again', async () => {
        const provider = new TestMetadataProvider();
        provider.setMockDelay(5);
        await provider.Config(testConfig);
        const checkSpy = vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded');

        await provider.preValidateAndRefresh();
        expect(checkSpy).not.toHaveBeenCalled();

        await provider.preValidateAndRefresh();
        expect(checkSpy).toHaveBeenCalledTimes(1);
    });

    it('does not skip after a background-refresh adoption', async () => {
        // Only Config's own server load proves the snapshot and the current user were just fetched
        // for this boot; a background refresh adopting a snapshot is not a reason to skip.
        const provider = new TestMetadataProvider();
        provider.setMockDelay(5);
        vi.spyOn(provider as never, 'RefreshRemoteMetadataTimestamps' as never).mockResolvedValue(true as never);
        vi.spyOn(provider, 'LocalMetadataObsolete').mockReturnValue(true);
        await provider.backgroundValidateAndRefresh();
        expect(provider.Entities.length).toBeGreaterThan(0);
        const checkSpy = vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded');

        await provider.preValidateAndRefresh();

        expect(checkSpy).toHaveBeenCalledTimes(1);
    });

    it('does not skip after a later Config that loaded nothing', async () => {
        const provider = new TestMetadataProvider();
        provider.setMockDelay(5);
        await provider.Config(testConfig);
        // A second Config inside the throttle window loads nothing; the flag from the first must not
        // make the pre-validation that follows it skip.
        await provider.Config(testConfig);
        const checkSpy = vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded');

        await provider.preValidateAndRefresh();

        expect(checkSpy).toHaveBeenCalledTimes(1);
    });
});
