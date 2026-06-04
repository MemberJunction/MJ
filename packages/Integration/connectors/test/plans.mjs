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
import { runLiveTest, GQL } from './gql-live-harness.mjs';
import { runMatrixReadonly } from './gql-matrix-harness.mjs';
import { runLifecycleOps, runDeleteCascade } from './gql-lifecycle-harness.mjs';
import { makeGqlClient, makeHubspotTotal, makeDbClient, resolveSetupIds } from './gql-live-adapters.mjs';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
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
 * Tier-2 association read-only validation (no DB): proves the contacts↔companies
 * association data — the thing the junction/DAG fix exists to fill in — is fetchable
 * against REAL data, without writing anything anywhere.
 *
 * It (1) lists real contacts + companies via the connector's own ListRecords (DB-free
 * reads), then (2) calls the SAME v4 `POST /crm/v4/associations/contacts/companies/batch/read`
 * endpoint the connector's FetchAssociationBatch uses, with the real contact ids, and
 * verifies the association FK pair (contact_id, company_id) comes back populated.
 *
 * READ-ONLY: every call reads. `batch/read` is a read despite being a POST — it never
 * creates/updates/deletes in HubSpot. Surfaces only opaque ids + counts (no PII: contact
 * field values like name/email are never read). The full DAG-ordered sync-into-DB path is
 * covered separately by Tier-2a (DDL) + the engine's 295 unit tests; this closes the
 * "are real associations actually fetchable + does the FK pair populate" question.
 *
 * @param {{token:string}} secrets  dereferenced by the runner
 * @param {(s:string)=>string} scrub
 */
export async function hubspotTier2Assoc({ token }, scrub) {
    const ci = hubspotCI(token);
    const connector = new HubSpotConnector();
    const out = { ok: false, tier: '2-assoc', readOnly: true, steps: {} };

    const conn = await connector.TestConnection(ci, stubUser);
    out.steps.testConnection = { success: !!conn.Success, message: scrub(conn.Message ?? '') };
    if (!conn.Success) return out;

    // 1) Parent reads (DB-free) — real contacts + companies.
    const listCtx = (ObjectName) => ({ CompanyIntegration: ci, ContextUser: stubUser, ObjectName, PageSize: 30 });
    let contactIDs = [];
    try {
        const contacts = await connector.ListRecords(listCtx('contacts'));
        const companies = await connector.ListRecords(listCtx('companies'));
        contactIDs = contacts.Records.map(r => r.ExternalID).filter(Boolean);
        out.steps.parents = { contacts: contacts.Records.length, companies: companies.Records.length };
    } catch (e) {
        out.steps.parents = { error: scrub(e instanceof Error ? e.message : String(e)) };
        return out;
    }

    if (contactIDs.length === 0) {
        out.steps.associations = { skipped: 'no contacts returned (missing read scope or empty portal)' };
        return out;
    }

    // 2) v4 association batch/read — same endpoint the connector uses. READ-ONLY.
    try {
        const resp = await fetch(`${HUBSPOT_API_BASE}/crm/v4/associations/contacts/companies/batch/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: contactIDs.map(id => ({ id })) }),
        });
        if (!resp.ok) {
            out.steps.associations = { error: scrub(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`) };
            return out;
        }
        const body = await resp.json();
        const results = body.results ?? [];
        let pairCount = 0, contactsWithCompany = 0, samplePair = null;
        for (const item of results) {
            const tos = item.to ?? [];
            if (tos.length > 0) contactsWithCompany++;
            for (const t of tos) {
                pairCount++;
                if (!samplePair) samplePair = { contact_id: String(item.from?.id ?? ''), company_id: String(t.toObjectId ?? '') };
            }
        }
        out.steps.associations = {
            contactsQueried: contactIDs.length,
            contactsWithAtLeastOneCompany: contactsWithCompany,
            totalAssociationPairs: pairCount,
            samplePair, // opaque numeric ids only — no PII
            fkPairBothPopulated: samplePair ? (!!samplePair.contact_id && !!samplePair.company_id) : null,
            proves: pairCount > 0
                ? 'REAL association fill-in confirmed: v4 batch/read returns (contact_id, company_id) pairs'
                : 'endpoint reachable but this portal has no contact↔company links to confirm fill-in',
        };
        out.ok = true;
    } catch (e) {
        out.steps.associations = { error: scrub(e instanceof Error ? e.message : String(e)) };
    }
    return out;
}

/**
 * Builds the non-secret live-test config from env (only NON-secret values — IDs, URLs, host/port).
 * Secret VALUES (token, dbPassword, mjToken) arrive via `values` from the runner and are never read here.
 * Env vars (set by the launching/broker process):
 *   HS_LIVE_GRAPHQL_URL   MJAPI GraphQL endpoint (default http://localhost:4000/)
 *   HS_LIVE_PLATFORM      'sqlserver' | 'postgresql' (default sqlserver)
 *   HS_LIVE_COMPANY_ID    MJ Company ID for the connection (required)
 *   HS_LIVE_CREDTYPE_ID   MJ CredentialType ID for the api-token credential (required)
 *   HS_LIVE_INTEGRATION_ID  HubSpot Integration ID (optional — resolved by name 'HubSpot' if absent)
 *   HS_LIVE_OBJECTS       comma-sep source objects (default contacts,companies,deals,assoc_contacts_companies)
 *   HS_LIVE_DB_HOST/PORT/NAME/USER  workbench DB coordinates for the assertion client
 *   HS_LIVE_RUN_ID        optional stable run marker (default live_<timestamp>)
 *   HS_LIVE_WRITE_OBJECT  object for the backward CRUD round-trip (default contacts; Users refused)
 */
export function liveCfgFromEnv() {
    const env = process.env;
    const runId = env.HS_LIVE_RUN_ID || `live_${Date.now()}`;
    return {
        runId,
        graphqlUrl: env.HS_LIVE_GRAPHQL_URL || 'http://localhost:4000/',
        platform: env.HS_LIVE_PLATFORM || 'sqlserver',
        companyID: env.HS_LIVE_COMPANY_ID,
        integrationID: env.HS_LIVE_INTEGRATION_ID,
        credentialTypeID: env.HS_LIVE_CREDTYPE_ID,
        // REFERENCE MODE: when set, the connection + encrypted credential already exist; the harness
        // drives by this ID and NEVER needs the token (server decrypts it internally). This is the
        // "use it, never read its value" path — the agent runs the full test token-free.
        companyIntegrationID: env.HS_LIVE_CIID,
        objects: (env.HS_LIVE_OBJECTS || 'contacts,companies,deals,assoc_contacts_companies').split(',').map(s => s.trim()).filter(Boolean),
        mjSchema: env.HS_LIVE_MJ_SCHEMA || env.MJ_CORE_SCHEMA || '__mj',
        maxPolls: Number(env.HS_LIVE_MAX_POLLS || 100000),
        // DB coordinates fall back to the standard MJAPI .env names so sourcing that file in the broker
        // "just works" with no manual mapping (HS_LIVE_* overrides win when set per-job).
        db: {
            host: env.HS_LIVE_DB_HOST || env.DB_HOST || 'localhost',
            port: env.HS_LIVE_DB_PORT || env.DB_PORT,
            database: env.HS_LIVE_DB_NAME || env.DB_DATABASE,
            user: env.HS_LIVE_DB_USER || env.DB_USERNAME,
        },
        writeObject: env.HS_LIVE_WRITE_OBJECT || 'contacts',
        // A recognizable, runId-stamped contact in standard fields (no custom property needed).
        // example.com is RFC-2606 reserved (never deliverable) yet a VALID email format — HubSpot rejects the
        // .invalid TLD on create, so the test contact uses a format the vendor accepts while staying obviously test.
        writeAttributes: { email: `mj-live-${runId}@example.com`, firstname: 'MJ', lastname: `Live ${runId}` },
        writeUpdateAttributes: { jobtitle: `updated-${runId}` },
    };
}

/**
 * Shared driver for the GQL-live plans: builds the real IO adapters from dereferenced secrets +
 * non-secret env cfg, resolves the setup IDs, and runs the injectable orchestration. Read-only when
 * allowWrite=false (forward path only); full forward+backward when allowWrite=true.
 */
async function runLivePlan(values, scrub, allowWrite) {
    const cfg = liveCfgFromEnv();
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const ids = await resolveSetupIds(db, cfg);
    // MJAPI auth: system API key (x-mj-api-key) is the simplest for a workbench; falls back to a
    // user key (x-api-key) or a JWT (Bearer) if those are what's provided. All are scrubbed secrets.
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });
    // Token present (create mode / direct-API parity) vs absent (reference mode — token-free, the
    // server uses the encrypted credential internally; external parity is skipped).
    const hubspotTotal = values.token ? makeHubspotTotal(values.token) : null;
    const fullCfg = { ...cfg, ...ids, token: values.token };
    const result = await runLiveTest({ gql, db, hubspotTotal }, fullCfg, allowWrite);
    return result; // the runner's scrubDeep redacts every secret value from this result
}

/**
 * READ-ONLY 2^N matrix entrypoint (reference mode, token-free): builds the same DB + GQL clients as
 * runLivePlan, resolves the seeded CIID from cfg.companyIntegrationID (HS_LIVE_CIID), and runs the
 * mechanics matrix (idempotency / content-hash, watermark + fallback, Merkle reconcile, DAG order).
 * No HUBSPOT_API_KEY secret is declared → token-free; the server decrypts the credential internally.
 * writes:false — it only re-syncs (Pull) + reads the DB / event stream / MJAPI log; it never deletes
 * the seeded connection or its maps (only toggles + resets ONE map's Configuration for the Merkle cell).
 */
export async function hubspotMatrixReadonlyGQL(values, scrub) { // eslint-disable-line no-unused-vars -- scrub kept for signature symmetry (the runner scrubs the returned result)
    const cfg = liveCfgFromEnv();
    if (!cfg.companyIntegrationID) {
        return { ok: false, error: 'hubspot-matrix-readonly requires HS_LIVE_CIID (reference mode) — none set' };
    }
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const ids = await resolveSetupIds(db, cfg);
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });
    const fullCfg = {
        ...cfg, ...ids,
        destSchema: process.env.HS_LIVE_DEST_SCHEMA || 'hubspot',
        mjapiLogPath: process.env.HS_LIVE_MJAPI_LOG || '/tmp/mjapi-4000.log',
    };
    // runMatrixReadonly closes the db in its finally; the runner's scrubDeep redacts secrets from the result.
    return runMatrixReadonly({ gql, db }, fullCfg);
}

/**
 * NON-DESTRUCTIVE §15 LIFECYCLE entrypoint (reference mode, token-free): builds the same DB + GQL
 * clients as hubspotMatrixReadonlyGQL, resolves the seeded CIID from cfg.companyIntegrationID
 * (HS_LIVE_CIID), and runs the lifecycle ops (deactivate-enforcement, deselect/reselect, cancel-status,
 * read-only op smoke). It operates on the seeded REUSABLE connection and RESTORES every mutation
 * (reactivate, re-activate the deals map) so the connection stays reusable. No HUBSPOT_API_KEY secret
 * is declared → token-free; the server decrypts the credential internally. writes:false externally —
 * it only re-syncs (Pull) + reads DB/status; it never deletes the seeded connection or its maps.
 */
export async function hubspotLifecycleGQL(values, scrub) { // eslint-disable-line no-unused-vars -- scrub kept for signature symmetry (the runner scrubs the returned result)
    const cfg = liveCfgFromEnv();
    if (!cfg.companyIntegrationID) {
        return { ok: false, error: 'hubspot-lifecycle requires HS_LIVE_CIID (reference mode) — none set' };
    }
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const ids = await resolveSetupIds(db, cfg);
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });
    const fullCfg = { ...cfg, ...ids };
    // runLifecycleOps closes the db in its finally; the runner's scrubDeep redacts secrets from the result.
    return runLifecycleOps({ gql, db }, fullCfg);
}

/**
 * DESTRUCTIVE §15 DELETE-CASCADE entrypoint (reference mode, token-free): deletes the connection at
 * cfg.companyIntegrationID — which MUST be a DISPOSABLE throwaway CIID, NEVER the main seeded one — and
 * asserts the cascade's DESIRED completeness (credential deleted, CI row deleted, children cleaned).
 * writes:true as a SAFETY belt: it is destructive to MJ rows, so the broker REFUSES it unless the job
 * explicitly passes allowWrite:true. No HUBSPOT_API_KEY secret is declared → token-free.
 */
export async function hubspotDeleteCascadeGQL(values, scrub) { // eslint-disable-line no-unused-vars -- scrub kept for signature symmetry (the runner scrubs the returned result)
    const cfg = liveCfgFromEnv();
    if (!cfg.companyIntegrationID) {
        return { ok: false, error: 'hubspot-delete-cascade requires HS_LIVE_CIID (the DISPOSABLE throwaway CIID) — none set' };
    }
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const fullCfg = { ...cfg };
    // runDeleteCascade closes the db in its finally; the runner's scrubDeep redacts secrets from the result.
    return runDeleteCascade({ gql: makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken }), db }, fullCfg);
}

/**
 * Diagnostic (DB read-only, no token, no MJAPI): returns the IDs the GQL sync needs — the HubSpot
 * Integration, available Companies + CredentialTypes, and any EXISTING HubSpot CompanyIntegration
 * (which would enable token-free reference mode). Lets the agent pick the right IDs before syncing.
 */
export async function hubspotDiagGQL(values, scrub) {
    const cfg = liveCfgFromEnv();
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const s = cfg.mjSchema ?? '__mj';
    const pg = cfg.platform === 'postgresql';
    const T = (n) => pg ? `"${s}"."${n}"` : `[${s}].[${n}]`;
    const C = (n) => pg ? `"${n}"` : n;
    const top = pg ? '' : 'TOP 25 ';
    const lim = pg ? ' LIMIT 25' : '';
    try {
        const hubspotIntegration = await db.rows(`SELECT ${top}${C('ID')}, ${C('Name')} FROM ${T('Integration')} WHERE ${C('Name')}='HubSpot'${lim}`);
        const companies = await db.rows(`SELECT ${top}${C('ID')}, ${C('Name')} FROM ${T('Company')}${lim}`);
        const credentialTypes = await db.rows(`SELECT ${top}${C('ID')}, ${C('Name')} FROM ${T('CredentialType')}${lim}`);
        const hsId = hubspotIntegration?.[0]?.ID ?? hubspotIntegration?.[0]?.id;
        let existingHubspotCIs = [];
        if (hsId) existingHubspotCIs = await db.rows(`SELECT ${top}${C('ID')}, ${C('Name')}, ${C('IsActive')} FROM ${T('CompanyIntegration')} WHERE ${C('IntegrationID')}='${hsId}'${lim}`);
        return { ok: true, platform: cfg.platform, hubspotIntegration, companies, credentialTypes, existingHubspotCIs };
    } finally { if (db.close) await db.close(); }
}

/** Forward-only (read-only) live path — runs unprompted (writes:false). Token mode OR reference mode. */
export async function hubspotLivePullGQL(values, scrub) {
    return runLivePlan(values, scrub, false);
}

/** Full matrix incl. backward CRUD (writes:true) — broker requires allowWrite:true. */
export async function hubspotLiveMatrixGQL(values, scrub) {
    return runLivePlan(values, scrub, true);
}

/**
 * One-time SEEDING step (run by someone who holds the token): creates the HubSpot connection, which
 * ENCRYPTS the token into the Credential table, and returns the CompanyIntegrationID. Hand that ID to
 * the agent as HS_LIVE_CIID; the agent then runs hubspot-live-pull-ref completely token-free — the
 * token stays encrypted in the DB and is used only server-side. This is the "use it, never read it" seam.
 */
export async function hubspotSeedConnectionGQL(values, scrub) {
    const cfg = liveCfgFromEnv();
    // GQL-only path: when all setup IDs are provided (HS_LIVE_*_ID), the seed doesn't need a direct DB
    // connection to resolve them — skip it. This lets the seed run through a credential channel that holds the
    // vendor token + MJ system key but NOT the target DB password (e.g. seeding a Postgres connection from a
    // broker pointed at SQL Server). CreateConnection writes to the DB via the TARGET MJAPI's own connection.
    const haveAllIds = !!(cfg.companyID && cfg.integrationID && cfg.credentialTypeID);
    const db = haveAllIds ? null : await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    try {
        const ids = haveAllIds
            ? { companyID: cfg.companyID, integrationID: cfg.integrationID, credentialTypeID: cfg.credentialTypeID }
            : await resolveSetupIds(db, cfg);
        const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });
        const input = {
            CompanyID: ids.companyID, IntegrationID: ids.integrationID, CredentialTypeID: ids.credentialTypeID,
            CredentialName: cfg.credentialName || `hs-live-${cfg.runId}`,
            CredentialValues: JSON.stringify({ apiKey: values.token }),
        };
        const conn = (await gql(GQL.createConnection, { input, testConnection: true, runSchemaRefresh: true })).IntegrationCreateConnection;
        return {
            ok: !!conn?.Success,
            companyIntegrationID: conn?.CompanyIntegrationID, // → give to the agent as HS_LIVE_CIID
            credentialID: conn?.CredentialID,
            connectionTest: { ok: conn?.ConnectionTestSuccess, message: conn?.ConnectionTestMessage },
            schemaRefresh: conn?.SchemaRefresh ?? null,
            next: 'Set HS_LIVE_CIID=<companyIntegrationID> and run hubspot-live-pull-ref (token-free).',
        };
    } finally { if (db && db.close) await db.close(); }
}

/**
 * SETUP step (faithful, GraphQL — not a raw DB insert): creates an MJ Company via the live MJAPI so the
 * connection has a Company to attach to. Mirrors the plan.md "create a company record" step. writes:false
 * externally (it only writes one MJ row through the app, makes no external/vendor call). Returns the new
 * Company ID to hand back as HS_LIVE_COMPANY_ID for hubspot-seed-connection.
 */
export async function setupCompanyGQL(values, scrub) { // eslint-disable-line no-unused-vars -- scrub kept for signature symmetry
    const cfg = liveCfgFromEnv();
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });
    const name = process.env.HS_LIVE_COMPANY_NAME || `MJ E2E Test Co (${cfg.runId})`;
    const mutation = `mutation($input: CreateMJCompanyInput!) { CreateMJCompany(input: $input) { ID Name } }`;
    const res = await gql(mutation, { input: { Name: name, Description: 'Throwaway company for the live HubSpot integration E2E test' } });
    const created = res?.CreateMJCompany;
    return {
        ok: !!created?.ID,
        companyID: created?.ID,
        name: created?.Name,
        next: 'Set HS_LIVE_COMPANY_ID=<companyID> and run hubspot-seed-connection.',
    };
}

/**
 * Maintenance (DB-only, no external calls, no token): clear the HubSpot dest tables so a forward sync
 * starts from a clean slate — lets the record-map 1:1 completeness assertion test a fresh create path
 * rather than a re-sync over rows left by a prior (possibly interrupted) run. Deletes ROWS only; never
 * drops tables, never touches users/owners or any non-hubspot schema.
 */
export async function hubspotCleanData(values, scrub) {
    const cfg = liveCfgFromEnv();
    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const pg = cfg.platform === 'postgresql';
    const destSchema = process.env.HS_LIVE_DEST_SCHEMA || 'hubspot';
    const T = (n) => pg ? `"${destSchema}"."${n}"` : `[${destSchema}].[${n}]`;
    const tables = (process.env.HS_LIVE_CLEAN_TABLES || 'contacts,companies,deals,assoc_contacts_companies')
        .split(',').map(s => s.trim()).filter(Boolean);
    const out = { ok: false, platform: cfg.platform, destSchema, cleaned: {} };
    try {
        // assoc first (it references the parents), then parents — DELETE (not TRUNCATE) to tolerate any soft refs.
        for (const t of tables) {
            try { await db.rows(`DELETE FROM ${T(t)}`); out.cleaned[t] = 'deleted'; }
            catch (e) { out.cleaned[t] = scrub(`skip: ${e instanceof Error ? e.message : String(e)}`); }
        }
        out.ok = true;
        return out;
    } finally { if (db.close) await db.close(); }
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
    // Tier-2 association read-only proof (no DB, no mutation) — real contacts/companies +
    // the v4 batch/read association endpoint. Safe against live data.
    'hubspot-tier2-assoc': { secrets: { token: 'HUBSPOT_API_KEY' }, run: hubspotTier2Assoc, writes: false },
    // Tier-2 full Apply/sync includes Create/Update against the external system, so it is
    // writes:true and gated behind allowWrite. Body lands when the workbench dual-dialect
    // harness is built; the gate is enforced regardless (refused before run() is reached).
    'hubspot-sync': {
        secrets: { token: 'HUBSPOT_API_KEY' }, writes: true,
        run: async () => { throw new Error('hubspot-sync (Tier-2 DB Apply) is not implemented in this harness yet — runs via the workbench.'); },
    },
    // Tier-3 GQL-driven live framework test (real MJAPI + real DB). Forward path is read-only and
    // runs unprompted; it proves completeness ("all data synced in") + record-map 1:1 + watermark/
    // content-hash via DB-direct assertions. dbPassword is a secret (workbench DB password, scrubbed);
    // mjToken is optional (the no-auth workbench needs none — only declare it on auth-enforcing MJAPI).
    'hubspot-live-pull': {
        secrets: { token: 'HUBSPOT_API_KEY', dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotLivePullGQL, writes: false,
    },
    // Full matrix: forward + backward (single-record CRUD round-trip). writes:true → the broker REFUSES
    // it unless the job passes allowWrite:true (run only AFTER hubspot-live-pull validates the forward
    // path). Every created record is deleted in teardown; Users/owners are never written.
    'hubspot-live-matrix': {
        secrets: { token: 'HUBSPOT_API_KEY', dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotLiveMatrixGQL, writes: true,
    },
    // Diagnostic (DB read-only): resolve the IDs the GQL sync needs.
    'hubspot-diag': { secrets: { dbPassword: 'DB_PASSWORD' }, run: hubspotDiagGQL, writes: false },
    // Maintenance (DB-only): clear HubSpot dest rows for a clean forward run. writes:false (no external mutation).
    'hubspot-clean-data': { secrets: { dbPassword: 'DB_PASSWORD' }, run: hubspotCleanData, writes: false },
    // ── "Use it, never read it" reference-mode plans ───────────────────────────────────────────────
    // SEED (run once by someone holding the token): encrypts the token into the DB Credential and
    // returns the CompanyIntegrationID. writes:false externally (CreateConnection only reads HubSpot to
    // introspect). The token enters ONLY this step's process, never the agent's.
    // SETUP company (faithful GraphQL create of one MJ Company row) — writes:false externally (no vendor call).
    'setup-company': {
        secrets: { mjSystemKey: 'MJ_API_KEY' },
        run: setupCompanyGQL, writes: false,
    },
    'hubspot-seed-connection': {
        secrets: { token: 'HUBSPOT_API_KEY', dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotSeedConnectionGQL, writes: false,
    },
    // REFERENCE forward (the agent runs this TOKEN-FREE): set HS_LIVE_CIID to the seeded
    // CompanyIntegrationID; the server decrypts + uses the credential internally. No HUBSPOT_API_KEY
    // secret is declared, so the agent literally cannot read the token — it uses it by reference only.
    'hubspot-live-pull-ref': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotLivePullGQL, writes: false,
    },
    // REFERENCE matrix (token-free backward/CRUD). writes:true → broker requires allowWrite:true.
    'hubspot-live-matrix-ref': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotLiveMatrixGQL, writes: true,
    },
    // READ-ONLY 2^N mechanics matrix (token-free reference mode): idempotency/content-hash skip,
    // timestamp watermark + fallback save, opt-in Merkle reconcile, and DAG parent-before-child order.
    // writes:false externally — only re-syncs (Pull) + reads DB/events/log; never deletes the seeded
    // connection or maps (the Merkle cell toggles ONE map's Configuration and resets it in cleanup).
    'hubspot-matrix-readonly': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotMatrixReadonlyGQL, writes: false,
    },
    // §15 LIFECYCLE ops (token-free reference mode, NON-DESTRUCTIVE): deactivate-enforcement,
    // deselect/reselect entity maps, cancel-status, and the read-only op smoke. Operates on the seeded
    // REUSABLE CIID and restores all mutated state (reactivate, re-activate deals). writes:false — it
    // only re-syncs (Pull) + reads DB/status; it never deletes the seeded connection or its maps.
    'hubspot-lifecycle': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotLifecycleGQL, writes: false,
    },
    // §15 DELETE-CASCADE (token-free reference mode, DESTRUCTIVE): deletes the THROWAWAY CIID at
    // HS_LIVE_CIID and asserts the cascade (credential deleted, CI row deleted, children cleaned).
    // writes:true as a SAFETY belt — destructive to MJ rows → the broker REFUSES it unless the job
    // passes allowWrite:true. NEVER point HS_LIVE_CIID at the main seeded connection for this plan.
    'hubspot-delete-cascade': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: hubspotDeleteCascadeGQL, writes: true,
    },
};
