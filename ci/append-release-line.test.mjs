// Tests for ci/append-release-line.mjs — run with: node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChannel,
  stripSqlComments,
  classifyDbImpact,
  appendRelease,
  assertOnlyMechanicalChange,
  parseCliArgs,
  MAX_MIGRATION_FILES,
  readMigrationAtRef,
  reconcileDbImpact,
} from './append-release-line.mjs';

const doc = () => ({
  edge: { newest: null },
  eras: { 5: { platform: { angular: '21.1.3' } } },
  lines: {
    '5.51': {
      status: 'certified',
      certifiedBuild: '5.51.0',
      newest: '5.51.1',
      certifiedDate: '2026-08-14',
      upgradeImpact: 'none',
      releases: { '5.51.1': { dbImpact: 'none' } },
      scorecard: 'certifications/5.51.0.md',
    },
  },
});

test('classifyChannel routes edge, line, and garbage', () => {
  assert.deepEqual(classifyChannel('6.1.0-edge.3'), { kind: 'edge' });
  assert.deepEqual(classifyChannel('5.51.2'), { kind: 'line', lineKey: '5.51' });
  assert.deepEqual(classifyChannel('10.0.0'), { kind: 'line', lineKey: '10.0' });
  assert.throws(() => classifyChannel('6.1.0-beta.1'), /neither X\.Y\.Z nor/);
  assert.throws(() => classifyChannel(''), /version is required/);
  assert.throws(() => classifyChannel(undefined), /version is required/);
});

test('stripSqlComments removes line and block comments', () => {
  assert.match(stripSqlComments('-- DROP TABLE x\nSELECT 1'), /^\s+\nSELECT 1$/);
  assert.equal(stripSqlComments('/* ALTER TABLE y */').trim(), '');
});

test('classifyDbImpact: no migrations means none', () => {
  assert.deepEqual(classifyDbImpact([], () => ''), { dbImpact: 'none', evidence: [] });
});

test('classifyDbImpact: data-only migrations mean metadata', () => {
  const v = classifyDbImpact(['migrations/v5/a.sql'], () => "INSERT INTO __mj.Entity (Name) VALUES ('x');");
  assert.equal(v.dbImpact, 'metadata');
  assert.equal(v.evidence.length, 1);
});

test('classifyDbImpact: DDL means schema, and names the file and keyword', () => {
  const v = classifyDbImpact(['migrations/v5/b.sql'], () => 'ALTER TABLE __mj.Entity ADD Foo INT;');
  assert.equal(v.dbImpact, 'schema');
  assert.deepEqual(v.evidence, ['migrations/v5/b.sql: ALTER']);
});

test('classifyDbImpact: a DDL keyword inside a comment does not trip it', () => {
  const v = classifyDbImpact(['migrations/v5/c.sql'], () => '-- we will DROP this next era\nUPDATE __mj.Entity SET Name=1;');
  assert.equal(v.dbImpact, 'metadata');
});

test('classifyDbImpact: the file cap is enforced, not just documented', () => {
  const many = Array.from({ length: MAX_MIGRATION_FILES + 1 }, (_, i) => `migrations/v5/${i}.sql`);
  assert.throws(() => classifyDbImpact(many, () => ''), /over the .* cap/);
});

test('appendRelease records an edge release and moves edge.newest', () => {
  const out = appendRelease(doc(), '6.1.0-edge.4', 'schema');
  assert.equal(out.edge.newest, '6.1.0-edge.4');
  assert.deepEqual(out.edge.releases, { '6.1.0-edge.4': { dbImpact: 'schema' } });
});

test('appendRelease records a line release without disturbing the existing ledger', () => {
  const out = appendRelease(doc(), '5.51.2', 'none');
  assert.equal(out.lines['5.51'].newest, '5.51.2');
  assert.deepEqual(out.lines['5.51'].releases, {
    '5.51.1': { dbImpact: 'none' },
    '5.51.2': { dbImpact: 'none' },
  });
});

test('appendRelease leaves certification fields alone', () => {
  const out = appendRelease(doc(), '5.51.2', 'none');
  assert.equal(out.lines['5.51'].status, 'certified');
  assert.equal(out.lines['5.51'].certifiedBuild, '5.51.0');
  assert.equal(out.lines['5.51'].certifiedDate, '2026-08-14');
});

test('appendRelease does not mutate its input', () => {
  const before = doc();
  appendRelease(before, '5.51.2', 'none');
  assert.equal(before.lines['5.51'].newest, '5.51.1');
});

test('appendRelease refuses an unknown line rather than inventing one', () => {
  assert.throws(() => appendRelease(doc(), '6.2.0', 'none'), /line 6\.2 is not in release-lines\.json/);
});

test('appendRelease rejects a dbImpact outside the enum', () => {
  assert.throws(() => appendRelease(doc(), '5.51.2', 'huge'), /not one of none\|metadata\|repair\|schema/);
});

test('assertOnlyMechanicalChange accepts a mechanical append', () => {
  const before = doc();
  assertOnlyMechanicalChange(before, appendRelease(before, '5.51.2', 'none'));
});

test('assertOnlyMechanicalChange rejects a status or date move', () => {
  const before = doc();
  const status = appendRelease(before, '5.51.2', 'none');
  status.lines['5.51'].status = 'eol';
  assert.throws(() => assertOnlyMechanicalChange(before, status), /non-mechanical field changed/);

  const dated = appendRelease(before, '5.51.2', 'none');
  dated.lines['5.51'].certifiedDate = '2026-01-01';
  assert.throws(() => assertOnlyMechanicalChange(before, dated), /non-mechanical field changed/);
});

test('parseCliArgs defaults, requires a version, and rejects typos', () => {
  assert.deepEqual(parseCliArgs(['--version', '5.51.2']), {
    version: '5.51.2', dbImpact: null, file: 'release-lines.json', since: null, until: 'HEAD', dryRun: false,
  });
  assert.deepEqual(parseCliArgs(['--version', '5.51.2', '--db-impact', 'metadata', '--since', 'v5.51.1', '--until', 'v5.51.2', '--dry-run']), {
    version: '5.51.2', dbImpact: 'metadata', file: 'release-lines.json', since: 'v5.51.1', until: 'v5.51.2', dryRun: true,
  });
  assert.throws(() => parseCliArgs([]), /--version is required/);
  assert.throws(() => parseCliArgs(['--dbimpact', 'none', '--version', 'x']), /unknown argument "--dbimpact"/);
});

test('readMigrationAtRef turns an ENOBUFS into an actionable message', () => {
  const boom = () => { const e = new Error('spawnSync git ENOBUFS'); e.code = 'ENOBUFS'; throw e; };
  assert.throws(
    () => readMigrationAtRef('HEAD', 'migrations/v5/huge.sql', boom),
    /exceeds the \d+-byte read cap — classify by hand with --db-impact/,
  );
});

test('readMigrationAtRef passes a maxBuffer through, and rethrows anything else', () => {
  let seen = null;
  readMigrationAtRef('HEAD', 'migrations/v5/a.sql', (_f, _a, opts) => { seen = opts; return 'SELECT 1'; });
  assert.ok(seen.maxBuffer > 1024 * 1024, 'maxBuffer must exceed 1MB or metadata syncs blow up');

  const other = () => { const e = new Error('not a git repo'); e.code = 'ENOENT'; throw e; };
  assert.throws(() => readMigrationAtRef('HEAD', 'x.sql', other), /not a git repo/);
});

test('reconcileDbImpact refuses a "none" claim when migrations actually shipped', () => {
  assert.throws(() => reconcileDbImpact('none', 'schema'), /contradicts the release contents/);
  assert.throws(() => reconcileDbImpact('none', 'metadata'), /contradicts the release contents/);
});

test('reconcileDbImpact allows a human to override the tripwire in the safe directions', () => {
  assert.equal(reconcileDbImpact('repair', 'schema'), 'repair');
  assert.equal(reconcileDbImpact('schema', 'metadata'), 'schema');
  assert.equal(reconcileDbImpact('none', 'none'), 'none');
});
