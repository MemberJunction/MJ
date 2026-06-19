// PER-VENDOR WORKFLOW — Microsoft Dynamics 365 (credential-free [B] run, bidirectional REST/OData v4, FRESH build)
//
// Emitted by the ConnectorCreator planner from _TEMPLATE.workflow.js. All locked-primitive
// signatures, both amendment loops, EnvPreflight (S0), RealityProbe (S7) + ProbeAmend, the
// freeze gate, and the bijection floor-check are preserved verbatim from the template. Only the
// per-vendor knobs + agent prompts are customized to carry the SURFACE MODEL + SCOPE DECISION
// down to every producer stage.
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// 🧭 STUDY → SCOPE (the four moves; D365 is the canonical "study independently, scope knowingly" case)
// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1. STUDY (independent of the provided context). "Dynamics 365" is NOT one API. The real surface
//    universe (validated against Microsoft public docs — learn.microsoft.com Dataverse Web API
//    overview, F&O OData/data-entities, service-protection limits):
//      • Dataverse Web API   — per-environment `https://<org>.crm.dynamics.com/api/data/v9.2`,
//        OData v4, $metadata/CSDL, change tracking (deltatoken), alternate keys + upsert, $batch,
//        CRUD via GET/POST/PATCH/DELETE. The CE apps (Sales, Customer Service, Field Service,
//        model-driven) are ALL Dataverse-backed.
//      • F&O OData data entities — DIFFERENT base `https://<env>.dynamics.com/data/<Entity>`,
//        dataAreaId/legal-entity + cross-company, business-rule-enforcing entities (CustomersV3,
//        VendorsV2, ReleasedProductsV2, SalesOrderHeadersV2…).
//      • F&O Data Management package REST API — ASYNC import/export jobs (schedule ≠ success).
//      • F&O + Dataverse business/data events — push triggers, not a read surface.
//      • Business Central — a SEPARATE product with its own API + integration model.
//    Auth across all: Microsoft Entra ID OAuth 2.0 (client-credentials / certificate [app-only via
//    an application user] or delegated). WriteCapability = BIDIRECTIONAL (full CRUD + upsert), NOT
//    pull-only — this is BINDING (v2 P5); a pull-only D365 connector is a capability-dishonesty defect.
//
// 2. LAY context against study + DETECT TENSION. The provided MicrosoftDynamic365Context.md is a
//    detailed integration-lab doc — TRUSTED where it speaks (auth flows, surface behaviors, error
//    semantics, the no-credential testing posture: mocks/OpenAPI contracts/synthetic data). Its
//    breadth AGREES with the study (it explicitly states "D365 is not one single API" and enumerates
//    Dataverse vs F&O vs Business Central as distinct surfaces). No contradiction found; nothing to
//    reject. It is NOT a statement of the whole system, and it is NOT a per-tenant catalog.
//
// 3. INVESTIGATE + VALIDATE. Confirmed against independent docs: entity set names are lowercase
//    plurals (account→accounts, contact→contacts, incident→incidents); PK is `<logical>id` GUID
//    (accountid, contactid); pagination = follow @odata.nextLink EXACTLY (never hand-build skiptoken);
//    incremental = change tracking deltaLink/deltatoken (fallback: modifiedon polling with lookback);
//    service protection = 429 + Retry-After on a 5-min sliding window. All context claims that touch
//    hard constraints were corroborated.
//
// 4. SCOPE KNOWINGLY — THE CRUX.  ► IN SCOPE: the **Dataverse Web API** surface ONLY.  ◄
//    Justification: MJ's clients are membership/association orgs; their D365 footprint is the
//    CE/model-driven (Dataverse-backed) world — accounts, contacts, leads, opportunities, cases,
//    activities. One connector cannot honestly span Dataverse AND F&O: different base URL, different
//    OAuth resource/audience, different discovery, different (async) write semantics, different
//    pagination. So this connector models the Dataverse surface DEEPLY and records the rest as
//    known-but-out-of-scope WITH the reason (Configuration.OutOfScopeObjectFamilies). Over-reach
//    ("build all of D365") is rejected; under-reach ("the context's example tables ARE the system")
//    is rejected.
//
//    DISCOVERY MODEL inside the Dataverse scope (the second crux):
//      • The Dataverse object/field CATALOG is AUTH-GATED RUNTIME DISCOVERY (discovery case 2):
//        $metadata/CSDL + EntityDefinitions require a credential + an environment. It is NOT
//        credential-free-docs-static and NOT bakeable into a code constant. The connector encodes the
//        discovery MECHANISM (call $metadata / EntityDefinitions, parse CSDL → EntityType→table,
//        EntitySet→entity-set-name, Property→column, Key→PK, NavigationProperty→FK/lookup) — never the
//        answer, never a build-time call (there is no credential at build).
//      • DECLARED metadata seeds ONLY what Microsoft documents PUBLICLY + credential-free: the
//        well-known standard tables (account, contact, lead, opportunity, incident, activitypointer,
//        task, appointment, phonecall, email, product, pricelevel, quote, salesorder, invoice,
//        campaign, list, systemuser, team, businessunit) with their documented entity-set names,
//        logical-name PKs (`<table>id`), and the documented column reference; plus WhoAmI, $batch, and
//        the change-tracking incremental mechanism. This is the VENDOR-WIDE schema every Dataverse env
//        has — NOT one tenant's view.
//      • Customer-specific CUSTOM tables/columns (new_membership, new_eventregistration, etc.) are
//        per-tenant — captured at runtime via the connector's Discover* (case 2) / framework custom-
//        column path (case 3). NEVER baked.
//      • DiscoveryIsAuthoritative ⇒ TRUE is JUSTIFIED for Dataverse: $metadata/EntityDefinitions
//        returns the COMPLETE gamut the credential can access, so a comprehensive refresh may safely
//        deactivate (reversibly) tables/columns the env dropped. (metadata-writer records the rationale.)
//
// ──────────────────────────────────────────────────────────────────────────────────────────────
// vendorShape       = dynamics-derivative (Dataverse OData v4; $metadata CSDL is the runtime catalog)
// authPattern       = oauth2-cc (Entra ID client-credentials/cert app-only via application user;
//                     delegated documented but app-only is the integration default). Credential-free
//                     here → auth is DOCUMENTED, not exercised live.
// e2eTier           = T8 (the credential-free live CEILING). T8 does NOT gate the non-live suite —
//                     contract validation, mock-server-from-CSDL/OpenAPI, Postman replay,
//                     endpoint/header probing (expect 401s as POSITIVE evidence), and bijective
//                     completeness all run to full applicable extent.
// HybridE2E LIVE    = SKIPPED (no credential) with a logged skipReason — NOT mock-dodged into a fake
//                     green. The floor records the residual gap honestly. Achieved ceiling:
//                     format-verified-no-creds.
//
// 🚨 ANTI-OVERFIT (the D365 version of the Salesforce 11-of-1694 failure): the DECLARED standard-table
//    set is the FULL documented standard catalog, NOT a famous-3 subset; the per-tenant gamut (incl.
//    custom tables) is reached at RUNTIME via $metadata/EntityDefinitions. A thin declared emission
//    (declared ≪ the documented standard catalog) is THE bug to reject. Provable-only throughout:
//    emit a PK/FK/Type/nullability/watermark ONLY where the CSDL/docs state it; defer the rest.

export const meta = {
    name: 'microsoft-dynamics-365-build',
    description: 'Workshop dynamic-workflow build for Microsoft Dynamics 365 — credential-free [B] bidirectional REST/OData-v4 connector over the DATAVERSE Web API surface (F&O / Data-package / events / Business Central scoped OUT, recorded with reason). FRESH build. Catalog is auth-gated runtime discovery via $metadata/CSDL; Declared seeds the documented standard tables only. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Connector-nature study: D365 is NOT one API. Establish the FULL surface (Dataverse Web API vs F&O OData vs F&O data-package vs business/data events vs Business Central), Entra OAuth model, BIDIRECTIONAL read+write, OData pagination (@odata.nextLink), change-tracking incremental, service-protection rate limits. WriteCapability + custom-field findings BINDING (v2 P5). Output ProductTaxonomy with the surface split.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (ClassName=DynamicsDataverseConnector / slug microsoft-dynamics-365); CredentialTypeID match-or-create against the Entra OAuth2 client-credentials ConnectionConfig key shape (tenantId, clientId, clientSecret/cert, environmentUrl, resource/audience).' },
        { title: 'SourceAudit', detail: 'Rank Dataverse Web API docs + the per-table reference (account/contact/…) + CSDL/$metadata docs + change-tracking/batch/service-protection docs. TaxonomyLeaves = the DOCUMENTED standard Dataverse table catalog (script over the public table-reference list), NOT a famous subset; F&O/data-package/events/BC marked INFORMATIONAL (out of scope).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON: universalPK hint ({fieldName:"<table>id" pattern}), OutOfScopeObjectFamilies (F&O OData, F&O data-management package API, business/data events, Power Automate, Business Central) + reason, DiscoveryIsAuthoritative=true rationale ($metadata/EntityDefinitions returns the full credentialed gamut), NavigationBaseURL, batch limits, change-tracking incremental mechanism.' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the FULL documented standard Dataverse catalog (verify + write-back). Bidirectional: per-operation row CRUD columns (Create POST /<entityset>, Update PATCH /<entityset>(id), Delete DELETE /<entityset>(id); CreateIDLocation=header [OData-EntityId Location], BodyShape=flat). PK = `<table>id` GUID per the docs (provable). FK/lookup from documented navigation properties only. Custom tables NOT baked — runtime $metadata discovery MECHANISM only.' },
        { title: 'IndependentReview', detail: 'ONE round, refocused charter (coverage-vs-script / bijection / capability-honesty / naming / anti-overfit thin-emission / scope-justified). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): credential-free → DEGRADED unauthenticated per-claim status probe. Dataverse endpoints are auth-gated → expect 401/403 = path real + auth-gated (POSITIVE evidence the documented paths/host shape are correct); 404 = path wrong. Probe the OData pagination param form ($skiptoken/@odata.nextLink), the WhoAmI/$metadata/$batch paths, and the Entra token endpoint. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'DynamicsDataverseConnector extends BaseRESTIntegrationConnector: Entra OAuth2 client-credentials via auth-helpers (OAuth2TokenManager, resource/audience = environment URL); GetBaseURL from per-connection environmentUrl + /api/data/v9.2; DiscoverObjects/DiscoverFields call $metadata/EntityDefinitions and parse CSDL (MECHANISM, never a baked catalog); NormalizeResponse unwraps the `value` array + surfaces @odata.nextLink; pagination follows @odata.nextLink verbatim; generic per-operation CRUD; TransformRecord strips @odata.* annotations via ExcludedSourceKeys; DiscoveryIsAuthoritative => true. Fixtures descend from reality (CSDL samples / vendor-published) — provenance-tagged.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: CSDL/OpenAPI contract validation, mock-server-from-spec (Prism/Mockoon over the Dataverse-compat OpenAPI), Postman replay, endpoint/header probing, bijective completeness vs the documented standard catalog.' },
        { title: 'HybridE2E', detail: 'No credential → LIVE SKIPPED with logged skipReason (NOT mock-dodged). Live §1→§7 SQL-Server e2e requires a broker Entra credential + a real Dataverse environment which this [B] run does not have.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, capability-honesty [bidirectional], env-preflight, anti-overfit thin-emission, scope-justified-thin). e2eTier=T8 ceiling recorded honestly; e2e-mock-dodge N/A (creds absent). Verdict states the EMPIRICAL/LINT split.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'microsoft-dynamics-365';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    // T8 is the credential-free LIVE CEILING for this [B] run. It RECORDS the ceiling; it does NOT
    // gate which non-live techniques run — the full applicable non-live suite runs regardless.
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};

// ── EnvPreflight (S0 — v2 P7; ARCHITECTURE_REFACTOR.md) ──────────────
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
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --gql-url <the MJAPI url if one is expected> --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 10 stages must never burn on a broken env.`,
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
        WriteCapability: { type: ['string', 'object', 'null'] },
        CustomFieldModel: { type: ['string', 'object', 'null'] },
    },
};
const brand = await agent(
    `Research "${VENDOR}" — canonical identity AND the FULL API nature, INDEPENDENT of the provided context (which is a non-exhaustive helper, trusted-where-it-speaks). CRITICAL: "Dynamics 365" is NOT one API — establish the surface universe from public Microsoft docs (learn.microsoft.com): the Dataverse Web API (per-environment https://<org>.crm.dynamics.com/api/data/v9.2, OData v4, $metadata/CSDL, change tracking, alternate keys/upsert, $batch), F&O OData data entities (different base /data/<Entity>, dataAreaId/cross-company), F&O Data-management package REST API (async jobs), F&O+Dataverse business/data events, and Business Central (separate product). Establish: Entra ID OAuth model (app-only/client-credentials/cert via application user vs delegated), WriteCapability (D365 Dataverse is BIDIRECTIONAL full CRUD + upsert — this finding is BINDING, NOT pull-only), pagination (@odata.nextLink), incremental signal (change-tracking deltatoken; modifiedon fallback), service-protection rate limits (429 + Retry-After). Output ProductTaxonomy as the surface split { Dataverse: {...}, FinanceOperations: {...}, DataPackage: {...}, Events: {...}, BusinessCentral: {...} } so the planner's scope decision (Dataverse IN, the rest OUT) is grounded in your study. Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". This connector covers the DATAVERSE Web API surface only (scope decision — F&O/data-package/events/Business Central are OUT of scope, recorded in Configuration). Use ClassName "DynamicsDataverseConnector" (the registry slug is "${VENDOR_SLUG}"; T1's three-way name check reads the real ClassName from the metadata file — ClassName and slug differ and that is expected). Resolve CredentialTypeID via match-or-create against the Microsoft Entra ID OAuth2 client-credentials ConnectionConfig key shape (tenantId, clientId, clientSecret OR certificate, environmentUrl, resource/audience = the environment URL). Read SOURCE_STUDY when ready. Use the universalPK Configuration hint ({fieldName pattern "<table>id"}) only because the Dataverse docs AUTHORITATIVELY state the PK is the logical-name-suffixed-Id GUID.`,
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
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        EnumerationStdoutCount: { type: 'integer' },   // scope-sanity anchor: declared universe vs enumerated standard-table count
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for the ${brand.CanonicalName} DATAVERSE Web API surface (in scope). Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split.\n` +
    `COVERABLE (in scope, credential-free docs): the Dataverse Web API docs (overview, create/retrieve/update/delete, query, $batch), the public per-table reference pages — example tables (not limited to): account, contact, lead, opportunity, incident, activitypointer, task, appointment, phonecall, email, product, pricelevel, quote, salesorder, invoice, campaign, list, systemuser, team, businessunit — the $metadata/CSDL docs, change-tracking docs, alternate-key/upsert docs, and service-protection-limits docs. The FULL standard Dataverse catalog has 300+ entries at the entity reference index — your script must enumerate ALL of them, not only these examples.\n` +
    `INFORMATIONAL (OUT of scope — record but do NOT build): F&O OData data entities, F&O Data-management package REST API, business/data events, Power Automate connector, Business Central.\n` +
    `Emit TaxonomyLeaves = the DOCUMENTED standard Dataverse table catalog (the leaves of the COVERABLE table-reference taxonomy). 🚨 ENUMERATION TARGET: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/ — WRITE A SCRIPT that fetches this index page, parses the alphabetical entity list, and outputs TaxonomyLeaves = that full enumerated list. Report EnumerationStdoutCount = the script parsed count. NEVER eyeball a list of objects in your context (the anti-overfit / under-enumeration guard: a thin TaxonomyLeaves ≪ the documented standard catalog — the Salesforce 11-of-1694 failure applied to Dataverse — is THE bug; the index lists 300+ standard tables). Do NOT include custom tables (new_*) — those are per-tenant runtime discovery, not declared. Note in Gaps that the FULL per-tenant catalog (custom tables/columns) is reached only at runtime via $metadata/EntityDefinitions (auth-gated, discovery case 2), not from credential-free docs.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);
log(`SourceAudit: ${(sources.TaxonomyLeaves ?? []).length} taxonomy leaves; enumeration stdout count=${sources.EnumerationStdoutCount ?? '?'}`);

// audit-source primitive re-ranks via the rubric — sources.SourcesFile is the input
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} (DATAVERSE Web API scope). Write to ${METADATA_FILE} via mcp-mj-metadata. Required Configuration keys:\n` +
    `  • OutOfScopeObjectFamilies: ["Finance & Operations OData data entities","F&O Data-management package REST API","F&O/Dataverse business & data events","Power Automate/Logic Apps connector","Business Central"] WITH a ScopeReason ("These are distinct surfaces — different base URL, OAuth resource/audience, discovery, and (async) write semantics. MJ's membership/association clients consume the Dataverse-backed CE/model-driven apps; a single connector cannot honestly span Dataverse + F&O. Recorded for awareness; a future build can add an F&O connector without re-discovering.").\n` +
    `  • DiscoveryIsAuthoritative rationale: TRUE is justified — the Dataverse $metadata/EntityDefinitions endpoint returns the COMPLETE gamut the credential can access, so comprehensive refresh may reversibly deactivate dropped tables/columns.\n` +
    `  • universalPK hint: { fieldName pattern "<entityLogicalName>id" } — documented as the GUID PK on every standard table.\n` +
    `  • Incremental mechanism note: Dataverse change tracking (Prefer: odata.track-changes header → @odata.deltaLink/deltatoken); fallback = modifiedon polling with a lookback window. Pagination: follow @odata.nextLink VERBATIM (never hand-build skiptoken).\n` +
    `  • NavigationBaseURL = the Dataverse Web API docs landing URL. BatchMaxRequestCount / BatchRequestWaitTime ONLY if a documented $batch / service-protection limit is provable (else leave null — provable-only).\n` +
    `Provable-only: cite each hard constraint; leave unprovable slots null.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, max 3 rounds) ─────────
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

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // ── P0-3 slot-routing: integration.* fixes → metadata-writer, not the IO/IOF extractor ──
    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const isIntegrationRowSlot = (f) => String(f?.slot ?? '').toLowerCase().startsWith('integration.');
    const integrationRowFindings = allFindings.filter(isIntegrationRowSlot);
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f));
    if (integrationRowFindings.length > 0) {
        phase(phaseLabel);
        await agent(
            `Apply these Integration-ROW FixInstructions surgically to the Integration row in ${METADATA_FILE} (root-level slots the IO/IOF extractor cannot touch — auth, base URL, pagination, batch limits, incremental watermark, error shape). Change ONLY the named slots; do NOT perturb IO/IOF rows. Fixes: ${JSON.stringify(integrationRowFindings)}. Return { applied } = number of slots changed.`,
            { agentType: 'metadata-writer', schema: { type: 'object', required: ['applied'], properties: { applied: { type: 'integer' } }, additionalProperties: true }, phase: phaseLabel, label: `amend-integration-row:r${amendmentRound}` }
        ).catch(() => null);
        log(`Routed ${integrationRowFindings.length} Integration-row fix(es) to metadata-writer (round ${amendmentRound}); ${ioIofFindings.length} IO/IOF fix(es) go to the extractor.`);
    }

    // ── Extract (round 0) or Re-extract with reviewer feedback (round >0) ──
    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            // The IN-SCOPE Dataverse standard-table catalog (TaxonomyLeaves). The broader nature the
            // study found is recorded out-of-scope; only the Dataverse subset is modeled.
            objectList: sources.TaxonomyLeaves,
            outOfScopeFamilies: [
                'Finance & Operations OData data entities',
                'F&O Data-management package REST API',
                'F&O/Dataverse business & data events',
                'Power Automate/Logic Apps connector',
                'Business Central',
            ],
            scopeReason: 'Dataverse Web API is the useful/reachable surface for MJ membership/association clients; F&O + others are distinct surfaces (different base URL/auth/discovery/async-write) and cannot be honestly spanned by one connector — modeled deeply here, recorded out-of-scope for a future build.',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs (Gap 10). The Dataverse PK is provable from docs
            // (`<table>id` GUID); FK/lookup ONLY from documented navigation properties (a scalar lookup
            // referencing another table's PK) — a navigation property whose type IS another entity/
            // collection is an ACCESS-PATH, not an FK. Bidirectional: emit per-operation row CRUD
            // columns (Create POST /<entityset> flat body, ID in OData-EntityId/Location header →
            // CreateIDLocation=header; Update PATCH /<entityset>(id); Delete DELETE /<entityset>(id)).
            sourceBundle: {
                existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`,
                existingMetadataPaths: [
                    `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`,
                ].filter(Boolean),
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${extractStats.gapsRemaining.length} gaps`);

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

    // ── Independent review ────────────────────────────────────────────
    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} (Dataverse) emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/CSDL into your context. Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the documented standard-table list and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility. Check specifically: (a) ANTI-OVERFIT — declared standard tables ≈ the documented standard catalog, NOT a famous-3 subset; flag a thin emission as Blocking with named evidence. (b) CAPABILITY HONESTY — Dataverse is bidirectional; SupportsWrite=true IOs MUST carry per-operation CRUD columns; a pull-only emission is a Blocking capability-dishonesty gap. (c) SCOPE — F&O/data-package/events/BC recorded in Configuration.OutOfScopeObjectFamilies with a reason, NOT modeled as IOs. (d) PK = "<table>id" per docs; FK only from documented navigation properties. Any zero-field object, bijection violation, thin-emission, or capability-dishonesty is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    // ── Loop exit conditions ──────────────────────────────────────────
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
            runID: A?.runID,
            vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review,
            amendmentRound,
            status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved.`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

if (review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} rounds with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID,
        vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL; degraded unauthenticated for this [B] run) ───
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (NavigationBaseURL, or scheme+host of an APIPath). NOTE: Dataverse paths are PER-ENVIRONMENT (https://<org>.crm.dynamics.com/api/data/v9.2) — with no credential there is no real environment host, so the probe characterizes the documented PATH SHAPE + the Entra token endpoint (https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token) and treats 401/403 on a reachable Microsoft host as POSITIVE evidence the path is real + auth-gated.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT} (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong). Probe the documented OData pagination param form ($skiptoken / @odata.nextLink), the WhoAmI / $metadata / $batch path shapes, and the row-CRUD path templates (/<entityset>, /<entityset>(id)).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Expect MOSTLY gatedExists/401 here — that is the correct, honest outcome for an auth-gated enterprise API with no credential.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (S8 — ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Dataverse Web API source; pick the docs-supported alternative the probe confirmed, e.g. the @odata.nextLink/$skiptoken pagination form, the corrected /api/data/v9.2 path, the correct entity-set name). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 3 rounds) ────────────────
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

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} (Dataverse) connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Name it DynamicsDataverseConnector, extends BaseRESTIntegrationConnector, @RegisterClass(BaseIntegrationConnector,'DynamicsDataverseConnector'). REQUIREMENTS:\n` +
              `  • Auth: Microsoft Entra ID OAuth2 client-credentials via @memberjunction/integration-engine/auth-helpers (OAuth2TokenManager). Token endpoint https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token; scope/resource = <environmentUrl>/.default. NEVER inline crypto; the credential bytes come from the connection config at runtime, never baked.\n` +
              `  • GetBaseURL: per-connection from environmentUrl + '/api/data/v9.2' (NEVER hardcode an org URL — every customer environment differs).\n` +
              `  • DiscoverObjects/DiscoverFields: call $metadata (CSDL) / EntityDefinitions and PARSE it (the MECHANISM — EntityType→table, EntitySet→entity-set name, Property→column with Type/MaxLength, Key→IsPrimaryKey, NavigationProperty scalar lookup→FK). This is HOW custom + standard tables are discovered at runtime; do NOT bake any catalog in code (the documented standard tables live in the Declared metadata file, NOT a TS constant). Set DiscoveryIsAuthoritative => true (the $metadata/EntityDefinitions endpoint returns the complete credentialed gamut → safe reversible deactivation).\n` +
              `  • NormalizeResponse: unwrap the OData 'value' array; ExtractPaginationInfo follows @odata.nextLink VERBATIM (never hand-build a skiptoken).\n` +
              `  • Generic per-operation CRUD (BodyShape=flat; Create ID from the OData-EntityId/Location response header → CreateIDLocation=header; Update PATCH /<entityset>(id); Delete DELETE /<entityset>(id)). Support alternate-key upsert path form /<entityset>(<altkey>='<value>') where the metadata declares it.\n` +
              `  • TransformRecord: strip @odata.* annotation keys via ExcludedSourceKeys (auditable removal) — keep the full source record otherwise (full-record pass-through).\n` +
              `  • Incremental: IncrementalWatermarkField + change-tracking (Prefer: odata.track-changes → @odata.deltaLink) where declared; modifiedon-polling fallback otherwise.\n` +
              `Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic ($batch, change-tracking delta).`,
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
            runID: A?.runID,
            vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
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
    return {
        runID: A?.runID,
        vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
        amendmentRound, codeRound,
        status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server) ──────────
// REQUIRED on every build. Credential-free [B] run → LIVE is unreachable (needs a broker Entra
// credential + a real Dataverse environment), so this runs in MOCK mode with the live cells logged
// as skip+reason — NOT mock-dodged into a fake green. The floor records the residual gap honestly.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds are reachable by EITHER path. This [B] run has neither → mock.
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
        // ── ISOLATION OVERRIDE (concurrent SharePoint build owns MJ_SS_E2E / sql-claude:1444 / :4007) ──
        // mock-mode bring-up still does a REAL DROP DATABASE + migrate/codegen against DB_NAME, so it
        // MUST target a dedicated container — NEVER the default MJ_SS_E2E/sql-claude. The container
        // sql-claude-d365 (port 1455, SA pw matches the runbook) was provisioned out-of-band and is
        // healthy; the primitive's ISOLATION_OVERRIDE banner forbids touching the other session's coords.
        dbProfile: (A?.dbProfile && typeof A.dbProfile === 'object')
            ? A.dbProfile
            : { name: 'MJ_D365_E2E', host: 'localhost', port: 1455, user: 'sa', container: 'sql-claude-d365' },
        mjapi: (A?.mjapi && typeof A.mjapi === 'object') ? A.mjapi : { graphqlPort: 4017 },
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
            sources,                                         // scope-sanity: EnumerationStdoutCount + TaxonomyLeaves (declared universe vs enumerated standard catalog)
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null,
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,
            brokerPlans: A?.brokerPlans ?? null,
            brand,
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
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
