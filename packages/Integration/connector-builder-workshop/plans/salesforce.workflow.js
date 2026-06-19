// PER-VENDOR WORKFLOW — Salesforce (credential-free [B] run, bidirectional REST, IMPROVE build)
//
// Emitted by the ConnectorCreator planner from _TEMPLATE.workflow.js. All locked-primitive
// signatures, both amendment loops, EnvPreflight (S0), RealityProbe (S7) + ProbeAmend, the
// freeze gate, and the bijection floor-check are preserved verbatim from the template. Only the
// per-vendor knobs + agent prompts are customized:
//
//   * vendorShape = REST+OpenAPI-ish (Salesforce ships a published Postman "Platform APIs"
//     collection + atlas REST docs + the full sObject Object Reference; NO single OpenAPI file,
//     so SourceAudit ranks the Postman collection + object-reference as the machine-readable
//     enumeration tier).
//   * authPattern = oauth2 (Connected App: authorization-code + client-credentials/JWT-bearer
//     web-server flows). Credential-free here → auth is documented, not exercised live.
//   * e2eTier = T8 (the credential-free live CEILING). T8 does NOT gate the non-live suite —
//     schema/contract validation, mock-server-from-spec, Postman replay, endpoint/header probing,
//     and bijective completeness all run to full applicable extent.
//   * HybridE2E LIVE is SKIPPED (no credential) with a logged skipReason — NOT mock-dodged into
//     a fake green. The floor records the residual gap honestly.
//
// 🚨 SALESFORCE = THE CANONICAL ANTI-OVERFIT VENDOR. The famous failure is declaring 11 of 1,694
// objects. The object universe is the ENUMERATED universe from the source's machine-readable model
// — NOT a famous-object list. Credential-free, the universe = the standard sObjects enumerated in
// the published Object Reference + Postman collection (object_reference.txt enumerates the full
// standard catalog); the FULL per-tenant gamut (incl. custom __c objects, 1,694+ on a real org) is
// reached at RUNTIME via the connector's own DiscoverObjects against the global describe / sObjects
// catalog. So: model the standard sObject CRUD/query surface DEEPLY from the docs (Declared), encode
// the describe-based discovery MECHANISM in code (Discovered at runtime), set DiscoveryIsAuthoritative
// => true (the global describe returns the complete credentialed gamut), and DO NOT bake a famous
// subset. A thin declared emission (declared ≪ enumerated standard objects) is THE bug to reject.
//
// 🚨 IMPROVE BUILD. packages/Integration/connectors/src/SalesforceConnector.ts ALREADY EXISTS
// (~2414 LOC, currently bakes ~9 famous objects as static catalog constants). IMPROVE ≠ trust-and-
// tweak: the existing emission is a SUSPECT. Re-derive the standard-object schema/keys/FKs/lifecycle
// from object_reference.txt + the REST docs INDEPENDENTLY of what the connector claims, DIFF the
// existing against that re-derived truth, and fix EVERY divergence with proof. Preserve only where
// re-derivation CONFIRMS; the baked famous static catalog is the prime suspect for thin-emission.

export const meta = {
    name: 'salesforce-build',
    description: 'Workshop dynamic-workflow build for Salesforce — credential-free [B] bidirectional REST connector. IMPROVE build (existing connector is a suspect). Anti-overfit: enumerate the FULL standard sObject catalog from credential-free docs, runtime-describe for the per-tenant gamut. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Connector-nature study: Salesforce FULL surface (sObject families, OAuth model, BIDIRECTIONAL read+write, SOQL/pagination/incremental, governor/rate limits, what-else: Bulk/Composite/Metadata/B2C-Commerce). WriteCapability + custom-field findings BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots; CredentialTypeID match-or-create against the OAuth2 ConnectionConfig key shape.' },
        { title: 'SourceAudit', detail: 'Rank Postman Platform-APIs collection + Object Reference + atlas REST docs. TaxonomyLeaves = the ENUMERATED standard sObject catalog (script over object_reference.txt), NOT a famous subset.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (universalPK=Id hint, OutOfScopeObjectFamilies for Bulk/Metadata/B2C-Commerce, DiscoveryIsAuthoritative rationale).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline over the FULL standard catalog (verify + write-back). Bidirectional: per-operation sObject-row CRUD columns. Re-derive independently (IMPROVE).' },
        { title: 'IndependentReview', detail: 'ONE round, refocused charter (coverage-vs-script / bijection / capability-honesty / naming / anti-overfit thin-emission). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): credential-free → unauthenticated per-claim status probe (401/403=path real+auth-gated, 404=path wrong) over sObject row/describe/query endpoints + OAuth token endpoint + pagination param form. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'IMPROVE the SalesforceConnector class + tests: replace baked famous-subset catalog with full-Declared + describe-based discovery MECHANISM; TransformRecord strips the `attributes` blob via ExcludedSourceKeys; DiscoveryIsAuthoritative => true. Fixtures descend from reality (probe captures / vendor-published) — provenance-tagged.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: contract validation, mock-server-from-spec, Postman replay, endpoint/header probing, bijective completeness.' },
        { title: 'HybridE2E', detail: 'No credential → LIVE SKIPPED with logged skipReason (NOT mock-dodged). Live §1→§7 SQL-Server e2e requires a broker credential which this [B] run does not have.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, capability-honesty, env-preflight, anti-overfit thin-emission, scope-justified). e2eTier=T8 ceiling recorded honestly; e2e-mock-dodge N/A (creds absent). Verdict states the EMPIRICAL/LINT split.' },
    ],
};

// Normalize args FIRST (the model→Workflow-tool path delivers a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'salesforce';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    // T8 is the credential-free LIVE CEILING for this [B] run. It RECORDS the ceiling; it does NOT
    // gate which non-live techniques run — the full applicable non-live suite runs regardless.
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};

// ── Progress narration shim (runtime log() only — NO imports; sandboxed context) ──────────────
// The Workflow runtime evaluates plan scripts in a SANDBOXED context that does NOT resolve ESM
// package imports — a top-level `import` of the on-disk emitter throws before phase('EnvPreflight')
// is even reached. So narrate via the provided log() with a log-forwarding shim whose method
// signatures match @memberjunction/integration-progress-artifacts (the real on-disk emitter is the
// sub-agents' job). counts not adjectives; never a secret/PII; flush before return.
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
emitter.runStart(`Build ${VENDOR} — credential-free [B], maxTier ${MANIFEST.e2eTier} (IMPROVE; live e2e SKIPPED — no broker credential)`);

// ── EnvPreflight (S0 — v2 P7) ────────────────────────────────────────
phase('EnvPreflight');
emitter.stageStart('EnvPreflight', 'Deterministic env finder: stale nested integration dists, generated-tree churn, turbo dist staleness, MJAPI boot, DB reachability');
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
    `   It scans stale nested @memberjunction/integration-* dists (the GZ #31 silent-kill class — a stale nested schema-builder dist disables custom-column capture framework-wide), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 11 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
emitter.stageComplete('EnvPreflight', { processed: 1, succeeded: envPreflight.ok ? 1 : 0, failed: envPreflight.ok ? 0 : 1, skipped: 0 });
// Operator ACCEPTED generated-tree churn for this run (build-connector intake 2026-06-14:
// "we don't care about the generated files"). Codegen output on this feature branch is expected
// and not attributable to a clean-HEAD run, so generated-tree churn is downgraded to a logged
// WARNING — it no longer aborts. The HARD blockers remain: stale nested @memberjunction/
// integration-* dists (GZ #31), stale turbo dist (#13), and an unreachable DB. (mjapiBootable is
// NOT a hard blocker here — the [B] non-live suite does not require a running MJAPI, and the agent
// coerces an un-probed null to false.)
if (!envPreflight.generatedTreeClean) {
    log('EnvPreflight: generated-tree churn ACCEPTED by operator — downgraded to warning, NOT blocking.');
}
const envBlocking =
    (envPreflight.staleNestedDists ?? []).length > 0 ||
    envPreflight.turboDistFresh === false ||
    envPreflight.dbReachable === false;
if (envBlocking) {
    await emitter.fail('EnvPreflight hard blocker (stale nested dist / stale turbo dist / DB unreachable); aborting before any build stage', 'env-preflight-failed');
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch (connector-nature study — independent of the provided context) ──
phase('BrandResearch');
emitter.stageStart('BrandResearch', 'Independent connector-nature study: full Salesforce surface, OAuth, bidirectional capability, what-else');
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
        WriteCapability: { type: 'object' },   // BINDING (v2 P5): proven create/update/delete on the sObject row resource
        CustomFieldFindings: { type: 'object' },
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Connector-nature study for "${VENDOR}" — establish the REAL, FULL surface from INDEPENDENT public discovery, NOT capped by the provided context (which lists general REST docs + a Platform-APIs Postman collection + one B2C-Commerce link; those are a non-exhaustive helper + a SCOPE signal).\n` +
    `Determine: (a) the sObject object families (CRM core, service, marketing, platform, custom __c) and that the object universe is the ENUMERATED catalog (the famous 11-object failure is the thing to avoid); (b) the OAuth2 Connected App model (authorization-code, client-credentials, JWT-bearer web-server flows) + the instance/login host model; (c) WRITE capability — Salesforce is RICH BIDIRECTIONAL: prove create/update/delete via the sObject row resource (POST /sobjects/{Type}, PATCH/DELETE /sobjects/{Type}/{Id}) — this is BINDING, do NOT plan pull-only; (d) pagination (query/queryMore nextRecordsUrl), incremental signal (SystemModstamp / LastModifiedDate, getUpdated/getDeleted), governor/rate limits; (e) WHAT ELSE the system exposes that is OUT OF SCOPE for the standard CRUD/query connector (Bulk API 2.0, Composite/Batch, Metadata/Tooling API, B2C Commerce) — record as ObjectFamilies + a ScopeReason so the scope decision is KNOWING. Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);
emitter.stageComplete('BrandResearch', { processed: (brand.ObjectFamilies ?? []).length, succeeded: (brand.ObjectFamilies ?? []).length, failed: 0, skipped: 0 });

// ── Identity ─────────────────────────────────────────────────────────
phase('Identity');
emitter.stageStart('Identity', 'Fill Integration identity slots; resolve CredentialTypeID (OAuth2 match-or-create)');
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (Salesforce). Read SOURCE_STUDY when ready. ClassName is SalesforceConnector (an existing class — this is an IMPROVE build). Resolve CredentialTypeID via match-or-create against the OAuth2 Connected App ConnectionConfig key shape (client_id/client_secret/instance_url/refresh_token or JWT key). Emit the universalPK Configuration hint { fieldName: 'Id' } ONLY because Salesforce authoritatively documents the 18-char Id as the system primary key of every sObject (object_reference + REST docs) — this is the rare authoritatively-documented universal PK.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    await emitter.fail(`Identity stage produced ${identity.Status}`, 'identity-escalation');
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}

// ── SourceAudit ──────────────────────────────────────────────────────
phase('SourceAudit');
emitter.stageStart('SourceAudit', 'Rank Postman + Object Reference + REST docs; enumerate the FULL standard sObject catalog via a script (anti-overfit)');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } },
        Gaps: { type: 'array' },
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        EnumerationStdoutCount: { type: 'integer' },   // scope-sanity anchor: declared universe vs enumerated
        scopeDecision: { type: ['object', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Sources already on disk under ${REGISTRY_DIR}/sources/: object_reference.txt (~8MB — the FULL standard sObject Object Reference), api_rest.txt (the atlas REST guide), sobject_index.html, plus the published Salesforce Platform-APIs Postman collection. Build SOURCE_STUDY.md with COVERABLE vs INFORMATIONAL split.\n` +
    `🚨 ANTI-OVERFIT — THE OBJECT UNIVERSE IS A SCRIPT'S OUTPUT, NOT AN AGENT LISTING. Do NOT eyeball a famous subset (the 11-of-1694 failure). WRITE/RUN a script over object_reference.txt + sobject_index.html that ENUMERATES every standard sObject the credential-free docs expose; TaxonomyLeaves = that enumerated standard catalog. Report EnumerationStdoutCount = the script's stdout count so the floor can compare declared-vs-enumerated. The per-tenant FULL gamut (custom __c, the 1,694+ on a real org) is NOT credential-free-knowable — it is reached at RUNTIME via the connector's DiscoverObjects (global describe / sObjects); record that explicitly in the scope decision (in-scope: standard sObject CRUD/query, modeled deeply; out-of-scope-for-Declared-but-runtime-discovered: custom objects; out-of-scope entirely: Bulk/Metadata/Tooling/B2C-Commerce — with reason).`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);
emitter.stageComplete('SourceAudit', { processed: (sources.TaxonomyLeaves ?? []).length, succeeded: (sources.TaxonomyLeaves ?? []).length, failed: 0, skipped: 0 });
log(`SourceAudit: ${(sources.TaxonomyLeaves ?? []).length} taxonomy leaves; enumeration stdout count=${sources.EnumerationStdoutCount ?? '?'}`);

// audit-source primitive re-ranks via the rubric — sources.SourcesFile is the input
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── MetadataWrite ────────────────────────────────────────────────────
phase('MetadataWrite');
emitter.stageStart('MetadataWrite', 'Integration row non-identity slots + Configuration JSON (universalPK, OutOfScopeObjectFamilies, DiscoveryIsAuthoritative rationale)');
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata.\n` +
    `Configuration MUST record: universalPK={fieldName:'Id'} (authoritatively documented); OutOfScopeObjectFamilies = the study's out-of-scope families (Bulk API 2.0, Composite/Batch, Metadata/Tooling API, B2C Commerce) WITH the reason ("clients consume the standard sObject CRUD/query surface; these are rich-but-out-of-scope for this connector and a future build can expand without re-discovering"); the rationale that DiscoveryIsAuthoritative=true is justified (the global describe / sObjects endpoint returns the COMPLETE credentialed gamut, so a comprehensive refresh may safely deactivate dropped objects). Batch limits (BatchMaxRequestCount/BatchRequestWaitTime) only if a Tier-1 source states the governor/rate limit explicitly; else leave null (provable-only).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);
emitter.stageComplete('MetadataWrite', { processed: metadataResult.FieldsPopulated ?? 0, succeeded: metadataResult.FieldsPopulated ?? 0, failed: 0, skipped: metadataResult.FieldsDeferredAsGaps ?? 0 });

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

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    if (isAmendment) {
        emitter.emit('progress.heartbeat', { stage: phaseLabel, message: `amendment round ${amendmentRound}/${MAX_AMENDMENT_ROUNDS}: ${review.ConfirmedGapsBlocking} blocking gaps`, level: 'warn' });
    } else {
        emitter.stageStart('IOIOFExtract', `Extract IO/IOF over the FULL standard sObject catalog (${(sources.TaxonomyLeaves ?? []).length} leaves); bidirectional per-operation CRUD; IMPROVE re-derive`);
    }
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
            // Scope decision threaded so the floor's scope-justified-thin gate sees a KNOWING scope.
            scopeOfInterest: sources.TaxonomyLeaves,
            outOfScopeFamilies: (brand.ObjectFamilies ?? []).filter(f => /bulk|composite|metadata|tooling|commerce/i.test(String(f))),
            scopeReason: brand.ScopeReason ?? 'In-scope: standard sObject CRUD/query, modeled deeply from credential-free docs. Per-tenant custom objects → runtime DiscoverObjects (auth-gated describe). Bulk/Metadata/Tooling/B2C-Commerce → out of scope, recorded for a future build.',
            // Salesforce-specific extraction guidance for the producer:
            extractionHints: {
                bidirectional: true,                          // SupportsWrite=true on createable/updateable sObjects
                writePerOperation: {                          // generic sObject row resource CRUD
                    createAPIPath: '/services/data/v{version}/sobjects/{Type}', createMethod: 'POST',
                    createBodyShape: 'flat', createIDLocation: 'body',          // {id, success, errors}
                    updateAPIPath: '/services/data/v{version}/sobjects/{Type}/{Id}', updateMethod: 'PATCH',
                    updateBodyShape: 'flat', updateIDLocation: 'path',
                    deleteAPIPath: '/services/data/v{version}/sobjects/{Type}/{Id}', deleteMethod: 'DELETE', deleteIDLocation: 'path',
                },
                universalPK: { fieldName: 'Id' },             // authoritatively documented
                incrementalWatermarkField: 'SystemModstamp',  // documented incremental cursor (per sObject; verify per-object)
                paginationType: 'Cursor',                     // query → nextRecordsUrl/queryMore
                attributesBlob: 'attributes',                 // strip via TransformRecord/ExcludedSourceKeys — note for code-builder
            },
            // Multi-source PK/FK detection inputs (credential-free sources ONLY — NEVER the existing
            // connector/dist/metadata; reading output is the circular-source defect). The existing
            // connector is critiqued by the reviewer, NOT used as an extraction source.
            sourceBundle: {
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [`${REGISTRY_DIR}/sources/object_reference.txt`, `${REGISTRY_DIR}/sources/api_rest.txt`],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? review.FixInstructions : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);
    if (!isAmendment) emitter.stageComplete('IOIOFExtract', { processed: extractStats.objectsExtracted ?? 0, succeeded: extractStats.objectsExtracted ?? 0, failed: 0, skipped: (extractStats.gapsRemaining ?? []).length });
    emitter.checkpoint(phaseLabel, { stage: phaseLabel, amendmentRound, objectsExtracted: extractStats.objectsExtracted ?? 0, writeBackPath: METADATA_FILE });

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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full Object Reference / Postman collection into your context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the enumerated catalog and read its compact stdout (object/field/zero-field counts) — never parse the source in-context.\n` +
        `SALESFORCE-SPECIFIC CHARTER: (1) ANTI-OVERFIT — if declared object count ≪ the source-auditor's EnumerationStdoutCount (${sources.EnumerationStdoutCount ?? '?'}), that is a thin-emission Confirmed Gap (Blocking); the connector must not bake a famous subset. (2) CAPABILITY HONESTY — every createable/updateable sObject MUST have SupportsWrite=true + its per-operation CRUD columns (Create/Update/Delete path+method+bodyShape+IDLocation); a write-capable vendor declared pull-only is Blocking. (3) BIJECTION + naming + FK target plausibility on a SAMPLE of ~15 emitted fields (read the metadata file, not the source). (4) IMPROVE CRITIQUE — the existing SalesforceConnector.ts is a SUSPECT: if the re-derived catalog disagrees with what a baked static catalog would have produced, the re-derived truth wins. Any zero-field object, thin-emission, capability-dishonesty, or bijection violation → Confirmed Gap (Blocking) with exact FixInstructions (slot, before, after, locus). Keep context small.`,
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
        await emitter.fail(`Producer + reviewer deadlocked after ${amendmentRound + 1} rounds; ${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`, 'escalated-deadlock');
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
    await emitter.fail(`Extract amendment hit ${MAX_AMENDMENT_ROUNDS}-round cap; ${review.ConfirmedGapsBlocking} blocking gaps. Human review: ${review.ReviewFile}`, 'escalated-max-rounds');
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
    emitter.emit('progress.heartbeat', { stage: 'GapFill', message: `source-diff did not close: ${sourceDiff.missing.length} standard objects missing → gap-fill-fork`, level: 'warn' });
    await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/gap-fill-fork.workflow.js' },
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { openapiPath: sources.SourcesFile, vendorDocsPaths: [`${REGISTRY_DIR}/sources/object_reference.txt`] }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
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
// Credential-free → degraded unauthenticated per-claim status probe. For Salesforce this still
// verifies a great deal: the OAuth token endpoint shape (login.salesforce.com/services/oauth2/token
// → 400/401 confirms it exists + the documented grant params), the sObject row / describe / query
// REST paths (a 401 confirms path real + auth-gated; 404 = wrong path), and the query pagination
// param form. VERDICTS IN, AUTHORSHIP OUT — never adds objects/fields/paths.
phase('RealityProbe');
emitter.stageStart('RealityProbe', 'Read-only unauthenticated per-claim status probe (no credential): path-real/path-wrong, OAuth endpoint, pagination param form');
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (NavigationBaseURL, or the scheme+host of an APIPath — for Salesforce the credential-free probe targets the documented login/instance host + /services/data and /services/oauth2 paths).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED], 404=wrong, 405=wrong-verb). Salesforce REST is auth-gated, so EXPECT 401s on the sObject/describe/query paths — a uniform 401 table is strong proof the paths + auth scheme the connector targets are real.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);
emitter.stageComplete('RealityProbe', { processed: (realityProbe.verdicts ?? []).length, succeeded: (realityProbe.verdicts ?? []).length - probeWrong.length, failed: probeWrong.length, skipped: 0 });

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    emitter.emit('progress.heartbeat', { stage: 'ProbeAmend', message: `${probeWrong.length} declared claim(s) falsified by reality-probe → ONE amendment round`, level: 'warn' });
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited source; pick the docs-supported alternative the probe confirmed, e.g. a corrected /services/data path, the documented OAuth token path, the right pagination param form). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
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
    if (!isAmendment) emitter.stageStart('CodeBuild', 'IMPROVE SalesforceConnector: full-Declared + describe-discovery MECHANISM, attributes-blob strip, DiscoveryIsAuthoritative, bidirectional CRUD');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `IMPROVE the Salesforce connector class at packages/Integration/connectors/src/SalesforceConnector.ts from the frozen contract at ${frozen.contractPath}. This is an IMPROVE build — the existing class is a SUSPECT: it currently bakes a famous-subset static catalog (~9 objects). REQUIRED corrections, each with proof:\n` +
              `  (1) DO NOT bake a famous catalog in code — the FULL standard catalog lives in the Declared metadata; the connector reads it. Keep/strengthen DiscoverObjects as the runtime MECHANISM that calls the global describe / sObjects endpoint for the per-tenant gamut (custom __c included).\n` +
              `  (2) Set DiscoveryIsAuthoritative => true — the global describe returns the complete credentialed gamut, so comprehensive refresh may safely deactivate dropped objects (reversible).\n` +
              `  (3) Bidirectional: route Create/Update/Delete through the generic per-operation BaseRESTIntegrationConnector CRUD against the sObject row resource (POST /sobjects/{Type}; PATCH/DELETE /sobjects/{Type}/{Id}); Create ID from the {id,success,errors} body via BuildCreatedResult — never hand-construct {Success:true,ExternalID:''}.\n` +
              `  (4) TransformRecord: strip Salesforce's per-record \`attributes\` metadata blob, and declare 'attributes' in ExcludedSourceKeys(objectName) — sanctioned removal, NOT a silent drop; full-record pass-through otherwise preserved.\n` +
              `  (5) Pagination: query → nextRecordsUrl / queryMore (Cursor). Incremental: per-object watermark (SystemModstamp/LastModifiedDate) where the object declares it.\n` +
              `  Write the vitest test file (T4/T5): TestConnection, DiscoverObjects (describe parse), DiscoverFields, generic CRUD via per-operation columns, FetchChanges incremental, NormalizeResponse, TransformRecord attributes-strip. Fixtures descend from reality (probe captures / vendor-published Postman examples) — provenance-tagged.`,
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
    if (!isAmendment) emitter.stageStart('VerificationLadder', `T0..${MANIFEST.e2eTier} credential-free suite: contract validation, mock-server-from-spec, Postman replay, endpoint/header probe, bijective completeness, two-pass idempotency`);
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: VENDOR_SLUG,   // registry SLUG, not ClassName (Finding A — T1 reads ClassName from metadata)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,
            maxTier: MANIFEST.e2eTier,
        }
    );

    const hasRed = (ladder?.tierResults ?? []).some(r => r?.status === 'red');
    if (!hasRed) {
        log(`Code+Ladder converged at round ${codeRound} (build clean + ladder achieved ${ladder?.achievedTier ?? '?'})`);
        emitter.stageComplete('VerificationLadder', { processed: (ladder?.tierResults ?? []).length, succeeded: (ladder?.tierResults ?? []).filter(r => r?.status === 'green').length, failed: 0, skipped: (ladder?.tierResults ?? []).filter(r => r?.status === 'skip').length });
        break;
    }

    const codeFingerprint = JSON.stringify({
        clean: codeResult.BuildClean,
        ladderRed: (ladder?.classifiedFailures ?? []).map(f => `${f?.tier}:${f?.code}:${f?.locus}`).sort(),
    });
    if (previousCodeFingerprint === codeFingerprint) {
        log(`Code+Ladder deadlock at round ${codeRound}: identical failures to prior round → escalate`);
        await emitter.fail(`Code+ladder deadlocked after ${codeRound + 1} rounds; identical failures recur. See classifiedFailures`, 'escalated-code-deadlock');
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
    await emitter.fail(`Code+ladder hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red. Human intervention required`, 'escalated-code-max-rounds');
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder,
        amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap. Connector and/or ladder rungs still failing — human intervention required.`,
    };
}

// ── HybridE2E — LIVE SKIPPED (credential-free [B] run) ───────────────
// HybridE2E proves the connector THROUGH MJAPI into a real SQL Server DB. It runs LIVE only when a
// broker credential exists. This is a [B] credential-free run (credentialReference:null, no broker
// plans), so the LIVE §1→§7 SQL-Server e2e CANNOT run — a real Salesforce org credential belongs to
// a Salesforce CUSTOMER, not to us, and is gated-hard (no self-serve sandbox token usable here).
//
// Per the anti-laziness rule we do NOT mock-dodge this into a fake green: we emit an explicit SKIPPED
// result with a non-empty skipReason. The floor's e2e-mock-dodge gate is N/A because there is no
// credential (credentialReference:null AND brokerPlans:null) — it only fires when creds exist and the
// run dodged to mock. The residual gap (live round-trip completeness, real governor/rate behavior,
// write side-effects) is reported honestly; the credential-free ladder above carries the assurance.
phase('HybridE2E');
const hasCreds = (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0));
let hybridE2E;
if (hasCreds) {
    // Defensive: if a credential WERE injected, run it live (mock cannot satisfy). Not expected on [B].
    emitter.stageStart('HybridE2E', 'LIVE §1→§7 SQL-Server e2e (credential present)');
    hybridE2E = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
        {
            runID: A?.runID, vendor: VENDOR, connectorName: VENDOR_SLUG,
            integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
            mode: 'live', credentialReference: A?.credentialReference ?? null, brokerPlans: A?.brokerPlans ?? null,
        }
    );
} else {
    hybridE2E = {
        pass: null,
        mode: 'skipped',
        skipped: true,
        skipReason: 'No broker credential for this [B] credential-free run; a live Salesforce org credential is customer-owned and gated-hard (no self-serve sandbox token usable here). Live §1→§7 SQL-Server e2e cannot run. NOT mock-dodged — recorded as an honest residual gap; credential-free non-live suite (T0..T8) carries the assurance.',
        livePhaseLog: [],
    };
    emitter.stageComplete('HybridE2E', { processed: 0, succeeded: 0, failed: 0, skipped: 1 });
}
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'}) skipReason=${hybridE2E?.skipReason ? 'set' : 'n/a'}`);

// ── FloorCheck (final gate) ──────────────────────────────────────────
phase('FloorCheck');
emitter.stageStart('FloorCheck', 'Bijection + manifest + v2 EMPIRICAL gates; e2eTier=T8 ceiling recorded; e2e-mock-dodge N/A (no creds)');
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
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null,
            envPreflight,                                    // P7
            realityProbe,                                    // P2
            credentialReference: A?.credentialReference ?? null, // P6 — null here (no mock-dodge possible)
            brokerPlans: A?.brokerPlans ?? null,             // P6 — null here
            brand,                                           // P5 capability-dishonest (brand.WriteCapability)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);
emitter.stageComplete('FloorCheck', { processed: 1, succeeded: verdict?.pass ? 1 : 0, failed: verdict?.pass ? 0 : 1, skipped: 0 });

if (verdict?.pass) {
    await emitter.complete(`${VENDOR} connector built — floor-check pass (credential-free ceiling T8; live e2e SKIPPED — no broker credential)`);
} else {
    await emitter.fail(`${VENDOR} floor-check did not pass — see verdict`, 'floor-check-failed');
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
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
