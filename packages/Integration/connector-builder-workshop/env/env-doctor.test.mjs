/**
 * Tests for the deterministic env-sanity precheck.
 *
 * Pins the three corruption signatures that get mis-diagnosed as framework bugs:
 *  1. sproc param count != table column count (stale-sproc / baseline drift) is caught; equal passes.
 *  2. a stale dist (srcMtime > distMtime) is caught; a missing dist is caught.
 *  3. a manifest that did not load is caught.
 *  4. fully-clean facts compose to ok:true with zero failures.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/env/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    checkSprocParamVsColumns,
    checkManifestLoads,
    checkDistBuilt,
    runDoctor,
} from './env-doctor.mjs';

// ── checkSprocParamVsColumns ──────────────────────────────────────────────────────────────────────
test('flags an entity whose sproc param count != column count (stale-sproc / baseline drift)', () => {
    const v = checkSprocParamVsColumns([{ name: 'IntegrationObject', sprocParamCount: 12, columnCount: 14 }]);
    assert.equal(v.length, 1);
    assert.deepEqual(v[0], { entity: 'IntegrationObject', sprocParamCount: 12, columnCount: 14 });
});

test('does NOT flag an entity whose sproc param count == column count', () => {
    const v = checkSprocParamVsColumns([{ name: 'IntegrationObject', sprocParamCount: 14, columnCount: 14 }]);
    assert.equal(v.length, 0);
});

test('checks every entity independently (mixed good/bad)', () => {
    const v = checkSprocParamVsColumns([
        { name: 'Good', sprocParamCount: 10, columnCount: 10 },
        { name: 'Drifted', sprocParamCount: 9, columnCount: 11 },
    ]);
    assert.equal(v.length, 1);
    assert.equal(v[0].entity, 'Drifted');
});

// ── checkDistBuilt ────────────────────────────────────────────────────────────────────────────────
test('flags a stale dist (srcMtime > distMtime)', () => {
    const v = checkDistBuilt([{ package: '@memberjunction/integration-engine', srcMtime: 2000, distMtime: 1000, distExists: true }]);
    assert.equal(v.length, 1);
    assert.equal(v[0].package, '@memberjunction/integration-engine');
    assert.equal(v[0].reason, 'stale');
});

test('flags a missing dist regardless of mtimes', () => {
    const v = checkDistBuilt([{ package: '@memberjunction/core', srcMtime: 1000, distMtime: 0, distExists: false }]);
    assert.equal(v.length, 1);
    assert.equal(v[0].reason, 'missing');
});

test('does NOT flag a current dist (distMtime >= srcMtime, exists)', () => {
    const v = checkDistBuilt([{ package: '@memberjunction/core', srcMtime: 1000, distMtime: 2000, distExists: true }]);
    assert.equal(v.length, 0);
});

test('does NOT flag a dist whose mtime equals src mtime', () => {
    const v = checkDistBuilt([{ package: '@memberjunction/core', srcMtime: 1500, distMtime: 1500, distExists: true }]);
    assert.equal(v.length, 0);
});

// ── checkManifestLoads ────────────────────────────────────────────────────────────────────────────
test('flags a manifest that did not load', () => {
    const v = checkManifestLoads({ loaded: false, error: 'CLASS_REGISTRATIONS import threw' });
    assert.equal(v.length, 1);
    assert.equal(v[0].loaded, false);
    assert.equal(v[0].error, 'CLASS_REGISTRATIONS import threw');
});

test('does NOT flag a manifest that loaded', () => {
    const v = checkManifestLoads({ loaded: true });
    assert.equal(v.length, 0);
});

// ── runDoctor (composition) ───────────────────────────────────────────────────────────────────────
test('fully-clean facts compose to ok:true with no failures', () => {
    const verdict = runDoctor({
        entities: [{ name: 'IntegrationObject', sprocParamCount: 14, columnCount: 14 }],
        manifest: { loaded: true },
        dist: [{ package: '@memberjunction/integration-engine', srcMtime: 1000, distMtime: 2000, distExists: true }],
    });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.failures.length, 0);
});

test('runDoctor aggregates failures across all three checks', () => {
    const verdict = runDoctor({
        entities: [{ name: 'Drifted', sprocParamCount: 1, columnCount: 2 }],
        manifest: { loaded: false, error: 'no manifest' },
        dist: [{ package: '@memberjunction/core', srcMtime: 5, distMtime: 1, distExists: true }],
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.failures.length, 3);
    const checks = verdict.failures.map((f) => f.check).sort();
    assert.deepEqual(checks, ['dist-built', 'manifest-loads', 'sproc-param-vs-columns']);
});

test('runDoctor treats absent manifest facts as a failure (fail-closed)', () => {
    const verdict = runDoctor({ entities: [], dist: [] });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.failures.some((f) => f.check === 'manifest-loads'), true);
});
