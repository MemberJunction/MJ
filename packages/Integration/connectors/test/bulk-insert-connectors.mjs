#!/usr/bin/env node
// bulk-insert-connectors.mjs — deploy the 20 connectors' metadata DIRECTLY via mssql bulk insert,
// bypassing mj-sync's per-record save path (which hangs for ~hours on the full ./metadata).
// Reads metadata files, resolves @lookup/@parent/@file, generates UUIDs, deletes any prior rows
// for these integrations, then bulk-inserts CredentialType (missing) + Integration + IntegrationObject
// + IntegrationObjectField. Fast (seconds). Idempotent (deletes-then-inserts by integration Name).
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

// Portable: repo root = 4 levels up from this script (packages/Integration/connectors/test), override via MJ_REPO_ROOT.
const REPO = process.env.MJ_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MD = path.join(REPO, 'metadata');
const SCHEMA = '__mj';
// Connector set: scan metadata/integrations/<dir> for a .<dir>.integration.json (override via CONNECTORS env, comma-list).
const CONNECTORS = process.env.CONNECTORS
  ? process.env.CONNECTORS.split(',').map(s => s.trim()).filter(Boolean)
  : fs.readdirSync(path.join(MD, 'integrations'), { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(MD, 'integrations', d.name, `.${d.name}.integration.json`)))
      .map(d => d.name).sort();

const cfg = { server: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 1444),
  database: process.env.DB_DATABASE || 'MJ_SS_E2E', user: process.env.DB_USERNAME || 'sa', password: process.env.DB_PASSWORD || 'Claude2Sql99',
  options:{ encrypt:false, trustServerCertificate:true, enableArithAbort:true }, requestTimeout:600000, pool:{max:5,min:1} };

// ---- column specs (name, mssql type, notNull-default) from the live schema ----
const T = sql;
const INT_COLS = [
  ['ID',T.UniqueIdentifier],['Name',T.NVarChar(200)],['Description',T.NVarChar(510)],['NavigationBaseURL',T.NVarChar(1000)],
  ['ClassName',T.NVarChar(200)],['ImportPath',T.NVarChar(200)],['BatchMaxRequestCount',T.Int,-1],['BatchRequestWaitTime',T.Int,-1],
  ['CredentialTypeID',T.UniqueIdentifier],['Icon',T.NVarChar(T.MAX)],['Configuration',T.NVarChar(T.MAX)] ];
const IO_COLS = [
  ['ID',T.UniqueIdentifier],['IntegrationID',T.UniqueIdentifier],['Name',T.NVarChar(510)],['DisplayName',T.NVarChar(510)],
  ['Description',T.NVarChar(T.MAX)],['Category',T.NVarChar(200)],['APIPath',T.NVarChar(1000)],['ResponseDataKey',T.NVarChar(510)],
  ['DefaultPageSize',T.Int,100],['SupportsPagination',T.Bit,true],['PaginationType',T.NVarChar(40),'PageNumber'],
  ['SupportsIncrementalSync',T.Bit,false],['SupportsWrite',T.Bit,false],['DefaultQueryParams',T.NVarChar(T.MAX)],
  ['Configuration',T.NVarChar(T.MAX)],['Sequence',T.Int,0],['Status',T.NVarChar(50),'Active'],['WriteAPIPath',T.NVarChar(1000)],
  ['WriteMethod',T.NVarChar(20)],['DeleteMethod',T.NVarChar(20)],['IsCustom',T.Bit,false],['CreateAPIPath',T.NVarChar(T.MAX)],
  ['CreateMethod',T.NVarChar(40)],['CreateBodyShape',T.NVarChar(100)],['CreateBodyKey',T.NVarChar(200)],['CreateIDLocation',T.NVarChar(40)],
  ['UpdateAPIPath',T.NVarChar(T.MAX)],['UpdateMethod',T.NVarChar(40)],['UpdateBodyShape',T.NVarChar(100)],['UpdateBodyKey',T.NVarChar(200)],
  ['UpdateIDLocation',T.NVarChar(40)],['DeleteAPIPath',T.NVarChar(T.MAX)],['DeleteIDLocation',T.NVarChar(40)],
  ['IncrementalWatermarkField',T.NVarChar(510)],['MetadataSource',T.NVarChar(40),'Declared'],['SupportsCreate',T.Bit,false],
  ['SupportsUpdate',T.Bit,false],['SupportsDelete',T.Bit,false],['SyncStrategy',T.NVarChar(100)],['ContentHashApplicable',T.Bit,true],
  ['StableOrderingKey',T.NVarChar(510)] ];
const IOF_COLS = [
  ['ID',T.UniqueIdentifier],['IntegrationObjectID',T.UniqueIdentifier],['Name',T.NVarChar(510)],['DisplayName',T.NVarChar(510)],
  ['Description',T.NVarChar(T.MAX)],['Category',T.NVarChar(200)],['Type',T.NVarChar(200),'string'],['Length',T.Int],['Precision',T.Int],
  ['Scale',T.Int],['AllowsNull',T.Bit,true],['DefaultValue',T.NVarChar(510)],['IsPrimaryKey',T.Bit,false],['IsUniqueKey',T.Bit,false],
  ['IsReadOnly',T.Bit,false],['IsRequired',T.Bit,false],['RelatedIntegrationObjectID',T.UniqueIdentifier],
  ['RelatedIntegrationObjectFieldName',T.NVarChar(510)],['Sequence',T.Int,0],['Configuration',T.NVarChar(T.MAX)],
  ['Status',T.NVarChar(50),'Active'],['IsCustom',T.Bit,false],['MetadataSource',T.NVarChar(40),'Declared'] ];

const isBit = (t)=> t===T.Bit;
const isInt = (t)=> t===T.Int;
const isUid = (t)=> t===T.UniqueIdentifier;

function readFileRef(val, baseDir){ // @file:rel/path
  const rel = val.slice('@file:'.length);
  const p = path.join(baseDir, rel);
  return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : null;
}
function lookupName(val){ // @lookup:Entity.Name=X(&...)  -> X
  const m = /Name=([^&]+)/.exec(val); return m ? m[1] : null;
}
function coerce(raw, type, def, baseDir){
  if (raw === undefined || raw === null){ return def !== undefined ? def : null; }
  let v = raw;
  if (typeof v === 'object'){ v = JSON.stringify(v); }
  if (typeof v === 'string' && v.startsWith('@file:')){ v = readFileRef(v, baseDir); if(v==null) return def!==undefined?def:null; }
  if (isBit(type)){ if(typeof v==='boolean') return v; const s=String(v).toLowerCase(); return s==='true'||s==='1'?true:(s==='false'||s==='0'?false:(def??false)); }
  if (isInt(type)){ const n=Number(v); return Number.isFinite(n)?Math.trunc(n):(def!==undefined?def:null); }
  return v; // nvarchar
}

function buildRow(cols, fields, baseDir, overrides){
  const row = {};
  for (const [name,type,def] of cols){
    if (overrides && (name in overrides)){ row[name]=overrides[name]; continue; }
    let raw = fields ? fields[name] : undefined;
    // never take FK/ref strings from fields for uid columns we don't explicitly set -> null
    if (typeof raw==='string' && (raw.startsWith('@lookup:')||raw.startsWith('@parent:')||raw.startsWith('@root:'))){ raw = undefined; }
    row[name]=coerce(raw,type,def,baseDir);
  }
  return row;
}
function mkTable(fullName, cols){
  const t = new sql.Table(fullName);
  for (const [name,type,def] of cols){ const notNull = def!==undefined || name==='ID' || name==='IntegrationID' || name==='IntegrationObjectID' || name==='Name' || name==='APIPath' || name==='Type'; t.columns.add(name,type,{nullable:!notNull}); }
  return t;
}
function addRow(t, cols, row){ t.rows.add(...cols.map(([n])=> row[n])); }

async function main(){
  const pool = await new sql.ConnectionPool(cfg).connect();
  const log = (m)=>process.stdout.write(m+'\n');

  // credtype name -> id
  const ctRows = (await pool.request().query(`SELECT ID,Name FROM ${SCHEMA}.CredentialType`)).recordset;
  const ctMap = new Map(ctRows.map(r=>[r.Name, r.ID]));
  log(`existing credtypes: ${ctMap.size}`);

  // insert missing credtypes from metadata
  const ctFile = path.join(MD,'credential-types','.credential-types.json');
  const ctMeta = JSON.parse(fs.readFileSync(ctFile,'utf8'));
  const ctArr = Array.isArray(ctMeta)?ctMeta:[ctMeta];
  let ctIns=0;
  for (const c of ctArr){
    const f=c.fields||{}; if(!f.Name||ctMap.has(f.Name)) continue;
    const id=randomUUID();
    const r=pool.request();
    r.input('ID',T.UniqueIdentifier,id); r.input('Name',T.NVarChar(200),f.Name);
    r.input('Description',T.NVarChar(T.MAX), f.Description??null);
    r.input('Category',T.NVarChar(200), f.Category??'API');
    r.input('FieldSchema',T.NVarChar(T.MAX), coerce(f.FieldSchema,T.NVarChar(T.MAX),'{}',path.join(MD,'credential-types')));
    r.input('IconClass',T.NVarChar(200), f.IconClass??null);
    r.input('ValidationEndpoint',T.NVarChar(T.MAX), f.ValidationEndpoint??null);
    await r.query(`INSERT INTO ${SCHEMA}.CredentialType (ID,Name,Description,Category,FieldSchema,IconClass,ValidationEndpoint) VALUES (@ID,@Name,@Description,@Category,@FieldSchema,@IconClass,@ValidationEndpoint)`);
    ctMap.set(f.Name,id); ctIns++;
  }
  log(`credtypes inserted (missing): ${ctIns}`);

  // parse all connectors
  const intTable=mkTable(`${SCHEMA}.Integration`,INT_COLS);
  const ioTable=mkTable(`${SCHEMA}.IntegrationObject`,IO_COLS);
  const iofTable=mkTable(`${SCHEMA}.IntegrationObjectField`,IOF_COLS);
  const intNames=[];
  let nIO=0,nIOF=0;
  for (const dir of CONNECTORS){
    const ddir=path.join(MD,'integrations',dir);
    const file=fs.readdirSync(ddir).find(x=>x.endsWith('.integration.json'));
    if(!file){ log(`!! ${dir}: no .integration.json`); continue; }
    const o=JSON.parse(fs.readFileSync(path.join(ddir,file),'utf8'));
    const I=Array.isArray(o)?o[0]:o;
    const f=I.fields||{};
    const intgId=randomUUID();
    intNames.push(f.Name);
    const ctName=typeof f.CredentialTypeID==='string'?lookupName(f.CredentialTypeID):null;
    const ctId=ctName?ctMap.get(ctName)??null:null;
    addRow(intTable,INT_COLS, buildRow(INT_COLS,f,ddir,{ID:intgId,CredentialTypeID:ctId}));
    const re=I.relatedEntities||{};
    const ios=re[Object.keys(re).find(k=>/Integration Object/i.test(k)&&!/Field/i.test(k))||'']||[];
    // pre-gen IO uuids + name map (for RelatedIntegrationObjectID sibling lookups)
    const ioIds=ios.map(()=>randomUUID());
    const ioNameMap=new Map(); ios.forEach((io,i)=>{ if(io.fields&&io.fields.Name) ioNameMap.set(io.fields.Name, ioIds[i]); });
    ios.forEach((io,i)=>{
      const iof_=io.fields||{};
      addRow(ioTable,IO_COLS, buildRow(IO_COLS,iof_,ddir,{ID:ioIds[i],IntegrationID:intgId}));
      nIO++;
      const cre=io.relatedEntities||{};
      const iofs=cre[Object.keys(cre).find(k=>/Field/i.test(k))||'']||[];
      for(const fld of iofs){
        const ff=fld.fields||{};
        let relId=null;
        if(typeof ff.RelatedIntegrationObjectID==='string' && ff.RelatedIntegrationObjectID.startsWith('@lookup:')){
          const rn=lookupName(ff.RelatedIntegrationObjectID); relId=rn?ioNameMap.get(rn)??null:null;
        }
        addRow(iofTable,IOF_COLS, buildRow(IOF_COLS,ff,ddir,{ID:randomUUID(),IntegrationObjectID:ioIds[i],RelatedIntegrationObjectID:relId}));
        nIOF++;
      }
    });
  }
  log(`parsed: ${intNames.length} integrations, ${nIO} IO, ${nIOF} IOF`);

  // delete any existing rows for these integrations (idempotent)
  const tvp=intNames.map(n=>`'`+n.replace(/'/g,"''")+`'`).join(',');
  await pool.request().query(`
    DELETE iof FROM ${SCHEMA}.IntegrationObjectField iof JOIN ${SCHEMA}.IntegrationObject io ON iof.IntegrationObjectID=io.ID JOIN ${SCHEMA}.Integration i ON io.IntegrationID=i.ID WHERE i.Name IN (${tvp});
    DELETE io FROM ${SCHEMA}.IntegrationObject io JOIN ${SCHEMA}.Integration i ON io.IntegrationID=i.ID WHERE i.Name IN (${tvp});
    DELETE FROM ${SCHEMA}.Integration WHERE Name IN (${tvp});`);
  log('deleted prior rows for these integrations');

  // bulk insert
  const t0=Date.now();
  const ri=await pool.request().bulk(intTable); log(`bulk Integration: ${ri.rowsAffected}`);
  const ro=await pool.request().bulk(ioTable); log(`bulk IntegrationObject: ${ro.rowsAffected}`);
  const rf=await pool.request().bulk(iofTable); log(`bulk IntegrationObjectField: ${rf.rowsAffected}`);
  log(`BULK INSERT DONE in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  const cnt=(await pool.request().query(`SELECT (SELECT COUNT(*) FROM ${SCHEMA}.Integration WHERE Name IN (${tvp})) AS i,(SELECT COUNT(*) FROM ${SCHEMA}.IntegrationObject) AS io,(SELECT COUNT(*) FROM ${SCHEMA}.IntegrationObjectField) AS iof`)).recordset[0];
  log(`DB now: integrations(of 20)=${cnt.i} IO_total=${cnt.io} IOF_total=${cnt.iof}`);
  await pool.close();
  log('DEPLOY-BULK COMPLETE');
}
main().catch(e=>{ console.error('BULK ERROR:', e.message); process.exit(1); });
