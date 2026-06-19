// netsuite.workflow.js — per-vendor build workflow (emitted by ConnectorCreator/planner)
//
// Vendor: Oracle NetSuite — multi-surface cloud ERP/accounting platform.
//
// SCOPE DECISION (made KNOWINGLY by the operator — "STUDY for awareness; CONTEXT scopes"):
//   IN-SCOPE  → SuiteTalk REST Web Services:
//     - Record Service: CRUD (GET/POST/PATCH/DELETE) on standard + custom record types, addressed as
//       /services/rest/record/v1/<recordType>[/{id}]. THIS is the BIDIRECTIONAL REST/JSON surface that
//       fits BaseRESTIntegrationConnector.
//     - SuiteQL query service: SQL-style reads via POST /services/rest/query/v1/suiteql ({q:"<sql>"}),
//       cursor/offset paged.
//     - Auth: OAuth 2.0 (client-credentials / authorization-code, bearer) AND OAuth 1.0a Token-Based
//       Auth (TBA, HMAC-signed). Per-account base host: https://<accountId>.suitetalk.api.netsuite.com.
//   SCHEMA DISCOVERY (authoritative): NetSuite exposes a REST record-metadata catalog
//     (/services/rest/record/v1/metadata-catalog, OpenAPI 3.0 schemas per record type). That is the
//     authoritative DYNAMIC-schema source — DiscoverObjects/DiscoverFields ride that catalog MECHANISM at
//     runtime, against THAT client's credential. The catalog returns the COMPLETE gamut a credential can
//     access → DiscoveryIsAuthoritative=true is a candidate (gate on EVIDENCE the catalog is complete).
//     Build-time seeds only credential-free Declared metadata from public docs/spec; the connector
//     NEVER bakes the record-type catalog in code (NetSuite has a very large record-type universe — an
//     artificial object/field ceiling is a DEFECT; enumerate from the source, never a hardcoded list).
//   OUT-OF-SCOPE (recorded in Integration.Configuration.OutOfScopeObjectFamilies WITH the reason, not
//     built): SuiteAnalytics Connect (JDBC/ODBC read-only bulk — not REST/JSON), SuiteTalk SOAP (legacy
//     XML envelope), RESTlets (customer-specific SuiteScript endpoints — not a vendor-wide surface). The
//     connector-nature study MUST establish NetSuite's full breadth INDEPENDENTLY, then scope to
//     SuiteTalk REST knowingly — not because the study failed to find the other surfaces.
//
// CREDENTIAL: [B] credential-free run (credentialReference=null). Full NON-LIVE suite, no live API calls.
//   maxTier=T8 — on the Phase 0 tier ladder T8 (FailureModeInjection: inject 429/500/timeout/bad-JSON at
//   the HTTP boundary, assert retry+classify) is requiresCredentials=false, reachable WITHOUT a credential
//   and implies NO live round-trip. The full NON-LIVE suite (schema/contract validation against the
//   metadata-catalog OpenAPI, mock-server-from-spec, Postman/collection replay, endpoint/header probing,
//   bijective completeness, adversarial review) runs to its full applicable extent independent of maxTier —
//   maxTier only RECORDS the non-live ceiling. RealityProbe DEGRADES to unauthenticated per-claim status
//   probing — it never disappears: it still hits the per-account suitetalk host + /services/rest/record/v1,
//   /services/rest/query/v1/suiteql, /services/rest/record/v1/metadata-catalog, and every declared door for
//   401/403 (path real + auth-gated) vs 404 (path wrong), and param-probes the limit/offset + SuiteQL forms
//   where the endpoint tolerates it. HybridE2E runs in MOCK-from-spec mode (credentialReference null → mock);
//   the live §1→§7 path is skipped, as it must be with no credential — no e2e-mock-dodge concern (no creds).
//
// THIS VENDOR'S RISK NOTES (baked in):
//   1. OBJECT CATALOG = a SCRIPT'S STDOUT over the raw source, NEVER an agent eyeballing the docs. The
//      authoritative record catalog (metadata-catalog) is AUTH-GATED (a credential-free run cannot read it),
//      so build-time Declared metadata is enumerated IN CODE from the credential-free public docs/spec
//      (the documented standard record types + their OpenAPI field schemas where Oracle publishes them),
//      cross-checked against an independent in-file signal, and FAIL/escalate on a material shortfall. The
//      FULL credential-gated universe is reached at RUNTIME via DiscoverObjects against metadata-catalog —
//      the Declared seed is the credential-free subset, never the whole gamut. (memory:
//      object_catalog_must_be_script_output)
//   2. BIDIRECTIONAL: the Record Service supports Create/Update/Delete. SupportsWrite + per-operation CRUD
//      columns are emitted ONLY on EXPLICIT docs/spec evidence (POST/PATCH/DELETE operations in the
//      record OpenAPI), never assumed from "famous ERP has writes" (the path-LMS over-claim mirror).
//      SuiteQL objects are READ-ONLY. Capability ↔ method bijection enforced.
//   3. AUTH is multi-mode (OAuth2 + OAuth1 TBA). CredentialTypeID: match-or-create against the connector
//      ConnectionConfig key shape (accountId + the chosen auth secrets) — do not force one mode where the
//      docs document both; encode the supported modes in Configuration.
//   4. PER-ACCOUNT BASE HOST: the host embeds the accountId (<accountId>.suitetalk.api.netsuite.com). The
//      connector CODE is tenant-agnostic — accountId is a per-connection Configuration value, NEVER a baked
//      constant. NavigationBaseURL is the documented host TEMPLATE, not a real account host.
//   5. PAGINATION: REST list + SuiteQL use limit/offset with a hasMore/next link envelope (PaginationType
//      = Offset; the exact param names + envelope shape are VERIFIED by RealityProbe param-probing / the
//      metadata-catalog OpenAPI, not assumed). Incremental: lastModifiedDate is the documented change
//      cursor for most transactional records — VERIFY per object, never blanket-assume updatedAt.
//   6. Deploy-preflight: real deployed columns only, within widths, valid PaginationType/Status/BodyShape
//      enums, @parent FKs on every IO/IOF, never set MetadataSource (pipeline owns it).

export const meta = {
    name: 'netsuite-build',
    description: 'Workshop dynamic-workflow build for Oracle NetSuite (SuiteTalk REST Web Services — Record Service CRUD + SuiteQL reads; OAuth2 / OAuth1 TBA). Authoritative runtime discovery via the REST metadata-catalog; credential-free Declared seed from public docs. Out-of-scope (recorded): SuiteAnalytics Connect, SuiteTalk SOAP, RESTlets. Credential-free [B] run: full non-live suite to T8, RealityProbe degraded unauthenticated, HybridE2E mock mode. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ migration level, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Canonical NetSuite identity + ProductTaxonomy + FULL API nature INDEPENDENTLY (REST/SOAP/SuiteAnalytics/RESTlets surfaces, OAuth2+OAuth1 TBA, BIDIRECTIONAL Record Service). WriteCapability finding BINDING (v2 P5) — expect READ+WRITE on Record Service.' },
        { title: 'Identity', detail: 'Integration row identity slots. CredentialTypeID match-or-create against the ConnectionConfig key shape (accountId + OAuth2/OAuth1 TBA secrets). ClassName=NetSuiteConnector.' },
        { title: 'SourceAudit', detail: 'ENUMERATE the credential-free Declared object catalog IN CODE over the saved public docs/spec (documented standard record types + their OpenAPI field schemas) — metadata-catalog is auth-gated. Cross-check count; FAIL on material shortfall. COVERABLE vs INFORMATIONAL split + record the SuiteTalk-REST scope decision (SOAP/SuiteAnalytics/RESTlets out-of-scope WITH reason).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (per-account host template, OAuth2+OAuth1 modes, Offset pagination, SuiteQL transport, OutOfScopeObjectFamilies + reason, authoritative-discovery candidate).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the in-scope Declared subset. Record Service IOs → SupportsWrite + per-operation CRUD columns ONLY on explicit POST/PATCH/DELETE evidence; SuiteQL/read-only IOs → SupportsWrite=false. PKs from explicit id markers; lastModifiedDate watermark VERIFIED per object. FKs from the record OpenAPI $ref/relationship model, never field-name guesses.' },
        { title: 'IndependentReview', detail: 'ONE round, SLIM. Count-reconcile script over metadata+source (NOT in-context). Sample bijection + capability-honesty (write claims have CRUD columns; read-only have none) + scope-thinness sanity (Declared subset vs enumerated). LINT.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL). DEGRADED unauthenticated (no credential): per-claim status (401/403=real+gated, 404=wrong) on the per-account suitetalk host + /services/rest/record/v1[/<type>], /services/rest/query/v1/suiteql, /services/rest/record/v1/metadata-catalog + declared doors. Param-probe limit/offset + SuiteQL POST body where tolerated. OPTIONS/405 write-surface existence (never a write call). Rate headers (Concurrency limit). NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'NetSuiteConnector extends BaseRESTIntegrationConnector. OAuth2 bearer + OAuth1 TBA HMAC (auth-helpers, never inline crypto), per-account host from Configuration.accountId, Record Service generic per-operation CRUD, SuiteQL POST reads, Offset paging, lastModifiedDate watermark, DiscoverObjects/DiscoverFields ride metadata-catalog MECHANISM. Fixtures from probe captures or doc examples (provenance-tagged).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (all credential-FREE rungs; T7=OpenAPIValidation against the metadata-catalog schemas, T8=FailureModeInjection needs no credential). Includes two-pass volatile-field idempotency rung (v2 P3). EMPIRICAL where it touches the real spec; LINT elsewhere.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. MOCK mode (no credential — live cells logged skip with credential-absent reason). Env per HYBRID_E2E_ENV_RUNBOOK.md; coords from caller dbProfile/mjapi.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, env-preflight, capability-honesty, scope-unjustified-thin). Verdict states the EMPIRICAL/LINT split; live e2eTier ceiling = format-verified-no-creds.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every read works.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'netsuite';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    // T8 = FailureModeInjection — a credential-FREE rung on the Phase 0 ladder; reachable with NO live
    // credential. It RECORDS the non-live ceiling; it does NOT gate the non-live suite (always full extent).
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};

// ── EnvPreflight (S0 — v2 P7) ────────────────────────────────────────
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
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists reported: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — the build must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
// The study establishes NetSuite's FULL nature INDEPENDENTLY (all surfaces, BIDIRECTIONAL Record Service,
// OAuth2+OAuth1 TBA) — context is trusted-where-it-speaks; the study determines the capability universe
// (GAP-B). WriteCapability + custom-field findings are BINDING (v2 P5).
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
        WriteCapability: { type: ['string', 'object', 'null'] },        // BINDING (v2 P5) — Record Service is read+write
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (Oracle NetSuite). Establish the FULL API nature INDEPENDENTLY of the provided context (which is a non-exhaustive helper): object families, ALL integration surfaces (SuiteTalk REST, SuiteTalk SOAP, SuiteAnalytics Connect, SuiteScript/RESTlets), the auth model (OAuth 2.0 AND OAuth 1.0a Token-Based Auth), read AND write/bidirectional capability (the Record Service supports Create/Update/Delete), pagination, rate limits (the concurrency governance model), and "what else the system exposes". Resolve canonical name, description, the per-account host TEMPLATE for NavigationBaseURL, icon class, and ProductTaxonomy. Set WriteCapability honestly from the docs (it is BINDING). Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (Oracle NetSuite). ClassName=NetSuiteConnector, ImportPath per the connectors package convention. Resolve CredentialTypeID via match-or-create against the connector ConnectionConfig key shape — NetSuite SuiteTalk REST needs accountId PLUS the chosen auth secrets (OAuth 2.0 client-credentials/auth-code bearer OR OAuth 1.0a TBA consumer key/secret + token id/secret). Pick or create the credential type whose key shape matches; do NOT force a single auth mode where the docs document both — record the supported modes for Configuration. Read SOURCE_STUDY when ready.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}

// ── SourceAudit ──────────────────────────────────────────────────────
// ENUMERATE the credential-free Declared object catalog IN CODE over the saved public docs/spec — the
// authoritative metadata-catalog is auth-gated, so the build-time Declared seed is the documented
// credential-free subset (the FULL gamut is reached at runtime via DiscoverObjects). Cross-check the count
// and FAIL on a material shortfall (object_catalog_must_be_script_output). Record the scope decision.
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },   // in-scope Declared object subset (SuiteTalk REST)
        EnumerationStdoutCount: { type: ['integer', 'null'] },
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        OutOfScopeFamilies: { type: 'array', items: { type: 'string' } },
        ScopeReason: { type: ['string', 'null'] },
        scopeDecision: { type: ['object', 'null'] },
        Gaps: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. The user-provided context lives at packages/Integration/connectors-registry/${VENDOR_SLUG}/sources/USER_PROVIDED_CONTEXT.md (Tier-1 for what it states) — reconcile it against independent public discovery, never substitute. Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split.\n` +
    `SCOPE (operator decision, made knowingly): the connector targets SuiteTalk REST Web Services — the Record Service (CRUD on standard + custom record types) + the SuiteQL query service. ENUMERATE the credential-free Declared object catalog IN CODE (a script's stdout over the saved public docs/spec — the documented standard record types + their OpenAPI field schemas where Oracle publishes them), because the authoritative /services/rest/record/v1/metadata-catalog is AUTH-GATED and unreachable on this credential-free run. Cross-check the enumerated count against an independent in-file signal; FAIL/escalate on a material shortfall (do NOT eyeball a list). Emit TaxonomyLeaves = the in-scope Declared record-type leaves and EnumerationStdoutCount = the script's count.\n` +
    `OUT OF SCOPE (record in OutOfScopeFamilies WITH ScopeReason, do NOT build): SuiteAnalytics Connect (JDBC/ODBC bulk read — not REST/JSON), SuiteTalk SOAP (legacy XML), RESTlets (customer-specific SuiteScript). The full breadth was established independently by BrandResearch; scope to SuiteTalk REST KNOWINGLY.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

// audit-source primitive re-ranks via the rubric — sources.SourcesFile is the input
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── SCOPE DECISION (planner judgment — awareness vs built subset) ────
// brand.ObjectFamilies = the FULL surface the study found. The modeled set is the in-scope SuiteTalk-REST
// subset, chosen knowingly. outOfScopeFamilies (SOAP / SuiteAnalytics / RESTlets) is recorded for
// awareness + a future-build expansion, NOT a blind union and NOT the context alone.
const scopeOfInterest = sources.TaxonomyLeaves ?? [];
const outOfScopeFamilies = (sources.OutOfScopeFamilies && sources.OutOfScopeFamilies.length > 0)
    ? sources.OutOfScopeFamilies
    : ['SuiteAnalytics Connect (JDBC/ODBC)', 'SuiteTalk SOAP', 'SuiteScript RESTlets'];
const scopeReason = sources.ScopeReason ?? brand.ScopeReason
    ?? 'Operator scoped to SuiteTalk REST Web Services (Record Service CRUD + SuiteQL reads) — the REST/JSON surface that fits BaseRESTIntegrationConnector and is the useful/reachable surface for this use case. SOAP/SuiteAnalytics/RESTlets are known-but-out-of-scope.';

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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Configuration MUST encode: the per-account host TEMPLATE (https://<accountId>.suitetalk.api.netsuite.com — accountId is a per-connection value, NEVER a baked account), the supported auth modes (OAuth 2.0 + OAuth 1.0a TBA), the SuiteQL transport (POST /services/rest/query/v1/suiteql), the runtime authoritative-discovery source (/services/rest/record/v1/metadata-catalog — candidate DiscoveryIsAuthoritative=true gated on evidence the catalog returns the complete gamut), and OutOfScopeObjectFamilies=${JSON.stringify(outOfScopeFamilies)} with ScopeReason="${scopeReason}". NavigationBaseURL = the documented host template, not a real account host. Cite every hard-constraint slot (batch/concurrency limits, CredentialTypeID) with provenance.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, MAX 1 per planner directive) ─────────
// Per the role file token-discipline: MAX_AMENDMENT_ROUNDS=1. The mechanical gates (0-field hard-fail,
// enforce-finding-floor, compute-source-diff, T1 invariants) catch defects in-pass; repeated re-extract is
// waste. Round 0 = initial extract+review; on a blocking gap the loop escalates (the amendment branch does
// not re-extract at MAX=1 — that is the intended token-conscious behavior for this run).
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

const MAX_AMENDMENT_ROUNDS = 2;
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
            objectList: scopeOfInterest,
            outOfScopeFamilies,
            scopeReason,
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs (Gap 10). Producer consults each CREDENTIAL-FREE source.
            // NEVER the connector being built / prior metadata / auth-gated data (circular-source defect).
            sourceBundle: {
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
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
        {
            vendor: VENDOR,
            contract: extractStats,
            provenanceSidecar: {},
            outputDir: `${RUNS_DIR}/output`,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            amendmentRound,
        }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/spec into your context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for: bijection (every emission ↔ a documented record-type/field), capability-honesty (every IO with SupportsWrite=true has CreateAPIPath+CreateMethod / Update* / Delete* per its declared capabilities; SuiteQL/read-only IOs have NONE), and scope-thinness (the Declared subset is the credential-free documented subset of the in-scope SuiteTalk-REST surface, with OutOfScopeObjectFamilies recorded — not a suspiciously thin slice of a famous-only list). Any zero-field object, bijection violation, or capability-without-CRUD-columns is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample, never the whole schema.`,
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
        log(`Amendment loop deadlock at round ${amendmentRound}: reviewer findings byte-identical to prior round → escalate`);
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review,
            amendmentRound, status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved.`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

if (review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} round(s) with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound, status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate — manifest.sourceDiffMustClose) ────
phase('SourceDiff');
let sourceDiff = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
    { universe: scopeOfInterest, extracted: extractStats.extractedObjects ?? [] }
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
        { universe: scopeOfInterest, extracted: extractStats.extractedObjects ?? [] }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── RealityProbe (S7 — v2 P2, EMPIRICAL) — DEGRADED unauthenticated (no credential) ───
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL host template / the scheme+host of an APIPath). NOTE: NetSuite's real host embeds a per-account id (<accountId>.suitetalk.api.netsuite.com); with NO credential there is no account, so probe the documented host template + path shapes for status codes — the per-claim status signal (real-vs-wrong path) holds regardless of account.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong). It probes the declared doors including /services/rest/record/v1[/<recordType>], /services/rest/query/v1/suiteql, and /services/rest/record/v1/metadata-catalog, param-probes limit/offset + the SuiteQL POST body where tolerated, and does OPTIONS/405 write-surface existence checks (NEVER a write call).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode, verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. a corrected /services/rest/... path, the correct limit/offset param form, demote a null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only, unauthenticated status check) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (MAX 2 per planner directive: round 0 build + 1 fix) ────────────
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
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. NetSuiteConnector extends BaseRESTIntegrationConnector; use generic per-operation CRUD; override only when genuinely idiosyncratic (e.g. the OAuth1 TBA HMAC signing or the SuiteQL POST-body read path).`
            : `Build the NetSuiteConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extends BaseRESTIntegrationConnector. Requirements: (a) AUTH — support OAuth 2.0 bearer AND OAuth 1.0a TBA (HMAC-SHA256 signing) via @memberjunction/integration-engine/auth-helpers (NEVER inline crypto), selected by Configuration; (b) per-account host built from Configuration.accountId (tenant-agnostic — NO baked account); (c) Record Service via generic per-operation BaseRESTIntegrationConnector CRUD reading the per-operation IO columns; (d) SuiteQL reads via POST /services/rest/query/v1/suiteql with the SQL in the body (override the read path only where the generic GET path cannot express it); (e) Offset pagination + hasMore/next-link envelope in ExtractPaginationInfo/NormalizeResponse; (f) lastModifiedDate watermark via WatermarkService where SupportsIncrementalSync; (g) DiscoverObjects/DiscoverFields ride the metadata-catalog MECHANISM (the endpoint + parse), NEVER a baked catalog — set DiscoveryIsAuthoritative only if evidence shows the catalog returns the complete gamut. Use generic CRUD; override only when genuinely idiosyncratic. Fixtures descend from probe captures or vendor doc examples (provenance-tagged).`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile
        ?? `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`;
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

    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append the line:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
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
            // registry SLUG, not ClassName (Finding A — ClassName≠slug deadlocks T1). T1 reads the real
            // ClassName from the metadata file for the three-way name check.
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,
            maxTier: MANIFEST.e2eTier,
        }
    );

    const hasRed = (ladder?.tierResults ?? []).some(r => r?.status === 'red');
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
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
            amendmentRound, codeRound, status: 'EscalatedCodeDeadlock',
            message: `Code-builder + verification-ladder deadlocked after ${codeRound + 1} attempts. Same failures recur.`,
        };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}

if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
        amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server) — MOCK mode (no credential) ──
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds are reachable by EITHER path (opaque credentialReference OR a read-only broker
        // plan). This is a [B] credential-free run → both null → MOCK. No e2e-mock-dodge concern (no creds).
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
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? { scopeOfInterest, outOfScopeFamilies, scopeReason },
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,
            brokerPlans: A?.brokerPlans ?? null,
            brand,
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? outOfScopeFamilies,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand,
    identity,
    sources,
    metadataResult,
    extractStats,
    frozen,
    review,
    amendmentRound,
    codeResult,
    codeRound,
    ladder,
    verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
