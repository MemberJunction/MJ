/**
 * HubSpot live connector test — credential-safe.
 *
 * Validates a real HubSpot Private App token against the live API WITHOUT ever exposing
 * the token to anything but this process. Reads HUBSPOT_PRIVATE_APP_TOKEN by name via the
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
import { HubSpotConnector } from '@memberjunction/integration-connectors';

// Minimal stubs — the connector only needs Configuration (token) + a context user object.
const makeCompanyIntegration = (token) => ({
    ID: 'live-test-ci',
    IntegrationID: 'live-test-int',
    Integration: 'HubSpot',
    CredentialID: null,
    Configuration: JSON.stringify({ accessToken: token }),
});
const stubUser = { ID: 'live-test-user', Email: 'test@example.com', Name: 'Live Test' };

const result = await runCredentialSafe({
    secrets: { token: 'HUBSPOT_PRIVATE_APP_TOKEN' },
    run: async ({ token }, scrub) => {
        const ci = makeCompanyIntegration(token);
        const connector = new HubSpotConnector();

        const out = { ok: false, tier: 1, steps: {} };

        // 1) TestConnection
        const conn = await connector.TestConnection(ci, stubUser);
        out.steps.testConnection = { success: !!conn.Success, message: scrub(conn.Message ?? ''), serverVersion: conn.ServerVersion ?? null };
        if (!conn.Success) { out.ok = false; return out; }

        // 2) DiscoverObjects
        const objects = await connector.DiscoverObjects(ci, stubUser);
        out.steps.discoverObjects = {
            count: objects.length,
            sample: objects.slice(0, 10).map(o => o.Name),
            hasContacts: objects.some(o => o.Name === 'contacts'),
            hasCompanies: objects.some(o => o.Name === 'companies'),
            associationCount: objects.filter(o => o.Name.startsWith('assoc_')).length,
        };

        // 3) DiscoverFields for contacts (real properties from /crm/v3/properties/contacts)
        try {
            const fields = await connector.DiscoverFields(ci, 'contacts', stubUser);
            out.steps.discoverFieldsContacts = {
                count: fields.length,
                pkFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                sample: fields.slice(0, 12).map(f => f.Name),
            };
        } catch (e) {
            out.steps.discoverFieldsContacts = { error: scrub(e instanceof Error ? e.message : String(e)) };
        }

        out.ok = conn.Success && objects.length > 0;
        return out;
    },
});

console.log('\n=== HubSpot live test result (token-redacted) ===');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
