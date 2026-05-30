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

// ── IOIOFExtract (the heaviest stage) ────────────────────────────────
phase('IOIOFExtract');
const extractStats = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
    {
        vendor: VENDOR,
        sourceID: sources.SourcesFile,
        objectList: sources.TaxonomyLeaves,
        writeBackPath: METADATA_FILE,
        adversarialN: MANIFEST.adversarialVerifyMinReviewers,
    }
);
log(`IOIOFExtract: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${extractStats.gapsRemaining.length} gaps`);

// ── FreezeContract ───────────────────────────────────────────────────
phase('FreezeContract');
const frozen = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
    {
        vendor: VENDOR,
        contract: extractStats,
        provenanceSidecar: {},
        outputDir: `${RUNS_DIR}/output`,
        adversarialN: MANIFEST.adversarialVerifyMinReviewers,
    }
);

// ── IndependentReview ────────────────────────────────────────────────
phase('IndependentReview');
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
    },
};
const review = await agent(
    `Adversarial review of EXTRACTION_REPORT + emission for ${VENDOR}. Build your own expected inventory before opening the producer's report. Bijection violations are always Confirmed Gaps (Blocking).`,
    { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:${VENDOR_SLUG}` }
);
if (review.ConfirmedGapsBlocking > 0) {
    throw new Error(`IndependentReview blocked by ${review.ConfirmedGapsBlocking} confirmed gaps`);
}

// ── CodeBuild ────────────────────────────────────────────────────────
phase('CodeBuild');
const CODE_RESULT_SCHEMA = {
    type: 'object', required: ['BuildClean'],
    properties: {
        BuildClean: { type: 'boolean' },
        LinesOfCode: { type: 'integer' },
        TestsWritten: { type: 'integer' },
        GenericCRUDUsedForIOCount: { type: 'integer' },
        OverriddenCRUDForIOCount: { type: 'integer' },
        RemainingGaps: { type: 'array' },
    },
};
const codeResult = await agent(
    `Build the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only for genuinely idiosyncratic vendor shapes.`,
    { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: 'CodeBuild', label: `code:${VENDOR_SLUG}` }
);
if (!codeResult.BuildClean) {
    throw new Error('CodeBuild produced a non-clean build');
}

// ── VerificationLadder ───────────────────────────────────────────────
phase('VerificationLadder');
const ladder = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
    {
        vendor: VENDOR,
        connectorName: identity.Identity.ClassName,
        manifest: MANIFEST,
        credentialReference: args?.credentialReference ?? null,
        maxTier: MANIFEST.e2eTier,
    }
);

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
    metadataResult,
    extractStats,
    frozen,
    review,
    codeResult,
    ladder,
    verdict,
};
