/**
 * Tests for ProviderBase.Config() when the metadata download fails (#4887).
 *
 * The status request can succeed (arming the refresh-check throttle) while the metadata download
 * that follows returns nothing. A retry must really reload instead of hitting the throttle, reading
 * "current" and loading nothing again for the whole throttle window.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { ProviderBase } from '../generic/providerBase';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

describe('ProviderBase Config after a failed metadata download', () => {
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);
    const originalInterval = ProviderBase.MinRefreshCheckIntervalMs;
    let provider: TestMetadataProvider;
    let refreshTimestamps: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ProviderBase.MinRefreshCheckIntervalMs = 30000;
        provider = new TestMetadataProvider();
        provider.setMockDelay(1);
        // The status request succeeds, so each real check arms the throttle.
        refreshTimestamps = vi.spyOn(provider as never, 'RefreshRemoteMetadataTimestamps' as never)
            .mockResolvedValue(true as never);
    });

    afterEach(() => {
        ProviderBase.MinRefreshCheckIntervalMs = originalInterval;
        vi.restoreAllMocks();
    });

    it('reloads on an immediate retry instead of being throttled', async () => {
        const getAllMetadata = vi.spyOn(provider as never, 'GetAllMetadata' as never);
        getAllMetadata.mockResolvedValueOnce(undefined as never);

        await provider.Config(testConfig);
        expect(provider.Entities.length).toBe(0);

        await provider.Config(testConfig);

        expect(getAllMetadata).toHaveBeenCalledTimes(2);
        expect(provider.Entities.length).toBeGreaterThan(0);
    });

    it('still throttles a repeat Config once the graph is loaded', async () => {
        await provider.Config(testConfig);
        await provider.Config(testConfig);

        expect(refreshTimestamps).toHaveBeenCalledTimes(1);
    });

    it('records why the download failed, and clears it once a load succeeds', async () => {
        const cause = new Error('User a@b.com does not have read permissions on MJ: User Roles');
        vi.spyOn(provider as never, 'GetCurrentUser' as never).mockRejectedValueOnce(cause as never);

        await provider.Config(testConfig);
        expect(provider.Entities.length).toBe(0);
        expect(provider.LastMetadataLoadError).toBe(cause);

        await provider.Config(testConfig);
        expect(provider.Entities.length).toBeGreaterThan(0);
        expect(provider.LastMetadataLoadError).toBeNull();
    });

    it('records a failed dataset read', async () => {
        vi.spyOn(provider, 'GetDatasetByName').mockResolvedValueOnce({
            DatasetID: '', DatasetName: 'MJ_Metadata', Success: false, Status: 'Access denied',
            LatestUpdateDate: new Date(), Results: []
        });

        await provider.Config(testConfig);

        expect(provider.LastMetadataLoadError?.message).toContain('Access denied');
    });
});
