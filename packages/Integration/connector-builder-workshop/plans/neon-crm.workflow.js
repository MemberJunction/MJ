// neon-crm.workflow.js — per-vendor build workflow (planner emission)
//
// Vendor: Neon CRM (standalone nonprofit CRM / fundraising / membership / events platform — NOT
//         Salesforce-native; its own REST API, org IDs, API keys, webhooks, custom objects).
// Shape:  REST + OpenAPI (OAS3). API v2 is the modern RESTful surface; v1/SOAP is legacy → OUT OF SCOPE.
//         Auth:  HTTP Basic Auth — username = Neon Org ID, password = Neon API Key
//                (Authorization: Basic base64(orgId:apiKey)). Explicitly NOT OAuth client-credentials.
//         Pagination: present (page/pageSize style on list endpoints).
//         Incremental: modified/updated-since timestamps on list/search endpoints.
//         Object families (v2): Accounts (Individuals/Organizations), Donations, Pledges, Recurring
//                donations, Events, Event Registrations, Event Attendees, Memberships (+ levels/terms),
//                Store Products, Orders, Payments, Activities, Custom Objects, Custom Fields,
//                System Properties, Webhooks. Webhooks = near-real-time signals (receiver/management),
//                NOT a sync data stream — model webhook MANAGEMENT objects, treat delivery as out-of-scope.
//         Sources: public Neon API v2 OAS3 / OpenAPI YAML reference (e.g. v2.x) + public Postman
//                documenter collection — both credential-free, machine-readable, Tier-1/Tier-2.
//
// Run mode: [B] NO CREDENTIAL. credentialReference=null → HybridE2E runs MOCK; RealityProbe runs the
//           DEGRADED unauthenticated status/header probe (401/403=path real & auth-gated, 404=wrong,
//           405=wrong verb). The full non-live suite still runs to its applicable extent: OAS3
//           spec/contract validation, mock-server-from-spec (Prism/Mockoon), Postman-collection replay,
//           endpoint/header probing, recorded-example field-mapping checks, bijective completeness.
//           maxTier=T8 RECORDS the non-live ceiling (format-verified-no-creds); it never restricts which
//           non-live techniques run.
//
// This file customizes _TEMPLATE.workflow.js. Locked-primitive signatures preserved; both amendment
// loops (extract + codebuild) implemented; bijection floor-check + freeze gate intact.

export const meta = {
    name: 'neon-crm-build',
    description: 'Workshop dynamic-workflow build for Neon CRM (REST+OAS3, HTTP Basic Auth org-id:api-key). Locked primitives + bijection floor-check. NO-CREDENTIAL run (format-verified-no-creds ceiling).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve Neon CRM identity + full API nature INDEPENDENTLY of the provided context (object families, HTTP Basic Auth org-id:api-key, read+write CRUD per v2, page pagination, modified-since incremental, rate limits, webhooks). DETECT TENSION with the context; context is trusted-where-it-speaks but NOT exhaustive. WriteCapability + custom-field findings BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (ClassName=NeonCRMConnector); resolve CredentialTypeID match-or-create for the Basic-Auth { OrgID, APIKey } credential shape (NOT OAuth).' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: Neon API v2 OAS3/OpenAPI YAML (Tier-1 machine-readable) + Postman documenter (Tier-2). Build SOURCE_STUDY; emit TaxonomyLeaves = the in-scope v2 object universe ENUMERATED BY SCRIPT from the spec (never eyeballed). v1/SOAP recorded out-of-scope.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (base URL https://api.neoncrm.com/v2, rate limit, modified-since strategy, OutOfScopeObjectFamilies [v1/SOAP, webhook delivery] + reason).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the OAS3 spec (verify + write-back). Model Accounts/Donations/Pledges/Recurring/Events/Registrations/Attendees/Memberships(+levels/terms)/Store Products/Orders/Payments/Activities/Custom Objects/Custom Fields/System Properties/Webhooks(management). page pagination → PageNumber/Offset; modified-since watermark; per-operation CRUD columns from POST/PUT/PATCH/DELETE ops. PK/FK READ from the spec (account linkage on transactions; registration→attendees), never guessed.' },
        { title: 'IndependentReview', detail: 'ONE round (slim, model=sonnet, different from planner): count-reconcile script + ~15-field sample. coverage-vs-script / bijection / capability-honesty / naming. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): read-only VERDICTS on declared claims. NO CREDENTIAL → degraded unauth probe (401/403=path real & Basic-Auth-gated, 404=wrong path, 405=wrong verb), header introspection (WWW-Authenticate, rate-limit/Retry-After), pagination/modified-since param existence vs the spec. NEVER authors metadata (verdicts in, authorship out).' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections sourced from the OAS3 spec/docs, confirmed by re-probe). Reality outranks the frozen contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'NeonCRMConnector extends BaseRESTIntegrationConnector. APIKeyHeaderBuilder/Basic-Auth header from auth-helpers (NEVER inline crypto) — base64(orgId:apiKey); generic per-operation CRUD; donation/payment write idempotency note (reconcile-before-retry); tests + spec/Postman-derived fixtures (PII-scrubbed, provenance-tagged).' },
        { title: 'VerificationLadder', detail: 'T0..T8 + two-pass volatile-field idempotency rung. T7 OpenAPI validation is high-value (vendor publishes OAS3). T8 failure-mode injection covers the documented 400/401/403/404/409/422/429/500/timeout matrix + reconcile-before-retry on writes.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. NO CREDENTIAL → MOCK mode (mock floor is credential-free; mock server from the OAS3 spec). Env per HYBRID_E2E_ENV_RUNBOOK.md — Docker daemon is the only assumption.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest format-verified-no-creds ceiling.' },
    ],
};

// Normalize args FIRST (the model→Workflow path delivers a JSON string; without this runID etc. default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'neon-crm';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// NO-CREDENTIAL run: e2eTier records the non-live ceiling (T8); it does NOT restrict non-live techniques.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
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
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook first.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 10 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
// Independent study establishes the FULL Neon API nature (object families, Basic Auth, read+write
// CRUD, pagination, modified-since incremental, rate limits, webhooks) from public discovery — NOT
// capped by the provided neoncontext.md. Context is trusted-where-it-speaks; DETECT TENSION and
// investigate where the study and the context disagree (e.g. exact v2 object set, write surface).
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
        WriteCapability: { type: ['object', 'null'] },   // BINDING (v2 P5): does v2 document create/update/delete?
        CustomFieldModel: { type: ['object', 'null'] },  // BINDING: custom fields / custom objects support
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (Neon CRM). Establish its canonical identity AND its FULL API nature INDEPENDENTLY of the provided context pack at packages/Integration/connectors-registry/${VENDOR_SLUG}/sources/neoncontext.md, which is a HIGH-priority HELPER but is NOT exhaustive. Determine: object families (Accounts/Individuals/Organizations, Donations, Pledges, Recurring donations, Events, Event Registrations, Event Attendees, Memberships+levels+terms, Store Products, Orders, Payments, Activities, Custom Objects, Custom Fields, System Properties, Webhooks); auth model (HTTP Basic Auth — Org ID as username + API Key as password — explicitly NOT OAuth); read AND write/CRUD capability per API v2; pagination; modified/updated-since incremental signal; documented rate limits; webhook model. Note that v1/SOAP is legacy and out of scope. WriteCapability + CustomFieldModel findings are BINDING. Resolve NavigationBaseURL + icon class. Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (Neon CRM). ClassName should be NeonCRMConnector; ImportPath per the connectors package convention. Read SOURCE_STUDY when ready. Resolve CredentialTypeID via MATCH-OR-CREATE against the connector ConnectionConfig key shape — Neon uses HTTP Basic Auth with { OrgID (username), APIKey (password) }; this is NOT an OAuth credential type, so match an existing basic/api-key { OrgID, APIKey } credential type or create one. Use the universalPK Configuration hint only when authoritatively documented (Neon resource ids).`,
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
        VendorDocsPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
        PostmanPaths: { type: 'array' },
        Gaps: { type: 'array' },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName} (Neon CRM). Tier-1 = the public Neon API v2 OAS3/OpenAPI YAML reference (machine-readable, e.g. v2.x); Tier-2 = the public NeonCRM API v2 Postman documenter collection; the provided context pack (neoncontext.md) is a HIGH-priority Tier-1 informational helper. Build SOURCE_STUDY.md with a COVERABLE-vs-INFORMATIONAL split. CRITICAL: emit TaxonomyLeaves = the leaves of the COVERABLE v2 object taxonomy ENUMERATED BY A SCRIPT over the raw OAS3 spec (paths/components), NEVER hand-listed in context (the Path-LMS under-enumeration failure). Record API v1 + SOAP as INFORMATIONAL/out-of-scope, and webhook DELIVERY as out-of-scope (model webhook MANAGEMENT objects only). Set EnumerationStdoutCount to the script's reported object count. Populate VendorDocsPaths/PostmanPaths so the extractor's multi-source PK/FK detection can consult every credential-free source.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} (Neon CRM). Base URL = the documented Neon API v2 host (e.g. https://api.neoncrm.com/v2). Capture: documented rate limits → BatchMaxRequestCount/BatchRequestWaitTime (leave null if undocumented — provable-only); the modified/updated-since incremental strategy; pagination defaults. Configuration JSON MUST record OutOfScopeObjectFamilies = ["API v1 / SOAP (legacy)", "Webhook delivery (near-real-time signal, not a sync stream)"] with the reason. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER edit the file directly).`,
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

const MAX_AMENDMENT_ROUNDS = 6;
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
            objectList: sources.TaxonomyLeaves,
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs (Gap 10). Producer MUST consult each credential-free
            // source where it exists. NO existing connector/metadata to read (fresh build) — those are
            // OUTPUT and forbidden as sources anyway.
            sourceBundle: {
                existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`,
                existingMetadataPaths: [
                    `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`,
                ].filter(Boolean),
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [`packages/Integration/connectors-registry/${VENDOR_SLUG}/sources/neoncontext.md`],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${extractStats.gapsRemaining?.length ?? 0} gaps`);

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
    review = await agent(
        `Adversarial review of the ${VENDOR} (Neon CRM) emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full OAS3 spec into your context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the OAS3 spec and read its compact stdout (object/field/zero-field counts) — never parse the spec in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the spec) for bijection + plausibility, with focus on: account-linkage FK on transactions (donations/registrations/memberships → account), registration→attendees relationship, Basic-Auth capability honesty (no OAuth columns), and singular/plural IO naming consistency. Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample, never the whole schema.`,
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL) ─────────────────────────────
// Read-only VERDICTS on declared claims BEFORE code is built on them. NO CREDENTIAL → degraded
// unauthenticated per-claim status probe (200=public, 401/403=path real & Basic-Auth-gated [content
// UNVERIFIED], 404=wrong path, 405=wrong verb) + header introspection (WWW-Authenticate, rate-limit/
// Retry-After) + pagination/modified-since param existence vs the spec. VERDICTS IN, AUTHORSHIP OUT.
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
    `RealityProbe (S7) for ${VENDOR} (Neon CRM). READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, or the scheme+host of an APIPath — expected the Neon API v2 host).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real & Basic-Auth-gated, content UNVERIFIED], 404=wrong path, 405=wrong verb; plus header + pagination/modified-since param existence checks against the spec).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (S8 — ONE mandatory round when claims falsified; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR} (Neon CRM): ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the OAS3 SPEC / DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. the corrected v2 path, the right pagination param name, the documented modified-since param, demote a null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
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
            ? `Re-build the ${brand.CanonicalName} (Neon CRM) connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the connector class for ${brand.CanonicalName} (Neon CRM) from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector; @RegisterClass(BaseIntegrationConnector, 'NeonCRMConnector'). Auth = HTTP Basic Auth: Authorization: Basic base64(OrgID:APIKey) — build the header via the shared auth-helpers (APIKeyHeaderBuilder / basic-auth helper), NEVER inline base64/crypto. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic (e.g. donation/payment writes — add a reconcile-before-retry note, do NOT blindly retry on timeout). Write tests + fixtures derived from the OAS3 spec / Postman examples, PII-scrubbed via scrub-fixture, PROVENANCE-tagged.`,
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

    // ── Ensure the connector is registered in connectors/src/index.ts ────
    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append the line:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // ── Stage artifacts into the registry dir where mj-test-runner looks ──
    // ARC FIX (improvement-log leak #5/#7, 2026-06-16): rebuild the extraction matrix from the
    // persisted metadata with the CURRENT floor builder BEFORE staging/ladder, so metadata-derived
    // rows (incl. GapFill-added objects) carry the metadata-provable id-convention PK source signal.
    // Without this, T1 PkSourceMatrix false-flags legit id-convention PKs as fabrication and the
    // code-build loop deadlocks (code-builder can't fix a matrix issue). Idempotent + cheap (haiku).
    await agent(
        `[rerun3: T3+T7+T10 fixed, ladder zero-reds] Regenerate the extraction matrix from the persisted metadata using the current floor builder (it now credits metadata-provable id-convention PK source-backing). Run EXACTLY:\n` +
        `  node packages/Integration/connector-builder-workshop/floor/build-matrix-from-metadata.mjs ${METADATA_FILE} ${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv ${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv.rich.csv\n` +
        `Return { regenerated: true, totalIOs } parsed from the script's JSON stdout.`,
        { schema: { type: 'object', required: ['regenerated'], properties: { regenerated: { type: 'boolean' }, totalIOs: { type: 'integer' } }, additionalProperties: true }, model: 'haiku', phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `matrix-rebuild:r${codeRound}` }
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

    // Build clean — try the ladder
    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, FRESH DB) ──
// REQUIRED on every build. NO CREDENTIAL → MOCK mode (the mock floor is credential-free; mock server
// from the OAS3 spec). Env bring-up is fully scripted in HYBRID_E2E_ENV_RUNBOOK.md — Docker daemon up
// is the ONLY assumption. Runs on SQL Server (DB_PLATFORM=sqlserver); fresh-PG codegen is suspended.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds reachable by EITHER an opaque credentialReference OR a read-only broker plan;
        // else MOCK. This NO-CREDENTIAL run → MOCK.
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
            // v2 EMPIRICAL-gate evidence:
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
