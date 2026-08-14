import { describe, it, expect } from 'vitest';
import { analyzeMixedFreshness, type EntityFreshness } from '../MaterializationFreshness';

describe('analyzeMixedFreshness (Phase 4 §13)', () => {
    it('no flag when all reads are live', () => {
        const r = analyzeMixedFreshness([
            { entityName: 'Members', isMaterialized: false },
            { entityName: 'Donations', isMaterialized: false },
        ]);
        expect(r.mixed).toBe(false);
        expect(r.warning).toBeUndefined();
    });

    it('no flag when all reads are healthy snapshots refreshed together', () => {
        const t = new Date('2026-07-15T00:00:00Z');
        const r = analyzeMixedFreshness([
            { entityName: 'A', isMaterialized: true, status: 'Active', lastRefreshedAt: t },
            { entityName: 'B', isMaterialized: true, status: 'Active', lastRefreshedAt: t },
        ]);
        expect(r.mixed).toBe(false);
        expect(r.snapshotFreshnessSpreadMs).toBe(0);
        expect(r.warning).toBeUndefined();
    });

    it('flags mixing live with a materialized snapshot', () => {
        const r = analyzeMixedFreshness([
            { entityName: 'Members', isMaterialized: false },
            { entityName: 'DonationTotals', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date() },
        ]);
        expect(r.mixed).toBe(true);
        expect(r.hasLive).toBe(true);
        expect(r.hasMaterialized).toBe(true);
        expect(r.warning).toMatch(/mix live .* with materialized snapshot/i);
    });

    it('flags a non-Active snapshot (Stale / DriftHold)', () => {
        const r = analyzeMixedFreshness([
            { entityName: 'DonationTotals', isMaterialized: true, status: 'DriftHold', lastRefreshedAt: new Date() },
        ]);
        expect(r.mixed).toBe(false); // all materialized, no live
        expect(r.unhealthySnapshots).toEqual(['DonationTotals (DriftHold)']);
        expect(r.warning).toMatch(/not fresh/i);
    });

    it('reports the refresh-time spread across multiple snapshots', () => {
        const r = analyzeMixedFreshness([
            { entityName: 'A', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date('2026-07-15T00:00:00Z') },
            { entityName: 'B', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date('2026-07-15T01:00:00Z') },
        ]);
        expect(r.snapshotFreshnessSpreadMs).toBe(3600_000);
        expect(r.warning).toMatch(/different times/i);
    });

    it('ignores an unparseable lastRefreshedAt (NaN) instead of poisoning the spread computation', () => {
        // An invalid date yields NaN from getTime(); it must be dropped, not fed to Math.max/Math.min (which
        // would return NaN and silently suppress the real cross-snapshot spread warning).
        const r = analyzeMixedFreshness([
            { entityName: 'A', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date('not-a-date') },
            { entityName: 'B', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date('2026-07-15T00:00:00Z') },
            { entityName: 'C', isMaterialized: true, status: 'Active', lastRefreshedAt: new Date('2026-07-15T02:00:00Z') },
        ]);
        expect(Number.isNaN(r.snapshotFreshnessSpreadMs)).toBe(false);
        expect(r.snapshotFreshnessSpreadMs).toBe(7200_000); // spread of the two PARSEABLE timestamps
        expect(r.warning).toMatch(/different times/i);
    });
});
