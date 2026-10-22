#!/usr/bin/env node
/**
 * report.mjs — merge per-gate result files ($TRUTH_RESULTS_DIR/gates/<GateID>.json) into results.json, summary.md,
 * and outcomes.json (the integration tier's shipped EMIT_OUTCOMES camelCase shape).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = process.env.TRUTH_RESULTS_DIR;
if (!resultsDir) {
  console.error('TRUTH_RESULTS_DIR is not set');
  process.exit(1);
}
mkdirSync(resultsDir, { recursive: true });

const registry = JSON.parse(readFileSync(path.join(root, 'gates', 'gates.json'), 'utf8'));
const gatesDir = path.join(resultsDir, 'gates');

const results = registry.map((gate) => {
  const file = path.join(gatesDir, `${gate.GateID}.json`);
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  return {
    GateID: gate.GateID, TestName: gate.TestName, OwnerPR: gate.OwnerPR, Status: gate.Status, RunMode: gate.RunMode,
    Outcome: 'not-run', Measured: {}, Detail: 'no result written', Threshold: gate.Threshold,
    DurationMs: 0, Error: null, RunID: process.env.TRUTH_RUN_ID || 'local', MJCommit: process.env.TRUTH_MJ_COMMIT || 'unknown',
  };
});

writeFileSync(path.join(resultsDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

const passingOutcomes = new Set(['pass', 'xfail', 'xpass', 'not-implemented', 'not-run']);
const outcomes = results.map((r) => ({
  name: r.TestName,
  passed: passingOutcomes.has(r.Outcome),
  durationMs: r.DurationMs,
  error:
    r.Outcome === 'pass'
      ? r.Error
      : `${r.Outcome}${r.Error ? `: ${r.Error}` : r.Detail ? `: ${r.Detail}` : ''}`,
}));
writeFileSync(path.join(resultsDir, 'outcomes.json'), `${JSON.stringify(outcomes, null, 2)}\n`);

const count = (outcome) => results.filter((r) => r.Outcome === outcome).length;
const P = count('pass');
const F = count('fail');
const X = count('xfail');
const Y = count('xpass');
const N = count('not-implemented');
const R = count('not-run');
const E = count('error');

const summaryLines = [
  '# Predictive Studio Truth Suite Summary',
  '',
  `pass ${P} · fail ${F} · xfail ${X} · xpass ${Y} · not-implemented ${N} · not-run ${R} · error ${E} (${results.length} gates)`,
  '',
  '## By Owner PR',
  '| Owner PR | pass | fail | xfail | xpass | not-implemented | not-run | error |',
  '|---|---|---|---|---|---|---|---|',
  ...[1, 2, 3, 4, 5].map((pr) => {
    const sub = results.filter((r) => r.OwnerPR === pr);
    const c = (o) => sub.filter((r) => r.Outcome === o).length;
    return `| PR ${pr} | ${c('pass')} | ${c('fail')} | ${c('xfail')} | ${c('xpass')} | ${c('not-implemented')} | ${c('not-run')} | ${c('error')} |`;
  }),
  '',
];

const notable = results.filter((r) => r.Outcome === 'fail' || r.Outcome === 'error' || r.Outcome === 'xpass');
if (notable.length > 0) {
  summaryLines.push('## Notable Outcomes (`fail` / `error` / `xpass`)', '');
  for (const r of notable) {
    summaryLines.push(`- **${r.GateID} (${r.TestName})** — \`${r.Outcome}\`: ${r.Detail || r.Error || ''} \`${JSON.stringify(r.Measured)}\``);
  }
  summaryLines.push('');
}

writeFileSync(path.join(resultsDir, 'summary.md'), `${summaryLines.join('\n')}\n`);
console.log(`truth suite: pass ${P} · fail ${F} · xfail ${X} · xpass ${Y} · not-implemented ${N} · not-run ${R} · error ${E} (${results.length} gates)`);
process.exit(F > 0 || E > 0 ? 1 : 0);
