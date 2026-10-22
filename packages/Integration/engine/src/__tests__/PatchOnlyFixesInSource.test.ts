/**
 * U17 — the incremental fetch filter is pinned to the run's start boundary.
 *
 * This fix lived ONLY in a deployed downstream patch, not in this source tree. That is a trap
 * with teeth: regenerating a patch from source is the normal way these ship, and doing it while
 * the source lacked this would have silently DELETED a P0 fix from every environment, with a
 * green build and no diff anyone would read as a removal.
 *
 * These tests exist so the fix cannot be quietly undone, and so anyone tempted to "simplify" the
 * two watermark variables into one reads why they are different first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf-8');

describe('U17 — the incremental fetch filter is pinned to the run start', () => {
    it('passes initialWatermark to the fetch, never the running max', () => {
        // currentWatermark advances every page on connectors that emit a per-page running max.
        // Feeding it back ratchets the predicate forward MID-SCAN and silently excludes every row
        // whose modstamp trails the max seen so far. Live: a Vendor Bill full scan returned 707 of
        // 23,558 rows and reported success.
        expect(ENGINE).toMatch(/ObjectName: entityMap\.ExternalObjectName,[\s\S]{0,900}?WatermarkValue: initialWatermark,/);
    });

    it('does NOT pass currentWatermark as the fetch filter anywhere', () => {
        const fetchCtx = ENGINE.match(/const ctx: FetchContext = \{[\s\S]*?\};/);
        expect(fetchCtx, 'fetch context not found').not.toBeNull();
        expect(fetchCtx![0]).not.toMatch(/WatermarkValue: currentWatermark/);
    });

    it('keeps currentWatermark for persistence, so the pin did not disable resume bookkeeping', () => {
        expect(ENGINE).toMatch(/currentWatermark/);
    });
});
