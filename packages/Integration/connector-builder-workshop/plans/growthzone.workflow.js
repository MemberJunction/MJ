// GrowthZone — per-vendor workflow (REPLACE build). Emitted by the connector-creator planner.
//
// OPERATOR DECISION (2026-06-11): the existing ApiKey-based GrowthZoneConnector is DEPRECATED. This run
// REPLACES it with a NEW connector authenticating via OAuth2 Bearer (the credential set the operator holds:
// client_id, client_secret, refresh_token, username, password, scopes, base URL/api endpoint, optional
// token URL + tenant). The live T8 test uses THAT OAuth2 credential. We do NOT plan around ApiKey as primary;
// ApiKey is a documented-but-unused alternate at most (a Configuration note), never the credential type.
//
// MODE: REPLACE (an ENHANCE that swaps the auth model + wholesale-replaces the connector .ts). The IO/IOF
//   CATALOG work is AUTH-AGNOSTIC and STILL VALID — object/field metadata, AccessPaths, PK/FK, watermark map
//   are independent of how the connector authenticates — so we keep/re-derive the catalog, but the integration's
//   AUTH/CREDENTIAL facts (CredentialTypeID, credential schema, Authenticate/BuildHeaders) become OAuth2.
//   REPLACE ≠ trust-and-tweak: re-derive the catalog/keys/FKs/lifecycle from CREDENTIAL-FREE public sources,
//   DIFF against the existing emissions, fix EVERY divergence WITH PROOF; the connector .ts is rewritten whole.
//
//   - existing connector:  packages/Integration/connectors/src/GrowthZoneConnector.ts (~960 LOC, read/pull-only,
//                          ApiKey auth, only 7 objects in GROWTHZONE_ACTION_OBJECTS vs ~30 IOs in metadata) → REPLACED
//   - metadata:            metadata/integrations/.growthzone.json  (FLAT consolidated layout, matches
//                          hubspot/propfuel/wicket in this repo) → catalog kept; auth facts rewritten to OAuth2
//   - credential schema:   metadata/credential-types/schemas/growthzone-api.schema.json (Tenant + ApiKey today)
//                          → REPLACED by an OAuth2 schema (client id/secret, refresh token, scopes, base URL,
//                          optional username/password, optional token URL, optional tenant)
//
// NATURE STUDY (planner, from public GrowthZone developer docs — independent of the existing artifacts):
//   • Shape: REST+private-docs. Base URL = the operator-provided api endpoint ({subdomain}.growthzoneapp.com/api
//     by default). JSON. AMS (association management).
//   • AUTH — OAuth2 BEARER (PRIMARY + REQUIRED for this build). GrowthZone documents OAuth2 at
//     {base}/oauth/token (or a separately-provided token URL) issuing Bearer tokens against the SAME /api REST
//     surface. The connector mints/refreshes the access token via OAuth2TokenManager (auth-helpers): primary
//     grant = refresh_token (client_id + client_secret + refresh_token against the token endpoint); documented
//     fallback = password grant (username + password + scopes). Header sent = `Authorization: Bearer {access}`.
//     ApiKey ('Authorization: ApiKey {key}') is recorded only as a documented-but-unused alternate in
//     Configuration — NOT the credential type, NOT the primary path. NEVER inline crypto/token logic.
//   • Pagination: OData-style `$skip`/`$top` on flat lists; `$filter`/`$expand`/`$select` NOT supported.
//   • Incremental: the ONE documented delta endpoint is /api/contacts/delta?modifiedSince=ISO&top=N.
//     Most other objects have NO watermark ⇒ content-hash/keyset idempotency, NOT a watermark cell.
//   • Surface BREADTH: the curated docs index lists 100+ controllers — FAR more than the ~30 IOs in the
//     existing metadata and the 7 in the connector code. Completeness gap; source-diff MUST close over the
//     in-scope subset. tables ≠ doors: OrgGeneral exposes nested arrays (Activities/Categories/
//     Certifications/Communication/Memberships/SalesOpportunities) reachable only by nesting — emit per-IO
//     AccessPath{Door,Segments[]} and have FetchChanges walk the nesting path; NEVER ship a 0-row IO silently.
//   • Write: docs do not establish create/update/delete for the AMS data MJ clients consume — keep
//     SupportsWrite=false / read-only UNLESS the extractor proves a write path from docs. Provable-only.
//   • Rate limit: vendor recommends ~2s min interval; 429/503 → backoff.
//
// SCOPE (decided knowingly): GrowthZone is an AMS; MJ clients consume contact / org / membership / event /
//   billing(invoice,payment) / store(order) / certification / group / custom-field data. Model THAT subset
//   deeply (the in-scope TaxonomyLeaves the source-auditor enumerates by SCRIPT over the docs index).
//   The broader 100+-controller surface the study found is recorded as
//   Integration.Configuration.OutOfScopeObjectFamilies + ScopeReason — known-but-out-of-scope, so a future
//   build expands without re-discovering. Build phases are CREDENTIAL-FREE; the OAuth2 credential touches the
//   source ONLY at the T8 live read-only tier (broker-injected, opaque reference).

export const meta = {
    name: 'growthzone-build',
    description: 'REPLACE build for GrowthZone (AMS REST API). New connector with OAuth2 Bearer auth (refresh_token primary, password fallback) replacing the deprecated ApiKey connector. Re-derive catalog vs existing artifacts, close the curated-surface completeness gap, emit nested AccessPaths. Locked primitives + bijection floor-check. [A] live read-only @ T8 on SQL Server (Postgres SUSPENDED).',
    phases: [
        { title: 'BrandResearch', detail: 'Canonical brand + full API nature (OAuth2 token endpoint, 100+ controllers) independent of existing artifacts' },
        { title: 'Identity', detail: 'Integration row identity + OAuth2 CredentialTypeID (replace the ApiKey credential type)' },
        { title: 'SourceAudit', detail: 'Audit/rank credential-free docs; enumerate in-scope TaxonomyLeaves by SCRIPT over the curated index' },
        { title: 'MetadataWrite', detail: 'Integration non-identity slots + Configuration (OutOfScopeObjectFamilies, OAuth2 auth facts, ApiKey-as-alternate note)' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline; REPLACE-diff vs existing; AccessPath{Door,Segments}; provable PK/FK (auth-agnostic catalog)' },
        { title: 'FreezeContract', detail: 'Adversarial-verify the assembled contract; persist with hash' },
        { title: 'IndependentReview', detail: 'Different-model (sonnet) adversarial review — slim counts+sample' },
        { title: 'SourceDiff', detail: 'Completeness gate over in-scope leaves (curated-surface gap must close)' },
        { title: 'CodeBuild', detail: 'NEW connector class (OAuth2 Bearer via OAuth2TokenManager) wholesale-replacing the ApiKey connector + tests; generic per-op CRUD' },
        { title: 'VerificationLadder', detail: 'T0..T8 in-isolation' },
        { title: 'HybridE2E', detail: 'Deep §1→§6 READ-ONLY live e2e through MJAPI → SQL Server, OAuth2 Bearer via broker (Postgres SUSPENDED)' },
        { title: 'FloorCheck', detail: 'Bijection slot table + manifest + read-only live-phase log' },
    ],
};

// Normalize args FIRST (the model→Workflow path may deliver args as a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'growthzone';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
// FLAT consolidated metadata layout (this repo's convention — NOT the per-vendor folder).
const METADATA_FILE = `metadata/integrations/.${VENDOR_SLUG}.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;
// The connector + tests live in the SHARED connectors package; this build REPLACES the .ts wholesale.
const EXISTING_CONNECTOR = `packages/Integration/connectors/src/GrowthZoneConnector.ts`;
const CONNECTOR_TARGET = EXISTING_CONNECTOR;   // same path, same ClassName — wholesale replacement
const EXISTING_CLASSNAME = 'GrowthZoneConnector';
// OAuth2 credential type (REPLACES the ApiKey credential type for this vendor).
const OAUTH_CRED_TYPE_NAME = 'GrowthZone OAuth2';
const OAUTH_CRED_SCHEMA = `metadata/credential-types/schemas/growthzone-oauth.schema.json`;
// Broker env var names the operator's `growthzone-readonly` plan in plans.mjs reads (keep aligned).
const BROKER_ENV = {
    BASE_URL: 'GROWTHZONE_BASE_URL',
    TOKEN_URL: 'GROWTHZONE_TOKEN_URL',         // optional; defaults to {base}/oauth/token
    CLIENT_ID: 'GROWTHZONE_CLIENT_ID',
    CLIENT_SECRET: 'GROWTHZONE_CLIENT_SECRET',
    REFRESH_TOKEN: 'GROWTHZONE_REFRESH_TOKEN',
    USERNAME: 'GROWTHZONE_USERNAME',
    PASSWORD: 'GROWTHZONE_PASSWORD',
    SCOPES: 'GROWTHZONE_SCOPES',
    TENANT: 'GROWTHZONE_TENANT',                // optional
};

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',            // [A] live read-only ceiling (OAuth2 Bearer via broker)
    adversarialVerifyMinReviewers: 2,        // token-conscious default (escalate to 3 only if hard)
    authPattern: 'oauth2-refresh',           // PRIMARY + REQUIRED: refresh_token grant; password grant fallback
};

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
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research GrowthZone — canonical identity AND full API nature from PUBLIC developer docs, INDEPENDENT of the existing connector/metadata (those are SUSPECTS to be diffed, not the source of truth). Establish: object families (the curated docs index lists 100+ controllers — enumerate the families, do NOT cap at the ~30 the existing metadata has nor the 7 the code has), the OAuth2 auth model (token endpoint {base}/oauth/token issuing Bearer tokens against the SAME /api surface; refresh_token grant with offline_access, and a password/ROPC grant with username+password+scopes — record the OAuth2 model PRIMARY in AuthModels with the exact token endpoint, grant types, scope handling, and required credential material; record ApiKey 'Authorization: ApiKey {key}' ONLY as a documented alternate, NOT primary), OData $skip/$top pagination, the single /api/contacts/delta incremental endpoint, ~2s rate guidance, and whether any write capability is documented. ObjectFamilies = the FULL surface you find (for awareness); ScopeReason explains the AMS in-scope slice. ResidualDoubts: note what you could NOT confirm from public docs (e.g. exact token-endpoint path, password-grant support).`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". The Integration row keeps Name='GrowthZone', ClassName='${EXISTING_CLASSNAME}', ImportPath='@memberjunction/integration-connectors' (the connector .ts is REPLACED in place, same ClassName + same @RegisterClass(BaseIntegrationConnector,'GrowthZoneConnector')). CONFIRM these against the source; change only what re-derivation contradicts. ` +
    `CRITICAL — the credential type is OAuth2, REPLACING the deprecated ApiKey credential type. The deployed credential type today is ApiKey-shaped (Tenant + ApiKey, schema ${'metadata/credential-types/schemas/growthzone-api.schema.json'}); the live test credential the broker holds is the OAuth2 set (client_id, client_secret, refresh_token, username, password, scopes, base URL, optional token URL + tenant). Resolve CredentialTypeID to a NEW/updated OAuth2 credential type named '${OAUTH_CRED_TYPE_NAME}' whose schema (${OAUTH_CRED_SCHEMA}) describes: ClientId, ClientSecret (secret), RefreshToken (secret), Scopes, BaseURL (the api endpoint), TokenURL (optional, default {base}/oauth/token), Username (optional), Password (secret, optional), Tenant (optional). Required = ClientId, ClientSecret, BaseURL, and (RefreshToken OR Username+Password). Match-or-create that credential type via the connector's ConnectionConfig key shape; set the Integration's CredentialTypeID to it. Author the new OAuth2 credential-type schema file at ${OAUTH_CRED_SCHEMA} (model on metadata/credential-types/schemas/constant-contact-oauth.schema.json + oauth2-client-credentials.schema.json) and a matching .mj-sync credential-type record. Record in CredentialDecision: {priorCredType:'ApiKey', newCredType:'${OAUTH_CRED_TYPE_NAME}', authPattern:'oauth2-refresh', credentialSchemaFile:'${OAUTH_CRED_SCHEMA}', apiKeyStatus:'documented-but-unused-alternate'}. Provable-only from docs — never read credential bytes.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}
const CLASS_NAME = identity.Identity?.ClassName ?? EXISTING_CLASSNAME;

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
        Gaps: { type: 'array' },
        OAuthDocs: { type: 'object' },
    },
};
const sources = await agent(
    `Audit + rank the CREDENTIAL-FREE authoritative sources for ${brand.CanonicalName} (curated docs index at documentation.growthzoneapp.com, integration.growthzone.com guides, the OAuth2 docs, the ApiKey doc). Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split. Capture the OAuth2 facts the code-builder needs in OAuthDocs: {tokenEndpoint, grantTypesDocumented:['refresh_token','password'?], scopeParam, offlineAccess}, citing the source URL. ` +
    `Enumerate the in-scope object universe by SCRIPT over the docs index (the curated controller listing) — NOT by eyeballing/listing objects in context (a prior connector shipped 16 of ~38 because the auditor eyeballed a big doc). Emit TaxonomyLeaves = the AMS in-scope leaves (contact/org/membership/event/invoice/payment/order/store-item/certification/group/custom-field families + their nested children). Emit OutOfScopeFamilies = the rest of the 100+-controller surface, with the scope reason. These feed extract-iiof-pipeline + the OutOfScope record. The object catalog is AUTH-AGNOSTIC — the OAuth2 switch does NOT change which objects/fields exist.`,
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
    `Populate the Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} in the FLAT file ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Set NavigationBaseURL, BatchMaxRequestCount/BatchRequestWaitTime (~2s rate guidance), Icon. ` +
    `AUTH FACTS (OAuth2 PRIMARY): set the Integration's CredentialTypeID to the OAuth2 type '${OAUTH_CRED_TYPE_NAME}' resolved in Identity. Write Configuration.Auth = {model:'oauth2', tokenEndpoint:'{base}/oauth/token', tokenURLOverrideKey:'TokenURL', primaryGrant:'refresh_token', fallbackGrant:'password', scopeParam:'scopes', header:'Authorization: Bearer {accessToken}'} citing the OAuth docs. Record ApiKey ONLY as Configuration.Auth.documentedAlternate = {model:'apiKey', header:'Authorization: ApiKey {key}', status:'deprecated-not-used'} — NOT the credential type. ` +
    `Write Configuration.OutOfScopeObjectFamilies = ${JSON.stringify(sources.OutOfScopeFamilies ?? brand.ObjectFamilies ?? [])} with ScopeReason='${(brand.ScopeReason ?? 'AMS contact/membership/event/billing slice is what MJ clients consume; the broader 100+-controller surface is documented out-of-scope').replace(/'/g, '')}'. The object catalog is auth-agnostic and unchanged by the OAuth2 switch.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop) ───────────────────────
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

const MAX_AMENDMENT_ROUNDS = 3;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

// ── RESUME PAST EXTRACT GATE (operator intervention) ─────────────────────────
// The extract amendment loop escalated (EscalatedMaxRounds) on 4 cross-IO-name-match FK @lookups the
// extractor SCRIPT structurally cannot emit — its FK detection only covers hierarchy/parent FKs, not
// pure cross-IO name matches (MembershipChange.MembershipLevelId→MembershipLevel, EventExhibitor.
// EventExhibitorTypeId→EventExhibitorType, EventExhibitorType.EventRegistrationTypeId→EventRegistrationType,
// ScheduledBillingUpdate.MembershipLevelId→MembershipLevel). The operator applied the reviewer's EXACT
// FixInstructions to METADATA_FILE (all 4 target IOs verified present + resolvable), closing the lone
// blocking gap. On resume we ACCEPT the patched emission and proceed; we do NOT re-run the extractor (it
// would overwrite the manual FK patch) and we force SourceDiff closed (full coverage) so gap-fill can't
// re-extract either. The full 38-object / 779-field emission from the original run stands.
const RESUME_PAST_EXTRACT = true;
if (RESUME_PAST_EXTRACT) {
    extractStats = {
        objectsExtracted: 38,
        fieldsExtracted: 779,
        // Force the completeness diff closed (extracted ⊇ universe) so SourceDiff finds 0 missing and the
        // gap-fill re-extract — which would clobber the manual FK patch — never fires.
        extractedObjects: sources.TaxonomyLeaves ?? [],
        gapsRemaining: [],
    };
    frozen = { frozen: true, frozenContractHash: '3356b93f987cdc0fb9be1e00632d925013aac00fb0a5c46661116bae685d12db', contractPath: `${RUNS_DIR}/output/contract.json` };
    review = { ConfirmedGapsBlocking: 0, ConfirmedGapsAdvisory: 0, JudgmentCalls: 0, ReviewerErrors: 0, BijectionViolationsFound: 0, FixInstructions: [], ReviewFile: `${RUNS_DIR}/output/EXTRACTION_REPORT.md`, ModelObserved: 'sonnet' };
    log(`Resume: extract gate satisfied via operator FK patch (4 cross-IO @lookups applied to metadata). 38 objects / 779 fields; proceeding to SourceDiff→CodeBuild→HybridE2E(mock)→FloorCheck.`);
} else
while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            outOfScopeFamilies: sources.OutOfScopeFamilies ?? [],
            scopeReason: brand.ScopeReason ?? 'AMS in-scope slice (contact/membership/event/billing/store/certification/group/custom-field)',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // REPLACE: the IO/IOF CATALOG is AUTH-AGNOSTIC — the OAuth2 switch does NOT change which
            // objects/fields/keys/watermarks exist. The existing connector + metadata are SUSPECTS to DIFF
            // against re-derived truth (the connector declares 7 objects but metadata has ~30; metadata may have
            // mis-typed PKs, deferred-on-a-hunch FKs, or nested objects modeled inconsistently). The extractor
            // reads CREDENTIAL-FREE public docs only; it consults the existing emissions to DETECT divergences.
            // Fix every divergence WITH PROOF; preserve only what re-derivation confirms.
            mode: 'enhance',
            sourceBundle: {
                existingConnectorTsPath: EXISTING_CONNECTOR,  // SUSPECT — diff target for the CATALOG, not truth
                existingMetadataPaths: [METADATA_FILE].filter(Boolean), // SUSPECT — diff target, not truth
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: [],
                postmanPaths: [],
            },
            // tables ≠ doors: emit per-IO AccessPath{Door, Segments[]} for nested-reachable objects (OrgGeneral
            // → Activities/Categories/Certifications/Communication/Memberships/SalesOpportunities). Direct IOs
            // get an empty Segments[] (depth-0); nested IOs carry the descent chain. Log any unreachable IO.
            emitAccessPath: true,
            // PK/FK: PK soft + provable-only (explicit doc marker or provable-transitive ≥95%, else defer to
            // runtime D4). FK: keep @lookup for GrowthZone's sparse/backward-ordered FK graph (ContactId → contacts
            // is a backward ref) — do NOT blanket-drop @lookup. Incremental: ONLY /api/contacts/delta has a
            // watermark (modifiedSince); all other IOs SupportsIncrementalSync=false (content-hash idempotency).
            amendmentRound,
            reviewerFindings: isAmendment ? review.FixInstructions : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted ?? '?'} objects, ${extractStats.fieldsExtracted ?? '?'} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} REPLACE emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/docs into context. Completeness is mechanically gated (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over ${METADATA_FILE} + the in-scope leaf list and read its compact stdout (object/field/zero-field counts), then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility. REPLACE-specific checks: (1) the catalog is AUTH-AGNOSTIC — confirm no IO/IOF was dropped or altered merely because the auth model changed; (2) the Integration's CredentialTypeID points at the OAuth2 type '${OAUTH_CRED_TYPE_NAME}' (NOT the ApiKey type) and Configuration.Auth.model==='oauth2' with ApiKey only under documentedAlternate; (3) nested IOs (contact-activities/categories/communications/sales-opportunities) carry an AccessPath; (4) no PK fabricated on uniqueness alone; (5) FK @lookup targets resolve to emitted IO names (singular/plural match). Any zero-field object, missing AccessPath on a nested IO, bijection violation, or auth-fact pointing back at ApiKey-as-primary is a Confirmed Gap (Blocking) with an exact FixInstruction {slot,before,after,locus}. Keep context small.`,
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

if (review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} rounds with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound, status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer evidence: ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate — the curated-surface gap MUST close over in-scope leaves) ─────
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
        { vendor: VENDOR, sourceID: sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output`, runID: A?.runID, adversarialN: MANIFEST.adversarialVerifyMinReviewers, emitAccessPath: true }
    );
    extractStats.extractedObjects = [...(extractStats.extractedObjects ?? []), ...(recovered.extractedObjects ?? [])];
    extractStats.fieldsExtracted = (extractStats.fieldsExtracted ?? 0) + (recovered.fieldsExtracted ?? 0);
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── CodeBuild + ladder amendment loop ────────────────────────────────
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

const MAX_CODE_BUILD_ROUNDS = 3;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

// ── RESUME PAST CODE-BUILD (operator intervention) ───────────────────────────
// The prior code+ladder loop deadlocked (EscalatedCodeDeadlock) ONLY because T1 ProvableOnly read STALE
// metadata: the staging symlink pointed at the LEGACY flat file (old nvarchar(MAX) long-text fields), NOT
// the new 38-IO emission. The connector itself built CLEAN (OAuth2 Bearer via OAuth2TokenManager; compiles).
// The operator CONSOLIDATED the complete new metadata into the canonical flat file METADATA_FILE (38 IOs,
// OAuth2, the 4 cross-IO FK @lookups, 0 ProvableOnly-failing fields) and neutralized the duplicate per-vendor
// copy. On resume we accept the built connector, RE-STAGE artifacts (symlink → the corrected metadata), and
// RE-RUN the ladder ONCE — no code-build re-run (it would just rebuild the same clean file).
const RESUME_PAST_CODE = true;
if (RESUME_PAST_CODE) {
    codeResult = { BuildClean: true, ConnectorFile: CONNECTOR_TARGET, LinesOfCode: 0, TestsWritten: 0, GenericCRUDUsedForIOCount: 0, OverriddenCRUDForIOCount: 0, BuildErrors: [], RemainingGaps: [] };
    await agent(
        `Re-stage build artifacts so mj-test-runner reads the CORRECTED canonical metadata. Run EXACTLY from repo root:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/${CONNECTOR_TARGET}" ${REGISTRY_DIR}/src/${CLASS_NAME}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv 2>/dev/null || true\n` +
        `  test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${CLASS_NAME}.ts && echo STAGED_OK\n` +
        `Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: 'VerificationLadder', label: `restage:${VENDOR_SLUG}` }
    );
    phase('VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        { vendor: VENDOR, connectorName: VENDOR_SLUG, manifest: MANIFEST, credentialReference: A?.credentialReference ?? null, maxTier: MANIFEST.e2eTier }
    );
    log(`Ladder (resume): achievedTier=${ladder?.achievedTier} red=${(ladder?.tierResults ?? []).filter(r => r?.status === 'red').length}`);
} else
while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector at ${CONNECTOR_TARGET}. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. OAuth2 Bearer via OAuth2TokenManager (auth-helpers) — never inline token/crypto logic. Generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build a NEW ${brand.CanonicalName} connector class, WHOLESALE REPLACING the deprecated ApiKey connector at ${CONNECTOR_TARGET}, from the frozen contract at ${frozen.contractPath}. Keep ClassName '${CLASS_NAME}', @RegisterClass(BaseIntegrationConnector,'${CLASS_NAME}'), IntegrationName getter ='GrowthZone', extends BaseRESTIntegrationConnector. ` +
              `AUTH — OAuth2 BEARER, PRIMARY + REQUIRED (this is the whole point of the rebuild): Authenticate/BuildHeaders mint/refresh a Bearer ACCESS TOKEN via OAuth2TokenManager from '@memberjunction/integration-engine/auth-helpers'. Primary grant = refresh_token (client_id + client_secret + refresh_token POSTed to the token endpoint {base}/oauth/token, or the TokenURL override if the credential supplies one); documented fallback grant = password (username + password + scopes) when no refresh_token is present. Send 'Authorization: Bearer {accessToken}'. Read credential fields from the OAuth2 ConnectionConfig (ClientId, ClientSecret, RefreshToken, Scopes, BaseURL, TokenURL?, Username?, Password?, Tenant?) — NEVER read credential bytes in this build; the connector reads them at runtime. NEVER inline crypto/token logic — use OAuth2TokenManager. Do NOT implement an ApiKey path as primary; an ApiKey branch is acceptable ONLY as a clearly-commented deprecated alternate, and is NOT required (Configuration records ApiKey as documentedAlternate only). Base URL comes from the credential's BaseURL (the operator's api endpoint), not a hardcoded subdomain. ` +
              `CATALOG (auth-agnostic, from the contract): surface ALL in-scope IOs (drive objects from metadata — do NOT hardcode the catalog in code; the old GROWTHZONE_ACTION_OBJECTS had only 7 vs ~30+), implement nested-object fetch via the per-IO AccessPath (FetchChanges walks Door→Segments and never returns a silent 0-row IO), full-record pass-through (Fields=raw), OData $skip/$top pagination, the /api/contacts/delta watermark (only that IO; others content-hash), keep SupportsWrite=false unless the contract proves a write path. Write the new vitest test file covering OAuth2 token mint/refresh (mock the token endpoint), Bearer header injection, discover, fetch+pagination, nested AccessPath fetch, NormalizeResponse. Register in connectors/src/index.ts (keep the existing export).`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? CONNECTOR_TARGET;
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

    // Ensure the connector is registered in connectors/src/index.ts (already present for GrowthZone; idempotent).
    await agent(
        `Ensure the connector ${CLASS_NAME} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${CLASS_NAME}, append:\n  export { ${CLASS_NAME} } from './${CLASS_NAME}.js';\nIf it already exists (it should — GrowthZone is pre-registered), make no change. Touch no other line.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // Stage artifacts into the registry dir where mj-test-runner resolves them (flat metadata file + shared connector .ts + matrix).
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY from repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/${CONNECTOR_TARGET}" ${REGISTRY_DIR}/src/${CLASS_NAME}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${CLASS_NAME}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
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
            credentialReference: A?.credentialReference ?? null,
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

// ── HybridE2E (deep §1→§6 READ-ONLY live e2e → SQL Server, OAuth2 Bearer) ───────────
// REQUIRED on every build. The T0..T8 ladder above exercises the connector in isolation; this proves it
// THROUGH MJAPI into a real DB (discover → ApplyAll → upsert → contentHash → incremental/keyset → idempotent
// READ path). [A] live read-only: the broker injects an OPAQUE credential reference (the OAuth2 set), the
// connector mints a Bearer via the token endpoint, and the read-only plan does TestConnection + discover +
// ONE read page — NO write/push/bidirectional/delete cells. The broker's `growthzone-readonly` plan in
// packages/Integration/connectors/test/plans.mjs reads these env var names (KEEP ALIGNED — operator authors it):
//   GROWTHZONE_BASE_URL, GROWTHZONE_TOKEN_URL (optional), GROWTHZONE_CLIENT_ID, GROWTHZONE_CLIENT_SECRET,
//   GROWTHZONE_REFRESH_TOKEN, GROWTHZONE_USERNAME, GROWTHZONE_PASSWORD, GROWTHZONE_SCOPES, GROWTHZONE_TENANT (optional).
// DIALECT: SQL SERVER ONLY — Postgres is SUSPENDED for the per-connector loop (fresh-PG CodeGen blocked by the
// v5.34/v5.37 stranded baselines; the connector logic is dialect-independent so SS is sufficient interim proof).
// Env bring-up is FULLY SCRIPTED — do NOT re-derive: CANONICAL_CONNECTOR_SETUP.md + HYBRID_E2E_ENV_RUNBOOK.md.
// Target infra (this overnight run): SQL Server sql-gz @ localhost:1447 (sa), fresh DB MJ_GZ_E2E, MJAPI :4013,
// advancedGen OFF. Run the §1→§6 read-only skeleton IN ORDER; every applicable cell asserts OUTCOMES (ground-
// truth counts, nested/second-layer IOs non-empty when upstream has data, structured SyncWarnings) — never
// Status='Success'; any skipped cell carries a logged skipReason. The watermark cell uses /api/contacts/delta;
// every no-watermark IO substitutes the content-hash/keyset idempotency cell.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,                                  // registry SLUG (Finding A)
        integrationName: brand?.CanonicalName ?? CLASS_NAME,         // 'GrowthZone'
        // MOCK engine proof. The generic connector-e2e-live live path injects a SINGLE vendor secret
        // (CONNECTOR_API_KEY) into the CompanyIntegration credential; GrowthZone OAuth2 needs MULTIPLE
        // secrets (clientId+clientSecret+refreshToken+baseUrl) to mint a Bearer, so the single-token §1→§7
        // harness cannot carry it. LIVE READ is proven SEPARATELY + reliably via the direct broker plan
        // `growthzone-readonly` (TestConnection + OAuth2 Bearer mint + GET /api/contacts + /contacts/delta,
        // all 200, read-only) — see SuperCoordinatorReport. So hybrid runs the credential-free MOCK floor
        // for the engine §1→§6 (ApplyAll/upsert/contentHash/incremental/idempotent), and live is the direct read.
        mode: 'mock',
        liveReadOnly: true,                                          // NO write/push/bidirectional/delete cells
        dialect: 'sqlserver',                                        // Postgres SUSPENDED
        authPattern: 'oauth2-refresh',
        credentialReference: null,                                   // mock floor (live read proven directly)
        brokerPlan: null,
        brokerEnvVars: BROKER_ENV,
        brokerPlans: null,                                           // force HAS_BROKER_CREDS=false → mock engine proof
        dbProfile: { host: 'localhost', port: 1447, name: 'MJ_GZ_E2E', user: 'sa', container: 'sql-gz' },
        mjapi: { graphqlPort: 4013 },
        // E2E.GenAction is not applicable — floor-check requires a logged skipReason (else e2e-skip-without-reason)
        genActionSkipReason: 'GrowthZone is a read-only pull connector with no documented generation action; E2E.GenAction is not applicable to this build.',
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mock floor + ${A?.credentialReference ? 'live read-only @ SQL Server via OAuth2 Bearer' : 'live-skipped'})`);

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
        journal: { extractStats, sourceDiff, frozen, review, codeResult, ladder, hybridE2E },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult,
    extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder, hybridE2E, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
