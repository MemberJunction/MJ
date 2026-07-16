import sql from 'mssql';
const cfg={server:'localhost',port:1444,database:'MJ_SS_E2E',user:'sa',password:'Claude2Sql99',options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000};
const S='__mj', NAME=process.env.INT_NAME;
const p=await new sql.ConnectionPool(cfg).connect();
const q=(s)=>p.request().query(s);
const ints=(await q(`SELECT ID FROM ${S}.Integration WHERE Name='${NAME}'`)).recordset.map(r=>r.ID);
if(ints.length){
  const inList=ints.map(id=>`'${id}'`).join(',');
  const cis=(await q(`SELECT ID FROM ${S}.CompanyIntegration WHERE IntegrationID IN (${inList})`)).recordset.map(r=>r.ID);
  if(cis.length){const ciList=cis.map(id=>`'${id}'`).join(',');
    const runs=(await q(`SELECT ID FROM ${S}.CompanyIntegrationRun WHERE CompanyIntegrationID IN (${ciList})`)).recordset.map(r=>r.ID);
    if(runs.length){const rl=runs.map(id=>`'${id}'`).join(',');for(const t of ['CompanyIntegrationRunAPILog','CompanyIntegrationRunDetail'])try{await q(`DELETE FROM ${S}.${t} WHERE CompanyIntegrationRunID IN (${rl})`)}catch{}}
    for(const t of ['CompanyIntegrationEntityMap','CompanyIntegrationRecordMap','CompanyIntegrationRun'])try{await q(`DELETE FROM ${S}.${t} WHERE CompanyIntegrationID IN (${ciList})`)}catch(e){console.log('  '+t+' err:',e.message.slice(0,50))}
    await q(`DELETE FROM ${S}.CompanyIntegration WHERE ID IN (${ciList})`);
  }
}
await p.close();
