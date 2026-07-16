// One-off: generate the full relational fixtures.json for HubSpot from the deployed 168 objects
// in MJ_SS_E2E_HUBSPOT, so the mock full-coverage HybridE2E pre-flight passes and every object syncs.
import { makeDbClient } from './gql-live-adapters.mjs';
import { regenerateFixturesFromDeployed } from './gen-fixture.mjs';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const db = await makeDbClient('sqlserver', {
  host: 'localhost', port: 1444, database: 'MJ_SS_E2E_HUBSPOT', user: 'sa',
  password: 'Claude2Sql99', mjSchema: '__mj',
});
const res = await regenerateFixturesFromDeployed({
  db,
  platform: 'sqlserver',
  mjSchema: '__mj',
  integrationID: '4F5F7F79-4D24-42AC-87B7-4B6670B72F36',
  fixturesDir: `${REPO}/packages/Integration/connectors/test/fixtures/hubspot/fixtures`,
  cfgKey: 'BaseURL',
});
console.log('REGEN RESULT:', JSON.stringify(res, null, 1).slice(0, 800));
process.exit(0);
