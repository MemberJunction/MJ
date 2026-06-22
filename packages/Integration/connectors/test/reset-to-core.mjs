#!/usr/bin/env node
// reset-to-core.mjs — drop ALL non-core (connector) entities + their physical schemas, returning the DB
// to the post-deploy baseline (core __mj entities only). Run between connectors so each connector's
// ApplyAll re-runs CodeGen over a SMALL entity set (core + itself), not an ever-growing accumulation.
// Fast direct SQL (seconds). Dynamic FK cleanup so it's robust to whatever __mj tables reference Entity.
import sql from 'mssql';
const cfg = { server: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 1444),
  database: process.env.DB_DATABASE || 'MJ_SS_E2E', user: process.env.DB_USERNAME || 'sa', password: process.env.DB_PASSWORD || 'Claude2Sql99',
  options:{ encrypt:false, trustServerCertificate:true, enableArithAbort:true }, requestTimeout:300000, pool:{max:3,min:1} };
const S='__mj';
const SYS = ['__mj','dbo','sys','guest','INFORMATION_SCHEMA','db_owner','db_accessadmin','db_securityadmin','db_ddladmin','db_backupoperator','db_datareader','db_datawriter','db_denydatareader','db_denydatawriter'];

async function main(){
  const pool=await new sql.ConnectionPool(cfg).connect();
  const q=(s)=>pool.request().query(s);
  const log=(m)=>process.stdout.write(m+'\n');
  const before=(await q(`SELECT COUNT(*) c FROM ${S}.Entity`)).recordset[0].c;

  // 1) drop non-core physical schemas (drop FKs -> tables -> schema)
  const schemas=(await q(`SELECT name FROM sys.schemas WHERE name NOT IN (${SYS.map(x=>`'${x}'`).join(',')}) AND name NOT LIKE '\\_\\_mj%' ESCAPE '\\'`)).recordset.map(r=>r.name);
  for(const sc of schemas){
    // drop FK constraints targeting/within this schema's tables
    const fks=(await q(`SELECT OBJECT_SCHEMA_NAME(parent_object_id) sch, OBJECT_NAME(parent_object_id) tbl, name FROM sys.foreign_keys WHERE OBJECT_SCHEMA_NAME(parent_object_id)='${sc}' OR OBJECT_SCHEMA_NAME(referenced_object_id)='${sc}'`)).recordset;
    for(const f of fks){ try{ await q(`ALTER TABLE [${f.sch}].[${f.tbl}] DROP CONSTRAINT [${f.name}]`);}catch{} }
    const tbls=(await q(`SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('${sc}')`)).recordset.map(r=>r.name);
    for(const t of tbls){ try{ await q(`DROP TABLE [${sc}].[${t}]`);}catch(e){ log(`  warn drop [${sc}].[${t}]: ${e.message.slice(0,60)}`);} }
    try{ await q(`DROP SCHEMA [${sc}]`);}catch(e){ log(`  warn drop schema ${sc}: ${e.message.slice(0,60)}`);}
  }
  if(schemas.length) log(`dropped ${schemas.length} connector schema(s): ${schemas.join(',')}`);

  // 2) delete non-core __mj.Entity metadata (children first, dynamic FK discovery)
  const nonCore=`(SELECT ID FROM ${S}.Entity WHERE SchemaName<>'__mj')`;
  // tables referencing __mj.EntityField (grandchildren via EntityFieldID)
  const efChildren=(await q(`SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id) sch, OBJECT_NAME(fk.parent_object_id) tbl, c.name col FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id JOIN sys.columns c ON c.object_id=fkc.parent_object_id AND c.column_id=fkc.parent_column_id WHERE fk.referenced_object_id=OBJECT_ID('${S}.EntityField') AND fk.parent_object_id<>OBJECT_ID('${S}.EntityField')`)).recordset;
  for(const r of efChildren){ try{ await q(`DELETE FROM [${r.sch}].[${r.tbl}] WHERE [${r.col}] IN (SELECT ID FROM ${S}.EntityField WHERE EntityID IN ${nonCore})`);}catch(e){ log(`  warn ef-child ${r.tbl}.${r.col}: ${e.message.slice(0,50)}`);} }
  // tables referencing __mj.Entity (children via EntityID etc.)
  const eChildren=(await q(`SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id) sch, OBJECT_NAME(fk.parent_object_id) tbl, c.name col FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id JOIN sys.columns c ON c.object_id=fkc.parent_object_id AND c.column_id=fkc.parent_column_id WHERE fk.referenced_object_id=OBJECT_ID('${S}.Entity') AND fk.parent_object_id<>OBJECT_ID('${S}.Entity')`)).recordset;
  for(const r of eChildren){ try{ await q(`DELETE FROM [${r.sch}].[${r.tbl}] WHERE [${r.col}] IN ${nonCore}`);}catch(e){ log(`  warn e-child ${r.tbl}.${r.col}: ${e.message.slice(0,50)}`);} }
  // now delete the entities themselves
  await q(`DELETE FROM ${S}.Entity WHERE SchemaName<>'__mj'`);

  const after=(await q(`SELECT COUNT(*) c FROM ${S}.Entity`)).recordset[0].c;
  log(`reset-to-core: entities ${before} -> ${after} (core)`);
  await pool.close();
}
main().catch(e=>{ console.error('RESET ERROR:',e.message); process.exit(1); });
