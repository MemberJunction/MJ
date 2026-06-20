import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findBijectionViolations, isMissingValue } from './bijection.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Build a metadata record with a single IO whose fields are `ioFields`. */
function recWithIO(ioFields, relatedKey = 'MJ: Integration Objects') {
    return {
        fields: { Name: 'TestVendor' },
        relatedEntities: {
            [relatedKey]: [{ fields: ioFields }],
        },
    };
}

// ── isMissingValue ──────────────────────────────────────────────────────────────────────────────────
test('isMissingValue: null/undefined/empty/whitespace are missing; a real value is not', () => {
    assert.equal(isMissingValue(null), true);
    assert.equal(isMissingValue(undefined), true);
    assert.equal(isMissingValue(''), true);
    assert.equal(isMissingValue('   '), true);
    assert.equal(isMissingValue('/contacts'), false);
    assert.equal(isMissingValue('POST'), false);
});

// ── SupportsCreate ────────────────────────────────────────────────────────────────────────────────
test('SupportsCreate with null CreateAPIPath is flagged', () => {
    const md = recWithIO({
        Name: 'Contacts',
        SupportsCreate: true,
        CreateAPIPath: null,
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
    });
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.equal(v[0].io, 'Contacts');
    assert.equal(v[0].capability, 'SupportsCreate');
    assert.deepEqual(v[0].missing, ['CreateAPIPath']);
    assert.equal(v[0].integration, 'TestVendor');
});

test('a fully-specified create IO passes (no violations)', () => {
    const md = recWithIO({
        Name: 'Contacts',
        SupportsCreate: true,
        CreateAPIPath: '/contacts',
        CreateMethod: 'POST',
        CreateBodyShape: 'wrapped',
        CreateIDLocation: 'body',
    });
    assert.deepEqual(findBijectionViolations(md), []);
});

test('SupportsCreate with multiple blank columns lists ALL missing fields', () => {
    const md = recWithIO({
        Name: 'Contacts',
        SupportsCreate: true,
        CreateAPIPath: '/contacts',
        CreateMethod: '   ',   // whitespace-only → missing
        CreateBodyShape: '',   // empty → missing
        CreateIDLocation: undefined,
    });
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.deepEqual(v[0].missing, ['CreateMethod', 'CreateBodyShape', 'CreateIDLocation']);
});

// ── SupportsUpdate ────────────────────────────────────────────────────────────────────────────────
test('SupportsUpdate with missing UpdateMethod is flagged', () => {
    const md = recWithIO({
        Name: 'Deals',
        SupportsUpdate: true,
        UpdateAPIPath: '/deals/{id}',
        UpdateMethod: null,
        UpdateBodyShape: 'flat',
        UpdateIDLocation: 'path',
    });
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.equal(v[0].capability, 'SupportsUpdate');
    assert.deepEqual(v[0].missing, ['UpdateMethod']);
});

// ── SupportsDelete — NO body fields required ──────────────────────────────────────────────────────
test('delta/delete requires no body fields: path + method only → passes even with no body columns', () => {
    const md = recWithIO({
        Name: 'Notes',
        SupportsDelete: true,
        DeleteAPIPath: '/notes/{id}',
        DeleteMethod: 'DELETE',
        // intentionally NO DeleteBodyShape / DeleteBodyKey / DeleteIDLocation
    });
    assert.deepEqual(findBijectionViolations(md), []);
});

test('SupportsDelete with missing DeleteMethod is flagged (verb is metadata-driven, not assumed)', () => {
    const md = recWithIO({
        Name: 'Notes',
        SupportsDelete: true,
        DeleteAPIPath: '/notes/{id}',
        DeleteMethod: null,
    });
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.equal(v[0].capability, 'SupportsDelete');
    assert.deepEqual(v[0].missing, ['DeleteMethod']);
});

// ── SupportsIncrementalSync ───────────────────────────────────────────────────────────────────────
test('SupportsIncrementalSync with null IncrementalWatermarkField is flagged', () => {
    const md = recWithIO({
        Name: 'Tickets',
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: null,
    });
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.equal(v[0].capability, 'SupportsIncrementalSync');
    assert.deepEqual(v[0].missing, ['IncrementalWatermarkField']);
});

test('SupportsIncrementalSync with a populated watermark field passes', () => {
    const md = recWithIO({
        Name: 'Tickets',
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'updatedAt',
    });
    assert.deepEqual(findBijectionViolations(md), []);
});

// ── all capabilities false ────────────────────────────────────────────────────────────────────────
test('an IO with all capability flags false → no violations (no requirements apply)', () => {
    const md = recWithIO({
        Name: 'ReadOnlyThing',
        SupportsCreate: false,
        SupportsUpdate: false,
        SupportsDelete: false,
        SupportsIncrementalSync: false,
        // all per-operation columns absent — fine, because no flag is set
    });
    assert.deepEqual(findBijectionViolations(md), []);
});

test('an IO with no capability flags at all → no violations', () => {
    const md = recWithIO({ Name: 'PlainThing' });
    assert.deepEqual(findBijectionViolations(md), []);
});

// ── shape handling ────────────────────────────────────────────────────────────────────────────────
test('handles the bare (non-"MJ: "-prefixed) related-entity key', () => {
    const md = recWithIO(
        {
            Name: 'Contacts',
            SupportsCreate: true,
            CreateAPIPath: null,
            CreateMethod: 'POST',
            CreateBodyShape: 'flat',
            CreateIDLocation: 'body',
        },
        'Integration Objects', // bare key
    );
    const v = findBijectionViolations(md);
    assert.equal(v.length, 1);
    assert.deepEqual(v[0].missing, ['CreateAPIPath']);
});

test('accepts a single record OR an array of records', () => {
    const one = recWithIO({
        Name: 'Contacts',
        SupportsCreate: true,
        CreateAPIPath: null,
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
    });
    const fromArray = findBijectionViolations([one]);
    const fromObject = findBijectionViolations(one);
    assert.deepEqual(fromArray, fromObject);
    assert.equal(fromArray.length, 1);
});

test('multiple IOs with multiple capability violations are all reported', () => {
    const md = {
        fields: { Name: 'BigVendor' },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: {
                        Name: 'A',
                        SupportsCreate: true,
                        CreateAPIPath: '/a',
                        CreateMethod: 'POST',
                        CreateBodyShape: 'flat',
                        CreateIDLocation: null, // missing
                        SupportsIncrementalSync: true,
                        IncrementalWatermarkField: null, // missing
                    },
                },
                {
                    fields: {
                        Name: 'B',
                        SupportsUpdate: true,
                        UpdateAPIPath: '/b/{id}',
                        UpdateMethod: 'PATCH',
                        UpdateBodyShape: 'flat',
                        UpdateIDLocation: 'path', // complete → no violation
                    },
                },
            ],
        },
    };
    const v = findBijectionViolations(md);
    // A contributes two violations (Create + IncrementalSync), B contributes none.
    assert.equal(v.length, 2);
    const caps = v.map((x) => x.capability).sort();
    assert.deepEqual(caps, ['SupportsCreate', 'SupportsIncrementalSync']);
    assert.ok(v.every((x) => x.io === 'A'));
});

test('DRIFT GUARD: floor-check.workflow.js still wires the bijection gate', () => {
    const fc = readFileSync(resolve(__dirname, '..', '..', 'primitives', 'floor-check.workflow.js'), 'utf8');
    assert.ok(fc.includes('graders/bijection.mjs'), 'floor-check must run graders/bijection.mjs as a subprocess');
    assert.ok(fc.includes('bijectionJson'), 'floor-check must capture + parse bijectionJson');
    assert.ok(fc.includes('bijection-violation'), 'floor-check must push the bijection-violation failure rule');
});
