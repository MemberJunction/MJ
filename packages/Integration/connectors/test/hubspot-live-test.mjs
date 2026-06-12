/**
 * HubSpot live connector test — credential-safe.
 *
 * Validates a real HubSpot Private App token against the live API WITHOUT ever exposing
 * the token to anything but this process. Reads HUBSPOT_API_KEY by name via the
 * credential-safe runner; the token is injected into the connector's Configuration JSON
 * in-process and never printed (the runner scrubs all output).
 *
 * ── HOW TO RUN (you launch it; Claude never can — see test/README.md) ──────────────
 *   sudo bash -c 'set -a; . /etc/mj-hubspot.env; set +a; exec node \
 *     packages/Integration/connectors/test/hubspot-live-test.mjs'
 *
 * Tier 1 (this file, no DB): TestConnection + DiscoverObjects + DiscoverFields(contacts)
 *   — proves the token works and the connector talks to HubSpot with real data.
 * Tier 2 (full sync to Postgres + SQL Server, incl. the assoc_contacts_companies
 *   DAG-ordering fix) runs through the workbench — see test/README.md.
 */
import { runCredentialSafe } from './credential-safe-runner.mjs';
import { PLANS } from './plans.mjs';

const plan = PLANS['hubspot-tier1']; // read-only (writes:false) — safe against live data
const result = await runCredentialSafe({ secrets: plan.secrets, run: plan.run });

console.log('\n=== HubSpot live test result (token-redacted) ===');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
