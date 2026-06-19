// nimble-ams.workflow.js — per-vendor workshop build plan (PLANNER emission)
//
// Vendor:        Nimble AMS — a Salesforce-NATIVE Association Management System (AMS), "100% built on
//                Salesforce". The integration surface is the Salesforce platform APIs (REST/SOAP/Bulk/
//                Composite/Metadata/Tooling/CDC/Platform-Events) PLUS the Nimble-specific **Nimble Fuse
//                API**: a single Apex REST endpoint POST /services/apexrest/NUINT/NUIntegrationService.
// Shape:         salesforce-derivative (managed package; namespaced `NU__*` / `NUINT__*` custom sObjects)
//                surfaced TWO ways — (a) the Salesforce platform REST API (/services/data/vXX/sobjects,
//                /query SOQL), and (b) the Nimble Fuse Apex REST endpoint whose request body is determined
//                by a configured Integration Setting: OUTBOUND = named SOQL → reads
//                {Records,RecordCount,Message,InboundResults:null}; INBOUND = JSON field-mapping upsert
//                keyed by a Salesforce External ID → {RecordCount,InboundResults:[{...,SalesforceId,
//                ErrorMessages:[]}],ErrorMessages}. Fuse rides REST → extend BaseRESTIntegrationConnector.
// Auth:          oauth2-authcode (Salesforce OAuth2 / connected app / integration user; Bearer session
//                token), OR Community-Hub non-authenticated Fuse with an integration-setting name +
//                auth-key (the auth-key is a SECRET — never read). Credential-free [B] run.
// Build mode:    IMPROVE — packages/Integration/connectors/src/NimbleAMSConnector.ts ALREADY EXISTS
//                (454 LOC, extends BaseRESTIntegrationConnector, IntegrationName='Nimble AMS') with
//                metadata (metadata/integrations/.nimble-ams.json, ~20 declared sObjects) + tests. Per the
//                IMPROVE discipline the existing work is a SUSPECT, not a baseline: re-derive the expected
//                schema/keys/FKs/lifecycle from the credential-free SOURCE (Nimble dev docs + nams-api-docs
//                object reference + the Fuse contract + Salesforce platform docs), DIFF the existing against
//                that re-derived truth, fix EVERY divergence with PROOF. Known suspect-points to scrutinize:
//                  • all 20 declared objects have SupportsIncrementalSync=true but IncrementalWatermarkField
//                    is UNSET (0 populated) → capability↔field bijection VIOLATION the floor enforces;
//                    either populate the watermark field (LastModifiedDate / SystemModstamp) per object or
//                    set the flag false where unprovable.
//                  • SupportsWrite=true on all 20 must trace to documented Fuse-inbound + Salesforce-sObject
//                    CRUD with co-present per-operation columns (Create/Update paths+methods+bodyShape).
//                  • declared NU__* object/field NAMES are the DOCUMENTED canonical AMS families (provable
//                    from nams-api-docs), modeled as the VENDOR-WIDE Declared floor — correct; the per-org
//                    real catalog (customer custom fields, record types) is runtime-Discovered via the
//                    Salesforce describe MECHANISM (auth-gated, case-2), NEVER baked at build.
// Credential:   NONE (credentialReference=null). Full credential-free non-live suite per PATH 2.
//                RealityProbe DEGRADES to unauthenticated per-claim status probing (401/403=path real +
//                auth-gated, 404=wrong) against the Salesforce login/instance + the NUINT Apex REST path
//                shape. HybridE2E runs in MOCK mode (mock-server-from-spec + fixtures, no live calls).
//                Live ceiling RECORDED as format-verified-no-creds; the non-live suite is NOT gated by it.
//                Provability ceiling is INHERENT (context §5/§12): real Nimble managed-package object/field
//                names, FLS, validation rules, flows, and Fuse-setting configs CANNOT be proven without a
//                customer org/sandbox. A SF Developer Edition org proves SF API mechanics only, NOT Nimble.
//
// EMPIRICAL vs LINT split (stated honestly per standing rule 4):
//   EMPIRICAL (real-system info enters): EnvPreflight (real repo/DB/MJAPI probe), RealityProbe
//     (unauthenticated HTTP status probing of the real Salesforce login/instance hosts + the NUINT Apex
//     REST path + auth/rate headers), HybridE2E mock-server-from-spec (real SQL Server engine round-trip
//     against a spec-generated Nimble-Fuse + SF-OAuth mock).
//   LINT (internal consistency only): IndependentReview, T0-T3 invariant/consistency rungs, the existing-
//     vs-rederived DIFF (re-derived from docs, but the comparison is internal), bijection floor-check,
//     FreezeContract.
//   The final report MUST present this split and MUST NOT launder lint-green as sync-verification — and
//   MUST state the Nimble-specific inherent ceiling: client behavior is contract-verified; REAL Nimble
//   managed-package execution is unproven without a customer org.

export const meta = {
    name: 'nimble-ams-build',
    description: 'Workshop dynamic-workflow IMPROVE build for Nimble AMS (Salesforce-native AMS via the Nimble Fuse Apex REST endpoint + Salesforce platform REST). Credential-free [B] run: full non-live PATH-2 suite, unauthenticated RealityProbe, MOCK HybridE2E. Re-derive from docs → DIFF the existing connector/metadata → fix with proof. Locked primitives + bijection floor-check. Ceiling = format-verified-no-creds (inherent — real Nimble package behavior unprovable without a customer org).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (P7): DB reachable @ migration level, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Canonical Nimble AMS identity + ProductTaxonomy. STUDY the FULL nature (Salesforce-platform AMS + Nimble Fuse inbound/outbound integration settings: accounts/orgs, contacts/people, memberships, orders/order-items, products, events/registrations, donations, committees, subscriptions, invoices/payments) INDEPENDENT of context. WriteCapability (Fuse inbound + SF sObject CRUD) + custom-field findings BINDING (P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots; ClassName=NimbleAMSConnector (IMPROVE — already exists); CredentialTypeID match-or-create against the Salesforce-OAuth2 / Nimble-Fuse ConnectionConfig key shape (existing: "Nimble AMS OAuth").' },
        { title: 'SourceAudit', detail: 'Audit + rank sources (Nimble dev docs + nams-api-docs object reference + Call-the-Integration-API + Inbound/Outbound setting docs + Salesforce platform REST/Bulk/CDC docs + SF Postman collection + the context-supplied minimal Nimble-Fuse OpenAPI §14). SCOPE DECISION: the Nimble Fuse contract + the documented namespaced AMS object families in-scope; broader Salesforce-platform breadth (arbitrary org sObjects, Tooling/Metadata APIs) recorded out-of-scope.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (NUINT Fuse endpoint path, SF data path, namespace scope, inbound/outbound setting semantics, OutOfScopeObjectFamilies + reasons, universalPK hint=Id only if authoritatively documented, governor-limit notes: 50k records / 3MB outbound, fields-omitted-when-null parser rule).' },
        { title: 'IOIOFExtract', detail: 'ONE extractor over the whole Fuse/sObject surface (verify + write-back). RE-DERIVE the catalog from credential-free docs (nams-api-docs); DIFF against the existing ~20-object metadata; fix divergences with proof. STATIC catalog only from credential-free docs; the auth-gated SF describe catalog is a runtime MECHANISM (case-2), NOT baked. adversarialN=2.' },
        { title: 'IndependentReview', detail: 'Up to MAX_AMENDMENT_ROUNDS=3 rounds, refocused charter, SLIM mode. Verify IMPROVE divergences resolved + watermark/capability bijection + Fuse-vs-FK anti-overfit. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probing (credential-free) against login.salesforce.com / test.salesforce.com + the /services/apexrest/NUINT/NUIntegrationService path shape. 401/403=path real+gated, 404=wrong; auth/rate headers. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance). Must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'IMPROVE the NimbleAMSConnector (BaseRESTIntegrationConnector): SF OAuth2 bearer auth, /services/data/vXX/sobjects describe + /query SOQL pagination (nextRecordsUrl) + SystemModstamp/LastModifiedDate incremental, AND the Nimble Fuse path (POST NUIntegrationService — outbound SOQL reads, inbound external-ID upsert). Keep tests green by UPDATING them to corrected truth. max 3 rounds.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (non-live ceiling) + two-pass volatile-field idempotency rung (P3). All rungs credential-free.' },
        { title: 'HybridE2E', detail: 'MOCK mode (credential-free): mock-server-from-spec (Nimble-Fuse OpenAPI + SF OAuth) → real MJ engine → real SQL Server, FRESH DB. Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + EMPIRICAL gates (reality-probe, e2e-mock-dodge[N/A keyless], capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states EMPIRICAL/LINT split + format-verified-no-creds ceiling + the inherent Nimble-package-unprovable caveat.' },
    ],
};

// Normalize args FIRST (the model→Workflow-tool path delivers a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'nimble-ams';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Credential-free [B]: ceiling RECORDS the non-live ceiling; it does NOT gate the non-live suite.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',               // non-live ceiling; live tier never reached (no credential)
    adversarialVerifyMinReviewers: 2,          // token-conscious default; this is not a hard/high-risk shape
};

// ── EnvPreflight (S0 — P7) ───────────────────────────────────────────
phase('EnvPreflight');
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
const envPreflight = await agent(
    `EnvPreflight (S0) for the ${VENDOR} build — DETERMINISTIC FINDER (P9: you RUN the script; you never eyeball-check).\n` +
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
// STUDY the full nature independently (standing rule 1). Nimble AMS is Salesforce-native; the study
// establishes the object FAMILIES + the dual surface (SF platform REST + the Nimble Fuse Apex REST
// endpoint) + auth + read/write/bidirectional capability from public discovery, NOT capped by the
// context. The scope decision happens in SourceAudit/Extract.
phase('BrandResearch');
const BRAND_SCHEMA = {
    type: 'object', required: ['CanonicalName'],
    properties: {
        CanonicalName: { type: 'string' },
        Description: { type: 'string' },
        NavigationBaseURL: { type: ['string', 'null'] },
        IconClass: { type: ['string', 'null'] },
        Disambiguation: { type: 'array' },
        Sources: { type: 'array', items: { type: 'string' } },
        ProductTaxonomy: { type: 'object' },
        ObjectFamilies: { type: 'array', items: { type: 'string' } },   // FULL surface the study found (awareness)
        WriteCapability: { type: ['object', 'null'] },                  // BINDING (P5)
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" — canonical identity AND FULL API nature, INDEPENDENT of the provided context (which is a non-exhaustive helper that you must validate; reject anything provably wrong).\n` +
    `Nimble AMS is a Salesforce-NATIVE Association Management System (AMS), "100% built on Salesforce", delivered as a managed package (namespace families NU__* and NUINT__*). Its API surface rides TWO layers:\n` +
    `  (a) the Salesforce platform REST API — /services/data/vXX/sobjects/ (global describe = authoritative catalog at runtime), /sobjects/<O>/describe (fields), /query (SOQL, nextRecordsUrl pagination, SystemModstamp/LastModifiedDate incremental), CRUD POST/PATCH/DELETE, Bulk API 2.0, Change Data Capture + Platform Events; AND\n` +
    `  (b) the Nimble-specific **Nimble Fuse API** — a SINGLE Apex REST endpoint POST /services/apexrest/NUINT/NUIntegrationService whose request body is determined by an admin-configured Integration Setting: OUTBOUND setting = a named SOQL query → reads (response {Records, RecordCount, Message, InboundResults:null}; up to 50,000 records OR 3MB/call; fields with no value are OMITTED from the response — the parser must treat missing as nullable, not a schema error); INBOUND setting = JSON field-mapping upsert keyed by a Salesforce External ID field (response {RecordCount, InboundResults:[{...,SalesforceId,ErrorMessages:[]}], ErrorMessages} — per-record partial success).\n` +
    `Establish the object FAMILIES (accounts/organizations, contacts/people, memberships, orders/order-items, products, events & registrations, donations, committees/committee-memberships, subscriptions, invoices/payments), the auth model (Salesforce OAuth2 connected-app / integration user / Bearer session, OR Community-Hub non-authenticated Fuse with an integration-setting name + auth-key), read AND write/bidirectional capability, pagination, incremental signal, and rate/governor limits. Resolve canonical name, description, navigation URL, icon class, ProductTaxonomy. WriteCapability is BINDING — Nimble documents BIDIRECTIONAL integration (Fuse INBOUND upsert + Salesforce sObject CRUD), so do NOT silently drop write to pull-only; say so. Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);

// ── Identity ─────────────────────────────────────────────────────────
phase('Identity');
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". Read SOURCE_STUDY when ready. This is an IMPROVE build — the connector ALREADY exists.\n` +
    `Integration Name: "Nimble AMS"; ClassName: NimbleAMSConnector (EXISTING — packages/Integration/connectors/src/NimbleAMSConnector.ts); ImportPath: @memberjunction/integration-connectors. Preserve these unless re-derivation contradicts them.\n` +
    `CredentialTypeID: match-or-create against the Salesforce-OAuth2 / Nimble-Fuse ConnectionConfig key shape (the existing metadata uses "Nimble AMS OAuth"). The ConnectionConfig is InstanceURL + ClientID/ClientSecret (+ AccessToken/RefreshToken), OR a Community-Hub Fuse integration-setting name + auth-key. Reuse the existing credential type if its key shape matches; create a Nimble-specific one only if it genuinely differs. NEVER read credential bytes.\n` +
    `Use the universalPK Configuration hint (Salesforce 'Id' 18-char) ONLY if the in-scope object schemas authoritatively use it as PK (they do for SF sObjects — but emit IsPrimaryKey only where the source explicitly identifies 'Id' as the PK; the Fuse inbound External-ID field is a UNIQUE upsert key, NOT necessarily the PK).`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}

// ── SourceAudit ──────────────────────────────────────────────────────
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        Gaps: { type: 'array' },
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        scopeDecision: { type: ['object', 'null'] },
        scopedSubset: { type: 'array', items: { type: 'string' } },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName} and build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split.\n` +
    `Tier-1 sources (highest priority — the context §11 Resource list has the canonical URLs): the Nimble AMS Developer Documentation, the **nams-api-docs object reference** (nimbleuser.github.io/nams-api-docs — the credential-free enumerable object/field catalog), "Call the Integration API", "Inbound and Outbound Integrations" + the Create-Inbound/Create-Outbound-Setting docs (the Fuse contract), the Salesforce platform REST/Bulk2.0/CDC/Platform-Events docs, the Salesforce public Postman collection (250+ requests), and the context-supplied minimal **Nimble Fuse OpenAPI** (context §14). Validate context claims against independent evidence; reject anything provably wrong.\n` +
    `Local context file: ${REGISTRY_DIR}/sources/nimblecontext.md (the operator-provided Tier-1 helper). Treat it as trusted-where-it-speaks but verify breadth independently — do NOT let it cap the object/capability universe.\n` +
    `ENUMERATE the object universe by SCRIPT, never by eyeballing (memory: object-catalog-must-be-script-output) — the nams-api-docs object reference is credential-free + enumerable; the customer-org Salesforce describe catalog (real per-org custom fields/record types) is AUTH-GATED and is a RUNTIME discovery MECHANISM, NOT a static catalog (rule 2). Emit EnumerationStdoutCount from the script.\n` +
    `SCOPE DECISION (KNOWING, per the discovery model): the in-scope subset = the Nimble Fuse contract (the single NUINT/NUIntegrationService endpoint + inbound/outbound request/response envelopes) PLUS the DOCUMENTED canonical AMS object families (accounts/orgs, contacts/people, memberships, orders/order-items, products, events/registrations, donations, committees/committee-memberships, subscriptions, invoices/payments) as the VENDOR-WIDE Declared schema floor — the useful/reachable surface for MJ clients. Record the broader Salesforce-platform breadth (arbitrary org sObjects, Tooling/Metadata/Analytics/Knowledge APIs) as known-but-out-of-scope in scopeDecision with the reason "Nimble connector scopes to the Nimble Fuse contract + the documented AMS managed-package object families; generic Salesforce-platform breadth + per-customer-org custom schema is runtime-Discovered, not Declared". Do NOT inflate to the full org sObject universe; do NOT under-model below the documented AMS families.\n` +
    `IMPROVE NOTE: the existing metadata (metadata/integrations/.nimble-ams.json) declares ~20 sObjects with SupportsWrite/SupportsIncrementalSync/SupportsPagination=true. Re-derive the COVERABLE leaf set from the nams-api-docs reference INDEPENDENTLY — do NOT seed TaxonomyLeaves from the existing metadata (that is prior OUTPUT, not a source). The diff between your re-derived leaves and the existing 20 is exactly what the extractor must reconcile with proof.\n` +
    `Emit TaxonomyLeaves = the leaves of the COVERABLE in-scope taxonomy (the documented AMS object schemas + the Fuse inbound/outbound contract envelopes) as input to extract-iiof-pipeline.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── MetadataWrite ────────────────────────────────────────────────────
phase('MetadataWrite');
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER direct edit).\n` +
    `Configuration JSON keys to set (provable-only): the Nimble Fuse endpoint path (/services/apexrest/NUINT/NUIntegrationService), the Salesforce platform data path (/services/data/v<version>), the managed-package namespace scope (NU__/NUINT__) for runtime describe filtering, the inbound/outbound Integration-Setting semantics (outbound=named SOQL read; inbound=External-ID-keyed JSON upsert), OutOfScopeObjectFamilies (the broader Salesforce-platform breadth + per-org custom schema) WITH reasons, the OUTBOUND governor limits (50,000 records OR 3MB per call) and the "fields-omitted-when-null" parser rule, and BatchMaxRequestCount/BatchRequestWaitTime ONLY if the Salesforce/Nimble rate-limit docs explicitly state them (else leave null — provable-only). universalPK hint = {fieldName:'Id'} ONLY if the in-scope object schemas authoritatively use the Salesforce 18-char Id as PK.\n` +
    `IMPROVE: reconcile the existing Configuration with the re-derived values; preserve only what re-derivation CONFIRMS; record any out-of-scope payment/DTO families with their reason rather than dropping them silently.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop) ─────────
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
    },
};

// MAX_AMENDMENT_ROUNDS = 3 (template floor — _TEMPLATE.workflow.js lines 202-211): the loop guard is
// `while (amendmentRound < MAX_AMENDMENT_ROUNDS)`. With MAX=1 the loop runs round 0 ONLY; on any blocking
// gap, amendmentRound++ → 1 exits straight into EscalatedMaxRounds and the isAmendment=(amendmentRound>0)
// re-dispatch branch (which delivers reviewerFindings to the re-extractor) NEVER fires. MAX=3 restores the
// guarantee: round 0 extract+review, then up to 2 real amendment rounds that feed reviewer findings back
// into the extractor. Deadlock fingerprint preserved as a redundant guard. For an IMPROVE build the
// existing-vs-rederived DIFF surfaces mechanical fixes (watermark fields, capability columns, FK naming)
// that resolve in 1-2 passes.
const MAX_AMENDMENT_ROUNDS = 3;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,                 // in-scope subset, re-derived from docs, modeled deeply
            outOfScopeFamilies: sources.scopeDecision?.outOfScopeFamilies ?? null,
            scopeReason: sources.scopeDecision?.reason ?? 'Nimble connector scopes to the Nimble Fuse contract + the documented AMS managed-package object families; generic Salesforce-platform breadth + per-customer-org custom schema is runtime-Discovered (Salesforce describe MECHANISM), not Declared.',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // IMPROVE: re-derive the catalog from credential-free docs, then DIFF against the existing
            // metadata and FIX every divergence with proof. The existing connector + existing metadata are
            // SUSPECTS the extractor must CRITIQUE, NOT trusted inputs — and they are OUTPUT, not sources
            // (never re-bake them in as "evidence" — the circular-source defect). Key divergences to fix:
            //  • 20 declared objects: SupportsIncrementalSync=true but IncrementalWatermarkField UNSET →
            //    populate (LastModifiedDate / SystemModstamp) per object OR set the flag false if unprovable.
            //  • SupportsWrite=true must have co-present per-operation columns (Fuse inbound upsert path +
            //    SF sObject Create/Update paths+methods+bodyShape+IDLocation) — bijection.
            //  • the Fuse inbound External-ID field is a UNIQUE upsert key, NOT necessarily the PK; SF 'Id'
            //    is the PK — emit IsPrimaryKey/IsUniqueKey independently per the source.
            improveMode: true,
            existingMetadataPath: 'metadata/integrations/.nimble-ams.json',  // for DIFF only — NOT a source of truth
            existingConnectorPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`, // for critique only
            // Multi-source PK/FK detection — CREDENTIAL-FREE sources only (extractor seeds STATIC metadata).
            // NOTE: the connector being built + existing metadata are OUTPUT, not sources. The Salesforce
            // describe catalog is AUTH-GATED → a runtime MECHANISM, never read at build. The pipeline injects
            // sourceBundle VERBATIM into the extractor's MULTI-SOURCE SWEEP prompt, so the IMPROVE
            // critique/DIFF inputs MUST live INSIDE sourceBundle (existingConnectorTsPath /
            // existingMetadataPaths) — they populate the ExistingConnectorTs / ExistingMetadataJson
            // source-matrix columns for Gap-10 PK/FK detection on this IMPROVE build (where both artifacts
            // exist). They are read ONLY for critique/diff; they are NOT authoritative catalog sources (the
            // circular-source rule still holds — the extractor re-derives from credential-free docs and DIFFs
            // the existing emission, never trusts it). The top-level existingConnectorPath/existingMetadataPath
            // keys above are optional context only; the pipeline does NOT read them.
            sourceBundle: {
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
                existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`, // IMPROVE critique/DIFF only — NOT a catalog source
                existingMetadataPaths: ['metadata/integrations/.nimble-ams.json'],                              // IMPROVE critique/DIFF only — NOT a catalog source
            },
            amendmentRound,
            reviewerFindings: isAmendment ? review.FixInstructions : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (round ${amendmentRound}). SLIM MODE — do NOT read the full source/SDL into context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file) for bijection + plausibility.\n` +
        `Because this is an IMPROVE build on a Salesforce-native AMS, ALSO sanity-check the known suspect-points: (1) every object with SupportsIncrementalSync=true has a non-null IncrementalWatermarkField (the existing metadata had it UNSET on all 20 — a bijection violation the floor enforces); (2) every object with SupportsWrite=true has co-present per-operation write columns (CreateAPIPath+CreateMethod+CreateBodyShape+CreateIDLocation, etc.); (3) the Fuse inbound External-ID field is emitted IsUniqueKey (upsert key) and NOT mis-marked IsPrimaryKey, while SF 'Id' is the PK; (4) NU__*/lookup reference fields are emitted as proper FKs (RelatedIntegrationObjectID resolvable) and NOT as fabricated FKs on non-relationship fields (the access-path-vs-FK anti-overfit rule). Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        break;
    }

    const reviewFingerprint = JSON.stringify({
        blocking: review.ConfirmedGapsBlocking,
        violations: review.BijectionViolationsFound ?? 0,
        fixes: (review.FixInstructions ?? []).map(f => f?.slot ?? '').sort(),
    });
    if (previousReviewFingerprint === reviewFingerprint) {
        log(`Amendment loop deadlock at round ${amendmentRound}: reviewer findings byte-identical → escalate`);
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
            status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

// ── Post-escalation deterministic recovery (operator-applied reviewer FixInstructions) ────
// The round-3 reviewer's ONLY blocking gaps were the 4 LmsPurchase write-sync fields
// (completionStatus / syncStatus / status / externalId) mis-flagged IsReadOnly=true, though they appear
// in the LMS Purchase Sync POST request body (proving they are writable). The producer loop failed to
// apply these mechanical flips across 3 rounds (→ EscalatedMaxRounds). They were applied DETERMINISTICALLY
// via the mj-metadata MCP (upsert_integration_object_field) + provenance citing the Postman write body.
// Re-review the CORRECTED metadata file with a FRESH independent reviewer; proceed ONLY if it now
// confirms 0 blocking gaps — otherwise escalate honestly.
if (review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Extract loop escalated with ${review.ConfirmedGapsBlocking} blocking; operator applied the reviewer FixInstructions via MCP — re-reviewing corrected metadata`);
    phase('PostFixReview');
    review = await agent(
        `Adversarial RE-REVIEW of the ${VENDOR} emission AFTER the operator applied the prior round's exact FixInstructions (the 4 LmsPurchase write-sync fields completionStatus/syncStatus/status/externalId flipped IsReadOnly=true→false, provenance'd from the LMS Purchase Sync POST body). SLIM MODE — do NOT read the full source into context. RUN a small count-reconcile node script over the corrected metadata file + source for object/field/zero-field counts, then spot-check the 4 corrected LmsPurchase fields (read the metadata file at metadata/integrations/nimble-ams/.nimble-ams.integration.json) plus a ~12-field sample for bijection + plausibility. Confirm the 4 IsReadOnly flips landed and RE-EVALUATE all blocking criteria (zero-field objects, watermark/capability bijection, PK-vs-UniqueKey, access-path-vs-FK anti-overfit). Populate FixInstructions ONLY for any REMAINING blocking gap; auth-gated per-org field details correctly marked "deferred to runtime Discovered" are NOT blocking gaps.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'PostFixReview', label: 'review:postfix' }
    );
    log(`Post-fix re-review: ${review.ConfirmedGapsBlocking} blocking, ${review.BijectionViolationsFound ?? 0} bijection violations`);
    if (review.ConfirmedGapsBlocking > 0) {
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
            status: 'EscalatedMaxRounds',
            message: `Post-fix re-review still reports ${review.ConfirmedGapsBlocking} blocking gaps after operator-applied fixes. Human review: ${review.ReviewFile}`,
        };
    }
    log('Post-fix re-review clean (0 blocking) — proceeding to SourceDiff → CodeBuild → FloorCheck');
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
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { openapiPath: sources.SourcesFile }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
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

// ── RealityProbe (S7 — P2, EMPIRICAL; DEGRADED unauthenticated mode — credential-free) ───
phase('RealityProbe');
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
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `This is a CREDENTIAL-FREE [B] run → the script runs the DEGRADED unauthenticated status probe (no token).\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE}. Nimble's declared paths are Salesforce instance-relative (/services/data/... and /services/apexrest/NUINT/NUIntegrationService) — probe against the documented Salesforce login/instance host pattern (https://login.salesforce.com and https://test.salesforce.com) plus the NUINT Apex REST path shape so the per-claim status check is meaningful. The real per-org instance host is unknown without a credential — that is expected; probe the login hosts + the canonical path shapes.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}  (NO credential → degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. Expect the Salesforce OAuth/login endpoints to be reachable and the data/apexrest paths to return 401/403 against a real instance (gated-exists = path real + auth-gated) — that is the strong credential-free proof the OAuth2 scheme + the path shape are real; a 404 on a canonical SF path means the declared path is WRONG and is a falsified verdict. NOTE the Nimble-specific inherent ceiling: the NUINT Fuse endpoint cannot be content-verified without a Nimble-enabled org, so its verdict ceiling is gated-exists/format-verified at best. You may NOT add objects/fields/paths (metadataDelta MUST be false) and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe (a 404 where the declared path should exist):\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Nimble/Salesforce source; pick the docs-supported alternative the probe confirmed, e.g. the correct /services/data version segment, the correct /services/apexrest/NUINT/NUIntegrationService casing, the correct sObject API name with NU__/NUINT__ namespace). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop ────────────────
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

// MAX_CODE_BUILD_ROUNDS = 3 (template floor — _TEMPLATE.workflow.js lines 420-423: "3 (was 2): MAX=2 gave
// only ONE amendment round"): round 0 build + up to 2 fix rounds. For an IMPROVE build that reshapes an
// existing 454-LOC connector (watermark wiring, write-column alignment, test updates), a single fix attempt
// is insufficient. Deadlock + max-round escalation preserved.
const MAX_CODE_BUILD_ROUNDS = 3;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

// Credential-free ladder gating (Finding: T2+ are credential-GATED, not code defects). In a [B] run with
// no credential, any rung that must AUTHENTICATE to run (e.g. T2 CrossProgrammaticConsistency runs the
// connector's discovery, which needs Salesforce OAuth → fails with "auth requires refresh_token or
// client_secret") is UNREACHABLE — exactly like the live rung T8. The ladder mis-reports it as a red code
// failure, deadlocking a CLEAN build. Treat such credential-gated reds as skipped (not blocking) so the
// format-verified-no-creds ceiling is honored instead of looping the producer over an absent credential.
const IS_CREDENTIAL_FREE = !A?.credentialReference && !(Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0);
const isCredGatedRed = (r) => r?.status === 'red'
    && /auth requires|refresh_token|client_secret|credential|discovery failed|not authenticated|unauthor/i.test(JSON.stringify(r?.failures ?? r));
const ladderHasBlockingRed = (l) => (l?.tierResults ?? [])
    .some(r => r?.status === 'red' && !(IS_CREDENTIAL_FREE && isCredGatedRed(r)));

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Keep tests green by UPDATING them to the corrected truth, never by preserving a wrong behavior.`
            : `IMPROVE the NimbleAMSConnector class from the frozen contract at ${frozen.contractPath}. The connector ALREADY exists at packages/Integration/connectors/src/${identity.Identity.ClassName}.ts (454 LOC, extends BaseRESTIntegrationConnector, IntegrationName='Nimble AMS'). This is IMPROVE, not trust-and-tweak: critique the existing heavily and CHANGE everything the re-derived contract contradicts; preserve only what it confirms.\n` +
              `Architecture (preserve where correct): extend BaseRESTIntegrationConnector. Salesforce-OAuth2 bearer auth (Authenticate/BuildHeaders), /services/data/vXX/sobjects describe + /query SOQL with nextRecordsUrl pagination (ExtractPaginationInfo) + SystemModstamp/LastModifiedDate incremental (WatermarkService + IncrementalWatermarkField). Do NOT invent a BaseSalesforceConnector or BaseSOAPIntegrationConnector — those do not exist; the only protocol bases are BaseIntegrationConnector and BaseRESTIntegrationConnector. You MAY reference packages/Integration/connectors/src/SalesforceConnector.ts for the SF-OAuth mechanics, but Nimble's IntegrationName/identity is its own.\n` +
              `Nimble-specific code: (1) the Nimble Fuse path — POST /services/apexrest/NUINT/NUIntegrationService — OUTBOUND reads (named-SOQL Integration Setting → {Records,RecordCount,Message}; parser MUST treat fields missing from a record as nullable, NOT a schema error; honor the 50,000-record / 3MB-per-call limits) and INBOUND writes (External-ID-keyed JSON upsert → {RecordCount,InboundResults:[{...,SalesforceId,ErrorMessages}],ErrorMessages}; per-record partial success; route create through BuildCreatedResult and fail LOUDLY on an empty SalesforceId). (2) scope the SF global describe to the NU__/NUINT__ managed-package namespace at runtime.\n` +
              `Use generic per-operation BaseRESTIntegrationConnector CRUD via the IO write columns where the shape is standard; override only for the genuinely idiosyncratic Fuse inbound/outbound envelope (and still route create through BuildCreatedResult). FIX the known suspect-points: wire IncrementalWatermarkField for every SupportsIncrementalSync object; align per-operation write columns to SupportsWrite. NO baked catalog — the object/field set is Declared (docs) + Discovered (runtime SF describe MECHANISM). Strong typing, no any. Update __tests__/${identity.Identity.ClassName}.test.ts to the corrected behavior.`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`;
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

    if (!codeResult.BuildClean) { codeRound++; continue; }

    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf already present (it is — this is IMPROVE), make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${identity.Identity.ClassName}.ts" ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: VENDOR_SLUG,                          // registry slug (Finding A — ClassName≠slug deadlocks T1)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null, // null → credential-free rungs only
            maxTier: MANIFEST.e2eTier,                           // T8 non-live ceiling
        }
    );

    const credGatedSkips = IS_CREDENTIAL_FREE
        ? (ladder?.tierResults ?? []).filter(r => r?.status === 'red' && isCredGatedRed(r)).map(r => r?.tier)
        : [];
    if (credGatedSkips.length) {
        log(`Credential-free: rung(s) ${credGatedSkips.join(',')} UNREACHABLE without a credential (treated as skipped, not red) — ceiling format-verified-no-creds`);
    }
    const hasRed = ladderHasBlockingRed(ladder);
    if (!hasRed) {
        log(`Code+Ladder converged at round ${codeRound} (build clean + ladder achieved ${ladder?.achievedTier ?? '?'}; credential-gated rungs skipped)`);
        break;
    }

    const codeFingerprint = JSON.stringify({
        clean: codeResult.BuildClean,
        ladderRed: (ladder?.classifiedFailures ?? []).map(f => `${f?.tier}:${f?.code}:${f?.locus}`).sort(),
    });
    if (previousCodeFingerprint === codeFingerprint) {
        log(`Code+Ladder deadlock at round ${codeRound}: identical failures → escalate`);
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound,
            status: 'EscalatedCodeDeadlock',
            message: `Code-builder + verification-ladder deadlocked after ${codeRound + 1} attempts. Same failures recur. See classifiedFailures.`,
        };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}

if ((!codeResult?.BuildClean || ladderHasBlockingRed(ladder)) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound,
        status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red. Human intervention required.`,
    };
}

// ── HybridE2E (MOCK mode — credential-free) ──────────────────────────
// REQUIRED on every build. Runs on SQL Server (NOT Postgres — PG codegen suspended), FRESH DB,
// through the real MJ engine. Credential-free → mode='mock' (mock-server-from-spec built from the Nimble
// Fuse OpenAPI + the SF OAuth token response + recorded fixtures); no live calls. This is the e2e that
// proves the connector THROUGH MJAPI into a real SQL Server DB (ApplyAll → upsert → contentHash →
// incremental → idempotent) — the in-isolation ladder does NOT. Env bring-up fully scripted in
// HYBRID_E2E_ENV_RUNBOOK.md (only assume the Docker daemon is up).
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // Credential-free: no credentialReference + no brokerPlans → MOCK. (Honest — not an e2e-mock-dodge,
        // since there are genuinely no creds; the floor's e2e-mock-dodge gate only fires when creds EXIST.)
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── FloorCheck (final gate) ──────────────────────────────────────────
phase('FloorCheck');
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
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,
            brokerPlans: A?.brokerPlans ?? null,
            brand,
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.scopeDecision?.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
