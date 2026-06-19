// iMIS (ASI — Advanced Solutions International) — per-vendor workflow. FRESH build, [B] credential-free.
// Emitted by the connector-creator planner. Locked primitives + bijection floor-check.
//
// RUN POSTURE: [B] NO credential. The emitted workflow runs the FULL non-live verification suite
//   (schema/contract validation vs OpenAPI/swagger, mock-server-from-spec, Postman replay where one
//   exists, endpoint/header probing, bijective completeness). NO live API calls. maxTier RECORDS the
//   non-live ceiling (T8 failure-mode injection) — it never restricts the non-live suite.
//
// MODE: FRESH. No prior ImisConnector.ts and no corpus entry. Author from first principles. The
//   IOIOFExtract amendment loop will pass sourceBundle.existingConnectorTsPath/existingMetadataPaths
//   anyway (harmless when absent — the extractor consults what exists, never fabricates from absence).
//
// ── NATURE STUDY (planner, from PUBLIC iMIS developer docs — independent of the provided context, which
//    is a non-exhaustive HELPER; the study determines the object/capability universe) ──
//   Sources studied: developer.imis.com (/reference/api-1, /docs/accessing-the-rest-api, /llms.txt).
//   • SHAPE: REST + OpenAPI. iMIS publishes swagger/OpenAPI "Data models and swagger json files" and a
//     machine index at developer.imis.com/llms.txt. JSON over HTTPS. The surface is a UNIFORM generic
//     Business-Object pattern: GET/POST/PUT/DELETE /api/{EntityName} (e.g. /api/party, /api/country),
//     GET-by-id /api/{EntityName}/{id}, plus _execute operation endpoints (e.g. IQA execution).
//   • OBJECT FAMILIES (full surface, for awareness): Party/Person/Organization/ComboParty (the membership
//     contact model), Event/EventRegistration, Commerce (Product, Dues, Invoice, Order, Cart, Payment),
//     Donation/Fundraising, Membership, Communication/Activity, Group, Content/iParts, Batch, Tag,
//     IQA (iMIS Query Architect — saved-query execution returning arbitrary result shapes), and the
//     EntityDefinition/business-object metadata surface. iMIS is HIGHLY configurable: the COMPLETE object
//     set per deployment is the credential-holder's BO definitions, knowable only at runtime via the
//     auth-gated EntityDefinition/$metadata endpoint → that is a Discovered surface, NOT a build-time one.
//   • AUTH: OAuth2 PASSWORD grant (ROPC). Token endpoint {base}/token (iMIS 2017 SP-F+) or
//     {base}/asiScheduler/token (SP-E and earlier); POST grant_type=password&username=&password=, returns
//     an access_token attached as 'Authorization: Bearer {token}'. Base URL is TENANT-SPECIFIC
//     (https://YourOrgSite.com/api) — there is NO single canonical host, so credential-free probing can
//     validate path SHAPES against the spec but cannot hit one fixed live host (recorded honestly below).
//     A documented alternate (logged-in session RequestVerificationToken header) is NOT the connector path.
//   • PAGINATION: iMIS list responses wrap a collection in an envelope ({Items:[...], Offset, Limit,
//     Count, HasNext, NextOffset}); paging is Offset/Limit (Offset-based). ResponseDataKey='Items'.
//     PaginationType=Offset. Confirm the exact param/envelope field names from the spec at extract time.
//   • INCREMENTAL: no universal delta endpoint; the documented incremental signal is filtering a BO/IQA
//     by an UpdatedOn timestamp (advanced query operators eq/gt/between are documented). Emit
//     SupportsIncrementalSync + IncrementalWatermarkField ONLY per-object where the spec proves the
//     field + filter is available; everywhere else content-hash/keyset idempotency. Provable-only.
//   • WRITE: documented across the generic BO surface (POST/PUT/DELETE /api/{EntityName}[/{id}]). Whether
//     a GIVEN object is writable is per-object — emit SupportsWrite + per-operation CRUD columns ONLY
//     where the spec proves the path+method; provable-only, never "famous vendor has writes".
//   • AUTHORITATIVE ENUMERATION: the full BO catalog is auth-gated (per-tenant EntityDefinition). The
//     connector's DiscoverObjects expresses the MECHANISM (call EntityDefinition at runtime) but bakes
//     NO answer. DiscoveryIsAuthoritative stays FALSE (the build-time Declared set is the docs-provable
//     core subset; runtime discovery adds the tenant's BOs but absence proves nothing → no deactivation).
//   • RATE LIMITS: not publicly documented as a fixed quota; leave Batch* null unless the spec/probe
//     surfaces a header. RateLimitPolicy deferred to the runtime hooks (conservative default).
//
// ── SCOPE DECISION (planner judgment) ──
//   The operator gave NO scope-narrowing note, so the connector-nature study determines the universe and
//   the build models the docs-provable CORE BO/family subset deeply (Party/Person/Organization/ComboParty,
//   Event/EventRegistration, Commerce Invoice/Order/Product/Payment, Membership/Dues, Donation,
//   Communication/Activity, Group, IQA-query, Tag) — the leaves the source-auditor enumerates BY SCRIPT
//   over the OpenAPI/llms.txt index. The per-tenant configurable BO catalog (the long tail of custom
//   business objects) is NOT a build-time surface — it is runtime-Discovered via EntityDefinition and is
//   recorded as Configuration.OutOfScopeObjectFamilies (with ScopeReason) so a future build/runtime knows
//   it exists without re-discovering. This is the "model the in-scope subset deeply; document the rest
//   deferred-with-reason" rule — NOT a blind union (would over-model a configurable platform) and NOT the
//   context alone (would under-model — the context named only /party + /country).

export const meta = {
    name: 'imis-build',
    description: 'FRESH build for iMIS (ASI association/membership management, REST + OpenAPI generic Business-Object API, OAuth2 password grant). [B] credential-free: full non-live suite (OpenAPI/swagger contract validation, mock-server-from-spec, endpoint/header probing, bijective completeness); RealityProbe DEGRADED to the unauthenticated per-claim status/format probe (tenant-specific host → path-shape verification vs spec, no fixed live host). Locked primitives + bijection floor-check. maxTier T8 (non-live ceiling).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0: DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort-cheap.' },
        { title: 'BrandResearch', detail: 'Canonical iMIS/ASI brand + FULL API nature (generic BO families, OAuth2 password grant, Offset/Limit paging, write surface, IQA) independent of the provided context.' },
        { title: 'Identity', detail: 'Integration row identity + OAuth2 (password-grant) CredentialTypeID via match-or-create.' },
        { title: 'SourceAudit', detail: 'Audit/rank credential-free OpenAPI/swagger + docs; enumerate in-scope BO TaxonomyLeaves BY SCRIPT over the spec/llms.txt index.' },
        { title: 'MetadataWrite', detail: 'Integration non-identity slots + Configuration (Auth=oauth2-password, tenant-base-URL note, OutOfScopeObjectFamilies = per-tenant configurable BOs, ScopeReason).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline; provable PK/FK, Offset/Limit paging, per-object write columns + watermark only where the spec proves them; verify + write-back.' },
        { title: 'FreezeContract', detail: 'Adversarial-verify the assembled contract; persist with hash.' },
        { title: 'IndependentReview', detail: 'Different-model (sonnet) adversarial review — slim counts + sample.' },
        { title: 'SourceDiff', detail: 'Completeness gate over in-scope leaves (must close, else ONE gap-fill recovery).' },
        { title: 'RealityProbe', detail: 'S7 DEGRADED (no credential, tenant-specific host): per-claim FORMAT/SHAPE verdicts vs the OpenAPI spec (path templating, Offset/Limit param presence, declared-PK present in spec response models, watermark filter param presence, write-surface method presence). NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the frozen contract.' },
        { title: 'CodeBuild', detail: 'Connector class (BaseRESTIntegrationConnector, OAuth2 password grant via OAuth2TokenManager, Items-envelope NormalizeResponse, Offset/Limit ExtractPaginationInfo, EntityDefinition DiscoverObjects mechanism) + vitest.' },
        { title: 'VerificationLadder', detail: 'T0..T8 in-isolation (StaticValidation, Invariants, CrossProgrammatic, DocSelfCheck, MockedFixture, MockHTTPServer, LocalSQLite, OpenAPIValidation, FailureModeInjection).' },
        { title: 'HybridE2E', detail: 'Deep §1→§6 e2e through MJAPI → SQL Server, FRESH DB, MOCK mode (no credential). Outcome gates: rowcounts vs mock ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Postgres SUSPENDED.' },
        { title: 'FloorCheck', detail: 'Bijection slot table + manifest + v2 EMPIRICAL gates. Verdict states the EMPIRICAL/LINT split + the credential-free ceiling honestly.' },
    ],
};

// Normalize args FIRST (the model→Workflow path may deliver args as a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'imis';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
// Per-vendor folder metadata layout (Phase 0 canonical).
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;
const PROBE_OUT = `${RUNS_DIR}/output`;
// OAuth2 password-grant credential type for iMIS.
const OAUTH_CRED_TYPE_NAME = 'iMIS OAuth2 Password';
const OAUTH_CRED_SCHEMA = `metadata/credential-types/schemas/imis-oauth.schema.json`;

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',            // [B] non-live ceiling (failure-mode injection); never gates the non-live suite
    adversarialVerifyMinReviewers: 2,        // token-conscious default (escalate to 3 only if hard)
    authPattern: 'oauth2-password',          // OAuth2 ROPC (username+password) → Bearer
};

// Token budget guardrails (plan-level): keep amendment caps low; mechanical gates catch defects in-pass.
const MAX_AMENDMENT_ROUNDS = 4;              // extract loop: round 0 + up to FOUR amends. Rounds 1-3 converged the
                                            // catalog (1→207 IOs) but whack-a-mole'd two RECURRING gap CLASSES
                                            // (operation-only endpoints marked paginatable; Supports* flags undefined
                                            // where per-op columns exist) because the shared pipeline applies reviewer
                                            // fixes SURGICALLY to NAMED IOs only. Round 4 carries CATALOG-WIDE rules
                                            // (GENERAL_CATALOG_RULES below) so the extractor fixes BOTH classes across
                                            // EVERY IO in one pass instead of one named batch per round.

// Plan-local CATALOG-WIDE amendment rules (injected ahead of the reviewer's per-IO findings on every
// amendment round). The shared extract-iiof-pipeline frames per-slot FixInstructions as "surgical edits on
// the NAMED existing objects", which makes recurring gap-classes converge only one named batch per round.
// These rules are scoped to ALL IOs so the extractor derives the two recurring attributes generally — the
// same "mechanical rule beats role-prose" principle the pipeline already uses for its §0b finding-floor.
// Edited ONLY in this iMIS plan; the shared primitive + agent role files are untouched (other connector
// builds are unaffected). Both rules are derivable deterministically: pagination from GET-list presence in
// the spec, capability from the per-operation columns already written to the metadata.
const GENERAL_CATALOG_RULES = [
    {
        slot: 'io.*.SupportsPagination + io.*.PaginationType',
        scope: 'ALL IntegrationObjects — catalog-wide, NOT only previously-named objects',
        operation: 'derive-general',
        rule: 'For EVERY IO: set SupportsPagination=true & PaginationType=Offset ONLY when the spec defines a GET on the COLLECTION path (GET /{EntityName} that returns the Items/paged envelope). If the IO exposes only POST /{EntityName}/_execute, POST/PUT/DELETE /{EntityName}[/{id}], and/or getById GET /{EntityName}/{id} — i.e. NO GET-list collection — set SupportsPagination=false & PaginationType=None. Apply across the WHOLE catalog this pass; do not wait to be named per-IO.',
        rationale: 'Operation-only / getById-only endpoints marked paginatable crash at runtime paginate. Recurring class across rounds (OrganizationMerge, PartyMerge, ComboOrder, Order, DuesImportPackage, GiftAdjustment, ItemSale, AutoPayProcessor, QueryParameterDefinition, …) — fix GENERALLY, not per-named-IO.',
        requiresEscalation: false,
    },
    {
        slot: 'io.*.SupportsCreate + io.*.SupportsUpdate + io.*.SupportsDelete',
        scope: 'ALL IntegrationObjects — catalog-wide',
        operation: 'derive-general',
        rule: 'For EVERY IO: SupportsCreate = (CreateAPIPath AND CreateMethod both non-null); SupportsUpdate = (UpdateAPIPath AND UpdateMethod non-null); SupportsDelete = (DeleteAPIPath AND DeleteMethod non-null). Derive from the per-operation columns ALREADY written to the metadata. Never leave a Supports* flag undefined when its path+method pair is set (bijection floor-check requires the match), and never set it true when the pair is absent.',
        rationale: 'Capability↔column bijection. Recurring class: ~189 IOs had Create paths+methods but SupportsCreate undefined (same for Update/Delete).',
        requiresEscalation: false,
    },
];
const MAX_CODE_BUILD_ROUNDS = 2;             // code loop: round 0 + at most ONE amend

// ── EnvPreflight (S0) ────────────────────────────────────────────────
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
    `EnvPreflight (S0) for the ${VENDOR} build — DETERMINISTIC FINDER (you RUN the script; you never eyeball-check).\n` +
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn, turbo dist staleness, and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (env-specific per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists is non-empty: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted, restore per the runbook before proceeding.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — the 13 downstream stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
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
        ObjectFamilies: { type: 'array', items: { type: 'string' } },
        AuthModels: { type: 'array' },
        WriteCapability: { type: ['object', 'null'] },
        ScopeReason: { type: ['string', 'null'] },
        ResidualDoubts: { type: 'array' },
    },
};
const brand = await agent(
    `Research vendor "iMIS" (ASI — Advanced Solutions International), an association/membership management system. Resolve canonical name, description, navigation URL, icon class, and the FULL API nature from PUBLIC developer docs (developer.imis.com — /reference/api-1, /docs/accessing-the-rest-api, /llms.txt, the swagger/OpenAPI "Data models and swagger json files"), INDEPENDENT of the provided context (which named only /party + /country and is a non-exhaustive helper — absence there is NOT absence in the system).\n` +
    `Establish: (a) ObjectFamilies = the FULL surface — the generic Business-Object pattern (GET/POST/PUT/DELETE /api/{EntityName}, GET /api/{EntityName}/{id}, _execute operations) and the families it covers: Party/Person/Organization/ComboParty, Event/EventRegistration, Commerce (Product/Dues/Invoice/Order/Cart/Payment), Donation/Fundraising, Membership, Communication/Activity, Group, IQA (saved-query execution), Tag, and the EntityDefinition BO-metadata surface. Note that iMIS is HIGHLY CONFIGURABLE — the complete per-deployment object set is the tenant's BO definitions, knowable only at runtime via the auth-gated EntityDefinition endpoint (a Discovered surface).\n` +
    `(b) AuthModels — record OAuth2 PASSWORD grant (ROPC) PRIMARY: token endpoint {base}/token (2017 SP-F+) or {base}/asiScheduler/token (SP-E and earlier), POST grant_type=password&username&password → access_token, header 'Authorization: Bearer {token}', base URL is TENANT-SPECIFIC. Record the logged-in-session RequestVerificationToken header ONLY as a documented alternate.\n` +
    `(c) WriteCapability — the generic BO surface documents POST/PUT/DELETE; capture this as a BINDING finding (per-object writability is proven later by the extractor). (d) Offset/Limit Items-envelope pagination, and the UpdatedOn-filter incremental signal.\n` +
    `ObjectFamilies = the full surface (awareness). ScopeReason = why the build models the docs-provable CORE BO/family subset deeply while the per-tenant configurable BO long tail is runtime-Discovered out-of-scope. ResidualDoubts: name what you could NOT confirm from public docs (exact token-endpoint path per version, exact Offset/Limit/HasNext envelope field names, which BOs expose an UpdatedOn watermark, public rate-limit quota).`,
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
        CredentialDecision: { type: 'object' },
    },
};
const identity = await agent(
    `Fill Integration row identity slots for "${brand.CanonicalName}" (iMIS). FRESH build — no prior connector. Propose ClassName='ImisConnector', ImportPath='@memberjunction/integration-connectors', Name='iMIS' (CONFIRM the canonical display name against the source; ASI's product is styled "iMIS"). Public class IntegrationName getter must return the exact Integrations.Name string.\n` +
    `CREDENTIAL TYPE — OAuth2 PASSWORD grant. Resolve CredentialTypeID by MATCH-OR-CREATE against the connector's ConnectionConfig key shape: an OAuth2 password-grant type named '${OAUTH_CRED_TYPE_NAME}' whose schema (${OAUTH_CRED_SCHEMA}) describes: BaseURL (the tenant's site/api endpoint, REQUIRED), Username (REQUIRED), Password (secret, REQUIRED), TokenURL (optional override; default {BaseURL}/token), ClientId (optional — some deployments register a client). Required = BaseURL + Username + Password. If a matching credential type already exists in the DB, reuse its ID; else author the schema file (model on metadata/credential-types/schemas/oauth2-client-credentials.schema.json adapted to password grant) + a matching .mj-sync credential-type record and set the Integration's CredentialTypeID to it. Record CredentialDecision: {credType:'${OAUTH_CRED_TYPE_NAME}', authPattern:'oauth2-password', credentialSchemaFile:'${OAUTH_CRED_SCHEMA}', baseUrlIsTenantSpecific:true}. Provable-only from docs — NEVER read credential bytes.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}
const CLASS_NAME = identity.Identity?.ClassName ?? 'ImisConnector';

// ── SourceAudit ──────────────────────────────────────────────────────
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        OutOfScopeFamilies: { type: 'array', items: { type: 'string' } },
        VendorDocsPaths: { type: 'array' },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
        OpenAPIPath: { type: ['string', 'null'] },
        AuthDocs: { type: 'object' },
        PaginationDocs: { type: 'object' },
        Gaps: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank the CREDENTIAL-FREE authoritative sources for ${brand.CanonicalName} (developer.imis.com OpenAPI/swagger "Data models and swagger json files", /reference/api-1, /docs/accessing-the-rest-api, the /llms.txt OpenAPI index). DOWNLOAD the OpenAPI/swagger spec(s) to disk and set OpenAPIPath to the saved file; read-once-to-disk-then-grep (never re-read the big spec across turns). Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split.\n` +
    `ENUMERATE the in-scope object universe BY SCRIPT over the saved OpenAPI spec / llms.txt index — NOT by eyeballing or listing objects in context (a prior connector shipped 16 of ~38 because the auditor eyeballed a big doc; the catalog MUST be a script's stdout). Set EnumerationStdoutCount to the script's count. Emit TaxonomyLeaves = the docs-provable CORE BO/family leaves (Party/Person/Organization/ComboParty, Event/EventRegistration, Commerce Invoice/Order/Product/Payment/Cart/Dues, Donation, Membership, Communication/Activity, Group, IQA-query, Tag — every leaf the spec enumerates in that core set). Emit OutOfScopeFamilies = the per-tenant CONFIGURABLE custom Business Objects (knowable only at runtime via the auth-gated EntityDefinition endpoint) with the scope reason; these become Discovered at runtime, not Declared at build.\n` +
    `Capture AuthDocs = {grant:'password', tokenEndpoint:'{base}/token', tokenEndpointLegacy:'{base}/asiScheduler/token', header:'Authorization: Bearer {token}', baseUrlTenantSpecific:true} and PaginationDocs = {type:'Offset', responseDataKey:'<the Items collection key from the spec>', offsetParam:'<from spec>', limitParam:'<from spec>', hasNextField:'<from spec>'} — each citing the source URL. These feed extract-iiof-pipeline + the metadata-writer + RealityProbe.`,
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
    `Populate the Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} in ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit; atomic writes + backups). Set Icon. Leave NavigationBaseURL null OR record that the base URL is TENANT-SPECIFIC (no single canonical host) — do NOT bake a fake host. Leave BatchMaxRequestCount/BatchRequestWaitTime null unless the spec/docs prove a fixed rate quota (provable-only).\n` +
    `Write Configuration.Auth = {model:'oauth2', grant:'password', tokenEndpoint:'{BaseURL}/token', tokenEndpointLegacy:'{BaseURL}/asiScheduler/token', tokenURLOverrideKey:'TokenURL', credentialFields:['BaseURL','Username','Password','ClientId?'], header:'Authorization: Bearer {accessToken}', baseUrlTenantSpecific:true} citing the auth docs. Record the logged-in-session RequestVerificationToken header as Configuration.Auth.documentedAlternate only.\n` +
    `Write Configuration.Pagination = ${JSON.stringify(sources.PaginationDocs ?? { type: 'Offset', responseDataKey: 'Items', offsetParam: 'Offset', limitParam: 'Limit', hasNextField: 'HasNext' })} (Offset/Limit Items-envelope). ` +
    `Write Configuration.Discovery = {mechanism:'EntityDefinition', note:'per-tenant configurable Business Objects are enumerated at runtime via the auth-gated EntityDefinition endpoint; the build-time Declared set is the docs-provable core subset', authoritative:false} (DiscoveryIsAuthoritative stays false → absence in a refresh proves nothing → never deactivate). ` +
    `Write Configuration.OutOfScopeObjectFamilies = ${JSON.stringify(sources.OutOfScopeFamilies ?? ['tenant-configured custom Business Objects (runtime EntityDefinition)'])} with ScopeReason='${(brand.ScopeReason ?? 'iMIS is a highly configurable platform; the build models the docs-provable core BO/family subset deeply, while the per-tenant configurable BO long tail is runtime-Discovered via EntityDefinition (auth-gated, not a build-time surface)').replace(/'/g, '')}'.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, MAX_AMENDMENT_ROUNDS) ──
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

let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

while (amendmentRound <= MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.OpenAPIPath ?? sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            outOfScopeFamilies: sources.OutOfScopeFamilies ?? [],
            scopeReason: brand.ScopeReason ?? 'docs-provable core BO/family subset; per-tenant configurable BOs runtime-Discovered',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // FRESH build — sourceBundle reads only CREDENTIAL-FREE public docs/spec. existing* paths are
            // passed for the rare prior-artifact case (harmless absent; the extractor consults what exists,
            // never fabricates from absence and NEVER reads the connector/dist/prior-metadata as truth).
            sourceBundle: {
                existingConnectorTsPath: `packages/Integration/connectors/src/${CLASS_NAME}.ts`,
                existingMetadataPaths: [METADATA_FILE].filter(Boolean),
                openapiPath: sources.OpenAPIPath ?? sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: [],
                postmanPaths: [],
            },
            // PER-OBJECT honesty (provable-only): emit Offset/Limit paging (PaginationType=Offset,
            // ResponseDataKey=the Items envelope key) where the spec proves a list returns the envelope;
            // SupportsWrite + per-operation CRUD columns (CreateAPIPath/CreateMethod/CreateBodyShape/
            // CreateBodyKey/CreateIDLocation, Update*, DeleteAPIPath/DeleteMethod/DeleteIDLocation) ONLY
            // where the spec proves POST/PUT/DELETE /api/{EntityName}[/{id}] for THAT object; DeleteMethod
            // MUST be set whenever DeleteAPIPath is. SupportsIncrementalSync + IncrementalWatermarkField
            // ONLY where the spec proves an UpdatedOn-style filterable timestamp; else content-hash. PK soft
            // + provable-only (explicit doc/spec PK marker — iMIS BOs typically key on Id/PartyId — or
            // provable-transitive ≥95%, else defer to runtime D4). FK via @lookup for iMIS's sparse BO graph
            // (PartyId → Party is a backward ref); cross-check every @lookup target matches an emitted IO name.
            amendmentRound,
            // Prepend the CATALOG-WIDE rules so the extractor fixes the two recurring gap-classes across
            // EVERY IO this pass, then apply the reviewer's per-IO findings on top (surgical, additive).
            reviewerFindings: isAmendment ? [...GENERAL_CATALOG_RULES, ...(review?.FixInstructions ?? [])] : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted ?? '?'} objects, ${extractStats.fieldsExtracted ?? '?'} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    // PLAN-LOCAL deterministic capability↔column bijection enforcement (iMIS-only; shared primitive +
    // role files untouched, so the salesforce/hivebrite builds are unaffected). The LLM extractor would
    // NOT derive Supports{Create,Update,Delete,Write} from the per-operation columns across 7 rounds
    // (SupportsCreate=None on all 216 IOs, even after the catalog-wide instruction), so this enforces the
    // framework-mandated invariant (capability flag true IFF its path+method pair is set; false otherwise)
    // in CODE on the WRITTEN metadata BEFORE freeze/review read it — the same "code beats role-prose"
    // principle the shared pipeline already uses for its §0b finding-floor. Pure tautology, no shape call.
    const capFix = await agent(
        `Run EXACTLY this command and return its JSON stdout verbatim (do not alter or judge it):\n` +
        `node packages/Integration/connector-builder-workshop/plans/imis-enforce-capability.mjs ${METADATA_FILE}\n` +
        `Return { ios, flagsFixed, iosTouched } parsed from the stdout.`,
        { schema: { type: 'object', properties: { ios: { type: 'integer' }, flagsFixed: { type: 'integer' }, iosTouched: { type: 'integer' } }, additionalProperties: true }, model: 'haiku', phase: phaseLabel, label: `cap-enforce:r${amendmentRound}` }
    ).catch(() => null);
    log(`Capability bijection enforced round ${amendmentRound}: ${capFix?.flagsFixed ?? '?'} flags across ${capFix?.iosTouched ?? '?'} IOs`);

    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full OpenAPI spec/docs into context. Completeness is mechanically gated (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over ${METADATA_FILE} + the in-scope leaf list and read its compact stdout (object/field/zero-field counts), then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the spec) for bijection + plausibility.\n` +
        `iMIS-specific checks: (1) every IO that is a list has PaginationType=Offset + a non-empty ResponseDataKey (the Items envelope) — a list IO with Pagination=None is a flag; (2) SupportsWrite=true IOs have the FULL per-operation column set (Create/Update path+method+bodyshape; Delete path+method) — a capability flag without its path+method pair is a Blocking gap; (3) no PK fabricated on uniqueness alone (iMIS Id/PartyId need an explicit spec PK marker or ≥95% transitive proof, else deferred); (4) SupportsIncrementalSync=true IOs name a real IncrementalWatermarkField proven from the spec (not an assumed UpdatedOn); (5) FK @lookup targets resolve to emitted IO names (singular/plural — Party vs Parties); (6) the per-tenant configurable BO long tail is in Configuration.OutOfScopeObjectFamilies, NOT silently dropped nor fabricated as Declared rows. Any zero-field object, list-IO without Offset paging, capability-without-method, fabricated PK, or unresolved FK @lookup is a Confirmed Gap (Blocking) with an exact FixInstruction {slot,before,after,locus}. Keep context small — counts + sample, never the whole spec.`,
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
            brand, identity, sources, metadataResult, extractStats, frozen, review,
            amendmentRound, status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

if (review.ConfirmedGapsBlocking > 0 && amendmentRound > MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS + 1} rounds with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound, status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS + 1}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer evidence: ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate — must close over in-scope leaves) ──
phase('SourceDiff');
// SF heads-up #2: the extractor PERSISTS every IO to disk via MCP but its StructuredOutput RETURN
// truncates on large catalogs (extractStats.extractedObjects = ['__SEE_FILE__'], objectsExtracted=1
// while 216 IOs are on disk). Feeding that truncated return to the completeness gate makes EVERY
// in-scope leaf look "missing" → a phantom FULL-CATALOG GapFill that re-extracts what's already there.
// Reconcile the extracted-object list from the PERSISTED metadata file (the source of truth) instead.
// Plan-local; the shared extract-iiof-pipeline primitive is NOT touched (hivebrite build unaffected).
async function reconcileExtractedFromFile() {
    const r = await agent(
        `Run EXACTLY this and return its JSON stdout verbatim (do not alter it):\n` +
        `node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const root=Array.isArray(j)?j[0]:j;const ios=(root.relatedEntities&&root.relatedEntities['MJ: Integration Objects'])||[];process.stdout.write(JSON.stringify({names:ios.map(io=>io.fields&&io.fields.Name).filter(Boolean)}))" ${METADATA_FILE}\n` +
        `Return { names: string[] } parsed from stdout.`,
        { schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, additionalProperties: true }, model: 'haiku', phase: 'SourceDiff', label: 'reconcile-extracted' }
    ).catch(() => null);
    return (r?.names && r.names.length > 0) ? r.names : (extractStats.extractedObjects ?? []);
}
let extractedFromFile = await reconcileExtractedFromFile();
log(`SourceDiff reconcile: ${extractedFromFile.length} IOs from metadata file (truncated return reported ${(extractStats.extractedObjects ?? []).length})`);
let sourceDiff = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
    { universe: sources.TaxonomyLeaves ?? [], extracted: extractedFromFile }
);
log(`SourceDiff: ${sourceDiff.missing.length} missing, ${sourceDiff.orphan.length} orphan (universe=${sourceDiff.universeCount}, extracted=${sourceDiff.extractedCount})`);

if (sourceDiff.missing.length > 0) {
    phase('GapFill');
    await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/gap-fill-fork.workflow.js' },
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { openapiPath: sources.OpenAPIPath ?? sources.SourcesFile }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
    );
    const recovered = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        { vendor: VENDOR, sourceID: sources.OpenAPIPath ?? sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output`, runID: A?.runID, adversarialN: MANIFEST.adversarialVerifyMinReviewers }
    );
    extractStats.fieldsExtracted = (extractStats.fieldsExtracted ?? 0) + (recovered.fieldsExtracted ?? 0);
    // Re-reconcile from the file after gap-fill recovery (same truncation reason as above).
    extractedFromFile = await reconcileExtractedFromFile();
    extractStats.extractedObjects = extractedFromFile;
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: sources.TaxonomyLeaves ?? [], extracted: extractedFromFile }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── RealityProbe (S7 — DEGRADED unauthenticated, EMPIRICAL) ───────────
// [B] NO credential AND a TENANT-SPECIFIC base URL (no single canonical host to hit). The probe therefore
// degrades to the FORMAT/SHAPE verdict mode: it validates each DECLARED claim against the OpenAPI/swagger
// SPEC the source-auditor downloaded — read-only, deterministic, verdicts only (NEVER authors metadata).
// This is the credential-free analogue of the live status probe: it catches the GrowthZone defect class
// (wrong path templates, dead pagination params, PKs on fields the spec marks always-null, a write surface
// declared where the spec has no mutation) BEFORE code is built on the contract. Per-claim verdicts:
//   • path        — the declared APIPath / Create/Update/Delete path template exists in the spec (confirmed)
//                    vs not-in-spec (wrong). Where a tenant host is reachable unauthenticated the script
//                    additionally does the 401/403=gated-exists / 404=wrong status probe; absent a host it
//                    reports format-verified-no-creds.
//   • pagination  — the declared Offset/Limit params + Items envelope field are real params/fields in the
//                    spec's operation + response model (advances-form vs alternates).
//   • pk          — each declared-PK field is present in the spec's response model for that object.
//   • watermark   — the declared IncrementalWatermarkField is a real filterable spec param/field.
//   • writeSurface— the declared SupportsWrite path+method exists as a spec mutation operation.
// VERDICTS IN, AUTHORSHIP OUT: metadataDelta MUST be false; floor-check rejects probe-originated deltas.
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },               // 'unauthenticated-format' (this run) | 'credentialed-readonly'
        verdicts: { type: 'array' },            // { object, kind: path|pagination|pk|watermark|writeSurface, verdict: confirmed|gated-exists|wrong|unverified, evidence, resolved? }
        metadataSha256: { type: 'string' },     // sha256 of the metadata file the script read (anti-fabrication anchor)
        claims: { type: 'integer' },
        confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' },
        unverified: { type: 'integer' },
        achievedCeiling: { type: 'string' },    // 'format-verified-no-creds' (expected this run)
        metadataDelta: { type: 'boolean' },     // MUST be false — verdicts only
        notes: { type: 'array' },
    },
};
const realityProbe = await agent(
    `RealityProbe (S7, DEGRADED — no credential, tenant-specific host) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. The OpenAPI/swagger spec the source-auditor saved is at ${sources.OpenAPIPath ?? '(sources.SourcesFile)'}. Pass it so the script verifies each declared claim against the SPEC (path templates, Offset/Limit params + Items envelope, declared-PK present in response models, watermark filter param presence, write-surface mutation presence).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --spec ${sources.OpenAPIPath ?? sources.SourcesFile} --mode format --out ${PROBE_OUT}\n` +
    `   (NO credential and NO single canonical host → FORMAT mode: confirmed = the claim matches the spec; wrong = the declared path/param/field is NOT in the spec; unverified = not checkable without live data. The achievedCeiling is 'format-verified-no-creds'.)\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated-format', verdicts, metadataSha256, claims, confirmed, gatedExists:0, unverified, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false) and you may NOT alter the script's verdicts — relay them exactly. In notes, name the claims that remain UNVERIFIED for lack of a live credential (honest gap statement).`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE mandatory round when the probe falsified a declared claim) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe against the OpenAPI spec:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} via mcp-mj-metadata — corrections are sourced from the DOCS/SPEC (re-read the cited spec operation; pick the spec-supported form the probe confirmed, e.g. the correct path template, the real Offset/Limit param names, the actual envelope key, demote a spec-absent PK to content-hash identity, drop a write capability the spec has no mutation for). Then RE-PROBE just the corrected claims (format mode) to confirm, and mark each verdict resolved=true. Never invent values the spec + probe don't support; an uncorrectable claim stays falsified and escalates. Reality outranks the frozen contract.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    const stillWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true);
    log(`ProbeAmend: ${stillWrong.length} still unresolved`);
    if (stillWrong.length > 0) {
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, realityProbe,
            amendmentRound, status: 'EscalatedProbeUnresolved',
            message: `RealityProbe falsified ${stillWrong.length} declared claim(s) the docs/spec could not correct — human intervention required.`,
        };
    }
}

// ── CodeBuild + ladder amendment loop (MAX_CODE_BUILD_ROUNDS) ─────────
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

// ── MatrixRegen (SF heads-up #3) — rebuild EXTRACTION_REPORT_MATRIX.csv from the PERSISTED metadata
// BEFORE the verification ladder. The extractor's truncated StructuredOutput left the matrix at 2 rows
// vs 216 IOs → a T1 PkSourceMatrix FALSE-fail (an artifact bug, not a code bug) that CodeBuild would
// fruitlessly chase round after round. The helper writes one honest row per emitted IO (PKVerdict from
// the actual PK IOF; rich rows preserved). Plan-local; shared primitive untouched.
phase('MatrixRegen');
const matrixOut = `${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv`;
const matrixRegen = await agent(
    `Run EXACTLY this command and return its JSON stdout verbatim (do not alter or judge it):\n` +
    `node packages/Integration/connector-builder-workshop/floor/build-matrix-from-metadata.mjs ${METADATA_FILE} ${matrixOut} ${matrixOut}\n` +
    `Return { totalIOs, rowsWritten, pkEmitRows, preservedRichRows } parsed from stdout.`,
    { schema: { type: 'object', properties: { totalIOs: { type: 'integer' }, rowsWritten: { type: 'integer' }, pkEmitRows: { type: 'integer' }, preservedRichRows: { type: 'integer' } }, additionalProperties: true }, model: 'haiku', phase: 'MatrixRegen', label: 'matrix-regen' }
).catch(() => null);
log(`MatrixRegen: ${matrixRegen?.rowsWritten ?? '?'} rows from ${matrixRegen?.totalIOs ?? '?'} IOs, ${matrixRegen?.pkEmitRows ?? '?'} PK-emit (was 2-row truncated)`);

let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound <= MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector at packages/Integration/connectors/src/${CLASS_NAME}.ts. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. OAuth2 password grant via OAuth2TokenManager (auth-helpers) — never inline token/crypto logic. Generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build a NEW ${brand.CanonicalName} (iMIS) connector class at packages/Integration/connectors/src/${CLASS_NAME}.ts from the frozen contract at ${frozen.contractPath}. ClassName '${CLASS_NAME}', @RegisterClass(BaseIntegrationConnector,'${CLASS_NAME}') (grandparent registration), IntegrationName getter returning the exact Integrations.Name, extends BaseRESTIntegrationConnector.\n` +
              `AUTH — OAuth2 PASSWORD grant via OAuth2TokenManager from '@memberjunction/integration-engine/auth-helpers' (NEVER inline crypto/token logic): Authenticate/BuildHeaders POST grant_type=password&username&password to the token endpoint ({BaseURL}/token, or the TokenURL credential override; the legacy {BaseURL}/asiScheduler/token is a documented fallback path), cache+refresh the access_token, send 'Authorization: Bearer {accessToken}'. Read credential fields from the ConnectionConfig (BaseURL, Username, Password, TokenURL?, ClientId?) — NEVER read credential bytes in this build; the connector reads them at runtime. Base URL is the tenant's BaseURL — NO hardcoded host.\n` +
              `PAGINATION — override ExtractPaginationInfo for the Offset/Limit Items-envelope (read Offset/Limit/HasNext/NextOffset from the response per the contract; advance Offset by Limit until HasNext is false). NormalizeResponse unwraps the Items collection (ResponseDataKey).\n` +
              `DISCOVERY — DiscoverObjects/DiscoverFields express the MECHANISM (call the auth-gated EntityDefinition endpoint at runtime to enumerate the tenant's BO catalog + fields) — bake NO catalog answer in code; the Declared core set comes from metadata. DiscoveryIsAuthoritative stays false (default). CATALOG is driven from metadata (do NOT hardcode the object list in code).\n` +
              `CRUD — use the generic per-operation BaseRESTIntegrationConnector path (CreateRecord/UpdateRecord/DeleteRecord read the per-operation IO columns); route every create through BuildCreatedResult (fail loudly on empty ID); DeleteMethod is metadata-driven (NOT assumed DELETE). Full-record pass-through (Fields=raw). SupportsWrite per-object exactly as the contract declares — no 501 stubs for a true capability.\n` +
              `Write the vitest test file (__tests__/${CLASS_NAME}.test.ts) covering: OAuth2 password token mint/refresh (mock the token endpoint), Bearer header injection, DiscoverObjects (EntityDefinition mechanism, mocked), DiscoverFields, Offset/Limit pagination (multi-page advance + HasNext termination), NormalizeResponse Items-envelope unwrap, generic CRUD per-operation columns for a write-capable IO, FetchChanges incremental for any watermarked IO. Register in connectors/src/index.ts.`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? `packages/Integration/connectors/src/${CLASS_NAME}.ts`;
    if (codeResult.BuildClean) {
        const fileCheck = await agent(
            `Run exactly: test -f ${CONNECTOR_FILE} && echo CONNECTOR_FILE_EXISTS || echo CONNECTOR_FILE_MISSING. Return whether the connector source file exists at ${CONNECTOR_FILE}.`,
            { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Exists'], properties: { Exists: { type: 'boolean' }, Path: { type: 'string' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `verify-file:r${codeRound}` }
        );
        if (!fileCheck.Exists) {
            log(`CodeBuild round ${codeRound}: BuildClean reported but connector file missing at ${CONNECTOR_FILE} → forcing non-clean`);
            codeResult.BuildClean = false;
            codeResult.BuildErrors = [...(codeResult.BuildErrors ?? []), { code: 'CONNECTOR_FILE_MISSING', locus: CONNECTOR_FILE }];
        }
    }

    if (!codeResult.BuildClean) { codeRound++; continue; }

    // Ensure the connector is registered in connectors/src/index.ts (idempotent).
    await agent(
        `Ensure the connector ${CLASS_NAME} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${CLASS_NAME}, append:\n  export { ${CLASS_NAME} } from './${CLASS_NAME}.js';\nIf it already exists, make no change. Touch no other line.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // Stage artifacts into the registry dir where mj-test-runner resolves them.
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY from repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${CLASS_NAME}.ts" ${REGISTRY_DIR}/src/${CLASS_NAME}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${CLASS_NAME}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', model: 'sonnet', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            // mj-test-runner resolves Connector → connectors-registry/<slug>/; pass the registry SLUG, not
            // ClassName (Finding A — ClassName≠slug deadlocks T1). T1 reads the real ClassName from metadata.
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,   // null — [B] credential-free
            maxTier: MANIFEST.e2eTier,   // T8 — failure-mode injection ceiling for in-isolation rungs
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
        log(`Code+Ladder deadlock at round ${codeRound}: identical failures → escalate`);
        return {
            runID: A?.runID, vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, realityProbe, codeResult, ladder,
            amendmentRound, codeRound, status: 'EscalatedCodeDeadlock',
            message: `Code-builder + verification-ladder deadlocked after ${codeRound + 1} attempts. Same failures recur.`,
        };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}

if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound > MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS + 1} rounds`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, realityProbe, codeResult, ladder,
        amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS + 1}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§6 → SQL Server, MOCK mode — no credential) ───
// REQUIRED on every build (NEVER omit; floor-check fails a null hybridE2E). The T0..T8 ladder exercises the
// connector in isolation; this proves it THROUGH MJAPI into a real SQL Server DB (discover → ApplyAll →
// upsert → contentHash → incremental/keyset → idempotent). [B] NO credential → MOCK mode (the credential-
// free engine floor): a spec-generated mock vendor feeds the §1→§6 skeleton; outcome gates assert real
// records land (rowcounts vs mock ground truth, two-pass zero-growth idempotency, first-sync completeness,
// custom-column capture engaged, bounded typing). This is NOT a dodge — there is no credential to run live;
// floor-check's e2e-mock-dodge gate only fires if creds existed and mock was chosen anyway (they don't here).
// DIALECT: SQL SERVER ONLY — Postgres SUSPENDED (fresh-PG CodeGen blocked by stranded v5.34/v5.37 baselines;
// connector logic is dialect-independent so SS is sufficient interim proof). Env bring-up is FULLY SCRIPTED —
// do NOT re-derive: CANONICAL_CONNECTOR_SETUP.md + HYBRID_E2E_ENV_RUNBOOK.md (only assume the Docker daemon).
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,                                  // registry SLUG (Finding A)
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // ISOLATION: this run uses DEDICATED infra (parallel-session safe). Forward the caller's
        // coords so the hybrid-e2e ISOLATION_OVERRIDE binds to iMIS's own DB/container/port/RSU dir
        // and NEVER the shared HubSpot defaults (MJ_SS_E2E / :4007 / sql-claude) which a concurrent
        // session may own. Absent → primitive falls back to those defaults (original behavior).
        dbProfile: A?.dbProfile ?? null,                             // { name, host, port, user, container }
        mjapi: A?.mjapi ?? null,                                     // { graphqlPort }
        rsuDir: A?.rsuDir ?? null,                                   // per-run RSU_WORK_DIR for parallel isolation
        // [B] credential-free: mock engine proof. credentialReference is null and there are no brokerPlans,
        // so HAS_BROKER_CREDS=false → mock. (If a future run supplies broker creds, this expression flips to
        // live and the e2e-mock-dodge gate is satisfied — keyed on creds by EITHER path, #H7.)
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        dialect: 'sqlserver',                                        // Postgres SUSPENDED
        authPattern: 'oauth2-password',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
        // E2E.GenAction is not applicable to a data-sync connector with no documented generation action —
        // floor-check requires a logged skipReason (else e2e-skip-without-reason).
        genActionSkipReason: 'iMIS is a data-sync connector with no documented generation action; E2E.GenAction is not applicable to this build.',
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
            sources,                                          // scope-sanity: EnumerationStdoutCount + TaxonomyLeaves
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null,
            // v2 EMPIRICAL-gate evidence:
            envPreflight,                                     // P7 env-preflight-* / stale-nested-dist
            realityProbe,                                     // P2 reality-probe-* rules
            credentialReference: A?.credentialReference ?? null, // P6 e2e-mock-dodge (null → mock is legitimate)
            brokerPlans: A?.brokerPlans ?? null,
            brand,                                            // P5 capability-dishonest (brand.WriteCapability)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.OutOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult,
    extractStats, frozen, review, amendmentRound, realityProbe,
    codeResult, codeRound, ladder, hybridE2E, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
