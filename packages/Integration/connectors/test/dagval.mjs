import { connectorE2EMock } from './plans.mjs';
import { readFileSync } from 'node:fs';
const cfg=JSON.parse(readFileSync('/tmp/matrix-config.json','utf8'));
const CT=Object.fromEntries(cfg.map(c=>[c.dir,c.credTypeID]));
const base={E2E_MODE:'mock',E2E_REGEN_FIXTURES:'true',HS_LIVE_GRAPHQL_URL:'http://localhost:4021/',HS_LIVE_PLATFORM:'sqlserver',HS_LIVE_COMPANY_ID:'C0FFEE00-0000-4000-8000-000000000013',HS_LIVE_DB_HOST:'localhost',HS_LIVE_DB_PORT:'1444',HS_LIVE_DB_NAME:'MJ_CONN_E2E',HS_LIVE_DB_USER:'sa',HS_LIVE_MJ_SCHEMA:'__mj'};
for(const [dir,name] of [['cvent','Cvent'],['neon-crm','Neon CRM']]){
  Object.assign(process.env,base,{E2E_CONNECTOR:dir,E2E_INTEGRATION:name,HS_LIVE_CREDTYPE_ID:CT[dir]});
  try{const r=await connectorE2EMock({dbPassword:process.env.DB_PASSWORD,mjSystemKey:process.env.MJ_API_KEY},x=>x);
    const dag=(r.steps||{}).dag||[];
    const fh=dag.find(s=>s.name==='dag.full-hierarchy');
    console.log(dir+': dag.full-hierarchy='+(fh?JSON.stringify(fh.detail||fh):'(missing)'));
  }catch(e){console.log(dir+': ERR '+String(e.message).slice(0,80));}
}
