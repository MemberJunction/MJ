// Unified sync-matrix runner (UNTRACKED). Loops fixtured connectors via the DIRECT connectorE2EMock
// path (the one Neon succeeded with), full JSON per connector to /tmp/matrix-<dir>.json + a compact line.
import { writeFileSync, readFileSync } from 'node:fs';
import { connectorE2EMock } from './plans.mjs';

const cfg = JSON.parse(readFileSync('/tmp/matrix-config.json', 'utf8'));
// small fixture-object-count first so the most complete data lands early
const ORDER = ['growthzone', 'netsuite', 'imis', 'path-lms', 'hivebrite', 'fonteva', 'cvent'];
const NAME = Object.fromEntries(cfg.map(c => [c.dir, c.name]));
const CT = Object.fromEntries(cfg.map(c => [c.dir, c.credTypeID]));

const base = {
  E2E_MODE: 'mock', HS_LIVE_GRAPHQL_URL: 'http://localhost:4021/', HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: 'C0FFEE00-0000-4000-8000-000000000013',
  HS_LIVE_DB_HOST: 'localhost', HS_LIVE_DB_PORT: '1444', HS_LIVE_DB_NAME: 'MJ_CONN_E2E', HS_LIVE_DB_USER: 'sa', HS_LIVE_MJ_SCHEMA: '__mj',
};
const summary = [];
for (const dir of ORDER) {
  Object.assign(process.env, base, { E2E_CONNECTOR: dir, E2E_INTEGRATION: NAME[dir], HS_LIVE_CREDTYPE_ID: CT[dir] });
  const line = { dir, name: NAME[dir] };
  try {
    const r = await connectorE2EMock({ dbPassword: process.env.DB_PASSWORD, mjSystemKey: process.env.MJ_API_KEY }, x => x);
    writeFileSync(`/tmp/matrix-${dir}.json`, JSON.stringify(r, null, 2));
    const st = r.steps || {};
    const arr = (k) => Array.isArray(st[k]) ? st[k] : [];
    const cnt = (k, p) => arr(k).filter(p).length;
    const compl = arr('forward').filter(x => x.name === 'forward.completeness');
    line.topOk = r.ok;
    line.applyMaps = st.setup?.applyAll?.mapsCreated ?? null;
    line.fwdClean = arr('forward').find(x => x.name === 'forward.full.clean')?.succeeded ?? null;
    line.completeness = `${compl.length}obj/${compl.filter(x => x.ok).length}ok/${compl.filter(x => x.destRows > 0).length}>0`;
    line.incrementalNarrowed = arr('forward').find(x => x.name?.includes('incremental'))?.ok ?? null;
    line.delta = `${cnt('delta', x => x.ok)}/${arr('delta').length}`;
    line.idemNoRewrite = arr('idempotent').find(x => x.name === 'idempotent.no-redundant-writes')?.ok ?? null;
    line.idemStable = `${cnt('idempotent', x => x.name === 'idempotent.rows-stable' && x.ok)}ok`;
  } catch (e) { line.error = String(e?.message || e).slice(0, 200); }
  summary.push(line);
  console.log(JSON.stringify(line));
  writeFileSync('/tmp/matrix-summary.json', JSON.stringify(summary, null, 2));
}
console.log('### matrix2 done: ' + summary.filter(s => s.topOk).length + '/' + summary.length + ' topOk');
