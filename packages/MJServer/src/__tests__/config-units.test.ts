/**
 * Config-contract regression test for the metadata-cache refresh interval units.
 *
 * MJServer's `databaseSettings.metadataCacheRefreshInterval` is configured in
 * MILLISECONDS (default 180000 = 3 minutes; METADATA_CACHE_REFRESH_INTERVAL env
 * override). SQLServerProviderConfigData's third constructor parameter is
 * `checkRefreshIntervalSeconds` — SECONDS. Commit 645c5a5e8 fixed MJServer
 * handing the raw millisecond value across that seam, which turned the intended
 * 3-minute refresh cadence into ~50 hours.
 *
 * Both provider bootstrap call sites in src/index.ts now route through the pure
 * `MetadataCacheRefreshIntervalSeconds` helper (src/providerConfigUnits.ts).
 * This suite pins:
 *   1. the ms→s conversion itself, and
 *   2. the handoff contract — the value stored on a REAL
 *      SQLServerProviderConfigData (deep-imported so the test does not drag in
 *      the provider package's heavy index graph) is in the unit the parameter
 *      declares.
 */
import { describe, it, expect } from 'vitest';
import type sql from 'mssql';
// Deep import: the package index pulls the full provider (+aiengine/queue) graph,
// which is far too heavy for a unit test. types.js only depends on core + mssql.
import { SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider/dist/types.js';
import { MetadataCacheRefreshIntervalSeconds } from '../providerConfigUnits.js';

/** The shipped default for databaseSettings.metadataCacheRefreshInterval (ms) — see src/config.ts. */
const DEFAULT_INTERVAL_MS = 180000;

describe('MetadataCacheRefreshIntervalSeconds (ms → s conversion)', () => {
    it('converts the shipped 180000ms default to 180 seconds (3 minutes, not ~50 hours)', () => {
        const seconds = MetadataCacheRefreshIntervalSeconds(DEFAULT_INTERVAL_MS);

        expect(seconds).toBe(180);
        // The regression fixed by 645c5a5e8: the raw ms value must never appear on
        // the seconds side of the seam. 180000 "seconds" is a 50-hour cadence.
        expect(seconds).not.toBe(DEFAULT_INTERVAL_MS);
        expect(seconds * 1000).toBe(DEFAULT_INTERVAL_MS); // exact round-trip, no truncation surprise
    });

    it('preserves 0 (auto-refresh disabled stays disabled)', () => {
        expect(MetadataCacheRefreshIntervalSeconds(0)).toBe(0);
    });

    it('converts arbitrary env-override values proportionally', () => {
        expect(MetadataCacheRefreshIntervalSeconds(60000)).toBe(60);
        expect(MetadataCacheRefreshIntervalSeconds(1500)).toBe(1.5); // sub-second precision retained
    });
});

describe('handoff contract with SQLServerProviderConfigData', () => {
    // The constructor only stores the pool reference; no connection is opened.
    const stubPool = {} as unknown as sql.ConnectionPool;

    it('stores the derived value as CheckRefreshIntervalSeconds — the effective value is in SECONDS', () => {
        const config = new SQLServerProviderConfigData(
            stubPool,
            '__mj',
            MetadataCacheRefreshIntervalSeconds(DEFAULT_INTERVAL_MS),
        );

        expect(config.CheckRefreshIntervalSeconds).toBe(180);
        expect(config.CheckRefreshIntervalSeconds).not.toBe(DEFAULT_INTERVAL_MS);
    });

    it('a disabled (0ms) interval reaches the provider as 0 — matching the provider default', () => {
        const derived = new SQLServerProviderConfigData(stubPool, '__mj', MetadataCacheRefreshIntervalSeconds(0));
        const omitted = new SQLServerProviderConfigData(stubPool, '__mj');

        expect(derived.CheckRefreshIntervalSeconds).toBe(0);
        // The provider's own default is 0 (auto refresh disabled) — the two paths agree.
        expect(omitted.CheckRefreshIntervalSeconds).toBe(0);
    });
});
