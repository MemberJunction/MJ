/**
 * Tests for the IOF `RelatedIntegrationObjectID` `@lookup` qualifier gate.
 *
 * Pins three things:
 *  1. The wrong `&IntegrationID=@parent:ID` is caught (the iMIS / GrowthZone deploy-rollback defect).
 *  2. The CORRECT `&IntegrationID=@parent:IntegrationID` is NOT flagged, and neither are the OTHER
 *     legitimate `@parent:ID` uses (an IOF's own `IntegrationObjectID:@parent:ID`, an IO's own
 *     `IntegrationID:@parent:ID`) — those are valid parent refs, only the FK qualifier is wrong.
 *  3. A drift guard: floor-check.workflow.js still WIRES this gate (runs the script + has the rule),
 *     so the enforcement can't be silently removed.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/floor/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isBadFkQualifier, findBadFkQualifiers } from './fk-lookup-qualifier.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOOKUP = '@lookup:MJ: Integration Objects.Name=Accounts';

// ── isBadFkQualifier ────────────────────────────────────────────────────────────────────────────
test('flags the wrong &IntegrationID=@parent:ID qualifier', () => {
    assert.equal(isBadFkQualifier(`${LOOKUP}&IntegrationID=@parent:ID`), true);
});

test('does NOT flag the correct &IntegrationID=@parent:IntegrationID (no substring false-positive)', () => {
    assert.equal(isBadFkQualifier(`${LOOKUP}&IntegrationID=@parent:IntegrationID`), false);
});

test('flags the wrong qualifier even with extra trailing params', () => {
    assert.equal(isBadFkQualifier(`${LOOKUP}&IntegrationID=@parent:ID&Status=Active`), true);
});

test('does NOT flag the correct qualifier with extra trailing params', () => {
    assert.equal(isBadFkQualifier(`${LOOKUP}&IntegrationID=@parent:IntegrationID&Status=Active`), false);
});

test('does NOT flag a plain @parent:ID that is not an @lookup', () => {
    assert.equal(isBadFkQualifier('@parent:ID'), false);
});

test('does NOT flag a soft-FK / non-lookup value', () => {
    assert.equal(isBadFkQualifier('Accounts'), false);
    assert.equal(isBadFkQualifier(''), false);
});

test('does NOT flag non-string values', () => {
    assert.equal(isBadFkQualifier(undefined), false);
    assert.equal(isBadFkQualifier(null), false);
    assert.equal(isBadFkQualifier(123), false);
    assert.equal(isBadFkQualifier({}), false);
});

test('tolerates whitespace around the qualifier value', () => {
    assert.equal(isBadFkQualifier(`${LOOKUP}&IntegrationID= @parent:ID `), true);
});

// ── findBadFkQualifiers ─────────────────────────────────────────────────────────────────────────
function record({ fkValue, prefixed = true, includeParentRefs = true }) {
    const iosKey = prefixed ? 'MJ: Integration Objects' : 'Integration Objects';
    const iofsKey = prefixed ? 'MJ: Integration Object Fields' : 'Integration Object Fields';
    return {
        fields: { Name: 'My Integration' },
        relatedEntities: {
            [iosKey]: [
                {
                    fields: {
                        Name: 'Contacts',
                        // An IO's OWN IntegrationID:@parent:ID is a CORRECT parent ref — must NOT be flagged.
                        ...(includeParentRefs ? { IntegrationID: '@parent:ID' } : {}),
                    },
                    relatedEntities: {
                        [iofsKey]: [
                            {
                                fields: {
                                    Name: 'AccountID',
                                    // An IOF's OWN IntegrationObjectID:@parent:ID is a CORRECT parent ref.
                                    ...(includeParentRefs ? { IntegrationObjectID: '@parent:ID' } : {}),
                                    RelatedIntegrationObjectID: fkValue,
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };
}

test('finds a bad FK qualifier nested under IO (MJ:-prefixed keys)', () => {
    const v = findBadFkQualifiers(record({ fkValue: `${LOOKUP}&IntegrationID=@parent:ID` }));
    assert.equal(v.length, 1);
    assert.equal(v[0].io, 'Contacts');
    assert.equal(v[0].iof, 'AccountID');
    assert.equal(v[0].integration, 'My Integration');
});

test('finds a bad FK qualifier with bare (non-prefixed) related-entity keys', () => {
    const v = findBadFkQualifiers(record({ fkValue: `${LOOKUP}&IntegrationID=@parent:ID`, prefixed: false }));
    assert.equal(v.length, 1);
});

test('accepts the array form [record]', () => {
    const v = findBadFkQualifiers([record({ fkValue: `${LOOKUP}&IntegrationID=@parent:ID` })]);
    assert.equal(v.length, 1);
});

test('correct qualifier → zero violations, and the legitimate @parent:ID parent-refs are NOT flagged', () => {
    const v = findBadFkQualifiers(record({ fkValue: `${LOOKUP}&IntegrationID=@parent:IntegrationID` }));
    assert.deepEqual(v, []);
});

test('an IOF with no FK at all → zero violations', () => {
    const v = findBadFkQualifiers(record({ fkValue: undefined }));
    assert.deepEqual(v, []);
});

test('empty / malformed records → no throw, zero violations', () => {
    assert.deepEqual(findBadFkQualifiers(null), []);
    assert.deepEqual(findBadFkQualifiers({}), []);
    assert.deepEqual(findBadFkQualifiers([null, {}, 5]), []);
});

// ── Drift guard: floor-check must keep WIRING this gate ───────────────────────────────────────────
test('DRIFT GUARD: floor-check.workflow.js still wires the fk-lookup-qualifier gate', () => {
    const floorCheck = readFileSync(resolve(__dirname, '..', 'primitives', 'floor-check.workflow.js'), 'utf8');
    assert.ok(
        floorCheck.includes('fk-lookup-qualifier.mjs'),
        'floor-check must run floor/fk-lookup-qualifier.mjs as a subprocess (the agent fetch step)',
    );
    assert.ok(
        floorCheck.includes('fkLookupQualifierJson'),
        'floor-check must capture the script output as fkLookupQualifierJson and parse it in JS',
    );
    assert.ok(
        floorCheck.includes('fk-lookup-qualifier-wrong'),
        'floor-check must push the fk-lookup-qualifier-wrong failure rule when violations are found',
    );
});
