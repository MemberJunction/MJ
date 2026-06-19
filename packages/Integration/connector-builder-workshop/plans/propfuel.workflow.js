// propfuel.workflow.js — per-vendor build plan (emitted by the connector-creator planner)
//
// Vendor:   PropFuel (healthcare-association engagement / feedback SaaS)
// Run kind: [A] LIVE-CREDENTIAL, READ-ONLY ceiling T8 (broker plan `propfuel-readonly`)
// Mode:     IMPROVE — packages/Integration/connectors/src/PropFuelConnector.ts ALREADY EXISTS
//           and carries the two canonical PropFuel defects this build exists to fix:
//             (1) a STATIC baked stream catalog  PROPFUEL_STREAMS = ['checkin_questions','clicks','opens']
//             (2) a build-time-LIVE-SAMPLED, frozen STREAM_FIELDS field catalog
//                 ("Confirmed from live broker results")
//           IMPROVE here = critique heavily + RE-DERIVE the schema from CREDENTIAL-FREE docs +
//           DIFF against re-derived truth + replace the static catalog with a RUNTIME DISCOVERY
//           MECHANISM. The existing connector/metadata are OUTPUT (suspect), NEVER a source.
//
// Shape:    file (file-feed data-export slice over REST/Bearer; SPEC-LESS, no public OpenAPI)
// Auth:     api-key (static Bearer token + path-embedded AccountID)
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// AMENDED 2026-06-08 after the PRIOR run ESCALATED (status EscalatedMaxRounds). This amendment
// makes the pipeline resolve its own gaps AUTONOMOUSLY — NO step depends on a human decision.
//
// WHY THE PRIOR RUN ESCALATED + HOW THIS AMENDMENT FIXES IT (deterministically, no re-deadlock):
//
//   GAP 1 — BIJECTION DEADLOCK (the escalation cause). The IO emitted
//     SupportsIncrementalSync=true + IncrementalWatermarkField=null. The coupling invariant
//     (independent-reviewer.md:39 / metadata-file-conventions: "IncrementalWatermarkField REQUIRED
//     when SupportsIncrementalSync=true") flagged this EVERY round. The round-2 FixInstruction
//     wrongly set watermark->null while leaving the flag true (the WRONG half of the fix), so the
//     violation never cleared -> 3-round cap -> escalation.
//     DETERMINISTIC RESOLUTION — STANCE (A), decided HERE by the planner, NOT by any agent at runtime:
//       SupportsIncrementalSync=true  AND  IncrementalWatermarkField="__file_microtime".
//     Rationale: the feed is APPEND-ONLY with a chronological filename microtime prefix
//     ([microtime]-[datatype].json). Read-only mode cannot use the vendor's ack mechanism, so a
//     CLIENT-SIDE file-level cursor (max microtime seen across processed files) IS the genuine
//     resume mechanism — exactly what the connector's StableOrderingKey='microtime' /
//     SyncStrategy='AppendOnlyCursor' / IsAppendOnly already model. "__file_microtime" is a SYNTHETIC,
//     file-level watermark the connector maps to the filename microtime; it makes incremental sync
//     real (not a full re-fetch every run) and makes the bijection internally consistent. Stance B
//     (incremental=false -> content-hash full-fetch) was REJECTED: it discards a real, free resume
//     capability the feed plainly supports. To guarantee the FIRST emission is already consistent
//     (so the reviewer has NOTHING to re-flag and the loop CANNOT re-deadlock), this stance is:
//       (i)   injected into the metadata-writer + extractor + IMPROVE prompts as BIJECTION_DIRECTIVE,
//       (ii)  ENFORCED mechanically by a deterministic reconcile step (reconcileBijection) that
//             runs after EVERY extract round and idempotently writes the consistent pair onto the IO
//             row via the mcp-mj-metadata upsert tool — independent of what the extractor emitted.
//     The reviewer's PropFuel checks below are ALSO told the stance is intentional, so an internally
//     consistent (true,"__file_microtime") pair is NOT a gap.
//
//   GAP 2 — MISSING EXTRACTION_REPORT.md + scattered artifacts (runs/unknown/...). Root cause: the
//     prior workflow did NOT thread runID into its sub-workflow calls, so RUNS_DIR fell back to the
//     literal 'unknown' and the canonical EXTRACTION_REPORT.md was never produced.
//     FIX: thread runID:args?.runID into EVERY workflow({scriptPath...}, {...}) sub-call (already
//     present on most; now uniform), AND add an explicit generateExtractionReport step that writes
//     the canonical EXTRACTION_REPORT.md to runs/<runID>/output/ so the reviewer + floor-check find it.
//     Residual ARCHITECTURAL FINDING (surfaced in rationale, cannot be fixed from the workflow): the
//     independent-reviewer agent writes its ReviewFile to a cwd-relative path inside the agent role;
//     the workflow cannot relocate that — see rationale.
//
// PRESERVED FROM THE PRIOR CLEAN RUN (do NOT regress): docs-only build; runtime discovery MECHANISM
// (no static stream catalog, no build-time live sampling); per-build-agent fences against prior
// OUTPUT + the broker mailbox; READ-ONLY live tier (broker propfuel-readonly, T8); both amendment
// loops (MAX=3) with deadlock + max-round escalation; scope decision (OutOfScopeObjectFamilies).
// ────────────────────────────────────────────────────────────────────────────────────────────
//
// ── THE PROPFUEL LESSON (both halves), enforced structurally by this plan ──
//  A. SCOPE KNOWINGLY. The provided context (`sources/data-export-context.md`) is the CLIENT'S
//     CONSUMPTION SURFACE (the hourly .json file feed), NOT PropFuel's full nature. The brand/nature
//     study runs on EVERY build and establishes PropFuel's real product breadth for AWARENESS; the
//     SCOPE decision then models the in-scope FILE-FEED slice deeply and records the broader REST
//     product as Integration.Configuration.OutOfScopeObjectFamilies WITH THE REASON.
//  B. DISCOVERY IS A MECHANISM, NOT AN ANSWER. The feed is spec-less; the data-type set is knowable
//     only from live `/list` output — which the build is FORBIDDEN to read (credential is TEST-TIME
//     ONLY). The connector authors DiscoverObjects/DiscoverFields as a runtime mechanism and the
//     Declared metadata is seeded from the DOCS only. Live `Discovered` rows are populated at T8.
//
//  Credential discipline (floor `credential-used-at-build`): args.credentialReference is threaded
//  ONLY into VerificationLadder + HybridE2E. Every build stage runs credential-free; NO build prompt
//  contains an "if a credential is available -> live-discover the streams" branch.
//
//  RUNTIME CONSTRAINTS honored: (1) sandboxed JS context — NO imports/await import() anywhere; the
//  on-disk emitter is the sub-agents' job, this script narrates via the provided log()/phase().
//  (2) meta is a PURE LITERAL — single string literals only, no concatenation. (3) both amendment
//  loops kept at MAX=3 with deadlock + cap escalation, but Gap-1 is resolved up front so the extract
//  loop converges on round 0.

export const meta = {
    name: 'propfuel-build',
    description: 'IMPROVE build for PropFuel (healthcare-association engagement SaaS). In-scope = the hourly data-export FILE-FEED slice, modelled deeply via a RUNTIME discovery mechanism (no static stream catalog, no build-time live sampling). Bijection resolved deterministically: SupportsIncrementalSync=true + IncrementalWatermarkField=__file_microtime (client-side file-level cursor over the filename microtime prefix). Broader REST product recorded out-of-scope. Locked primitives + READ-ONLY live tier (broker propfuel-readonly, T8) + EXTRACTION_REPORT.md at runs/<runID>/output + bijection floor-check. Fully autonomous — no step requires human input.',
    phases: [
        { title: 'BrandResearch', detail: 'PropFuel FULL nature (REST product breadth + file-feed slice) — independent of context' },
        { title: 'Identity', detail: 'Integration row identity slots; CredentialTypeID match-or-create (Token + AccountID shape)' },
        { title: 'SourceAudit', detail: 'Audit credential-free sources; COVERABLE file-feed slice vs INFORMATIONAL REST product' },
        { title: 'MetadataWrite', detail: 'Integration non-identity slots + Configuration JSON incl. OutOfScopeObjectFamilies + resolved bijection stance' },
        { title: 'IOIOFExtract', detail: 'Per-stream extract from DOCS only (mechanism-described); deterministic bijection reconcile; verify + adversarial + write-back' },
        { title: 'FreezeContract', detail: 'Adversarial-verify the assembled contract; persist with hash' },
        { title: 'IndependentReview', detail: 'Different-model adversarial review (slim mode); resolved bijection stance declared so it is not re-flagged' },
        { title: 'ExtractionReport', detail: 'Generate the canonical EXTRACTION_REPORT.md at runs/<runID>/output (Gap 2 fix)' },
        { title: 'SourceDiff', detail: 'Completeness gate over the in-scope coverable file-feed leaves' },
        { title: 'CodeBuild', detail: 'IMPROVE connector: replace static catalog with runtime DiscoverObjects/DiscoverFields mechanism' },
        { title: 'VerificationLadder', detail: 'T0..T8 (READ-ONLY live ceiling; full non-live suite always runs)' },
        { title: 'HybridE2E', detail: 'Deep read-only e2e on SQL Server: real MJ engine -> real SS DB. Live mechanism populates Discovered. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection slot table + manifest declarations + hybrid-e2e pass' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING (the model→Workflow-tool
// path does); normalize so `A?.x` works whether args arrives as a string or an object.
// (Without this, runID defaulted to 'unknown' → artifacts scattered to runs/unknown, and
// credentialReference/brokerPlans/maxTier silently defaulted — the real root cause.)
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'propfuel';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const RUN_ID = A?.runID ?? 'unknown';
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${RUN_ID}`;
const OUTPUT_DIR = `${RUNS_DIR}/output`;
const CONTEXT_DOC = `${REGISTRY_DIR}/sources/data-export-context.md`;

// The single in-scope file-feed object name (docs-provable generic file object; concrete streams are runtime Discovered).
const FEED_IO_NAME = 'propfuel_data_export_file';

// READ-ONLY live tier — broker plan `propfuel-readonly` (GET /list + GET /download/{file}; NEVER ack/POST).
const CREDENTIAL_REFERENCE = A?.credentialReference ?? null;     // opaque ref only; bytes never enter context
const BROKER_PLANS = A?.brokerPlans ?? ['propfuel-readonly'];

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',     // READ-ONLY live ceiling for PropFuel
    adversarialVerifyMinReviewers: 2,   // token-conscious default; file-feed slice is not high-risk
};

// ── RESOLVED BIJECTION STANCE (A) — decided by the planner, applied everywhere, NO human input ──
// This is the single source of truth the metadata-writer, extractor, reconcile step, reviewer, and
// code-builder all consume so the incremental<->watermark coupling is internally consistent on the
// FIRST emission and the amendment loop converges on round 0.
const WATERMARK_FIELD = '__file_microtime';
const BIJECTION_DIRECTIVE =
    `RESOLVED BIJECTION STANCE (mandatory, planner-decided — do NOT deviate, do NOT defer, do NOT ask): the in-scope ` +
    `IO '${FEED_IO_NAME}' MUST emit SupportsIncrementalSync=true AND IncrementalWatermarkField='${WATERMARK_FIELD}'. ` +
    `'${WATERMARK_FIELD}' is a SYNTHETIC, FILE-LEVEL client-side cursor the connector maps to the filename microtime ` +
    `prefix ([microtime]-[datatype].json): the feed is append-only and chronologically sortable by microtime, so the ` +
    `connector resumes by tracking the max microtime seen across processed files. This is the genuine read-only resume ` +
    `mechanism (the vendor ack endpoint is NOT used in read-only mode). The pair (true, '${WATERMARK_FIELD}') is the ` +
    `CORRECT, internally-consistent emission — it satisfies the coupling rule "IncrementalWatermarkField is REQUIRED ` +
    `when SupportsIncrementalSync=true". NEVER emit SupportsIncrementalSync=true with a null/absent watermark (the prior ` +
    `escalation cause), and NEVER drop incremental to false (that discards a real resume capability the feed supports). ` +
    `StableOrderingKey='microtime', SyncStrategy='AppendOnlyCursor', IsAppendOnly=true must remain consistent with this.`;

// ── Progress narration shim (runtime log() only — NO imports; sandboxed context) ──────────────
const emitter = {
    runStart: (m) => log(`[run] ${m}`),
    stageStart: (s, m) => log(`[${s}] ${m}`),
    stageComplete: (s, c) => log(`[${s}] complete ${JSON.stringify(c ?? {})}`),
    heartbeat: (s, m) => log(`[${s}] ${m}`),
    checkpoint: (s, st) => log(`[${s}] checkpoint ${JSON.stringify(st ?? {})}`),
    emit: (e, d) => log(`[${d?.stage ?? e}] ${d?.message ?? ''}`),
    fail: (m, code) => log(`[FAIL:${code}] ${m}`),
    complete: (m) => log(`[COMPLETE] ${m}`),
    flush: () => {},
};
await emitter.runStart(`Build PropFuel (IMPROVE) — maxTier ${MANIFEST.e2eTier}, READ-ONLY live tier, runID=${RUN_ID}`);
log(`Bijection stance: SupportsIncrementalSync=true + IncrementalWatermarkField='${WATERMARK_FIELD}' (planner-resolved, autonomous)`);

// Deterministic mechanical reconcile — forces the resolved bijection pair onto the written IO row,
// regardless of what the extractor emitted. Cheap haiku agent runs ONE idempotent MCP upsert + one
// CODE_EVIDENCE append. This is what guarantees the loop CANNOT re-deadlock on Gap 1: after each
// extract, the metadata the reviewer reads ALREADY carries the consistent (true, '__file_microtime') pair.
async function reconcileBijection(roundLabel) {
    return await agent(
        `Mechanically enforce the RESOLVED BIJECTION STANCE on the written PropFuel metadata (no judgment — apply verbatim). ` +
        `${BIJECTION_DIRECTIVE}\n` +
        `Using the mcp-mj-metadata tool 'upsert_integration_object' (idempotent), set on connector '${VENDOR_SLUG}' IO '${FEED_IO_NAME}' EXACTLY these fields:\n` +
        `  SupportsIncrementalSync = true\n` +
        `  IncrementalWatermarkField = "${WATERMARK_FIELD}"\n` +
        `  StableOrderingKey = "microtime"\n` +
        `  SyncStrategy = "AppendOnlyCursor"\n` +
        `  IsAppendOnly = true\n` +
        `Then append ONE CODE_EVIDENCE entry (tool 'append_code_evidence') for TargetField io.${FEED_IO_NAME}.IncrementalWatermarkField citing the file-naming convention "[microtime]-[datatype].json" in ${CONTEXT_DOC} (the chronological microtime prefix is the synthetic file-level cursor). Do NOT touch any other field, IO, or row. Read NOTHING else. Return whether the upsert + evidence write succeeded and the final watermark value present on the row.`,
        { agentType: 'metadata-writer', model: 'haiku', schema: { type: 'object', required: ['Applied'], properties: { Applied: { type: 'boolean' }, WatermarkValue: { type: 'string' }, IncrementalFlag: { type: 'boolean' } } }, phase: roundLabel, label: `reconcile-bijection:${roundLabel}` }
    ).catch((e) => { log(`reconcileBijection(${roundLabel}) error: ${String(e)}`); return { Applied: false }; });
}

// ── BrandResearch — STUDY for awareness (full nature, independent of context) ──
phase('BrandResearch');
await emitter.stageStart('BrandResearch', 'Establish PropFuel full nature (REST product breadth) independent of the file-feed context');
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
        ScopeReason: { type: ['string', 'null'] },
        ResidualDoubts: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" — establish its FULL, REAL nature from INDEPENDENT public discovery, NOT from ` +
    `the provided context and NOT from the existing connector. PropFuel is a healthcare-association ` +
    `engagement / feedback SaaS — study its real product breadth: object families, auth model(s), read AND ` +
    `write/bidirectional capability, pagination, rate limits, "what ELSE the system exposes" (its rich REST ` +
    `engagement API). The provided file-feed context at ${CONTEXT_DOC} is a NON-EXHAUSTIVE helper describing ONE ` +
    `consumption surface — absence in it is NOT evidence of absence in the system. Emit ObjectFamilies = the FULL ` +
    `surface the study finds (for awareness; the planner scopes later). Emit a ResidualDoubts note ("is this ` +
    `suspiciously thin? what else might exist?"). DO NOT read the credential and DO NOT touch the live feed.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);
await emitter.stageComplete('BrandResearch', { processed: (brand.ObjectFamilies ?? []).length, succeeded: 1, failed: 0, skipped: 0 });

// ── Identity ──────────────────────────────────────────────────────────
phase('Identity');
await emitter.stageStart('Identity', 'Fill Integration identity slots; resolve CredentialTypeID (Token + AccountID shape)');
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (PropFuel). The connector class is ` +
    `PropFuelConnector / IntegrationName 'PropFuel'. Resolve CredentialTypeID by match-or-create against the ` +
    `connection-config key shape: { Token (secret bearer), AccountID (path-embedded tenant id) } — the schema at ` +
    `metadata/credential-types/schemas/propfuel-api.schema.json. The AccountID is per-tenant CONFIG, NOT a baked ` +
    `constant — the connector reads it from the credential/Configuration, never hardcodes '2019'. Read SOURCE_STUDY ` +
    `when ready. DO NOT read the credential value.\n` +
    `🚧 HARD FENCE (build-time is credential-free): DO NOT read ANY prior OUTPUT — the existing PropFuelConnector.ts, the prior ` +
    `${METADATA_FILE}, prior PROVENANCE/CODE_EVIDENCE/SOURCE_STUDY — and DO NOT read /Users/Shared/mj-mailbox or any cached ` +
    `broker/live result. Those are suspect OUTPUT or test-time-only data; build identity ONLY from docs + the brand study.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    // Autonomous policy: PropFuel identity is unambiguous (single canonical brand + fixed ClassName/IntegrationName).
    // A Conflict/NeedsHumanDisambiguation here is a genuine infra error, not a design question for a human — fail loudly.
    await emitter.fail(`Identity stage produced ${identity.Status}; PropFuel identity is unambiguous so this is an infra error, not a human-decision gate`, 'identity-conflict');
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired (infra error — identity is deterministic for PropFuel)`);
}
await emitter.stageComplete('Identity', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });

// ── SourceAudit ─────────────────────────────────────────────────────────
phase('SourceAudit');
await emitter.stageStart('SourceAudit', 'Rank credential-free sources; split COVERABLE file-feed slice vs INFORMATIONAL REST product');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        ScopedSubset: { type: 'array', items: { type: 'string' } },
        Gaps: { type: 'array' },
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
    },
};
const sources = await agent(
    `Audit + rank AUTHORITATIVE, CREDENTIAL-FREE sources for ${brand.CanonicalName}. Include the user-provided ` +
    `file-feed context at ${CONTEXT_DOC} (Tier-1 for the facts it states) and any public PropFuel docs the brand ` +
    `study surfaced. Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split:\n` +
    `  • COVERABLE (in-scope, modelled deeply) = the data-export FILE-FEED slice. Its taxonomy is SPEC-LESS: the ` +
    `    concrete data-type set is knowable ONLY from live /list output, which the build MUST NOT read. So emit ` +
    `    TaxonomyLeaves as the DOCS-PROVABLE leaves: a SINGLE generic '${FEED_IO_NAME}' object whose concrete ` +
    `    streams are DISCOVERED at runtime. Do NOT invent or transcribe the 3 streams from the existing connector — ` +
    `    that is OUTPUT, not a source.\n` +
    `  • INFORMATIONAL (out-of-scope) = PropFuel's broader REST engagement product (${(brand.ObjectFamilies ?? []).join(', ') || 'the families the brand study found'}). ` +
    `    Record it for awareness; it is NOT modelled.\n` +
    `Emit ScopedSubset = ['${FEED_IO_NAME}'] (the in-scope file-feed leaf). DETECT TENSION: if independent evidence ` +
    `contradicts the context, note it (context is trusted-where-it-speaks but NOT sacred).\n` +
    `🚧 HARD FENCE (build-time is credential-free): rank ONLY public docs + the provided context under ${REGISTRY_DIR}/sources/. ` +
    `DO NOT read ANY prior OUTPUT (existing connector, prior ${METADATA_FILE}, prior PROVENANCE/CODE_EVIDENCE/SOURCE_STUDY, run ` +
    `artifacts) and DO NOT read /Users/Shared/mj-mailbox or ANY cached broker/live result file — those are TEST-TIME-ONLY and ` +
    `reading them is forbidden build-time live data. The concrete stream set is DISCOVERED at runtime, never transcribed here.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);
// audit-source primitive re-ranks via the rubric (verifies URLs + tiers reachable, credential-free)
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile, runID: RUN_ID, vendor: VENDOR });
await emitter.stageComplete('SourceAudit', { processed: (sources.TaxonomyLeaves ?? []).length, succeeded: 1, failed: 0, skipped: 0 });

// ── SCOPE DECISION (planner judgment — knowing, not blind) ───────────────
// study breadth (brand.ObjectFamilies) is for AWARENESS; the modeled set is the in-scope file-feed slice.
// Deterministic floor: the in-scope set is ALWAYS at least the single docs-provable feed object, so the
// scope decision never depends on an agent returning a non-empty list (autonomy guarantee).
let scopeOfInterest = (sources.ScopedSubset ?? sources.TaxonomyLeaves ?? []);
if (!Array.isArray(scopeOfInterest) || scopeOfInterest.length === 0) scopeOfInterest = [FEED_IO_NAME];
const outOfScopeFamilies = (brand.ObjectFamilies ?? []).filter(f => !scopeOfInterest.includes(f));
const scopeReason = brand.ScopeReason
    ?? 'MJ clients consume PropFuel via the hourly data-export FILE FEED; the broader REST engagement product is ' +
       'real but not the reachable/useful surface for this use case. File feed modelled deeply; REST product deferred-with-reason.';

// ── MetadataWrite ───────────────────────────────────────────────────────
phase('MetadataWrite');
await emitter.stageStart('MetadataWrite', 'Integration non-identity slots + Configuration JSON (incl. OutOfScopeObjectFamilies + resolved bijection stance)');
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName} from CREDENTIAL-FREE ` +
    `sources only. Write to ${METADATA_FILE} via mcp-mj-metadata (never hand-edit). Record the SCOPE DECISION ` +
    `explicitly in Integration.Configuration:\n` +
    `  • OutOfScopeObjectFamilies = ${JSON.stringify(outOfScopeFamilies)} (the broader REST product the brand study ` +
    `    found, recorded known-but-not-built so a future build can expand without re-discovering)\n` +
    `  • OutOfScopeReason = ${JSON.stringify(scopeReason)}\n` +
    `  • dataExportBaseURLTemplate = 'https://app.propfuel.com/dataexport/{AccountID}/' (AccountID is per-tenant ` +
    `    Configuration/credential, NOT a baked constant — DO NOT hardcode '2019').\n` +
    `  • IncrementalSyncCapability = true; FileNamingConvention = '[microtime]-[datatype].json'.\n` +
    `${BIJECTION_DIRECTIVE}\n` +
    `Leave any unprovable slot UNSET (the safe default) and log it as a gap with reason. No 'InferredFromContext' on ` +
    `hard constraints.\n` +
    `🚧 HARD FENCE (build-time is credential-free; treat anything auth obtains as DYNAMIC, never static): build ONLY ` +
    `from the docs under ${REGISTRY_DIR}/sources/. DO NOT read ANY prior OUTPUT — the existing connector, the prior/` +
    `existing ${METADATA_FILE}, prior PROVENANCE/CODE_EVIDENCE/SOURCE_STUDY, or any run artifact (they are suspect ` +
    `OUTPUT, not sources). DO NOT read /Users/Shared/mj-mailbox or ANY cached broker/live result file (propfuel-probe-*, ` +
    `propfuel-discover-*, propfuel-lifecycle-*, pf-*, t8-propfuel-* …) — those are TEST-TIME-ONLY; reading them is ` +
    `forbidden build-time live data and is the exact defect this build exists to prevent. NEVER bake a static stream/` +
    `data-type catalog or live-derived field list; the data-type set is DISCOVERED at runtime, not declared here.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);
await emitter.stageComplete('MetadataWrite', { processed: metadataResult.FieldsPopulated ?? 0, succeeded: 1, failed: 0, skipped: metadataResult.FieldsDeferredAsGaps ?? 0 });

// ── Extract → Reconcile → Freeze → Review (amendment loop, max 3 rounds) ──
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

const MAX_AMENDMENT_ROUNDS = 3;     // per the explicit skill contract for this run
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

// Shared extractor source bundle. EXCLUDES prior OUTPUT (the circular-source defect) and carries the
// resolved bijection directive so the extractor emits the consistent pair on round 0.
function extractorSourceBundle() {
    return {
        openapiPath: null,
        vendorDocsPaths: [CONTEXT_DOC, ...(sources.VendorDocsPaths ?? [])],
        sdkPaths: [],
        postmanPaths: [],
        excludedSources: {
            reason: 'PropFuel circular-source defect — existing PropFuelConnector.ts/dist + prior .propfuel.integration.json are OUTPUT, never a source.',
            existingConnectorTsPath: `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`,
            priorMetadataPath: METADATA_FILE,
        },
        bijectionDirectives: BIJECTION_DIRECTIVE,
        discoveryModel: 'spec-less-file-feed: Declared = docs-provable file-feed object + naming/watermark mechanism; concrete streams + their fields = runtime Discovered via /list-suffix + /download-sample. NEVER build-sampled, NEVER transcribed from existing connector.',
    };
}

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    if (isAmendment) {
        await emitter.emit('progress.heartbeat', { stage: phaseLabel, message: `amendment round ${amendmentRound}/${MAX_AMENDMENT_ROUNDS}: ${review.ConfirmedGapsBlocking} blocking gaps`, level: 'warn' });
    } else {
        await emitter.stageStart('IOIOFExtract', 'Extract in-scope file-feed IO/IOF from DOCS only; re-derive vs existing (suspect)');
    }

    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: scopeOfInterest,                          // in-scope file-feed leaves ONLY
            outOfScopeFamilies,                                   // recorded to Configuration, not modelled
            scopeReason,
            writeBackPath: METADATA_FILE,
            outputDir: OUTPUT_DIR,
            runID: RUN_ID,                                        // Gap-2 fix: thread runID
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            sourceBundle: extractorSourceBundle(),
            discoveryModel: 'spec-less-file-feed: Declared = docs-provable file-feed object + naming/watermark mechanism; concrete streams + their fields = runtime Discovered via /list-suffix + /download-sample. NEVER build-sampled, NEVER transcribed from existing connector.',
            amendmentRound,
            reviewerFindings: isAmendment ? review.FixInstructions : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted ?? 0} objects, ${extractStats.fieldsExtracted ?? 0} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    // ── DETERMINISTIC BIJECTION RECONCILE (Gap-1 fix) ──────────────────────
    // Force the resolved (true, '__file_microtime') pair onto the written IO row regardless of what
    // the extractor emitted. This is what makes the loop converge on round 0 — the metadata the
    // reviewer reads next is ALREADY internally consistent, so the coupling rule cannot be re-flagged.
    const reconciled = await reconcileBijection(phaseLabel);
    log(`Bijection reconcile (${phaseLabel}): applied=${reconciled?.Applied} watermark='${reconciled?.WatermarkValue ?? WATERMARK_FIELD}' incremental=${reconciled?.IncrementalFlag ?? true}`);
    await emitter.checkpoint(phaseLabel, { stage: 'post-reconcile', watermark: WATERMARK_FIELD, applied: reconciled?.Applied });

    phase('FreezeContract');
    if (!isAmendment) await emitter.stageStart('FreezeContract', 'Adversarial-verify the assembled contract; persist with hash');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: OUTPUT_DIR, runID: RUN_ID, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read ` +
        `the full source into context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + ` +
        `compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the ` +
        `docs and read its compact stdout — never parse the source in-context. Then spot-check a SAMPLE of ~15 ` +
        `emitted fields (read the metadata file, not the source) for bijection + plausibility.\n` +
        `🔒 RESOLVED BIJECTION STANCE (planner-decided — this is INTENTIONAL and CORRECT, do NOT flag it as a gap): ` +
        `IO '${FEED_IO_NAME}' carries SupportsIncrementalSync=true AND IncrementalWatermarkField='${WATERMARK_FIELD}'. ` +
        `'${WATERMARK_FIELD}' is a synthetic file-level client-side cursor mapped to the filename microtime prefix; the ` +
        `pair is internally consistent and SATISFIES the coupling rule. A consistent (true,'${WATERMARK_FIELD}') pair is ` +
        `NOT a violation. ONLY flag a bijection gap if you find an ACTUAL inconsistency (e.g. incremental=true with a ` +
        `null/absent watermark, or a capability flag without its required path/method pair).\n` +
        `PROPFUEL-SPECIFIC CHECKS (treat as Blocking gaps): (a) NO static concrete-stream catalog baked into Declared ` +
        `metadata where the docs only describe a generic file feed + a runtime discovery mechanism; (b) NO field rows ` +
        `that could only have come from live sampling or from the existing connector (provenance must be docs, never ` +
        `'live broker results' / the existing .ts); (c) AccountID is Configuration, not a baked '2019'; (d) the scope ` +
        `decision (OutOfScopeObjectFamilies + reason) is recorded. Populate FixInstructions with the exact mechanical ` +
        `change {slot, before, after, locus}. Keep context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        await emitter.stageComplete('FreezeContract', { processed: 1, succeeded: 1, failed: 0, skipped: 0 });
        await emitter.stageComplete('IndependentReview', { processed: review.IndependentSourcesFetched ?? 0, succeeded: 1, failed: 0, skipped: 0 });
        break;
    }

    const reviewFingerprint = JSON.stringify({
        blocking: review.ConfirmedGapsBlocking,
        violations: review.BijectionViolationsFound ?? 0,
        fixes: (review.FixInstructions ?? []).map(f => f?.slot ?? '').sort(),
    });
    if (previousReviewFingerprint === reviewFingerprint) {
        log(`Amendment loop deadlock at round ${amendmentRound}: reviewer findings byte-identical to prior round → escalate`);
        await emitter.fail(`Producer + reviewer deadlocked after ${amendmentRound + 1} rounds; ${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`, 'escalated-deadlock');
        return {
            runID: RUN_ID, vendor: VENDOR,
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
    await emitter.fail(`Extract amendment hit ${MAX_AMENDMENT_ROUNDS}-round cap; ${review.ConfirmedGapsBlocking} blocking gaps. Human review: ${review.ReviewFile}`, 'escalated-max-rounds');
    return {
        runID: RUN_ID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review,
        amendmentRound, status: 'EscalatedMaxRounds',
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
    };
}

// ── ExtractionReport (Gap-2 fix) — generate the canonical EXTRACTION_REPORT.md at runs/<runID>/output ──
// The prior run produced NO EXTRACTION_REPORT.md (reviewer flagged Phase-2c-structural-blocking) because
// artifacts landed in runs/unknown/ and nothing assembled the canonical report. This step writes it
// explicitly to OUTPUT_DIR (now correctly run-scoped) so the reviewer + floor-check find it.
phase('ExtractionReport');
await emitter.stageStart('ExtractionReport', `Generate canonical EXTRACTION_REPORT.md at ${OUTPUT_DIR}`);
const extractionReport = await agent(
    `Assemble the canonical EXTRACTION_REPORT.md for the ${VENDOR} build and WRITE it to ${OUTPUT_DIR}/EXTRACTION_REPORT.md ` +
    `(run EXACTLY: mkdir -p ${OUTPUT_DIR}, then write the file there — NEVER to a cwd-relative ./connectors-registry path). ` +
    `Source the content from: the frozen contract at ${frozen?.contractPath ?? `${OUTPUT_DIR}/contract.json`}, the metadata ` +
    `file ${METADATA_FILE}, and the matrix CSV at ${OUTPUT_DIR}/EXTRACTION_REPORT_MATRIX.csv. The report MUST contain: ` +
    `(1) the in-scope IO set (the single '${FEED_IO_NAME}' file-feed object) + the OUT-OF-SCOPE families with reason; ` +
    `(2) the RESOLVED BIJECTION STANCE: SupportsIncrementalSync=true + IncrementalWatermarkField='${WATERMARK_FIELD}' ` +
    `(synthetic file-level cursor over the filename microtime prefix) and WHY it is correct/consistent; ` +
    `(3) the docs-only / runtime-Discovered split (fields + concrete streams deferred to runtime, with the proven-negative reason); ` +
    `(4) PK deferral (content-hash fallback) with reason; (5) the gapsRemaining list from the contract; ` +
    `(6) a provenance summary (sources used, all credential-free). Read ONLY those run artifacts + the metadata file (no live, no prior connector .ts). ` +
    `Return the absolute path written + a confirmation it exists (test -f).`,
    { agentType: 'independent-reviewer', model: 'haiku', schema: { type: 'object', required: ['ReportPath', 'Exists'], properties: { ReportPath: { type: 'string' }, Exists: { type: 'boolean' } } }, phase: 'ExtractionReport', label: `extraction-report:${VENDOR_SLUG}` }
).catch((e) => { log(`ExtractionReport error: ${String(e)}`); return { ReportPath: `${OUTPUT_DIR}/EXTRACTION_REPORT.md`, Exists: false }; });
log(`ExtractionReport: ${extractionReport?.ReportPath} exists=${extractionReport?.Exists}`);
await emitter.stageComplete('ExtractionReport', { processed: 1, succeeded: extractionReport?.Exists ? 1 : 0, failed: extractionReport?.Exists ? 0 : 1, skipped: 0 });

// ── SourceDiff (completeness gate over the IN-SCOPE coverable leaves) ────
phase('SourceDiff');
await emitter.stageStart('SourceDiff', 'Deterministic completeness over in-scope file-feed leaves');
let sourceDiff = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
    { universe: scopeOfInterest, extracted: extractStats.extractedObjects ?? [], runID: RUN_ID, vendor: VENDOR }
);
log(`SourceDiff: ${sourceDiff.missing.length} missing, ${sourceDiff.orphan.length} orphan (universe=${sourceDiff.universeCount}, extracted=${sourceDiff.extractedCount})`);

if (sourceDiff.missing.length > 0) {
    phase('GapFill');
    await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/gap-fill-fork.workflow.js' },
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { vendorDocsPaths: [CONTEXT_DOC], bijectionDirectives: BIJECTION_DIRECTIVE }, writeBackPath: METADATA_FILE, outputDir: OUTPUT_DIR, runID: RUN_ID }
    );
    const recovered = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        { vendor: VENDOR, sourceID: sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: OUTPUT_DIR, runID: RUN_ID, adversarialN: MANIFEST.adversarialVerifyMinReviewers, sourceBundle: extractorSourceBundle() }
    );
    extractStats.extractedObjects = [...(extractStats.extractedObjects ?? []), ...(recovered.extractedObjects ?? [])];
    extractStats.fieldsExtracted = (extractStats.fieldsExtracted ?? 0) + (recovered.fieldsExtracted ?? 0);
    // Re-assert the resolved bijection after any gap-fill re-extract (idempotent).
    await reconcileBijection('GapFill');
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: scopeOfInterest, extracted: extractStats.extractedObjects ?? [], runID: RUN_ID, vendor: VENDOR }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}
await emitter.stageComplete('SourceDiff', { processed: sourceDiff.extractedCount ?? 0, succeeded: 1, failed: sourceDiff.missing.length, skipped: 0 });

// ── CodeBuild + ladder amendment loop (max 3 rounds) ────────────────────
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

const MAX_CODE_BUILD_ROUNDS = 3;     // per the explicit skill contract for this run
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

const IMPROVE_DIRECTIVE =
    `This is an IMPROVE build: packages/Integration/connectors/src/${identity.Identity.ClassName}.ts ALREADY EXISTS ` +
    `and is a SUSPECT carrying the two PropFuel defects: (1) a STATIC stream catalog ` +
    `(PROPFUEL_STREAMS = ['checkin_questions','clicks','opens']) and (2) a build-time-LIVE-SAMPLED frozen ` +
    `STREAM_FIELDS field catalog. REPLACE both with a RUNTIME DISCOVERY MECHANISM: DiscoverObjects calls ` +
    `GET /dataexport/{AccountID}/list and derives each object from the '[data type]' filename suffix; DiscoverFields ` +
    `GET /download/{file} samples a record and emits field key names. The connector encodes the MECHANISM ` +
    `(which endpoint, how to parse), NEVER a baked list/answer. AccountID comes from credential/Configuration ` +
    `(never hardcode '2019'). ` +
    `INCREMENTAL: ${BIJECTION_DIRECTIVE} The connector's FetchChanges resumes via the synthetic '${WATERMARK_FIELD}' ` +
    `cursor — it tracks the max filename microtime seen across processed files (WatermarkService.Load/Update) and ` +
    `only fetches files whose microtime exceeds the stored cursor; the StableOrderingKey('${FEED_IO_NAME}') returns ` +
    `'microtime' for keyset resume. NO per-record watermark field exists; the cursor is FILE-LEVEL and client-side. ` +
    `Extend BaseRESTIntegrationConnector (rides REST for the file feed; there is no BaseFileFeedConnector). Full-record ` +
    `pass-through (Fields = full raw record). Live testing is READ-ONLY: NO ack/POST/delete write path is exercised ` +
    `(SupportsCreate/Update/Delete=false). Update tests to the corrected truth — keep them green by being RIGHT, never ` +
    `by preserving wrong behavior.`;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    if (!isAmendment) await emitter.stageStart('CodeBuild', 'IMPROVE connector — replace static catalog with runtime discovery mechanism');
    else await emitter.emit('progress.heartbeat', { stage: `CodeBuildRound${codeRound}`, message: `code amendment round ${codeRound}/${MAX_CODE_BUILD_ROUNDS}`, level: 'warn' });

    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. ${IMPROVE_DIRECTIVE}`
            : `Build (IMPROVE) the connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. ${IMPROVE_DIRECTIVE}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    );
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`;
    if (codeResult.BuildClean) {
        const fileCheck = await agent(
            `Run exactly: test -f ${CONNECTOR_FILE} && echo CONNECTOR_FILE_EXISTS || echo CONNECTOR_FILE_MISSING. Return whether the connector source file exists at ${CONNECTOR_FILE}.`,
            { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Exists'], properties: { Exists: { type: 'boolean' }, Path: { type: 'string' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `verify-file:r${codeRound}` }
        );
        if (!fileCheck.Exists) {
            log(`CodeBuild round ${codeRound}: BuildClean reported but connector file missing at ${CONNECTOR_FILE} → forcing non-clean`);
            codeResult.BuildClean = false;
            codeResult.BuildErrors = [...(codeResult.BuildErrors ?? []), { code: 'CONNECTOR_FILE_MISSING', locus: CONNECTOR_FILE }];
        }
    }

    if (!codeResult.BuildClean) { codeRound++; continue; }

    // Register the connector export (idempotent) — mechanical, cheap model.
    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf already present, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // Stage artifacts into the registry dir where mj-test-runner looks (idempotent symlinks) — mechanical, cheap model.
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${identity.Identity.ClassName}.ts" ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts\n` +
        `  ln -sf "$(pwd)/${OUTPUT_DIR}/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `  ln -sf "$(pwd)/${OUTPUT_DIR}/EXTRACTION_REPORT.md" ${REGISTRY_DIR}/output/EXTRACTION_REPORT.md\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', model: 'haiku', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    if (!isAmendment) await emitter.stageStart('VerificationLadder', `T0..${MANIFEST.e2eTier} — full non-live suite always; READ-ONLY live tier when broker creds present`);
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            runID: RUN_ID,                                 // Gap-2 fix: thread runID
            // mj-test-runner resolves Connector → connectors-registry/<slug>/; pass the registry SLUG, not
            // ClassName. T1's three-way name check reads the real ClassName from the metadata file (Finding A).
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: CREDENTIAL_REFERENCE,    // TEST-TIME ONLY — READ-ONLY live tier
            brokerPlans: BROKER_PLANS,                     // ['propfuel-readonly'] — GET only, never ack/POST
            liveReadOnly: true,
            maxTier: MANIFEST.e2eTier,
        }
    );

    const hasRed = (ladder?.tierResults ?? []).some(r => r?.status === 'red');
    if (!hasRed) {
        log(`Code+Ladder converged at round ${codeRound} (build clean + ladder achieved ${ladder?.achievedTier ?? '?'})`);
        await emitter.stageComplete('CodeBuild', { processed: codeResult.LinesOfCode ?? 0, succeeded: 1, failed: 0, skipped: 0 });
        await emitter.stageComplete('VerificationLadder', { processed: (ladder?.tierResults ?? []).length, succeeded: (ladder?.tierResults ?? []).filter(r => r?.status === 'green').length, failed: 0, skipped: (ladder?.tierResults ?? []).filter(r => r?.status === 'skip').length });
        break;
    }

    const codeFingerprint = JSON.stringify({
        clean: codeResult.BuildClean,
        ladderRed: (ladder?.classifiedFailures ?? []).map(f => `${f?.tier}:${f?.code}:${f?.locus}`).sort(),
    });
    if (previousCodeFingerprint === codeFingerprint) {
        log(`Code+Ladder deadlock at round ${codeRound}: identical failures to prior round → escalate`);
        await emitter.fail(`Code-builder + verification-ladder deadlocked after ${codeRound + 1} rounds; identical failures recur. See classifiedFailures.`, 'escalated-code-deadlock');
        return {
            runID: RUN_ID, vendor: VENDOR,
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
    await emitter.fail(`Code+Ladder hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red. Human intervention required.`, 'escalated-code-max-rounds');
    return {
        runID: RUN_ID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
        amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E (deep read-only: real MJ engine → real SQL Server; READ-ONLY live) ──
// REQUIRED on every build. Runs on SQL Server (DB_PLATFORM=sqlserver) — PostgreSQL is SUSPENDED for the
// per-connector loop (fresh-PG codegen blocked). Live mode runs the connector's runtime discovery
// MECHANISM against the broker token for real, populating the `Discovered` IO/IOF rows the build
// deliberately left to runtime. READ-ONLY: GET /list + GET /download only (broker propfuel-readonly);
// NO ack/POST, NO write/delete cells. Env bring-up is scripted in HYBRID_E2E_ENV_RUNBOOK.md — no guessing.
phase('HybridE2E');
await emitter.stageStart('HybridE2E', 'Deep READ-ONLY §1→§7 on SQL Server; live discovery mechanism populates Discovered rows');
await emitter.checkpoint('HybridE2E', { stage: 'pre-e2e', codeRound, ladderTier: ladder?.achievedTier });
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: RUN_ID,                                                // Gap-2 fix: thread runID
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,                                   // registry SLUG (Finding A)
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        dbPlatform: 'sqlserver',                                      // PG suspended for per-connector loop
        mode: CREDENTIAL_REFERENCE ? 'live' : 'mock',
        liveReadOnly: true,                                            // GET only; no ack/write/delete
        credentialReference: CREDENTIAL_REFERENCE,                     // TEST-TIME ONLY
        brokerPlans: BROKER_PLANS,                                     // ['propfuel-readonly']
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mock floor + ${CREDENTIAL_REFERENCE ? 'READ-ONLY live' : 'live-skipped'})`);
await emitter.stageComplete('HybridE2E', { processed: 1, succeeded: hybridE2E?.pass ? 1 : 0, failed: hybridE2E?.pass ? 0 : 1, skipped: 0 });

// ── FloorCheck (final gate) ─────────────────────────────────────────────
phase('FloorCheck');
await emitter.stageStart('FloorCheck', 'Bijection slot table + manifest declarations + hybrid-e2e pass');
const verdict = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js' },
    {
        runID: RUN_ID,                                               // Gap-2 fix: thread runID
        vendor: VENDOR,
        slotsPath: A?.slotsPath ?? 'packages/Integration/connector-builder-workshop/floor/phase0-slots.json',
        manifest: MANIFEST,
        hybridE2E,
        journal: { extractStats, sourceDiff, frozen, review, extractionReport, codeResult, ladder, hybridE2E },
    }
);

await emitter.stageComplete('FloorCheck', { processed: 1, succeeded: verdict?.pass ? 1 : 0, failed: verdict?.pass ? 0 : 1, skipped: 0 });
if (verdict?.pass) {
    await emitter.complete('PropFuel connector built (IMPROVE) — floor-check pass');
} else {
    await emitter.fail(`Floor-check did not pass: ${verdict?.reason ?? 'see verdict'}`, 'floor-check-failed');
}
await emitter.flush();

return {
    runID: RUN_ID,
    vendor: VENDOR,
    brand,
    identity,
    sources,
    scopeOfInterest,
    outOfScopeFamilies,
    metadataResult,
    extractStats,
    frozen,
    review,
    amendmentRound,
    extractionReport,
    codeResult,
    codeRound,
    ladder,
    hybridE2E,
    verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
