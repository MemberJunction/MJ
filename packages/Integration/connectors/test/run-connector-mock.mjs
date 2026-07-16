// Generic single-connector credential-free mock hybrid-e2e runner (parameterized).
// Same as run-zendesk-mock.mjs but reads the connector from env so any connector can be re-proven.
//   E2E_CONNECTOR=<slug>  E2E_INTEGRATION=<Integration.Name>  [CONN_COMPANY_ID=<guid>]
import { writeFileSync } from 'node:fs';
import { connectorE2EMock } from './plans.mjs';

const CONNECTOR = process.env.E2E_CONNECTOR;
const INTEGRATION = process.env.E2E_INTEGRATION;
if (!CONNECTOR || !INTEGRATION) { console.error('set E2E_CONNECTOR + E2E_INTEGRATION'); process.exit(2); }
const COMPANY_ID = process.env.CONN_COMPANY_ID || 'C0FFEE00-0000-4000-8000-00000000000D';
const MJKEY = process.env.MJ_API_KEY;
const OUT = process.env.CONN_OUT || `/tmp/${CONNECTOR}-mock-result.json`;

Object.assign(process.env, {
  E2E_CONNECTOR: CONNECTOR,
  E2E_INTEGRATION: INTEGRATION,
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

const steps = res.steps || {};
const cells = {};
for (const [group, arr] of Object.entries(steps)) {
  const a = Array.isArray(arr) ? arr : [arr];
  const ok = a.filter(x => x && x.ok).length, tot = a.length;
  const skipped = a.filter(x => x && (x.skipReason || x.reason)).length;
  cells[group] = `${ok}/${tot}${skipped ? `(${skipped}skip)` : ''}`;
}
writeFileSync(OUT, JSON.stringify(res, null, 2));
console.log(`=== ${INTEGRATION} MOCK MATRIX ===`);
console.log('topOk:', res.ok, ' ms:', ms);
if (res.error) console.log('ERROR:', String(res.error).split('\n').slice(0, 6).join('\n'));
const fwd = Array.isArray(steps.forward) ? steps.forward : [];
const withRows = fwd.filter(s => s && typeof s.destRows === 'number');
console.log('forward: objects>0 rows:', withRows.filter(s => s.destRows > 0).length, '/', withRows.length, '| zero-row:', fwd.filter(s => s && s.destRows === 0).length);
const cov = Object.values(steps).flat().find(s => s && s.name === 'coverage.all-objects');
console.log('coverage.all-objects ok:', cov ? cov.ok : 'n/a');
console.log('cells:', JSON.stringify(cells, null, 2));
console.log('full result ->', OUT);
