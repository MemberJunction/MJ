// Spot-run the credential-free matrix for ONE connector (validation before a full re-run).
// Usage: node spot-one.mjs <dir>   (e.g. neon-crm). Mirrors run-matrix-all13's per-connector invocation.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { connectorE2EMock } from './plans.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node spot-one.mjs <dir>'); process.exit(1); }
const cfg = JSON.parse(readFileSync('/tmp/matrix-config.json', 'utf8'));
const CT = Object.fromEntries(cfg.map((c) => [c.dir, c.credTypeID]));
const NAME = Object.fromEntries(cfg.map((c) => [c.dir, c.name]));

const base = {
  E2E_MODE: 'mock', E2E_REGEN_FIXTURES: 'true',
  HS_LIVE_GRAPHQL_URL: 'http://localhost:4021/', HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: 'C0FFEE00-0000-4000-8000-000000000013',
  HS_LIVE_DB_HOST: 'localhost', HS_LIVE_DB_PORT: '1444', HS_LIVE_DB_NAME: 'MJ_CONN_E2E', HS_LIVE_DB_USER: 'sa', HS_LIVE_MJ_SCHEMA: '__mj',
};

// Fresh MJAPI engine cache (reuses pm2's stored env incl MJ_DISABLE_SCHEDULED_JOBS=1).
try { execSync('pm2 restart mjapi', { stdio: 'ignore' }); } catch { /* best-effort */ }
const deadline = Date.now() + 120000;
let healthy = false;
while (Date.now() < deadline) {
  try { if (execSync(`curl -s -o /dev/null -w '%{http_code}' http://localhost:4021/`, { encoding: 'utf8' }).trim() === '401') { healthy = true; break; } } catch { /* */ }
  execSync('sleep 2');
}
console.log(`[spot] mjapi restart before ${dir}: ${healthy ? 'healthy' : 'TIMEOUT'}`);

Object.assign(process.env, base, { E2E_CONNECTOR: dir, E2E_INTEGRATION: NAME[dir], HS_LIVE_CREDTYPE_ID: CT[dir] || '' });
const res = await connectorE2EMock({ dbPassword: process.env.DB_PASSWORD, mjSystemKey: process.env.MJ_API_KEY }, (x) => x);
const steps = res.steps || res.result?.steps || {};
const cells = {};
for (const [group, arr] of Object.entries(steps)) {
  const a = Array.isArray(arr) ? arr : [arr];
  cells[group] = `${a.filter((x) => x && x.ok).length}/${a.length}`;
}
console.log(`[spot] ${dir} topOk=${res.ok ?? res.result?.ok}`);
console.log(JSON.stringify({ cells, error: (res.error || res.result?.error || '').toString().split('\n')[0].slice(0, 200) }, null, 2));
// Print per-step detail for any failing group so we see WHAT failed.
for (const [group, arr] of Object.entries(steps)) {
  const a = Array.isArray(arr) ? arr : [arr];
  const fails = a.filter((x) => x && !x.ok && !x.skipReason && !x.reason);
  if (fails.length) for (const f of fails) console.log(`  FAIL ${group}/${f.name}: ${JSON.stringify(f).slice(0, 220)}`);
}
