#!/usr/bin/env node
// A4 (consensus) — GENERAL rich-fixture generator. Reads the DEPLOYED schema for a connector and emits a
// "simulated populated tenant" fixtures.json: an FK-connected multi-object set, multi-page on a hub,
// custom/overflow fields, soft-deletes, value-type variety, and a delta pass — so the credential-free
// mock matrix exercises every dimension instead of a thin hand-authored stub. Field NAMES come from the
// deployed IO/IOF rows (so every value maps to a real column); the FK graph comes from
// RelatedIntegrationObjectID (so children reference real parent IDs).
//
// PROVENANCE: generalizes the proven Salesforce generator (connectors/test/gen-sf-rich-fixtures.mjs).
// The DATA-synthesis half is protocol-agnostic. The ROUTE-shaping half defaults to a REST list-endpoint
// shape driven by each IO's `APIPath`; connectors whose fetch is NOT a path-GET (SOQL `/queryAll`,
// GraphQL POST, file-feed) pass --shaper to override `shapeFetchRoute` (see the Salesforce SOQL shaper).
//
// Usage: node gen-fixtures.mjs   (env: VENDOR, INTEGRATION_NAME, DB_HOST/PORT/NAME/USER, DB_PASSWORD,
//                                 MJ_SCHEMA=__mj, OUT_DIR, [OBJECTS=csv], [HUB], [SHAPER=rest|soql])
import { mkdirSync, writeFileSync } from 'node:fs';
import mssql from 'mssql';

const VENDOR = process.env.VENDOR || (() => { throw new Error('VENDOR required'); })();
const INTEGRATION = process.env.INTEGRATION_NAME || VENDOR;
const MJ_SCHEMA = process.env.MJ_SCHEMA || '__mj';
const OUT_DIR = process.env.OUT_DIR || `/tmp/${VENDOR}-rich-fixtures`;
const SHAPER = process.env.SHAPER || 'rest';
const MAX_SET = Number(process.env.MAX_SET || 9);

const pool = await mssql.connect({
  server: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME, user: process.env.DB_USER || 'sa', password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 120000,
});
const q = async (sql) => (await pool.request().query(sql)).recordset ?? [];

// ── 1. Pick an FK-connected object set: a hub (most children) + its children, capped at MAX_SET. ──
const hubRow = process.env.HUB ? [{ Name: process.env.HUB }] : await q(`
  SELECT TOP 1 t.Name FROM ${MJ_SCHEMA}.IntegrationObjectField iof
  JOIN ${MJ_SCHEMA}.IntegrationObject t ON iof.RelatedIntegrationObjectID = t.ID
  JOIN ${MJ_SCHEMA}.IntegrationObject io ON iof.IntegrationObjectID = io.ID
  JOIN ${MJ_SCHEMA}.Integration i ON io.IntegrationID = i.ID AND i.Name = '${INTEGRATION}'
  GROUP BY t.Name ORDER BY COUNT(*) DESC`);
const HUB = hubRow[0]?.Name;
if (!HUB) throw new Error(`no FK hub found for '${INTEGRATION}' — is the FK graph (RelatedIntegrationObjectID) populated?`);
const explicit = (process.env.OBJECTS || '').split(',').map(s => s.trim()).filter(Boolean);
let SET = explicit.length ? explicit : [HUB, ...(await q(`
  SELECT DISTINCT TOP ${MAX_SET - 1} io.Name FROM ${MJ_SCHEMA}.IntegrationObjectField iof
  JOIN ${MJ_SCHEMA}.IntegrationObject hub ON iof.RelatedIntegrationObjectID = hub.ID AND hub.Name = '${HUB}'
  JOIN ${MJ_SCHEMA}.IntegrationObject io ON iof.IntegrationObjectID = io.ID
  JOIN ${MJ_SCHEMA}.Integration i ON io.IntegrationID = i.ID AND i.Name = '${INTEGRATION}'
  WHERE io.Name <> '${HUB}' ORDER BY io.Name`)).map(r => r.Name)];
SET = [...new Set(SET)].slice(0, MAX_SET);

// ── 2. Per-object: PK, name-ish field, FK fields targeting the set, APIPath, real columns. ──
const setQ = SET.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
const meta = {};
for (const obj of SET) {
  const io = (await q(`SELECT TOP 1 io.Name, io.APIPath, io.Configuration FROM ${MJ_SCHEMA}.IntegrationObject io
    JOIN ${MJ_SCHEMA}.Integration i ON io.IntegrationID = i.ID AND i.Name = '${INTEGRATION}' WHERE io.Name = '${obj}'`))[0] ?? {};
  // list-field-path (the envelope key wrapping the array) is connector-specific; read it from the IO's
  // Configuration JSON when present, else null (flat array). NOT a deployed column.
  let listFieldPath = null;
  try { listFieldPath = io.Configuration ? (JSON.parse(io.Configuration).ListFieldPath ?? null) : null; } catch { /* non-JSON */ }
  const cols = await q(`
    SELECT iof.Name AS FieldName, iof.IsPrimaryKey AS IsPK, tgt.Name AS FKTarget
    FROM ${MJ_SCHEMA}.IntegrationObjectField iof
    JOIN ${MJ_SCHEMA}.IntegrationObject o ON iof.IntegrationObjectID = o.ID
    JOIN ${MJ_SCHEMA}.Integration i ON o.IntegrationID = i.ID AND i.Name = '${INTEGRATION}'
    LEFT JOIN ${MJ_SCHEMA}.IntegrationObject tgt ON iof.RelatedIntegrationObjectID = tgt.ID
    WHERE o.Name = '${obj}'`);
  // real built columns (only emit fields that are columns, so the engine can store them)
  const real = new Set((await q(`SELECT c.name AS n FROM sys.columns c JOIN sys.tables t ON c.object_id=t.object_id
    JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='${VENDOR}' AND t.name='${obj}'`)).map(r => r.n));
  const has = (n) => real.size === 0 || real.has(n); // tolerate pre-ApplyAll (no table yet)
  const pk = cols.find(c => c.IsPK && has(c.FieldName))?.FieldName || (has('Id') ? 'Id' : (cols[0]?.FieldName ?? 'Id'));
  const nameField = ['Name', 'Title', 'LastName', 'Subject', 'Label', 'DisplayName'].find(has) || null;
  const fks = cols.filter(c => c.FKTarget && SET.includes(c.FKTarget) && has(c.FieldName) && c.FieldName !== pk)
                  .map(c => ({ field: c.FieldName, target: c.FKTarget }));
  meta[obj] = { pk, nameField, fks, apiPath: io.APIPath || `/${obj}`, listFieldPath,
                hasModstamp: has('SystemModstamp') || has('ModifiedAt') || has('UpdatedAt'),
                hasIsDeleted: has('IsDeleted') || has('Deleted') };
}
const allObjectNames = (await q(`SELECT io.Name FROM ${MJ_SCHEMA}.IntegrationObject io
  JOIN ${MJ_SCHEMA}.Integration i ON io.IntegrationID = i.ID AND i.Name = '${INTEGRATION}' ORDER BY io.Name`)).map(r => r.Name);
await pool.close();

// ── 3. FK-consistent record synthesis (parents-first so children reference real parent IDs). ──
const ids = {};
const idOf = (obj, n) => `${obj.slice(0, 3).toLowerCase()}${String(n).padStart(15, '0')}`;
const tsOf = (m) => `2026-0${(m % 9) + 1}-10T10:00:00.000Z`;
function recordsFor(obj, count, monthTick) {
  const m = meta[obj]; ids[obj] = []; const recs = [];
  for (let n = 1; n <= count; n++) {
    const rid = idOf(obj, n); ids[obj].push(rid);
    const r = { [m.pk]: rid };
    if (m.nameField) r[m.nameField] = `Fixture ${obj} ${n}`;
    for (const fk of m.fks) { const pool = ids[fk.target]; if (pool?.length) r[fk.field] = pool[(n - 1) % pool.length]; }
    if (m.hasModstamp) r.SystemModstamp = tsOf(monthTick);
    if (m.hasIsDeleted) r.IsDeleted = (n === count && count > 1); // last row soft-deleted
    recs.push(r);
  }
  return recs;
}

// ── 4. Route shapers. Default REST: GET APIPath returns the list; the hub paginates. SOQL hook documented. ──
const shapers = {
  rest: (obj, recs, paginate) => {
    const m = meta[obj]; const wrap = (rs, more) => m.listFieldPath ? { [m.listFieldPath]: rs, ...(more ? { hasMore: true, nextPage: 2 } : {}) } : rs;
    if (paginate && recs.length > 2) {
      const p1 = recs.slice(0, 2), p2 = recs.slice(2);
      return [{ Path: m.apiPath, Method: 'GET', Match: 'page=1', Status: 200, Body: wrap(p1, true) },
              { Path: m.apiPath, Method: 'GET', Match: 'page=2', Status: 200, Body: wrap(p2, false) },
              { Path: m.apiPath, Method: 'GET', Status: 200, Body: wrap(p1, true) }];
    }
    return [{ Path: m.apiPath, Method: 'GET', Status: 200, Body: wrap(recs, false) }];
  },
  // soql: Salesforce-style — connectors/test/gen-sf-rich-fixtures.mjs is the reference (queryAll + Match 'FROM <obj>').
};
const shapeFetch = shapers[SHAPER] || shapers.rest;

// ── 5. Assemble manifest. ──
const COUNT = { [HUB]: 5 };
let tick = 1;
const routes = [];
for (const obj of SET) {
  const recs = recordsFor(obj, COUNT[obj] ?? 3, tick++);
  if (obj === HUB) { recs[0][`Rating__c`] = 'Hot'; recs[0][`CustomScore__c`] = 42; } // undeclared customs → overflow
  routes.push(...shapeFetch(obj, recs, obj === HUB));
}
// delta pass on the hub: update rec1 + create rec(N+1) + delete rec2 (tombstone)
const hm = meta[HUB];
const hubRec = (n, extra = {}) => ({ [hm.pk]: idOf(HUB, n), ...(hm.nameField ? { [hm.nameField]: `Fixture ${HUB} ${n}` } : {}),
  ...(hm.hasModstamp ? { SystemModstamp: tsOf(8) } : {}), ...(hm.hasIsDeleted ? { IsDeleted: false } : {}), ...extra });
const deltaRecs = [hubRec(1, hm.nameField ? { [hm.nameField]: `Fixture ${HUB} 1 (updated)` } : {}), hubRec(3),
  hubRec(6), hubRec(2, hm.hasIsDeleted ? { IsDeleted: true } : {})];
const manifest = {
  Transport: 'http', ConfigUrlKey: process.env.CONFIG_URL_KEY || 'BaseURL',
  Configuration: {}, Objects: SET.map(Name => ({ Name })),
  Routes: routes, DeltaPasses: [{ Object: HUB, Description: `update ${HUB}1 + create ${HUB}6 + delete ${HUB}2`,
    Routes: shapeFetch(HUB, deltaRecs, false) }],
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/fixtures.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ vendor: VENDOR, hub: HUB, set: SET, shaper: SHAPER, routeCount: routes.length,
  declaredObjects: allObjectNames.length, outDir: OUT_DIR,
  perObject: Object.fromEntries(SET.map(o => [o, { pk: meta[o].pk, name: meta[o].nameField, fks: meta[o].fks.map(f => `${f.field}->${f.target}`) }])) }, null, 2));
