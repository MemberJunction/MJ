#!/usr/bin/env node
// Applies the composite-parent-PK to the DEPLOYED DB (IntegrationObjectField) + resets the blackbaud
// entity tables/metadata so the e2e's ApplyAll rebuilds them with the new composite PKs. Idempotent.
import sql from '../../../../../node_modules/mssql/index.js';

const VAR_PARENT = {
  constituent_id: { parent: 'constituent', field: 'id' }, gift_id: { parent: 'gift', field: 'id' },
  appeal_id: { parent: 'fundraising_appeal', field: 'id' }, campaign_id: { parent: 'fundraising_campaign', field: 'id' },
  fund_id: { parent: 'fund', field: 'id' }, opportunity_id: { parent: 'opportunity', field: 'id' },
  batch_id: { parent: 'gift_batch', field: 'id' }, fundraiser_id: { parent: 'fundraiser', field: 'id' },
  gift_tribute_id: { parent: 'gift_tribute', field: 'id' }, giftlookupid: { parent: 'gift', field: 'lookup_id' },
};
const extractVars = (p) => [...String(p || '').matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);

const pool = await sql.connect({ server: 'localhost', port: 14455, user: 'sa', password: 'Claude2Sql99', database: 'MJ_BB_E2E', options: { trustServerCertificate: true, encrypt: false }, requestTimeout: 300000 });
const iid = (await pool.request().query("SELECT ID FROM __mj.Integration WHERE Name='Blackbaud'")).recordset[0].ID;
const ios = (await pool.request().query(`SELECT ID, Name, APIPath FROM __mj.IntegrationObject WHERE IntegrationID='${iid}' AND Status='Active' AND APIPath LIKE '%{%}%'`)).recordset;

let flagged = 0, inserted = 0;
for (const io of ios) {
  for (const v of extractVars(io.APIPath)) {
    const ex = (await pool.request().query(`SELECT ID FROM __mj.IntegrationObjectField WHERE IntegrationObjectID='${io.ID}' AND LOWER(Name)='${v.toLowerCase()}'`)).recordset;
    if (ex.length) {
      await pool.request().query(`UPDATE __mj.IntegrationObjectField SET IsPrimaryKey=1, IsReadOnly=1 WHERE ID='${ex[0].ID}'`);
      flagged++;
    } else {
      const vp = VAR_PARENT[v];
      let relID = 'NULL';
      if (vp) { const p = (await pool.request().query(`SELECT ID FROM __mj.IntegrationObject WHERE IntegrationID='${iid}' AND Name='${vp.parent}'`)).recordset; if (p.length) relID = `'${p[0].ID}'`; }
      const seq = (await pool.request().query(`SELECT ISNULL(MAX(Sequence),0)+1 s FROM __mj.IntegrationObjectField WHERE IntegrationObjectID='${io.ID}'`)).recordset[0].s;
      const relFld = vp ? `'${vp.field}'` : 'NULL';
      await pool.request().query(`INSERT INTO __mj.IntegrationObjectField (IntegrationObjectID, Name, DisplayName, Description, Type, Length, AllowsNull, IsRequired, IsReadOnly, IsUniqueKey, IsPrimaryKey, Sequence, Status, RelatedIntegrationObjectID, RelatedIntegrationObjectFieldName)
        VALUES ('${io.ID}', '${v}', '${v}', 'Composite parent-PK for {${v}} — makes (parent, child) a distinct stable identity.', 'String', 100, 0, 1, 1, 0, 1, ${seq}, 'Active', ${relID}, ${relFld})`);
      inserted++;
    }
  }
}

// reset blackbaud entities so ApplyAll rebuilds tables with composite PKs (GATED — destructive)
const ents = (await pool.request().query("SELECT ID, BaseTable FROM __mj.Entity WHERE SchemaName='blackbaud'")).recordset;
let dropped = 0;
if (process.env.RESET_TABLES !== '1') {
  console.log(JSON.stringify({ flagged, inserted, entitiesReset: 0, tablesDropped: 0, note: 'IOF-only (non-destructive); set RESET_TABLES=1 to drop+rebuild' }));
  await pool.close();
  process.exit(0);
}
for (const e of ents) {
  try { await pool.request().query(`IF OBJECT_ID('blackbaud.[${e.BaseTable}]','U') IS NOT NULL DROP TABLE blackbaud.[${e.BaseTable}]`); } catch { /* fk order */ }
}
// second pass for FK-blocked drops
for (const e of ents) { try { await pool.request().query(`IF OBJECT_ID('blackbaud.[${e.BaseTable}]','U') IS NOT NULL DROP TABLE blackbaud.[${e.BaseTable}]`); dropped++; } catch (err) { console.error('drop fail', e.BaseTable, err.message.slice(0, 60)); } }
// delete entity metadata (fields, permissions, relationships, then entity) + entity maps
const eids = ents.map((e) => `'${e.ID}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
for (const tbl of ['EntityFieldValue', 'EntityField', 'EntityPermission', 'EntityRelationship']) {
  try { await pool.request().query(`DELETE FROM __mj.${tbl} WHERE EntityID IN (${eids})`); } catch (e) { /* some may not have EntityID */ }
}
try { await pool.request().query(`DELETE FROM __mj.EntityRelationship WHERE RelatedEntityID IN (${eids})`); } catch {}
await pool.request().query(`DELETE FROM __mj.CompanyIntegrationRecordMap WHERE EntityID IN (${eids})`);
await pool.request().query(`DELETE FROM __mj.Entity WHERE ID IN (${eids})`);

console.log(JSON.stringify({ flagged, inserted, entitiesReset: ents.length, tablesDropped: dropped }));
await pool.close();
