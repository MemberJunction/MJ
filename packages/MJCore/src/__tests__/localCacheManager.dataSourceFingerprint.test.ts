import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { IsMaterializedDataSource } from '../views/runView';
import type { RunViewParams } from '../views/runView';

/**
 * Regression coverage for the DataSource cache cross-serve bug (Query & Entity Materialization review).
 *
 * RunViewParams.DataSource:'Materialized' routes the read to the entity's materialized snapshot view
 * (a DIFFERENT physical source than the default live base view). Without a `ds:` segment in the cache
 * fingerprint, a Live read and a Materialized read of the same entity/filter/orderBy collide on one slot
 * and one is silently served the other's source. The fingerprint now appends `ds:materialized` when —
 * and only when — DataSource is 'Materialized', so every existing (Live/default) fingerprint stays
 * byte-for-byte identical (no cache invalidation).
 */
describe('GenerateRunViewFingerprint — DataSource participation', () => {
    const cache = LocalCacheManager.Instance;
    const base = { EntityName: 'MJ: Entities' } as unknown as RunViewParams;

    it('a default (live) read has NO ds: segment — pre-existing fingerprint unchanged', () => {
        const fp = cache.GenerateRunViewFingerprint(base);
        expect(fp).not.toContain('ds:');
    });

    it("DataSource:'Live' leaves the fingerprint identical to the unset (live) case", () => {
        const live = cache.GenerateRunViewFingerprint(base);
        const explicitLive = cache.GenerateRunViewFingerprint({ ...base, DataSource: 'Live' } as RunViewParams);
        expect(explicitLive).toBe(live);
        expect(explicitLive).not.toContain('ds:');
    });

    it("a Materialized read does NOT collide with the otherwise-identical Live read", () => {
        const live = cache.GenerateRunViewFingerprint(base);
        const materialized = cache.GenerateRunViewFingerprint({ ...base, DataSource: 'Materialized' } as RunViewParams);
        expect(materialized).not.toBe(live);
        expect(materialized).toContain('ds:materialized');
    });

    it('the same Materialized request produces a stable fingerprint (self-consistent → still cacheable)', () => {
        const p = { ...base, DataSource: 'Materialized' } as RunViewParams;
        expect(cache.GenerateRunViewFingerprint(p)).toBe(cache.GenerateRunViewFingerprint(p));
    });

    it("a mis-cased/whitespaced 'Materialized' still gets the ds:materialized segment (case-insensitive)", () => {
        // DataSource crosses a GraphQL String boundary, so a client can send 'materialized'/'MATERIALIZED '/etc.
        // These MUST be treated as materialized at every decision point (fingerprint here, read routing, cache
        // gate) — otherwise a mis-cased request routes to the snapshot but caches as Live (silent staleness).
        for (const v of ['materialized', 'MATERIALIZED', 'Materialized ', ' materialized']) {
            const fp = cache.GenerateRunViewFingerprint({ ...base, DataSource: v } as unknown as RunViewParams);
            expect(fp).toContain('ds:materialized');
        }
    });
});

describe('IsMaterializedDataSource', () => {
    it('matches Materialized case-insensitively and trimmed', () => {
        for (const v of ['Materialized', 'materialized', 'MATERIALIZED', ' Materialized ', 'materialized\t']) {
            expect(IsMaterializedDataSource(v)).toBe(true);
        }
    });
    it('treats Live / unknown / empty / nullish as NOT materialized (safe default)', () => {
        for (const v of ['Live', 'live', 'Materializd', 'snapshot', '', undefined, null]) {
            expect(IsMaterializedDataSource(v as string | null | undefined)).toBe(false);
        }
    });
});
