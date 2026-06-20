import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findWriteCoverageGaps, blockingWriteViolations, writeCapsOf } from './write-coverage.mjs';

/** IO with explicit write columns. `caps` = subset of {create,update,del}. */
function wio(name, caps = { create: true }, status) {
    const f = { Name: name };
    if (status) f.Status = status;
    if (caps.create) f.CreateAPIPath = `/${name}`;
    if (caps.update) f.UpdateAPIPath = `/${name}/{id}`;
    if (caps.del) f.DeleteAPIPath = `/${name}/{id}`;
    return { fields: f };
}
/** Read-only IO (no write columns). */
function rio(name) { return { fields: { Name: name } }; }
function meta(ios) { return { fields: { Name: 'TestVendor' }, relatedEntities: { 'MJ: Integration Objects': ios } }; }

// ── writable detection ──────────────────────────────────────────────────────────────────────────────
test('writeCapsOf: read-only IO -> null', () => {
    assert.equal(writeCapsOf({ Name: 'X' }), null);
});
test('writeCapsOf: per-operation path columns mark it writable', () => {
    assert.deepEqual(writeCapsOf({ Name: 'X', CreateAPIPath: '/x' }), { create: true, update: false, del: false });
});
test('writeCapsOf: SupportsCreate flag (true / "true") marks it writable even with no path column', () => {
    assert.deepEqual(writeCapsOf({ Name: 'X', SupportsUpdate: true }), { create: false, update: true, del: false });
    assert.deepEqual(writeCapsOf({ Name: 'X', SupportsDelete: 'true' }), { create: false, update: false, del: true });
});

// ── no-coverage-data is informational ─────────────────────────────────────────────────────────────────
test('exercised=null -> no-coverage-data, zero violations (cannot false-fail)', () => {
    const r = findWriteCoverageGaps({ metadata: meta([wio('A'), wio('B')]), exercised: null });
    assert.equal(r.status, 'no-coverage-data');
    assert.equal(r.writableCount, 2);
    assert.equal(blockingWriteViolations(r).length, 0);
});

// ── read-only objects never count against write-coverage ────────────────────────────────────────────
test('read-only objects are not writable -> not required to exercise', () => {
    const r = findWriteCoverageGaps({ metadata: meta([rio('A'), rio('B'), wio('C')]), exercised: ['C'] });
    assert.equal(r.writableCount, 1);
    assert.equal(r.status, 'complete');
    assert.equal(blockingWriteViolations(r).length, 0);
});

// ── declared-but-unproven write is the violation ────────────────────────────────────────────────────
test('declared writable objects with no exercised write -> blocking unproven-write', () => {
    const r = findWriteCoverageGaps({ metadata: meta([wio('A'), wio('B'), wio('C')]), exercised: ['A'] });
    assert.equal(r.status, 'gaps');
    const blocking = blockingWriteViolations(r);
    assert.deepEqual(blocking.map((v) => v.object).sort(), ['B', 'C']);
});
test('a logged skip clears an unproven write', () => {
    const r = findWriteCoverageGaps({ metadata: meta([wio('A'), wio('B')]), exercised: ['A'], skips: ['B'] });
    assert.equal(r.status, 'complete');
    assert.equal(r.skippedCount, 1);
    assert.equal(blockingWriteViolations(r).length, 0);
});
test('Disabled writable object is out of scope', () => {
    const r = findWriteCoverageGaps({ metadata: meta([wio('A'), wio('B', { create: true }, 'Disabled')]), exercised: ['A'] });
    assert.equal(r.writableCount, 1);
    assert.equal(blockingWriteViolations(r).length, 0);
});
