#!/usr/bin/env node
// Generates a RICH credential-free fixture set simulating a fully-maintained Salesforce org:
// a connected CRM object set (Account hub ← Contact/Opportunity/Case/Order/Asset, Product2 ← Asset,
// plus Lead/Campaign for breadth), with FK-consistent synthetic data, multi-page pagination on the
// hub, custom-column overflow, soft-deletes (IsDeleted), and a delta pass (update + create + delete).
// Field NAMES are read from the DEPLOYED schema so every value maps to a real column; Salesforce
// field TYPES are synthesized for the describe. PII-free (synthetic names/emails only).
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeDbClient } from './gql-live-adapters.mjs';

const SET = ['Account', 'Contact', 'Opportunity', 'Case', 'Order', 'Asset', 'Product2', 'Lead', 'Campaign'];
const OUT_DIR = process.env.RICH_OUT_DIR || '/tmp/sf-rich-fixtures';
const API = '61.0';

const db = await makeDbClient('sqlserver', {
  host: 'localhost', port: process.env.HS_LIVE_DB_PORT || '1447',
  database: 'MJ_SALESFORCE', user: 'sa', password: process.env.DB_PASSWORD, mjSchema: '__mj',
});

// Per-object: PK name, a plain string "name" column, FK fields targeting other SET members.
const setQuoted = SET.map(s => `'${s}'`).join(',');
const meta = {};
for (const obj of SET) {
  const cols = await db.rows(`
    SELECT iof.Name AS FieldName, iof.IsPrimaryKey AS IsPK, tgt.Name AS FKTarget,
           CASE WHEN iof.Configuration LIKE '%datetime%' OR iof.Name IN ('SystemModstamp','CreatedDate','LastModifiedDate') THEN 1 ELSE 0 END AS IsDate
    FROM __mj.IntegrationObjectField iof
    JOIN __mj.IntegrationObject io ON iof.IntegrationObjectID = io.ID
    JOIN __mj.Integration i ON io.IntegrationID = i.ID AND i.Name = 'Salesforce'
    LEFT JOIN __mj.IntegrationObject tgt ON iof.RelatedIntegrationObjectID = tgt.ID
    WHERE io.Name = '${obj}'`);
  // real columns actually present in the built table (defensive — only emit fields that are columns)
  const realCols = new Set((await db.rows(`
    SELECT c.name AS n FROM sys.columns c JOIN sys.tables t ON c.object_id=t.object_id
    JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='salesforce' AND t.name='${obj}'`)).map(r => r.n));
  const has = (n) => realCols.has(n);
  const pk = cols.find(c => c.IsPK && has(c.FieldName))?.FieldName || (has('Id') ? 'Id' : null);
  const nameField = ['Name', 'LastName', 'Subject', 'CaseNumber', 'OrderNumber'].find(has) || null;
  const fks = cols.filter(c => c.FKTarget && SET.includes(c.FKTarget) && has(c.FieldName))
                  .map(c => ({ field: c.FieldName, target: c.FKTarget }));
  meta[obj] = { pk, nameField, fks, hasModstamp: has('SystemModstamp'), hasIsDeleted: has('IsDeleted') };
}
// ALL declared object names — so an AUTHORITATIVE schema refresh sees the full catalog and does NOT
// deactivate the 1,687 objects we don't carry data for. Only the SET gets field+data routes.
const allObjectNames = (await db.rows(`
  SELECT io.Name AS Name FROM __mj.IntegrationObject io
  JOIN __mj.Integration i ON io.IntegrationID = i.ID AND i.Name = 'Salesforce' ORDER BY io.Name`)).map(r => r.Name);
await db.close();

// ── ID + record synthesis ──
const pfx = { Account: '001', Contact: '003', Opportunity: '006', Case: '500', Order: '801',
              Asset: '02i', Product2: '01t', Lead: '00Q', Campaign: '701' };
const id = (obj, n) => `${pfx[obj] || 'xxx'}${String(n).padStart(15, '0')}`;
const ts = (d) => `2026-0${d}-10T10:00:00.000Z`;
const ids = {}; // obj -> [generated ids]

function recordsFor(obj, count, startTs) {
  const m = meta[obj];
  ids[obj] = [];
  const recs = [];
  for (let n = 1; n <= count; n++) {
    const rid = id(obj, n);
    ids[obj].push(rid);
    const r = { attributes: { type: obj }, [m.pk]: rid };
    if (m.nameField) r[m.nameField] = `Fixture ${obj} ${n}`;
    for (const fk of m.fks) {
      const pool = ids[fk.target];           // parent already generated (SET ordered parents-first)
      if (pool?.length) r[fk.field] = pool[(n - 1) % pool.length];
    }
    if (m.hasModstamp) r.SystemModstamp = ts(startTs);
    if (m.hasIsDeleted) r.IsDeleted = (n === count && count > 1); // last record soft-deleted
    recs.push(r);
  }
  return recs;
}

// Parents first so children can reference real parent ids.
const routes = [
  { Path: '/services/oauth2/token', Method: 'POST', Status: 200,
    Body: { access_token: 'mock-access-token', instance_url: '{{MOCK_ORIGIN}}', token_type: 'Bearer', issued_at: '1700000000000', id: 'https://mock.local/id/00Dxx/005xx' } },
  { Path: '/services/data/v61.0/', Method: 'GET', Status: 200,
    Body: { sobjects: '/services/data/v61.0/sobjects', identity: 'https://mock.local/id' } },
];

// describe-global (sobjects) — the SET + a custom object + a system object (filtered by connector)
const setNames = new Set(SET);
routes.push({ Path: '/services/data/v61.0/sobjects/', Method: 'GET', Status: 200, Body: {
  encoding: 'UTF-8', maxBatchSize: 200,
  sobjects: [
    // Full declared catalog so an authoritative refresh sees everything (no deactivation).
    ...allObjectNames.map(o => ({ name: o, label: o, queryable: true,
      createable: !setNames.has(o) ? true : true, updateable: true, deletable: true, custom: o.endsWith('__c') })),
    { name: 'Widget__c', label: 'Widget', queryable: true, createable: true, updateable: true, deletable: true, custom: true },
  ],
}});

function describeFields(obj) {
  const m = meta[obj];
  const f = [{ name: m.pk, type: 'id', length: 18, nillable: false, updateable: false, createable: false, referenceTo: [] }];
  if (m.nameField) f.push({ name: m.nameField, type: 'string', length: 255, nillable: false, updateable: true, createable: true, referenceTo: [] });
  for (const fk of m.fks) f.push({ name: fk.field, type: 'reference', nillable: true, updateable: true, createable: true, referenceTo: [fk.target] });
  if (m.hasModstamp) f.push({ name: 'SystemModstamp', type: 'datetime', nillable: false, updateable: true, createable: false, referenceTo: [] });
  if (m.hasIsDeleted) f.push({ name: 'IsDeleted', type: 'boolean', nillable: false, updateable: true, createable: false, referenceTo: [] });
  return f;
}

// Generate records (parents first). Account is the multi-page hub.
const COUNT = { Account: 5, Product2: 4 };
let monthTick = 1;
for (const obj of SET) {
  routes.push({ Path: `/services/data/v61.0/sobjects/${obj}/describe`, Method: 'GET', Status: 200,
    Body: { name: obj, label: obj, queryable: true, createable: true, updateable: true, deletable: true, fields: describeFields(obj) } });
  const count = COUNT[obj] ?? 3;
  const recs = recordsFor(obj, count, monthTick++);
  // custom-column overflow on the first Account record
  if (obj === 'Account') { recs[0].Rating__c = 'Hot'; recs[0].CustomScore__c = 42; }
  if (obj === 'Contact') { recs[0].Loyalty__c = 'Gold'; }

  if (obj === 'Account') {
    // 2-page pagination on the hub: page1 (first 3, done:false -> locator), page2 (rest).
    const page1 = recs.slice(0, 3), page2 = recs.slice(3);
    routes.push({ Path: '/services/data/v61.0/queryAll', Method: 'GET', Match: `FROM ${obj}`, Status: 200,
      Body: { totalSize: recs.length, done: false, nextRecordsUrl: '/services/data/v61.0/query/01gMOCKACC', records: page1 } });
    routes.push({ Path: '/services/data/v61.0/query/01gMOCKACC', Method: 'GET', Status: 200,
      Body: { totalSize: recs.length, done: true, records: page2 } });
  } else {
    routes.push({ Path: '/services/data/v61.0/queryAll', Method: 'GET', Match: `FROM ${obj}`, Status: 200,
      Body: { totalSize: recs.length, done: true, records: recs } });
  }
}
// fallback empty /query (non-sobject families)
routes.push({ Path: '/services/data/v61.0/query', Method: 'GET', Status: 200, Body: { totalSize: 0, done: true, records: [] } });

// ── Delta pass on Account: update A1 (Name change), create A6, delete A3 (IsDeleted=true) ──
const m = meta.Account;
const a = (n, extra = {}) => ({ attributes: { type: 'Account' }, [m.pk]: id('Account', n),
  ...(m.nameField ? { [m.nameField]: `Fixture Account ${n}` } : {}), ...(m.hasModstamp ? { SystemModstamp: ts(7) } : {}),
  ...(m.hasIsDeleted ? { IsDeleted: false } : {}), ...extra });
const deltaRecords = [
  a(1, m.nameField ? { [m.nameField]: 'Fixture Account 1 (updated)' } : {}),
  a(2), a(4),
  a(6),                                       // created
  a(3, m.hasIsDeleted ? { IsDeleted: true } : {}), // deleted (tombstone)
];
const deltaPass = {
  Object: 'Account', Description: 'update A1 + create A6 + delete A3 (IsDeleted)',
  Routes: [
    { Path: '/services/oauth2/token', Method: 'POST', Status: 200, Body: { access_token: 'mock-access-token', instance_url: '{{MOCK_ORIGIN}}', token_type: 'Bearer' } },
    { Path: '/services/data/v61.0/sobjects/Account/describe', Method: 'GET', Status: 200,
      Body: { name: 'Account', queryable: true, createable: true, updateable: true, deletable: true, fields: describeFields('Account') } },
    { Path: '/services/data/v61.0/queryAll', Method: 'GET', Match: 'FROM Account', Status: 200,
      Body: { totalSize: deltaRecords.length, done: true, records: deltaRecords } },
  ],
};

const manifest = {
  Transport: 'http', ConfigUrlKey: 'LoginUrl',
  Configuration: { AuthFlow: 'client_credentials', authFlow: 'client_credentials', clientId: 'fixture-client-id', clientSecret: 'fixture-client-secret', apiVersion: API },
  Objects: SET.map(Name => ({ Name })),
  Routes: routes,
  DeltaPasses: [deltaPass],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/fixtures.json`, JSON.stringify(manifest, null, 2));
// Summary for the operator
const summary = {
  outDir: OUT_DIR, objects: SET.length, routeCount: routes.length,
  perObject: Object.fromEntries(SET.map(o => [o, { pk: meta[o].pk, nameField: meta[o].nameField, fks: meta[o].fks.map(f => `${f.field}->${f.target}`), records: (COUNT[o] ?? 3) }])),
};
console.log(JSON.stringify(summary, null, 2));
