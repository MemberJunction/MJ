// Full credential-free matrix over all 13, fixtures regenerated from deployed metadata (E6),
// scoped ApplyAll (E7), salesforce LAST. Captures EVERY step group the harness produces (incl the
// new cells 10-17) → per-connector JSON + RETEST_RESULTS.md. Anti-vacuous: reports real counts.
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { connectorE2EMock } from './plans.mjs';

// Restart MJAPI + wait until healthy (401). A FRESH engine metadata cache per connector is required:
// the in-process IntegrationEngine caches IO/IOF across the long matrix run, and a stale PK cache from a
// prior connector makes ToExternalRecord fall back to the ['ID'] default → content-hash identity →
// record-map/row-count completeness mismatch (the cvent forward 3/10 vs fresh-cache 10/10 discrepancy).
function restartMjapiAndWait() {
  try { execSync('pm2 restart mjapi', { stdio: 'ignore' }); } catch { /* best-effort */ }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const code = execSync(`curl -s -o /dev/null -w '%{http_code}' http://localhost:4021/`, { encoding: 'utf8' }).trim();
      if (code === '401') return true;
    } catch { /* not up yet */ }
    execSync('sleep 2');
  }
  return false;
}

const cfg = JSON.parse(readFileSync('/tmp/matrix-config.json', 'utf8'));
const CT = Object.fromEntries(cfg.map(c => [c.dir, c.credTypeID]));
const NAME = Object.fromEntries(cfg.map(c => [c.dir, c.name]));
// salesforce LAST
const ORDER_ALL = ['cvent', 'fonteva', 'hivebrite', 'neon-crm', 'netsuite', 'imis', 'path-lms', 'nimble-ams', 'openwater', 'growthzone', 'propfuel', 'orcid', 'salesforce'];
// STOP_BEFORE_SF=1 → finish everything EXCEPT salesforce (the heavy one runs on its own pass).
const ORDER = process.env.STOP_BEFORE_SF === '1' ? ORDER_ALL.filter((d) => d !== 'salesforce') : ORDER_ALL;

const base = {
  E2E_MODE: 'mock', E2E_REGEN_FIXTURES: 'true',
  HS_LIVE_GRAPHQL_URL: 'http://localhost:4021/', HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: 'C0FFEE00-0000-4000-8000-000000000013',
  HS_LIVE_DB_HOST: 'localhost', HS_LIVE_DB_PORT: '1444', HS_LIVE_DB_NAME: 'MJ_CONN_E2E', HS_LIVE_DB_USER: 'sa', HS_LIVE_MJ_SCHEMA: '__mj',
};

// RESUME: load any prior results so a mid-run cancel does NOT rerun everything — already-recorded
// connectors are skipped, the run continues from the next undone one (append, not overwrite).
// Set FRESH=1 to force a clean run from scratch.
let rows = [];
if (process.env.FRESH !== '1') {
  try { rows = JSON.parse(readFileSync('/tmp/matrix-all13.json', 'utf8')); } catch { rows = []; }
}
const done = new Set(rows.map((r) => r.dir));
for (const dir of ORDER) {
  if (done.has(dir)) { console.log(`[matrix] skip ${dir} — already recorded (resume)`); continue; }
  // Fresh MJAPI engine cache per connector (see restartMjapiAndWait). Skip via NO_RESTART=1.
  if (process.env.NO_RESTART !== '1') {
    const healthy = restartMjapiAndWait();
    console.log(`[matrix] mjapi restart before ${dir}: ${healthy ? 'healthy' : 'TIMEOUT'}`);
  }
  Object.assign(process.env, base, { E2E_CONNECTOR: dir, E2E_INTEGRATION: NAME[dir], HS_LIVE_CREDTYPE_ID: CT[dir] || '' });
  const r = { dir, name: NAME[dir], cells: {}, topOk: null, error: null, dag: null };
  const t0 = Date.now();
  try {
    const res = await connectorE2EMock({ dbPassword: process.env.DB_PASSWORD, mjSystemKey: process.env.MJ_API_KEY }, x => x);
    r.topOk = res.ok ?? res.result?.ok ?? null;
    // Capture the swallowed in-phase error (runConnectorE2E returns result.error rather than throwing).
    if (res.error || res.result?.error) r.error = String(res.error || res.result?.error).split('\n')[0].slice(0, 200);
    const steps = res.steps || res.result?.steps || {};
    for (const [group, arr] of Object.entries(steps)) {
      const a = Array.isArray(arr) ? arr : [arr];
      const ok = a.filter(x => x && x.ok).length, tot = a.length;
      const skipped = a.filter(x => x && (x.skipReason || x.reason)).length;
      r.cells[group] = `${ok}/${tot}${skipped ? `(${skipped}skip)` : ''}`;
    }
    // DAG full-hierarchy detail (objects/edges/layers) for the report.
    const dagFull = (Array.isArray(steps.dag) ? steps.dag : []).find(s => s && s.name === 'dag.full-hierarchy');
    if (dagFull) r.dag = { objects: dagFull.objects ?? null, edges: dagFull.fkEdges ?? null, layers: dagFull.layers ?? null, ok: dagFull.ok };
  } catch (e) { r.error = String(e?.message || e).split('\n')[0].slice(0, 200); }
  r.ms = Date.now() - t0;
  rows.push(r);
  console.log(JSON.stringify({ dir, topOk: r.topOk, cells: r.cells, error: r.error }));
  writeFileSync('/tmp/matrix-all13.json', JSON.stringify(rows, null, 2));
}

// Build RETEST_RESULTS.md
const groups = [...new Set(rows.flatMap(r => Object.keys(r.cells)))];
let md = `# Retest Results — all 13 (credential-free mock matrix, ${new Date().toISOString()})\n\n`;
md += `Env: sql-claude@1444 / MJ_CONN_E2E / MJAPI :4021. Mode=mock, scoped ApplyAll, fixtures regenerated from deployed metadata.\n\n`;
md += `| connector | topOk | ${groups.join(' | ')} | DAG(obj/edge/layer) | error/skip |\n|${'---|'.repeat(groups.length + 4)}\n`;
for (const r of rows) {
  const dag = r.dag ? `${r.dag.ok ? '' : '⚠'}${r.dag.objects}/${r.dag.edges}/${r.dag.layers}` : '—';
  md += `| ${r.dir} | ${r.topOk ? '✅' : '❌'} | ${groups.map(g => r.cells[g] || '—').join(' | ')} | ${dag} | ${r.error || ''} |\n`;
}
md += `\n## Summary\n- topOk: ${rows.filter(r => r.topOk).length}/${rows.length}\n`;
md += `- per-run durations (ms): ${rows.map(r => `${r.dir}=${r.ms}`).join(', ')}\n`;
writeFileSync('packages/Integration/connectors/test/RETEST_RESULTS.md', md);
console.log('### matrix done. topOk', rows.filter(r => r.topOk).length, '/', rows.length, '-> RETEST_RESULTS.md');
