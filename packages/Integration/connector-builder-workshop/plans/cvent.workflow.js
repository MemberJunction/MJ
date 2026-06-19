// PER-VENDOR WORKFLOW — Cvent connector build (credential-free run; ceiling format-verified-no-creds)
//
// Emitted by the ConnectorCreator planner from _TEMPLATE.workflow.js + spec-digest + the user-provided
// CVENTContext.md. Cvent is a rich BIDIRECTIONAL REST event-management platform (Platform REST API at
// https://api-platform.cvent.com, OAuth2 client_credentials at /ea/oauth2/token). The provided context
// is Tier-1 for the facts it states (auth model, token URL, REST base, the object families it sketches)
// but is NON-EXHAUSTIVE of the system — so this plan commissions an INDEPENDENT study of Cvent's real
// API surface and lets a SCRIPT enumerate the object/field universe from the OpenAPI / API Reference,
// never an agent listing objects in context (memory: object_catalog_must_be_script_output).
//
// RUN MODE: [B] credential-free. credentialReference=null at execution → no live/write/ack tier; the
// RealityProbe DEGRADES to the unauthenticated per-claim status probe (401/403=path real+gated, 404=
// path wrong); HybridE2E runs MOCK. Report ceiling = format-verified-no-creds, every un-probed claim
// enumerated by name.
//
// LOCKED-PRIMITIVE composition is preserved verbatim from the template; only meta, agent prompts, the
// maxTier, and the adversarial/loop parameters are customized.

export const meta = {
    name: 'cvent-build',
    description: 'Workshop dynamic-workflow build for Cvent (Platform REST API, OAuth2 client_credentials, bidirectional event-management). Credential-free ceiling: format-verified-no-creds. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Cvent identity AND full Platform REST API nature INDEPENDENTLY of CVENTContext.md (object families, OAuth2 model, read/write/bidirectional capability, pagination shape, rate limits, what ELSE the system exposes — webhooks/SOAP/CSN/RegLink). Context is non-exhaustive; the study determines the universe. WriteCapability + custom-field findings are BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (CventConnector, OAuth2 client_credentials → match-or-create CredentialTypeID).' },
        { title: 'SourceAudit', detail: 'Audit + rank Cvent sources; acquire the OpenAPI/API-Reference; build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split + scope decision (Platform REST event-data slice in-scope; SOAP/CSN/RegLink/Webhooks recorded out-of-scope-with-reason).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (token URL, base URL, OutOfScopeObjectFamilies + reasons).' },
        { title: 'IOIOFExtract', detail: 'SCRIPT-driven per-object extract-iiof-pipeline over the OpenAPI spec (verify + write-back). NO agent-listed catalog. Provable-only from the machine-readable model.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment), refocused charter (coverage-vs-script / bijection / capability-honesty / naming). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): read-only VERDICTS on declared claims — paths, pagination-advances, PK populated/null, watermark accepted, write-surface existence, rate headers. DEGRADED unauthenticated status-probe here (no credential). NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'CventConnector extends BaseRESTIntegrationConnector; OAuth2 via auth-helpers OAuth2TokenManager (NEVER inline crypto) + tests. Fixtures descend from reality (probe captures or vendor-published) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T12 non-live suite (OpenAPI/contract validation, mock-server-from-spec, Postman replay, endpoint/header probing, bijective completeness) + two-pass volatile-field idempotency rung (v2 P3). No live tier.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e through real MJ engine → real SQL Server, FRESH DB, MOCK mode (no credential). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + format-verified-no-creds ceiling with un-probed claims named.' },
    ],
};

// Normalize args (the model→Workflow-tool path can deliver a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'cvent';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Credential-free run: ceiling is format-verified-no-creds. The non-live suite still runs to its full
// applicable extent (T0..T12); only the live tier is unreachable. e2eTier records the live ceiling.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'format-verified-no-creds',
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
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --gql-url <the MJAPI url if one is expected> --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe — SQL Server is the per-connector target; Postgres is SUSPENDED); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch — INDEPENDENT study, NOT capped by CVENTContext.md ──
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
        WriteCapability: { type: 'object' },     // BINDING (v2 P5): documented create/update/delete surfaces
        AuthModel: { type: 'object' },
        PaginationShape: { type: ['object', 'null'] },
        RateLimits: { type: ['object', 'null'] },
        WhatElseExposed: { type: 'array' },      // SOAP, CSN, RegLink, Webhooks, SDKs — awareness, scope decided later
        ScopeReason: { type: ['string', 'null'] },
        ResidualDoubts: { type: 'array' },
    },
};
const brand = await agent(
    `Research vendor "Cvent" — resolve canonical identity AND characterize the FULL Cvent Platform REST API nature, INDEPENDENTLY of the provided CVENTContext.md (which is Tier-1 for the facts it states but NON-EXHAUSTIVE of the system).\n` +
    `Establish from public discovery (developer.cvent.com / the Platform REST API overview + reference + standards + concepts docs): the real object families (events, contacts, invitees/attendees, registrations, sessions, speakers, attendee activities, meeting requests, custom fields, AND whatever else the reference exposes), the OAuth2 model (client_credentials per the docs — confirm), READ and WRITE/bidirectional capability (Cvent is a rich bidirectional product — set WriteCapability with documented create/update/delete surfaces; this is BINDING for the capability-honesty floor), the pagination shape (token/cursor per the docs — confirm the real param/field names), and documented rate limits.\n` +
    `Record in WhatElseExposed the surfaces the study finds but the operator's slice does NOT target: Webhooks, the legacy SOAP API, CSN/Supplier Network REST, RegLink/SSO/Identity. These are awareness, not built.\n` +
    `DETECT TENSION: where CVENTContext.md and your independent study disagree, flag it; context is trusted-where-it-speaks only while independent evidence doesn't contradict it. Emit a short ResidualDoubts note ("is this suspiciously thin? what else might the reference expose?"). Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". ClassName = CventConnector; IntegrationName = the exact MJ "MJ: Integrations".Name string; ImportPath per convention; extend BaseRESTIntegrationConnector (REST/JSON). Resolve CredentialTypeID via match-or-create against the OAuth2 client_credentials ConnectionConfig key shape (client_id + client_secret + token URL https://api-platform.cvent.com/ea/oauth2/token + scopes) — see identity-establisher §"Credential type: match-or-create". Read SOURCE_STUDY when ready. Use the universalPK Configuration hint only when authoritatively documented.`,
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
        EnumerationStdoutCount: { type: ['integer', 'null'] },  // scope-sanity: enumerated universe size
        OpenAPIPath: { type: ['string', 'null'] },
        PostmanPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
        VendorDocsPaths: { type: 'array' },
        OutOfScopeFamilies: { type: 'array' },
        scopeDecision: { type: ['object', 'null'] },
        Gaps: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. ACQUIRE the Cvent Platform REST API machine-readable contract (OpenAPI/Swagger if published — Cvent's migration/benefits docs mention OpenAPI; else the REST API Reference) and save it to disk; record OpenAPIPath/PostmanPaths/SDKPaths/VendorDocsPaths.\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. The object catalog MUST be the OUTPUT OF A SCRIPT over the acquired spec — enumerate the COVERABLE leaves (the Platform REST event-data object set) programmatically; report EnumerationStdoutCount (the enumerated universe size). NEVER eyeball-list objects in context.\n` +
    `SCOPE DECISION: the in-scope subset is the Platform REST API event-data slice (the families brand.ObjectFamilies found that are reachable via the REST reference). Record SOAP / CSN-Supplier-Network / RegLink-SSO / Webhooks as OutOfScopeFamilies with reasons (scopeDecision) — they belong in Integration.Configuration.OutOfScopeObjectFamilies, documented so a future build can expand without re-discovering. A TaxonomyLeaves count that is much SMALLER than EnumerationStdoutCount is the under-enumeration bug, not a pass.\n` +
    `Emit TaxonomyLeaves = the COVERABLE leaves as input to extract-iiof-pipeline.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER direct Edit/Write). Configuration JSON MUST include: tokenURL=https://api-platform.cvent.com/ea/oauth2/token, base REST host=https://api-platform.cvent.com, grant=client_credentials, and OutOfScopeObjectFamilies=${JSON.stringify(sources.OutOfScopeFamilies ?? [])} with their reasons. Set BatchMaxRequestCount/BatchRequestWaitTime + NavigationBaseURL ONLY from documented rate-limit/UI sources (provable-only — leave unset otherwise).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, max 1 round per token-conscious cap) ──
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

// Per the template mandate: round 0 + TWO real amendment rounds. The deadlock fingerprint check
// below short-circuits earlier when the producer genuinely can't fix; mechanical gates (0-field
// hard-fail, compute-source-diff, T1 invariants) catch most defects in-pass.
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
            objectList: sources.TaxonomyLeaves,
            outOfScopeFamilies: sources.OutOfScopeFamilies ?? [],
            scopeReason: (brand.ScopeReason ?? 'Platform REST event-data slice is the useful/reachable surface for MJ event-data sync; SOAP/CSN/RegLink/Webhooks are out-of-scope-with-reason'),
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs — CREDENTIAL-FREE sources ONLY (never the connector
            // being built, never prior metadata as a source, never live data).
            sourceBundle: {
                openapiPath: sources.OpenAPIPath ?? sources.SourcesFile,
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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full OpenAPI/reference into your context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the spec and read its compact stdout (object/field/zero-field counts) — never parse the spec in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the spec) for bijection + plausibility + capability-honesty (Cvent is bidirectional — assert write-capable IOs carry their per-operation CRUD columns). Any zero-field object, bijection violation, or capability/method mismatch is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
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
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Evidence: ${review.ReviewFile} — human intervention required.`,
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
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { openapiPath: sources.OpenAPIPath ?? sources.SourcesFile }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL; DEGRADED unauthenticated for this credential-free run) ──
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
        unverifiedClaims: { type: 'array' },   // named un-probed claims for the no-creds honesty report
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts. This is a CREDENTIAL-FREE run, so the probe DEGRADES to the unauthenticated per-claim status probe.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (NavigationBaseURL, or scheme+host of an APIPath — expect https://api-platform.cvent.com).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED], 404=wrong path; plus param probing where tolerated to check pagination/watermark param forms).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. Populate unverifiedClaims with every declared claim the unauthenticated probe could NOT confirm (PK populated/null, write-surface behavior, real pagination advance, watermark acceptance) — named, for the honesty report. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ${(realityProbe.unverifiedClaims ?? []).length} unverified-named`);

// ── ProbeAmend (S8 — ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe (a 404 means the declared path is wrong; a wrong-verb signal means the method is wrong):\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Cvent reference; pick the docs-supported alternative the probe confirmed, e.g. the corrected path/host, the corrected verb). Then RE-PROBE just the corrected claims (read-only, unauthenticated status) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 2 rounds = round 0 + one amend) ──
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
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. CventConnector extends BaseRESTIntegrationConnector; OAuth2 client_credentials via auth-helpers OAuth2TokenManager (NEVER inline crypto). Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the connector class CventConnector for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector; register @RegisterClass(BaseIntegrationConnector,'CventConnector'). OAuth2 client_credentials via auth-helpers OAuth2TokenManager (token URL from Configuration; NEVER inline crypto; never log client_secret). Implement Authenticate/BuildHeaders/TestConnection/NormalizeResponse/ExtractPaginationInfo per the documented Cvent token-paging shape. Use generic per-operation CRUD; override only when genuinely idiosyncratic. Write vitest tests against scrubbed fixtures (provenance-tagged).`,
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
            credentialReference: A?.credentialReference ?? null,  // null this run → no live tier
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
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, FRESH DB) ──
// REQUIRED on every build (NEVER omitted). Runs on SQL Server (Postgres SUSPENDED for the per-connector
// loop). Credential-free run → MOCK mode (the mock floor is credential-free). Env per the runbook; the
// only assumption is the Docker daemon is up.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // No credentialReference + no brokerPlans this run → mock. (e2e-mock-dodge gate is satisfied
        // because there are genuinely no creds; a build with broker creds would be forced live.)
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
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.OutOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult,
    extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder, realityProbe, hybridE2E,
    verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
