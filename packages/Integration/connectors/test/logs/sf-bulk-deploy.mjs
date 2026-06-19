/**
 * Fast set-based deploy of the Salesforce connector metadata (1695 IO / 31465 IOF) via direct
 * batched SQL INSERTs — mj-sync's per-row push takes ~3h for 31k IOFs; this takes ~1 min.
 * SF metadata has NO IOF FK @lookups (verified), so no cross-ref resolution is needed.
 * The Integration row already exists; we (re)insert its IO/IOF set after a clean delete.
 * Uses the SAME deployed-column whitelist as strip-pushcopy.mjs (only real columns), and
 * width-trims long strings. MetadataSource='Declared'. __mj timestamps via DEFAULT.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const META = '/Users/madhavsubramaniyam/Projects/MJ/MJ-unified/metadata/integrations/salesforce/.salesforce.integration.json';
const DB = 'MJ_CONN_E2E';
// Pipe SQL via STDIN (sqlcmd reads from stdin when no -Q/-i) to avoid "argument list too long" on
// the huge multi-row INSERTs. -b makes it exit nonzero on a SQL error so execFileSync throws.
const sqlcmd = (sql) => execFileSync('docker', ['exec', '-i', 'sql-claude', '/opt/mssql-tools18/bin/sqlcmd',
  '-S', 'localhost', '-U', 'sa', '-P', 'Claude2Sql99', '-C', '-d', DB, '-b', '-h', '-1', '-W'],
  { encoding: 'utf8', maxBuffer: 1 << 28, input: sql });
const onlyGuid = (s) => { const m = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/); return m ? m[0] : null; };

const IO_COLS = ['Name','DisplayName','Description','APIPath','PaginationType','SupportsPagination','SupportsIncrementalSync','SupportsWrite','SupportsCreate','SupportsUpdate','SupportsDelete','IncrementalWatermarkField','StableOrderingKey','Status','Configuration','CreateAPIPath','CreateMethod','CreateBodyShape','CreateBodyKey','CreateIDLocation','UpdateAPIPath','UpdateMethod','UpdateBodyShape','UpdateBodyKey','UpdateIDLocation','DeleteAPIPath','DeleteMethod','DeleteIDLocation','MetadataSource'];
const IOF_COLS = ['Name','DisplayName','Description','Type','Length','Precision','Scale','AllowsNull','DefaultValue','IsPrimaryKey','IsUniqueKey','IsReadOnly','IsRequired','Status','MetadataSource'];
const W = { Name:255, DisplayName:255, Description:255, APIPath:500, PaginationType:20, Status:25, MetadataSource:20, CreateBodyShape:50, UpdateBodyShape:50, CreateIDLocation:20, UpdateIDLocation:20, DeleteIDLocation:20, CreateMethod:20, UpdateMethod:20, DeleteMethod:10, IncrementalWatermarkField:255, Type:100, DefaultValue:255, CreateBodyKey:100, UpdateBodyKey:100, StableOrderingKey:255 };
const BIT = new Set(['SupportsPagination','SupportsIncrementalSync','SupportsWrite','SupportsCreate','SupportsUpdate','SupportsDelete','AllowsNull','IsPrimaryKey','IsUniqueKey','IsReadOnly','IsRequired']);
const NUM = new Set(['Length','Precision','Scale']);

function sqlVal(col, v) {
  if (v === undefined || v === null) return 'NULL';
  if (BIT.has(col)) return (v === true || v === 1 || v === '1' || v === 'true') ? '1' : '0';
  if (NUM.has(col)) { const n = Number(v); return Number.isFinite(n) ? String(n) : 'NULL'; }
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (W[col] && s.length > W[col]) s = s.slice(0, W[col]);
  return `N'${s.replace(/'/g, "''")}'`;
}

const a = JSON.parse(readFileSync(META, 'utf8'));
const r = Array.isArray(a) ? a[0] : a;
const integrationID = onlyGuid(sqlcmd(`SET NOCOUNT ON; SELECT CAST(ID AS VARCHAR(36)) FROM __mj.Integration WHERE Name='Salesforce';`));
if (!integrationID) throw new Error('could not resolve Salesforce IntegrationID');
const ios = r.relatedEntities['MJ: Integration Objects'];
console.log(`Salesforce IntegrationID=${integrationID}, IO=${ios.length}`);

// 0) clean existing SF IO/IOF (set-based)
sqlcmd(`SET NOCOUNT ON;
  DELETE f FROM __mj.IntegrationObjectField f JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID WHERE io.IntegrationID='${integrationID}';
  DELETE FROM __mj.IntegrationObject WHERE IntegrationID='${integrationID}';`);
console.log('cleaned existing SF IO/IOF');

// 1) assign IDs + insert IO in batches of 200
const ioRows = ios.map(io => ({ id: randomUUID().toUpperCase(), f: { ...io.fields, MetadataSource: io.fields.MetadataSource ?? 'Declared' }, iofs: io.relatedEntities?.['MJ: Integration Object Fields'] || [] }));
let ioIns = 0;
for (let i = 0; i < ioRows.length; i += 100) {
  const batch = ioRows.slice(i, i + 100);
  const vals = batch.map(x => `('${x.id}','${integrationID}',${IO_COLS.map(c => sqlVal(c, x.f[c])).join(',')})`).join(',\n');
  sqlcmd(`SET NOCOUNT ON; INSERT INTO __mj.IntegrationObject (ID,IntegrationID,${IO_COLS.join(',')}) VALUES\n${vals};`);
  ioIns += batch.length;
}
console.log(`inserted ${ioIns} IO`);

// 2) insert IOF in batches of 500
let iofRows = [];
for (const x of ioRows) for (const f of x.iofs) iofRows.push({ ioid: x.id, f: { ...f.fields, MetadataSource: f.fields.MetadataSource ?? 'Declared' } });
let iofIns = 0;
for (let i = 0; i < iofRows.length; i += 500) {
  const batch = iofRows.slice(i, i + 500);
  const vals = batch.map(x => `(NEWID(),'${x.ioid}',${IOF_COLS.map(c => sqlVal(c, x.f[c])).join(',')})`).join(',\n');
  sqlcmd(`SET NOCOUNT ON; INSERT INTO __mj.IntegrationObjectField (ID,IntegrationObjectID,${IOF_COLS.join(',')}) VALUES\n${vals};`);
  iofIns += batch.length;
  if (iofIns % 5000 === 0) console.log(`  ${iofIns}/${iofRows.length} IOF`);
}
console.log(`inserted ${iofIns} IOF`);

const finalIO = sqlcmd(`SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject WHERE IntegrationID='${integrationID}';`).match(/\d+/)[0];
const finalIOF = sqlcmd(`SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObjectField f JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID WHERE io.IntegrationID='${integrationID}';`).match(/\d+/)[0];
console.log(JSON.stringify({ dir: 'salesforce', name: 'Salesforce', afterIO: Number(finalIO), afterIOF: Number(finalIOF) }));
