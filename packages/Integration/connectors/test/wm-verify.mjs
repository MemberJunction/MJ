// Watermark-narrowing live proof (throwaway, NOT committed). Isolates 'opens' (small), runs a clean
// full sync, asserts the saved Pull watermark is now a MICROTIME (the fix — pre-fix a clean keyset
// scan CLEARED it → re-scan), then an incremental to confirm it holds + narrows. Restores maps in finally.
import { execSync } from 'child_process';
const KEY = process.env.MJ_API_KEY;
const CIID = '25564822-3426-4C03-B875-66C5BFA2E379';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function sql(q) {
  return execSync(
    `docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Claude2Sql99" -C -d MJ_SS_E2E -h -1 -W -Q "${q}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
  ).trim();
}
async function gql(query, variables) {
  const r = await fetch('http://localhost:4007/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': KEY },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}
const setMaps = (s) =>
  sql(`SET NOCOUNT ON; UPDATE __mj.CompanyIntegrationEntityMap SET Status='${s}' WHERE CompanyIntegrationID='${CIID}' AND ExternalObjectName IN ('checkin_questions','clicks'); SELECT @@ROWCOUNT;`);
const opensMapId = sql(`SET NOCOUNT ON; SELECT ID FROM __mj.CompanyIntegrationEntityMap WHERE CompanyIntegrationID='${CIID}' AND ExternalObjectName='opens';`);
const wm = () =>
  sql(`SET NOCOUNT ON; SELECT ISNULL(CONVERT(varchar(100),WatermarkValue),'<null>')+' ['+ISNULL(WatermarkType,'-')+']' FROM __mj.CompanyIntegrationSyncWatermark WHERE EntityMapID='${opensMapId}' AND Direction='Pull';`);
const rows = () => sql(`SET NOCOUNT ON; SELECT COUNT(*) FROM propfuel.opens;`);
async function pollDone(rid, maxSec = 180) {
  for (let i = 0; i < maxSec / 3; i++) {
    await sleep(3000);
    const r = await gql(`query($r:String!){ IntegrationTailRunEvents(runID:$r){ IsInFlight LatestSeq } }`, { r: rid });
    const f = r?.data?.IntegrationTailRunEvents;
    if (f && f.IsInFlight === false) return `done (seq=${f.LatestSeq})`;
  }
  return 'TIMEOUT';
}
const out = [];
try {
  out.push(`opensMapId=${opensMapId}`);
  out.push(`[isolate] cq+clicks → Inactive (rows affected=${setMaps('Inactive')})`);
  out.push(`[before]  watermark=${wm()}  opens.rows=${rows()}`);

  let s = await gql(`mutation($c:String!){ IntegrationStartSync(companyIntegrationID:$c,fullSync:true){ Success Message RunID } }`, { c: CIID });
  let rid = s?.data?.IntegrationStartSync?.RunID;
  out.push(`[full sync] start: ${rid || JSON.stringify(s).slice(0, 160)}`);
  out.push(`[full sync] ${await pollDone(rid)}`);
  await sleep(2500);
  const wmFull = wm();
  const isMicro = /^\d{9,}/.test(wmFull);
  out.push(`[PROOF-1 watermark-saved] after CLEAN full sync → watermark=${wmFull}  opens.rows=${rows()}`);
  out.push(`   ${isMicro ? '✅ MICROTIME SAVED → narrowing enabled (pre-fix a clean keyset scan CLEARED this → full re-scan)' : '❌ not a microtime (cleared/ISO) — fix not active'}`);

  s = await gql(`mutation($c:String!){ IntegrationStartSync(companyIntegrationID:$c,fullSync:false){ Success Message RunID } }`, { c: CIID });
  rid = s?.data?.IntegrationStartSync?.RunID;
  out.push(`[incremental] start: ${rid || JSON.stringify(s).slice(0, 160)}`);
  out.push(`[incremental] ${await pollDone(rid)}`);
  await sleep(2500);
  const wmInc = wm();
  out.push(`[PROOF-2 narrowing] after incremental → watermark=${wmInc}  opens.rows=${rows()}`);
  out.push(`   ${/^\d{9,}/.test(wmInc) ? '✅ watermark HELD as microtime (incremental fetches microtime > watermark → only new)' : '⚠️ watermark changed unexpectedly'}`);
} catch (e) {
  out.push(`[ERROR] ${String(e.message).slice(0, 240)}`);
} finally {
  out.push(`[restore] cq+clicks → Active (rows affected=${setMaps('Active')})`);
}
console.log(out.join('\n'));
