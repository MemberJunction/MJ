/**
 * Tests for TTL-based caching of external-data-source RunView results in
 * LocalCacheManager.
 *
 * Background: external-data-source entities are read-only proxies whose data
 * changes on a REMOTE system. They never emit BaseEntity save/delete events, so
 * the cache's event-driven invalidation never fires for them — exactly the
 * hazard the codebase already hard-exempts "MJ: Record Changes" for. Caching
 * them without a TTL would serve stale data forever.
 *
 * The fix (this PR):
 *   - SetRunViewResult accepts an optional ttlMs; when set, the registry entry
 *     gets an expiresAt and GetRunViewResult treats expired entries as misses.
 *   - SetRunViewResult refuses to write an external entity (EntityInfo with
 *     ExternalDataSourceID) without a ttlMs — fail-safe against stale-forever.
 *
 * These tests cover both the new TTL mechanism and the external write guard,
 * and confirm MJ-DB entities are unaffected (no ttl => event-invalidated as before).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

vi.mock('../generic/logging', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    LogStatusVerbose: vi.fn(),
}));

// Minimal EntityInfo-shaped fixtures. AllowCaching=true so the AllowCaching gate
// passes and execution reaches the external-TTL guard / TTL store path.
function makeExternalEntity(name: string): unknown {
    return { Name: name, AllowCaching: true, PrimaryKeys: [{ Name: 'ID' }], ExternalDataSourceID: 'ds-1' };
}
function makeNormalEntity(name: string): unknown {
    return { Name: name, AllowCaching: true, PrimaryKeys: [{ Name: 'ID' }] };
}

function setMetadataProvider(entities: unknown[]): () => void {
    const previous = Metadata.Provider;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
    return () => { Metadata.Provider = previous; };
}

type SetArgs = Parameters<LocalCacheManager['SetRunViewResult']>;
const viewParams = (entityName: string) => ({ EntityName: entityName }) as SetArgs[1];

describe('LocalCacheManager external-data-source TTL caching', () => {
    let cache: LocalCacheManager;
    let storage: MockCacheStorageProvider;
    let restoreMetadata: () => void = () => {};

    beforeEach(async () => {
        resetLocalCacheManager();
        cache = LocalCacheManager.Instance;
        storage = new MockCacheStorageProvider();
        await cache.Initialize(storage);
    });

    afterEach(() => {
        restoreMetadata();
        vi.useRealTimers();
    });

    describe('External write guard (no TTL => no cache)', () => {
        it('refuses to cache an external entity when no ttlMs is provided', async () => {
            restoreMetadata = setMetadataProvider([makeExternalEntity('Snowflake Sales')]);
            storage.resetCallCounts();

            await cache.SetRunViewResult('eds|fp|nottl', viewParams('Snowflake Sales'), [{ ID: '1' }], '2026-01-01T00:00:00Z');

            expect(storage.setCallCount).toBe(0);
            expect(await cache.GetRunViewResult('eds|fp|nottl')).toBeNull();
        });

        it('caches an external entity when a ttlMs IS provided', async () => {
            restoreMetadata = setMetadataProvider([makeExternalEntity('Snowflake Sales')]);
            storage.resetCallCounts();

            await cache.SetRunViewResult('eds|fp|withttl', viewParams('Snowflake Sales'), [{ ID: '1', Amount: 100 }], '2026-01-01T00:00:00Z', undefined, undefined, undefined, 60_000);

            expect(storage.setCallCount).toBe(1);
            const cached = await cache.GetRunViewResult('eds|fp|withttl');
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
        });
    });

    describe('TTL expiry on read', () => {
        it('serves an external entry before expiry and treats it as a miss after', async () => {
            restoreMetadata = setMetadataProvider([makeExternalEntity('Snowflake Sales')]);
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

            await cache.SetRunViewResult('eds|fp|exp', viewParams('Snowflake Sales'), [{ ID: '1' }], '2026-01-01T00:00:00Z', undefined, undefined, undefined, 1_000);

            // Within TTL — hit
            expect(await cache.GetRunViewResult('eds|fp|exp')).not.toBeNull();

            // Past TTL — miss (entry expired)
            vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
            expect(await cache.GetRunViewResult('eds|fp|exp')).toBeNull();
        });

        it('a ttlMs entry survives right up to (but not past) its expiry', async () => {
            restoreMetadata = setMetadataProvider([makeNormalEntity('Products')]);
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

            await cache.SetRunViewResult('p|fp|edge', viewParams('Products'), [{ ID: '1' }], '2026-01-01T00:00:00Z', undefined, undefined, undefined, 5_000);

            vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z')); // exactly at expiry — not strictly greater
            expect(await cache.GetRunViewResult('p|fp|edge')).not.toBeNull();

            vi.setSystemTime(new Date('2026-01-01T00:00:05.001Z')); // 1ms past
            expect(await cache.GetRunViewResult('p|fp|edge')).toBeNull();
        });
    });

    describe('MJ-DB entities are unaffected (no ttl => event-invalidated, never time-expires)', () => {
        it('caches a normal entity without a ttl and serves it (no expiry applied)', async () => {
            restoreMetadata = setMetadataProvider([makeNormalEntity('Products')]);
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

            await cache.SetRunViewResult('p|fp|nottl', viewParams('Products'), [{ ID: '1' }], '2026-01-01T00:00:00Z');

            // Far in the future — a non-TTL entry must NOT expire by time.
            vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
            expect(await cache.GetRunViewResult('p|fp|nottl')).not.toBeNull();
        });
    });
});
