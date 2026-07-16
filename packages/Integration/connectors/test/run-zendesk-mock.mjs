// Single-connector credential-free mock matrix for Zendesk.
// Mirrors run-matrix-all13.mjs but for one connector, writing the full result JSON to the run dir.
import { writeFileSync } from 'node:fs';
import { connectorE2EMock } from './plans.mjs';

const COMPANY_ID = process.env.ZD_COMPANY_ID || 'C0FFEE00-0000-4000-8000-00000000000D';
const MJKEY = process.env.MJ_API_KEY;
const OUT = process.env.ZD_OUT || '/tmp/zendesk-mock-result.json';

Object.assign(process.env, {
  E2E_CONNECTOR: 'zendesk',
  E2E_INTEGRATION: 'Zendesk',
  E2E_MODE: 'mock',
  E2E_REGEN_FIXTURES: 'true',
  E2E_PLATFORM: 'sqlserver',
  HS_LIVE_GRAPHQL_URL: 'http://localhost:4007/',
  HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: COMPANY_ID,
  HS_LIVE_DB_HOST: 'localhost', HS_LIVE_DB_PORT: '1444', HS_LIVE_DB_NAME: 'MJ_SS_E2E',
  HS_LIVE_DB_USER: 'sa', HS_LIVE_MJ_SCHEMA: '__mj',
  E2E_DB_REQUEST_TIMEOUT_MS: process.env.E2E_DB_REQUEST_TIMEOUT_MS || '600000',
});

const t0 = Date.now();
const res = await connectorE2EMock({ dbPassword: 'Claude2Sql99', mjSystemKey: MJKEY }, x => x);
const ms = Date.now() - t0;

// Summarize the step groups.
const steps = res.steps || {};
const cells = {};
for (const [group, arr] of Object.entries(steps)) {
  const a = Array.isArray(arr) ? arr : [arr];
  const ok = a.filter(x => x && x.ok).length, tot = a.length;
  const skipped = a.filter(x => x && (x.skipReason || x.reason)).length;
  cells[group] = `${ok}/${tot}${skipped ? `(${skipped}skip)` : ''}`;
}
writeFileSync(OUT, JSON.stringify(res, null, 2));
console.log('=== ZENDESK MOCK MATRIX ===');
console.log('topOk:', res.ok, ' ms:', ms);
if (res.error) console.log('ERROR:', String(res.error).split('\n').slice(0, 6).join('\n'));
if (res.fixtureRegen) console.log('fixtureRegen:', res.fixtureRegen.ok ? `wrote ${res.fixtureRegen.written} objects` : `skipped: ${res.fixtureRegen.reason}`);
console.log('cells:', JSON.stringify(cells, null, 2));
// Coverage detail
const cov = (Array.isArray(steps.forward) ? steps.forward : []).concat(Array.isArray(steps.setup) ? steps.setup : []);
const covStep = Object.values(steps).flat().find(s => s && s.name === 'coverage.all-objects');
if (covStep) console.log('coverage.all-objects ok=', covStep.ok, ' detail:', JSON.stringify({ objects: covStep.objects, zeroRow: covStep.zeroRow, perObject: covStep.perObject }).slice(0, 2000));
console.log('full result ->', OUT);
