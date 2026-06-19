/**
 * Assemble RETEST_RESULTS.md from /tmp/retest-row-<dir>.json + /tmp/retest-deploy-<dir>.json.
 * argv[2] = output path; argv[3..] = connector dir order.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = process.argv[2];
const order = process.argv.slice(3);

const CELLS = [
  ['setup', 'Setup'],
  ['forward', 'Fwd+Compl'],
  ['delta', 'Delta'],
  ['idempotency', 'Idemp'],
  ['watermark', 'Watermk'],
  ['pagination', 'Pagin'],
  ['discoverOverlay', 'Disc10'],
  ['discoverColumns', 'Disc11'],
  ['dag', 'DAG12'],
  ['merkle', 'Merkle14'],
  ['rateLimit', 'RL15'],
  ['concurrency', 'Conc16'],
  ['retry', 'Retry17'],
  ['bidirectional', 'Bidir'],
  ['backward', 'Back'],
  ['teardown', 'Teard'],
];
const sym = (v) => v === 'pass' ? '✓' : v === 'fail' ? '✗' : v === 'skip' ? 'skip' : (v || '-');

const rows = [];
for (const dir of order) {
  const rf = `/tmp/retest-row-${dir}.json`;
  const df = `/tmp/retest-deploy-${dir}.json`;
  const row = existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')) : { dir, name: dir, cells: {}, error: 'NO ROW FILE (matrix did not produce a result)' };
  const dep = existsSync(df) ? JSON.parse(readFileSync(df, 'utf8')) : null;
  row._deploy = dep;
  rows.push(row);
}

let md = `# 13-Connector Production-Grade Retest — Results\n\n`;
md += `Run date: ${new Date().toISOString()}\n\n`;
md += `One DB (\`MJ_CONN_E2E\` @ localhost:1444), one MJAPI (:${process.env.GRAPHQL_PORT || 4021}), mock-mode behavioral matrix per connector, Salesforce last.\n`;
md += `Cells are ANTI-VACUOUS: \`✓\`=observed-to-work (real measured outcome), \`✗\`=failed/vacuous (e.g. completeness with 0 rows where data exists), \`skip\`=ran but legitimately inapplicable (reason below), \`-\`=not present for this connector's shape.\n\n`;

// Matrix table
md += `## Matrix\n\n`;
md += `| Connector | top | ${CELLS.map(c => c[1]).join(' | ')} |\n`;
md += `|---|${'---|'.repeat(CELLS.length + 1)}\n`;
for (const r of rows) {
  const cells = r.cells || {};
  const line = CELLS.map(([k]) => sym(cells[k])).join(' | ');
  const top = r.topOk === true ? '✓' : r.topOk === false ? '✗' : '?';
  md += `| **${r.name || r.dir}** | ${top} | ${line} |\n`;
}

// Deployed counts
md += `\n## Deployed IO/IOF counts (in DB after Phase 2)\n\n`;
md += `| Connector | before(stale) | staleDeleted | IO deployed | IOF deployed | upsert |\n|---|---|---|---|---|---|\n`;
for (const r of rows) {
  const d = r._deploy;
  if (d) md += `| ${d.name} | ${d.before} | ${d.staleDeleted} | ${d.afterIO} | ${d.afterIOF} | ${d.upsertExit === 0 ? 'OK' : 'exit ' + d.upsertExit} |\n`;
  else md += `| ${r.name || r.dir} | ? | ? | ? | ? | (no deploy json) |\n`;
}

// Completeness / maps detail
md += `\n## Completeness + ApplyAll detail\n\n`;
md += `| Connector | mapsFull | mapsSync | completeness (obj/ok/>0rows) | error |\n|---|---|---|---|---|\n`;
for (const r of rows) {
  md += `| ${r.name || r.dir} | ${r.mapsFull ?? '-'} | ${r.mapsSync ?? '-'} | ${r.completeness ?? '-'} | ${(r.error || r.setupErr || '').toString().slice(0, 120).replace(/\|/g, '/')} |\n`;
}

// Skip reasons + honest summary
md += `\n## Skip reasons (honest — what each connector could NOT cover credential-free in mock)\n\n`;
for (const r of rows) {
  const sr = r.skipReasons || {};
  const keys = Object.keys(sr);
  if (!keys.length) continue;
  md += `- **${r.name || r.dir}**: ` + keys.map(k => `${k}: ${sr[k]}`).join('; ') + `\n`;
}

md += `\n## Verdict per connector\n\n`;
md += `| Connector | Verdict | Notes |\n|---|---|---|\n`;
for (const r of rows) {
  const cells = r.cells || {};
  const fails = CELLS.filter(([k]) => cells[k] === 'fail').map(c => c[1]);
  const skips = CELLS.filter(([k]) => cells[k] === 'skip').map(c => c[1]);
  let verdict;
  if (r.error && !Object.keys(cells).length) verdict = 'BLOCKED';
  else if (fails.length === 0) verdict = 'PASS';
  else if (cells.forward === 'fail' || cells.setup === 'fail') verdict = 'FAIL (core)';
  else verdict = 'PARTIAL';
  const notes = [
    fails.length ? `fails: ${fails.join(',')}` : '',
    skips.length ? `skips: ${skips.join(',')}` : '',
    r.error ? `err: ${String(r.error).slice(0, 80)}` : '',
  ].filter(Boolean).join(' | ');
  md += `| ${r.name || r.dir} | **${verdict}** | ${notes} |\n`;
}

writeFileSync(out, md);
console.log(`wrote ${out} (${rows.length} connectors)`);
