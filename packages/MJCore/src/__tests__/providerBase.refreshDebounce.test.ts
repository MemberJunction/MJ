/**
 * Tests for ProviderBase.CheckToSeeIfRefreshNeeded() debounce logic.
 *
 * Verifies that MinRefreshCheckIntervalMs prevents redundant network calls
 * when CheckToSeeIfRefreshNeeded / RefreshIfNeeded are called in quick
 * succession (e.g., multiple engines during startup), that only a check whose
 * status request succeeded arms that throttle, and that a caller arriving
 * while a check is in flight gets `false` without a request of its own.
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

        // The first call starts the check; the other four arrive while it is in flight and are
        // told no refresh is needed (the owner acts on the answer). The throttle cannot do this —
        // it is armed only after a check's status request succeeds.
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
        expect(results.slice(1)).toEqual([false, false, false, false]);
    });

    it('should not arm the throttle when the status request throws (#4887)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;
        refreshTimestampsSpy.mockRejectedValueOnce(new Error('network down') as never);

        await expect(provider.CheckToSeeIfRefreshNeeded()).rejects.toThrow('network down');
        // A retry inside the interval must actually check — a failed check proved nothing.
        await provider.CheckToSeeIfRefreshNeeded();

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(2);
    });

    it('should not arm the throttle when the status request returns false (#4887)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;
        refreshTimestampsSpy.mockResolvedValue(false as never);

        await provider.CheckToSeeIfRefreshNeeded();
        await provider.CheckToSeeIfRefreshNeeded();

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(2);
    });

    it('should answer false to callers arriving while a check is in flight (#4887)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;
        refreshTimestampsSpy.mockImplementation(
            (() => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 20))) as never
        );
        // Make the owner's real answer "obsolete" (true), so the assertions below prove the other
        // callers are not handed it — a shared true would send each into its own full reload.
        vi.spyOn(provider, 'LocalMetadataObsolete').mockReturnValue(true);
        const [first, ...rest] = await Promise.all([1, 2, 3, 4, 5].map(() => provider.CheckToSeeIfRefreshNeeded()));

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
        expect(first).toBe(true);
        expect(rest).toEqual([false, false, false, false]);
    });

    it('should answer false, not the rejection, to a caller arriving while a check that rejects is in flight (#4887)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;
        refreshTimestampsSpy.mockImplementationOnce(
            (() => new Promise<boolean>((_resolve, reject) => setTimeout(() => reject(new Error('network down')), 20))) as never
        );

        const owner = provider.CheckToSeeIfRefreshNeeded();
        const concurrent = provider.CheckToSeeIfRefreshNeeded();

        await expect(owner).rejects.toThrow('network down');
        await expect(concurrent).resolves.toBe(false);
        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(1);
    });

    it('should run its own check for a bypassMinCheckInterval caller during an in-flight check (#4887)', async () => {
        ProviderBase.MinRefreshCheckIntervalMs = 5000;
        refreshTimestampsSpy.mockImplementation(
            (() => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 20))) as never
        );

        await Promise.all([
            provider.CheckToSeeIfRefreshNeeded(),
            provider.CheckToSeeIfRefreshNeeded(undefined, true),
        ]);

        expect(refreshTimestampsSpy).toHaveBeenCalledTimes(2);
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
