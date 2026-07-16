// Higher Logic Thrive Community mock e2e runner
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { connectorE2EMock } from './plans.mjs';

const CONNECTOR = 'higherlogic-thrive';
const INTEGRATION = 'higherlogic-thrive';
const OUT = process.env.CONN_OUT || `/tmp/${CONNECTOR}-mock-result.json`;
const LOGDIR = dirname(OUT);

mkdirSync(LOGDIR, { recursive: true });

const COMPANY_ID = '95802059-e1a4-4401-829c-8731b07655c5';
const CIID = '42fa5190-07fb-4b25-9804-3cda2ac8c0d3';
const MJ_API_KEY = process.env.MJ_API_KEY || 'A1B2C3D4-E5F6-7890-A1B2-C3D4E5F67890';

Object.assign(process.env, {
  E2E_CONNECTOR: CONNECTOR,
  E2E_INTEGRATION: INTEGRATION,
  E2E_MODE: 'mock',
  E2E_REGEN_FIXTURES: 'true',
  E2E_PLATFORM: 'sqlserver',
  HS_LIVE_GRAPHQL_URL: 'http://localhost:4047/',
  HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: COMPANY_ID,
  HS_LIVE_CIID: CIID,
  HS_LIVE_DB_HOST: 'localhost',
  HS_LIVE_DB_PORT: '1505',
  HS_LIVE_DB_NAME: 'MJ_HLT_E2E',
  HS_LIVE_DB_USER: 'sa',
  HS_LIVE_MJ_SCHEMA: '__mj',
  E2E_DB_REQUEST_TIMEOUT_MS: '600000',
  // E2E_SCHEMA_REFRESH: 'false',  // Allow schema refresh
});

const t0 = Date.now();
const res = await connectorE2EMock({ 
  dbPassword: 'MJ@Testing123',
  mjSystemKey: MJ_API_KEY
}, x => x);
const ms = Date.now() - t0;

writeFileSync(OUT, JSON.stringify(res, null, 2));
console.log(`\n=== RESULT (${ms}ms) ===`);
console.log('Status:', res.ok ? 'PASS' : 'FAIL');
if (res.steps) {
  const phases = Object.entries(res.steps).slice(0, 5).map(([k, v]) => {
    const arr = Array.isArray(v) ? v : [v];
    const ok = arr.filter(x => x && x.ok).length;
    return `${k}(${ok}/${arr.length})`;
  }).join(' ');
  console.log('Phases:', phases);
}
if (res.error) console.log('Error:', String(res.error).split('\n')[0]);
