// Credential-free driver for the Salesforce connector-e2e MOCK mode.
// Drives the REAL MJAPI GraphQL pipeline (CreateConnection -> discover -> ApplyAll -> StartSync
// -> DB verify) against a local mock Salesforce server replaying fixtures.json. No vendor creds.
import { connectorE2EMock } from './plans.mjs';

const values = { dbPassword: process.env.DB_PASSWORD, mjSystemKey: process.env.MJ_API_KEY };
const result = await connectorE2EMock(values, (x) => x);
console.log('=== CONNECTOR-E2E (mock) RESULT ===');
console.log(JSON.stringify(result, null, 2));
process.exit(result && result.ok === false ? 1 : 0);
