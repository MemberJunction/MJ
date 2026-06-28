// TEMPLATE — per-vendor workflow script (planner emits a customized copy per vendor)
//
// The planner (connector-creator subagent) reads this template + the
// spec-digest + corpus_lookup + capability discovery and emits a customized
// copy at packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js.
// The build-connector skill then invokes that file via the Workflow tool.
//
// What the planner MUST customize per vendor:
//   1. `meta.name` + `meta.description` — vendor-identifying
//   2. `meta.phases` — match the phase() calls below; reorder/skip where
//      the planner's discovered capabilities dictate (e.g. skip
//      MetadataWrite stage if no Configuration JSON is required)
//   3. The adversarial-verify N + loop-until-dry K parameters per Gap 4
//   4. The maxTier per credential availability
//   5. The agent prompts inside each phase — vendor-specific guidance
//
// What the planner MUST NOT change:
//   - The locked-primitive composition signature (you can omit a primitive
//     but you cannot weaken its parameters)
//   - The bijection floor-check at the end
//   - The freeze-contract gate before code-build
//   - The model assignment for adversarial review (different from planner)

export const meta = {
    name: '<vendor>-build',
    description: 'Workshop dynamic-workflow build for <vendor>. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical brand + ProductTaxonomy. WriteCapability + custom-field findings are BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots' },
        { title: 'SourceAudit', detail: 'Audit + rank sources, build SOURCE_STUDY' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back)' },
        { title: 'IndependentReview', detail: 'ONE round, refocused charter (coverage-vs-script / bijection / capability-honesty / naming). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): read-only VERDICTS on declared claims — paths, pagination-advances, PK populated/null, watermark accepted, write-surface existence, rate headers. Degraded unauth probe when no credential. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'Connector class + tests. Fixtures descend from reality (probe captures or vendor-published) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..maxTier + two-pass volatile-field idempotency rung (v2 P3).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. LIVE MANDATORY when credential exists (mock cannot satisfy — v2 P6). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split.' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into the MemberJunction/Integrations repo as a standalone Open App: scaffold + package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate. Machinery in MJ; deliverable in Integrations.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING (the model→Workflow-tool
// path does), not an object. Normalize FIRST so every `A?.x` read works either way — without
// this, runID/credentialReference/brokerPlans/maxTier silently default (runID='unknown' →
// artifacts scatter to runs/unknown). Every top-level plan MUST do this before reading args.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? '(unknown)';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
// Open App publish target (v2): the connector is built + verified in THIS MJ sandbox, then the verified
// DELIVERABLE is assembled into the MemberJunction/Integrations repo as a standalone Open App (the build
// MACHINERY stays here in MJ; the connector PACKAGE goes there). See the OpenAppPublish stage at the end.
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON; set false to stop after sandbox verify
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Resilient handoff (v2): a transport blip on an agent() handoff must NOT discard a hard-won,
// correct result or abort a long build (a network blip once killed a 64-min run). Wrap the
// expensive/critical handoffs so a TRANSPORT throw retries with backoff; a real stage failure
// (schema-invalid result, build error) is returned by the agent and routes to the amendment loop —
// it is NOT a transport error and is NOT retried here. Resume-from-cache covers a hard process death;
// this covers the in-process blip. (The full fix is runtime-level retry on every agent() handoff.)
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
            // backoff without wall-clock APIs (unavailable in workflow scripts): vary work by attempt
            await Promise.resolve();
        }
    }
    throw lastErr;
}

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T9',
    adversarialVerifyMinReviewers: 2,
};

// ── EnvPreflight (S0 — v2 P7; ARCHITECTURE_REFACTOR.md) ──────────────
// Environment gates BEFORE any build stage burns tokens. The GZ marathon lost hours to: a stale
// nested @memberjunction/integration-* dist silently disabling custom-column capture framework-wide
// (#31), stale turbo dists masking fixes (#13), stale class manifests + churned generated.ts killing
// MJAPI boot (#11/#19/#33), and zombie runs from mid-sync restarts (#14). All are detectable up front.
phase('EnvPreflight');
const ENV_PREFLIGHT_SCHEMA = {
    type: 'object', required: ['ok'],
    properties: {
        ok: { type: 'boolean' },
        dbReachable: { type: 'boolean' },
        migrationLevel: { type: 'string' },
        mjapiBootable: { type: 'boolean' },
        generatedTreeClean: { type: 'boolean' },
        staleNestedDists: { type: 'array' },   // entries: { package, nestedPath, reason } — GZ #31 detector
        turboDistFresh: { type: 'boolean' },
        resolved: { type: 'boolean' },          // true when detected issues were fixed before proceeding
        notes: { type: 'array' },
    },
};
const envPreflight = await agent(
    `EnvPreflight (S0) for the ${VENDOR} build — DETERMINISTIC FINDER (P9: you RUN the script; you never eyeball-check).
` +
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --gql-url <the MJAPI url if one is expected> --out ${RUNS_DIR}/preflight
` +
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.
` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.
` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.
` +
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
        Category: { type: ['string', 'null'] },   // Open App folder: AMS|CRM|Events|Finance|LMS|Marketing|Platform
        Disambiguation: { type: 'array' },
        Sources: { type: 'array', items: { type: 'string' } },
        ProductTaxonomy: { type: 'object' },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}". Resolve canonical name, description, navigation URL, icon class, ProductTaxonomy, and the Open App Category (one of AMS|CRM|Events|Finance|LMS|Marketing|Platform — the folder the connector ships under in the MemberJunction/Integrations repo). Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". Read SOURCE_STUDY when ready. Use the universalPK Configuration hint only when authoritatively documented.`,
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
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves (the leaves of the COVERABLE taxonomies) as input to extract-iiof-pipeline.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop, max 3 rounds) ─────────
//
// Per agentic plan §13 + build-connector skill: when the reviewer flags
// blocking gaps, RE-DISPATCH ioiof-extractor with the reviewer's evidence
// as input. Re-freeze. Re-review. Up to 3 rounds.
//
// Two consecutive byte-identical emissions = convergence (the producer can't
// fix what the reviewer wants; that's an honest escalation).
// 3 rounds without resolution = escalate to human (Gap 5).
//
// CodeBuild only runs against a reviewer-approved contract.
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

// 3, NOT 1: with MAX=1 the loop runs exactly once (round 0 = initial extract+review) and on ANY
// blocking gap exits straight to EscalatedMaxRounds WITHOUT ever re-dispatching the extractor with
// the reviewer's FixInstructions — the `isAmendment` (round>0) branch never executes, so the
// amendment loop can never amend (it only ever escalates). 3 enables 2 real re-extraction rounds,
// which the skill documents ("up to 3 rounds") and which resolve mechanical gaps (FK target naming,
// missing co-grouped columns, under-enumerated objects surfaced by dual-derive) in 1-2 passes. The
// deadlock fingerprint check below still short-circuits early when the producer genuinely can't fix.
const MAX_AMENDMENT_ROUNDS = 3;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;
// connector.* (code) fixes the extractor structurally cannot apply — accumulated across rounds and
// handed to the CodeBuild stage downstream (the netFORUM false-deadlock fix). Deduped by slot.
let deferredConnectorFindings = [];

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // ── P0-3 slot-routing (surveys: the 4th run's EscalatedMaxRounds class) ──
    // A FixInstruction targeting an `integration.*` root-row slot (auth, base URL, pagination,
    // batch limits, watermark) is owned by metadata-writer, NOT the IO/IOF extractor. Handing it
    // to the extractor (which only edits IO/IOF rows) means the reviewer re-flags it every round →
    // byte-identical fingerprint → false deadlock/escalation. Route each fix to its owning agent.
    // GUARD: with no `integration.*` fixes (the common case) this is a no-op and the extractor
    // receives the full set exactly as before — worst-case ≤ today, never worse.
    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const slotOf = (f) => String(f?.slot ?? '').toLowerCase();
    const isIntegrationRowSlot = (f) => slotOf(f).startsWith('integration.');
    // A `connector.*` slot is a CODE gap (a defect in the generated connector .ts) — neither the IO/IOF
    // extractor nor metadata-writer can fix it; only the CodeBuild stage can. Pre-fix, it fell into the
    // extractor's bucket (it isn't `integration.*`), so the reviewer re-flagged it every round →
    // byte-identical fingerprint → false EscalatedDeadlock on a clean build (the netFORUM class). Partition
    // it out and DEFER to CodeBuild; the extractor only ever receives io.*/iof.* it can actually fix.
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
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs (Gap 10 revised 2026-05-30).
            // Producer MUST consult each of these where it exists.
            sourceBundle: {
                existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`,
                existingMetadataPaths: [
                    `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`,
                    `metadata/integrations/.${VENDOR_SLUG}.json`,
                    `metadata/integrations/.your-membership.json`, // legacy slugs
                ].filter(Boolean),
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            // Amendment feedback — null on first round; on amendment rounds the extractor
            // receives ONLY the IO/IOF fixes it can apply (integration.* fixes were routed to
            // metadata-writer above) so it never thrashes on a slot it structurally cannot touch.
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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/SDL into your context. Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility. Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    // ── Loop exit conditions ──────────────────────────────────────────
    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        break;
    }

    // If the ONLY remaining blocking gaps are connector.* (code) slots, the metadata contract is as complete
    // as the extractor/metadata-writer can make it — those gaps belong to CodeBuild, which runs downstream.
    // Break the EXTRACT loop (carrying deferredConnectorFindings forward) rather than false-deadlocking on a
    // slot this loop structurally cannot fix. A mixed set still loops: io/iof fixes converge first, then the
    // residual connector-only set trips this break on the next round.
    const blockingFixes = review.FixInstructions ?? [];
    if (blockingFixes.length > 0 && blockingFixes.every(isConnectorSlot)) {
        log(`Amendment loop: all ${review.ConfirmedGapsBlocking} blocking gap(s) are connector.* (code) → deferring ${deferredConnectorFindings.length} to CodeBuild, exiting extract loop`);
        break;
    }

    // Convergence check: byte-identical reviewer fingerprint = producer can't fix what reviewer wants
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
// Deterministic set-arithmetic: did we extract every coverable taxonomy leaf?
// floor-check enforces missing[]===empty when sourceDiffMustClose=true. If the
// diff doesn't close, attempt ONE gap-fill-fork recovery over the missing set,
// then recompute — a genuinely incomplete extraction still fails the floor (correctly).
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL; ARCHITECTURE_REFACTOR.md) ───
// Read-only VERDICTS on the declared claims BEFORE code is built on them. This is the stage that
// would have caught the majority of the GrowthZone repair before a line of connector code existed:
// 17 wrong paths (§B), skip-vs-$skip dead pagination (#1), the 100-row page cap (#2/#3), PKs on
// always-null fields (#5), and the missing write surface (#30). VERDICTS IN, AUTHORSHIP OUT: the
// probe may never add objects/fields/paths to the metadata (floor-check `reality-probe-authored-
// metadata` rejects deltas). With no credential it DEGRADES to the unauthenticated per-claim status
// probe (401/403=path real, 404=path wrong) — it never disappears.
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },               // 'credentialed-readonly' | 'unauthenticated'
        verdicts: { type: 'array' },            // { object, kind: path|pagination|pk|watermark|writeSurface|rate, verdict: confirmed|gated-exists|wrong|unverified, evidence, resolved? }
        // structural evidence FROM the deterministic script's verdicts.json — proves the script actually
        // ran (it hashes the pinned metadata file) so the floor isn't trusting an agent's free-form probe.
        metadataSha256: { type: 'string' },     // sha256 of the metadata file the script read (#H11/#H22 anti-fabrication anchor)
        claims: { type: 'integer' },            // == verdicts.length in a real run
        confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' },       // keyless: path real + auth-gated, content UNVERIFIED
        achievedCeiling: { type: 'string' },    // 'content-verified' | 'format-verified-no-creds'
        capturedPages: { type: 'array' },       // scrubbed real response pages → canonical fixtures (P4), PROVENANCE: live-capture
        metadataDelta: { type: 'boolean' },     // MUST be false — verdicts only
        rateHeaders: { type: 'object' },
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, or the scheme+host of an APIPath).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    `${A?.credentialReference ? ' --token-env <the broker-injected read-only token env var> (credentialed mode — the token bytes never enter your context; it is read from the env inside the script)' : ' (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong)'}.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode, verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling, metadataDelta:false }. The script writes scrubbed captured pages alongside (P4 fixtures). You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (S8 — ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:
${JSON.stringify(probeWrong).slice(0, 4000)}
` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. the $-prefixed param form, the corrected path, demote a null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    // carry resolved verdicts forward for the floor-check
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop (max 3 rounds) ────────────────
//
// CodeBuild can fail two ways: TypeScript doesn't compile (BuildClean=false),
// or the verification ladder turns up a red rung. In both cases we route the
// failure back to code-builder with the specific error as input; up to 3
// rounds. Same convergence + max-round logic as the extract amendment loop.
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

// 3 (was 2): MAX=2 gave only ONE amendment round (round 0 build + round 1 fix); 3 gives two, matching
// the documented "up to 3 rounds" and the extract loop, so a connector that fails the ladder on a
// fixable rung gets two real correction passes before escalating. The deadlock check still exits early.
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
            : `Build the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ), `code:r${codeRound}`);
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    // ── Verify the connector FILE actually exists on disk ────────────────
    // BuildClean from the agent is self-reported; gate it on a real file. The
    // connector path convention is packages/Integration/connectors/src/<ClassName>.ts.
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
        continue; // re-attempt with errors fed back
    }

    // ── Ensure the connector is registered in connectors/src/index.ts ────
    // Append the export iff it isn't already present. The export convention is
    //   export { <ClassName> } from './<ClassName>.js';
    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append the line:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // ── Stage artifacts into the registry dir where mj-test-runner looks ──
    // The runner (T1 invariants, T3 doc-self-check, T7 openapi) resolves the metadata,
    // connector .ts, and EXTRACTION_REPORT_MATRIX.csv RELATIVE TO connectors-registry/<vendor>/,
    // but the build writes them to canonical/shared/run-specific locations
    // (metadata/integrations/<vendor>/, the shared connectors/src/ package, runs/<runID>/output/).
    // Symlink them into the registry so the runner finds them. Idempotent; single source of truth.
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
            // mj-test-runner resolves Connector → connectors-registry/<slug>/; pass the
            // registry SLUG, not ClassName. T1's three-way name check reads the real
            // ClassName from the metadata file. (Finding A — ClassName≠slug deadlocks T1.)
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

    // Ladder failed — anti-thrash check + convergence check + amend
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

// ── HybridE2E (deep §1→§7: real MJ engine → real Postgres) ────────────
// REQUIRED on every build. The T0..T8 ladder above only exercises the connector
// class in isolation; this proves it THROUGH MJAPI into a real Postgres DB
// (ApplyAll → upsert → contentHash → incremental → delta-CRUD → idempotent).
// The mock floor is credential-free; live mode runs when broker creds are present.
// The ENTIRE env bring-up is scripted in HYBRID_E2E_ENV_RUNBOOK.md — the agent does
// NOT guess. The ONLY assumption is the Docker daemon is up.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        // registry SLUG, not ClassName (Finding A) — the runner/e2e resolve by slug dir.
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds are reachable by EITHER path — an opaque credentialReference OR a read-only
        // broker plan. Pre-fix this keyed on credentialReference alone, so a broker-creds build
        // (credentialReference:null + brokerPlans:['<vendor>-readonly']) ran MOCK and then dodged the
        // floor's e2e-mock-dodge gate (which also keyed on credentialReference) — Facet-D #H7.
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
            sources,                                         // scope-sanity: EnumerationStdoutCount + TaxonomyLeaves (declared universe vs enumerated)
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null, // scope-unjustified-thin gate
            // v2 EMPIRICAL-gate evidence (ARCHITECTURE_REFACTOR.md §3):
            envPreflight,                                    // P7 env-preflight-* / stale-nested-dist
            realityProbe,                                    // P2 reality-probe-* rules
            credentialReference: A?.credentialReference ?? null, // P6 e2e-mock-dodge
            brokerPlans: A?.brokerPlans ?? null,             // P6 e2e-mock-dodge — broker creds are creds too (#H7)
            brand,                                           // P5 capability-dishonest (brand.WriteCapability)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

// ── OpenAppPublish (v2 — assemble the verified connector into the Integrations repo as an Open App) ──
// Additive final stage: runs ONLY after FloorCheck passes and does NOT touch the sandbox build/verify flow
// above. publish-open-app.mjs scaffolds the Open App, copies the connector forcing the package-name
// @RegisterClass key, copies the metadata forcing ClassName/ImportPath = package name, generates the seed
// migration, regenerates the catalog, adds a changeset, and runs validate-invariants as the four-way gate.
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
    codeResult,
    codeRound,
    ladder,
    verdict,
    publish,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
