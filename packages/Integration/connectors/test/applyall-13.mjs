// Credential-free ApplyAll across all 13 connectors (UNTRACKED test scaffold).
// Proves the runtime object-model tie-in: CreateConnection(dummy) -> IntegrationApplyAll builds
// entities/tables/maps from the persisted IO/IOF metadata (no vendor data needed; that's StartSync).
import { readFileSync, writeFileSync } from 'node:fs';
import { makeGqlClient } from './gql-live-adapters.mjs';
import { GQL } from './gql-live-harness.mjs';

const plan = JSON.parse(readFileSync('/tmp/applyall-plan.json', 'utf8'));
const URL = process.env.GRAPHQL_URL || 'http://localhost:4021/';
const KEY = process.env.MJ_API_KEY;
const COMPANY = process.env.COMPANY_ID;
const PLATFORM = process.env.E2E_PLATFORM || 'sqlserver';
const gql = makeGqlClient(URL, { mjSystemKey: KEY });

const results = [];
for (const c of plan) {
  const r = { name: c.name, applyCount: c.applyCount, total: c.total };
  try {
    const input = {
      CompanyID: COMPANY, IntegrationID: c.integrationID, CredentialTypeID: c.credTypeID,
      CredentialName: `e2e-${c.name.replace(/\s+/g, '-')}`,
      CredentialValues: JSON.stringify({ apiKey: 'mock-dummy' }),
      Configuration: JSON.stringify({ BaseURL: 'http://127.0.0.1:9', AccountID: '0', storagePath: '/tmp/none' }),
    };
    const conn = (await gql(GQL.createConnection, { input, testConnection: false, runSchemaRefresh: false })).IntegrationCreateConnection;
    if (!conn || !conn.CompanyIntegrationID) { r.error = 'CreateConnection: ' + (conn?.Message || 'no ciid'); results.push(r); console.log(`${c.name}: ERROR ${r.error}`); continue; }
    r.ciid = conn.CompanyIntegrationID;
    const applied = (await gql(GQL.applyAll, {
      input: { CompanyIntegrationID: r.ciid, SourceObjects: c.objects.map(n => ({ SourceObjectName: n })), DefaultSyncDirection: 'Pull', StartSync: false, FullSync: false, SyncScope: 'created' },
      platform: PLATFORM, skipGitCommit: true, skipRestart: true,
    })).IntegrationApplyAll;
    r.success = !!(applied && applied.Success);
    r.mapsCreated = (applied?.EntityMapsCreated || []).length;
    r.warnings = (applied?.Warnings || []).slice(0, 5);
    r.steps = (applied?.Steps || []).map(s => `${s.Name}:${s.Status}`);
  } catch (e) { r.error = String(e?.message || e).slice(0, 250); }
  results.push(r);
  console.log(`${c.name}: ${r.error ? ('ERROR ' + r.error) : `maps=${r.mapsCreated}/${c.applyCount} success=${r.success} warn=${(r.warnings||[]).length}`}`);
  writeFileSync('/tmp/applyall-results.json', JSON.stringify(results, null, 2));
}
const ok = results.filter(r => r.success && r.mapsCreated > 0).length;
console.log(`\n### ApplyAll done: ${ok}/${plan.length} connectors built entities (maps>0)`);
