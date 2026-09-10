/**
 * Two fixes lived ONLY in the deployed fleet patch and not in this source tree.
 *
 * That is a trap with teeth: regenerating a patch from source is the normal way these ship, and
 * doing it while the source lacked these would have silently DELETED them from every environment
 * — including the watermark pin, which is a P0. These tests exist so the next regeneration
 * cannot quietly undo them, and so anyone tempted to "simplify" either one reads why first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf-8');
const PIPELINE = readFileSync(join(__dirname, '..', 'IntegrationConnectorCreationPipeline.ts'), 'utf-8');

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

describe('MJ-DISC-16 — a first-discovered object is sampled in the same run', () => {
    it('records the objects that fell back because they had no catalog row yet', () => {
        expect(PIPELINE).toMatch(/IntegrationObject not found/);
        expect(PIPELINE).toMatch(/_firstDiscoveryFallbacks \?\?= new Set<string>\(\)\)\.add\(objectName\)/);
    });

    it('only treats the missing-row case as healable, not every sampling failure', () => {
        // A vendor timeout is also a fallback, and re-running Introspect would not fix it — it
        // would just spend the budget twice.
        const i = PIPELINE.indexOf('private ReportSampleFallback');
        const body = PIPELINE.slice(i, i + 1200);
        expect(body).toMatch(/if \(\/IntegrationObject not found\/i\.test\(msg\)\)/);
    });

    it('the heal is DRIVEN by the recorded set, not by some other condition', () => {
        // Guards against the heal surviving as dead code — a block that still reads
        // `const unsampled = ...` but no longer sources it from the fallbacks would never fire.
        expect(PIPELINE).toMatch(/const unsampled = \[\.\.\.\(this\._firstDiscoveryFallbacks \?\? \[\]\)\];/);
        expect(PIPELINE).toMatch(/if \(unsampled\.length > 0\)/);
    });

    it('resets the set at the start of every Introspect, so the heal cannot loop', () => {
        const i = PIPELINE.indexOf('private async StageIntrospect(');
        expect(PIPELINE.slice(i, i + 400)).toMatch(/this\._firstDiscoveryFallbacks = new Set<string>\(\)/);
    });

    it('refreshes the catalog before re-sampling — without it the second pass reads the same stale cache', () => {
        const i = PIPELINE.indexOf('const unsampled =');
        const body = PIPELINE.slice(i, i + 1200);
        const refresh = body.indexOf('RefreshCatalog');
        const reIntrospect = body.indexOf('StageIntrospect(emitter, opts)');
        expect(refresh).toBeGreaterThan(-1);
        expect(reIntrospect).toBeGreaterThan(-1);
        expect(refresh, 'RefreshCatalog must precede the second Introspect').toBeLessThan(reIntrospect);
    });

    it('re-persists after the healing Introspect, or the sampled widths are computed and thrown away', () => {
        const i = PIPELINE.indexOf('const unsampled =');
        expect(PIPELINE.slice(i, i + 1400)).toMatch(/persistResult = await withDeadline\('Persist'/);
    });

    it('is non-fatal — a failed heal leaves the state we already had', () => {
        const i = PIPELINE.indexOf('const unsampled =');
        const body = PIPELINE.slice(i, i + 1600);
        expect(body).toMatch(/catch \(healErr\)/);
        expect(body).toMatch(/first-discovery-heal-failed/);
        expect(body).not.toMatch(/throw healErr/);
    });

    it('runs BEFORE key classification, so the classifier sees the sampled evidence', () => {
        const heal = PIPELINE.indexOf('const unsampled =');
        const pk = PIPELINE.indexOf("StagePKClassify(emitter, opts)", heal);
        expect(heal).toBeGreaterThan(-1);
        expect(pk).toBeGreaterThan(heal);
    });
});
