import sql from 'mssql';
const cfg={server:'localhost',port:1444,database:'MJ_SS_E2E',user:'sa',password:'Claude2Sql99',options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000};
try{
  const p=await new sql.ConnectionPool(cfg).connect();
  const q=(s)=>p.request().query(s);
  // 1) field maps whose entity map references a non-core entity
  let r=await q(`DELETE fm FROM __mj.CompanyIntegrationFieldMap fm JOIN __mj.CompanyIntegrationEntityMap m ON m.ID=fm.EntityMapID JOIN __mj.Entity e ON e.ID=m.EntityID WHERE e.SchemaName<>'__mj'`);
  console.log('deleted field maps:',r.rowsAffected[0]);
  // 2) entity maps referencing non-core entities
  r=await q(`DELETE m FROM __mj.CompanyIntegrationEntityMap m JOIN __mj.Entity e ON e.ID=m.EntityID WHERE e.SchemaName<>'__mj'`);
  console.log('deleted entity maps:',r.rowsAffected[0]);
  await p.close();
}catch(e){console.log('PURGE ERROR:',e.message.slice(0,140));}
