import sql from 'mssql';
const cfg={server:'localhost',port:1444,database:'MJ_SS_E2E',user:'sa',password:'Claude2Sql99',options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000};
const p=await new sql.ConnectionPool(cfg).connect();
const r=await p.request().query(`DELETE m FROM __mj.CompanyIntegrationEntityMap m JOIN __mj.Entity e ON e.ID=m.EntityID WHERE e.SchemaName<>'__mj'`);
console.log('  deleted orphan entity maps:',r.rowsAffected[0]);
await p.close();
