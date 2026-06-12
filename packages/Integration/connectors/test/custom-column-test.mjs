// Custom-column capture test (#3 blacklist method). NOT committed; throwaway.
// Disable a non-PK field map (campaign_name) → sync → the now-unmapped source field
// should land in __mj_integration_CustomOverflow → cancel → ALWAYS re-enable the map.
import { execSync } from 'child_process';
const KEY = process.env.MJ_API_KEY;
const CIID = '25564822-3426-4C03-B875-66C5BFA2E379';
const FIELD = 'campaign_name';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function sql(q) {
  return execSync(`docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Claude2Sql99" -C -d MJ_SS_E2E -h -1 -W -Q "${q}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean).join(' ');
}
async function gql(query, variables) {
  const r = await fetch('http://localhost:4007/', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': KEY },
    body: JSON.stringify({ query, variables }) });
  return r.json();
}
const setStatus = (s) => sql(`SET NOCOUNT ON; UPDATE fm SET Status='${s}' FROM __mj.CompanyIntegrationFieldMap fm JOIN __mj.CompanyIntegrationEntityMap em ON em.ID=fm.EntityMapID WHERE em.CompanyIntegrationID='${CIID}' AND em.ExternalObjectName='checkin_questions' AND fm.SourceFieldName='${FIELD}'; SELECT @@ROWCOUNT;`);
const overflowCount = () => sql(`SET NOCOUNT ON; SELECT COUNT(*) FROM propfuel.checkin_questions WHERE __mj_integration_CustomOverflow LIKE '%${FIELD}%';`);

let report = [];
try {
  report.push(`[setup] disable map(${FIELD}) → rowsAffected=${setStatus('Inactive')}`);
  report.push(`[setup] overflow-with-${FIELD} before: ${overflowCount()}`);
  const start = await gql(`mutation($ciid:String!){ IntegrationStartSync(companyIntegrationID:$ciid, fullSync:false){ Success Message RunID } }`, { ciid: CIID });
  const runid = start?.data?.IntegrationStartSync?.RunID;
  report.push(`[sync] started ${runid || JSON.stringify(start).slice(0,120)}`);
  // poll up to ~2min for the unmapped field to land in overflow
  let landed = 0;
  for (let i = 0; i < 8; i++) {
    await sleep(15000);
    landed = parseInt(overflowCount(), 10) || 0;
    report.push(`[poll ${i}] overflow-with-${FIELD}: ${landed}`);
    if (landed > 0) break;
  }
  await gql(`mutation($ciid:String!){ IntegrationCancelSync(companyIntegrationID:$ciid){ Success } }`, { ciid: CIID });
  report.push(`[verdict] ${landed > 0 ? '✅ custom-capture WORKS — unmapped field landed in overflow' : '⚠️ no overflow observed in window (records may have skipped / need longer)'}`);
} catch (e) {
  report.push(`[error] ${String(e.message).slice(0, 160)}`);
} finally {
  report.push(`[restore] re-enable map(${FIELD}) → rowsAffected=${setStatus('Active')}`);
}
console.log(report.join('\n'));
