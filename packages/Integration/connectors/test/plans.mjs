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
        // Resolve the setup IDs (IntegrationID by name; Company/CredType from cfg).
        const ids = await resolveSetupIds(db, { ...cfg, integrationID: cfg.integrationID, platform: cfg.platform });
        const integrationID = ids.integrationID || await db.resolveId(
            cfg.platform === 'postgresql'
                ? `SELECT "ID" FROM "${cfg.mjSchema}"."Integration" WHERE "Name" = $1 LIMIT 1`
                : `SELECT TOP 1 ID FROM [${cfg.mjSchema}].[Integration] WHERE Name = @n`,
            cfg.platform === 'postgresql' ? [cfg.integrationName] : { n: cfg.integrationName });
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
        if (cfg.companyIntegrationID) {
            ciid = cfg.companyIntegrationID; // reference mode (pre-seeded; live or a prepared mock connection)
        } else {
            const credentialValues = cfg.mode === 'mock'
                ? { ...(mock.manifest?.Configuration ?? {}), ...(mock.configPatch ?? {}) } // dummy + mock redirect
                : { apiKey: values.token };
            const configuration = cfg.mode === 'mock'
                ? { ...(mock.manifest?.Configuration ?? {}), ...(mock.configPatch ?? {}) }
                : undefined;
            const created = await createConnectionWithConfig(gql, setupIds, {
                credentialName: `e2e-${cfg.connector}-${cfg.runId}`,
                credentialValues, configuration,
            });
            ciid = created.ciid; credentialID = created.credentialID;
        }

        const fullCfg = {
            ...cfg,
            companyIntegrationID: ciid,
            objects,
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

export const PLANS = {
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
