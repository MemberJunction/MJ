import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { findDagViolations, blockingDagViolations, fkEdgeOf } from './dag-completeness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** An IO named `name` whose IOFs FK at each target in `fkTargets` (hard @lookup by default, soft ReferencedType when hard=false). */
function io(name, fkTargets = [], { hard = true } = {}) {
    const iofs = fkTargets.map((t, i) => ({
        fields: hard
            ? { Name: `fk${i}`, RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID` }
            : { Name: `fk${i}`, IsForeignKey: true, Configuration: JSON.stringify({ ReferencedType: t }) },
    }));
    return { fields: { Name: name }, relatedEntities: { 'MJ: Integration Object Fields': iofs } };
}
function meta(ios) {
    return { fields: { Name: 'TestVendor' }, relatedEntities: { 'MJ: Integration Objects': ios } };
}

// ── fkEdgeOf ──────────────────────────────────────────────────────────────────────────────────────
test('fkEdgeOf: parses a hard @lookup target name', () => {
    assert.deepEqual(fkEdgeOf({ RelatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Contact&IntegrationID=@parent:IntegrationID' }), { target: 'Contact', hard: true });
});
test('fkEdgeOf: parses a soft ReferencedType target (string Configuration JSON)', () => {
    assert.deepEqual(fkEdgeOf({ IsForeignKey: true, Configuration: JSON.stringify({ ReferencedType: 'Account' }) }), { target: 'Account', hard: false });
});
test('fkEdgeOf: no FK -> null', () => {
    assert.equal(fkEdgeOf({ Name: 'PlainField' }), null);
    assert.equal(fkEdgeOf(undefined), null);
});

// ── findDagViolations ───────────────────────────────────────────────────────────────────────────
test('a clean acyclic chain orders ALL objects (orderedCount === objectCount), no violations', () => {
    const r = findDagViolations(meta([io('A'), io('B', ['A']), io('C', ['B'])]));
    assert.equal(r.objectCount, 3);
    assert.equal(r.orderedCount, 3); // every object placed — the "over all objects" guarantee
    assert.deepEqual(r.violations, []);
    // parents precede children in the order
    assert.ok(r.ordered.indexOf('A') < r.ordered.indexOf('B'));
    assert.ok(r.ordered.indexOf('B') < r.ordered.indexOf('C'));
});

test('the 4/21 scenario inverted: 21 acyclic objects ALL order (21/21)', () => {
    const ios = [io('O0')];
    for (let i = 1; i < 21; i++) ios.push(io(`O${i}`, [`O${i - 1}`]));
    const r = findDagViolations(meta(ios));
    assert.equal(r.objectCount, 21);
    assert.equal(r.orderedCount, 21);
    assert.deepEqual(blockingDagViolations(r), []);
});

test('a dangling FK (target is not an emitted object) is flagged; the owner still orders', () => {
    const r = findDagViolations(meta([io('A'), io('B', ['Ghost'])]));
    const dangling = r.violations.filter((v) => v.type === 'dangling-fk');
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0].io, 'B');
    assert.equal(dangling[0].target, 'Ghost');
    assert.equal(r.orderedCount, 2); // B still placed (the bad edge is dropped, not the object)
});

test('a HARD @lookup cycle is a blocking hard-cycle (deploy push would roll back)', () => {
    const r = findDagViolations(meta([io('A', ['B']), io('B', ['A'])]));
    const cyc = r.violations.filter((v) => v.type === 'hard-cycle');
    assert.equal(cyc.length, 1);
    assert.deepEqual(cyc[0].objects, ['A', 'B']);
    assert.ok(r.orderedCount < r.objectCount); // cyclic objects cannot be ordered
    assert.equal(blockingDagViolations(r).length, 1);
});

test('a SOFT ReferencedType cycle is reported but NOT blocking (runtime-resolved)', () => {
    const r = findDagViolations(meta([io('A', ['B'], { hard: false }), io('B', ['A'], { hard: false })]));
    const cyc = r.violations.filter((v) => v.type === 'soft-cycle');
    assert.equal(cyc.length, 1);
    assert.equal(blockingDagViolations(r).length, 0); // tolerable — Salesforce class
});

test('a self-reference is NOT a cycle (object FK to itself is ignored for ordering)', () => {
    const r = findDagViolations(meta([io('A', ['A']), io('B', ['A'])]));
    assert.equal(r.objectCount, 2);
    assert.equal(r.orderedCount, 2);
    assert.deepEqual(r.violations, []);
});

test('blockingDagViolations returns dangling-fk + hard-cycle, excludes soft-cycle', () => {
    const r = { violations: [{ type: 'dangling-fk' }, { type: 'hard-cycle' }, { type: 'soft-cycle' }] };
    assert.deepEqual(blockingDagViolations(r).map((v) => v.type), ['dangling-fk', 'hard-cycle']);
});

test('empty / malformed metadata -> no throw, no objects', () => {
    assert.deepEqual(findDagViolations(null).violations, []);
    assert.equal(findDagViolations({}).objectCount, 0);
    assert.deepEqual(findDagViolations([null, 5, {}]).violations, []);
});

// ── Drift guard: floor-check must keep WIRING this gate ──────────────────────────────────────────
test('DRIFT GUARD: floor-check.workflow.js still wires the dag-completeness gate', () => {
    const fc = readFileSync(resolve(__dirname, '..', '..', 'primitives', 'floor-check.workflow.js'), 'utf8');
    assert.ok(fc.includes('graders/dag-completeness.mjs'), 'floor-check must run graders/dag-completeness.mjs as a subprocess');
    assert.ok(fc.includes('dagJson'), 'floor-check must capture + parse dagJson');
    assert.ok(fc.includes('dag-incomplete'), 'floor-check must push the dag-incomplete failure rule');
});
