/**
 * Regression test for the GZ-class guard: the floor-check `reality-probe-*` rules.
 *
 * GrowthZone shipped green with wrong paths / dead pagination / null PKs / wrong write-capability because no
 * stage checked the docs-derived claims against the live system before code was built. The RealityProbe (S7)
 * + these floor rules are the fix. This test pins that the fix actually BLOCKS each GZ failure, and a drift
 * guard pins that floor-check.workflow.js's inline enforcement still implements the rules (so it can't be
 * weakened back into the GZ failure mode).
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/floor/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decideRealityProbeFloor, GZ_REGRESSION_CASES } from './realityProbeFloor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('S7 missing → reality-probe-missing (the probe is mandatory on every build)', () => {
    const f = decideRealityProbeFloor(null);
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, 'reality-probe-missing');
});

test('clean probe (all claims confirmed) → no floor failure', () => {
    const f = decideRealityProbeFloor({ verdicts: [{ claim: 'path:/contacts', verdict: 'confirmed' }], metadataDelta: false });
    assert.deepEqual(f, []);
});

// The core GZ guarantee: every concrete GZ failure, expressed as the probe verdict that catches it, MUST
// block the build. If any of these stops blocking, GZ can recur — that is exactly what we never want again.
for (const c of GZ_REGRESSION_CASES) {
    test(`GZ guard blocks: ${c.gz}`, () => {
        const f = decideRealityProbeFloor({ verdicts: [c.verdict], metadataDelta: false });
        assert.ok(
            f.some(x => x.rule === 'reality-probe-verdicts-unresolved'),
            `${c.gz} must produce reality-probe-verdicts-unresolved (block the build)`,
        );
    });
}

test('falsified verdict RESOLVED by ProbeAmend → does NOT block (the amend round cleared it)', () => {
    const f = decideRealityProbeFloor({ verdicts: [{ claim: 'path:/x', verdict: 'wrong', resolved: true }], metadataDelta: false });
    assert.deepEqual(f, []);
});

test('probe authored a metadata delta → reality-probe-authored-metadata (anti-baking firewall)', () => {
    const f = decideRealityProbeFloor({ verdicts: [], metadataDelta: true });
    assert.ok(f.some(x => x.rule === 'reality-probe-authored-metadata'));
});

test('multiple falsified claims still collapse to one blocking failure (count surfaced in detail)', () => {
    const f = decideRealityProbeFloor({ verdicts: GZ_REGRESSION_CASES.map(c => c.verdict), metadataDelta: false });
    const blk = f.find(x => x.rule === 'reality-probe-verdicts-unresolved');
    assert.ok(blk && blk.detail.includes(String(GZ_REGRESSION_CASES.length)), 'detail should report the falsified count');
});

// DRIFT GUARD — floor-check.workflow.js runs sandboxed and cannot import this module, so it keeps its own
// inline copy of the decision. Assert that copy still implements the same rules + filter, so a future edit
// that weakens the GZ guard fails here instead of silently shipping.
test('DRIFT GUARD: floor-check.workflow.js inline enforcement still matches this decision', () => {
    const src = readFileSync(resolve(__dirname, '..', 'primitives', 'floor-check.workflow.js'), 'utf8');
    for (const rule of ['reality-probe-missing', 'reality-probe-verdicts-unresolved', 'reality-probe-authored-metadata']) {
        assert.ok(src.includes(rule), `floor-check.workflow.js must still push '${rule}'`);
    }
    assert.ok(/verdict === ['"]wrong['"]/.test(src), 'floor-check must still treat verdict==="wrong" as falsified');
    assert.ok(/verdict === ['"]falsified['"]/.test(src), 'floor-check must still treat verdict==="falsified" as falsified');
    assert.ok(/resolved !== true/.test(src), 'floor-check must still treat resolved===true verdicts as cleared (so ProbeAmend can resolve them)');
    assert.ok(/metadataDelta === true/.test(src), 'floor-check must still enforce the anti-baking firewall (metadataDelta)');
});
