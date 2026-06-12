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
import { runConnectorE2E } from './connector-e2e-harness.mjs';
import { buildMock, deltaPassesFromManifest, objectsFromManifest } from './connector-e2e-adapters.mjs';
import { resolve as pathResolve } from 'node:path';

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

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTOR-AGNOSTIC e2e plan (mock + live) — runs the REAL engine for ANY connector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the connector-agnostic e2e config from env + a base live cfg. NON-secret only.
 * Env vars (NEW; reuses all HS_LIVE_* DB/GQL coordinates from liveCfgFromEnv):
 *   E2E_CONNECTOR        registry connector dir name (e.g. 'propfuel') — required
 *   E2E_MODE             'mock' (credential-free, default) | 'live' (credentialed)
 *   E2E_FIXTURES_DIR     absolute path to the connector's `fixtures/` dir (mock mode).
 *                        Default: <this test dir>/fixtures/<connector>/fixtures
 *   E2E_INTEGRATION      MJ Integration NAME to resolve the IntegrationID by (e.g. 'PropFuel')
 *   E2E_SCHEMA           destination schema for verification override (else metadata-resolved)
 *   E2E_PLATFORM         'sqlserver' | 'postgresql' (falls back to HS_LIVE_PLATFORM)
 *   E2E_OBJECTS          comma-sep source objects (else taken from the fixtures Objects[])
 *   E2E_TLS_CERT/E2E_TLS_KEY  PEM paths for HTTPS-MITM proxy mode (hardcoded-base connectors)
 */
function connectorE2eCfgFromEnv() {
    const env = process.env;
    const base = liveCfgFromEnv();
    const here = pathResolve(new URL('.', import.meta.url).pathname);
    const connector = env.E2E_CONNECTOR;
    const mode = (env.E2E_MODE === 'live') ? 'live' : 'mock';
    const fixturesDir = env.E2E_FIXTURES_DIR || pathResolve(here, 'fixtures', String(connector || ''), 'fixtures');
    return {
        ...base,
        connector,
        mode,
        fixturesDir,
        integrationName: env.E2E_INTEGRATION || base.integrationID || connector,
        platform: env.E2E_PLATFORM || base.platform,
        schema: env.E2E_SCHEMA || undefined,
        objectsOverride: (env.E2E_OBJECTS || '').split(',').map(s => s.trim()).filter(Boolean),
        tls: { cert: env.E2E_TLS_CERT, key: env.E2E_TLS_KEY },
    };
}

/**
 * Create a connection with an optional Configuration patch (used by mock ORIGIN mode to
 * seed the connector's config-driven BaseURL at the local mock), via the SAME public
 * IntegrationCreateConnection op the live harness uses — no core change. Returns the CIID.
 *
 * @param {(q:string,v:object)=>Promise<object>} gql
 * @param {object} ids   { companyID, integrationID, credentialTypeID }
 * @param {object} opts  { credentialName, credentialValues (object), configuration (object) }
 */
async function createConnectionWithConfig(gql, ids, opts) {
    const input = {
        CompanyID: ids.companyID,
        IntegrationID: ids.integrationID,
        CredentialTypeID: ids.credentialTypeID,
        CredentialName: opts.credentialName,
        CredentialValues: JSON.stringify(opts.credentialValues ?? {}),
        ...(opts.configuration ? { Configuration: JSON.stringify(opts.configuration) } : {}),
    };
    const conn = (await gql(GQL.createConnection, { input, testConnection: false, runSchemaRefresh: true })).IntegrationCreateConnection;
    if (!conn?.Success || !conn.CompanyIntegrationID) {
        throw new Error(`CreateConnection failed: ${conn?.Message ?? 'no payload'}`);
    }
    return { ciid: conn.CompanyIntegrationID, credentialID: conn.CredentialID, schemaRefresh: conn.SchemaRefresh ?? null };
}

/**
 * CONNECTOR-AGNOSTIC e2e driver. Boots the mock (mock mode) or uses the live vendor,
 * stands up a real connection (seeding the mock origin into Configuration for config-driven
 * connectors), then runs the real engine end-to-end (ApplyAll → StartSync → tail → DB verify
 * incl. delta create/update/delete + idempotent re-run). Reuses gql-live-harness phases.
 *
 * Secrets (live mode only): dbPassword + mjSystemKey + (token OR pre-seeded CIID). Mock mode
 * declares NO vendor secret — credential-free by construction.
 */
async function connectorE2EPlan(values, scrub, allowWrite) { // eslint-disable-line no-unused-vars -- scrub kept for signature symmetry (runner scrubs result)
    const cfg = connectorE2eCfgFromEnv();
    if (!cfg.connector) return { ok: false, error: 'connector-e2e requires E2E_CONNECTOR (registry connector dir name)' };

    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: values.dbPassword, mjSchema: cfg.mjSchema });
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: values.mjSystemKey, mjUserKey: values.mjUserKey, mjToken: values.mjToken });

    // Build the mock (mock mode boots the fixtures-replaying server; live mode is inert).
    const mock = await buildMock({ mode: cfg.mode, fixturesDir: cfg.fixturesDir, tls: cfg.tls });

    try {
        // Resolve the IntegrationID by the EXPLICIT E2E_INTEGRATION name. Do NOT route this through
        // resolveSetupIds — that helper hardcodes a 'HubSpot' name default (it predates the generic
        // connector-e2e path), so a non-HubSpot connector would bind to HubSpot's Integration and
        // ApplyAll would instantiate the wrong connector class ("No HubSpot credentials found").
        const integrationID = cfg.integrationID || await db.resolveId(
            cfg.platform === 'postgresql'
                ? `SELECT "ID" FROM "${cfg.mjSchema}"."Integration" WHERE "Name" = $1 LIMIT 1`
                : `SELECT TOP 1 ID FROM [${cfg.mjSchema}].[Integration] WHERE Name = @n`,
            cfg.platform === 'postgresql' ? [cfg.integrationName] : { n: cfg.integrationName });
        if (!integrationID) throw new Error(`connector-e2e: no Integration found by name '${cfg.integrationName}' (set E2E_INTEGRATION to the exact MJ: Integrations.Name)`);
        const setupIds = { companyID: cfg.companyID, integrationID, credentialTypeID: cfg.credentialTypeID };

        // Objects: explicit override > fixtures Objects[] (mock) > cfg default list.
        const objects = cfg.objectsOverride.length ? cfg.objectsOverride
            : (cfg.mode === 'mock' ? objectsFromManifest(mock.manifest) : cfg.objects);
        if (!objects.length) throw new Error('connector-e2e: no objects to apply (set E2E_OBJECTS or provide fixtures Objects[])');

        // Stand up the connection. Mock mode seeds the mock origin/file path + any extra static
        // config into Configuration so a config-driven connector reaches the mock with NO real
        // credential. Proxy-mode (hardcoded base) gets no config patch (redirect is via the
        // MJAPI-process proxy — see proxyEnvExpected in the result). Live mode uses the real token.
        let ciid, credentialID = null;
        // Token presence forces TOKEN mode (fresh CreateConnection + schema-refresh + entity
        // mapping that APPLIES E2E_LIVE_CONFIG, e.g. {AccountID}). Reference mode is the token-FREE
        // path only (a pre-seeded CIID). Without this guard a STALE HS_LIVE_CIID lingering in the
        // broker's launch env silently forces reference mode for a token run → no createConnection
        // → E2E_LIVE_CONFIG (AccountID) never applied → connector fails credential validation →
        // 0 discovered objects → 0 entity maps → 0 rows (a vacuous "pass"). Token wins.
        if (cfg.companyIntegrationID && !values.token) {
            ciid = cfg.companyIntegrationID; // reference mode — token-free, pre-seeded connection only
        } else {
            // Live-mode credential shape is connector-specific. Default is HubSpot-style
            // { apiKey }, but a connector that reads a differently-named secret key (e.g.
            // PropFuel reads { Token, AccountID }) sets E2E_TOKEN_KEY (the secret key name)
            // + E2E_LIVE_CONFIG (non-secret config JSON merged into both credential + config,
            // e.g. {"AccountID":"2019"}). Keeps the default working; generalizes per connector.
            const liveTokenKey = process.env.E2E_TOKEN_KEY || 'apiKey';
            let liveExtra = {};
            try { liveExtra = process.env.E2E_LIVE_CONFIG ? JSON.parse(process.env.E2E_LIVE_CONFIG) : {}; } catch { liveExtra = {}; }
            const credentialValues = cfg.mode === 'mock'
                ? { ...(mock.manifest?.Configuration ?? {}), ...(mock.configPatch ?? {}) } // dummy + mock redirect
                : { ...liveExtra, [liveTokenKey]: values.token };
            const configuration = cfg.mode === 'mock'
                ? { ...(mock.manifest?.Configuration ?? {}), ...(mock.configPatch ?? {}) }
                : (Object.keys(liveExtra).length ? liveExtra : undefined);
            const created = await createConnectionWithConfig(gql, setupIds, {
                credentialName: `e2e-${cfg.connector}-${cfg.runId}`,
                credentialValues, configuration,
            });
            ciid = created.ciid; credentialID = created.credentialID;
        }

        // Reconcile the requested objects against what discovery ACTUALLY surfaced for this live
        // connection. A data-export feed rotates (hourly files, acked files removed), so a hardcoded
        // stream name may not be present right now — and an object the connector never discovers can
        // never map. Bulletproof rule ("only the connector is the variable"): test against the LIVE
        // surface. Intersect the request with the discovered IntegrationObjects; if the request
        // matches nothing (or was a stale guess), fall back to the discovered set, bounded to a
        // Goldilocks subset so we prove advancement+termination without draining a huge stream. Throw
        // LOUDLY only when discovery genuinely found zero objects (a real connector/credential fault,
        // not a stale object-name guess).
        let appliedObjects = objects;
        if (cfg.mode !== 'mock') {
            const ioQ = cfg.platform === 'postgresql'
                ? `SELECT "Name" FROM "${cfg.mjSchema}"."IntegrationObject" WHERE "IntegrationID" = '${integrationID}'`
                : `SELECT Name FROM [${cfg.mjSchema}].[IntegrationObject] WHERE IntegrationID = '${integrationID}'`;
            const discovered = (await db.rows(ioQ)).map((r) => r.Name).filter(Boolean);
            const want = new Set(objects.map((s) => s.toLowerCase()));
            const matched = discovered.filter((d) => want.has(d.toLowerCase()));
            const GOLDILOCKS = 3;
            if (matched.length) {
                appliedObjects = matched;
            } else if (discovered.length) {
                appliedObjects = discovered.slice(0, GOLDILOCKS);
                console.log(`[connector-e2e] requested [${objects.join(', ')}] not in live feed; ` +
                    `substituting discovered [${appliedObjects.join(', ')}]` +
                    (discovered.length > GOLDILOCKS ? ` (bounded from ${discovered.length}, Goldilocks)` : ''));
            } else {
                throw new Error(`connector-e2e: connection discovered 0 IntegrationObjects for ` +
                    `'${cfg.integrationName}' — schema refresh found nothing (check credential/AccountID + DiscoverObjects).`);
            }
        }

        const fullCfg = {
            ...cfg,
            companyIntegrationID: ciid,
            objects: appliedObjects,
            integrationID,
            credentialID,
            deltaPasses: cfg.mode === 'mock' ? deltaPassesFromManifest(mock.manifest) : [],
        };

        const result = await runConnectorE2E({ gql, db, mock }, fullCfg, allowWrite);
        // Surface the mock wiring summary so an operator/agent can confirm the redirect path.
        result.mockWiring = cfg.mode === 'mock'
            ? { kind: mock.kind, baseURL: mock.baseURL ?? null, proxyURL: mock.proxyURL ?? null, tlsRequired: mock.tlsRequired ?? false, proxyEnvExpected: mock.proxyEnvExpected ?? null, fixtureWarnings: mock.warnings ?? [] }
            : { mode: 'live' };
        return result;
    } catch (e) {
        try { if (mock?.close) await mock.close(); } catch { /* best-effort */ }
        try { if (db.close) await db.close(); } catch { /* best-effort */ }
        return { ok: false, mode: cfg.mode, connector: cfg.connector, error: String(e?.stack ?? e?.message ?? e) };
    }
}

/** Mock-mode (credential-free) e2e — writes:false (read-only from vendor; DB writes are into our own schema). */
export async function connectorE2EMock(values, scrub) { return connectorE2EPlan(values, scrub, false); }
/** Live-mode (credentialed) e2e — writes:false by default; backward CRUD only with allowWrite (live + flag). */
export async function connectorE2ELive(values, scrub) { return connectorE2EPlan(values, scrub, false); }

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
/**
 * PropFuel data-export feed — READ-ONLY live validation. writes:false.
 * Calls ONLY GET /dataexport/<acct>/list and GET /dataexport/<acct>/download/<file>.
 * It NEVER calls POST /ack (ack removes a file from the queue = a mutation). Proves the
 * token + endpoints + file shape against the live demo without touching client data.
 * The token enters ONLY the broker process; the agent never sees it. Returns scrubbed
 * structure (file/record COUNTS + field KEY names only — never record values/PII).
 */
export async function propfuelReadonly({ token }, scrub) {
    const acct = '2019'; // demo account id (embedded in the data-export path)
    const base = `https://app.propfuel.com/dataexport/${acct}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const out = { ok: false, plan: 'propfuel-readonly', accountId: acct, steps: {} };

    // 1) list files (read-only)
    let listResp;
    try { listResp = await fetch(`${base}/list`, { method: 'GET', headers }); }
    catch (e) { out.steps.list = { error: scrub(e instanceof Error ? e.message : String(e)) }; return out; }
    const listText = await listResp.text();
    let files = [];
    try { const j = JSON.parse(listText); files = Array.isArray(j) ? j : (j.files ?? j.data ?? []); } catch { /* non-json body */ }
    const names = (Array.isArray(files) ? files : []).map(f => String(typeof f === 'string' ? f : (f.file ?? f.name ?? f))).sort();
    out.steps.list = { status: listResp.status, fileCount: names.length, sample: names.slice(0, 5) };
    if (listResp.status < 200 || listResp.status >= 300) { out.steps.list.body = scrub(listText.slice(0, 300)); return out; }
    if (!names.length) { out.ok = true; out.note = 'connected; export queue currently empty'; return out; }

    // 2) download the OLDEST file (chronological by leading microtime) — read-only, NO ack
    const first = names[0];
    let dlResp;
    try { dlResp = await fetch(`${base}/download/${encodeURIComponent(first)}`, { method: 'GET', headers }); }
    catch (e) { out.steps.download = { error: scrub(e instanceof Error ? e.message : String(e)) }; return out; }
    const dlText = await dlResp.text();
    let records = [];
    try { const j = JSON.parse(dlText); records = Array.isArray(j) ? j : (j.data ?? j.records ?? []); } catch { /* */ }
    out.steps.download = {
        status: dlResp.status,
        file: first,
        dataType: (first.split('-').slice(1).join('-') || '').replace(/\.json$/, ''),
        recordCount: Array.isArray(records) ? records.length : 0,
        recordKeys: (Array.isArray(records) && records.length && typeof records[0] === 'object') ? Object.keys(records[0]).slice(0, 40) : [],
    };
    // DELIBERATELY no POST /ack — acking deletes the file (mutation). Read-only only.
    out.ok = dlResp.status >= 200 && dlResp.status < 300;
    return out;
}

/**
 * PropFuel data-export DISCOVERY — READ-ONLY, structure-only. writes:false.
 * Purpose: this is a SPEC-LESS connector (no public OpenAPI/docs); the live demo feed is the
 * only authoritative catalog. This plan surfaces, WITHOUT returning any record VALUES (contact
 * PII), everything the connector build needs:
 *   - the exact data-type tokens present in the queue + per-type file counts/microtime range
 *   - per data type: the nested key SCHEMA (dot-path -> value TYPE set) of a sample record
 *   - the checkin_questions IDENTITY field + UPDATE/DELETE signal, by scanning a window of files:
 *       * which paths change presence/type when an id recurs (the "answered" update mechanism)
 *       * distinct values of OPERATIONAL-SIGNAL fields only (status/state/deleted/action/...) —
 *         low-cardinality enums, never free-text/PII
 * Calls ONLY GET /list + GET /download (NEVER ack). Bounded: <= 24 downloads.
 */
export async function propfuelDiscover({ token }, scrub) {
    const acct = '2019';
    const base = `https://app.propfuel.com/dataexport/${acct}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const out = { ok: false, plan: 'propfuel-discover', accountId: acct };

    const getJSON = async (url) => {
        const r = await fetch(url, { method: 'GET', headers });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch { /* */ }
        return { status: r.status, json: j, text: t };
    };
    const recordsOf = (j) => Array.isArray(j) ? j : (j?.data ?? j?.records ?? []);

    // ── 1) list + group by data type ───────────────────────────────────────────────
    const lr = await getJSON(`${base}/list`);
    if (lr.status < 200 || lr.status >= 300) { out.list = { status: lr.status, body: scrub((lr.text || '').slice(0, 300)) }; return out; }
    const rawFiles = (() => { const j = lr.json; const a = Array.isArray(j) ? j : (j?.files ?? j?.data ?? []); return (Array.isArray(a) ? a : []).map(f => String(typeof f === 'string' ? f : (f.file ?? f.name ?? f))); })();
    // filename = <microtime>-<datatype>.json ; microtime sorts chronologically (numeric)
    const parse = (name) => {
        const m = name.match(/^([0-9]+(?:\.[0-9]+)?)-(.+)\.json$/);
        return m ? { micro: parseFloat(m[1]), microStr: m[1], type: m[2], name } : { micro: NaN, microStr: '', type: '(unparsed)', name };
    };
    const parsed = rawFiles.map(parse).filter(p => p.type !== '(unparsed)').sort((a, b) => a.micro - b.micro);
    const byType = {};
    for (const p of parsed) (byType[p.type] ??= []).push(p);
    out.list = {
        status: lr.status,
        totalFiles: rawFiles.length,
        dataTypes: Object.fromEntries(Object.entries(byType).map(([t, arr]) => [t, {
            fileCount: arr.length,
            oldest: arr[0]?.microStr, newest: arr[arr.length - 1]?.microStr,
        }])),
    };

    // ── helpers: nested schema + signal collection (NO record values returned) ──────
    const SIGNAL = /^(status|state|deleted|is_deleted|isdeleted|removed|void|voided|action|op|operation|event|event_type|type|kind|answered|is_answered|bot|is_bot|valid|is_valid|response_count|answer_count)$/i;
    const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const walkSchema = (obj, schema, prefix = '') => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            (schema[path] ??= new Set()).add(typeOf(v));
            if (v && typeof v === 'object' && !Array.isArray(v)) walkSchema(v, schema, path);
            else if (Array.isArray(v) && v.length && typeof v[0] === 'object') walkSchema(v[0], schema, `${path}[]`);
        }
    };
    const presentPaths = (obj, prefix = '', acc = new Set()) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return acc;
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            const isEmpty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
            if (!isEmpty) acc.add(path);
            if (v && typeof v === 'object' && !Array.isArray(v)) presentPaths(v, path, acc);
        }
        return acc;
    };
    const collectSignals = (obj, sig, prefix = '') => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (SIGNAL.test(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
                const set = (sig[path] ??= new Set());
                if (set.size < 25) { const s = String(v); set.add(s.length > 40 ? '<long>' : s); }
            }
            if (v && typeof v === 'object' && !Array.isArray(v)) collectSignals(v, sig, path);
        }
    };
    // candidate identity = a flat path whose last segment looks like an id and is scalar
    const ID_HINT = /(^|[._])(id|uuid|guid|key)$/i;
    const idCandidates = (obj, prefix = '', acc = {}) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return acc;
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (ID_HINT.test(k) && ['string', 'number'].includes(typeof v)) acc[path] = (acc[path] ?? 0) + 1;
            if (v && typeof v === 'object' && !Array.isArray(v)) idCandidates(v, path, acc);
        }
        return acc;
    };
    const getPath = (obj, path) => path.split('.').reduce((o, seg) => (o == null ? o : o[seg]), obj);

    // ── 2) per data type: schema of a recent sample ────────────────────────────────
    out.schemas = {};
    let budget = 24;
    for (const [type, arr] of Object.entries(byType)) {
        if (budget <= 0) break;
        const sampleFile = arr[arr.length - 1].name; // newest = most-evolved shape
        const dr = await getJSON(`${base}/download/${encodeURIComponent(sampleFile)}`); budget--;
        const recs = recordsOf(dr.json);
        const schema = {}; const sig = {};
        for (const rec of recs.slice(0, 200)) { walkSchema(rec, schema); collectSignals(rec, sig); }
        out.schemas[type] = {
            status: dr.status,
            sampleFile: arr[arr.length - 1].microStr + '-' + type,
            recordCount: Array.isArray(recs) ? recs.length : 0,
            schema: Object.fromEntries(Object.entries(schema).map(([p, s]) => [p, [...s].sort()])),
            signalFields: Object.fromEntries(Object.entries(sig).map(([p, s]) => [p, [...s].sort()])),
            idCandidates: idCandidates(recs[0] ?? {}),
        };
    }

    // ── 3) checkin_questions update/delete signal across a window ───────────────────
    const qType = Object.keys(byType).find(t => /checkin_question|question|answer/i.test(t));
    if (qType) {
        const files = byType[qType];
        const windowFiles = files.slice(-Math.min(16, files.length)); // most recent N
        // pick the identity path: most-frequent id-candidate across the type's sample schema
        const idc = out.schemas[qType]?.idCandidates ?? {};
        const idPath = Object.entries(idc).sort((a, b) => b[1] - a[1])[0]?.[0]
            ?? Object.keys(idc)[0] ?? 'checkin_question.id';
        const seen = new Map(); // id -> { count, firstPaths:Set, lastPaths:Set, firstMicro, lastMicro, signalSeq:[] }
        let scanned = 0, recTotal = 0;
        for (const f of windowFiles) {
            if (budget <= 0) break;
            const dr = await getJSON(`${base}/download/${encodeURIComponent(f.name)}`); budget--; scanned++;
            const recs = recordsOf(dr.json);
            for (const rec of recs) {
                recTotal++;
                const idv = getPath(rec, idPath);
                if (idv === undefined || idv === null || idv === '') continue;
                const key = String(idv);
                const paths = presentPaths(rec);
                const sigSnap = {}; const sigTmp = {}; collectSignals(rec, sigTmp);
                for (const [p, s] of Object.entries(sigTmp)) sigSnap[p] = [...s][0];
                if (!seen.has(key)) seen.set(key, { count: 0, firstPaths: paths, lastPaths: paths, firstMicro: f.microStr, lastMicro: f.microStr, firstSig: sigSnap, lastSig: sigSnap });
                const e = seen.get(key);
                e.count++; e.lastPaths = paths; e.lastMicro = f.microStr; e.lastSig = sigSnap;
            }
        }
        // identity recurrence + what changes when an id is seen again
        const recurring = [...seen.values()].filter(e => e.count > 1);
        const addedPathsTally = {}; const removedPathsTally = {}; const sigTransitions = {};
        for (const e of recurring) {
            for (const p of e.lastPaths) if (!e.firstPaths.has(p)) addedPathsTally[p] = (addedPathsTally[p] ?? 0) + 1;
            for (const p of e.firstPaths) if (!e.lastPaths.has(p)) removedPathsTally[p] = (removedPathsTally[p] ?? 0) + 1;
            for (const [p, lv] of Object.entries(e.lastSig)) {
                const fv = e.firstSig[p];
                if (fv !== lv) { const k = `${p}: ${fv} -> ${lv}`; sigTransitions[k] = (sigTransitions[k] ?? 0) + 1; }
            }
        }
        const topN = (o, n = 15) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
        out.mutationSignal = {
            dataType: qType,
            identityPath: idPath,
            filesScanned: scanned,
            recordsScanned: recTotal,
            distinctIdentities: seen.size,
            recurringIdentities: recurring.length,
            note: 'recurring identity across files == the record was re-emitted (created->answered update, or pre-delete). Path/ signal deltas below show HOW the update manifests; absence in later files == tombstone-by-omission.',
            pathsAppearingOnRecur: topN(addedPathsTally),   // e.g. an "answer"/"response" path that fills in
            pathsDisappearingOnRecur: topN(removedPathsTally),
            signalFieldTransitions: topN(sigTransitions),   // e.g. status: sent -> answered / -> deleted
        };
    }

    out.ok = true;
    return out;
}

/**
 * PropFuel LIFECYCLE proof — READ-ONLY, counts+booleans only. writes:false.
 * Confirms the checkin_questions create->answer->soft-delete lifecycle in LIVE data:
 *   - state distribution (how many records have answered_at / deleted_at / response populated)
 *   - identity recurrence across a time window (same checkin_question.id re-emitted = an update),
 *     reporting only the answered_at/deleted_at PRESENCE transition (boolean), never timestamps/PII.
 * Calls ONLY GET /list + GET /download (NEVER ack). Bounded: <= 90 downloads, <= 12000 records.
 */
export async function propfuelLifecycle({ token }, scrub) {
    const acct = '2019';
    const base = `https://app.propfuel.com/dataexport/${acct}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const out = { ok: false, plan: 'propfuel-lifecycle', accountId: acct };
    const getJSON = async (url) => { const r = await fetch(url, { method: 'GET', headers }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, json: j, text: t }; };
    const recordsOf = (j) => Array.isArray(j) ? j : (j?.data ?? j?.records ?? []);

    const lr = await getJSON(`${base}/list`);
    if (lr.status < 200 || lr.status >= 300) { out.error = `list ${lr.status}`; return out; }
    const rawFiles = (() => { const j = lr.json; const a = Array.isArray(j) ? j : (j?.files ?? j?.data ?? []); return (Array.isArray(a) ? a : []).map(f => String(typeof f === 'string' ? f : (f.file ?? f.name ?? f))); })();
    const parse = (name) => { const m = name.match(/^([0-9]+(?:\.[0-9]+)?)-(.+)\.json$/); return m ? { micro: parseFloat(m[1]), type: m[2], name } : null; };
    const q = rawFiles.map(parse).filter(Boolean).filter(p => /checkin_question/i.test(p.type)).sort((a, b) => a.micro - b.micro);

    const present = (v) => v !== null && v !== undefined && v !== '';
    const tally = { records: 0, answered: 0, deleted: 0, hasResponse: 0, hasRating: 0, hasSelection: 0, updatedDiffersCreated: 0 };
    const seen = new Map(); // id -> { n, firstAnswered, lastAnswered, firstDeleted, lastDeleted }
    let downloads = 0;

    const scanFile = (recs) => {
        for (const rec of recs) {
            const cq = rec?.checkin_question; if (!cq || typeof cq !== 'object') continue;
            tally.records++;
            const a = present(cq.answered_at), d = present(cq.deleted_at);
            if (a) tally.answered++; if (d) tally.deleted++;
            if (present(cq.response)) tally.hasResponse++;
            if (present(cq.rating)) tally.hasRating++;
            if (present(cq.selection)) tally.hasSelection++;
            if (present(cq.created_at) && present(cq.updated_at) && cq.created_at !== cq.updated_at) tally.updatedDiffersCreated++;
            const id = cq.id; if (id === null || id === undefined) continue;
            const k = String(id);
            if (!seen.has(k)) seen.set(k, { n: 0, firstAnswered: a, lastAnswered: a, firstDeleted: d, lastDeleted: d });
            const e = seen.get(k); e.n++; e.lastAnswered = a; e.lastDeleted = d;
        }
    };

    // Window A — oldest 4 files (large, settled state distribution)
    for (const f of q.slice(0, 4)) { if (downloads >= 90 || tally.records >= 12000) break; const dr = await getJSON(`${base}/download/${encodeURIComponent(f.name)}`); downloads++; scanFile(recordsOf(dr.json)); }
    // Window B — most-recent 80 files (small, spans live-job time → recurrence)
    for (const f of q.slice(-80)) { if (downloads >= 90 || tally.records >= 12000) break; const dr = await getJSON(`${base}/download/${encodeURIComponent(f.name)}`); downloads++; scanFile(recordsOf(dr.json)); }

    const recurring = [...seen.values()].filter(e => e.n > 1);
    const becameAnswered = recurring.filter(e => !e.firstAnswered && e.lastAnswered).length;
    const becameDeleted = recurring.filter(e => !e.firstDeleted && e.lastDeleted).length;
    out.ok = true;
    out.filesAvailable = q.length;
    out.filesDownloaded = downloads;
    out.stateDistribution = tally;
    out.recurrence = {
        distinctIdentities: seen.size,
        recurringIdentities: recurring.length,
        recurredAndBecameAnswered: becameAnswered, // observed create -> answer update
        recurredAndBecameDeleted: becameDeleted,   // observed soft-delete transition
        maxOccurrencesOfOneId: recurring.reduce((m, e) => Math.max(m, e.n), 0),
    };
    out.interpretation = 'answered_at/deleted_at populated => update & soft-delete happen in-record; recurrence with becameAnswered/becameDeleted > 0 == the SAME checkin_question.id re-emitted across files as it transitions. Connector MUST upsert-by checkin_question.id and treat deleted_at!=null as a tombstone.';
    return out;
}

/**
 * GrowthZone OAuth2 — READ-ONLY live validation. writes:false.
 * Mints a Bearer access token from the OAuth2 credential set (refresh_token grant primary,
 * password grant fallback) against {origin}/oauth/token, then does TestConnection + a single
 * read page (GET .../contacts?$top=2 and a delta probe) — STRICTLY read-only (no POST/PUT/DELETE,
 * no ack). Proves the token-mint + endpoints + record shape against the LIVE GrowthZone tenant
 * without touching client data. Secrets enter ONLY the broker process; the agent sees a scrubbed
 * structure (token never returned; only status + COUNTS + field KEY names — never record values/PII).
 *
 * Required secrets (declared → must be present): baseUrl, clientId, clientSecret, refreshToken.
 * Optional config read directly from env (NOT required, so a skipped one doesn't fail the plan):
 *   GROWTHZONE_TOKEN_URL (else derived as {origin}/oauth/token), GROWTHZONE_SCOPES,
 *   GROWTHZONE_USERNAME + GROWTHZONE_PASSWORD (password-grant fallback only).
 */
export async function growthzoneReadonly({ baseUrl, clientId, clientSecret, refreshToken }, scrub) {
    const out = { ok: false, plan: 'growthzone-readonly', steps: {} };
    // Normalize the base URL → API base (…/api) + origin (for the OAuth token endpoint, which lives at root).
    const rawBase = String(baseUrl || '').trim().replace(/\/+$/, '');
    let origin = rawBase, apiBase = rawBase;
    try { origin = new URL(rawBase).origin; } catch { /* leave as-is if not parseable */ }
    if (!/\/api$/i.test(apiBase)) apiBase = `${apiBase}/api`;            // ensure …/api
    const tokenUrl = (process.env.GROWTHZONE_TOKEN_URL || `${origin}/oauth/token`).trim();
    const scopes = (process.env.GROWTHZONE_SCOPES || '').trim();
    const uname = process.env.GROWTHZONE_USERNAME;
    const pword = process.env.GROWTHZONE_PASSWORD;

    // ── 1) Mint a Bearer. refresh_token grant first; password grant as fallback. ──
    async function mint(grantBody, label) {
        // GrowthZone rejects client creds sent in BOTH Basic header AND body
        // ("Multiple client credentials cannot be specified"). Send them in the BODY ONLY.
        let resp;
        try {
            resp = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                body: new URLSearchParams(grantBody).toString(),
            });
        } catch (e) { return { grant: label, error: scrub(e instanceof Error ? e.message : String(e)) }; }
        const text = await resp.text();
        let tok = null, tokType = null;
        try { const j = JSON.parse(text); tok = j.access_token ?? j.accessToken ?? null; tokType = j.token_type ?? 'Bearer'; } catch { /* non-json */ }
        return { grant: label, status: resp.status, gotToken: !!tok, tokenType: tokType, token: tok, body: tok ? undefined : scrub(text.slice(0, 300)) };
    }

    let mintResult = await mint(
        { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, ...(scopes ? { scope: scopes } : {}) },
        'refresh_token'
    );
    if (!mintResult.gotToken && uname && pword) {
        const pw = await mint(
            { grant_type: 'password', username: uname, password: pword, client_id: clientId, client_secret: clientSecret, ...(scopes ? { scope: scopes } : {}) },
            'password'
        );
        if (pw.gotToken) mintResult = pw; else out.steps.passwordGrant = { grant: pw.grant, status: pw.status, gotToken: pw.gotToken, body: pw.body };
    }
    out.steps.tokenMint = { grant: mintResult.grant, status: mintResult.status, gotToken: mintResult.gotToken, tokenType: mintResult.tokenType, tokenUrl: scrub(tokenUrl), ...(mintResult.body ? { body: mintResult.body } : {}), ...(mintResult.error ? { error: mintResult.error } : {}) };
    const access = mintResult.token;
    if (!access) { out.note = 'OAuth token mint failed — see steps.tokenMint'; return out; }
    const authHeaders = { 'Authorization': `Bearer ${access}`, 'Accept': 'application/json' };

    // ── 2) TestConnection + one read page (read-only). Try contacts list, then delta probe. ──
    async function readGet(path, label) {
        let resp;
        try { resp = await fetch(`${apiBase}${path}`, { method: 'GET', headers: authHeaders }); }
        catch (e) { return { label, error: scrub(e instanceof Error ? e.message : String(e)) }; }
        const text = await resp.text();
        let recs = [];
        try { const j = JSON.parse(text); recs = Array.isArray(j) ? j : (j.Results ?? j.results ?? j.data ?? j.value ?? []); } catch { /* */ }
        const first = (Array.isArray(recs) && recs.length && typeof recs[0] === 'object') ? recs[0] : null;
        return {
            label, status: resp.status, ok: resp.status >= 200 && resp.status < 300,
            recordCount: Array.isArray(recs) ? recs.length : 0,
            recordKeys: first ? Object.keys(first).slice(0, 50) : [],
            ...(resp.status >= 200 && resp.status < 300 ? {} : { body: scrub(text.slice(0, 300)) }),
        };
    }

    out.steps.contacts = await readGet('/contacts?$top=2', 'contacts-list');
    // delta probe (read-only) — the documented incremental endpoint
    out.steps.contactsDelta = await readGet('/contacts/delta?modifiedSince=2020-01-01T00:00:00Z&top=2', 'contacts-delta');

    out.connected = !!(out.steps.contacts?.ok || out.steps.contactsDelta?.ok);
    out.ok = out.connected;
    out.note = out.ok
        ? 'OAuth2 Bearer minted; live read-only GET succeeded against GrowthZone /api (no writes/acks performed)'
        : 'OAuth2 Bearer minted but read GET did not return 2xx — see steps.contacts/contactsDelta';
    return out;
}

/**
 * GrowthZone OAuth2 — create the CompanyIntegration with the full OAuth credential. writes:false
 * externally (CreateConnection only reads GrowthZone to TestConnection). The OAuth secrets (clientId/
 * clientSecret/refreshToken/baseUrl) enter ONLY this broker process; MJAPI encrypts them server-side
 * and the agent receives ONLY the CompanyIntegrationID (token never returned). The agent then drives
 * ApplyAll/StartSync by CIID over GraphQL with MJ_API_KEY (no vendor secret). Job env (non-secret):
 * HS_LIVE_GRAPHQL_URL, HS_LIVE_COMPANY_ID, HS_LIVE_INTEGRATION_ID, HS_LIVE_CREDTYPE_ID.
 */
export async function growthzoneCreateConnection({ clientId, clientSecret, refreshToken, baseUrl, mjSystemKey }, scrub) {
    const env = process.env;
    const graphqlUrl = (env.HS_LIVE_GRAPHQL_URL || 'http://localhost:4013/').trim();
    const companyID = env.HS_LIVE_COMPANY_ID, integrationID = env.HS_LIVE_INTEGRATION_ID, credentialTypeID = env.HS_LIVE_CREDTYPE_ID;
    const scopes = (env.GROWTHZONE_SCOPES || '').trim(), tokenUrl = (env.GROWTHZONE_TOKEN_URL || '').trim();
    const uname = env.GROWTHZONE_USERNAME, pword = env.GROWTHZONE_PASSWORD;
    if (!companyID || !integrationID || !credentialTypeID) {
        return { ok: false, plan: 'growthzone-create-connection', error: 'missing HS_LIVE_COMPANY_ID / HS_LIVE_INTEGRATION_ID / HS_LIVE_CREDTYPE_ID in job env' };
    }
    // The operator's refresh_token is expired (GrowthZone returns "invalid"); the PASSWORD grant works
    // (proven in growthzone-readonly). The connector selects refresh_token whenever a RefreshToken is
    // present (no fallback), so OMIT RefreshToken here to force the working password grant. Set
    // GROWTHZONE_USE_REFRESH=1 to include it (once a fresh token is available).
    const useRefresh = (env.GROWTHZONE_USE_REFRESH === '1') && refreshToken;
    const credentialValues = JSON.stringify({
        ClientId: clientId, ClientSecret: clientSecret, BaseURL: baseUrl,
        ...(useRefresh ? { RefreshToken: refreshToken } : {}),
        ...(scopes ? { Scopes: scopes } : {}), ...(tokenUrl ? { TokenURL: tokenUrl } : {}),
        ...(uname ? { Username: uname } : {}), ...(pword ? { Password: pword } : {}),
    });
    const configuration = JSON.stringify({ BaseURL: baseUrl, ClientId: clientId, ...(scopes ? { Scopes: scopes } : {}) });
    async function gql(query, variables) {
        const r = await fetch(graphqlUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mj-api-key': mjSystemKey }, body: JSON.stringify({ query, variables }) });
        const j = await r.json();
        if (j.errors) throw new Error('GQL: ' + scrub(JSON.stringify(j.errors).slice(0, 400)));
        return j.data;
    }
    const CREATE = `mutation($input: CreateConnectionInput!, $testConnection: Boolean!, $runSchemaRefresh: Boolean!) {
      IntegrationCreateConnection(input: $input, testConnection: $testConnection, runSchemaRefresh: $runSchemaRefresh) {
        Success Message CompanyIntegrationID CredentialID ConnectionTestSuccess ConnectionTestMessage } }`;
    const input = { CompanyID: companyID, IntegrationID: integrationID, CredentialTypeID: credentialTypeID, CredentialName: 'GrowthZone E2E OAuth2', CredentialValues: credentialValues, Configuration: configuration };
    let d;
    try { d = await gql(CREATE, { input, testConnection: true, runSchemaRefresh: false }); }
    catch (e) { return { ok: false, plan: 'growthzone-create-connection', error: scrub(e instanceof Error ? e.message : String(e)) }; }
    const c = d?.IntegrationCreateConnection ?? {};
    return {
        ok: !!c.Success, plan: 'growthzone-create-connection',
        companyIntegrationID: c.CompanyIntegrationID ?? null,
        connectionTest: c.ConnectionTestSuccess ?? null,
        connectionTestMessage: scrub(c.ConnectionTestMessage || ''),
        message: scrub(c.Message || ''),
    };
}

/**
 * GrowthZone path-discovery probe (READ-ONLY). Mints a Bearer, then (1) attempts one-shot endpoint
 * enumeration via OData `$metadata` / swagger, and (2) probes candidate list paths for the doors whose
 * seeded API path returned 404/400/405. Reports status + recordCount + top-level record keys per path so
 * the real endpoint can be identified. NEVER writes/acks. Same OAuth secrets as growthzone-readonly.
 */
export async function growthzoneProbePaths({ baseUrl, clientId, clientSecret, refreshToken }, scrub) {
    const out = { ok: false, plan: 'growthzone-probe-paths', tokenMint: {}, discovery: {}, probes: {} };
    const rawBase = String(baseUrl || '').trim().replace(/\/+$/, '');
    let origin = rawBase, apiBase = rawBase;
    try { origin = new URL(rawBase).origin; } catch { /* */ }
    if (!/\/api$/i.test(apiBase)) apiBase = `${apiBase}/api`;
    const tokenUrl = (process.env.GROWTHZONE_TOKEN_URL || `${origin}/oauth/token`).trim();
    const scopes = (process.env.GROWTHZONE_SCOPES || '').trim();
    const uname = process.env.GROWTHZONE_USERNAME, pword = process.env.GROWTHZONE_PASSWORD;

    async function mint(body, label) {
        try {
            const resp = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams(body).toString() });
            const text = await resp.text();
            let tok = null; try { tok = JSON.parse(text).access_token ?? null; } catch { /* */ }
            return { grant: label, status: resp.status, token: tok };
        } catch (e) { return { grant: label, error: scrub(e instanceof Error ? e.message : String(e)) }; }
    }
    let m = await mint({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, ...(scopes ? { scope: scopes } : {}) }, 'refresh_token');
    if (!m.token && uname && pword) m = await mint({ grant_type: 'password', username: uname, password: pword, client_id: clientId, client_secret: clientSecret, ...(scopes ? { scope: scopes } : {}) }, 'password');
    out.tokenMint = { grant: m.grant, status: m.status, gotToken: !!m.token };
    if (!m.token) { out.note = 'token mint failed'; return out; }
    const H = { 'Authorization': `Bearer ${m.token}`, 'Accept': 'application/json' };

    async function get(path) {
        try {
            const resp = await fetch(`${apiBase}${path}`, { method: 'GET', headers: H });
            const text = await resp.text();
            let recs = null, keys = [];
            try { const j = JSON.parse(text); recs = Array.isArray(j) ? j : (j.Results ?? j.value ?? null); if (Array.isArray(recs) && recs[0] && typeof recs[0] === 'object') keys = Object.keys(recs[0]).slice(0, 40); } catch { /* */ }
            return { path, status: resp.status, recordCount: Array.isArray(recs) ? recs.length : null, keys, ...(resp.status >= 200 && resp.status < 300 ? {} : { body: scrub(text.slice(0, 160)) }) };
        } catch (e) { return { path, error: scrub(e instanceof Error ? e.message : String(e)) }; }
    }

    // 0) DEFINITIVE Contact-door completeness: total + page-2 existence (is 100 the cap or the truth?)
    async function getFull(path) {
        try {
            const resp = await fetch(`${apiBase}${path}`, { method: 'GET', headers: H });
            const text = await resp.text();
            let j = null; try { j = JSON.parse(text); } catch { /* */ }
            const recs = Array.isArray(j) ? j : (j?.Results ?? null);
            return { path, status: resp.status, count: Array.isArray(recs) ? recs.length : null, total: j?.TotalRecordAvailable ?? null };
        } catch (e) { return { path, error: scrub(e instanceof Error ? e.message : String(e)) }; }
    }
    async function firstIds(path, n) {
        try {
            const resp = await fetch(`${apiBase}${path}`, { headers: H });
            const j = await resp.json();
            const recs = Array.isArray(j) ? j : (j?.Results ?? []);
            return { path, status: resp.status, total: j?.TotalRecordAvailable ?? null, ids: recs.slice(0, n).map(r => r.ContactId ?? r.Id ?? r.ID ?? JSON.stringify(r).slice(0, 20)) };
        } catch (e) { return { path, error: String(e).slice(0, 80) }; }
    }
    // Does `skip` actually advance? Compare first IDs at skip=0 vs skip=3 vs $skip=3.
    out.skipParamTest = {
        skip0: await firstIds('/contacts?top=3&skip=0', 3),
        skip3: await firstIds('/contacts?top=3&skip=3', 3),
        dollarSkip3: await firstIds('/contacts?$top=3&$skip=3', 3),
        page2: await firstIds('/contacts?top=3&page=2', 3),
        pageNumber2: await firstIds('/contacts?top=3&pageNumber=2', 3),
        offset3: await firstIds('/contacts?top=3&offset=3', 3),
    };
    out.contactDoorTruth = {
        page1: await getFull('/contacts?top=100'),
        page2_skip100: await getFull('/contacts?top=100&skip=100'),
    };

    // 1) one-shot enumeration
    for (const d of ['/$metadata', '/swagger/docs/v1', '/swagger', '/metadata', '']) out.discovery[d || '(root)'] = await get(d);

    // 2) candidate list paths per broken door (probe with top=1)
    // Round 2: `/all` door pattern (proven by /groups/all) + param-children confirmed with real IDs.
    const memId = process.env.GZ_PROBE_MEMBERSHIP_ID || '';
    const candidates = {
        Event: ['/events/all', '/event/all', '/eventcalendar/all', '/eventcalendars/all', '/calendar/all', '/events/upcoming', '/eventlist', '/event'],
        EventCalendar: ['/eventcalendars/all', '/calendars/all', '/eventcalendar/all'],
        EventVenue: ['/eventvenues/all', '/venues/all', '/venue/all'],
        StoreItem: ['/store/items/all', '/store/all', '/storeitems/all', '/store/products/all', '/storeitem/all', '/commerce/items/all'],
        StoreOrder: ['/store/orders/all', '/store/order/all', '/orders/all', '/storeorders/all'],
        StoreDigitalPurchase: ['/store/storedownloads/all', '/store/downloads/all', '/store/digitalpurchases/all'],
        Directory: ['/directory/all', '/directories/all', '/directorylistings/all', '/directorylisting/all', '/listings/all'],
        DirectoryListingType: ['/directory/listingtypes/all', '/directorylistingtypes/all', '/directory/types/all', '/listingtypes/all'],
        ScheduledBillingUpdate: ['/scheduledbilling/all', '/memberships/scheduledbilling/all', '/membership/scheduledbilling/all'],
    };
    for (const [door, paths] of Object.entries(candidates)) {
        out.probes[door] = [];
        for (const p of paths) out.probes[door].push(await get(`${p}?top=1`));
    }
    // Chain real IDs from the working doors to confirm the param-children (read-only).
    out.paramChildren = {};
    const evDoor = await get('/events/all?top=1');
    const firstEvent = evDoor.recordCount ? null : null;
    let evId = '';
    try { const resp = await fetch(`${apiBase}/events/all?top=1`, { headers: H }); const j = await resp.json(); evId = String((Array.isArray(j) ? j[0] : (j.Results || [])[0])?.EventId ?? ''); } catch { /* */ }
    if (evId) {
        out.paramChildren.eventIdUsed = evId;
        out.paramChildren.EventCalendars = await get(`/events/calendars?eventId=${evId}&top=2`);
        out.paramChildren.EventVenues = await get(`/events/venues?eventId=${evId}&top=2`);
        out.paramChildren.EventList = await get(`/events/list?eventId=${evId}&top=2`);
        out.paramChildren.EventSessions = await get(`/events/sessions?eventId=${evId}&top=2`);
        out.paramChildren.EventRegistrationTypes = await get(`/events/registrationtypes?eventId=${evId}&top=2`);
        out.paramChildren.EventSponsors = await get(`/events/sponsors?eventId=${evId}&top=2`);
        out.paramChildren.EventExhibitors = await get(`/events/exhibitors?eventId=${evId}&top=2`);
    }
    let mId = memId;
    if (!mId) { try { const resp = await fetch(`${apiBase}/memberships?top=1`, { headers: H }); const j = await resp.json(); mId = String((Array.isArray(j) ? j[0] : (j.Results || [])[0])?.MembershipId ?? (j.Results || [])[0]?.Id ?? ''); } catch { /* */ } }
    if (mId) { out.paramChildren.membershipIdUsed = mId; out.paramChildren.ScheduledBilling = await get(`/memberships/scheduledbilling?membershipId=${mId}&top=2`); }
    // ── Comprehensive child-path discovery with REAL parent IDs (path-segment vs query-param style) ──
    async function realId(path, field) { try { const resp = await fetch(`${apiBase}${path}`, { headers: H }); const j = await resp.json(); const rec = (Array.isArray(j) ? j[0] : (j.Results || [])[0]) || {}; return String(rec[field] ?? rec.Id ?? rec.ID ?? ''); } catch { return ''; } }
    const cid = await realId('/contacts?$top=1', 'ContactId');
    const gid = await realId('/groups/all?$top=1', 'GroupId');
    const mid2 = await realId('/memberships?$top=1', 'MembershipId');
    out.childPaths = { ids: { cid, evId, gid, mid: mid2 } };
    const tests = {
        ContactPhone: [`/contacts/${cid}/phones`, `/contacts/${cid}/phone`, `/contacts/phones?contactId=${cid}`],
        ContactCustomField: [`/contacts/${cid}/customfields`, `/contacts/${cid}/NotesAndFields`, `/contacts/${cid}/fields`],
        EventSponsor_path: [`/events/${evId}/sponsors`],
        EventSponsor_query: [`/events/sponsors?eventId=${evId}`],
        EventSession_query: [`/events/sessions?eventId=${evId}`],
        EventAttendee_query: [`/events/attendees?eventId=${evId}`, `/events/${evId}/attendees`],
        GroupMember_path: [`/groups/${gid}/members`],
        GroupMember_query: [`/groups/members?groupId=${gid}`, `/groups/all/members?groupId=${gid}`],
        ScheduledBilling: [`/memberships/scheduledbilling?membershipId=${mid2}`],
        MembershipChange: [`/memberships/change/${mid2}/All`, `/memberships/${mid2}/changes`, `/memberships/changes?membershipId=${mid2}`],
    };
    for (const [k, paths] of Object.entries(tests)) { out.childPaths[k] = []; for (const p of paths) out.childPaths[k].push(await get(p.includes('?') ? `${p}&$top=2` : `${p}?$top=2`)); }

    // Round-2 unknowns: membership PK field, ContactPhone endpoint, MembershipChange shape, contact detail.
    out.unknowns = {};
    out.unknowns.membershipKeys = await get('/memberships?$top=1');
    out.unknowns.contactDetail = await get(`/contacts/${cid}`);
    out.unknowns.notesAndFields = await get(`/contacts/${cid}/NotesAndFields?$top=3`);
    for (const p of [`/contacts/${cid}/phonenumbers`, `/contacts/${cid}/communication`, `/contacts/${cid}/phonenumber`, `/contacts/${cid}/contactphones`, `/contacts/${cid}/phonelist`]) out.unknowns['phone:' + p.split('/').pop()] = await get(`${p}?$top=2`);
    // Membership door is /memberships/all — get a real MembershipId for the param-children.
    const mid = await realId('/memberships/all?$top=1', 'MembershipId');
    out.unknowns.midUsed = mid;
    const finals = {
        ScheduledBilling: [`/memberships/scheduledbilling?membershipId=${mid}`, `/memberships/${mid}/scheduledbilling`],
        MembershipChange: [`/memberships/${mid}/changes`, `/memberships/change?membershipId=${mid}`, `/memberships/changes?membershipId=${mid}`],
        Certification: [`/certifications/all`, `/certifications`, `/certification/all`, `/contacts/${cid}/certifications`],
        MembershipStatusLookup: [`/memberships/lookup/status/Active`, `/memberships/statuses/all`, `/memberships/statuslookup/all`, `/memberships/lookup/status`],
        ContactPhone: [`/contacts/${cid}/Phones`, `/contacts/${cid}/PhoneNumbers`, `/contacts/${cid}/phone/all`, `/contacts/phones/${cid}`],
    };
    for (const [k, paths] of Object.entries(finals)) { out.unknowns['F_' + k] = []; for (const p of paths) out.unknowns['F_' + k].push(await get(p.includes('?') ? `${p}&$top=2` : `${p}?$top=2`)); }
    // DETERMINISM PROBE: fetch the same Event-child endpoint twice, diff the full records to find the
    // field that varies between fetches (the cause of non-idempotent content-hash growth).
    async function getRaw(path) { try { const r = await fetch(`${apiBase}${path}`, { headers: H }); const j = await r.json(); return Array.isArray(j) ? j[0] : (j.Results ? j.Results[0] : j); } catch (e) { return { error: String(e).slice(0, 60) }; } }
    let evIdD = '';
    try { const r = await fetch(`${apiBase}/events/all?top=1`, { headers: H }); const j = await r.json(); evIdD = String((Array.isArray(j) ? j[0] : (j.Results || [])[0])?.EventId ?? ''); } catch { /* */ }
    if (evIdD) {
        const a = await getRaw(`/events/sponsors?eventId=${evIdD}`);
        const b = await getRaw(`/events/sponsors?eventId=${evIdD}`);
        const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
        out.determinism = {
            eventId: evIdD,
            varyingFields: keys.filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).map(k => ({ field: k, a: JSON.stringify(a?.[k])?.slice(0, 50), b: JSON.stringify(b?.[k])?.slice(0, 50) })),
            allKeys: keys,
        };
    }

    out.ok = true;
    out.note = 'read-only path discovery; 2xx with recordCount!=null identifies the real list endpoint';
    return out;
}


/**
 * GrowthZone CREDENTIALED RealityProbe (v2 S7 full mode — ARCHITECTURE_REFACTOR.md P2/P9).
 * Mints a Bearer (refresh grant, password fallback — body-only client creds), then runs the
 * DETERMINISTIC probe script as a child with the token in ITS env only (PROBE_TOKEN). The probe
 * emits VERDICTS on declared claims (paths/pagination/PK-populated/watermark/write-surface) and
 * never records auth headers; the scrubbed summary + verdict counts come back — never the token.
 * READ-ONLY: GETs + OPTIONS only; write-surface evidence is OPTIONS/405/401, never a write call.
 */
export async function growthzoneProbeLive({ baseUrl, clientId, clientSecret, refreshToken }, scrub) {
    const out = { ok: false, plan: 'growthzone-probe-live', steps: {} };
    const rawBase = String(baseUrl || '').trim().replace(/\/+$/, '');
    let origin = rawBase;
    try { origin = new URL(rawBase).origin; } catch { /* keep */ }
    const tokenUrl = (process.env.GROWTHZONE_TOKEN_URL || `${origin}/oauth/token`).trim();

    async function mint(grantBody, label) {
        let resp;
        try {
            resp = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams(grantBody).toString() });
        } catch (e) { return { grant: label, error: scrub(e instanceof Error ? e.message : String(e)) }; }
        const text = await resp.text();
        let tok = null;
        try { const j = JSON.parse(text); tok = j.access_token ?? j.accessToken ?? null; } catch { /* */ }
        return { grant: label, status: resp.status, gotToken: !!tok, token: tok };
    }
    let m = await mint({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }, 'refresh_token');
    if (!m.gotToken && process.env.GROWTHZONE_USERNAME) {
        m = await mint({ grant_type: 'password', client_id: clientId, client_secret: clientSecret, username: process.env.GROWTHZONE_USERNAME, password: process.env.GROWTHZONE_PASSWORD || '', scope: process.env.GROWTHZONE_SCOPES || '' }, 'password');
    }
    out.steps.mint = { grant: m.grant, status: m.status, gotToken: m.gotToken };
    if (!m.gotToken) { out.error = 'token mint failed'; return out; }

    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
    const probe = resolve(repoRoot, 'packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs');
    const metadata = process.env.GZ_PROBE_METADATA || resolve(repoRoot, 'metadata/integrations/growthzone/.growthzone.integration.json');
    const outDir = mkdtempSync(resolve(tmpdir(), 'gz-probe-live-'));
    let stdout = '';
    try {
        stdout = execFileSync(process.execPath, [probe, '--metadata', metadata, '--base-url', origin, '--token-env', 'PROBE_TOKEN', '--out', outDir, '--qps', process.env.GZ_PROBE_QPS || '3'], {
            env: { ...process.env, PROBE_TOKEN: m.token }, encoding: 'utf-8', timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024,
        });
    } catch (e) { out.error = scrub(`probe failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)); return out; }
    try {
        const { readFileSync } = await import('node:fs');
        const summary = JSON.parse(readFileSync(resolve(outDir, 'verdicts.json'), 'utf-8'));
        // Scrubbed return: counts + per-claim verdicts (paths/field names/statuses only — no values, no headers beyond rate-limit names).
        out.steps.probe = {
            mode: summary.mode, claims: summary.claims, confirmed: summary.confirmed, wrong: summary.wrong, unverified: summary.unverified,
            wrongVerdicts: summary.verdicts.filter(v => v.verdict === 'wrong').map(v => ({ object: v.object, kind: v.kind, claim: v.claim, evidence: scrub(String(v.evidence).slice(0, 160)) })),
            unverifiedByName: summary.unverifiedByName,
            artifactDir: outDir,
        };
        out.ok = true;
    } catch (e) { out.error = scrub(`verdict read failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); }
    return out;
}

export const PLANS = {
    // GrowthZone CREDENTIALED RealityProbe (v2 S7 full mode) — read-only verdicts on declared claims.
    'growthzone-probe-live': {
        secrets: { baseUrl: 'GROWTHZONE_BASE_URL', clientId: 'GROWTHZONE_CLIENT_ID', clientSecret: 'GROWTHZONE_CLIENT_SECRET', refreshToken: 'GROWTHZONE_REFRESH_TOKEN' },
        run: growthzoneProbeLive, writes: false,
    },
    // GrowthZone read-only path discovery for the 404/400/405 doors. Hot-reloaded; no broker restart.
    'growthzone-probe-paths': {
        secrets: { baseUrl: 'GROWTHZONE_BASE_URL', clientId: 'GROWTHZONE_CLIENT_ID', clientSecret: 'GROWTHZONE_CLIENT_SECRET', refreshToken: 'GROWTHZONE_REFRESH_TOKEN' },
        run: growthzoneProbePaths, writes: false,
    },
    // GrowthZone OAuth2 connection creation (broker holds the OAuth secrets; returns only the CIID).
    'growthzone-create-connection': {
        secrets: { clientId: 'GROWTHZONE_CLIENT_ID', clientSecret: 'GROWTHZONE_CLIENT_SECRET', refreshToken: 'GROWTHZONE_REFRESH_TOKEN', baseUrl: 'GROWTHZONE_BASE_URL', mjSystemKey: 'MJ_API_KEY' },
        run: growthzoneCreateConnection, writes: false,
    },
    // ── CONNECTOR-AGNOSTIC full e2e (real engine) — replaces per-vendor hardcoding ──────────────────
    // MOCK mode (credential-free): a local mock-vendor server replays E2E_CONNECTOR's fixtures.json;
    // the SAME real pipeline runs (CreateConnection → ApplyAll builds tables → StartSync runs the real
    // IntegrationEngine → tail → DB verify incl. delta create/update/delete + idempotent re-run). NO
    // vendor secret is declared (credential-free by construction). writes:false ALWAYS — read-only from
    // the vendor; the DB writes are into our OWN destination schema (the point of the test), and mock
    // mode never declares a secret. Set E2E_CONNECTOR + E2E_MODE=mock (default) + the HS_LIVE_* DB/GQL
    // coordinates. Works for ANY connector shape by reading the discovered objects + the fixtures.
    'connector-e2e': {
        secrets: { dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: connectorE2EMock, writes: false,
    },
    // LIVE mode (credentialed): identical pipeline + DB verification against the REAL vendor. Credential
    // arrives ONLY via the broker mailbox, READ-ONLY, never acked. token (E2E_MODE=live, no pre-seeded
    // CIID) OR pre-seeded HS_LIVE_CIID (token-free reference). writes:false (forward/read path only).
    'connector-e2e-live': {
        secrets: { token: 'CONNECTOR_API_KEY', dbPassword: 'DB_PASSWORD', mjSystemKey: 'MJ_API_KEY' },
        run: connectorE2ELive, writes: false,
    },
    'hubspot-tier1': { secrets: { token: 'HUBSPOT_API_KEY' }, run: hubspotTier1, writes: false },
    // PropFuel data-export feed — read-only (GET list + GET download; NEVER ack). Safe vs live data.
    'propfuel-readonly': { secrets: { token: 'PROPFUEL_TOKEN' }, run: propfuelReadonly, writes: false },
    // GrowthZone OAuth2 — read-only live validation: mint Bearer (refresh_token grant) + GET one
    // contacts page + delta probe. NEVER writes/acks. Only the 4 OAuth secrets are REQUIRED; optional
    // username/password/scopes/token-url are read from env so a skipped one doesn't fail the plan.
    'growthzone-readonly': {
        secrets: { baseUrl: 'GROWTHZONE_BASE_URL', clientId: 'GROWTHZONE_CLIENT_ID', clientSecret: 'GROWTHZONE_CLIENT_SECRET', refreshToken: 'GROWTHZONE_REFRESH_TOKEN' },
        run: growthzoneReadonly, writes: false,
    },
    // PropFuel structure-only discovery (spec-less connector) — GET list + GET download window;
    // returns nested schema + identity/update/delete signal, NO record values. NEVER ack. writes:false.
    'propfuel-discover': { secrets: { token: 'PROPFUEL_TOKEN' }, run: propfuelDiscover, writes: false },
    // PropFuel lifecycle proof — observe answered_at/deleted_at populated + id recurrence. writes:false.
    'propfuel-lifecycle': { secrets: { token: 'PROPFUEL_TOKEN' }, run: propfuelLifecycle, writes: false },
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
