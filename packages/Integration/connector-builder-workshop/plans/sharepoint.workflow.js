// sharepoint.workflow.js — per-vendor workshop build script (planner-emitted from _TEMPLATE.workflow.js)
//
// Vendor: SharePoint (Microsoft 365 / SharePoint Online via Microsoft Graph v1.0).
// Run kind: [A] — a live read-only test credential EXISTS but is held ONLY by a separate-user
//   credential broker as a MULTI-SECRET OAuth2 client-credentials set:
//     SHAREPOINT_TENANT_ID + SHAREPOINT_CLIENT_ID + SHAREPOINT_CLIENT_SECRET.
//   The agent NEVER reads the credential bytes. The live tiers (T8 read-only + HybridE2E) submit a
//   read-only job through the broker mailbox via the NEW multi-secret `sharepoint-readonly` plan in
//   packages/Integration/connectors/test/plans.mjs (model: growthzone-readonly — mint a Bearer via the
//   Microsoft identity platform token endpoint, then strictly read-only Graph GETs; writes:false).
//   Broker UP  → live read-only rung runs (mock cannot satisfy [A]).
//   Broker DOWN → the live rung DEGRADES to the unauthenticated per-claim status probe and the
//                 achieved ceiling is `format-verified-no-creds` (every un-probed claim named).
//
// BUILD MODE: IMPROVE. packages/Integration/connectors/src/SharePointConnector.ts ALREADY EXISTS
//   (Graph v1.0, @odata.nextLink cursor pagination, client-credentials Authenticate, /delta incremental).
//   Per the role file, IMPROVE is NOT trust-and-tweak: the existing connector + (absent) metadata are a
//   SUSPECT. Re-derive the catalog/schema from the CURRENT Microsoft Graph v1.0 docs (credential-free),
//   DIFF the existing connector's assumptions against that re-derived truth, and fix every divergence
//   with PROOF. The metadata file does NOT yet exist (metadata/integrations/sharepoint/) — it is authored
//   fresh here from docs only (NEVER from live sampling, NEVER from the existing connector as "evidence").
//
// SCOPE (decided KNOWINGLY — study-for-awareness, context+need-to-scope):
//   IN-SCOPE (modeled deeply): the Microsoft Graph SharePoint surface —
//     sites · drives(document libraries) · driveItems(files+folders) · lists · listItems · columns ·
//     contentTypes · permissions · sharingLinks  + delta(driveItem/listItem) + subscriptions(webhooks).
//   OUT-OF-SCOPE (recorded as deferred-with-reason in Integration.Configuration.OutOfScopeObjectFamilies):
//     SPFx UI/web-parts/command-sets (UI extensibility, not a sync surface); SharePoint REST/CSOM-only
//     operations (used only where Graph lacks coverage — isolated behind an adapter, not the default);
//     Microsoft Search (discovery aid, NOT a source of truth for sync). These are the broader nature the
//     independent study found; documented so a future build can expand without re-discovering.
//
// LOCKED-PRIMITIVE composition is preserved verbatim from the template (you compose; you do not redefine).
// Stage EMPIRICAL/LINT labels (the final report MUST state the split):
//   EnvPreflight=EMPIRICAL · BrandResearch/SourceAudit/Identity/MetadataWrite=EMPIRICAL(doc-read) ·
//   IOIOFExtract=EMPIRICAL(doc-read) · IndependentReview=LINT · RealityProbe=EMPIRICAL · ProbeAmend=EMPIRICAL ·
//   FreezeContract=LINT · CodeBuild=LINT(compile)+EMPIRICAL(fixtures) · VerificationLadder T0..T8: T0-T3=LINT,
//   T4/T5/T7/T8=EMPIRICAL(mock/spec) · HybridE2E=EMPIRICAL(live-through-broker when up; else degraded probe) ·
//   FloorCheck=LINT(bijection/manifest) over EMPIRICAL evidence.

export const meta = {
    name: 'sharepoint-build',
    description: 'Workshop dynamic-workflow IMPROVE build for SharePoint (Microsoft Graph v1.0 SharePoint surface). Multi-secret OAuth2 client-credentials [A]-run: live read-only T8 + HybridE2E through the separate-user credential broker (sharepoint-readonly plan); broker-down degrades to the unauthenticated per-claim probe. Locked primitives + read-only RealityProbe + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB @ migration level, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Microsoft 365 / SharePoint Online canonical identity + FULL Graph SharePoint nature (object families, OAuth2 app-only vs delegated, read+write, delta incremental, @odata.nextLink pagination, throttling/Retry-After, "what else" = SPFx/REST-CSOM/Search). INDEPENDENT of the lab context. WriteCapability finding is BINDING.' },
        { title: 'Identity', detail: 'Integration identity slots (ClassName=SharePointConnector, ImportPath, CredentialTypeID=OAuth2 client-credentials match-or-create).' },
        { title: 'SourceAudit', detail: 'Rank Microsoft Graph v1.0 docs (sites/drives/driveItems/lists/listItems/columns/contentTypes/permissions/sharingLinks/delta/subscriptions) + identity-platform docs. TaxonomyLeaves = the IN-SCOPE Graph SharePoint surface (script-derived, NOT eyeballed).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (base URL https://graph.microsoft.com/v1.0; pagination mechanism @odata.nextLink; OAuth2 token endpoint; OutOfScopeObjectFamilies + reason).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline. SOFT PKs proven from Graph docs (driveItem.id/listItem.id/site.id/drive.id/list.id). FK graph via @lookup &IntegrationID=@parent:IntegrationID (sparse/backward-ordered → keep @lookup). Delta token = IncrementalWatermarkField (NOT a timestamp).' },
        { title: 'IndependentReview', detail: 'ONE round, different model (sonnet). SLIM: count-reconcile script + ~15-field sample. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL, REQUIRED): read-only VERDICTS on declared claims via the broker (sharepoint-readonly) — path status+records-present, @odata.nextLink advances, per-PK populated/null, delta token accepted, write-surface existence (OPTIONS/405/401 — NEVER a write call), Retry-After/throttle headers. Broker-down → degraded unauth status probe. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections sourced from Graph docs, confirmed by read-only re-probe). Reality outranks the frozen contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'IMPROVE the existing SharePointConnector.ts to the re-derived contract + tests. Generic per-operation CRUD where idiosyncratic Graph write shapes allow; document overrides (upload sessions, listItem /fields PATCH). MAX_CODE_BUILD_ROUNDS=2 effective amendment.' },
        { title: 'VerificationLadder', detail: 'T0..T8 + two-pass volatile-field idempotency rung. T4/T5/T7/T8 EMPIRICAL (mock from Graph OpenAPI/contract).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. LIVE through the broker (sharepoint-readonly, read-only) when broker UP — MOCK cannot satisfy [A]. Broker DOWN → ceiling format-verified-no-creds.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge[broker creds count], capability-honesty, env-preflight). Verdict states the EMPIRICAL/LINT split + the live ceiling actually reached.' },
    ],
};

// Args may arrive as a JSON STRING (model→Workflow path). Normalize FIRST.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'sharepoint';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// [A]-run: broker holds a live READ-ONLY credential under a multi-secret plan. The agent never reads the
// secret — it only names the broker plan. credentialReference is the opaque broker reference; brokerPlans
// names the read-only plan the live tiers submit. Either present ⇒ HybridE2E/T8 run LIVE (mock-dodge gate).
const CREDENTIAL_REFERENCE = A?.credentialReference ?? 'broker-held:sharepoint-readonly';
const BROKER_PLANS = (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0) ? A.brokerPlans : ['sharepoint-readonly'];

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    // Live ceiling REACHABLE for this run: T8 (read-only live rung through the broker). This records the
    // ceiling; it does NOT gate which non-live tests run (those always run to full applicable extent).
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2, // token-conscious default; SharePoint is a well-documented Graph surface, not a hard/novel shape → 2, never 4-5.
};

// ── EnvPreflight (S0 — v2 P7) ────────────────────────────────────────── [EMPIRICAL]
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
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook.\n` +
    `Abort-cheap: if ok=false and unresolved, the workflow stops here.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch (independent FULL-nature study) ───────────────────── [EMPIRICAL doc-read]
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
        WriteCapability: { type: ['object', 'null'] },   // BINDING (v2 P5) — Graph DOES support write
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research "${VENDOR}" = Microsoft 365 / SharePoint Online — canonical identity AND the FULL Graph SharePoint API nature, INDEPENDENT of the provided lab context (sources/sharepointcontext.md is an excellent testing doc and is trusted where it states facts, but it is a SCOPE signal, NOT the catalog source-of-truth; align the actual catalog + paths to the CURRENT Microsoft Graph v1.0 docs as the context itself instructs).\n` +
    `Establish from public Microsoft sources (Microsoft Graph v1.0 + SharePoint REST + Microsoft identity platform / Entra):\n` +
    `  • ObjectFamilies (the FULL surface for awareness): sites, drives(document libraries), driveItems(files+folders), lists, listItems, columns, contentTypes, permissions, sharingLinks, subscriptions(change-notifications), delta — PLUS the broader nature (SPFx UI, SharePoint REST/CSOM-only ops, Microsoft Search).\n` +
    `  • Auth model: OAuth2 Microsoft identity platform — app-only (client-credentials: tenant + client_id + client_secret/cert, scope https://graph.microsoft.com/.default) vs delegated (auth-code); Sites.Selected least-privilege. The connector's CredentialType is an OAuth2 client-credentials set.\n` +
    `  • Read AND write capability (Graph supports POST/PATCH/DELETE on driveItems/listItems + upload sessions) — WriteCapability is BINDING; do not under-claim it.\n` +
    `  • Pagination: @odata.nextLink (opaque cursor). Incremental: delta query (driveItem /delta + @odata.deltaLink TOKEN — NOT a timestamp). Throttling: 429 + Retry-After.\n` +
    `  • ScopeReason: for a MemberJunction SharePoint connector the useful/reachable surface is the Graph SharePoint object set; SPFx/REST-CSOM/Search are deferred-with-reason.\n` +
    `Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);

// ── SCOPE DECISION (planner judgment; recorded for the extractor + floor-check) ──
// brand.ObjectFamilies = full study surface (awareness). The modeled set is the IN-SCOPE Graph SharePoint
// subset, chosen knowingly — NOT a blind union (would model SPFx/Search the connector can't sync) and NOT
// the context alone. SourceAudit's script-derived TaxonomyLeaves is authoritative for the leaves; this
// declares the family-level scope + the deferred remainder so nothing is silently dropped.
const IN_SCOPE_FAMILIES = ['sites', 'drives', 'driveItems', 'lists', 'listItems', 'columns', 'contentTypes', 'permissions', 'sharingLinks', 'subscriptions'];
const OUT_OF_SCOPE_FAMILIES = [
    { family: 'spfx', reason: 'SharePoint Framework UI/web-parts/command-sets — UI extensibility, not a data-sync surface.' },
    { family: 'sharepoint-rest-csom-only', reason: 'SharePoint REST/CSOM-only operations — used only where Graph lacks coverage, isolated behind an adapter; not the default sync surface.' },
    { family: 'microsoft-search', reason: 'Microsoft Search — discovery aid, never a source of truth for sync (read by stable IDs via delta/query).' },
];

// ── Identity ─────────────────────────────────────────────────────────── [EMPIRICAL doc-read]
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (SharePoint). IMPROVE build: the connector class ALREADY EXISTS at packages/Integration/connectors/src/SharePointConnector.ts → ClassName="SharePointConnector", IntegrationName="SharePoint" (the connector's IntegrationName getter returns 'SharePoint'). ImportPath per the connectors package convention. Resolve CredentialTypeID by match-or-create against an OAuth2 client-credentials ConnectionConfig key shape (tenant_id + client_id + client_secret) — NEVER read a credential value. Read SOURCE_STUDY when ready.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}

// ── SourceAudit ──────────────────────────────────────────────────────── [EMPIRICAL doc-read]
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        VendorDocsPaths: { type: 'array' },
        Gaps: { type: 'array' },
        scopeDecision: { type: ['object', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName} = Microsoft Graph v1.0 SharePoint surface. Tier-1 = official Microsoft Graph v1.0 reference docs (sites, drive/driveItem, list/listItem, columnDefinition, contentType, permission, sharingLink/createLink, subscription/change-notifications, driveItem-delta, listItem-delta) + Microsoft identity platform OAuth2 client-credentials docs. The provided sources/sharepointcontext.md is INFORMATIONAL (a lab/testing doc), trusted where it states Graph facts but NOT the catalog source-of-truth.\n` +
    `Build SOURCE_STUDY.md with a COVERABLE-vs-INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the IN-SCOPE Graph SharePoint taxonomy (${IN_SCOPE_FAMILIES.join(', ')}) — DERIVE the leaf list by a SCRIPT over the Graph reference (object pages), NEVER by eyeballing a doc (the Path-LMS under-enumeration class: 16 of ~38). Record the OUT-OF-SCOPE families (spfx, sharepoint-rest-csom-only, microsoft-search) with reasons in scopeDecision so the deferred remainder is documented, not dropped.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── MetadataWrite ────────────────────────────────────────────────────── [EMPIRICAL doc-read]
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (the metadata dir does NOT yet exist — author it fresh from credential-free Graph v1.0 docs, NEVER from live sampling and NEVER from the existing connector code as "evidence").\n` +
    `NavigationBaseURL = https://graph.microsoft.com/v1.0 (provable from Graph docs). BatchMaxRequestCount/WaitTime per Graph JSON-batch limits (max 20 requests/batch) ONLY if doc-provable; else leave unset.\n` +
    `Configuration JSON MUST record: the @odata.nextLink pagination MECHANISM (the DB PaginationType enum is {None,Cursor,Offset,PageNumber} → pick Cursor and document that the cursor is the opaque @odata.nextLink absolute URL, followed verbatim, never reconstructed); the OAuth2 client-credentials token endpoint shape (https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token, scope https://graph.microsoft.com/.default) as a MECHANISM (no tenant constant baked); the delta-query incremental mechanism (IncrementalWatermarkField = the @odata.deltaLink TOKEN, persisted durably, full-resync on invalid token — NOT a timestamp); RateLimitPolicy hint (429 + Retry-After); and OutOfScopeObjectFamilies=${JSON.stringify(OUT_OF_SCOPE_FAMILIES)} (deferred-with-reason). NO tenant/site/drive/list ID may appear anywhere — pure mechanism only.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, max 3 rounds = 2 real amendments) ──
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

const MAX_AMENDMENT_ROUNDS = 3; // round 0 + up to 2 real re-extraction amendments (template-canonical)
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // Slot-routing: integration.* root-row fixes → metadata-writer (not the IO/IOF extractor).
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

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            // Scope passed through so the extractor models the in-scope subset deeply and records the
            // deferred remainder; floor-check reads scope-unjustified-thin against the enumerated universe.
            scopeOfInterest: IN_SCOPE_FAMILIES,
            outOfScopeFamilies: OUT_OF_SCOPE_FAMILIES,
            scopeReason: brand.ScopeReason ?? 'Graph SharePoint object set is the useful/reachable surface for a MemberJunction connector; SPFx/REST-CSOM/Search deferred.',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // SharePoint specifics the extractor MUST honor (provable-only, READ from Graph docs):
            //  • SOFT PKs from explicit Graph docs only: driveItem.id, listItem.id, site.id, drive.id,
            //    list.id, columnDefinition.id, contentType.id, permission.id, sharingLink/permission.id,
            //    subscription.id. NEVER guessed; ambiguous → defer to runtime D4.
            //  • FK graph (SOFT): driveItem → parentReference.driveId/siteId; listItem → list.id/site.id;
            //    drive → site.id; list → site.id; column/contentType → list.id/site.id. Emit
            //    RelatedIntegrationObjectID via @lookup …&IntegrationID=@parent:IntegrationID. The SharePoint
            //    FK graph is SPARSE/backward-ordered (children point at already-emitted parents) → KEEP the
            //    @lookup (it's load-bearing; soft-FK-by-name buys nothing here and would null the FKs for a
            //    Declared connector). Cross-check each lookup target name == an IO this run emits.
            //  • IncrementalWatermarkField = the delta TOKEN (@odata.deltaLink), set on the IOs that have a
            //    /delta sibling (driveItems, listItems) with SupportsIncrementalSync=true. NOT a timestamp.
            //  • PaginationType=Cursor, SupportsPagination=true (every collection is @odata.nextLink-paged).
            //  • SupportsWrite + per-operation CRUD columns ONLY where Graph documents the mutation
            //    (driveItem PUT/POST/PATCH/DELETE, listItem POST + /fields PATCH + DELETE, upload sessions).
            //    Provable CreateBodyShape/BodyKey/IDLocation per the Graph request/response shape; a vendor-
            //    idiosyncratic write (upload session, /fields-wrapped listItem PATCH) is documented for the
            //    code-builder to override but STILL routed through BuildCreatedResult.
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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). DIFFERENT MODEL from the planner/extractor. SLIM MODE — do NOT read the full Graph SDL/docs into context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over ${METADATA_FILE} + the source TaxonomyLeaves and read its compact stdout (object/field/zero-field counts) — never parse the source in-context.\n` +
        `Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for: bijection (every capability flag has its path+method pair); SOFT-PK plausibility (PK is a real scalar .id, not an object-valued field — the nested-PK dupe class); delta-token-as-watermark (IncrementalWatermarkField is the deltaLink token, not updatedAt); FK @lookup qualifier is &IntegrationID=@parent:IntegrationID AND the target name matches an emitted IO (singular/plural). Any zero-field object, bijection violation, object-valued PK, or unresolvable @lookup is a Confirmed Gap (Blocking) with an exact FixInstruction {slot, before, after, locus}. Keep context small — counts + sample.`,
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
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate — manifest.sourceDiffMustClose) ────────
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL, REQUIRED) ─────────────────────── [EMPIRICAL]
// Read-only VERDICTS on the declared claims BEFORE code is built on them. Runs THROUGH THE BROKER
// (sharepoint-readonly multi-secret plan) when the broker is up: the script mints a Bearer via the
// Microsoft identity platform token endpoint (client_credentials, scope .default) inside the broker
// process (token bytes NEVER enter the agent) and issues strictly read-only Graph GETs to verdict each
// declared claim — path status + records-present, @odata.nextLink advances, per-declared-PK populated/null
// over the probe page, delta token accepted/rejected, write-surface existence (OPTIONS/405/401 — NEVER a
// write call), Retry-After/throttle headers. Broker DOWN → DEGRADED unauthenticated per-claim status probe
// (401/403=path real + auth-gated, 404=wrong) and ceiling format-verified-no-creds. VERDICTS IN, AUTHORSHIP
// OUT — metadataDelta MUST be false (floor-check rejects probe-originated metadata deltas).
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },               // 'credentialed-readonly' (broker) | 'unauthenticated' (degraded)
        verdicts: { type: 'array' },
        metadataSha256: { type: 'string' },
        claims: { type: 'integer' },
        confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' },
        achievedCeiling: { type: 'string' },    // 'content-verified' | 'format-verified-no-creds'
        capturedPages: { type: 'array' },       // scrubbed real Graph response pages → canonical fixtures (P4)
        metadataDelta: { type: 'boolean' },     // MUST be false
        rateHeaders: { type: 'object' },
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. BASE_URL = the Integration row's NavigationBaseURL in ${METADATA_FILE} (https://graph.microsoft.com/v1.0).\n` +
    `2. CREDENTIAL PATH ([A]-run): a live READ-ONLY credential is held by the separate-user broker under the multi-secret plan "${BROKER_PLANS[0]}" (SHAREPOINT_TENANT_ID + SHAREPOINT_CLIENT_ID + SHAREPOINT_CLIENT_SECRET → client_credentials grant against https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token, scope https://graph.microsoft.com/.default). You NEVER read the secret bytes. Run the probe in CREDENTIALED mode by submitting the read-only broker job (the script mints the Bearer and issues read-only Graph GETs inside the broker process; you receive only scrubbed status + COUNTS + field-KEY names).\n` +
    `   Run EXACTLY (do not edit its output): node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url https://graph.microsoft.com/v1.0 --broker-plan ${BROKER_PLANS[0]} --out ${PROBE_OUT}\n` +
    `   If the broker is DOWN/unreachable: the script DEGRADES to the unauthenticated per-claim status probe (200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong) — it never disappears; achievedCeiling becomes format-verified-no-creds with every un-probed claim named.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode, verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling, metadataDelta:false }. You may NOT add objects/fields/paths (metadataDelta MUST be false) and you may NOT alter the script's verdicts — relay them exactly. The script writes scrubbed captured Graph pages alongside (P4 fixtures, PROVENANCE: live-capture).`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ────── [EMPIRICAL]
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the Graph v1.0 DOCS (re-read the cited Graph reference; pick the docs-supported alternative the probe confirmed — e.g. the corrected Graph path/segment, the real @odata.nextLink param behavior, demote an object-valued/always-null PK to content-hash identity, fix a delta-token watermark). Then RE-PROBE just the corrected claims (read-only, via the broker) to confirm and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 3 rounds = 2 real amendments) ──
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

const MAX_CODE_BUILD_ROUNDS = 3; // round 0 build + up to 2 real fix amendments
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only for genuinely idiosyncratic Graph write shapes (upload sessions, listItem /fields PATCH) and STILL route create through BuildCreatedResult.`
            : `IMPROVE-build the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. The class ALREADY EXISTS at packages/Integration/connectors/src/${identity.Identity.ClassName}.ts (Graph v1.0, @odata.nextLink cursor pagination, client-credentials Authenticate, /delta incremental). CRITIQUE it against the re-derived contract and DIFF: preserve only where the contract CONFIRMS the existing code; change everything the contract contradicts (object/field set, SOFT PKs as scalar .id, delta-token watermark, FK targets, write-surface). Keep tests green by UPDATING them to the corrected truth. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only for genuinely idiosyncratic Graph write shapes and STILL route create through BuildCreatedResult. NormalizeResponse strips the Graph "value" envelope; ExtractPaginationInfo follows @odata.nextLink VERBATIM (never reconstructed); DiscoveryIsAuthoritative stays false (Declared metadata + non-authoritative cache-driven introspection — absence proves nothing). [Re-verify pass after the T10_TransportSmoke + ladder broker-path harness fixes: the connector is already built+clean from the prior round — re-confirm correctness against the contract, keep changes minimal, do not regress.]`,
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
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
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
            // registry SLUG (not ClassName) — the runner resolves by slug dir; T1's three-way check reads
            // the real ClassName (SharePointConnector) from the metadata file (Finding A deadlock avoidance).
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            // [A]-run: live read-only credential reachable via the broker plan. Pass BOTH so the ladder's
            // live rung (T8 read-only) runs through the broker; broker-down degrades to the probe.
            credentialReference: CREDENTIAL_REFERENCE,
            brokerPlans: BROKER_PLANS,
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

if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, realityProbe, codeResult, ladder,
        amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, FRESH DB) ─── [EMPIRICAL]
// REQUIRED on every build. LIVE through the broker (sharepoint-readonly READ-ONLY plan) when the broker is
// up — mock CANNOT satisfy the [A] requirement. Read-only contract: TestConnection (token mint via the
// Microsoft identity platform) → discover → one read page per in-scope object → delta probe → completeness
// assertions; NEVER create/update/delete/ack against the live tenant. SQL Server (Postgres SUSPENDED for the
// per-connector loop). Broker DOWN → mock floor only + ceiling format-verified-no-creds (reported honestly).
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG, // registry slug (Finding A)
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds are reachable by EITHER path — opaque credentialReference OR a read-only broker
        // plan. Both present here, so HybridE2E runs LIVE (read-only) and the floor's e2e-mock-dodge gate
        // (which also keys on broker creds, #H7) is satisfied — never a mock-dodge.
        mode: (CREDENTIAL_REFERENCE || (Array.isArray(BROKER_PLANS) && BROKER_PLANS.length > 0)) ? 'live' : 'mock',
        credentialReference: CREDENTIAL_REFERENCE,
        brokerPlans: BROKER_PLANS,
        // MULTI-SECRET OAuth2: the generic single-token connector-e2e-live can't carry SharePoint's three
        // Azure-Service-Principal secrets, so the full live sync runs the vendor-specific sharepoint-e2e-live
        // broker plan (assembles CredentialValues from TenantId/ClientId/ClientSecret; writes:false).
        liveE2ETask: 'sharepoint-e2e-live',
        // Read-only [A] contract: the live rung is strictly read-only (writes:false on the broker plan).
        readOnly: true,
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── FloorCheck (final gate) ──────────────────────────────────────────── [LINT over EMPIRICAL evidence]
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
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? { inScope: IN_SCOPE_FAMILIES, outOfScope: OUT_OF_SCOPE_FAMILIES, reason: brand.ScopeReason ?? null },
            envPreflight,
            realityProbe,                                        // P2 reality-probe-* rules (read-only verdicts)
            credentialReference: CREDENTIAL_REFERENCE,           // P6 e2e-mock-dodge — broker creds are creds
            brokerPlans: BROKER_PLANS,                           // P6 e2e-mock-dodge (#H7)
            brand,                                               // P5 capability-dishonest (brand.WriteCapability — Graph DOES write)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? OUT_OF_SCOPE_FAMILIES,
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
    realityProbe,
    codeResult,
    codeRound,
    ladder,
    hybridE2E,
    verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
