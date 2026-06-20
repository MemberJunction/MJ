import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintFootprint } from './footprint-lint.mjs';

test('class + test + index + metadata/integrations/acme paths all pass for vendor "acme"', () => {
    const { violations } = lintFootprint('acme', [
        'packages/Integration/connectors/src/AcmeConnector.ts',
        'packages/Integration/connectors/src/__tests__/AcmeConnector.test.ts',
        'packages/Integration/connectors/src/index.ts',
        'metadata/integrations/acme/.acme.integration.json',
        'metadata/integrations/acme/PROVENANCE.json',
    ]);
    assert.deepEqual(violations, []);
});

test('a connectors-registry path is flagged', () => {
    const { violations } = lintFootprint('acme', [
        'packages/Integration/connectors/src/AcmeConnector.ts',
        'packages/Integration/connectors-registry/acme/src/AcmeConnector.ts',
    ]);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'packages/Integration/connectors-registry/acme/src/AcmeConnector.ts');
    assert.equal(violations[0].why, 'outside canonical connector footprint');
});

test('a root fixtures/acme.json path is flagged', () => {
    const { violations } = lintFootprint('acme', ['fixtures/acme.json']);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'fixtures/acme.json');
    assert.equal(violations[0].why, 'outside canonical connector footprint');
});

test('a stray top-level doc is flagged', () => {
    const { violations } = lintFootprint('acme', ['ACME_NOTES.md']);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'ACME_NOTES.md');
});

test('another vendor\'s metadata dir is flagged (wrong vendor)', () => {
    const { violations } = lintFootprint('acme', ['metadata/integrations/widgetco/.widgetco.integration.json']);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].path, 'metadata/integrations/widgetco/.widgetco.integration.json');
});

test('the metadata dir itself (no file under it) is NOT in-footprint', () => {
    const { violations } = lintFootprint('acme', ['metadata/integrations/acme/']);
    assert.equal(violations.length, 1);
});

test('path matching is case-sensitive — Metadata/ is flagged', () => {
    const { violations } = lintFootprint('acme', ['Metadata/integrations/acme/.acme.integration.json']);
    assert.equal(violations.length, 1);
});

test('a src file that is not a *Connector.ts is flagged', () => {
    const { violations } = lintFootprint('acme', ['packages/Integration/connectors/src/helpers.ts']);
    assert.equal(violations.length, 1);
});

test('a backslash-separated and ./-prefixed path normalizes and passes', () => {
    const { violations } = lintFootprint('acme', ['./packages\\Integration\\connectors\\src\\AcmeConnector.ts']);
    assert.deepEqual(violations, []);
});

test('blank path entries are ignored', () => {
    const { violations } = lintFootprint('acme', ['', '   ', 'packages/Integration/connectors/src/index.ts']);
    assert.deepEqual(violations, []);
});

test('a file directly under src named like a test but not under __tests__ is flagged', () => {
    const { violations } = lintFootprint('acme', ['packages/Integration/connectors/src/AcmeConnector.test.ts']);
    // <X> would be "AcmeConnector.test" which does not match /^[^/]+Connector\.ts$/, so it's outside.
    assert.equal(violations.length, 1);
});
