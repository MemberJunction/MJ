import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalCacheManager } from '@memberjunction/core';
import { bootstrapIntegrationServer, bootstrapIntegrationClient } from '../bootstrap';

/**
 * Proves the D1 anti-corruption guard WITHOUT a DB: when LocalCacheManager is
 * already initialized (i.e. we are mis-hosted in a process whose provider claimed
 * the cache first), the owning bootstraps refuse to run — before any connection or
 * config read — rather than silently no-op the instrumentation.
 */
describe('integration bootstrap ownership guard', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('bootstrapIntegrationServer throws when the cache is already initialized', async () => {
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        await expect(bootstrapIntegrationServer()).rejects.toThrow(/must own its process/);
    });

    it('bootstrapIntegrationClient throws when the cache is already initialized', async () => {
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        await expect(bootstrapIntegrationClient()).rejects.toThrow(/must own its process/);
    });
});
