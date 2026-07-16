import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const seed = JSON.parse(readFileSync('/tmp/magnetmail-seed/metadata/integrations/magnetmail/.magnetmail.integration.json','utf8'));
const ios = (seed[0]||seed).relatedEntities['MJ: Integration Objects'];
const NS='http://www.magnetmail.net/';
const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const cfgOf=(io)=>{let c=io.fields.Configuration;if(typeof c==='string'){try{c=JSON.parse(c)}catch{c={}}}return c||{};};
const recXml=(recElem,r)=>`<${recElem}>${Object.entries(r).map(([k,v])=>`<${k}>${esc(v)}</${k}>`).join('')}</${recElem}>`;
// group syncable objects by their SOAP list operation (shared ops → one response carrying all record types)
const byOp=new Map();
for(const io of ios){const c=cfgOf(io);const op=c.ListOperation||c.SoapListAction;if(!op)continue;
  const rdk=io.fields.ResponseDataKey||c.XsdType||io.fields.Name;
  const iofs=(io.relatedEntities?.['MJ: Integration Object Fields']||[]).map(x=>x.fields);
  const pk=iofs.find(f=>f.IsPrimaryKey)?.Name||'Id';
  const flds=[...new Set([pk,...iofs.filter(f=>!/^__/.test(f.Name)).slice(0,5).map(f=>f.Name)])];
  if(!byOp.has(op))byOp.set(op,[]);
  byOp.get(op).push({rdk,pk,flds});
}
const routes=[{Path:'/',Method:'POST',Match:'<Authenticate ',Status:200,
  Body:`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><AuthenticateResponse xmlns="${NS}"><AuthenticateResult><sessionId>mock-session-123</sessionId><user_id>mock-user-1</user_id></AuthenticateResult></AuthenticateResponse></soap:Body></soap:Envelope>`}];
for(const [op,objs] of byOp){
  // one Result containing records of EVERY record type sharing this op
  const recordsXml = objs.map(o=>[1,2,3].map(i=>recXml(o.rdk, Object.fromEntries(o.flds.map(fn=>[fn, fn===o.pk?String(i):`mock-${fn}-${i}`])))).join('')).join('');
  routes.push({Path:'/',Method:'POST',Match:`<${op} `,Status:200,
    Body:`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op}Response xmlns="${NS}"><${op}Result>${recordsXml}</${op}Result></${op}Response></soap:Body></soap:Envelope>`});
}
const creds={Endpoint:'http://127.0.0.1:9',Username:'mock-user@example.com',Password:'mock-pass',ApiKey:'mock-token',Token:'mock-token'};
const fixture={HandAuthored:true,Transport:'http',ConfigUrlKey:'Endpoint',Configuration:creds,Routes:routes,Objects:[...byOp.values()].flat().map(o=>({Name:o.rdk})),DeltaPasses:[]};
mkdirSync(`${process.env.T}/fixtures/magnetmail/fixtures`,{recursive:true});
writeFileSync(`${process.env.T}/fixtures/magnetmail/fixtures/fixtures.json`,JSON.stringify(fixture,null,2));
console.log('unique ops:',byOp.size,'| record types:',[...byOp.values()].flat().length,'| routes:',routes.length);
