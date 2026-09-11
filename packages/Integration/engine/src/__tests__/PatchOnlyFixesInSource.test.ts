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
const CONNECTOR = readFileSync(join(__dirname, '..', 'BaseIntegrationConnector.ts'), 'utf-8');
const REST = readFileSync(join(__dirname, '..', 'BaseRESTIntegrationConnector.ts'), 'utf-8');
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

/**
 * MJ-MEM-2 is deliberately NOT here.
 *
 * The fleet patch inverts this file's timeout predicate so a timed-out page is retried instead of
 * abandoning the whole object for the run. That is a real problem — sixteen NetSuite objects ended
 * INCOMPLETE in one run on ACR dev — but the upstream rule is also deliberate and has two tests:
 * WithTimeout does not CANCEL the attempt it abandons, so retrying stacks a second full page on a
 * source already too slow to finish the first.
 *
 * So it is a DIVERGENCE, not a missing fix, and it stays in the patch. Porting it here breaks
 * GovernedFetch.test.ts and IntegrationEngine.fetch-timeout.test.ts, which is exactly the signal
 * that told us so. The fix that satisfies both sides — suspend the object, resume from its keyset
 * — is owed and belongs upstream.
 */

describe('MJ-RUN-4 — an abandoned object reaches the run, not just the event stream', () => {
    it('records the object on the run result', () => {
        expect(ENGINE).toMatch(/\(result\.IncompleteObjects \?\?= \[\]\)\.push\(/);
    });

    it('names them in the completion message', () => {
        expect(ENGINE).toMatch(/object\(s\) INCOMPLETE:/);
        expect(ENGINE).toMatch(/finalizeSyncProgress\(progress, abortSignal\?\.aborted \? 'cancelled' : 'completed', completionMessage\)/);
    });

    it('still finalizes as completed — a held watermark is not a failed run', () => {
        const i = ENGINE.indexOf('const incomplete = result.IncompleteObjects');
        expect(i).toBeGreaterThan(-1);
        expect(ENGINE.slice(i, i + 900)).toMatch(/'cancelled' : 'completed'/);
    });

    it('keeps the durable Errors entry at Warning severity, so Status stays Success', () => {
        const i = ENGINE.indexOf('FETCH_ABORTED_INCOMPLETE');
        expect(ENGINE.slice(i, i + 1600)).toMatch(/Severity: 'Warning'/);
    });
});

describe('L4 — the content-hash prefetch must not cache per batch', () => {
    it('bypasses the result cache', () => {
        // Every batch's filter is unique, so each cached entry is never hit again and memory grows
        // O(records processed). A ~500k-record drain killed a 3.8 GB box: the KERNEL oom-killed the
        // process at ~2.3 GB RSS BEFORE V8's ceiling, twice — so no --max-old-space-size fixes it.
        // This is the fix, and the deploy-time heap ceiling is NOT a substitute for it.
        const i = ENGINE.indexOf('async PrefetchContentHashes');
        expect(i).toBeGreaterThan(-1);
        const body = ENGINE.slice(i, ENGINE.indexOf('\n    }', i));
        expect(body).toMatch(/BypassCache: true/);
    });
});

/**
 * The empty-table describe fallback is deliberately NOT here — see the note at the site in
 * BaseIntegrationConnector.DiscoverFieldsViaFetch. It is a DIVERGENCE, not a missing fix: zero
 * fields is also the correct answer when the sampler adjourned, and porting it turns two
 * DagDiscoveryABCDE tests red. That signal is what classified it.
 */

describe('first contact must still sample', () => {
    it('a not-yet-persisted object falls through to the generic loop instead of throwing', () => {
        // The pipeline samples BEFORE it persists, so a runtime-discovered object has no catalog
        // row yet. Throwing here ran the whole fallback chain with zero records — no statistical
        // PK and no observed widths, for exactly the objects discovery exists to learn.
        expect(REST).toMatch(/let obj[^\n]*= null;/);
        expect(REST).toMatch(/catch \{[\s\S]{0,120}not persisted yet/);
        expect(REST).toMatch(/if \(!obj \|\| this\.DetectTemplateVars\(obj\.APIPath\)\.length === 0\)/);
    });
});
