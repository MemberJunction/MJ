// wildapricot.workflow.js — per-vendor build workflow (planner emission)
//
// Vendor: Wild Apricot (membership management / AMS for associations, nonprofits, clubs — contacts,
//         membership levels, events, invoices/payments, donations). Standalone REST API (NOT a
//         Salesforce/Dynamics derivative).
// Shape:  REST + private-docs (no public OpenAPI/Swagger document is published — the API is documented
//         as HTML reference pages + a public Postman collection / Apidog mirror). Treat as REST+JSON.
//         Auth:  OAuth 2.0 client_credentials grant where the admin API Key is the Basic-auth USERNAME
//                (empty password) on the token endpoint https://oauth.wildapricot.org/auth/token, which
//                returns a bearer access_token used as `Authorization: Bearer <token>` on every API call.
//                (Wild Apricot also documents an authorization_code flow for multi-tenant apps; for a
//                single admin connection the API-Key client_credentials path is the in-scope flow.)
//         Base URL: https://api.wildapricot.org/v2.x (account-scoped paths under
//                /v2.x/accounts/{accountId}/...; the account id is discovered via GET /v2/accounts).
//         Pagination: list endpoints support $top/$skip (OData-style); Contacts list is ASYNC (returns
//                a ResultId you poll). Note the $-prefixed param form — a skip-vs-$skip mistake silently
//                caps every object at one page (the GrowthZone class of defect) → the RealityProbe + T-mock
//                tiers must confirm the param form.
//         Incremental: not a uniform updated-since across all objects; Contacts support a filter
//                ($filter on 'Profile last updated'/Status), audit log is time-ranged. Per-object
//                watermark must be READ from the docs, never assumed — many objects are full-refresh only.
//         Object families: Accounts, Contacts (+ContactFields / custom fields via FieldValues),
//                MembershipLevels, MemberGroups, Bundles, Events, EventRegistrations, EventRegistration
//                Types/Fields, Invoices, Payments, Refunds, Donations (+DonationFields), SavedSearches,
//                AuditLogEntries, Tenants, Picture/Documents, Webhooks (management). Webhook DELIVERY is
//                a near-real-time signal, not a sync stream → out of scope (model management only).
//         Rate limit: documented baseline ~ requests-per-minute per account + 429 with Retry-After.
//                Capture exact numbers from docs → BatchMaxRequestCount/BatchRequestWaitTime; leave null
//                if undocumented (provable-only).
//
// Run mode: [B] NO CREDENTIAL. credentialReference=null → HybridE2E runs MOCK; RealityProbe runs the
//           DEGRADED unauthenticated status/header probe (401/403=path real & OAuth-gated, 404=wrong path,
//           405=wrong verb), header introspection (WWW-Authenticate, X-RateLimit-*, Retry-After) and
//           pagination/$filter param-existence checks against the docs/Postman collection. The full
//           non-live suite still runs to its applicable extent: contract/shape validation vs the docs +
//           Postman collection, mock-server-from-collection (Prism/Mockoon/WireMock), Postman-collection
//           replay, recorded-example field-mapping checks, endpoint/header probing, bijective completeness.
//           maxTier=T8 RECORDS the non-live ceiling (format-verified-no-creds); it never restricts which
//           non-live techniques run. The live read-only rung (T8-live) is NOT run.
//
// Mode = REDO (new build over a DEPRECATED pre-Phase-0 prior):
//   - Prior connector packages/Integration/connectors/src/WildApricotConnector.ts (+ its test) is being
//     DEPRECATED. It baked a STATIC object/field catalog (WILD_APRICOT_OBJECTS) directly in code — the
//     exact catalog-in-code anti-pattern Phase 0 forbids — so this redo RE-DERIVES the full schema from
//     credential-free public docs/Postman (never from the prior connector, which is OUTPUT, not a source).
//   - The prior was seeded into the target DB via baseline migrations + a Metadata_Sync migration, so the
//     DB almost certainly carries a `Wild Apricot` Integration row + its IO/IOF. Per
//     .claude/rules/metadata-file-conventions.md ("Rebuilding a connector that was ALREADY seeded — delete
//     the prior metadata first"), this plan inserts a ReseedDelete stage (top-level deleteRecord markers,
//     --delete-db-only) BEFORE the test/reseed push. There is NO metadata/integrations/wildapricot/ file
//     yet (Phase-0 location) — the redo authors it fresh via the mj-metadata MCP.
//   - Version record for the SuperCoordinatorReport: { mode:'redo', priorVersion:'0.x (pre-Phase-0,
//     baked-catalog)', newVersion:'1.0.0' (MAJOR bump — re-derived schema is a breaking change), bumpReason }.
//
// This file customizes _TEMPLATE.workflow.js. Locked-primitive signatures preserved; both amendment loops
// (extract: MAX_AMENDMENT_ROUNDS=2; codebuild: MAX_CODE_BUILD_ROUNDS=2) implemented with the documented
// escalation/deadlock exits; bijection floor-check + freeze gate intact; progress via IntegrationProgressEmitter.

export const meta = {
    name: 'wildapricot-build',
    description: 'Workshop dynamic-workflow REDO build for Wild Apricot (REST+private-docs, OAuth2 client_credentials API-key-as-Basic-username). Deprecates + reseed-deletes the pre-Phase-0 baked-catalog connector, re-derives schema from credential-free docs/Postman. Locked primitives + bijection floor-check. NO-CREDENTIAL run (format-verified-no-creds ceiling).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'DeprecationRecord', detail: 'REDO: record { mode:redo, priorVersion, newVersion (MAJOR bump), bumpReason } + inventory the prior baked-catalog connector/test as deprecated. Re-derive truth from docs, never from the prior OUTPUT.' },
        { title: 'BrandResearch', detail: 'Resolve Wild Apricot identity + FULL API nature INDEPENDENTLY of the prior connector (object families, OAuth2 client_credentials API-key-as-Basic-username, read+write CRUD, $top/$skip + async Contacts pagination, per-object incremental signal, rate limits, webhooks). WriteCapability + custom-field findings BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (ClassName=WildApricotConnector, Name="Wild Apricot"); resolve CredentialTypeID match-or-create for the { ApiKey, AccountId?, ApiVersion? } OAuth-API-key credential shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: Wild Apricot REST API HTML reference (Tier-1) + public Postman collection / Apidog mirror (Tier-2). Build SOURCE_STUDY; emit TaxonomyLeaves = the in-scope object universe ENUMERATED BY SCRIPT over the docs/collection (never eyeballed, never copied from the prior baked catalog). Webhook delivery + authorization_code multi-tenant flow recorded out-of-scope.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (base URL https://api.wildapricot.org/v2.x, token URL, rate limit, account-id discovery note, OutOfScopeObjectFamilies [webhook delivery, authorization_code app flow] + reason).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the docs/Postman (verify + write-back). Model Accounts/Contacts(+ContactFields/custom FieldValues)/MembershipLevels/MemberGroups/Bundles/Events/EventRegistrations(+Types/Fields)/Invoices/Payments/Refunds/Donations(+DonationFields)/SavedSearches/AuditLogEntries/Webhooks(management). $top/$skip pagination (Offset); async Contacts modeled with its poll Configuration; per-object watermark READ from docs ($filter where documented, else full-refresh); per-operation CRUD columns from documented POST/PUT/DELETE. PK READ from docs (Id field per object); FK from documented linkage (Payments/Invoices→Contact; EventRegistrations→Event+Contact) — never guessed.' },
        { title: 'IndependentReview', detail: 'ONE round (slim, model=sonnet, different from planner): count-reconcile script + ~15-field sample. coverage-vs-script / bijection / capability-honesty / naming / regression-diff vs prior baked catalog (confirm removed objects/columns are INTENTIONAL breaking changes). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): read-only VERDICTS on declared claims. NO CREDENTIAL → degraded unauth probe (401/403=path real & OAuth-gated, 404=wrong, 405=wrong verb), header introspection (WWW-Authenticate, X-RateLimit-*, Retry-After), $top/$skip + $filter param existence vs docs. NEVER authors metadata (verdicts in, authorship out).' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections sourced from docs/Postman, confirmed by re-probe). Reality outranks the frozen contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'ReseedDelete', detail: 'REDO: delete the prior DB-seeded `Wild Apricot` IO/IOF before reseed (top-level deleteRecord markers, --delete-db-only, scoped push) per metadata-file-conventions "Rebuilding a connector that was ALREADY seeded". Non-blocking if no DB reachable (deferred to deploy-time forward-fix migration).' },
        { title: 'CodeBuild', detail: 'WildApricotConnector extends BaseRESTIntegrationConnector. OAuth2 client_credentials via auth-helpers (OAuth2TokenManager + Basic-auth API-key-as-username header, NEVER inline base64/crypto); generic per-operation CRUD; async-Contacts poll override (idiosyncratic, documented); account-id discovery in TestConnection; NO baked catalog (discovery MECHANISM only, catalog lives in metadata). Tests + docs/Postman-derived fixtures (PII-scrubbed, provenance-tagged).' },
        { title: 'VerificationLadder', detail: 'T0..T8 + two-pass volatile-field idempotency rung. T7 OpenAPI validation N/A (no published spec) → relies on Postman-collection contract replay + mock-server-from-collection. T8 failure-mode injection covers 401/403/404/409/422/429(Retry-After)/500/timeout + async-poll-timeout.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. NO CREDENTIAL → MOCK mode (mock floor is credential-free; mock server from the Postman collection). Env per HYBRID_E2E_ENV_RUNBOOK.md — Docker daemon is the only assumption.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest format-verified-no-creds ceiling.' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into the MemberJunction/Integrations repo as a standalone Open App: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + validate-invariants four-way gate. Default-ON, operator-bypassable via publishOpenApp=false. Runs ONLY after FloorCheck passes; a failed seed step from no-DB is non-blocking. Category = brand.Category (likely AMS).' },
    ],
};

// Normalize args FIRST (the model→Workflow path delivers a JSON string; without this runID etc. default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'wildapricot';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const CLASS_NAME = 'WildApricotConnector';
const INTEGRATION_NAME = 'Wild Apricot';
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// ── Resilient handoff (sandbox-safe — NO imports; uses the runtime globals agent/log only) ──
// A TRANSPORT blip on an agent() handoff (e.g. "Connection closed mid-response") must NOT discard a
// hard-won correct result or abort a long build. Wrap expensive handoffs so a transient throw retries;
// a real stage failure (schema-invalid result) is RETURNED by the agent, not thrown, so it routes to the
// amendment loop and is NOT retried here. RESUME-SAFE: the inner agent(PROMPT, OPTS) args are byte-identical,
// so the Workflow resume still cache-hits on (prompt, opts); only failed/new calls re-run.
async function withRetry(thunk, label, tries = 3) {
    let lastErr;
    for (let i = 1; i <= tries; i++) {
        try { return await thunk(); }
        catch (e) {
            lastErr = e;
            const msg = String(e?.message ?? e);
            const transient = /ECONN|ETIMEDOUT|socket hang up|connection closed|network|fetch failed|429|502|503|504|overloaded|rate.?limit/i.test(msg);
            if (!transient || i === tries) throw e;
            log(`withRetry[${label}] transport blip (attempt ${i}/${tries}): ${msg.slice(0, 160)} — backing off`);
            await Promise.resolve();
        }
    }
    throw lastErr;
}
// Open App publish target (v2): the connector is built + verified in THIS MJ sandbox, then the verified
// DELIVERABLE is assembled into the MemberJunction/Integrations repo as a standalone Open App (build
// MACHINERY stays here in MJ; the connector PACKAGE goes there). See the OpenAppPublish stage at the end.
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON; set publishOpenApp=false to stop after sandbox verify

// REDO version record (for the SuperCoordinatorReport).
const REDO = {
    mode: 'redo',
    priorVersion: '0.x (pre-Phase-0, baked static catalog in WildApricotConnector.ts)',
    newVersion: '1.0.0',
    bumpReason: 'MAJOR bump: schema re-derived from credential-free docs/Postman under the Phase-0 workshop (provable-only, bijection-gated). The prior connector baked a hand-authored object/field catalog directly in code (catalog-in-code anti-pattern); re-derivation may add/remove/rename objects and columns vs the prior baked set — a breaking change to the published metadata, requiring a major version + reseed-delete of the prior DB-seeded IO/IOF.',
};

// NO-CREDENTIAL run: e2eTier records the non-live ceiling (T8); it does NOT restrict non-live techniques.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};

// ── Progress narration shim (runtime log() only — NO imports; sandboxed context) ──
const emitter = {
    runStart: (m) => log(`[run] ${m}`),
    stageStart: (s, m) => log(`[${s}] ${m}`),
    stageComplete: (s, c) => log(`[${s}] complete ${JSON.stringify(c ?? {})}`),
    heartbeat: (s, m) => log(`[${s}] ${m}`),
    checkpoint: (s, st) => log(`[${s}] checkpoint ${JSON.stringify(st ?? {})}`),
    emit: (e, d) => log(`[${d?.stage ?? e}] ${d?.message ?? ''}`),
    fail: (m, code) => log(`[FAIL:${code}] ${m}`),
    complete: (m) => log(`[COMPLETE] ${m}`),
    flush: () => {},
};
emitter.runStart(`Build ${INTEGRATION_NAME} (REDO ${REDO.priorVersion} → ${REDO.newVersion}) — maxTier ${MANIFEST.e2eTier} (NO-CREDENTIAL)`);

// ── EnvPreflight (S0 — v2 P7; ARCHITECTURE_REFACTOR.md) ──────────────
phase('EnvPreflight');
emitter.stageStart('EnvPreflight', 'Gate the environment before any build stage burns tokens.');
const ENV_PREFLIGHT_SCHEMA = {
    type: 'object', required: ['ok'],
    properties: {
        ok: { type: 'boolean' },
        dbReachable: { type: 'boolean' },
        migrationLevel: { type: 'string' },
        mjapiBootable: { type: 'boolean' },
        generatedTreeClean: { type: 'boolean' },
        staleNestedDists: { type: 'array' },
        turboDistFresh: { type: 'boolean' },
        resolved: { type: 'boolean' },
        notes: { type: 'array' },
    },
};
const envPreflight = await withRetry(() => agent(
    `EnvPreflight (S0) for the ${INTEGRATION_NAME} build — DETERMINISTIC FINDER (P9: you RUN the script; you never eyeball-check).\n` +
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook first.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — the build must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
), 'env:preflight')
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    await emitter.fail(`EnvPreflight failed (unresolved): ${(envPreflight.notes ?? []).join('; ')}`, 'env-preflight-failed');
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight, redo: REDO };
}
emitter.stageComplete('EnvPreflight', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });

// ── DeprecationRecord (REDO — inventory the deprecated prior; truth re-derived from docs) ──
phase('DeprecationRecord');
emitter.stageStart('DeprecationRecord', `Record the redo version bump + inventory the deprecated pre-Phase-0 connector.`);
const DEPRECATION_SCHEMA = {
    type: 'object', required: ['acknowledged'],
    properties: {
        acknowledged: { type: 'boolean' },
        priorConnectorExists: { type: 'boolean' },
        priorConnectorPath: { type: ['string', 'null'] },
        priorTestPath: { type: ['string', 'null'] },
        priorBakedObjectNames: { type: 'array', items: { type: 'string' } }, // INVENTORY ONLY (not a source) — feeds the reviewer's regression-diff
        priorIntegrationNameInDB: { type: ['string', 'null'] },
        notes: { type: 'array' },
    },
};
const deprecation = await withRetry(() => agent(
    `REDO deprecation record for ${INTEGRATION_NAME}. The pre-Phase-0 connector at packages/Integration/connectors/src/${CLASS_NAME}.ts (+ its __tests__/${CLASS_NAME}.test.ts) is being DEPRECATED — it baked a static object/field catalog (const WILD_APRICOT_OBJECTS) in code, the catalog-in-code anti-pattern Phase 0 forbids.\n` +
    `Do EXACTLY this and return the schema:\n` +
    `1. test -f packages/Integration/connectors/src/${CLASS_NAME}.ts → priorConnectorExists/priorConnectorPath; same for the test file.\n` +
    `2. INVENTORY ONLY (NOT a source of truth — for the reviewer's later regression-diff): grep the prior connector for the baked object Names (the 'Name:' entries in WILD_APRICOT_OBJECTS) and list them in priorBakedObjectNames. You are CATALOGUING what the deprecated build claimed, so the reviewer can confirm every later add/remove/rename is an INTENTIONAL breaking change. You will NOT re-derive schema from this — the real schema comes from the public docs in later stages.\n` +
    `3. Check whether a 'Wild Apricot' Integration row is referenced by any Metadata_Sync / baseline migration under migrations/ (grep, read-only) → priorIntegrationNameInDB.\n` +
    `HARD FENCE: the prior connector + any prior metadata are OUTPUT, never a source. They inform ONLY the deprecation inventory + the reseed-delete target — never the new schema. acknowledged=true confirms you understand this. Version record: ${JSON.stringify(REDO)}.`,
    { agentType: 'code-builder', schema: DEPRECATION_SCHEMA, phase: 'DeprecationRecord', label: 'redo:deprecation' }
), 'redo:deprecation')
log(`DeprecationRecord: priorConnector=${deprecation.priorConnectorExists} priorBakedObjects=${(deprecation.priorBakedObjectNames ?? []).length} dbName=${deprecation.priorIntegrationNameInDB ?? 'n/a'}`);
emitter.stageComplete('DeprecationRecord', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });

// ── BrandResearch ────────────────────────────────────────────────────
// Independent study establishes the FULL Wild Apricot API nature (object families, OAuth2
// client_credentials API-key-as-Basic-username, read+write CRUD, $top/$skip + async-Contacts pagination,
// per-object incremental, rate limits, webhooks) from public discovery — NOT capped by the prior baked
// connector. DETECT TENSION where the study and the prior catalog disagree and investigate.
phase('BrandResearch');
emitter.stageStart('BrandResearch', 'Independent study of the full Wild Apricot API nature.');
const BRAND_SCHEMA = {
    type: 'object', required: ['CanonicalName'],
    properties: {
        CanonicalName: { type: 'string' },
        Description: { type: 'string' },
        NavigationBaseURL: { type: ['string', 'null'] },
        IconClass: { type: ['string', 'null'] },
        Category: { type: ['string', 'null'] },   // Open App folder (AMS most likely)
        Disambiguation: { type: 'array' },
        Sources: { type: 'array', items: { type: 'string' } },
        ProductTaxonomy: { type: 'object' },
        WriteCapability: { type: ['object', 'null'] },   // BINDING (v2 P5): which objects document create/update/delete?
        CustomFieldModel: { type: ['object', 'null'] },  // BINDING: Contacts FieldValues / ContactFields custom fields
    },
};
const brand = await withRetry(() => agent(
    `Research vendor "${INTEGRATION_NAME}" (Wild Apricot) and establish its canonical identity AND FULL API nature INDEPENDENTLY of the deprecated prior connector (which is OUTPUT, not a source). Determine: object families (Accounts, Contacts + ContactFields/custom FieldValues, MembershipLevels, MemberGroups, Bundles, Events, EventRegistrations + Types/Fields, Invoices, Payments, Refunds, Donations + DonationFields, SavedSearches, AuditLogEntries, Webhooks); auth model (OAuth 2.0 client_credentials grant where the admin API Key is the Basic-auth username with empty password on https://oauth.wildapricot.org/auth/token, returning a bearer access_token — also note the authorization_code app flow as out-of-scope for a single admin connection); read AND write/CRUD capability per object; pagination ($top/$skip OData-style, plus the ASYNC Contacts list that returns a pollable ResultId); per-object incremental signal ($filter on Contacts, time-ranged audit log — NOT a uniform updated-since; many objects are full-refresh only); documented rate limits (requests/minute + 429 Retry-After); webhook model (management vs near-real-time delivery). WriteCapability + CustomFieldModel findings are BINDING. Resolve NavigationBaseURL + icon class + Category (likely AMS). Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
), 'brand')
emitter.stageComplete('BrandResearch', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });

// ── Identity ─────────────────────────────────────────────────────────
phase('Identity');
emitter.stageStart('Identity', 'Fill Integration row identity slots + resolve CredentialTypeID.');
const PHASE1_SCHEMA = {
    type: 'object', required: ['Status', 'Identity', 'ExistsInDB', 'Provenance'],
    properties: {
        Status: { enum: ['Complete', 'Conflict', 'NeedsHumanDisambiguation'] },
        Identity: { type: 'object' },
        ExistsInDB: { type: 'object' },
        Provenance: { type: 'array' },
    },
};
const identity = await agent(
    `Fill Integration row identity slots for "${brand.CanonicalName}" (Wild Apricot). Name MUST be exactly "${INTEGRATION_NAME}" (matches the existing DB row this redo replaces — three-way invariant). ClassName=${CLASS_NAME}; ImportPath per the connectors package convention. Read SOURCE_STUDY when ready. Resolve CredentialTypeID via MATCH-OR-CREATE against the connector ConnectionConfig key shape — Wild Apricot uses an OAuth2 client_credentials credential whose ONLY secret is the admin { ApiKey } (with optional non-secret { AccountId, ApiVersion }); match an existing api-key/OAuth { ApiKey } credential type or create one (NOT a username/password Basic type, NOT an OAuth authorization_code type). ExistsInDB SHOULD report the prior 'Wild Apricot' row (this is a redo); Status=Complete is expected (the redo intentionally reuses the same Name). Use the universalPK Configuration hint only when authoritatively documented (Wild Apricot Id fields).`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    await emitter.fail(`Identity stage produced ${identity.Status}`, 'identity-conflict');
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}
emitter.stageComplete('Identity', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });

// ── SourceAudit ──────────────────────────────────────────────────────
phase('SourceAudit');
emitter.stageStart('SourceAudit', 'Audit + rank credential-free sources; enumerate the object universe by script.');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        VendorDocsPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
        PostmanPaths: { type: 'array' },
        Gaps: { type: 'array' },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
    },
};
const sources = await withRetry(() => agent(
    `Audit + rank authoritative CREDENTIAL-FREE sources for ${brand.CanonicalName} (Wild Apricot). There is NO published OpenAPI/Swagger document — Tier-1 = the Wild Apricot REST API HTML reference (gethelp.wildapricot.com / api.wildapricot.org docs); Tier-2 = the public Wild Apricot Postman collection (and any Apidog/Postman-documenter mirror). Build SOURCE_STUDY.md with a COVERABLE-vs-INFORMATIONAL split. CRITICAL: emit TaxonomyLeaves = the leaves of the COVERABLE object taxonomy ENUMERATED BY A SCRIPT over the raw docs/Postman collection (resource list + endpoints), NEVER hand-listed and NEVER copied from the deprecated baked catalog (priorBakedObjectNames is for the reviewer's regression-diff only, not a source). Record webhook DELIVERY and the authorization_code multi-tenant app flow as INFORMATIONAL/out-of-scope. Set EnumerationStdoutCount to the script's reported object count. Populate VendorDocsPaths/PostmanPaths so the extractor's multi-source PK/FK detection can consult every credential-free source.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
), 'audit')
emitter.stageComplete('SourceAudit', { processed: (sources.TaxonomyLeaves ?? []).length, succeeded: (sources.TaxonomyLeaves ?? []).length, failed: 0, skipped: 0 });

// audit-source primitive re-ranks via the rubric — sources.SourcesFile is the input
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── MetadataWrite ────────────────────────────────────────────────────
phase('MetadataWrite');
emitter.stageStart('MetadataWrite', 'Populate Integration row non-identity slots + Configuration JSON.');
const METADATA_RESULT_SCHEMA = {
    type: 'object', required: ['FieldsPopulated'],
    properties: {
        FieldsPopulated: { type: 'integer' },
        FieldsDeferredAsGaps: { type: 'integer' },
        ProvenanceEntries: { type: 'integer' },
        ConfigurationJSONKeysUsed: { type: 'array', items: { type: 'string' } },
    },
};
const metadataResult = await agent(
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} (Wild Apricot). Base URL = the documented Wild Apricot REST API host + version (e.g. https://api.wildapricot.org/v2.x — account paths under /v2.x/accounts/{accountId}/). Capture: documented rate limits → BatchMaxRequestCount/BatchRequestWaitTime (leave null if undocumented — provable-only); the per-object incremental strategy ($filter on Contacts, time-ranged audit log; most objects full-refresh). Configuration JSON MUST record: tokenUrl=https://oauth.wildapricot.org/auth/token; the account-id discovery note (GET /v2/accounts when AccountId omitted); and OutOfScopeObjectFamilies = ["Webhook delivery (near-real-time signal, not a sync stream — model webhook management only)", "OAuth authorization_code multi-tenant app flow (single admin connection uses API-key client_credentials)"] with reasons. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER edit the file directly).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);
emitter.stageComplete('MetadataWrite', { processed: metadataResult.FieldsPopulated ?? 0, succeeded: metadataResult.FieldsPopulated ?? 0, failed: 0, skipped: metadataResult.FieldsDeferredAsGaps ?? 0 });

// ── Extract → Freeze → Review (amendment loop, MAX_AMENDMENT_ROUNDS=2 — converging, not deadlocked) ─────────
// Round 0 = initial extract+review; on a blocking gap one real amendment round (round 1) re-extracts
// with the reviewer's IO/IOF FixInstructions. The mechanical gates (0-field hard-fail, compute-source-diff,
// T1 invariants) catch most defects in-pass, so the cap is LOW per the planner token-efficiency rule.
const REVIEW_SCHEMA = {
    type: 'object', required: ['ConfirmedGapsBlocking'],
    properties: {
        ConfirmedGapsBlocking: { type: 'integer' },
        ConfirmedGapsAdvisory: { type: 'integer' },
        JudgmentCalls: { type: 'integer' },
        ReviewerErrors: { type: 'integer' },
        BijectionViolationsFound: { type: 'integer' },
        IndependentSourcesFetched: { type: 'integer' },
        ModelObserved: { type: 'string' },
        ReviewFile: { type: 'string' },
        FixInstructions: { type: 'array', items: { type: 'object' } },
        RegressionDiffConfirmed: { type: ['boolean', 'null'] }, // redo: removed objects/cols are intentional breaking changes
    },
};

const MAX_AMENDMENT_ROUNDS = 2;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;
let deferredConnectorFindings = [];

while (amendmentRound <= MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';
    if (isAmendment) emitter.emit('progress.heartbeat', { stage: phaseLabel, message: `amendment round ${amendmentRound}/${MAX_AMENDMENT_ROUNDS}: ${review.ConfirmedGapsBlocking} blocking gaps`, level: 'warn' });

    // ── slot-routing: integration.* → metadata-writer; connector.* → defer to CodeBuild; io/iof.* → extractor ──
    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const slotOf = (f) => String(f?.slot ?? '').toLowerCase();
    const isIntegrationRowSlot = (f) => slotOf(f).startsWith('integration.');
    const isConnectorSlot = (f) => slotOf(f).startsWith('connector.');
    const integrationRowFindings = allFindings.filter(isIntegrationRowSlot);
    const connectorFindings = allFindings.filter(isConnectorSlot);
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f) && !isConnectorSlot(f));
    if (connectorFindings.length > 0) {
        for (const cf of connectorFindings) {
            if (!deferredConnectorFindings.some((d) => (d?.slot ?? '') === (cf?.slot ?? ''))) deferredConnectorFindings.push(cf);
        }
        log(`Deferred ${connectorFindings.length} connector.* (code) fix(es) to CodeBuild (round ${amendmentRound}); the extractor cannot fix code gaps.`);
    }
    if (integrationRowFindings.length > 0) {
        phase(phaseLabel);
        await agent(
            `Apply these Integration-ROW FixInstructions surgically to the Integration row in ${METADATA_FILE} (root-level slots the IO/IOF extractor cannot touch — auth, base URL, pagination, batch limits, incremental watermark, error shape). Change ONLY the named slots; do NOT perturb IO/IOF rows. Fixes: ${JSON.stringify(integrationRowFindings)}. Return { applied } = number of slots changed.`,
            { agentType: 'metadata-writer', schema: { type: 'object', required: ['applied'], properties: { applied: { type: 'integer' } }, additionalProperties: true }, phase: phaseLabel, label: `amend-integration-row:r${amendmentRound}` }
        ).catch(() => null);
        log(`Routed ${integrationRowFindings.length} Integration-row fix(es) to metadata-writer (round ${amendmentRound}); ${ioIofFindings.length} IO/IOF fix(es) go to the extractor.`);
    }

    // ── Extract (round 0) or Re-extract with reviewer feedback (round 1) ──
    phase(phaseLabel);
    emitter.stageStart(phaseLabel, isAmendment ? `Re-extract IO/IOF with ${ioIofFindings.length} reviewer fix(es).` : 'Extract every in-scope IO/IOF from docs/Postman.');
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs (Gap 10). CREDENTIAL-FREE docs/Postman ONLY.
            // The prior connector/metadata are OUTPUT and FORBIDDEN as sources (catalog-in-code circular-source defect).
            sourceBundle: {
                excludePriorOutput: true,
                priorOutputPaths: [
                    `packages/Integration/connectors/src/${CLASS_NAME}.ts`,
                    METADATA_FILE,
                ],
                reason: 'REDO: the prior WildApricotConnector.ts baked a static catalog (WILD_APRICOT_OBJECTS); it is OUTPUT, never a source. Re-derive solely from credential-free docs/Postman.',
                openapiPath: null, // no published OpenAPI for Wild Apricot
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${extractStats.gapsRemaining?.length ?? 0} gaps`);
    emitter.stageComplete(phaseLabel, { processed: extractStats.objectsExtracted ?? 0, succeeded: extractStats.objectsExtracted ?? 0, failed: 0, skipped: extractStats.gapsRemaining?.length ?? 0 });

    // ── Freeze contract ────────────────────────────────────────────────
    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        {
            vendor: VENDOR,
            contract: extractStats,
            provenanceSidecar: {},
            outputDir: `${RUNS_DIR}/output`,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            amendmentRound,
        }
    );

    // ── Independent review (slim, model=sonnet — different model than planner) ──
    phase('IndependentReview');
    emitter.stageStart('IndependentReview', `Adversarial review (round ${amendmentRound}, slim count-reconcile + sample).`);
    review = await withRetry(() => agent(
        `Adversarial review of the ${VENDOR} (Wild Apricot) emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full docs/Postman into your context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the docs/Postman source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility, with focus on: per-object Id PK honesty; documented FK linkage (Payments/Invoices→Contact, EventRegistrations→Event+Contact, Donations→Contact); $top/$skip pagination param honesty (the $-prefixed form — a skip-vs-$skip mistake silently caps pages); async Contacts modeled with a poll Configuration (not a plain list); OAuth capability honesty (no Basic-username/password columns); singular/plural IO naming consistency. REDO REGRESSION-DIFF: compare the emitted object/column set against the deprecated baked catalog (priorBakedObjectNames=${JSON.stringify((deprecation.priorBakedObjectNames ?? []).slice(0, 60))}); set RegressionDiffConfirmed=true ONLY when every removed/renamed object or column is an INTENTIONAL, doc-justified breaking change (not an accidental coverage regression — an object that EXISTS in the docs but is missing from the emission is a Blocking gap, not an intentional removal). Any zero-field object, bijection violation, or un-justified coverage regression is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    ), 'review')
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations, regressionDiffConfirmed=${review.RegressionDiffConfirmed}`);
    emitter.stageComplete('IndependentReview', { processed: 1, succeeded: review.ConfirmedGapsBlocking === 0 ? 1 : 0, failed: review.ConfirmedGapsBlocking, skipped: 0 });

    // ── Loop exit conditions ──────────────────────────────────────────
    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        break;
    }

    // If the ONLY remaining blocking gaps are connector.* (code) slots, defer to CodeBuild and exit the extract loop.
    const blockingFixes = review.FixInstructions ?? [];
    if (blockingFixes.length > 0 && blockingFixes.every(isConnectorSlot)) {
        log(`Amendment loop: all ${review.ConfirmedGapsBlocking} blocking gap(s) are connector.* (code) → deferring ${deferredConnectorFindings.length} to CodeBuild, exiting extract loop`);
        break;
    }

    // Convergence check: byte-identical reviewer fingerprint = producer can't fix what reviewer wants.
    const reviewFingerprint = JSON.stringify({
        blocking: review.ConfirmedGapsBlocking,
        violations: review.BijectionViolationsFound ?? 0,
        fixes: (review.FixInstructions ?? []).map(f => f?.slot ?? '').sort(),
    });
    if (previousReviewFingerprint === reviewFingerprint) {
        log(`Amendment loop deadlock at round ${amendmentRound}: reviewer findings byte-identical to prior round → escalate`);
        await emitter.fail(`Producer+reviewer deadlocked after ${amendmentRound + 1} rounds; ${review.ConfirmedGapsBlocking} blocking gaps. Evidence: ${review.ReviewFile}`, 'escalated-deadlock');
        return {
            runID: A?.runID, vendor: VENDOR, redo: REDO,
            brand, identity, sources, metadataResult, extractStats, frozen, review, deprecation,
            amendmentRound,
            status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved.`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

if (review.ConfirmedGapsBlocking > 0 && amendmentRound > MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    await emitter.fail(`Extract amendment hit ${MAX_AMENDMENT_ROUNDS}-round cap; ${review.ConfirmedGapsBlocking} blocking gaps. Human review: ${review.ReviewFile}`, 'escalated-max-rounds');
    return {
        runID: A?.runID, vendor: VENDOR, redo: REDO,
        brand, identity, sources, metadataResult, extractStats, frozen, review, deprecation,
        amendmentRound,
        status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate — manifest.sourceDiffMustClose) ────
phase('SourceDiff');
let sourceDiff = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
    { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
);
log(`SourceDiff: ${sourceDiff.missing.length} missing, ${sourceDiff.orphan.length} orphan (universe=${sourceDiff.universeCount}, extracted=${sourceDiff.extractedCount})`);

if (sourceDiff.missing.length > 0) {
    phase('GapFill');
    await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/gap-fill-fork.workflow.js' },
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { vendorDocsPaths: sources.VendorDocsPaths ?? [], postmanPaths: sources.PostmanPaths ?? [] }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
    );
    const recovered = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        { vendor: VENDOR, sourceID: sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output`, runID: A?.runID, adversarialN: MANIFEST.adversarialVerifyMinReviewers }
    );
    extractStats.extractedObjects = [...(extractStats.extractedObjects ?? []), ...(recovered.extractedObjects ?? [])];
    extractStats.fieldsExtracted = (extractStats.fieldsExtracted ?? 0) + (recovered.fieldsExtracted ?? 0);
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── RealityProbe (S7 — v2 P2, EMPIRICAL) ─────────────────────────────
// Read-only VERDICTS on declared claims BEFORE code is built on them. NO CREDENTIAL → degraded
// unauthenticated per-claim status probe (200=public, 401/403=path real & OAuth-gated [content
// UNVERIFIED], 404=wrong path, 405=wrong verb) + header introspection (WWW-Authenticate, X-RateLimit-*,
// Retry-After) + $top/$skip + $filter param existence vs the docs/Postman. VERDICTS IN, AUTHORSHIP OUT.
phase('RealityProbe');
emitter.stageStart('RealityProbe', 'Read-only verdicts on declared claims (degraded unauth probe — no credential).');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },
        verdicts: { type: 'array' },
        metadataSha256: { type: 'string' },
        claims: { type: 'integer' },
        confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' },
        achievedCeiling: { type: 'string' },
        capturedPages: { type: 'array' },
        metadataDelta: { type: 'boolean' },
        rateHeaders: { type: 'object' },
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await withRetry(() => agent(
    `RealityProbe (S7) for ${VENDOR} (Wild Apricot). READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, or the scheme+host of an APIPath — expected the Wild Apricot API host https://api.wildapricot.org).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real & OAuth-gated, content UNVERIFIED], 404=wrong path, 405=wrong verb; plus header introspection [WWW-Authenticate, X-RateLimit-*, Retry-After] and $top/$skip/$filter param-existence checks against the docs/Postman).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
), 'probe:verdicts')
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);
emitter.stageComplete('RealityProbe', { processed: (realityProbe.verdicts ?? []).length, succeeded: (realityProbe.confirmed ?? 0) + (realityProbe.gatedExists ?? 0), failed: probeWrong.length, skipped: 0 });

// ── ProbeAmend (S8 — ONE mandatory round when claims falsified; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    emitter.stageStart('ProbeAmend', `Correct ${probeWrong.length} probe-falsified claim(s) from docs, confirmed by re-probe.`);
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR} (Wild Apricot): ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS/POSTMAN (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. the corrected /v2.x path, the $-prefixed param form [$top/$skip/$filter], the async-Contacts poll shape, demote a null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    const stillWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length;
    log(`ProbeAmend: ${stillWrong} still unresolved`);
    emitter.stageComplete('ProbeAmend', { processed: probeWrong.length, succeeded: probeWrong.length - stillWrong, failed: stillWrong, skipped: 0 });
}

// ── ReseedDelete (REDO — delete the prior DB-seeded IO/IOF before reseed push) ──
// Per metadata-file-conventions "Rebuilding a connector that was ALREADY seeded": a plain mj sync push
// is upsert-by-primaryKey with NO prune, so stale baseline-seeded IO/IOF collide on UQ_IntegrationObject_Name
// and re-upsert of an existing same-name IO rolls back the transaction. Express the deletions as TOP-LEVEL
// deleteRecord markers (nested deletes under relatedEntities are silently skipped) with --delete-db-only,
// scoped to this vendor. Non-blocking when no DB is reachable (durable fix = a forward-fix migration).
phase('ReseedDelete');
emitter.stageStart('ReseedDelete', 'Delete prior DB-seeded Wild Apricot IO/IOF before reseed (redo).');
const RESEED_SCHEMA = {
    type: 'object', required: ['ran'],
    properties: {
        ran: { type: 'boolean' },
        dbReachable: { type: 'boolean' },
        priorIntegrationFound: { type: 'boolean' },
        priorIOCount: { type: 'integer' },
        priorIOFCount: { type: 'integer' },
        deletedIO: { type: 'integer' },
        deletedIOF: { type: 'integer' },
        deferredToMigration: { type: 'boolean' },
        notes: { type: 'array' },
    },
};
const reseedDelete = await withRetry(() => agent(
    `ReseedDelete (REDO) for ${INTEGRATION_NAME}. The prior connector was seeded into the target DB via baseline + Metadata_Sync migrations, so a 'Wild Apricot' Integration row + its IO/IOF almost certainly exist. Per .claude/rules/metadata-file-conventions.md ("Rebuilding a connector that was ALREADY seeded — delete the prior metadata first"):\n` +
    `1. Detect: if envPreflight.dbReachable (=${envPreflight.dbReachable}), query the DB for the existing 'Wild Apricot' Integration + its IO/IOF; fill priorIntegrationFound/priorIOCount/priorIOFCount. If the DB is NOT reachable, set dbReachable=false, deferredToMigration=true and STOP (the durable fix is a deploy-time forward-fix migration — note it; do NOT fail the build).\n` +
    `2. Determine the STALE delete set = prior IO/IOF whose Name is absent from the freshly re-derived ${METADATA_FILE}. (Rows whose corrected form already exists in the new metadata are left to stand — re-upserting them would hit UQ_IntegrationObject_Name and roll back.)\n` +
    `3. Build a SCOPED, isolated temp delete push: each stale row as a TOP-LEVEL deleteRecord ({ "deleteRecord": { "delete": true }, "primaryKey": { "ID": "..." } }) in its own entity dir ('MJ: Integration Objects' / 'MJ: Integration Object Fields') — NOT nested under the Integration (nested deletes are silently skipped). Run mj sync push with --delete-db-only (sweeps DB-only IOF dependents; reverse-topo-orders IOF before IO). Scope to this vendor only (temp dir / --include) so no other vendor's deleteRecord markers are dragged in.\n` +
    `4. Report deletedIO/deletedIOF. Use the deleteRecord feature + mj sync push, NEVER hand-SQL (hand-SQL is not reproducible and doesn't reach production). Production durability: also note that a forward-fix migration performing the same deletes is required for fresh installs.`,
    { agentType: 'code-builder', schema: RESEED_SCHEMA, phase: 'ReseedDelete', label: 'redo:reseed-delete' }
), 'redo:reseed-delete')
log(`ReseedDelete: dbReachable=${reseedDelete.dbReachable} priorIO=${reseedDelete.priorIOCount ?? 0} deletedIO=${reseedDelete.deletedIO ?? 0} deletedIOF=${reseedDelete.deletedIOF ?? 0} deferredToMigration=${reseedDelete.deferredToMigration}`);
emitter.stageComplete('ReseedDelete', { processed: (reseedDelete.priorIOCount ?? 0) + (reseedDelete.priorIOFCount ?? 0), succeeded: (reseedDelete.deletedIO ?? 0) + (reseedDelete.deletedIOF ?? 0), failed: 0, skipped: reseedDelete.deferredToMigration ? 1 : 0 });

// ── CodeBuild + ladder amendment loop (MAX_CODE_BUILD_ROUNDS=2 — token-efficiency) ────────────────
// Round 0 = initial build + ladder; on a fixable red rung one amendment round (round 1) re-builds with
// the classified failure fed back. Cap is LOW per the planner token-efficiency rule.
const CODE_RESULT_SCHEMA = {
    type: 'object', required: ['BuildClean'],
    properties: {
        BuildClean: { type: 'boolean' },
        LinesOfCode: { type: 'integer' },
        TestsWritten: { type: 'integer' },
        GenericCRUDUsedForIOCount: { type: 'integer' },
        OverriddenCRUDForIOCount: { type: 'integer' },
        ConnectorFile: { type: 'string' },
        TestFile: { type: 'string' },
        BuildErrors: { type: 'array' },
        RemainingGaps: { type: 'array' },
    },
};

const MAX_CODE_BUILD_ROUNDS = 2;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    if (isAmendment) emitter.emit('progress.heartbeat', { stage: `CodeBuildRound${codeRound}`, message: `code amendment round ${codeRound}/${MAX_CODE_BUILD_ROUNDS}`, level: 'warn' });
    else emitter.stageStart('CodeBuild', 'Build WildApricotConnector (OAuth2 client_credentials, generic CRUD, async-Contacts override, no baked catalog).');
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} (Wild Apricot) connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the connector class for ${brand.CanonicalName} (Wild Apricot) from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector; @RegisterClass(BaseIntegrationConnector, '${CLASS_NAME}'); public IntegrationName getter returns exactly "${INTEGRATION_NAME}". Auth = OAuth 2.0 client_credentials: POST to https://oauth.wildapricot.org/auth/token with the admin API Key as the Basic-auth USERNAME (empty password) + grant_type=client_credentials&scope=auto, cache the bearer access_token + expiry, send Authorization: Bearer <token> on API calls — build BOTH the token-endpoint Basic header AND the bearer header via the shared auth-helpers (OAuth2TokenManager + APIKeyHeaderBuilder), NEVER inline base64/crypto. In TestConnection, auto-discover the Account ID via GET /v2/accounts when AccountId is omitted. Use generic per-operation BaseRESTIntegrationConnector CRUD ($top/$skip Offset pagination); OVERRIDE only the genuinely idiosyncratic Contacts list (ASYNC: POST/GET returns a ResultId you poll until ResultId resolves — document the override + poll-timeout). DO NOT bake an object/field catalog in code (the deprecated connector's WILD_APRICOT_OBJECTS anti-pattern) — the catalog lives in the metadata file; DiscoverObjects/DiscoverFields express the discovery MECHANISM only (or stub to the Declared metadata). Route every create through BuildCreatedResult (fail loudly on empty ID). Full-record pass-through (Fields=raw). ${deferredConnectorFindings.length ? `The extract-review loop deferred these connector.* (code) fixes — address each: ${JSON.stringify(deferredConnectorFindings)}. ` : ''}Write tests + fixtures derived from the docs/Postman examples, PII-scrubbed via scrub-fixture, PROVENANCE-tagged. Also delete/deprecate the prior test file ${deprecation.priorTestPath ?? `packages/Integration/connectors/src/__tests__/${CLASS_NAME}.test.ts`} contents that asserted the baked catalog — replace with the re-derived tests (keep green by being RIGHT, never by preserving wrong behavior).`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ), 'code:build')
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? `packages/Integration/connectors/src/${CLASS_NAME}.ts`;
    if (codeResult.BuildClean) {
        const fileCheck = await agent(
            `Run exactly: test -f ${CONNECTOR_FILE} && echo CONNECTOR_FILE_EXISTS || echo CONNECTOR_FILE_MISSING. Return whether the connector source file exists at ${CONNECTOR_FILE}.`,
            { agentType: 'code-builder', schema: { type: 'object', required: ['Exists'], properties: { Exists: { type: 'boolean' }, Path: { type: 'string' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `verify-file:r${codeRound}` }
        );
        if (!fileCheck.Exists) {
            log(`CodeBuild round ${codeRound}: BuildClean reported but connector file missing at ${CONNECTOR_FILE} → forcing non-clean`);
            codeResult.BuildClean = false;
            codeResult.BuildErrors = [...(codeResult.BuildErrors ?? []), { code: 'CONNECTOR_FILE_MISSING', locus: CONNECTOR_FILE }];
        }
    }

    if (!codeResult.BuildClean) {
        codeRound++;
        continue;
    }

    // ── Ensure the connector is registered in connectors/src/index.ts ────
    await agent(
        `Ensure the connector ${CLASS_NAME} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${CLASS_NAME}, append the line:\n  export { ${CLASS_NAME} } from './${CLASS_NAME}.js';\nIf an export for that class already exists (it likely does — this is a redo over the prior connector), make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // ── Rebuild the extraction matrix from persisted metadata with the current floor builder ──
    await agent(
        `Regenerate the extraction matrix from the persisted metadata using the current floor builder (credits metadata-provable id-convention PK source-backing — prevents T1 PkSourceMatrix false-flagging legit Id PKs as fabrication). Run EXACTLY:\n` +
        `  node packages/Integration/connector-builder-workshop/floor/build-matrix-from-metadata.mjs ${METADATA_FILE} ${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv ${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv.rich.csv\n` +
        `Return { regenerated: true, totalIOs } parsed from the script's JSON stdout.`,
        { schema: { type: 'object', required: ['regenerated'], properties: { regenerated: { type: 'boolean' }, totalIOs: { type: 'integer' } }, additionalProperties: true }, model: 'haiku', phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `matrix-rebuild:r${codeRound}` }
    );

    // ── Stage artifacts into the registry dir where mj-test-runner looks ──
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${CLASS_NAME}.ts" ${REGISTRY_DIR}/src/${CLASS_NAME}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${CLASS_NAME}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    // Build clean — run the ladder
    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    emitter.stageStart(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', `Run T0..${MANIFEST.e2eTier} (credential-free).`);
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            // registry SLUG, not ClassName (Finding A — ClassName≠slug deadlocks T1's name resolution).
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,
            maxTier: MANIFEST.e2eTier,
        }
    );
    const hasRed = (ladder?.tierResults ?? []).some(r => r?.status === 'red');
    emitter.stageComplete(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', { processed: (ladder?.tierResults ?? []).length, succeeded: (ladder?.tierResults ?? []).filter(r => r?.status !== 'red').length, failed: (ladder?.tierResults ?? []).filter(r => r?.status === 'red').length, skipped: 0 });

    if (!hasRed) {
        log(`Code+Ladder converged at round ${codeRound} (build clean + ladder achieved ${ladder?.achievedTier ?? '?'})`);
        break;
    }

    const codeFingerprint = JSON.stringify({
        clean: codeResult.BuildClean,
        ladderRed: (ladder?.classifiedFailures ?? []).map(f => `${f?.tier}:${f?.code}:${f?.locus}`).sort(),
    });
    if (previousCodeFingerprint === codeFingerprint) {
        log(`Code+Ladder deadlock at round ${codeRound}: identical failures to prior round → escalate`);
        await emitter.fail(`Code+ladder deadlocked after ${codeRound + 1} rounds; identical failures recur. See classifiedFailures`, 'escalated-code-deadlock');
        return {
            runID: A?.runID, vendor: VENDOR, redo: REDO,
            brand, identity, sources, metadataResult, extractStats, frozen, review, deprecation, reseedDelete, codeResult, ladder,
            amendmentRound, codeRound,
            status: 'EscalatedCodeDeadlock',
            message: `Code-builder + verification-ladder deadlocked after ${codeRound + 1} attempts. Same failures recur.`,
        };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}

if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    await emitter.fail(`Code+ladder hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red. Human intervention required`, 'escalated-code-max-rounds');
    return {
        runID: A?.runID, vendor: VENDOR, redo: REDO,
        brand, identity, sources, metadataResult, extractStats, frozen, review, deprecation, reseedDelete, codeResult, ladder,
        amendmentRound, codeRound,
        status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, FRESH DB) ──
// REQUIRED on every build. NO CREDENTIAL → MOCK mode (the mock floor is credential-free; mock server
// from the Postman collection). Env bring-up fully scripted in HYBRID_E2E_ENV_RUNBOOK.md — Docker daemon
// up is the ONLY assumption. Runs on SQL Server (DB_PLATFORM=sqlserver); fresh-PG codegen is suspended.
phase('HybridE2E');
emitter.stageStart('HybridE2E', 'Deep §1→§7 e2e through MJAPI → SQL Server (MOCK — no credential).');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? INTEGRATION_NAME,
        // LIVE when creds reachable by EITHER an opaque credentialReference OR a read-only broker plan;
        // else MOCK. This NO-CREDENTIAL run → MOCK.
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);
emitter.stageComplete('HybridE2E', { processed: 1, succeeded: hybridE2E?.pass ? 1 : 0, failed: hybridE2E?.pass ? 0 : 1, skipped: 0 });

// ── FloorCheck (final gate) ──────────────────────────────────────────
phase('FloorCheck');
emitter.stageStart('FloorCheck', 'Bijection + manifest + v2 EMPIRICAL gates.');
const verdict = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        slotsPath: A?.slotsPath ?? 'packages/Integration/connector-builder-workshop/floor/phase0-slots.json',
        manifest: MANIFEST,
        hybridE2E,
        journal: {
            extractStats, sourceDiff, frozen, review, codeResult, ladder, hybridE2E,
            sources,
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null,
            // v2 EMPIRICAL-gate evidence:
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,
            brokerPlans: A?.brokerPlans ?? null,
            brand,
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
            // redo evidence:
            redo: REDO,
            reseedDelete,
            deprecation,
        },
    }
);
emitter.stageComplete('FloorCheck', { processed: 1, succeeded: verdict?.pass ? 1 : 0, failed: verdict?.pass ? 0 : 1, skipped: 0 });

if (verdict?.pass) {
    await emitter.complete(`${INTEGRATION_NAME} connector REDO built — floor-check pass (${REDO.priorVersion} → ${REDO.newVersion}, format-verified-no-creds)`);
} else {
    await emitter.fail(`FloorCheck did not pass — see verdict`, 'floor-check-failed');
}

// ── OpenAppPublish (v2 — assemble the verified connector into the Integrations repo as an Open App) ──
// Additive final stage: runs ONLY after FloorCheck passes (and unless the operator bypassed via
// publishOpenApp=false). Does NOT touch the sandbox build/verify flow above. publish-open-app.mjs scaffolds
// the Open App, copies the connector forcing the package-name @RegisterClass key, copies the metadata
// forcing ClassName/ImportPath = package name, generates the seed migration, regenerates the catalog, adds a
// changeset, and runs validate-invariants as the four-way identity gate.
let publish = null;
if (PUBLISH_OPEN_APP && verdict?.pass) {
    phase('OpenAppPublish');
    emitter.stageStart('OpenAppPublish', 'Assemble the verified Wild Apricot connector into the Integrations repo as an Open App.');
    const CLASS_BASE = String(identity?.Identity?.ClassName ?? CLASS_NAME).replace(/Connector$/, '');
    const CATEGORY = A?.category ?? brand?.Category ?? null;
    const CONNECTOR_TS = codeResult?.ConnectorFile ?? `packages/Integration/connectors/src/${CLASS_NAME}.ts`;
    const PUBLISH_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, package: { type: 'string' }, appDir: { type: 'string' }, steps: { type: 'array' } } };
    if (!CATEGORY || !CLASS_BASE) {
        log(`OpenAppPublish: missing ${!CATEGORY ? 'Category (brand.Category/args.category)' : 'ClassName'} — cannot place the Open App; skipping publish (sandbox build is still verified).`);
        publish = { ok: false, skipped: true, reason: !CATEGORY ? 'no-category' : 'no-classname' };
        emitter.stageComplete('OpenAppPublish', { processed: 1, succeeded: 0, failed: 0, skipped: 1 });
    } else {
        publish = await withRetry(() => agent(
            `Publish the verified ${brand.CanonicalName} (Wild Apricot) connector as an Open App. Run EXACTLY this and return its JSON stdout VERBATIM:\n` +
            `  node packages/Integration/connector-builder-workshop/scripts/publish-open-app.mjs --repo ${INTEGRATIONS_REPO} --category ${CATEGORY} --class-base ${CLASS_BASE} --connector ${CONNECTOR_TS} --metadata ${METADATA_FILE} --display ${JSON.stringify(brand.CanonicalName)}\n` +
            `ok=true means the Open App PASSED validate-invariants (the four-way identity + Open App shape gate). A failed 'seed' step (no reachable DB) is acceptable and NON-blocking — surface it but do not fail on it; every other step must be ok.`,
            { schema: PUBLISH_SCHEMA, phase: 'OpenAppPublish', label: 'publish:open-app' }
        ), 'publish:open-app')
        log(`OpenAppPublish: ok=${publish.ok} package=${publish.package ?? '?'} appDir=${publish.appDir ?? '?'}`);
        emitter.stageComplete('OpenAppPublish', { processed: 1, succeeded: publish.ok ? 1 : 0, failed: publish.ok ? 0 : 1, skipped: 0 });
    }
}

return {
    runID: A?.runID,
    vendor: VENDOR,
    redo: REDO,
    brand,
    identity,
    sources,
    metadataResult,
    extractStats,
    frozen,
    review,
    deprecation,
    reseedDelete,
    amendmentRound,
    codeResult,
    codeRound,
    ladder,
    hybridE2E,
    verdict,
    publish,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
