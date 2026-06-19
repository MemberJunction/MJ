// path-lms.workflow.js — per-vendor build workflow (emitted by ConnectorCreator/planner)
//
// Vendor: Path LMS (a.k.a. BlueSky / Path LMS Reporting API, by Blue Sky eLearn / Cadmium).
// SHAPE: GraphQL source. The connector extends BaseRESTIntegrationConnector and rides REST over HTTP:
//   - Auth: two-step client-credentials → bearer. POST https://data-api.pathlms.com/api/v1/getToken
//     (Content-Type: application/x-www-form-urlencoded; applicationId + applicationSecret) →
//     {"token":"Bearer <jwt>"} valid 12h, sent as Authorization: <token>.
//   - Transport: GraphQL queries POST to https://data-api.pathlms.com/graphql ({query, variables}).
//     NormalizeResponse strips the data.account.<query> envelope to the record array.
//   - Pagination: OFFSET-based — offset (default 0) + limit (default 50, MAX 150). PaginationType=Offset.
//   - Incremental: DATE-RANGE — startDate/endDate (YYYY-MM-DD). Watermark = advance startDate to prior
//     run's endDate. Per-record updatedAt (finer incrementality) is to be VERIFIED, not assumed.
//   - Capability: READ-ONLY (Reporting API). SupportsWrite=false; Create/Update/Delete=false.
//
// CREDENTIAL: [B] credential-free run (credentialReference=null). Full non-live suite, no live API calls.
//   maxTier=T8 — the operator set it; on the Phase 0 tier ladder T8 (FailureModeInjection: inject
//   429/500/timeout/bad-JSON at the HTTP boundary, assert retry+classify) is requiresCredentials=false, so
//   it is reachable WITHOUT a credential and does not imply any live round-trip. The full NON-LIVE suite
//   (schema/contract validation, mock-server-from-spec, endpoint/header probing, bijective completeness)
//   runs to its full applicable extent independent of maxTier — maxTier only RECORDS the non-live ceiling.
//   RealityProbe DEGRADES to unauthenticated per-claim status probing — it never disappears: it still hits
//   /graphql + /api/v1/getToken + every declared door for 401/403 (real+gated) vs 404 (wrong), and
//   param-probes the offset/date-range forms where the endpoint tolerates it. HybridE2E runs in MOCK mode
//   (credentialReference null → mode 'mock'); the live §1→§7 path is skipped, as it must be with no credential.
//
// REBUILD: this connector was ALREADY seeded (prior PathLMSConnector.ts + .path-lms.integration.json on
//   disk). Those are prior OUTPUT — the extractor MUST NOT source from them (the circular-source defect
//   that re-baked the truncated 16-of-~38 catalog). And because the integration already exists in the DB,
//   `mj sync push` is upsert-NO-prune: stale IO/IOF survive + same-name re-seed collides on
//   UQ_IntegrationObject_Name. So the rebuild DELETES prior IO/IOF first (top-level deleteRecord markers +
//   --delete-db-only) before reseeding — handled in MetadataWrite/HybridE2E per metadata-file-conventions.md
//   "Rebuilding a connector that was ALREADY seeded".
//
// THIS VENDOR'S HARD-WON LESSONS (baked in — prior 11h Path LMS build):
//   1. OBJECT CATALOG = a SCRIPT'S STDOUT over the raw source, NEVER an agent eyeballing the 1.2MB docs
//      HTML. The SDL/introspection is AUTH-GATED (credential-free run cannot read it), so the catalog
//      must be enumerated IN CODE from the docs HTML (regex/DOM over the ~38 documented report queries),
//      cross-checked against an independent in-file signal, and FAIL/escalate on a material shortfall.
//      A prior variant shipped 16-of-~38 GREEN because the universe was eyeballed and every downstream
//      gate is bijective against that under-count. (memory: object_catalog_must_be_script_output)
//   2. FK authoring for THIS dense, forward-referencing graph (~84 cross-linked objects) → SOFT-FK
//      (IsForeignKey=true + target name in Configuration.ReferencedType, NO @lookup). Viable connector-
//      only because Path LMS re-derives every FK at runtime from its PUBLIC SpectaQL SDL — no framework
//      PR needed. (memory: connector_metadata_deploys_cleanly)
//   3. Nested-graph PK: descend each type's PK to the scalar `.id` (User.id, Course.id, …) — never pick
//      an object-valued field as PK (the nested-PK dupe-row class). (memory: connector_nested_pk_dupe)
//   4. Deploy-preflight: real deployed columns only, within widths, valid enums, never set MetadataSource.

export const meta = {
    name: 'path-lms-build',
    description: 'Workshop dynamic-workflow build for Path LMS (GraphQL Reporting API, read-only). Credential-free [B] run: full non-live suite to T8 (credential-free FailureModeInjection rung), RealityProbe degrades to unauthenticated, HybridE2E mock mode. Object catalog enumerated IN CODE (auth-gated SDL → docs-HTML scan). REBUILD (delete prior seeded IO/IOF first). Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ migration level, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Canonical Path LMS identity + ProductTaxonomy. WriteCapability finding BINDING (v2 P5) — expect READ-ONLY.' },
        { title: 'Identity', detail: 'Integration row identity slots. Reconcile CredentialTypeID: groundwork shows client-credentials {applicationId, applicationSecret}; vendor_request labels it apiKey+endpoint — match-or-create against the connector ConnectionConfig key shape.' },
        { title: 'SourceAudit', detail: 'ENUMERATE THE OBJECT CATALOG IN CODE over the saved docs HTML (~38 report queries) — SDL is auth-gated. Cross-check count; FAIL on material shortfall. COVERABLE vs INFORMATIONAL split + scope decision.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (GraphQL transport, offset pagination max 150, date-range incremental). REBUILD: delete prior seeded IO/IOF (top-level deleteRecord + --delete-db-only) before reseed.' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline. GraphQL access-path (door → nesting path). Scalar .id PKs. SOFT-FK via Configuration.ReferencedType (dense graph). SupportsWrite=false.' },
        { title: 'IndependentReview', detail: 'ONE round, SLIM. Count-reconcile script over metadata+source (NOT in-context). Sample bijection + capability-honesty (read-only) + GraphQL access-path sanity. LINT.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL). DEGRADED unauthenticated (no credential): per-claim status (401/403=real+gated, 404=wrong) on /graphql, /api/v1/getToken, /api/v1/csv + declared doors. Param-probe offset/limit + startDate/endDate forms where tolerated. Rate headers. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'PathLMSConnector extends BaseRESTIntegrationConnector. Two-step auth (getToken→bearer 12h cache), GraphQL over MakeHTTPRequest/NormalizeResponse, offset paging ≤150, date-range watermark. Fixtures from probe captures or doc examples (provenance-tagged).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (all credential-FREE rungs; T8=FailureModeInjection needs no credential). Includes two-pass volatile-field idempotency rung (v2 P3). EMPIRICAL where it touches real spec; LINT elsewhere.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. MOCK mode (no credential — live cells logged skip with credential-absent reason). Coords from caller dbProfile/mjapi (operator: MJ_PLMS_E2E / sql-gz / :1447 / :4014). Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates. Verdict states the EMPIRICAL/LINT split; live e2eTier ceiling = format-verified-no-creds.' },
    ],
};

const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'path-lms';
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
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — the 11-stage build must never burn on a broken env.`,
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
        WriteCapability: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (Path LMS / BlueSky by Blue Sky eLearn / Cadmium) — canonical identity AND full API nature ` +
    `from INDEPENDENT public sources (its REAL surface, object families, auth model, pagination, rate limits, read-vs-bidirectional capability, "what else the system exposes"). ` +
    `NO context doc was provided, so establish breadth from public discovery; do NOT assume the Reporting API is the whole system. ` +
    `The Reporting API (data-api.pathlms.com) is GraphQL + read-only — set WriteCapability accordingly (v2 P5: this finding is BINDING — a write-capable claim downstream without evidence is a capability-dishonesty floor failure). ` +
    `If the broader Path LMS platform exposes a separate writable admin/REST API, RECORD it as known-but-out-of-scope (the operator scoped this build to the Reporting API), do NOT model it. Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (ClassName=PathLMSConnector, extends BaseRESTIntegrationConnector). ` +
    `Read SOURCE_STUDY when ready. ` +
    `This is a REBUILD — the Integration likely EXISTS in the DB (ExistsInDB). Report it; reconciliation/deletion of stale child rows happens in MetadataWrite/HybridE2E, not here. ` +
    `CredentialTypeID — resolve via match-or-create against the connector's ConnectionConfig key shape. NOTE A TENSION TO RECONCILE: the public groundwork describes a two-step client-credentials flow with keys {applicationId, applicationSecret} (POST /api/v1/getToken → bearer, 12h), whereas the prior credential type was labelled "Path LMS Reporting API = apiKey + endpoint". ` +
    `Author the credential type to match what the connector ACTUALLY reads (applicationId + applicationSecret, plus the data-api base/endpoint as config) — never the historical label if it disagrees with the proven key shape. ` +
    `Use the universalPK Configuration hint only when authoritatively documented (each GraphQL type's scalar id is the candidate; confirm in extraction, not here).`,
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
        EnumerationScriptPath: { type: ['string', 'null'] },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
        IndependentCrossCheckSignal: { type: ['string', 'null'] },
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        Gaps: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName} (Reporting API @ data-api.pathlms.com). Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split.\n` +
    `\n` +
    `🚨 ENUMERATE THE OBJECT CATALOG IN CODE — this is the #1 prior failure on THIS vendor. The GraphQL introspection/SDL at data-api.pathlms.com is AUTH-GATED (a credential-free run cannot read it — it returns a "jwt must be provided" error), so DO NOT eyeball the ~1.2MB docs HTML and type object names. Instead:\n` +
    `  1. SAVE the raw docs HTML to disk (download once → scratch file; grep across turns, never re-Read the whole file).\n` +
    `  2. WRITE + RUN an enumeration SCRIPT that programmatically scans that saved HTML (regex/DOM over the documented report-query anchors/identifiers) and PRINTS the object list + count to stdout. TaxonomyLeaves = that script's stdout, NEVER a list you assembled in context. Record EnumerationScriptPath + EnumerationStdoutCount.\n` +
    `  3. CROSS-CHECK the count against an independent in-file signal (nav-entry count, operation-section count, type-reference count) and record it in IndependentCrossCheckSignal. The docs document ~38 report queries (assessments/assignments/surveys/scorm/certificates/credits + the FULL commerce family: orders/orderItems/refunds/refundsDetails/sales-by-category/-user/-bundle/-content/productCatalog/coupons/discounts + course-item-views/user-visits/user-presentations + metadata/userMetadata/templates). If your script's count is MATERIALLY below the cross-check signal, FAIL/ESCALATE — do not under-count from docs because the SDL is unavailable. The catalog is "a number a script printed," not "a number you decided."\n` +
    `  4. The prior .${VENDOR_SLUG}.integration.json on disk is prior OUTPUT — NOT a source. Do not read it to assemble the catalog; enumerate from the raw docs HTML only (the circular-source defect re-baked the truncated 16-of-~38 catalog).\n` +
    `\n` +
    `SCOPE DECISION (planner judgment): no context doc was provided to cap scope, so the in-scope set IS the full credential-free-discoverable Reporting-API catalog your script enumerates. Model that deeply. Any broader Path LMS platform surface the brand study found (separate admin/REST APIs) is recorded as known-but-out-of-scope with a reason — never modeled here, never silently dropped.\n` +
    `\n` +
    `Emit TaxonomyLeaves (the script's enumerated leaves) as input to extract-iiof-pipeline. Populate VendorDocsPaths/SDKPaths/PostmanPaths with whatever credential-free sources exist.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);
log(`SourceAudit: TaxonomyLeaves=${(sources.TaxonomyLeaves ?? []).length} scriptCount=${sources.EnumerationStdoutCount ?? '?'} crossCheck=${sources.IndependentCrossCheckSignal ?? '?'}`);

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
        PriorRowsDeletedForReseed: { type: ['integer', 'null'] },
    },
};
const metadataResult = await agent(
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata.\n` +
    `GraphQL-source specifics to encode in Configuration: transport=graphql, graphqlEndpoint=/graphql, tokenEndpoint=/api/v1/getToken (form-encoded, 12h bearer), pagination=offset (limit max 150), incremental=date-range (startDate/endDate, YYYY-MM-DD).\n` +
    `Rate limits are NOT documented → conservative RateLimitPolicy + parse Retry-After; record the proven-negative (searched the authoritative sources; not stated). Read-only — no batch write columns at the Integration level.\n` +
    `DEPLOY-PREFLIGHT (bake the prior 11h lesson): every field you write MUST be a REAL deployed column within its width; PaginationType ∈ {None,Cursor,Offset,PageNumber} (use Offset); NEVER set MetadataSource (the pipeline sets it). Custom semantics that have no column go in Configuration.\n` +
    `🔁 REBUILD RECONCILIATION (per metadata-file-conventions.md "Rebuilding a connector that was ALREADY seeded"): the Integration is already seeded in the DB, so a plain mj sync push is upsert-NO-prune — stale IO/IOF survive and same-name re-seed collides on UQ_IntegrationObject_Name. Before/while reseeding: (1) query the DB for the existing Integration + its IO/IOF; (2) any IO/IOF ABSENT from this rebuild's enumerated catalog → author a TOP-LEVEL deleteRecord marker ({"deleteRecord":{"delete":true},"primaryKey":{"ID":"…"}}) in the proper entity dir (NOT nested — the deletion-audit gate only inspects top-level array elements); (3) the test/reseed push uses --delete-db-only so DB-only dependent IOF are swept (CascadeDeletes=0). Report PriorRowsDeletedForReseed. The corrected rows that already exist by ID are upserted in place; only genuinely-stale rows are deleted (separate delete-only push if a re-upsert would collide).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, max 1 round) ──────────
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

const MAX_AMENDMENT_ROUNDS = 1;
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
            objectList: sources.TaxonomyLeaves,
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Extractor guidance for THIS GraphQL-source shape (carried as hints; the pipeline reads sourceBundle):
            //  - ENUMERATE FROM THE RAW SOURCE: treat objectList as a hint/cross-check, NEVER a cap. If the
            //    extractor finds more report queries in the saved docs than handed in, emit all + surface the
            //    discrepancy (do not faithfully build an under-count — the prior 16-of-~38 green failure).
            //  - GraphQL ACCESS-PATH: tables ≠ doors. Compute per object the entry-query (door = account/teams)
            //    + nesting field-path + door-level args (offset/limit, startDate/endDate); write to IO.Configuration.
            //  - PK: descend each type's PK to the SCALAR `.id` (User.id, Course.id) — NEVER an object-valued
            //    field (the nested-PK dupe-row class).
            //  - FK (DENSE forward-ref ~84-object graph): SOFT-FK — IsForeignKey=true + target object NAME in
            //    Configuration.ReferencedType, NO @lookup (forward-ref @lookup rolls back the single push).
            //    Viable connector-only because the connector re-derives FKs at runtime from the public SpectaQL
            //    SDL (PublicFieldToSchema) — no framework PR.
            //  - CAPABILITY: read-only. SupportsWrite=false on every IO; no Create/Update/Delete columns.
            //  - INCREMENTAL: date-range. Set SupportsIncrementalSync only where a date-range or per-record
            //    updatedAt is PROVABLE; IncrementalWatermarkField names the proven cursor (startDate or updatedAt).
            sourceBundle: {
                // Path LMS connector .ts + prior metadata file are prior OUTPUT — NOT sources (circular-source
                // defect re-baked the truncated catalog). Deliberately OMITTED from existing*Paths.
                existingMetadataPaths: [],
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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/docs HTML into your context. ` +
        `Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source's enumeration output and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. ` +
        `ESPECIALLY re-confirm the object UNIVERSE count against the source-auditor's enumeration-script count (${sources.EnumerationStdoutCount ?? 'see SourceAudit'}) and its cross-check signal — a universe materially below the cross-check is the prior 16-of-~38 under-reach and is a Confirmed Gap (Blocking). ` +
        `Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for: bijection, CAPABILITY-HONESTY (every IO read-only, SupportsWrite=false — a write claim with no evidence is blocking), scalar-.id PKs (not object-valued), and soft-FK form (Configuration.ReferencedType, no @lookup). ` +
        `Populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
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
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} rounds with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL) — DEGRADED unauthenticated ──
// No credential ([B] run) → unauthenticated per-claim probing. It NEVER disappears: every declared
// door + the two auth/transport endpoints are probed for 401/403 (path real + auth-gated) vs 404
// (path wrong), and the offset/limit + startDate/endDate param forms are probed where the endpoint
// tolerates it. This is the stage that catches the GZ class of defect (wrong paths, dead pagination,
// PKs on always-null fields) before code is built. VERDICTS IN, AUTHORSHIP OUT.
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },               // expect 'unauthenticated' for this [B] run
        verdicts: { type: 'array' },            // { claim, kind: path|pagination|pk|watermark|writeSurface|rate, verdict: confirmed|wrong|unverified, evidence, resolved? }
        capturedPages: { type: 'array' },
        metadataDelta: { type: 'boolean' },     // MUST be false — verdicts only
        rateHeaders: { type: 'object' },
    },
};
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, UNAUTHENTICATED — there is NO credential for this run, so this is the DEGRADED per-claim status probe (it still runs; it does not disappear).\n` +
    `GraphQL-source note: this vendor is a GraphQL API (POST /graphql) behind a two-step token (/api/v1/getToken). Without a token you cannot read records, but you CAN prove the doors are real and the param forms are honest:\n` +
    `For EVERY declared claim in ${METADATA_FILE}, emit a VERDICT (confirmed | wrong | unverified + evidence):\n` +
    `• transport endpoints → status-probe POST https://data-api.pathlms.com/graphql and POST https://data-api.pathlms.com/api/v1/getToken and POST /api/v1/csv: a 401/403/400-"jwt must be provided" PROVES the endpoint exists + is auth-gated (verdict=confirmed); a 404 proves the path is WRONG (verdict=wrong). TLS/DNS reachability of data-api.pathlms.com.\n` +
    `• per-object door/access-path → the declared GraphQL query name + door (account/teams) is internally consistent with the access-path in IO.Configuration; for the unauth layer, confirm the /graphql endpoint accepts a POST shape (status, not data). Anything only confirmable with a token → verdict=unverified, named explicitly.\n` +
    `• pagination → the DECLARED form is offset/limit (NOT $skip). Confirm offset+limit are the documented params (docs cross-check) and limit max 150; if the endpoint tolerates an unauth probe, check the param is ACCEPTED (not a 400 "unknown argument"). A declared param the docs/probe contradict = verdict=wrong.\n` +
    `• per-declared-PK → cannot read records unauthenticated → verdict=unverified, but RE-CONFIRM from docs that each PK is the scalar .id (not an object-valued field); a declared object-valued PK is verdict=wrong on the spot.\n` +
    `• incremental watermark param → startDate/endDate (YYYY-MM-DD) are documented params (docs cross-check); unauth acceptance probe where tolerated. updatedAt finer-incrementality = unverified unless documented.\n` +
    `• write surface → existence evidence ONLY (this is a read-only Reporting API; confirm via docs/OPTIONS there is NO documented write endpoint — NEVER issue a write). A write claim is verdict=wrong.\n` +
    `• rate-limit headers observed (X-RateLimit-*, Retry-After) on any probe response.\n` +
    `Scrub + save any captured response shells to ${RUNS_DIR}/probe-captures/ (PROVENANCE: live-capture). You may NOT add objects/fields/paths to the metadata: metadataDelta MUST be false. ` +
    `Ceiling is format-verified-no-creds: enumerate EVERY un-probed (token-required) claim BY NAME — never a blanket green.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. the documented offset/limit form, the corrected /graphql door, demote an object-valued PK to the scalar .id, flip a wrongly-claimed write IO to read-only). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 2 rounds) ────────────────
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
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes.`
            : `Build the connector class PathLMSConnector for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}.\n` +
              `SHAPE: GraphQL source over BaseRESTIntegrationConnector (no BaseGraphQLConnector exists — ride REST over HTTP).\n` +
              `• @RegisterClass(BaseIntegrationConnector,'PathLMSConnector'); IntegrationName getter = exact MJ Integrations.Name.\n` +
              `• Authenticate: two-step. POST /api/v1/getToken (Content-Type: application/x-www-form-urlencoded; applicationId + applicationSecret) → {"token":"Bearer <jwt>"}; cache the bearer ~12h (OAuth2TokenManager-style caching from auth-helpers — NEVER inline crypto). BuildHeaders → Authorization: <token>.\n` +
              `• MakeHTTPRequest: POST {query, variables} to /graphql. NormalizeResponse strips the data.account.<query> envelope to the record array (handle {items,total} vs direct array — verify against probe captures / doc examples).\n` +
              `• ExtractPaginationInfo: OFFSET — offset/limit (limit ≤150). FetchChanges pages via offset; date-range incremental (startDate→prior endDate) per IncrementalWatermarkField.\n` +
              `• Discovery: object catalog is Declared (the enumerated report queries). DiscoverFields: GraphQL introspection is auth-gated → runtime Discovered via SDL introspection after connect (encode the MECHANISM, never a baked field catalog). FK re-derivation reads the public SpectaQL SDL (PublicFieldToSchema) so Configuration.ReferencedType soft-FKs resolve at runtime.\n` +
              `• Capability: READ-ONLY — SupportsCreate/Update/Delete=false; do NOT emit CRUD methods that return 501.\n` +
              `• Full-record pass-through: ExternalRecord.Fields = full source record (custom-column capture). Use generic per-operation BaseRESTIntegrationConnector machinery; override only the genuinely GraphQL-idiosyncratic bits (transport + normalize).\n` +
              `Fixtures descend from reality: probe captures (PROVENANCE live-capture) or vendor-published doc examples — provenance-tagged, scrubbed.`,
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
            connectorName: VENDOR_SLUG,   // registry SLUG, not ClassName (Finding A — T1 reads ClassName from metadata)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,
            maxTier: MANIFEST.e2eTier,     // T8 — all credential-FREE rungs (T8=FailureModeInjection needs no live creds)
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server) ─────────
// REQUIRED on every build — the SQL-Server sync is THE proof the connector works (NOT Postgres-pinned;
// PG is suspended for the per-connector loop). No credential ([B] run) → MOCK mode: the mock floor is
// credential-free; live cells are logged skip with a credential-absent reason, never silently dropped.
//
// 🔴 MANDATORY COORD FORWARDING — the hybrid-e2e primitive reads its DB/MJAPI coords from A?.dbProfile +
// A?.mjapi (hybrid-e2e.workflow.js ~L73-79: DBP=A?.dbProfile, GQL_PORT=A?.mjapi?.graphqlPort). The stock
// _TEMPLATE call does NOT forward them, so without these two keys the primitive falls back to the HubSpot
// defaults (MJ_SS_E2E / sql-claude / :4007) and would COLLIDE with a concurrent session (DROP DATABASE /
// kill :4007). We forward the operator's isolated coords (MJ_PLMS_E2E / sql-gz / :1447 / :4014) so this
// run uses its OWN container/DB/port. This is non-negotiable and floor-checked.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        mode: A?.credentialReference ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
        // ── ISOLATED-INFRA COORDS (operator-mandated, MUST be forwarded) ──
        dbProfile: A?.dbProfile,   // operator: { name:'MJ_PLMS_E2E', container:'sql-gz', port:1447 }
        mjapi: A?.mjapi,           // operator: { graphqlPort:4014 }
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} mode=${hybridE2E?.mode} (mock floor + ${A?.credentialReference ? 'live' : 'live-skipped:credential-absent'}); coords db=${A?.dbProfile?.name ?? '(default)'} gqlPort=${A?.mjapi?.graphqlPort ?? '(default)'}`);

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
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,   // null → e2e-mock-dodge gate is satisfied by mock (no live owed)
            brand,                                                  // P5 capability-dishonesty (brand.WriteCapability = read-only)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? 0,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, realityProbe, ladder, hybridE2E, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
