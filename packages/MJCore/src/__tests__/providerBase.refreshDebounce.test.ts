/**
 * Tests for ProviderBase.CheckToSeeIfRefreshNeeded() debounce logic.
 *
 * Verifies that MinRefreshCheckIntervalMs prevents redundant network calls
 * when CheckToSeeIfRefreshNeeded / RefreshIfNeeded are called in quick
 * succession (e.g., multiple engines during startup).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { ProviderBase } from '../generic/providerBase';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

describe('ProviderBase Refresh Check Debounce', () => {
    let provider: TestMetadataProvider;
    let refreshTimestampsSpy: ReturnType<typeof vi.spyOn>;
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);
    const originalInterval = ProviderBase.MinRefreshCheckIntervalMs;

    beforeEach(async () => {
        provider = new TestMetadataProvider();
        provider.setMockDelay(10);
        await provider.Config(testConfig);

        // Spy on the network call that CheckToSeeIfRefreshNeeded triggers
        refreshTimestampsSpy = vi.spyOn(
            provider as never,
            'RefreshRemoteMetadataTimestamps' as never
        ).mockResolvedValue(true as never);

        // Reset the debounce timestamp so first call always goes through
        (provider as never)['_lastRefreshCheckAt'] = 0;
    });

    afterEach(() => {
        ProviderBase.MinRefreshCheckIntervalMs = originalInterval;
        vi.restoreAllMocks();
    });

    it('should allow the first call to CheckToSeeIfRefreshNeeded', async () => {
        await provider.CheckToSeeIfRefreshNeeded();

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
    });

    it('should skip a second call within the debounce interval', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;

        await provider.CheckToSeeIfRefreshNeeded();
        const result = await provider.CheckToSeeIfRefreshNeeded();

        // Second call should return false (skipped)
        expect(result).toBe(false);
        // Network call should only have happened once
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow a call after the debounce interval expires', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 50; // Short for testing

        await provider.CheckToSeeIfRefreshNeeded();
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);

        // Wait for debounce to expire
        await new Promise(resolve => setTimeout(resolve, 100));

        await provider.CheckToSeeIfRefreshNeeded();
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(2);
    });

    it('should debounce across multiple rapid calls', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;

        // Simulate 5 rapid calls (like 5 engines starting up)
        const results = await Promise.all([
            provider.CheckToSeeIfRefreshNeeded(),
            provider.CheckToSeeIfRefreshNeeded(),
            provider.CheckToSeeIfRefreshNeeded(),
            provider.CheckToSeeIfRefreshNeeded(),
            provider.CheckToSeeIfRefreshNeeded(),
        ]);

        // First call goes through, rest are debounced
        // Note: since CheckToSeeIfRefreshNeeded is async and the first call
        // sets the timestamp before the network call resolves, all concurrent
        // calls after the first will be debounced
        expect(refreshTimestampsSpy.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('should work with debounce disabled (interval = 0)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 0;

        await provider.CheckToSeeIfRefreshNeeded();
        await provider.CheckToSeeIfRefreshNeeded();

        // Both calls should go through when debounce is disabled
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(2);
    });

    it('should not affect forced Refresh() calls', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;

        // First check sets the debounce timestamp
        await provider.CheckToSeeIfRefreshNeeded();
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);

        // Forced Refresh() bypasses CheckToSeeIfRefreshNeeded via _refresh flag
        // It calls Config() which checks: if (this._refresh || await this.CheckToSeeIfRefreshNeeded())
        // Since _refresh is true, CheckToSeeIfRefreshNeeded is short-circuited by JS's ||
        await provider.Refresh();

        // Refresh should have worked (it calls GetAllMetadata, not RefreshRemoteMetadataTimestamps)
        expect(provider.Entities.length).toBeGreaterThan(0);
    });

    it('should return false when AllowRefresh is false', async () => {
        provider.setAllowRefresh(false);

        const result = await provider.CheckToSeeIfRefreshNeeded();

        expect(result).toBe(false);
        expect(refreshTimestampsSpy).not.toHaveBeenCalled();
    });
});
