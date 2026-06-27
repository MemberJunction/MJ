/**
 * Tests for reality-probe-stage-present.mjs — the plan-source RealityProbe-stage gate.
 * Run: node --test reality-probe-stage-present.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRealityProbeStagePresent } from './reality-probe-stage-present.mjs';

const planWithProbe = `
  phase('EnvPreflight');
  phase('MetadataWrite');
  phase('RealityProbe');
  phase('ProbeAmend');
  phase('CodeBuild');
`;

const planWithoutProbe = `
  phase('EnvPreflight');
  phase('MetadataWrite');
  phase('CodeBuild');
  phase('HybridE2E');
`;

test('a new plan with RealityProbe + ProbeAmend passes clean', () => {
    const v = decideRealityProbeStagePresent(planWithProbe, { mode: 'new' });
    assert.equal(v.pass, true);
    assert.equal(v.hasProbe, true);
    assert.equal(v.hasProbeAmend, true);
    assert.equal(v.warnings.length, 0);
});

test('the GZ omission — a new plan WITHOUT RealityProbe is rejected', () => {
    const v = decideRealityProbeStagePresent(planWithoutProbe, { mode: 'new' });
    assert.equal(v.pass, false);
    assert.equal(v.failures[0].rule, 'reality-probe-stage-absent');
});

test('a redo plan without RealityProbe is rejected (full build, must probe)', () => {
    const v = decideRealityProbeStagePresent(planWithoutProbe, { mode: 'redo' });
    assert.equal(v.pass, false);
    assert.equal(v.failures[0].rule, 'reality-probe-stage-absent');
});

test('an additive re-prove plan is exempt (scoped delta test, not a full probe)', () => {
    const v = decideRealityProbeStagePresent(planWithoutProbe, { mode: 'additive' });
    assert.equal(v.pass, true);
});

test('probe present but ProbeAmend absent is a WARNING, not a failure', () => {
    const src = "phase('RealityProbe');\nphase('CodeBuild');";
    const v = decideRealityProbeStagePresent(src, { mode: 'new' });
    assert.equal(v.pass, true);
    assert.equal(v.warnings.length, 1);
    assert.equal(v.warnings[0].rule, 'reality-probe-amend-absent');
});

test('tolerant of single/double quotes and whitespace', () => {
    assert.equal(decideRealityProbeStagePresent('phase( "RealityProbe" )', { mode: 'new' }).hasProbe, true);
    assert.equal(decideRealityProbeStagePresent("phase('RealityProbe')", { mode: 'new' }).hasProbe, true);
});

test('empty plan source fails closed for a full build', () => {
    const v = decideRealityProbeStagePresent('', { mode: 'new' });
    assert.equal(v.pass, false);
    assert.equal(v.failures[0].rule, 'reality-probe-stage-absent');
});

test('default mode is new (no opts) and requires the probe', () => {
    assert.equal(decideRealityProbeStagePresent(planWithoutProbe).pass, false);
    assert.equal(decideRealityProbeStagePresent(planWithProbe).pass, true);
});
