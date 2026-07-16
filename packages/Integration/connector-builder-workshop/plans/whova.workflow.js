// whova.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Whova (https://whova.com) — Events / conference management platform.
// Mode: NEW (v1.0.0 birth; no prior metadata file / DB row / connector .ts).
// Credential: NONE ([B] credential-free run). RealityProbe DEGRADES to the unauthenticated
//   per-claim status probe; HybridE2E runs in MOCK mode; maxTier records the ceiling only (T8).
//
// WHY THE VENDOR-SPECIFIC SHAPE:
//   Whova is an events platform with a REST/JSON API (API Tracker reports an OpenAPI/Swagger spec +
//   Postman/Insomnia collections). Its PUBLIC developer surface is thin/partner-gated — but sparse
//   docs are NOT evidence of a thin system (§0b Complete). The BrandResearch + SourceAudit stages
//   MUST independently establish the real object/capability universe (attendees, sessions/agenda,
//   speakers, exhibitors/sponsors, registration, surveys, check-ins) from public sources and record
//   any known-but-out-of-scope families in Integration.Configuration.OutOfScopeObjectFamilies with
//   reasons — never silently drop them because the docs page didn't enumerate them.
//
// RISK-CALIBRATED KNOBS (vs template defaults):
//   - adversarialN = 3   → docs-only / partner-gated source (Tier-3 risk) + no live RealityProbe
//     confirmation possible (credential-free) ⇒ correctness earns MORE scrutiny (system prompt
//     "adversarial-verify N" ladder: risk signal present → N=3, via diverse lenses over the slim
//     count-reconcile + sample, never N copies of the SDL).
//   - loopUntilDry K = 3 → thin public doc coverage is very likely < 0.7 (system prompt K rule).
//   - maxTier = T8       → credential-free ceiling; T0..T8 all run (StaticValidation..FailureModeInjection).
//     The NON-LIVE suite runs to full extent regardless; maxTier gates only the live rungs (none here).
//
// LOCKED-PRIMITIVE COMPOSITION, freeze-contract gate, bijection floor-check, and the different-model
// (sonnet) adversarial review are PRESERVED verbatim from _TEMPLATE.workflow.js. Both amendment loops
// (extract MAX_AMENDMENT_ROUNDS, code+ladder MAX_CODE_BUILD_ROUNDS) are implemented exactly as the
// template — never a single-return-on-first-gap.

export const meta = {
    name: 'whova-build',
    description: 'Workshop dynamic-workflow build for Whova (Events platform, REST/JSON, API-key auth). NEW v1.0.0, credential-free [B] run. Locked primitives + bijection floor-check. Independent capability discovery — sparse public docs are not evidence of a thin system.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Whova brand + ProductTaxonomy. Establish the REAL object/capability universe (attendees/sessions/speakers/exhibitors/registration/surveys/check-ins) INDEPENDENT of the thin public docs. WriteCapability + custom-field findings are BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (WhovaConnector). Credential type match-or-create against the API-key ConnectionConfig shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources (OpenAPI/Swagger + Postman if reachable > docs > FAQ/help). Build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split. Record out-of-scope families with reasons.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (API-key auth, base URL, pagination, rate limits, OutOfScopeObjectFamilies).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). Provable-only PK/FK/type/watermark; unprovable → unset. Full-record pass-through.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment iteration), refocused charter (coverage-vs-script / bijection / capability-honesty / naming). Different model (sonnet). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probe (no credential) — 401/403=path real+gated, 404=path wrong, param-advance where tolerated. Ceiling format-verified-no-creds. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'WhovaConnector class + tests over BaseRESTIntegrationConnector (REST/JSON). Generic per-operation CRUD; override only when idiosyncratic. Fixtures descend from reality (probe captures / vendor-published) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: schema/contract validation, mock-server-from-spec, endpoint/header probing, bijective completeness.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB. Full object coverage in mock (no Goldilocks subset). Outcome gates: rowcounts, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling.' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under Category=Events: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/brokerPlans/maxTier silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'whova';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Resilient handoff (v2): a transport blip on an agent() handoff must NOT discard a hard-won result or
// abort a long build. A real stage failure (schema-invalid, build error) is returned by the agent and
// routes to the amendment loop — it is NOT a transport error and is NOT retried here.
async function withRetry(thunk, label, tries = 3) {
    let lastErr;
    for (let i = 1; i <= tries; i++) {
        try { return await thunk(); }
        catch (e) {
            lastErr = e;
            const msg = String(e?.message ?? e);
            const transient = /ECONN|ETIMEDOUT|socket hang up|network|fetch failed|429|502|503|504|overloaded|rate.?limit/i.test(msg);
            if (!transient || i === tries) throw e;
            log(`withRetry[${label}] transport blip (attempt ${i}/${tries}): ${msg.slice(0, 160)} — backing off`);
            await Promise.resolve();
        }
    }
    throw lastErr;
}

// MANIFEST — the minimumThoroughnessManifest floor-check verifies.
// adversarialVerifyMinReviewers = 3 (docs-only/partner-gated + no live confirmation ⇒ risk signal).
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 3,
};
// loop-until-dry K for the extract pipeline — 3 because Whova's public doc coverage is very likely < 0.7.
const LOOP_UNTIL_DRY_K = 3;

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
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --allow-generated-churn --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13). Return its JSON verbatim into this schema.\n` +
    `   NOTE: --allow-generated-churn is INTENTIONAL for this run — the branch (agentic/connector-builder-v2) carries pre-existing ADDITIVE generated-tree drift from concurrent WildApricot/connector work. The build runs on FULLY ISOLATED infra (its own SQL container sql-whova:1455 / DB MJ_WHOVA_E2E / MJAPI :4017) and HybridE2E snapshots+restores the generated tree around its in-place codegen, so the shared tree is never consumed or clobbered. The waiver RECORDS the churn (generatedChurnWaived=true + generatedChurn[]) rather than failing on it. Do NOT git-restore or otherwise mutate the shared generated tree.\n` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. Do NOT attempt to restore generated churn — it is waived above.\n` +
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
        Category: { type: ['string', 'null'] },   // expect 'Events'
        Disambiguation: { type: 'array' },
        Sources: { type: 'array', items: { type: 'string' } },
        ProductTaxonomy: { type: 'object' },
        ObjectFamilies: { type: 'array', items: { type: 'string' } },  // the FULL discovered surface (awareness)
        WriteCapability: { type: ['object', 'null'] },                  // BINDING (v2 P5): documented create/update/delete?
        CustomFieldFindings: { type: ['object', 'null'] },
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (Whova, https://whova.com) — an EVENTS / conference management platform. Resolve canonical name, description, navigation URL, icon class, ProductTaxonomy, and Open App Category (expect 'Events'; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `CRITICAL — establish the REAL API NATURE independently of the thin public docs (§0b: absence in the docs is NOT evidence of absence in the system):\n` +
    `  • Object families the system exposes — attendees, sessions/agenda, speakers, exhibitors/sponsors, registration/tickets, surveys/polls, check-ins, messages/community. Emit ALL discovered into ObjectFamilies (awareness), even ones likely out of scope.\n` +
    `  • Auth model — API key vs OAuth vs partner token; what the credential shape is.\n` +
    `  • WriteCapability (BINDING per v2 P5): does the API document create/update/delete, or is it read/export-only? A wrong pull-only-for-a-bidirectional-vendor claim is the GZ #30 defect. If the public API is read/export-only, SAY SO with evidence; do not assume writes.\n` +
    `  • Pagination, rate limits, incremental signal, "what else the system exposes" (Zapier surface, report exports).\n` +
    `Note the partner-gated nature honestly: the credential-free build reaches only what public docs prove. Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol WhovaConnector, ImportPath/ClassName = WhovaConnector in the MJ sandbox). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's API-key ConnectionConfig key shape (identity-establisher §"Credential type: match-or-create"). Use the universalPK Configuration hint only when authoritatively documented — do NOT assume 'id' is the PK without a doc marker.`,
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
        VendorDocsPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
        PostmanPaths: { type: 'array' },
        scopeDecision: { type: ['object', 'null'] },
        outOfScopeFamilies: { type: ['array', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: OpenAPI/Swagger spec (API Tracker indicates one exists) → published Postman/Insomnia collection → official developer docs → FAQ/help-center prose. Fetch the OpenAPI spec / Postman collection if reachable and save it (it is the highest-value credential-free artifact — it drives the mock-server tier T5 + bijective completeness).\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the COVERABLE taxonomies (the in-scope object set the credential-free docs actually prove). Record known-but-out-of-scope families (from brand.ObjectFamilies = ${JSON.stringify(brand.ObjectFamilies ?? [])}) in outOfScopeFamilies WITH REASONS — these get written to Integration.Configuration.OutOfScopeObjectFamilies so nobody is blind to them. Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read). Populate VendorDocsPaths/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

// audit-source primitive re-ranks via the rubric.
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL, BatchMaxRequestCount/BatchRequestWaitTime (from documented rate limits — provable-only; leave null if undocumented), and Configuration keys for auth shape + pagination. Write the out-of-scope families from SourceAudit into Configuration.OutOfScopeObjectFamilies with their reasons (${JSON.stringify(sources.outOfScopeFamilies ?? [])}). PaginationType must be a valid enum {None,Cursor,Offset,PageNumber}; encode any custom pagination shape in Configuration.`,
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
let deferredConnectorFindings = [];

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // Slot-routing: integration.* → metadata-writer; connector.* → defer to CodeBuild; io/iof.* → extractor.
    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const slotOf = (f) => String(f?.slot ?? '').toLowerCase();
    const isIntegrationRowSlot = (f) => slotOf(f).startsWith('integration.');
    const isConnectorSlot = (f) => slotOf(f).startsWith('connector.');
    const integrationRowFindings = allFindings.filter(isIntegrationRowSlot);
    const connectorFindings = allFindings.filter(isConnectorSlot);
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f) && !isConnectorSlot(f));
    if (connectorFindings.length > 0) {
        for (const cf of connectorFindings) {
            if (!deferredConnectorFindings.some((d) => (d?.slot ?? '') === (cf?.slot ?? ''))) deferredConnectorFindings.push(cf);
        }
        log(`Deferred ${connectorFindings.length} connector.* (code) fix(es) to CodeBuild (round ${amendmentRound}); the extractor cannot fix code gaps.`);
    }
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
            outOfScopeFamilies: sources.outOfScopeFamilies ?? brand.ObjectFamilies ?? [],
            scopeReason: brand.ScopeReason ?? 'credential-free public docs prove only the in-scope subset; broader families recorded as out-of-scope with reason',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            loopUntilDryK: LOOP_UNTIL_DRY_K,
            sourceBundle: {
                // NEW build — no existing connector .ts / prior metadata to read (and reading OUTPUT is forbidden).
                existingConnectorTsPath: null,
                existingMetadataPaths: [],
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

    // ── Independent review (different model: sonnet) ───────────────────
    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/SDL into your context. Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility.\n` +
        `Whova-specific scrutiny (docs-only source, N=3 lenses): (1) CAPABILITY HONESTY — is SupportsWrite emitted only where the docs actually document a create/update/delete? A read/export-only Events API wrongly marked write-capable is the GZ #30 defect. (2) SCOPE — are the out-of-scope families recorded in Configuration.OutOfScopeObjectFamilies rather than silently dropped, and is the in-scope object count consistent with the enumerated universe (not a famous-only subset)? (3) FK/PK — no FK on a nested access-path/embedded object (path-LMS defect), no PK guessed on an unmarked 'id'.\n` +
        `Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        break;
    }

    const blockingFixes = review.FixInstructions ?? [];
    if (blockingFixes.length > 0 && blockingFixes.every(isConnectorSlot)) {
        log(`Amendment loop: all ${review.ConfirmedGapsBlocking} blocking gap(s) are connector.* (code) → deferring ${deferredConnectorFindings.length} to CodeBuild, exiting extract loop`);
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
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, or the scheme+host of an APIPath).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED unauthenticated status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED], 404=wrong path; plus param-advance probing where the endpoint tolerates unauthenticated params). Achieved ceiling is format-verified-no-creds.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Every un-probed claim must be named as unverified — never a blanket green.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (ONE round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed — e.g. a 404 path corrected to the documented one, a demoted null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates. NOTE: a keyless 401/403 (gated-exists) is NOT a falsification — it confirms the path is real and auth-gated; only a 404/405 (wrong path/verb) is a correctable falsification.`,
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
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the WhovaConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector (REST/JSON over HTTP). @RegisterClass(BaseIntegrationConnector, 'WhovaConnector'). Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic. Full-record pass-through (Fields: raw). Set DiscoveryIsAuthoritative false unless the docs prove a complete-gamut list/describe endpoint. If the API is read/export-only per BrandResearch WriteCapability, keep all SupportsCreate/Update/Delete false — never wire a CRUD method whose capability is false.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ), `code:r${codeRound}`);
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

    // Register the connector export in connectors/src/index.ts (idempotent).
    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append the line:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // Stage artifacts into the registry dir where mj-test-runner looks (idempotent symlinks).
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, MOCK mode for credential-free run) ──
// REQUIRED on every build. Runs on SQL Server (DB_PLATFORM=sqlserver); PG is SUSPENDED for the
// per-connector loop. No credential → mock mode; MOCK = FULL object coverage (no Goldilocks subset).
//
// 🔒 ISOLATED INFRA (collision-avoidance): a concurrent session on this branch owns the workbench
// default coords (DB MJ_SS_E2E, container sql-claude:1444, MJAPI :4007). This run uses a DEDICATED,
// separately-provisioned SQL container + DB + MJAPI port so it can never DROP/kill/mutate the other
// session's infra. The hybrid-e2e primitive's ISOLATION_OVERRIDE banner reads dbProfile+mjapi and
// forbids the agent from touching the workbench coords.
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
        // Dedicated infra — NEVER the shared workbench MJ_SS_E2E/:4007/sql-claude.
        dbProfile: A?.dbProfile ?? { name: 'MJ_WHOVA_E2E', host: 'localhost', port: 1455, user: 'sa', container: 'sql-whova' },
        mjapi: A?.mjapi ?? { graphqlPort: 4017 },
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── Compute writeCapableIOCount (arm the capability-dishonest floor gate — GZ #30 defense) ──
// floor-check's capability-dishonest rule only fires when journal.writeCapableIOCount === 0, so it
// MUST be a real integer or the gate (this plan's top-flagged Whova risk: pull-only connector shipped
// for a write-capable vendor) is structurally dead. extract-iiof-pipeline's return object supplies no
// such field, so derive it DETERMINISTICALLY from the PERSISTED metadata file (source of truth — NOT
// the extractor's self-report) and assign it onto the SAME `extractStats` object the FloorCheck journal
// reads, BEFORE that phase runs.
const writeCapCheck = await agent(
    `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
    `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
    `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY (do NOT infer from anything else). An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout.`,
    { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: 'compute-write-capable-count' }
);
// Assign onto the exact object the FloorCheck journal spreads (extractStats) — this is what the gate reads.
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
// writeScopeDecision — the write-scope justification the capability gate reads alongside the count.
// Prefer the extractor's own decision; fall back to the SourceAudit scope + BrandResearch WriteCapability.
// Null is correct for a genuinely read-only vendor (0 write-capable IOs).
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate)`);

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
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

// ── OpenAppPublish (v2 — assemble the verified connector into the Integrations repo as an Open App) ──
let publish = null;
if (PUBLISH_OPEN_APP && verdict?.pass) {
    phase('OpenAppPublish');
    const CLASS_BASE = String(identity?.Identity?.ClassName ?? '').replace(/Connector$/, '');
    const CATEGORY = A?.category ?? brand?.Category ?? null;
    const CONNECTOR_TS = codeResult?.ConnectorFile ?? `packages/Integration/connectors/src/${identity?.Identity?.ClassName}.ts`;
    const PUBLISH_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, package: { type: 'string' }, appDir: { type: 'string' }, steps: { type: 'array' } } };
    if (!CATEGORY || !CLASS_BASE) {
        log(`OpenAppPublish: missing ${!CATEGORY ? 'Category (brand.Category/args.category)' : 'ClassName'} — cannot place the Open App; skipping publish (sandbox build is still verified).`);
        publish = { ok: false, skipped: true, reason: !CATEGORY ? 'no-category' : 'no-classname' };
    } else {
        publish = await agent(
            `Publish the verified ${brand.CanonicalName} connector as an Open App. Run EXACTLY this and return its JSON stdout VERBATIM:\n` +
            `  node packages/Integration/connector-builder-workshop/scripts/publish-open-app.mjs --repo ${INTEGRATIONS_REPO} --category ${CATEGORY} --class-base ${CLASS_BASE} --connector ${CONNECTOR_TS} --metadata ${METADATA_FILE} --display ${JSON.stringify(brand.CanonicalName)}\n` +
            `ok=true means the Open App PASSED validate-invariants (the four-way identity + Open App shape gate). A failed 'seed' step (no reachable DB) is acceptable and NON-blocking — surface it but do not fail on it; every other step must be ok.`,
            { schema: PUBLISH_SCHEMA, phase: 'OpenAppPublish', label: 'publish:open-app' }
        );
        log(`OpenAppPublish: ok=${publish.ok} package=${publish.package ?? '?'} appDir=${publish.appDir ?? '?'}`);
    }
}

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
    publish,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
