import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateCell, validateCells, isFrameworkGap, CELL_OWNERS } from './cell-record.mjs';

const fullyValid = () => ({
    cellId: 'forward.incremental.narrowed',
    owner: 'connector',
    asserted: true,
    pass: true,
    reason: 'second sync narrowed Processed from 4000 to 0 (watermark advanced)',
    rowcounts: { groundTruth: 4000, mjRows: 4000 },
    requestIssued: 'GET /contacts?since=2026-01-01',
});

test('a fully-valid cell → valid:true with no errors', () => {
    const { valid, errors } = validateCell(fullyValid());
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
});

test('a minimal valid cell (no optional fields) → valid:true', () => {
    const { valid, errors } = validateCell({
        cellId: 'connection.ok',
        owner: 'connector',
        asserted: true,
        pass: true,
        reason: 'TestConnection returned 200',
    });
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
});

test('missing owner → error', () => {
    const cell = fullyValid();
    delete cell.owner;
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('owner is required')), errors.join('; '));
});

test("owner='foo' → error", () => {
    const cell = { ...fullyValid(), owner: 'foo' };
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.startsWith('owner must be one of')), errors.join('; '));
});

test('empty reason → error', () => {
    const cell = { ...fullyValid(), reason: '   ' };
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('reason must be a non-empty string')), errors.join('; '));
});

test('non-boolean pass → error', () => {
    const cell = { ...fullyValid(), pass: 'true' };
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('pass must be a boolean')), errors.join('; '));
});

test('non-boolean asserted → error', () => {
    const cell = { ...fullyValid(), asserted: 1 };
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('asserted must be a boolean')), errors.join('; '));
});

test('empty cellId → error', () => {
    const cell = { ...fullyValid(), cellId: '' };
    const { valid, errors } = validateCell(cell);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('cellId must be a non-empty string')), errors.join('; '));
});

test("owner='engine' → isFrameworkGap true (red engine cell is a FRAMEWORK ticket)", () => {
    const cell = { ...fullyValid(), owner: 'engine', pass: false };
    assert.equal(isFrameworkGap(cell), true);
});

test("owner='connector' → isFrameworkGap false", () => {
    assert.equal(isFrameworkGap(fullyValid()), false);
});

test("owner='metadata' → isFrameworkGap false", () => {
    assert.equal(isFrameworkGap({ ...fullyValid(), owner: 'metadata' }), false);
});

test('CELL_OWNERS exports exactly the three allowed values', () => {
    assert.deepEqual(CELL_OWNERS, ['connector', 'engine', 'metadata']);
});

test('validateCells partitions valid vs invalid', () => {
    const { valid, invalid } = validateCells([
        fullyValid(),
        { ...fullyValid(), owner: 'foo' },
        { ...fullyValid(), cellId: '' },
    ]);
    assert.equal(valid, false);
    assert.equal(invalid.length, 2);
    assert.ok(invalid.every((i) => Array.isArray(i.errors) && i.errors.length > 0));
});

test('validateCells with all-valid → valid:true, empty invalid', () => {
    const { valid, invalid } = validateCells([fullyValid(), { ...fullyValid(), owner: 'metadata' }]);
    assert.equal(valid, true);
    assert.deepEqual(invalid, []);
});
