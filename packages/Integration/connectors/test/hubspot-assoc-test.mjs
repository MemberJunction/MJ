/**
 * HubSpot Tier-2 ASSOCIATION live test — credential-safe, READ-ONLY.
 *
 * Proves the contacts↔companies association data (the thing the junction/DAG fix exists
 * to fill in) is fetchable against REAL HubSpot data — WITHOUT a database, WITHOUT CodeGen,
 * and WITHOUT mutating anything in HubSpot. It lists real contacts/companies via the
 * connector and exercises the exact v4 `POST /crm/v4/associations/contacts/companies/batch/read`
 * endpoint the connector's FetchAssociationBatch uses, verifying the (contact_id, company_id)
 * FK pair comes back populated.
 *
 * The token is read by NAME (HUBSPOT_API_KEY) via the credential-safe runner and never
 * printed — every output line is scrubbed. Only opaque ids + counts are surfaced (no PII).
 *
 * ── HOW TO RUN (you launch it; Claude never can — see test/README.md) ──────────────
 *   sudo bash -c 'set -a; . /etc/mj-hubspot.env; set +a; exec node \
 *     packages/Integration/connectors/test/hubspot-assoc-test.mjs'
 *
 * Then paste the printed JSON (token-redacted by design).
 */
import { runCredentialSafe } from './credential-safe-runner.mjs';
import { PLANS } from './plans.mjs';

const plan = PLANS['hubspot-tier2-assoc']; // read-only (writes:false) — safe against live data
const result = await runCredentialSafe({ secrets: plan.secrets, run: plan.run });

console.log('\n=== HubSpot Tier-2 association test result (token-redacted, read-only) ===');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
