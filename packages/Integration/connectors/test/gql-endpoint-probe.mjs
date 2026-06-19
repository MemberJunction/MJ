// Overnight GQL endpoint probe — exercises integration read/monitoring endpoints.
// NOT committed; a throwaway test artifact. Lifecycle mutations (RefreshConnectorSchema,
// ApplyAll, StartSync, CancelSync, CreateConnection) are already proven by tonight's live run.
const URL = 'http://localhost:4007/';
const KEY = process.env.MJ_API_KEY;
const CIID = '25564822-3426-4C03-B875-66C5BFA2E379';
const RUNID = process.env.PROBE_RUNID || '15058A6F-73ED-4F49-916E-FC34B222FDD9';

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': KEY },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const ci = { ciid: CIID };
const run = { r: RUNID };

const probes = [
  ['GetStatus', `query($ciid:String!){ IntegrationGetStatus(companyIntegrationID:$ciid){ Success Message IsActive TotalEntityMaps ActiveEntityMaps LastRunStatus RSUEnabled RSURunning RSUOutOfSync } }`, ci],
  ['ListRuns', `query($ciid:String!){ IntegrationListRuns(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['ListEntityMaps', `query($ciid:String!){ IntegrationListEntityMaps(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['ListSourceObjects', `query($ciid:String!){ IntegrationListSourceObjects(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['TestConnection', `query($ciid:String!){ IntegrationTestConnection(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['GetSyncConfig', `query($ciid:String!){ IntegrationGetSyncConfig(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['ListFieldMaps', `query($ciid:String!){ IntegrationListFieldMaps(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['GetConnectorCapabilities', `query($ciid:String!){ IntegrationGetConnectorCapabilities(companyIntegrationID:$ciid){ Success Message SupportsGet SupportsCreate SupportsUpdate SupportsDelete SupportsSearch } }`, ci],
  ['ListConnections', `query($ciid:String!){ IntegrationListConnections(companyIntegrationID:$ciid){ Success Message } }`, ci],
  ['GetRun', `query($r:String!){ IntegrationGetRun(runID:$r){ Success Message } }`, run],
  ['TailRunEvents', `query($r:String!){ IntegrationTailRunEvents(runID:$r){ Success Message LatestSeq IsInFlight } }`, run],
];

const results = [];
for (const [name, query, variables] of probes) {
  try {
    const res = await gql(query, variables);
    if (res.errors) {
      results.push(`❌ ${name}: GQL-ERROR ${JSON.stringify(res.errors[0].message).slice(0, 140)}`);
    } else {
      const d = res.data ? res.data[Object.keys(res.data)[0]] : null;
      const ok = d && d.Success !== false;
      results.push(`${ok ? '✅' : '⚠️'} ${name}: ${JSON.stringify(d).slice(0, 160)}`);
    }
  } catch (e) {
    results.push(`❌ ${name}: THREW ${String(e.message).slice(0, 120)}`);
  }
}
console.log(results.join('\n'));
