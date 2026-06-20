import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findCoverageGaps, blockingCoverageViolations } from './behavioral-coverage.mjs';

/** Build a metadata record with IOs named `names` (optionally `{name, status}`). */
function meta(names) {
    const ios = names.map((n) => (typeof n === 'string' ? { fields: { Name: n } } : { fields: { Name: n.name, Status: n.status } }));
    return { fields: { Name: 'TestVendor' }, relatedEntities: { 'MJ: Integration Objects': ios } };
}

// ── no-coverage-data is informational, never blocking ───────────────────────────────────────────────
test('covered=null -> no-coverage-data, zero violations (cannot false-fail)', () => {
    const r = findCoverageGaps({ metadata: meta(['A', 'B', 'C']), covered: null });
    assert.equal(r.status, 'no-coverage-data');
    assert.equal(r.activeCount, 3);
    assert.equal(blockingCoverageViolations(r).length, 0);
});
test('covered=undefined -> no-coverage-data (absent arg)', () => {
    const r = findCoverageGaps({ metadata: meta(['A']) });
    assert.equal(r.status, 'no-coverage-data');
    assert.equal(blockingCoverageViolations(r).length, 0);
});

// ── full coverage passes ────────────────────────────────────────────────────────────────────────────
test('every active object covered -> complete, no blocking', () => {
    const r = findCoverageGaps({ metadata: meta(['A', 'B', 'C']), covered: ['A', 'B', 'C'] });
    assert.equal(r.status, 'complete');
    assert.equal(r.coveredCount, 3);
    assert.equal(blockingCoverageViolations(r).length, 0);
});
test('covered is case/space-insensitive', () => {
    const r = findCoverageGaps({ metadata: meta(['Collect:BusinessUnit']), covered: ['  collect:businessunit '] });
    assert.equal(r.status, 'complete');
});

// ── the silent subset is the violation this gate exists for ─────────────────────────────────────────
test('a synced subset with an unaccounted remainder -> blocking silent gap', () => {
    const r = findCoverageGaps({ metadata: meta(['A', 'B', 'C', 'D']), covered: ['A', 'B'] });
    assert.equal(r.status, 'gaps');
    const blocking = blockingCoverageViolations(r);
    assert.equal(blocking.length, 2);
    assert.deepEqual(blocking.map((v) => v.object).sort(), ['C', 'D']);
});

// ── a logged skip accounts for an object -> NOT silent, NOT blocking ─────────────────────────────────
test('the cheap escape: a logged skip clears the gap', () => {
    const r = findCoverageGaps({ metadata: meta(['A', 'B', 'C', 'D']), covered: ['A', 'B'], skips: ['C', 'D'] });
    assert.equal(r.status, 'complete');
    assert.equal(r.skippedCount, 2);
    assert.equal(blockingCoverageViolations(r).length, 0);
});
test('covered + skip mix; only the truly-unaccounted object is blocking', () => {
    const r = findCoverageGaps({ metadata: meta(['A', 'B', 'C']), covered: ['A'], skips: ['B'] });
    const blocking = blockingCoverageViolations(r);
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0].object, 'C');
});

// ── disabled/deprecated objects are out of scope (not required to cover) ─────────────────────────────
test('Disabled/Deprecated objects are excluded from the active set', () => {
    const r = findCoverageGaps({
        metadata: meta(['A', { name: 'B', status: 'Disabled' }, { name: 'C', status: 'Deprecated' }]),
        covered: ['A'],
    });
    assert.equal(r.activeCount, 1);
    assert.equal(r.status, 'complete');
    assert.equal(blockingCoverageViolations(r).length, 0);
});
