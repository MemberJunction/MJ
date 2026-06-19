// pheedloop.workflow.js — per-vendor workshop build for PheedLoop (event management platform).
//
// Emitted by the ConnectorCreator planner. Customizes _TEMPLATE.workflow.js for PheedLoop's
// discovered nature:
//   - REST/JSON over a Django REST Framework backend (pheedloop-api-version: v3.7.0).
//   - Docs are a PUBLISHED POSTMAN COLLECTION (develop.pheedloop.com CORS-allows phs.getpostman.com,
//     documenter collection id 14495189-cf70dabc-...), NOT an OpenAPI spec. So the IOIOF extractor's
//     authoritative machine-readable source is the Postman collection, not OpenAPI; T7 OpenAPI
//     validation degrades to Postman-collection contract validation (T12 CommunityFixtures path).
//   - Auth: DUAL-HEADER API KEY — `X-API-KEY` + `X-API-SECRET`, with Organization Code in the URL
//     path (…/api/v3/organization/{ORGANIZATION-CODE}/…). authPattern=api-key.
//   - Base URL: https://api.pheedloop.com/api/v3/ . Object roots are org/event-scoped (bare
//     /attendees 404s; real path nests the org code), which the RealityProbe must account for.
//   - WRITE-CAPABLE / BIDIRECTIONAL: REST API 2.0 documents GET/POST/PATCH/DELETE + webhooks
//     (BINDING capability finding — the connector is NOT pull-only; SupportsWrite must be honest).
//   - Pagination present; incremental signal to be confirmed by extraction (likely updated/created
//     timestamps on attendee/registration records — left provable-only until the collection confirms).
//
// CREDENTIAL POSTURE — STAGED, CREDENTIAL-FREE THIS RUN (operator chose [A], credential arrives later).
//   credentialReference is null this run. The plan converges + floor-check-passes at the credential-free
//   ceiling `format-verified-no-creds`. The RealityProbe DEGRADES to the unauthenticated per-claim status
//   probe (200=public, 401/403=path real+gated [content UNVERIFIED], 404=path wrong). HybridE2E runs in
//   MOCK mode (no broker creds). The LIVE read-only T8 tier is deferred to a later
//   `/test-connector pheedloop --mode live` invocation when the credential lands.
//
// Locked-primitive composition is preserved; only prompts, scope, and credential-keyed branches are
// customized. The bijection floor-check at the end is unchanged.

export const meta = {
    name: 'pheedloop-build',
    description: 'Workshop dynamic-workflow build for PheedLoop (event management). REST v3 over Django REST Framework; docs are a Postman collection (no OpenAPI); dual-header API-key auth (X-API-KEY/X-API-SECRET + org code in path); write-capable/bidirectional. STAGED CREDENTIAL-FREE this run — converges + floor-passes at format-verified-no-creds; live T8 deferred. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0: DB reachable @ migration level, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'PheedLoop canonical identity + full API nature INDEPENDENT of context. WriteCapability finding is BINDING (REST API 2.0 = GET/POST/PATCH/DELETE+webhooks).' },
        { title: 'Identity', detail: 'Integration row identity slots; resolve CredentialTypeID (dual-key X-API-KEY/X-API-SECRET + org code) match-or-create.' },
        { title: 'SourceAudit', detail: 'Rank sources: Postman collection (Tier-1 machine-readable) > dev docs SPA > support articles > Portable/Appy Pie 3rd-party. Enumerate object universe via the Postman collection (SCRIPT, not eyeball).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration (orgScoped path shape, dual auth headers, OutOfScopeObjectFamilies if any).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the v3 object universe from the Postman collection. Honest SupportsWrite per documented verbs.' },
        { title: 'IndependentReview', detail: 'ONE round, slim — coverage-vs-collection / bijection / capability-honesty / naming. LINT.' },
        { title: 'RealityProbe', detail: 'S7 EMPIRICAL, DEGRADED (no credential this run): unauthenticated per-claim status probe of org-scoped paths (401/403=real+gated, 404=wrong) + verb (OPTIONS Allow) + pagination-param tolerance where probeable. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from Postman collection/docs, re-probe to confirm).' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'Connector class extends BaseRESTIntegrationConnector. Dual-header API-key auth via APIKeyHeaderBuilder; org code injected into path. Tests + spec/Postman fixtures (provenance-tagged).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (no-credential ceiling) + Postman-collection contract validation (T7 degrades to Postman) + failure-mode injection. EMPIRICAL where real status codes enter; LINT elsewhere.' },
        { title: 'HybridE2E', detail: 'MOCK mode this run (no broker creds). Real MJ engine → fresh SQL Server via mocked HTTP. Outcome gates: rowcounts, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md. LIVE deferred to /test-connector.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + EMPIRICAL gates. Ceiling format-verified-no-creds is a legitimate pass for this staged run; e2e-mock-dodge is satisfied because credentialReference+brokerPlans are both null. States the EMPIRICAL/LINT split + the deferred-live residual.' },
    ],
};

const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'pheedloop';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// PheedLoop discovered facts the planner pins for the downstream agents (study output → scope signal).
const PHEEDLOOP = {
    baseURL: 'https://api.pheedloop.com/api/v3/',
    orgScopedPathShape: '/api/v3/organization/{ORGANIZATION-CODE}/...',
    apiVersionHeader: 'pheedloop-api-version: v3.7.0 (Django REST Framework backend)',
    authHeaders: ['X-API-KEY', 'X-API-SECRET'],
    orgCodeInPath: true,
    docSource: 'Postman published collection (documenter 14495189-cf70dabc-9537-428c-b7a4-2cd40136fb6d) at https://develop.pheedloop.com/ — NOT OpenAPI',
    writeCapable: true, // GET/POST/PATCH/DELETE + webhooks documented (REST API 2.0). BINDING.
    contextURLs: ['https://develop.pheedloop.com/', 'https://pheedloop.com/'],
};

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    // Credential-free ceiling this run. The no-credential ladder tops out at T8 (FailureModeInjection,
    // requiresCredentials:false). Live read-only round-trip is deferred; e2eTier records the achievable
    // ceiling, not a live proof it didn't earn.
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};

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
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists reported: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN, set resolved=true only when clean. Restore unaccounted generated churn per the runbook first.\n` +
    `Abort-cheap: if ok=false and unresolved, the workflow stops here.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
// INDEPENDENT study of PheedLoop's full nature — the object/capability universe is NOT capped by the
// two context URLs. The planner's study already established: REST v3 (DRF v3.7.0), Postman-collection
// docs, dual-header API key + org code in path, GET/POST/PATCH/DELETE + webhooks (write-capable),
// pagination present. The researcher CONFIRMS + extends this and emits ProductTaxonomy + the BINDING
// WriteCapability finding.
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
        WriteCapability: { type: ['object', 'null'] },
        ObjectFamilies: { type: 'array' },
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (PheedLoop — event management / virtual & hybrid event platform). Resolve canonical name, description, navigation URL, icon class, and ProductTaxonomy.\n` +
    `Establish the FULL API nature INDEPENDENT of the operator context (${PHEEDLOOP.contextURLs.join(', ')}) — context is trusted where it speaks but is NOT exhaustive.\n` +
    `Planner study (CONFIRM + extend, do not merely echo):\n` +
    `  - REST/JSON, base ${PHEEDLOOP.baseURL}, Django REST Framework backend (${PHEEDLOOP.apiVersionHeader}).\n` +
    `  - Docs are a PUBLISHED POSTMAN COLLECTION (${PHEEDLOOP.docSource}). There is NO OpenAPI spec.\n` +
    `  - Auth: dual-header API key ${PHEEDLOOP.authHeaders.join(' + ')} with Organization Code in the URL path (${PHEEDLOOP.orgScopedPathShape}).\n` +
    `  - WRITE-CAPABLE / BIDIRECTIONAL: REST API 2.0 documents GET/POST/PATCH/DELETE + webhooks (primarily attendees & registrations). This WriteCapability finding is BINDING — emit it. The connector is NOT pull-only.\n` +
    `  - ObjectFamilies: enumerate the event-platform object families (attendees, registrations, tags, sessions, speakers, exhibitors, sponsors, booths, tickets, events, badges/check-ins, webhooks, …) you can evidence; this is the awareness universe, scoped later.\n` +
    `Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (PheedLoop). ClassName should be PheedLoopConnector; ImportPath the connectors-registry path. Read SOURCE_STUDY when ready.\n` +
    `CredentialTypeID: match-or-create against the connector ConnectionConfig key shape — PheedLoop needs THREE inputs: X-API-KEY (header), X-API-SECRET (header), and Organization Code (URL path segment, non-secret config). Resolve an existing Credential Type whose key shape matches, or mint one. Do NOT read any credential bytes.`,
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
        PostmanPaths: { type: 'array' },
        VendorDocsPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split.\n` +
    `SOURCE TIERS for PheedLoop (rank accordingly):\n` +
    `  Tier-1 machine-readable: the PUBLISHED POSTMAN COLLECTION at https://develop.pheedloop.com/ (documenter id 14495189-cf70dabc-9537-428c-b7a4-2cd40136fb6d). This is the authoritative object/field/verb enumeration — there is NO OpenAPI spec. DOWNLOAD the rendered collection / documenter JSON to a scratch file and ENUMERATE the object universe with a SCRIPT (never eyeball a doc; the object universe MUST be a script's output, not an agent listing).\n` +
    `  Tier-1 prose: develop.pheedloop.com SPA (JS-rendered — fetch the rendered content), setup.support.pheedloop.com article 1888 (auth keys), the REST API 2.0 announcement blog.\n` +
    `  Tier-3 cross-check ONLY: Portable.io / Appy Pie 3rd-party connector pages (use to widen the object list, never as a hard-constraint source).\n` +
    `Emit TaxonomyLeaves = the leaves of the COVERABLE v3 object taxonomy (the input to extract-iiof-pipeline). Populate PostmanPaths with the downloaded collection file path(s). Record the org-scoped path shape (${PHEEDLOOP.orgScopedPathShape}) and dual auth headers in the study.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit).\n` +
    `Configuration MUST encode PheedLoop's idiosyncrasies that have no canonical slot: the org-scoped path shape (${PHEEDLOOP.orgScopedPathShape} — Organization Code is a path segment, supplied per-connection as non-secret config), the dual auth header names (${PHEEDLOOP.authHeaders.join(', ')}), and any OutOfScopeObjectFamilies the study found but the operator did not scope (with a reason). PaginationType MUST be a valid enum value (None|Cursor|Offset|PageNumber) — encode PheedLoop's actual pagination form in Configuration and pick the closest valid enum. Batch limits / rate limits only if explicitly documented (else leave null — provable-only).`,
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

// Extract amendment cap = 1 (loop runs round 0 + at most 1 amendment round, per the planner role's
// token-conscious MAX_AMENDMENT_ROUNDS=1). The deterministic gates (0-field hard-fail, compute-source-diff,
// T1 invariants) catch defects in-pass; a deadlock fingerprint short-circuits early.
const MAX_AMENDMENT_ROUNDS = 1;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

while (amendmentRound <= MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // Slot-routing: integration.* fixes go to metadata-writer (extractor only edits IO/IOF rows).
    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const isIntegrationRowSlot = (f) => String(f?.slot ?? '').toLowerCase().startsWith('integration.');
    const integrationRowFindings = allFindings.filter(isIntegrationRowSlot);
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f));
    if (integrationRowFindings.length > 0) {
        phase(phaseLabel);
        await agent(
            `Apply these Integration-ROW FixInstructions surgically to the Integration row in ${METADATA_FILE} (root-level slots the IO/IOF extractor cannot touch — auth, base URL, pagination, batch limits, watermark, org-scoped Configuration). Change ONLY the named slots; do NOT perturb IO/IOF rows. Fixes: ${JSON.stringify(integrationRowFindings)}. Return { applied }.`,
            { agentType: 'metadata-writer', schema: { type: 'object', required: ['applied'], properties: { applied: { type: 'integer' } }, additionalProperties: true }, phase: phaseLabel, label: `amend-integration-row:r${amendmentRound}` }
        ).catch(() => null);
        log(`Routed ${integrationRowFindings.length} Integration-row fix(es) to metadata-writer (round ${amendmentRound}); ${ioIofFindings.length} IO/IOF fix(es) to the extractor.`);
    }

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
            // PheedLoop machine-readable source is the POSTMAN COLLECTION (no OpenAPI). The extractor
            // must consult the credential-free Postman collection + dev docs; honor honest SupportsWrite
            // per documented GET/POST/PATCH/DELETE verbs (attendees/registrations are write-capable).
            sourceBundle: {
                existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`,
                existingMetadataPaths: [METADATA_FILE].filter(Boolean),
                openapiPath: null, // none — PheedLoop publishes no OpenAPI spec
                postmanPaths: sources.PostmanPaths ?? [],
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted ?? extractStats.extractedObjects?.length ?? 0} objects, ${extractStats.fieldsExtracted ?? 0} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full Postman collection into context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the enumerated object list and read its compact stdout (object/field/zero-field counts). Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility, plus capability-honesty: SupportsWrite must reflect documented GET/POST/PATCH/DELETE (NOT defaulted false for a vendor the study proved write-capable). Any zero-field object, bijection violation, or capability-dishonesty is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small.`,
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
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} amendment round(s) with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound, status: 'EscalatedMaxRounds',
        message: `Amendment loop hit the ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
}

// ── SourceDiff (completeness gate) ───────────────────────────────────
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
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { postmanPaths: sources.PostmanPaths ?? [] }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
    );
    const recovered = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        { vendor: VENDOR, sourceID: sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output`, runID: A?.runID, adversarialN: MANIFEST.adversarialVerifyMinReviewers, sourceBundle: { postmanPaths: sources.PostmanPaths ?? [] } }
    );
    extractStats.extractedObjects = [...(extractStats.extractedObjects ?? []), ...(recovered.extractedObjects ?? [])];
    extractStats.fieldsExtracted = (extractStats.fieldsExtracted ?? 0) + (recovered.fieldsExtracted ?? 0);
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── RealityProbe (S7 — EMPIRICAL, DEGRADED to unauthenticated since no credential this run) ──
// PheedLoop org-scoped path shape means a probe of a bare object root 404s even when the resource is
// real (the planner observed this: /api/v3/attendees → 404, but /api/v3/organization/{ORG}/validateauth/
// → 404 JSON with allow: GET,HEAD,OPTIONS + pheedloop-api-version header). The probe MUST therefore
// probe the org-scoped form with a placeholder org code and read the JSON 404/401/403 signal + the
// `allow` verb header + the pheedloop-api-version header, NOT just hit bare roots. Degraded ceiling is
// format-verified-no-creds; every un-probed claim is named. VERDICTS IN, AUTHORSHIP OUT.
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
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts. NO CREDENTIAL this run → DEGRADED unauthenticated mode.\n` +
    `1. BASE_URL is ${PHEEDLOOP.baseURL} (from the Integration row's NavigationBaseURL / APIPath scheme+host).\n` +
    `2. CRITICAL PheedLoop probe shape: object paths are ORG-SCOPED (${PHEEDLOOP.orgScopedPathShape}); a bare object root (e.g. /api/v3/attendees) 404s even though the resource is REAL. So probe the org-scoped form with a placeholder org code and read: the JSON status (401/403=path real+auth-gated → gated-exists; 404 on the org-scoped form=path wrong), the \`allow:\` response header (verb truth vs declared Create/Update/Delete methods), and the \`pheedloop-api-version\` header (confirms the live v3 surface).\n` +
    `3. Run EXACTLY (do not edit output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url ${PHEEDLOOP.baseURL} --org-scoped --out ${PROBE_OUT}\n` +
    `   (NO credential → the script runs the degraded unauthenticated status probe.)\n` +
    `4. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM. Set mode='unauthenticated', achievedCeiling='format-verified-no-creds', metadataDelta=false. You may NOT add objects/fields/paths to the metadata, and you may NOT alter the script's verdicts. Name every claim left UNVERIFIED for lack of a credential.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE mandatory round when the probe falsifies a declared claim) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the POSTMAN COLLECTION / dev docs (re-read the cited source; pick the docs-supported alternative the probe confirmed — corrected org-scoped path, corrected verb per the \`allow:\` header, corrected pagination param form). Then RE-PROBE just the corrected claims (read-only, org-scoped) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 2 rounds: round 0 build + 1 fix) ──
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
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Extend BaseRESTIntegrationConnector; use the generic per-operation CRUD column path; override only when genuinely idiosyncratic.`
            : `Build the connector class for ${brand.CanonicalName} (PheedLoop) from the frozen contract at ${frozen.contractPath}.\n` +
              `PHEEDLOOP CODE SHAPE:\n` +
              `  - Extend BaseRESTIntegrationConnector. @RegisterClass(BaseIntegrationConnector, 'PheedLoopConnector'). IntegrationName getter returns the exact MJ: Integrations.Name.\n` +
              `  - Auth: dual-header API key. Build headers ${PHEEDLOOP.authHeaders.join(' + ')} via @memberjunction/integration-engine/auth-helpers (APIKeyHeaderBuilder — NEVER inline). The Organization Code is NON-secret per-connection config read from companyIntegration.Configuration and injected into the path (${PHEEDLOOP.orgScopedPathShape}), NOT a header.\n` +
              `  - Base URL ${PHEEDLOOP.baseURL}; org-scoped path templating handled in GetBaseURL/MakeHTTPRequest.\n` +
              `  - Write paths: PheedLoop is write-capable (GET/POST/PATCH/DELETE) — wire SupportsCreate/Update/Delete through the generic per-operation column path for the IOs the contract marks write-capable; UpdateMethod=PATCH per the documented verbs; never return 501 from a true-capability method.\n` +
              `  - Full-record pass-through (Fields: raw). Bounded typing from any field lengths the collection states.\n` +
              `  - Tests + fixtures from the Postman collection / documented examples (provenance-tagged, PII-scrubbed). No live calls in vitest.`,
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
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already export ${identity.Identity.ClassName}, append:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf already present, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${identity.Identity.ClassName}.ts" ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null, // null this run — ladder runs the no-credential rungs to T8
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
        message: `Code+Ladder loop hit the ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (MOCK this run — no broker creds; live deferred to /test-connector) ──
// Mock mode is the credential-free floor: real MJ engine → fresh SQL Server, HTTP boundary served by a
// spec/Postman-derived mock. Proves ApplyAll → upsert → contentHash → incremental → idempotency without
// the real vendor. mode is keyed on creds: credentialReference is null AND no brokerPlans this run → mock.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
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
            credentialReference: A?.credentialReference ?? null, // null → mock e2e is honest (no e2e-mock-dodge)
            brokerPlans: A?.brokerPlans ?? null,
            brand,
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
            // STAGED credential-free posture: the achievable ceiling is format-verified-no-creds.
            // Live read-only T8 is intentionally deferred to /test-connector pheedloop --mode live.
            credentialPosture: 'staged-credential-free',
            achievedCeiling: realityProbe?.achievedCeiling ?? 'format-verified-no-creds',
            liveDeferred: true,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult, extractStats, frozen, review,
    amendmentRound, codeResult, codeRound, ladder, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
