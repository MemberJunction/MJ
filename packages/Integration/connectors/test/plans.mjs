/**
 * Reusable connector test "plans" — pure functions that drive a connector and return a
 * structured, JSON-able result. Shared by the standalone harness (hubspot-live-test.mjs)
 * and the out-of-sandbox credential broker (credential-broker.mjs) so the exact same
 * credential-safe logic backs both manual and agent-driven runs.
 *
 * A plan never reads process.env itself — the caller (credential-safe runner) hands it the
 * already-dereferenced secret value + a `scrub` function; the plan must route every
 * connector message/error through `scrub` before returning it.
 */
import { HubSpotConnector } from '@memberjunction/integration-connectors';

const stubUser = { ID: 'cred-test-user', Email: 'test@example.com', Name: 'Cred Test' };
// The connector reads either `accessToken` (Private App token / Bearer) or `apiKey`.
// We pass under `apiKey` since the user provided an "API key"; the connector currently
// Bearer-auths it (correct for a `pat-` Private App token). A legacy UUID hapikey would
// need query-param auth — flagged separately.
const hubspotCI = (key) => ({
    ID: 'cred-test-ci', IntegrationID: 'cred-test-int', Integration: 'HubSpot',
    CredentialID: null, Configuration: JSON.stringify({ apiKey: key }),
});

/**
 * Tier-1 HubSpot validation (no DB): TestConnection + DiscoverObjects + DiscoverFields(contacts).
 * @param {{token:string}} secrets  dereferenced by the runner
 * @param {(s:string)=>string} scrub
 */
export async function hubspotTier1({ token }, scrub) {
    const ci = hubspotCI(token);
    const connector = new HubSpotConnector();
    const out = { ok: false, tier: 1, steps: {} };

    const conn = await connector.TestConnection(ci, stubUser);
    out.steps.testConnection = { success: !!conn.Success, message: scrub(conn.Message ?? ''), serverVersion: conn.ServerVersion ?? null };
    if (!conn.Success) return out;

    const objects = await connector.DiscoverObjects(ci, stubUser);
    out.steps.discoverObjects = {
        count: objects.length,
        sample: objects.slice(0, 10).map(o => o.Name),
        hasContacts: objects.some(o => o.Name === 'contacts'),
        hasCompanies: objects.some(o => o.Name === 'companies'),
        associationCount: objects.filter(o => o.Name.startsWith('assoc_')).length,
    };

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
}

/**
 * Registry: task name → { secrets (logicalName→ENV_VAR default), run, writes }.
 *
 * `writes` is the SAFETY flag. A live test against a client's real credentials must NEVER
 * mutate or delete their external data by default. Any plan that performs writes
 * (Create/Update/Delete / bidirectional push) sets writes:true and is REFUSED by the broker
 * unless the job explicitly passes allowWrite:true — which should only happen after the
 * read/pull path is validated and the client has authorized mutation testing. Read-only
 * plans (writes:false) are the default and the only thing that runs unprompted.
 *
 * The job's secretEnvNames may override the env-var names per deployment.
 */
export const PLANS = {
    'hubspot-tier1': { secrets: { token: 'HUBSPOT_API_KEY' }, run: hubspotTier1, writes: false },
    // Tier-2 full Apply/sync includes Create/Update against the external system, so it is
    // writes:true and gated behind allowWrite. Body lands when the workbench dual-dialect
    // harness is built; the gate is enforced regardless (refused before run() is reached).
    'hubspot-sync': {
        secrets: { token: 'HUBSPOT_API_KEY' }, writes: true,
        run: async () => { throw new Error('hubspot-sync (Tier-2 DB Apply) is not implemented in this harness yet — runs via the workbench.'); },
    },
};
