// fonteva.workflow.js — per-vendor workshop build plan (PLANNER emission)
//
// Vendor:        Fonteva — a Salesforce-native Association Management System (AMS).
// Shape:         salesforce-derivative (managed package; namespace `orderapi__*` custom objects),
//                surfaced via the Salesforce platform REST API (/services/data/vXX/sobjects, query)
//                PLUS Fonteva's own Apex REST domain services (/services/apexrest/FDService/*).
// Auth:          oauth2-authcode (Salesforce web-server OAuth2; Bearer session token). Credential-free [B] run.
// Build mode:    COMPOSE — Fonteva is a Salesforce managed package, so the connector EXTENDS the
//                existing SalesforceConnector's discovery + transport (OAuth2 bearer, /sobjects/
//                global describe → DiscoveryIsAuthoritative, per-object /describe for fields,
//                nextRecordsUrl pagination, SystemModstamp incremental) rather than re-deriving from
//                scratch. The Fonteva-specific layer = scope the global describe to the managed-package
//                namespace + add the FDService Apex REST domain services as in-scope objects.
// Credential:   NONE (credentialReference=null). Full credential-free non-live suite per PATH 2.
//                RealityProbe DEGRADES to unauthenticated per-claim status probing (401/403=path real
//                + auth-gated, 404=wrong). HybridE2E runs in MOCK mode (spec/fixture, no live calls).
//                Live ceiling RECORDED as format-verified-no-creds; the non-live suite is NOT gated by it.
//
// EMPIRICAL vs LINT split (stated honestly per standing rule 4):
//   EMPIRICAL (real-system info enters): EnvPreflight (real repo/DB/MJAPI probe), RealityProbe
//     (unauthenticated HTTP status probing of the real Salesforce/Fonteva hosts + auth headers),
//     HybridE2E mock-server-from-spec (real SQL Server engine round-trip against a spec-generated mock).
//   LINT (internal consistency only): IndependentReview, T0-T3 invariant/consistency rungs,
//     bijection floor-check, FreezeContract.
//   The final report MUST present this split and MUST NOT launder lint-green as sync-verification.

export const meta = {
    name: 'fonteva-build',
    description: 'Workshop dynamic-workflow build for Fonteva (Salesforce-native AMS, COMPOSE on SalesforceConnector). Credential-free [B] run: full non-live PATH-2 suite, unauthenticated RealityProbe, MOCK HybridE2E. Locked primitives + bijection floor-check. Ceiling = format-verified-no-creds.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (P7): DB reachable @ migration level, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Canonical Fonteva identity + ProductTaxonomy. STUDY the FULL nature (Salesforce-platform AMS: members/accounts, events/registrations, orders/transactions, memberships, communities) independent of context. WriteCapability + custom-field findings BINDING (P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots; CredentialTypeID match-or-create against the Salesforce-OAuth2 ConnectionConfig key shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources (Fonteva dev docs + Salesforce platform REST/Bulk/CDC/Platform-Events docs + restapi.fonteva.io FDService). SCOPE DECISION: Fonteva AMS managed-package object families in-scope; broader Salesforce platform recorded out-of-scope.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (namespace scope, FDService base path, OutOfScopeObjectFamilies + reasons, universalPK hint=Id only if authoritatively documented).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). STATIC catalog only from credential-free docs; the auth-gated describe catalog is a runtime MECHANISM (case-2), NOT baked. adversarialN=2.' },
        { title: 'IndependentReview', detail: 'Up to MAX_AMENDMENT_ROUNDS=3 rounds, refocused charter, SLIM mode. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probing (credential-free). 401/403=path real+gated, 404=wrong; auth/rate headers. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance). Must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'FontevaConnector COMPOSING SalesforceConnector transport/discovery + tests. Fixtures from probe captures / vendor-published, provenance-tagged (P4). max 3 rounds.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (non-live ceiling) + two-pass volatile-field idempotency rung (P3). All rungs credential-free.' },
        { title: 'HybridE2E', detail: 'MOCK mode (credential-free): mock-server-from-spec → real MJ engine → real SQL Server, FRESH DB. Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + EMPIRICAL gates (reality-probe, e2e-mock-dodge[N/A keyless], capability-honesty, env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states EMPIRICAL/LINT split + format-verified-no-creds ceiling.' },
    ],
};

// Normalize args FIRST (the model→Workflow-tool path delivers a JSON string).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'fonteva';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Credential-free [B]: ceiling RECORDS the non-live ceiling; it does NOT gate the non-live suite.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',               // non-live ceiling; live tier never reached (no credential)
    adversarialVerifyMinReviewers: 2,          // token-conscious default; this is not a hard/high-risk shape
};

// ── EnvPreflight (S0 — P7) ───────────────────────────────────────────
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
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch ────────────────────────────────────────────────────
// STUDY the full nature independently (standing rule 1). Fonteva is a Salesforce-native AMS; the
// study establishes the object FAMILIES + auth + read/write/bidirectional capability from public
// discovery, NOT capped by the context. The scope decision happens in SourceAudit/Extract.
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
        ObjectFamilies: { type: 'array', items: { type: 'string' } },   // FULL surface the study found (awareness)
        WriteCapability: { type: ['object', 'null'] },                  // BINDING (P5)
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" — canonical identity AND FULL API nature, INDEPENDENT of the provided context (which is a non-exhaustive helper).\n` +
    `Fonteva is a Salesforce-NATIVE Association Management System (AMS) delivered as a managed package (namespace family like \`orderapi__*\` / \`OS__*\`). Its API surface rides:\n` +
    `  (a) the Salesforce platform REST API — /services/data/vXX/sobjects/ (global describe = authoritative catalog), /sobjects/<O>/describe (fields), /query (SOQL, nextRecordsUrl pagination, SystemModstamp/LastModifiedDate incremental), CRUD POST/PATCH/DELETE, Bulk API 2.0, Change Data Capture + Platform Events; AND\n` +
    `  (b) Fonteva's own Apex REST domain services at /services/apexrest/FDService/* (OrderService, ItemPriceService, JournalService, OrderPaymentService, RecordMatchService, SubscriptionRenewalService, …) querying via id/filter(SOQL)/fields/sort/limit.\n` +
    `Establish the object FAMILIES (members/contacts/accounts, events & registrations, orders/order-lines/items/invoices/payments/transactions, memberships/subscriptions, communities), the auth model (Salesforce OAuth2 web-server / Bearer session), read AND write/bidirectional capability, pagination, incremental signal, and rate limits. Resolve canonical name, description, navigation URL, icon class, ProductTaxonomy. WriteCapability is BINDING — if the study finds documented create/update/delete (FDService POST/PUT/DELETE + Salesforce sObject CRUD), say so; it must not be silently dropped to pull-only. Schema-bound output only.`,
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
    `Fill Integration row identity slots for "${brand.CanonicalName}". Read SOURCE_STUDY when ready.\n` +
    `ClassName convention: FontevaConnector; ImportPath: @memberjunction/integration-connectors.\n` +
    `CredentialTypeID: match-or-create against the Salesforce-OAuth2 ConnectionConfig key shape (Fonteva auth IS Salesforce OAuth2 — instanceUrl + clientId/clientSecret or JWT + refresh/session token). Reuse the existing Salesforce credential type if its key shape matches; create a Fonteva-specific one only if it genuinely differs.\n` +
    `Use the universalPK Configuration hint (Salesforce 'Id' 18-char) ONLY if authoritatively documented for the in-scope objects.`,
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
        VendorDocsPaths: { type: 'array', items: { type: 'string' } },
        SDKPaths: { type: 'array', items: { type: 'string' } },
        PostmanPaths: { type: 'array', items: { type: 'string' } },
        scopeDecision: { type: ['object', 'null'] },
        scopedSubset: { type: 'array', items: { type: 'string' } },
        EnumerationStdoutCount: { type: ['integer', 'null'] },
    },
};
const sources = await agent(
    `Audit + rank authoritative sources for ${brand.CanonicalName} and build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split.\n` +
    `Tier-1 sources (highest priority): the USER_CONTEXT URLs (Fonteva developer docs, restapi.fonteva.io FDService reference, Salesforce platform REST/Bulk2.0/CDC/Platform-Events docs). Validate context claims against independent evidence; reject anything provably wrong.\n` +
    `ENUMERATE the object universe by SCRIPT, never by eyeballing (memory: object-catalog-must-be-script-output) — the Fonteva REST docs (restapi.fonteva.io) and the FDService service list are credential-free + enumerable; the Salesforce managed-package object catalog (orderapi__* describe) is AUTH-GATED and is a RUNTIME discovery MECHANISM, NOT a static catalog (rule 2). Emit EnumerationStdoutCount from the script.\n` +
    `SCOPE DECISION (KNOWING, per the discovery model): the in-scope subset = the Fonteva AMS object families + the FDService domain services (the useful/reachable surface for MJ clients). Record the broader Salesforce-platform surface (arbitrary org sObjects, Tooling/Analytics/Knowledge APIs the SalesforceConnector already covers) as known-but-out-of-scope in scopeDecision with the reason "Fonteva connector scopes to the AMS managed-package + FDService; generic Salesforce-platform breadth is the SalesforceConnector's job (COMPOSE)". Do NOT inflate to the full 1,800-sObject org universe; do NOT under-model to only the context-named services.\n` +
    `Emit TaxonomyLeaves = the leaves of the COVERABLE in-scope taxonomy (the FDService services + the credential-free-documented Fonteva object schemas) as input to extract-iiof-pipeline.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER direct edit).\n` +
    `Configuration JSON keys to set (provable-only): the FDService base path (/services/apexrest/FDService), the Salesforce platform data path (/services/data/v<version>), the managed-package namespace scope for runtime describe filtering, OutOfScopeObjectFamilies (the broader Salesforce-platform breadth) WITH reasons, and BatchMaxRequestCount/BatchRequestWaitTime ONLY if the Salesforce/Fonteva rate-limit docs explicitly state them (else leave null — provable-only). universalPK hint = {fieldName:'Id'} ONLY if the in-scope object schemas authoritatively use the Salesforce 18-char Id as PK.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop) ─────────
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

// MAX_AMENDMENT_ROUNDS = 3 (template floor — _TEMPLATE.workflow.js lines 202-211): the loop guard is
// `while (amendmentRound < MAX_AMENDMENT_ROUNDS)`. With MAX=1 the loop runs round 0 ONLY; on any blocking
// gap, amendmentRound++ → 1 exits the loop straight into EscalatedMaxRounds and the
// isAmendment=(amendmentRound>0) re-dispatch branch (which delivers reviewerFindings to the re-extractor)
// NEVER fires. MAX=3 restores the guarantee: round 0 extract+review, then up to 2 real amendment rounds
// that feed reviewer findings back into the extractor. Deadlock fingerprint preserved as a redundant guard.
const MAX_AMENDMENT_ROUNDS = 3;
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;

// ── RESUME RECOVERY (2026-06-15) — evidence-gated extract-loop bypass ────────────────
// The first run escalated EscalatedMaxRounds on an amendment-ROUTING defect: the reviewer's
// Integration-row fixes (Configuration.OutOfScopeObjectFamilies + PROVENANCE for 4 non-syncable
// payment-gateway DTOs — EPayTransaction/EPayRequest/EPayResponse/PaymentCredentials) were handed to
// the IO-only ioiof-extractor, which cannot write Integration-row Configuration, so the loop never
// converged. The fix was applied out-of-band by the OWNING agents and INDEPENDENTLY PROVEN: the
// dual-derivation reports objectsMissing=[] (32 enumerated = 28 emitted + 4 skipped-with-reason), and
// a fresh different-model independent-reviewer returned ConfirmedGapsBlocking=0. The operator passes
// args.extractPreResolved (set ONLY after that proof) so the converged, frozen contract proceeds to
// CodeBuild on resume instead of replaying the cached escalation. NOT a blind skip — gated on proof.
if (A.extractPreResolved) {
    const pre = A.preResolvedExtract ?? {};
    extractStats = pre.extractStats ?? { objectsExtracted: 28, fieldsExtracted: 672, extractedObjects: pre.extractedObjects ?? [], gapsRemaining: [] };
    frozen = pre.frozen ?? { frozen: true, frozenContractHash: pre.frozenContractHash, contractPath: `${RUNS_DIR}/output/contract.json` };
    review = { ConfirmedGapsBlocking: 0, JudgmentCalls: pre.judgmentCalls ?? 0, BijectionViolationsFound: 0, ReviewFile: `${RUNS_DIR}/output/INDEPENDENT_REVIEW.md` };
    log(`Extract pre-resolved out-of-band (proven gaps=0: dual-derive objectsMissing=[] + fresh different-model reviewer ConfirmedGapsBlocking=0); ${extractStats.objectsExtracted} objects / ${extractStats.fieldsExtracted} fields → CodeBuild`);
}
while (!A.extractPreResolved && amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,                 // in-scope subset, modeled deeply
            outOfScopeFamilies: sources.scopeDecision?.outOfScopeFamilies ?? null,
            scopeReason: sources.scopeDecision?.reason ?? 'Fonteva connector scopes to the AMS managed-package + FDService; generic Salesforce-platform breadth is the SalesforceConnector responsibility (COMPOSE).',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection — CREDENTIAL-FREE sources only (extractor seeds STATIC metadata).
            // NOTE: the connector being built + prior metadata are OUTPUT, not sources. The Salesforce
            // describe catalog is AUTH-GATED → a runtime MECHANISM, never read at build.
            sourceBundle: {
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
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (round ${amendmentRound}). SLIM MODE — do NOT read the full source/SDL into context. Completeness is guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file) for bijection + plausibility. Because this is COMPOSE on the SalesforceConnector, ALSO sanity-check: capability flags (SupportsWrite) match brand.WriteCapability; FDService write paths + methods are co-present per capability; the Salesforce 'Id'/SystemModstamp watermark conventions aren't mis-emitted as fabricated FKs (the access-path-vs-FK anti-overfit rule). Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample.`,
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
            brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
            status: 'EscalatedDeadlock',
            message: `Producer + reviewer deadlocked after ${amendmentRound + 1} attempts; ${review.ConfirmedGapsBlocking} blocking gaps unresolved. Evidence: ${review.ReviewFile}`,
        };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}

if (!A.extractPreResolved && review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} round(s) with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
        status: 'EscalatedMaxRounds',
        message: `Extract amendment hit ${MAX_AMENDMENT_ROUNDS}-round cap; ${review.ConfirmedGapsBlocking} blocking gaps. Human review: ${review.ReviewFile}`,
    };
}

// ── SourceDiff (completeness gate — manifest.sourceDiffMustClose) ────
phase('SourceDiff');
// On the evidence-gated resume bypass the object-set accounting was ALREADY proven closed out-of-band
// (dual-derivation objectsMissing=[], 28 in-scope emitted + 4 skipped-with-reason). The cached
// sources.TaxonomyLeaves still lists the 2 reclassified DTOs, so running compute-source-diff here would
// falsely report them "missing" and re-add them via GapFill. Inject the proven-closed diff instead.
let sourceDiff = A.extractPreResolved
    ? { missing: [], orphan: [], universeCount: (extractStats.extractedObjects ?? []).length, extractedCount: (extractStats.extractedObjects ?? []).length }
    : await workflow(
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

// ── RealityProbe (S7 — P2, EMPIRICAL; DEGRADED unauthenticated mode — credential-free) ───
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
    `This is a CREDENTIAL-FREE [B] run → the script runs the DEGRADED unauthenticated status probe (no token).\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, or the scheme+host of an APIPath). For Fonteva the declared paths are Salesforce instance-relative (/services/data/... and /services/apexrest/FDService/...) — probe against the documented Salesforce login/instance host pattern (e.g. https://login.salesforce.com and the FDService doc host) so the per-claim status check is meaningful.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}  (NO credential → degraded unauthenticated status probe: 200=public, 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong).\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. Expect MOST Salesforce/FDService paths to return 401/403 (gated-exists = path real + auth-gated) — that is the strong credential-free proof the paths + OAuth2 scheme are real; a 404 means the declared path is WRONG and is a falsified verdict. You may NOT add objects/fields/paths (metadataDelta MUST be false) and you may NOT alter the script's verdicts — relay them exactly.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe (a 404 where the declared path should exist):\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Fonteva/Salesforce source; pick the docs-supported alternative the probe confirmed, e.g. the correct /services/data version segment, the correct FDService path casing, the correct sObject API name with managed-package namespace). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop ────────────────
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

// MAX_CODE_BUILD_ROUNDS = 3 (template floor — _TEMPLATE.workflow.js lines 420-423: "3 (was 2): MAX=2 gave
// only ONE amendment round"): round 0 build + up to 2 fix rounds. For a COMPOSE build extending
// SalesforceConnector, round-0 TypeScript errors (import paths, protected member access, type widening)
// are likely, so a single fix attempt is insufficient. Deadlock + max-round escalation preserved.
const MAX_CODE_BUILD_ROUNDS = 3;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes.`
            : `Build the FontevaConnector class from the frozen contract at ${frozen.contractPath}.\n` +
              `COMPOSE on the existing SalesforceConnector (packages/Integration/connectors/src/SalesforceConnector.ts): Fonteva is a Salesforce managed package, so REUSE the Salesforce OAuth2 bearer auth, /services/data/vXX/sobjects/ global describe (DiscoveryIsAuthoritative=true), per-object /describe field discovery, nextRecordsUrl pagination, and SystemModstamp incremental — do NOT re-derive them. The Fonteva-specific code = (1) scope the global describe to the managed-package namespace; (2) add the FDService Apex REST domain services (/services/apexrest/FDService/*) as in-scope objects with their filter/fields/sort/limit query params. Extend BaseRESTIntegrationConnector (or subclass SalesforceConnector if that is the cleaner reuse) per connector-code-conventions. Use generic per-operation BaseRESTIntegrationConnector CRUD via the IO write columns; override only for genuinely idiosyncratic FDService write shapes (and still route create through BuildCreatedResult). NO baked catalog — the object/field set is Declared (docs) + Discovered (runtime describe MECHANISM). Strong typing, no any.`,
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
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf already present, make no change. Do not touch any other line.`,
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
            connectorName: VENDOR_SLUG,                          // registry slug (Finding A — ClassName≠slug deadlocks T1)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null, // null → credential-free rungs only
            maxTier: MANIFEST.e2eTier,                           // T8 non-live ceiling
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
            brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound,
            status: 'EscalatedCodeDeadlock',
            message: `Code-builder + verification-ladder deadlocked after ${codeRound + 1} attempts. Same failures recur. See classifiedFailures.`,
        };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}

if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    return {
        runID: A?.runID, vendor: VENDOR,
        brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound,
        status: 'EscalatedCodeMaxRounds',
        message: `Code+Ladder loop hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red. Human intervention required.`,
    };
}

// ── HybridE2E (MOCK mode — credential-free) ──────────────────────────
// REQUIRED on every build. Runs on SQL Server (NOT Postgres — PG codegen suspended), FRESH DB,
// through the real MJ engine. Credential-free → mode='mock' (mock-server-from-spec + fixtures);
// no live calls. This is the e2e that proves the connector THROUGH MJAPI into a real SQL Server DB
// (ApplyAll → upsert → contentHash → incremental → idempotent) — the in-isolation ladder does NOT.
// Env bring-up fully scripted in HYBRID_E2E_ENV_RUNBOOK.md (only assume the Docker daemon is up).
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // Credential-free: no credentialReference + no brokerPlans → MOCK. (Honest — not an e2e-mock-dodge,
        // since there are genuinely no creds; the floor's e2e-mock-dodge gate only fires when creds EXIST.)
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
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.scopeDecision?.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder, verdict,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
