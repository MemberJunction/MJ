/**
 * Tests for the deliverable manifest + clean-stage partition + canonical-format guard.
 *
 * Pins the "human trims the PR" failures: generated-tree / config / lockfile / tooling churn must be EXCLUDED;
 * the real deliverables (connector, test, index, metadata, credential type + schema, changeset) must be STAGED;
 * an unrecognized framework-src edit must be surfaced for REVIEW (not silently staged or dropped); and a
 * minified metadata file must be caught by the canonical-format guard.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/scripts/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deliverablePaths,
    parseStatusLine,
    partitionStatus,
    assertCanonicalMetadata,
} from './deliverable-manifest.mjs';

const D = deliverablePaths({ vendorSlug: 'membersuite', className: 'MemberSuiteConnector' });

test('parseStatusLine handles plain + renamed entries', () => {
    assert.deepEqual(parseStatusLine(' M packages/x.ts'), { status: 'M', path: 'packages/x.ts' });
    assert.deepEqual(parseStatusLine('A  a.ts -> b.ts'), { status: 'A', path: 'b.ts' });
});

test('stages exactly the deliverables', () => {
    const lines = [
        ' A packages/Integration/connectors/src/MemberSuiteConnector.ts',
        ' A packages/Integration/connectors/src/__tests__/MemberSuiteConnector.test.ts',
        ' M packages/Integration/connectors/src/index.ts',
        ' A metadata/integrations/membersuite/.membersuite.integration.json',
        ' A metadata/integrations/membersuite/schemas/x.schema.json',
        ' M metadata/credential-types/.credential-types.json',
        ' A metadata/credential-types/schemas/membersuite-api.schema.json',
        ' A .changeset/membersuite-connector.md',
    ];
    const { stage, exclude, review } = partitionStatus(lines, D);
    assert.equal(stage.length, 8, 'all eight deliverables staged');
    assert.equal(exclude.length, 0);
    assert.equal(review.length, 0);
});

test('excludes generated-tree / config / lockfile / tooling churn with reasons', () => {
    const lines = [
        ' M packages/MJCoreEntities/src/generated/entity_subclasses.ts',
        ' M packages/MJAPI/src/generated/generated.ts',
        ' M mj.config.cjs',
        ' M .vscode/settings.json',
        ' M package-lock.json',
        ' M packages/Integration/connector-builder-workshop/plans/x.workflow.js',
        ' A packages/Integration/connectors-registry/membersuite/PROVENANCE.json',
        ' A metadata/integrations/membersuite/.backups/old.json',
    ];
    const { stage, exclude } = partitionStatus(lines, D);
    assert.equal(stage.length, 0, 'none of the churn is staged');
    const reasons = exclude.reduce((m, e) => ((m[e.reason] = (m[e.reason] ?? 0) + 1), m), {});
    assert.ok(reasons['generated-tree'] >= 2);
    assert.equal(reasons['local-config'], 2);
    assert.equal(reasons['lockfile'], 1);
    assert.ok(reasons['tooling'] >= 2);
    assert.equal(reasons['backup-or-run-artifact'], 1);
});

test('surfaces an unrecognized framework-src change for review (not auto-staged)', () => {
    const lines = [' M packages/Integration/engine/src/auth-helpers/OAuth2TokenManager.ts'];
    const { stage, exclude, review } = partitionStatus(lines, D);
    assert.equal(stage.length, 0);
    assert.equal(exclude.length, 0);
    assert.equal(review.length, 1);
    assert.equal(review[0].note, 'framework-src-change');
});

test('canonical-format guard catches a minified metadata one-liner', () => {
    const minified = JSON.stringify({ fields: { Name: 'x' }, relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'a' } }] } });
    const v = assertCanonicalMetadata(minified);
    assert.equal(v.ok, false);
    assert.match(v.reason, /minified/);
});

test('canonical-format guard passes an indent=2 file', () => {
    const pretty = JSON.stringify({ fields: { Name: 'x' }, relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'a' } }] } }, null, 2);
    assert.equal(assertCanonicalMetadata(pretty).ok, true);
});

test('canonical-format guard tolerates a trivial single-key object (no false positive)', () => {
    // `{}` and a tiny object that stringify keeps short — must not be flagged as minified
    assert.equal(assertCanonicalMetadata('{}').ok, true);
});
