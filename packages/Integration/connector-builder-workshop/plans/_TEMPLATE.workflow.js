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
        { title: 'BrandResearch', detail: 'Resolve canonical brand + ProductTaxonomy' },
        { title: 'Identity', detail: 'Fill Integration row identity slots' },
        { title: 'SourceAudit', detail: 'Audit + rank sources, build SOURCE_STUDY' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + adversarial + write-back)' },
        { title: 'FreezeContract', detail: 'Adversarial-verify the assembled contract; persist with hash' },
        { title: 'IndependentReview', detail: 'Different-model adversarial review of EXTRACTION_REPORT' },
        { title: 'CodeBuild', detail: 'Connector class + tests' },
        { title: 'VerificationLadder', detail: 'T0..maxTier' },
        { title: 'FloorCheck', detail: 'Bijection slot table + manifest declarations' },
    ],
};

const VENDOR = args?.vendor ?? '(unknown)';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${args?.runID ?? 'unknown'}`;

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: args?.maxTier ?? 'T9',
    adversarialVerifyMinReviewers: 4,
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
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}". Resolve canonical name, description, navigation URL, icon class, and ProductTaxonomy. Schema-bound output only.`,
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

const MAX_AMENDMENT_ROUNDS = 3;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    // ── Extract (round 0) or Re-extract with reviewer feedback (round >0) ──
    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            writeBackPath: METADATA_FILE,
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
            // Amendment feedback — null on first round, populated on subsequent
            amendmentRound,
            reviewerFindings: isAmendment ? review.FixInstructions : null,
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
        `Adversarial review of EXTRACTION_REPORT + emission for ${VENDOR} (amendment round ${amendmentRound}). Build your own expected inventory BEFORE opening producer's report. Bijection violations are always Confirmed Gaps (Blocking). When you report Confirmed Gaps, populate FixInstructions with the exact mechanical change required (slot, before, after, locus) so the producer can apply them deterministically.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    // ── Loop exit conditions ──────────────────────────────────────────
    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
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
            runID: RUN_ID,
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
        runID: RUN_ID,
        vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound,
        status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
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

const MAX_CODE_BUILD_ROUNDS = 3;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    if (!codeResult.BuildClean) {
        codeRound++;
        continue; // re-attempt with errors fed back
    }

    // Build clean — try the ladder
    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: identity.Identity.ClassName,
            manifest: MANIFEST,
            credentialReference: args?.credentialReference ?? null,
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
            runID: RUN_ID,
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
        runID: RUN_ID,
        vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
        amendmentRound, codeRound,
        status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── FloorCheck (final gate) ──────────────────────────────────────────
phase('FloorCheck');
const verdict = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js' },
    {
        runID: args?.runID,
        vendor: VENDOR,
        slotsPath: args?.slotsPath ?? 'packages/Integration/connector-builder-workshop/floor/phase0-slots.json',
        manifest: MANIFEST,
        journal: { extractStats, frozen, review, codeResult, ladder },
    }
);

return {
    runID: args?.runID,
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
