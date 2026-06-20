import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gradeCell, gradeCells, isCountBased } from './anti-vacuous.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── isCountBased ──────────────────────────────────────────────────────────────────────────────────
test('isCountBased: row-moving kinds and explicit countBased flag are count-based; others are not', () => {
    for (const kind of ['forward', 'delta', 'idempotent', 'capture', 'pagination']) {
        assert.equal(isCountBased({ kind }), true, `kind=${kind} should be count-based`);
    }
    assert.equal(isCountBased({ kind: 'connection' }), false);
    assert.equal(isCountBased({ kind: 'discover' }), false);
    assert.equal(isCountBased({ countBased: true }), true);
    assert.equal(isCountBased({ kind: 'connection', countBased: true }), true);
    assert.equal(isCountBased({}), false);
});

// ── vacuous-count failures ──────────────────────────────────────────────────────────────────────────
test('a count-based cell with a 0 rowcount fails', () => {
    const cell = { cellId: 'forward.contacts', kind: 'forward', rowcounts: { source: 0, mj: 0 } };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.length >= 1);
    assert.ok(reasons.some((r) => r.includes("rowcount 'source' is 0")));
});

test('a count-based cell with missing rowcounts fails', () => {
    const cell = { cellId: 'forward.deals', kind: 'forward' };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.some((r) => r.includes('rowcounts is missing/empty')));
});

test('a count-based cell with an empty rowcounts object fails', () => {
    const cell = { cellId: 'pagination.x', kind: 'pagination', rowcounts: {} };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.some((r) => r.includes('rowcounts is missing/empty')));
});

test('a cell flagged countBased:true (non-count-based kind) with a 0 rowcount fails', () => {
    const cell = { cellId: 'custom.thing', kind: 'connection', countBased: true, rowcounts: { rows: 0 } };
    const { pass } = gradeCell(cell);
    assert.equal(pass, false);
});

// ── unmeasured-assertion failures ───────────────────────────────────────────────────────────────────
test('a null value in `asserted` fails', () => {
    const cell = {
        cellId: 'forward.contacts',
        kind: 'forward',
        rowcounts: { source: 10, mj: 10 },
        asserted: { countsMatch: true, watermarkAdvanced: null },
    };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.some((r) => r.includes("assertion 'watermarkAdvanced' is null")));
});

test('an undefined value in `asserted` fails', () => {
    const cell = {
        cellId: 'idempotent.deals',
        kind: 'idempotent',
        rowcounts: { writes: 5 },
        asserted: { noRedundantWrites: undefined },
    };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.some((r) => r.includes("assertion 'noRedundantWrites' is undefined")));
});

test('a null assertion fails even on a non-count-based cell', () => {
    const cell = { cellId: 'connection.test', kind: 'connection', asserted: { connected: null } };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, false);
    assert.ok(reasons.some((r) => r.includes("assertion 'connected' is null")));
});

// ── passing cells ───────────────────────────────────────────────────────────────────────────────────
test('a measured non-zero count-based cell passes', () => {
    const cell = {
        cellId: 'forward.contacts',
        kind: 'forward',
        rowcounts: { source: 42, mj: 42 },
        asserted: { countsMatch: true },
    };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, true);
    assert.deepEqual(reasons, []);
});

test('a count-based cell with expectsData:false and 0 rows passes', () => {
    const cell = { cellId: 'delta.empty', kind: 'delta', expectsData: false, rowcounts: { changed: 0 } };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, true);
    assert.deepEqual(reasons, []);
});

test('a count-based cell with expectsData:false and NO rowcounts passes', () => {
    const cell = { cellId: 'forward.empty', kind: 'forward', expectsData: false };
    const { pass } = gradeCell(cell);
    assert.equal(pass, true);
});

test('a non-count-based cell with no rowcounts and only true assertions passes', () => {
    const cell = { cellId: 'connection.test', kind: 'connection', asserted: { connected: true } };
    const { pass, reasons } = gradeCell(cell);
    assert.equal(pass, true);
    assert.deepEqual(reasons, []);
});

test('a false assertion value is a measured result → passes (false is not unmeasured)', () => {
    const cell = {
        cellId: 'idempotent.x',
        kind: 'idempotent',
        rowcounts: { writes: 3 },
        asserted: { hadErrors: false },
    };
    const { pass } = gradeCell(cell);
    assert.equal(pass, true);
});

test('a 0 assertion value is a measured result → passes (0 is not unmeasured)', () => {
    const cell = {
        cellId: 'idempotent.x',
        kind: 'idempotent',
        rowcounts: { writes: 3 },
        asserted: { redundantWrites: 0 },
    };
    const { pass } = gradeCell(cell);
    assert.equal(pass, true);
});

// ── gradeCells aggregate ────────────────────────────────────────────────────────────────────────────
test('gradeCells: all-passing → pass:true, empty failing', () => {
    const cells = [
        { cellId: 'a', kind: 'forward', rowcounts: { n: 1 } },
        { cellId: 'b', kind: 'connection', asserted: { ok: true } },
        { cellId: 'c', kind: 'delta', expectsData: false, rowcounts: { n: 0 } },
    ];
    const verdict = gradeCells(cells);
    assert.equal(verdict.pass, true);
    assert.deepEqual(verdict.failing, []);
});

test('gradeCells: mixed → pass:false, only failing cells listed with their reasons', () => {
    const cells = [
        { cellId: 'good', kind: 'forward', rowcounts: { n: 5 } },
        { cellId: 'vacuous', kind: 'forward', rowcounts: { n: 0 } },
        { cellId: 'unmeasured', kind: 'connection', asserted: { ok: null } },
    ];
    const verdict = gradeCells(cells);
    assert.equal(verdict.pass, false);
    assert.equal(verdict.failing.length, 2);
    const ids = verdict.failing.map((f) => f.cellId).sort();
    assert.deepEqual(ids, ['unmeasured', 'vacuous']);
    for (const f of verdict.failing) {
        assert.ok(Array.isArray(f.reasons) && f.reasons.length >= 1);
    }
});

test('gradeCells: non-array input is treated as empty → pass:true', () => {
    assert.deepEqual(gradeCells(null), { pass: true, failing: [] });
    assert.deepEqual(gradeCells(undefined), { pass: true, failing: [] });
});

test('gradeCell: a non-object cell fails gracefully', () => {
    const { pass, reasons } = gradeCell(null);
    assert.equal(pass, false);
    assert.ok(reasons.length === 1);
});

test('DRIFT GUARD: floor-check.workflow.js keeps the inline anti-vacuous e2e enforcement', () => {
    // anti-vacuous is enforced INLINE for the hybrid-e2e path (not via this module); pin it so a future
    // edit cannot silently drop the "0 rows / unmeasured assertion = FAIL" guard the module embodies.
    const fc = readFileSync(resolve(__dirname, '..', '..', 'primitives', 'floor-check.workflow.js'), 'utf8');
    assert.ok(fc.includes('e2e-landed-zero-rows'), 'floor-check must fail an e2e cell that landed zero rows');
    assert.ok(fc.includes('e2e-assertion-unverified'), 'floor-check must fail an e2e cell with an unmeasured assertion');
});
