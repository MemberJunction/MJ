/**
 * Tests for the materializability scoping gate — pins the netFORUM wide-facade overflow case.
 *
 * 7 of 34 facades exceeded SQL Server's 1024-column limit. This gate must partition objects into
 * materializable vs overflow UP FRONT (with a non-destructive plan), never silently drop fields, and default
 * to advisory (the consumer scopes + tests the rest) with --strict available for a zero-overflow CI.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/floor/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    objectColumnCount,
    gradeMaterializability,
    DIALECT_COLUMN_LIMITS,
    SYSTEM_COLUMN_RESERVE,
} from './materializability.mjs';

test('objectColumnCount reads fieldCount or fields[]', () => {
    assert.equal(objectColumnCount({ name: 'a', fieldCount: 12 }), 12);
    assert.equal(objectColumnCount({ name: 'b', fields: [1, 2, 3] }), 3);
    assert.equal(objectColumnCount({ name: 'c' }), 0);
});

test('narrow objects all materialize (SQL Server budget)', () => {
    const v = gradeMaterializability([
        { name: 'contacts', fieldCount: 40 },
        { name: 'orders', fieldCount: 900 },
    ]);
    assert.equal(v.ok, true);
    assert.equal(v.materializable.length, 2);
    assert.equal(v.overflow.length, 0);
    assert.equal(v.budget, DIALECT_COLUMN_LIMITS.sqlserver - SYSTEM_COLUMN_RESERVE);
});

test('a wide facade overflows and gets a non-destructive plan (the netFORUM case)', () => {
    const v = gradeMaterializability([
        { name: 'memberFacade', fieldCount: 1500 }, // > 1024 - 8
        { name: 'contacts', fieldCount: 40 },
    ]);
    assert.equal(v.ok, false);
    assert.equal(v.excluded.length, 1);
    assert.equal(v.excluded[0], 'memberFacade');
    const plan = v.overflow[0];
    assert.equal(plan.object, 'memberFacade');
    assert.equal(plan.over, 1500 - v.budget);
    assert.equal(plan.strategy, 'custom-overflow-capture');
    assert.match(plan.detail, /Do NOT drop fields/);
    // the narrow object is still in the materializable set — the run is scoped, not failed
    assert.equal(v.materializable.length, 1);
    assert.equal(v.materializable[0].name, 'contacts');
});

test('postgres has a higher budget than sql server', () => {
    const obj = [{ name: 'wide', fieldCount: 1100 }];
    assert.equal(gradeMaterializability(obj, { dialect: 'sqlserver' }).ok, false);
    assert.equal(gradeMaterializability(obj, { dialect: 'postgres' }).ok, true);
});

test('boundary: exactly at budget materializes; one over overflows', () => {
    const budget = DIALECT_COLUMN_LIMITS.sqlserver - SYSTEM_COLUMN_RESERVE;
    assert.equal(gradeMaterializability([{ name: 'edge', fieldCount: budget }]).ok, true);
    assert.equal(gradeMaterializability([{ name: 'edge', fieldCount: budget + 1 }]).ok, false);
});
