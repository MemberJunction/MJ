import sql from 'mssql';
const cfg={server:'localhost',port:1444,database:'MJ_SS_E2E',user:'sa',password:'Claude2Sql99',options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000};
const SCH=process.env.DROP_SCHEMA;
const p=await new sql.ConnectionPool(cfg).connect();
const q=(s)=>p.request().query(s);
const exists=(await q(`SELECT COUNT(*) c FROM sys.schemas WHERE name='${SCH}'`)).recordset[0].c;
if(!exists){console.log('  schema',SCH,'absent');await p.close();process.exit(0);}
// drop views, procedures, functions, then FKs, tables, schema
for(const [type,col] of [['V','views'],['P','procedures']]){
  const objs=(await q(`SELECT '['+SCHEMA_NAME(o.schema_id)+'].['+o.name+']' n, o.type FROM sys.objects o WHERE SCHEMA_NAME(o.schema_id)='${SCH}' AND o.type IN ('V','P','FN','IF','TF')`)).recordset;
  for(const o of objs){const kw=o.type.trim()==='V'?'VIEW':(o.type.trim()==='P'?'PROCEDURE':'FUNCTION');try{await q(`DROP ${kw} ${o.n}`)}catch{}}
  break;
}
const fks=(await q(`SELECT '['+s.name+'].['+t.name+']' tbl, fk.name fk FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='${SCH}'`)).recordset;
for(const f of fks) try{await q(`ALTER TABLE ${f.tbl} DROP CONSTRAINT [${f.fk}]`)}catch{}
const tbls=(await q(`SELECT '['+s.name+'].['+t.name+']' tbl FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='${SCH}'`)).recordset;
for(const t of tbls) try{await q(`DROP TABLE ${t.tbl}`)}catch{}
try{await q(`DROP SCHEMA [${SCH}]`);console.log('  dropped schema',SCH);}catch(e){console.log('  '+SCH+' schema drop:',e.message.slice(0,70));}
await p.close();
