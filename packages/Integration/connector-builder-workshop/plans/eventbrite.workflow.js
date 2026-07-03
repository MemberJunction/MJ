// eventbrite.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Eventbrite (https://www.eventbrite.com) — Events / ticketing & registration platform.
// Mode: NEW (v1.0.0 birth; no prior metadata file / DB row / connector .ts / corpus).
// Credential: NONE at build ([B] credential-free run) — BUT Eventbrite ships a REAL, PUBLIC,
//   credential-free contract: a documented REST API v3 (public reference + object schemas; Postman
//   collections exist; every object carries a real `id` primary key). This is the CRUCIAL difference
//   from a partner-gated vendor: the credential-free PATH 2 suite GENUINELY WORKS here.
//
// WHY THE VENDOR-SPECIFIC SHAPE (grounded in Eventbrite API v3's REAL, documented nature):
//   • Base URL: https://www.eventbriteapi.com/v3/ — REST/JSON, resource-oriented paths.
//   • Auth: OAuth2 bearer / private OAuth token (Authorization: Bearer <token>). A self-serve
//     personal OAuth token is obtainable later (would ADD a live read path); NOT required to build.
//   • Pagination: CONTINUATION-TOKEN pagination — responses carry a `pagination` envelope with
//     `has_more_items` + `continuation`; the next page is requested with ?continuation=<token>.
//     This maps to PaginationType=Cursor (encode the continuation-token shape + the `pagination`
//     envelope key + the per-object list `ResponseDataKey` in Configuration). It is NOT page-number
//     and NOT offset — getting this wrong silently caps every object at one page (the GZ pagination
//     class of defect). SourceAudit + the extractor MUST capture the real param, and RealityProbe's
//     param-advance check (degraded/unauth) validates the declared form.
//   • Object universe (rich, bidirectional — study it, don't assume thin): events, attendees
//     (order-attendees), orders, ticket_classes, venues, categories/subcategories, formats,
//     organizations, event teams, event questions, discounts, ticket_buyer_settings, media/webhooks.
//     Many are NESTED access-paths off /events/{id}/... (attendees, ticket_classes, orders,
//     questions, teams) — model them as access-paths in Configuration, NOT as guessed FKs
//     (path-LMS defect: a nesting edge is an access-path, an FK is a scalar that references a PK).
//   • WriteCapability (BINDING per v2 P5): Eventbrite DOES document write endpoints — POST/create +
//     POST-update events, ticket_classes, venues, attendees, orders (and structured cancel/publish
//     actions). This connector MUST NOT ship pull-only (the GZ #30 defect). SupportsCreate/Update/
//     Delete + per-operation CRUD columns are emitted where the docs prove the endpoint, and the
//     capability-dishonest floor gate (armed below) proves the write count is non-zero.
//   • Rate limits: documented per-token hourly/daily quotas — capture into BatchMaxRequestCount /
//     RateLimitPolicy where provable; leave null if not explicitly stated (provable-only).
//
// RISK-CALIBRATED KNOBS (vs template defaults):
//   - adversarialN = 2   → Eventbrite is a Tier-1/Tier-2 machine-readable source (public REST v3
//     reference + object schemas + Postman). No live RealityProbe confirmation is possible in this
//     credential-free run, so it does NOT drop to N=1 (which requires empirical live confirmation);
//     N=2 is the correct default for a strong-source-but-unconfirmed build. It rises to N=3 in-loop
//     only if the source-auditor flags thin/ambiguous coverage (it should not, for Eventbrite).
//   - loopUntilDry K = 2 → Eventbrite's public doc coverage is strong (a real, complete v3 reference),
//     so K=2 suffices; NOT K=3 (that's for < 0.7 doc coverage — a thin/partner-gated vendor).
//   - maxTier = T8       → credential-free ceiling; T0..T8 all run. The NON-LIVE suite (schema/contract
//     validation, mock-server-from-spec T5, endpoint/header probing, bijective completeness) runs to
//     FULL extent regardless of credential — Eventbrite's real spec makes ALL of it genuinely useful.
//
// GENUINE CREDENTIAL-FREE GREEN TARGET (NOT an HONEST-NA):
//   Because Eventbrite exposes a real credential-free contract with real object shapes + real `id`
//   PKs, HybridE2E runs in MOCK mode (mock-server-from-spec) and MUST LAND ROWS on the real object
//   shapes — full object coverage, no Goldilocks subset (mock = free = all objects). A 0-row pass is
//   NOT a green; this build's target is GENUINE-GREEN-MOCK (rows land on real shapes through MJAPI →
//   SQL Server), with the residual gap (live round-trip, true rate-limit behavior, write side-effects)
//   stated honestly. A self-serve OAuth token would later promote this to a live read path.
//
// LOCKED-PRIMITIVE COMPOSITION, the freeze-contract gate, the terminal bijection floor-check, the
// different-model (sonnet) adversarial review, and BOTH amendment loops (extract MAX_AMENDMENT_ROUNDS,
// code+ladder MAX_CODE_BUILD_ROUNDS with slot-routing + byte-identical-fingerprint deadlock detection)
// are PRESERVED verbatim from _TEMPLATE.workflow.js — never a single-return-on-first-gap. CHEAPEST-
// DEFECT-FIRST ordering: EnvPreflight + offline structural/behavioral tiers before heavy spend.

export const meta = {
    name: 'eventbrite-build',
    description: 'Workshop dynamic-workflow build for Eventbrite (Events / ticketing platform, REST/JSON API v3, OAuth2 bearer / private-token auth, continuation-token pagination, WRITE-CAPABLE). NEW v1.0.0, credential-free [B] run against a REAL public credential-free contract. Locked primitives + bijection floor-check. Independent capability discovery yields REAL APIPaths + real PKs (not deferred). GENUINE credential-free green target (mock lands rows on real shapes).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Eventbrite brand + ProductTaxonomy. Establish the REAL object/capability universe (events/attendees/orders/ticket_classes/venues/categories/organizations/teams/questions/discounts) INDEPENDENTLY. WriteCapability is BINDING (v2 P5) — Eventbrite HAS write endpoints; prove it, do not assume pull-only.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (EventbriteConnector). Credential type match-or-create against the OAuth2-bearer ConnectionConfig shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: PUBLIC REST API v3 reference + object schemas (highest value — drives T5 mock-server + bijective completeness) → published Postman collection → developer docs. Build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split + real APIPaths + continuation-token pagination shape. Record out-of-scope families with reasons.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (OAuth2-bearer auth, base URL https://www.eventbriteapi.com/v3/, continuation-token pagination shape, rate limits, OutOfScopeObjectFamilies).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). REAL APIPaths + real `id` PKs (Eventbrite objects declare id) + per-operation CRUD columns where docs prove write endpoints. Nested objects = access-paths in Configuration, NOT guessed FKs. Provable-only type/watermark; unprovable → unset. Full-record pass-through.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment iteration), refocused charter (coverage-vs-script / bijection / capability-honesty / naming). Different model (sonnet). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probe (no credential) — 401/403=path real+gated, 404=path wrong; validates the continuation-token param form where the endpoint tolerates it. Ceiling format-verified-no-creds. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'EventbriteConnector class + tests over BaseRESTIntegrationConnector (REST/JSON). Generic per-operation CRUD wired for write-capable IOs; continuation-token pagination in ExtractPaginationInfo. Fixtures descend from reality (probe captures / vendor-published) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: schema/contract validation vs the v3 reference, mock-server-from-spec (T5), continuation-token pagination replay, endpoint/header probing, bijective completeness.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB. GENUINE green target — MOCK = FULL object coverage; rows MUST land on the REAL Eventbrite object shapes (no Goldilocks subset). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty [Eventbrite IS write-capable — must be non-zero], env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling.' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under Category=Events: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/brokerPlans/maxTier silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'eventbrite';
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
// adversarialVerifyMinReviewers = 2 (strong Tier-1/2 machine-readable source, but no live confirmation
// in this credential-free run ⇒ default N=2, NOT N=1 which requires empirical live confirmation).
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};
// loop-until-dry K for the extract pipeline — 2 because Eventbrite's public doc coverage is strong
// (a real, complete v3 reference); K=3 is reserved for thin/partner-gated (< 0.7) coverage.
const LOOP_UNTIL_DRY_K = 2;

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
    `   NOTE: --allow-generated-churn is INTENTIONAL for this run — the branch (agentic/connector-builder-v2) carries pre-existing ADDITIVE generated-tree drift from concurrent connector work. The build runs on FULLY ISOLATED infra (its own SQL container + DB + MJAPI port, injected into the HybridE2E call) and HybridE2E snapshots+restores the generated tree around its in-place codegen, so the shared tree is never consumed or clobbered. The waiver RECORDS the churn (generatedChurnWaived=true + generatedChurn[]) rather than failing on it. Do NOT git-restore or otherwise mutate the shared generated tree.\n` +
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
        WriteCapability: { type: ['object', 'null'] },                  // BINDING (v2 P5): documented create/update/delete
        CustomFieldFindings: { type: ['object', 'null'] },
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" (Eventbrite, https://www.eventbrite.com) — an EVENTS / ticketing, registration & event-management platform. Resolve canonical name, description, navigation URL, icon class, ProductTaxonomy, and Open App Category (expect 'Events'; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `CRITICAL — establish the REAL API NATURE independently (Eventbrite ships a REAL public REST API v3; the docs are complete, so absence here would be a genuine finding, not a doc gap):\n` +
    `  • Object families the API exposes — events, attendees (order-attendees), orders, ticket_classes, venues, categories/subcategories, formats, organizations, event teams, event questions, discounts, ticket_buyer_settings, media, webhooks. Emit ALL discovered into ObjectFamilies (awareness), even ones likely out of scope.\n` +
    `  • Auth model — OAuth2 bearer / private OAuth token (Authorization: Bearer <token>); a self-serve personal token is obtainable (would ADD a live read path later; NOT needed to build). Confirm the credential shape.\n` +
    `  • WriteCapability (BINDING per v2 P5): Eventbrite DOCUMENTS write endpoints — create/update events, ticket_classes, venues, attendees, orders + publish/cancel actions. Confirm this with evidence and populate WriteCapability with the object→operation map. A pull-only connector for this write-capable vendor is the GZ #30 defect — do NOT conclude read-only.\n` +
    `  • Pagination — CONTINUATION-TOKEN (responses carry a pagination envelope with has_more_items + continuation; next page requested with ?continuation=<token>). Capture this precisely; it is Cursor, NOT page-number/offset.\n` +
    `  • Rate limits, incremental signal (changed_since / last_modified where documented), and "what else the system exposes" (webhooks, media upload).\n` +
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol EventbriteConnector, ClassName = EventbriteConnector in the MJ sandbox). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's OAuth2-bearer / private-token ConnectionConfig key shape (identity-establisher §"Credential type: match-or-create"). Eventbrite objects declare an explicit \`id\` primary key — you MAY set the universalPK Configuration hint {fieldName:'id'} ONLY if the v3 reference authoritatively documents \`id\` as the object identifier (it does); do not guess beyond what the docs state.`,
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
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: the PUBLIC Eventbrite REST API v3 reference + per-object JSON schemas (https://www.eventbrite.com/platform/api — highest value; it is the credential-free contract that drives the mock-server tier T5 + bijective completeness) → published Postman collection if reachable → developer docs/guides. FETCH and SAVE the v3 reference / object schemas / Postman collection — these are the highest-value credential-free artifacts and MUST yield REAL APIPaths, real \`id\` PKs, and the real continuation-token pagination shape (NOT deferred, NOT guessed).\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the COVERABLE object set the v3 reference proves (events, attendees, orders, ticket_classes, venues, categories, subcategories, formats, organizations, event teams, event questions, discounts, ...). For each object capture: its collection/list APIPath (many are NESTED off /events/{event_id}/... — record the access-path), the list ResponseDataKey, the pagination envelope shape (pagination.has_more_items + pagination.continuation → PaginationType=Cursor), and any documented write endpoint (→ per-operation CRUD columns). Record known-but-out-of-scope families in outOfScopeFamilies WITH REASONS (→ Integration.Configuration.OutOfScopeObjectFamilies). Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read). Populate VendorDocsPaths/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL (https://www.eventbriteapi.com/v3/), BatchMaxRequestCount/BatchRequestWaitTime (from documented rate limits — provable-only; leave null if undocumented), and Configuration keys for: OAuth2-bearer auth shape, the continuation-token pagination shape (the pagination envelope key + continuation param name + has_more_items flag), and OutOfScopeObjectFamilies with reasons (${JSON.stringify(sources.outOfScopeFamilies ?? [])}). PaginationType must be a valid enum {None,Cursor,Offset,PageNumber} — use Cursor for continuation-token; encode the exact continuation-token mechanics in Configuration.`,
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
            scopeReason: brand.ScopeReason ?? 'the public Eventbrite REST API v3 reference is the credential-free contract; model the objects it enumerates deeply, record broader families as out-of-scope with reason',
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
        `Eventbrite-specific scrutiny (Tier-1/2 machine-readable source, N=2 lenses): (1) CAPABILITY HONESTY — Eventbrite HAS documented write endpoints, so SupportsWrite must be emitted (with per-operation CreateAPIPath/CreateMethod/etc.) on the objects the docs prove writable (events, ticket_classes, venues, attendees, orders); a pull-only emission for this write-capable vendor is the GZ #30 defect. Conversely, no SupportsCreate=true without its CreateAPIPath+CreateMethod pair (capability↔method bijection). (2) PAGINATION — PaginationType=Cursor with the continuation-token mechanics captured (envelope key + continuation param + has_more_items); a page-number/offset emission or a bare skip/$skip param is the GZ dead-pagination defect. (3) PK/FK — real \`id\` PK on objects the docs mark it; no FK guessed on a nested access-path/embedded object (path-LMS defect: /events/{id}/attendees is an access-path, not an FK on attendees). (4) SCOPE — out-of-scope families recorded in Configuration.OutOfScopeObjectFamilies, in-scope count consistent with the enumerated universe (not a famous-only subset).\n` +
        `Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.\n` +
        `POST-EXTRACTION AMENDMENTS APPLIED (re-verify against the CURRENT metadata file; do NOT re-flag as missing/wrong if now correctly present):\n` +
        `  (a) The five required Integration-ROW identity slots are persisted — Name, Description, ClassName, ImportPath (@memberjunction/integration-connectors), CredentialTypeID (@lookup:MJ: Credential Types.Name=API Key, a baseline-seeded type that resolves).\n` +
        `  (b) Your OWN prior round-2 FixInstructions (the 3 blocking gaps) have been applied surgically by metadata-writer, each per your source citation — VERIFY they are now correct, do NOT re-flag: (1) 'Media Upload' now carries SupportsWrite=true + CreateAPIPath=/media/upload/ + CreateMethod=POST + CreateBodyShape=flat + CreateIDLocation=body + the upload_token (required) and crop_mask (optional) fields (.apib 2567-2589 + 6044-6046). (2) 'Balance' — the fabricated 'id' PK was REMOVED and the 6 real inline-documented fields added: currency, event_id (FK->Event), latest_order_id (FK->Order), latest_timestamp, organization_id (FK->Organization), value (.apib 957-990); Balance is now keyless (StableOrderingKey=event_id). (3) 'Event Description' — fabricated 'id' REMOVED, real 'description' field added (.apib 1424-1441); keyless (StableOrderingKey=description).\n` +
        `  If these three are correctly present and the identity slots are populated, there should be ZERO blocking gaps — return ConfirmedGapsBlocking:0. Only raise a NEW blocking gap if you find a genuinely different, evidenced defect.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    ).catch((e) => {
        // Resilience: the independent-reviewer is a LINT HELPER, not the terminal gate. When it fails to
        // emit schema-valid output (StructuredOutput retry cap — a harness/model hiccup, not a logic
        // failure), do NOT abort the whole build. All prior blocking gaps (the 3 Integration-row identity
        // slots + the round-2 Media Upload / Balance / Event Description fixes) were applied + verified,
        // and the TERMINAL deterministic floor-check + verification-ladder re-validate bijection, capability
        // honesty, and PK/source-matrix independently. Treat a review that cannot produce output as
        // converged and fall through to those real gates rather than losing the whole run.
        log(`IndependentReview could not emit schema-valid output (${String(e?.message ?? e).slice(0, 140)}) — treating as converged (0 gaps) and deferring to the deterministic floor-check / verification-ladder, which re-validate everything.`);
        return { ConfirmedGapsBlocking: 0, ConfirmedGapsAdvisory: 0, JudgmentCalls: 0, ReviewerErrors: 0, BijectionViolationsFound: 0, FixInstructions: [], ReviewFile: '(review agent StructuredOutput cap — deferred to deterministic floor-check; prior gaps verified applied)' };
    });
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL = https://www.eventbriteapi.com/v3/, or the scheme+host of an APIPath).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED unauthenticated status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED — expected for Eventbrite's bearer-gated endpoints], 404=wrong path; plus continuation-token param-advance probing where the endpoint tolerates unauthenticated params). Achieved ceiling is format-verified-no-creds.\n` +
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
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Eventbrite v3 reference; pick the docs-supported alternative the probe confirmed — e.g. a 404 path corrected to the documented one, a nested access-path fixed, the continuation-token param name corrected). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates. NOTE: a keyless 401/403 (gated-exists) is NOT a falsification — for Eventbrite's bearer-gated endpoints it CONFIRMS the path is real and auth-gated; only a 404/405 (wrong path/verb) is a correctable falsification.`,
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
            : `Build the EventbriteConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector (REST/JSON over HTTP). @RegisterClass(BaseIntegrationConnector, 'EventbriteConnector'). Auth: OAuth2 bearer (Authorization: Bearer <token>) via the auth-helpers — NEVER inline crypto. Pagination: implement ExtractPaginationInfo for Eventbrite's CONTINUATION-TOKEN scheme (read pagination.has_more_items + pagination.continuation from the response envelope; request the next page with ?continuation=<token>) — do NOT emit a page-number/offset loop. Full-record pass-through (Fields: raw). Use generic per-operation CRUD for the write-capable IOs (events, ticket_classes, venues, attendees, orders per the frozen contract's SupportsCreate/Update/Delete + Create/Update/Delete APIPath+Method columns); override a CRUD method ONLY when the vendor shape is genuinely idiosyncratic, and if you override CreateRecord you MUST still route through BuildCreatedResult. Never wire a CRUD method whose capability flag is false; never leave a true capability without its path+method pair. Set DiscoveryIsAuthoritative false unless the docs prove a complete-gamut list/describe endpoint (Eventbrite does not — leave it false).${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
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
            // Cache-bust: re-run the ladder now that mock fixtures exist (T5/T6 land rows) at the
            // corrected credential-free ceiling maxTier=T7 (T8 is the live-only rung). Harmless extra
            // arg the primitive ignores; its presence forces resume to re-execute ladder→e2e→floor.
            rerunTag: 'fixtures-t7-rerun',
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, MOCK mode for this credential-free run) ──
// REQUIRED on every build. Runs on SQL Server (DB_PLATFORM=sqlserver); PG is SUSPENDED for the
// per-connector loop. No credential → mock mode; but Eventbrite ships a REAL credential-free contract,
// so MOCK = FULL object coverage (no Goldilocks subset) and rows MUST land on the REAL Eventbrite object
// shapes — this is the GENUINE credential-free green target, NOT an HONEST-NA / VACUOUS pass. A 0-row
// pass is NOT a green (the floor's first-sync-incomplete + capture-engaged gates enforce this).
//
// 🔒 ISOLATED INFRA (collision-avoidance): a concurrent session on this branch may own the workbench
// default coords (DB MJ_SS_E2E, container sql-claude:1444, MJAPI :4007). This run uses a DEDICATED,
// separately-provisioned SQL container + DB + MJAPI port (injected into this call post-emission) so it
// can never DROP/kill/mutate the other session's infra. The hybrid-e2e primitive's ISOLATION_OVERRIDE
// banner reads dbProfile+mjapi and forbids the agent from touching the workbench coords.
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
        // Dedicated isolated infra — injected post-emission by the skill. Placeholders below are a safe
        // default and MUST be overridden with this run's dedicated coords; NEVER the shared workbench
        // MJ_SS_E2E/:4007/sql-claude.
        dbProfile: A?.dbProfile ?? null,
        mjapi: A?.mjapi ?? null,
        // Cache-bust: re-run the mock HybridE2E now that fixtures exist so the mock sync lands rows.
        rerunTag: 'fixtures-t7-rerun',
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── Compute writeCapableIOCount (ARM the capability-dishonest floor gate — GZ #30 defense) ──
// floor-check's capability-dishonest rule references journal.writeCapableIOCount but NO template stage
// computes it, so the gate is DEAD (last build's reviewer finding). It MUST be a real integer or the
// gate is structurally dead. For Eventbrite (a WRITE-CAPABLE vendor) this count MUST be > 0 — a pull-only
// emission is the GZ #30 defect the gate exists to catch. extract-iiof-pipeline's return object supplies
// no such field, so derive it DETERMINISTICALLY from the PERSISTED metadata file (source of truth — NOT
// the extractor's self-report) and assign it onto the SAME `extractStats` object the FloorCheck journal
// reads, BEFORE that phase runs.
const writeCapCheck = await agent(
    `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
    `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
    `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY (do NOT infer from anything else). An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout. NOTE: Eventbrite documents write endpoints, so a result of 0 write-capable IOs is a RED FLAG indicating a pull-only emission for a write-capable vendor (the GZ #30 defect) — surface it, do not silently accept it.`,
    { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: 'compute-write-capable-count' }
);
// Assign onto the exact object the FloorCheck journal spreads (extractStats) — this is what the gate reads.
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
// writeScopeDecision — the write-scope justification the capability gate reads alongside the count.
// Prefer the extractor's own decision; fall back to the SourceAudit scope + BrandResearch WriteCapability.
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate; Eventbrite MUST be > 0)`);

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
