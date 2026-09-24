// Tests for ci/validate-release-lines.mjs — run with: node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStructure,
  checkPushFreeze,
  checkPrTransitions,
  findDualCertified,
  parseCliArgs,
  stableStringify,
} from './validate-release-lines.mjs';
import { isPermanentTagError } from './dist-tag-all.mjs';

const minimal = () => ({
  edge: { newest: null },
  eras: { 5: { platform: { angular: '21.1.3', node: '>=18.0.0' } } },
  lines: {},
});

const certifiedLine = () => ({
  status: 'certified',
  certifiedBuild: '6.1.1',
  newest: '6.1.3',
  candidateDate: '2026-09-28',
  certifiedDate: '2026-10-06',
  supportEnds: '2027-02-06',
  upgradeImpact: 'none',
  releases: {
    '6.1.2': { dbImpact: 'none' },
    '6.1.3': { dbImpact: 'schema', labels: ['security-exception'] },
  },
  scorecard: 'certifications/6.1.1.md',
});

test('structural: minimal document passes', () => {
  assert.deepEqual(validateStructure(minimal()), []);
});

test('structural: full certified line passes', () => {
  const doc = minimal();
  doc.lines['6.1'] = certifiedLine();
  assert.deepEqual(validateStructure(doc), []);
});

test('structural: edge.newest must be an -edge.N version or null', () => {
  const doc = minimal();
  doc.edge.newest = '6.2.0';
  assert.equal(validateStructure(doc).length, 1);
  doc.edge.newest = '6.2.0-edge.14';
  assert.deepEqual(validateStructure(doc), []);
});

test('structural: edge.releases ledger accepts -edge.N entries', () => {
  const doc = minimal();
  doc.edge.newest = '6.2.0-edge.14';
  doc.edge.releases = {
    '6.2.0-edge.13': { dbImpact: 'schema', labels: ['security-exception'] },
    '6.2.0-edge.14': { dbImpact: 'none' },
  };
  assert.deepEqual(validateStructure(doc), []);
});

test('structural: edge.releases rejects non-edge keys and bad dbImpact', () => {
  const doc = minimal();
  doc.edge.newest = '6.2.0-edge.14';
  doc.edge.releases = { '6.2.0': { dbImpact: 'none' } };
  assert.ok(validateStructure(doc).some((e) => e.includes('"6.2.0" is not an X.Y.Z-edge.N version')));
  doc.edge.releases = { '6.2.0-edge.14': { dbImpact: 'ddl' } };
  assert.ok(validateStructure(doc).some((e) => e.includes('edge.releases.6.2.0-edge.14.dbImpact')));
});

test('push freeze: edge ledger appends are mechanical', () => {
  const base = minimal();
  base.edge.newest = '6.2.0-edge.14';
  const head = structuredClone(base);
  head.edge.newest = '6.2.0-edge.15';
  head.edge.releases = { '6.2.0-edge.15': { dbImpact: 'metadata' } };
  assert.deepEqual(checkPushFreeze(base, head), []);
});

test('structural: missing keys and unknown keys are reported', () => {
  const errors = validateStructure({ extra: true });
  assert.ok(errors.some((e) => e.includes('missing required key "edge"')));
  assert.ok(errors.some((e) => e.includes('unknown key "extra"')));
});

test('structural: bad status is rejected', () => {
  const doc = minimal();
  doc.lines['6.1'] = { status: 'blessed' };
  assert.ok(validateStructure(doc).some((e) => e.includes('lines.6.1.status')));
});

test('structural: certified status requires certifiedBuild, certifiedDate, scorecard', () => {
  const doc = minimal();
  doc.lines['6.1'] = { status: 'certified' };
  const errors = validateStructure(doc);
  for (const f of ['certifiedBuild', 'certifiedDate', 'scorecard']) {
    assert.ok(errors.some((e) => e.includes(`requires "${f}"`)), `expected error for ${f}`);
  }
});

test('structural: release versions must belong to the line', () => {
  const doc = minimal();
  const line = certifiedLine();
  line.releases['6.10.0'] = { dbImpact: 'none' };
  doc.lines['6.1'] = line;
  assert.ok(validateStructure(doc).some((e) => e.includes('"6.10.0"')));
});

test('structural: certifiedBuild must sit on the line', () => {
  const doc = minimal();
  const line = certifiedLine();
  line.certifiedBuild = '6.2.0';
  doc.lines['6.1'] = line;
  assert.ok(validateStructure(doc).some((e) => e.includes('6.2.0 is not on line 6.1')));
});

test('structural: dbImpact enum enforced', () => {
  const doc = minimal();
  const line = certifiedLine();
  line.releases['6.1.2'] = { dbImpact: 'ddl' };
  doc.lines['6.1'] = line;
  assert.ok(validateStructure(doc).some((e) => e.includes('dbImpact')));
});

test('structural: dbImpact accepts repair (codegen-repair tier, doc §12)', () => {
  const doc = minimal();
  const line = certifiedLine();
  line.newest = '6.1.4';
  line.releases['6.1.4'] = { dbImpact: 'repair', labels: ['codegen-repair'] };
  doc.lines['6.1'] = line;
  assert.deepEqual(validateStructure(doc), []);
});

test('push freeze: mechanical fields may change', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const head = structuredClone(base);
  head.edge.newest = '6.2.0-edge.5';
  head.lines['6.1'].newest = '6.1.4';
  head.lines['6.1'].releases['6.1.4'] = { dbImpact: 'none' };
  assert.deepEqual(checkPushFreeze(base, head), []);
});

test('push freeze: status change is rejected', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const head = structuredClone(base);
  head.lines['6.1'].status = 'maintenance';
  assert.equal(checkPushFreeze(base, head).length, 1);
});

test('push freeze: adding or removing a line is rejected', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const added = structuredClone(base);
  added.lines['6.2'] = { status: 'candidate' };
  assert.ok(checkPushFreeze(base, added).some((e) => e.includes('added')));
  const removed = structuredClone(base);
  delete removed.lines['6.1'];
  assert.ok(checkPushFreeze(base, removed).some((e) => e.includes('removed')));
});

test('push freeze: platform manifest change is rejected', () => {
  const base = minimal();
  const head = structuredClone(base);
  head.eras['5'].platform.angular = '22.0.0';
  assert.ok(checkPushFreeze(base, head).some((e) => e.includes('platform')));
});

test('pr transitions: candidate → certified is legal', () => {
  const base = minimal();
  base.lines['6.1'] = { status: 'candidate', candidateDate: '2026-09-28' };
  const head = structuredClone(base);
  head.lines['6.1'] = certifiedLine();
  head.lines['6.1'].candidateDate = '2026-09-28';
  assert.deepEqual(checkPrTransitions(base, head), []);
});

test('pr transitions: certified → candidate is illegal', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const head = structuredClone(base);
  head.lines['6.1'].status = 'candidate';
  assert.ok(checkPrTransitions(base, head).some((e) => e.includes('illegal transition')));
});

test('pr transitions: supportEnds is extend-only', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const shrink = structuredClone(base);
  shrink.lines['6.1'].supportEnds = '2027-01-01';
  assert.ok(checkPrTransitions(base, shrink).some((e) => e.includes('extend-only')));
  const extend = structuredClone(base);
  extend.lines['6.1'].supportEnds = '2027-06-06';
  assert.deepEqual(checkPrTransitions(base, extend), []);
});

test('pr transitions: certifiedBuild immutable once set', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const head = structuredClone(base);
  head.lines['6.1'].certifiedBuild = '6.1.2';
  assert.ok(checkPrTransitions(base, head).some((e) => e.includes('immutable')));
});

test('pr transitions: new lines must start as candidate', () => {
  const base = minimal();
  // A line declared certified with NO evidence it was ever a candidate is still refused.
  const head = structuredClone(base);
  head.lines['6.2'] = { ...certifiedLine(), candidateDate: undefined };
  delete head.lines['6.2'].candidateDate;
  assert.ok(checkPrTransitions(base, head).some((e) => e.includes('must start as "candidate"')));
  const ok = structuredClone(base);
  ok.lines['6.2'] = { status: 'candidate' };
  assert.deepEqual(checkPrTransitions(base, ok), []);
});

test('pr transitions: a new line carrying candidateDate may arrive past candidate', () => {
  // `main` only advances by release merges and every push to `main` publishes, so a line
  // certified on `next` between two releases cannot be walked through candidate->certified
  // on `main` in two PRs — that would be two publishes. candidateDate is the evidence the
  // candidacy happened; checkLineTransition holds it immutable once set, so it cannot be
  // backdated later. Regression for line 5.51 (cut 2026-07-31, certified 2026-08-14, with
  // v6.1.0-edge.2 merging 2026-08-12 in between).
  const base = minimal();
  const head = structuredClone(base);
  head.lines['5.51'] = {
    status: 'certified',
    certifiedBuild: '5.51.0',
    candidateDate: '2026-07-31',
    certifiedDate: '2026-08-14',
    supportEnds: '2027-02-14',
    upgradeImpact: 'none',
    scorecard: 'certifications/5.51.0.md',
  };
  assert.deepEqual(checkPrTransitions(base, head), []);

  // Still refused for any post-candidate status with no candidateDate.
  for (const status of ['certified', 'maintenance', 'eol', 'withdrawn']) {
    const bad = structuredClone(base);
    bad.lines['5.52'] = { status };
    assert.ok(
      checkPrTransitions(base, bad).some((e) => e.includes('must start as "candidate"')),
      `status ${status} without candidateDate should be refused`,
    );
  }
});

test('pr transitions: removing a line is rejected', () => {
  const base = minimal();
  base.lines['6.1'] = certifiedLine();
  const head = structuredClone(base);
  delete head.lines['6.1'];
  assert.ok(checkPrTransitions(base, head).some((e) => e.includes('never deleted')));
});

test('cli args: defaults and validation', () => {
  assert.deepEqual(parseCliArgs([]), { file: 'release-lines.json', base: null, mode: null });
  assert.deepEqual(parseCliArgs(['--base', 'origin/next', '--mode', 'pr']).mode, 'pr');
  assert.throws(() => parseCliArgs(['--base', 'origin/next']), /--mode/);
  assert.throws(() => parseCliArgs(['--bogus']), /unknown argument/);
});

test('findDualCertified: warns only when two or more lines are certified', () => {
  const doc = minimal();
  assert.deepEqual(findDualCertified(doc), []);
  doc.lines['6.1'] = certifiedLine();
  assert.deepEqual(findDualCertified(doc), []);
  doc.lines['6.2'] = certifiedLine();
  assert.deepEqual(findDualCertified(doc), ['6.1', '6.2']);
  doc.lines['6.1'].status = 'maintenance';
  assert.deepEqual(findDualCertified(doc), []);
});

test('isPermanentTagError: version-not-found signatures are permanent, transient errors are not', () => {
  assert.equal(isPermanentTagError('npm error dist-tag add: version 6.1.0 does not exist'), true);
  assert.equal(isPermanentTagError('npm error code E404'), true);
  assert.equal(isPermanentTagError('404 Not Found - PUT https://registry.npmjs.org/...'), true);
  assert.equal(isPermanentTagError('ETIMEDOUT connect timed out'), false);
  assert.equal(isPermanentTagError('503 Service Unavailable'), false);
  assert.equal(isPermanentTagError(undefined), false);
});

test('stableStringify: key order does not matter', () => {
  assert.equal(stableStringify({ a: 1, b: [2, { d: 3, c: 4 }] }), stableStringify({ b: [2, { c: 4, d: 3 }], a: 1 }));
});
