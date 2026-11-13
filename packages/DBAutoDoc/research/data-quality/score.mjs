#!/usr/bin/env node
// score.mjs — recall of a data quality run against the defects inject-defects.sql planted.
//
//   node score.mjs <data-quality.json> [expected.json] [--baseline <data-quality.json of the untouched copy>]
//
// Recall: share of expected findings present (same Kind, table, and column when given; Severity
// too when the expectation names one). With --baseline, also lists findings that appear only
// after injection but were not expected (unplanned side effects) and summarises what the untouched
// database reports, by kind, for a precision review.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const baselineIndex = args.indexOf('--baseline');
const baselinePath = baselineIndex >= 0 ? args.splice(baselineIndex, 2)[1] : undefined;
const [reportPath, expectedPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'expected.json')] = args;
if (!reportPath) {
  console.error('usage: node score.mjs <data-quality.json> [expected.json] [--baseline <data-quality.json>]');
  process.exit(2);
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
const lower = (s) => (s ?? '').toLowerCase();
const matches = (f, e) =>
  f.Kind === e.Kind &&
  lower(f.SchemaName) === lower(e.SchemaName) &&
  lower(f.TableName) === lower(e.TableName) &&
  (e.ColumnName === undefined || lower(f.ColumnName) === lower(e.ColumnName)) &&
  (e.Severity === undefined || f.Severity === e.Severity);

let found = 0;
console.log('Expected finding'.padEnd(70), 'Found');
for (const e of expected) {
  const hit = report.Findings.find((f) => matches(f, e));
  if (hit) found++;
  const label = `${e.Kind} ${e.SchemaName}.${e.TableName}${e.ColumnName ? '.' + e.ColumnName : ''}${e.Severity ? ` (${e.Severity})` : ''}`;
  console.log(label.padEnd(70), hit ? `yes  ${hit.Message}` : 'NO');
}
console.log(`\nRecall: ${found}/${expected.length} (${((found / expected.length) * 100).toFixed(1)}%)`);
console.log(`Phase: ${report.Phase?.Status}; tables probed ${report.Phase?.TablesProbed}/${report.Phase?.TotalTables}; relationships ${report.Phase?.RelationshipsProbed}; probe time ${((report.Phase?.ProbeDurationMs ?? 0) / 1000).toFixed(1)}s`);
console.log(`Findings: ${report.Findings.length} (${report.Counts.error} errors, ${report.Counts.warning} warnings, ${report.Counts.info} info)`);

if (baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const key = (f) => f.Id;
  const before = new Set(baseline.Findings.map(key));
  const added = report.Findings.filter((f) => !before.has(key(f)));
  const unplanned = added.filter((f) => !expected.some((e) => matches(f, e)) && !['IsolatedTable', 'StaleRowCountEstimate'].includes(f.Kind));
  console.log(`\nNew after injection: ${added.length}; not in expected.json: ${unplanned.length}`);
  for (const f of unplanned) console.log(`  ${f.Severity.padEnd(7)} ${f.Id}: ${f.Message}`);
  const byKind = {};
  for (const f of baseline.Findings) byKind[`${f.Severity} ${f.Kind}`] = (byKind[`${f.Severity} ${f.Kind}`] ?? 0) + 1;
  console.log('\nUntouched database, findings by severity and kind:');
  for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
}
