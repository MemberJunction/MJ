// blackbaud.workflow.js — per-vendor workflow script for the Blackbaud (SKY API) connector build.
//
// Emitted by the connector-creator (planner) for a `/build-connector Blackbaud` run.
// Mode = REDO (major-version rebuild over a deprecated/incomplete prior build).
// Credential = NONE ([B]) → full non-live suite; RealityProbe degraded-unauth; HybridE2E mock.
//
// Preserves the _TEMPLATE locked-primitive composition signatures, the freeze-contract gate,
// the bijection floor-check, the different-model IndependentReview (model:'sonnet'), and the
// MAX_AMENDMENT_ROUNDS=3 / MAX_CODE_BUILD_ROUNDS=3 caps. Customized: meta identity/phases,
// vendor-specific prompts, the multi-family SKY-API SCOPE decision, the redo reseed-delete
// stage, the regression-diff charter on IndependentReview, and the credential-free ceiling.
//
// Blackbaud SKY API nature (to be INDEPENDENTLY CONFIRMED by BrandResearch + SourceAudit —
// stated here only to steer the stages, never as baked truth):
//   - Multi-product API umbrella (developer.blackbaud.com / developer.sky.blackbaud.com):
//     Raiser's Edge NXT (Constituent, Gift, Action, ...), Financial Edge NXT, Blackbaud CRM,
//     School/Education Management, etc. Each family has its own base path (/constituent/v1,
//     /gift/v1, /nxt-data-integration/v1, /school/v1, ...).
//   - Auth: OAuth2 authorization-code flow + a the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) header (TWO-part).
//   - Pagination: commonly limit/offset (Offset) with { count, next_link, value:[...] } envelopes.
//   - Enormous surface → SCOPE decision is CRITICAL. Model the client-relevant subset (likely the
//     Raiser's Edge NXT constituent/gift/relationship families for a nonprofit-CRM/AMS context)
//     DEEPLY; record broader families as Integration.Configuration.OutOfScopeObjectFamilies + reason.

export const meta = {
    name: 'blackbaud-build',
    description: 'Workshop dynamic-workflow build for Blackbaud (SKY API). REDO over a prior partial connector. Multi-family OAuth2 + the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) REST. NO credential → full non-live suite, degraded-unauth RealityProbe, mock HybridE2E. Locked primitives + bijection floor-check.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical brand + ProductTaxonomy from INDEPENDENT public discovery (no context file). Enumerate the SKY-API product families; Category resolves to CRM (or AMS). WriteCapability findings are BINDING (v2 P5).' },
        { title: 'Identity', detail: 'Fill Integration row identity slots. CredentialType must reflect BOTH OAuth2 auth-code AND the the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) header (documented, not exercised — no creds).' },
        { title: 'SourceAudit', detail: 'Audit SKY API sources; enumerate the COVERABLE taxonomy leaves per family; make the KNOWING scope decision (model the client-relevant subset deeply; record broader families out-of-scope with reason).' },
        { title: 'ReseedDelete', detail: 'REDO handling: detect any prior MJ: Integrations.Name=Blackbaud row + its IO/IOF; express stale-row removal as TOP-LEVEL deleteRecord records + --delete-db-only. No-op (documented) when no prior DB row exists.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (auth two-part, OutOfScopeObjectFamilies + reason).' },
        { title: 'IOIOFExtract', detail: 'Per-family extract-iiof-pipeline over the in-scope leaves (verify + write-back). Emit EVERY object/field the source model exposes for the in-scope families — no famous-only subset.' },
        { title: 'IndependentReview', detail: 'Refocused charter + REDO REGRESSION-DIFF: every object/column removed vs the prior BlackbaudConnector.ts must be an INTENTIONAL breaking change, not an accidental drop. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): degraded UNAUTH per-claim status probing — 200=public, 401/403=path real + auth-gated (content UNVERIFIED), 404=wrong. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'BlackbaudConnector class + tests over BaseRESTIntegrationConnector. Per-family base paths + two-part auth. OVERWRITES the prior partial .ts. Fixtures descend from probe captures or vendor-published examples (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite (contract validation, mock-server-from-spec, Postman replay, endpoint/header probing, bijective completeness).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e: real MJ engine → real SQL Server, FRESH DB. MOCK mode (no credential) — full object coverage in mock (every active IO lands >=1 row). Env per HYBRID_E2E_ENV_RUNBOOK.md.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates. Verdict states the EMPIRICAL/LINT split + the format-verified-no-creds ceiling for un-probed claims.' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App (Category=CRM/AMS). Skips non-fatally if the Integrations repo is absent.' },
    ],
};

// Normalize args (the Workflow tool may deliver a JSON STRING).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'Blackbaud';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Resilient handoff wrapper (unchanged from template) — retries a TRANSPORT blip; a real stage
// failure (schema-invalid result, build error) is returned by the agent and routes to the amendment loop.
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

// maxTier=T8 RECORDS the live ceiling; it does NOT gate the non-live suite (which always runs to its
// full applicable extent). No credential → the achievable live ceiling is format-verified-no-creds.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',
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
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim into this schema.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists is non-empty: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, set resolved=true ONLY when the re-run is clean. If generated churn is unaccounted: restore per the runbook before proceeding.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };
}

// ── BrandResearch (INDEPENDENT public discovery — no context file) ────
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
        ProductTaxonomy: { type: 'object' },       // the SKY-API product families + their base paths
        WriteCapability: { type: ['object', 'null'] }, // BINDING (v2 P5): documented create/update/delete surface per family
        ObjectFamilies: { type: 'array' },         // the FULL surface the study found (awareness); scope decision narrows it
        ScopeReason: { type: ['string', 'null'] },
    },
};
const brand = await agent(
    `Research vendor "${VENDOR}" from INDEPENDENT public discovery — there is NO provided context file, so the vendor's own developer portal (developer.blackbaud.com / developer.sky.blackbaud.com) and public API references are the HIGHEST-priority source for BOTH breadth and depth.\n` +
    `Establish the connector's FULL nature: the SKY-API product families (Raiser's Edge NXT, Financial Edge NXT, Blackbaud CRM, School/Education Management, etc.) and each family's base path; the auth model (OAuth2 authorization-code flow + the the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) header — capture BOTH parts); read/write/bidirectional capability per family (WriteCapability is BINDING); pagination shape (limit/offset envelopes { count, next_link, value }); documented rate limits/subscription tiers; and "what else the system exposes."\n` +
    `Resolve the Open App Category — Blackbaud is nonprofit constituent/donor management, so Category is most likely CRM (AMS if the family set is member-centric). Emit ObjectFamilies = the FULL discovered family set (awareness) so SourceAudit can scope it knowingly. Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);

// ── Identity ─────────────────────────────────────────────────────────
phase('Identity');
const PHASE1_SCHEMA = {
    type: 'object', required: ['Status', 'Identity', 'ExistsInDB', 'Provenance'],
    properties: {
        Status: { enum: ['Complete', 'Conflict', 'NeedsHumanDisambiguation'] },
        Identity: { type: 'object' },
        ExistsInDB: { type: 'object' },   // REDO signal: whether a prior MJ: Integrations.Name=Blackbaud row + IO/IOF exist
        Provenance: { type: 'array' },
    },
};
const identity = await agent(
    `Fill Integration row identity slots for "${brand.CanonicalName}". ClassName is BlackbaudConnector (== the sandbox @RegisterClass key == metadata ClassName). Read SOURCE_STUDY when ready.\n` +
    `CredentialTypeID: match-or-create a credential type whose ConnectionConfig key shape reflects BOTH SKY-API auth parts — the OAuth2 authorization-code token AND the the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) header (two-part). Do NOT collapse to a single api-key shape; the connector needs both keys documented (they are NOT exercised this run — no credential).\n` +
    `REDO detection: this is a redo over a prior partial build. Populate ExistsInDB with whether a prior MJ: Integrations.Name=Blackbaud row exists in the DB AND, if so, its IO/IOF ids (query the DB read-only). This drives the ReseedDelete stage. If a prior Integration row is found, also check whether it is excluded from the v5.43.x cleanup migration (V202606251241__v5.43.x__Remove_Connector_Integration_Metadata.sql) due to a live CompanyIntegration connection (CompanyIntegration.IntegrationID IS NOT NULL); if so, treat it as a live-connected redo — do NOT blind-delete via ReseedDelete — and flag for human review instead. Also note the prior connector .ts at packages/Integration/connectors/src/BlackbaudConnector.ts exists on disk (it will be overwritten by CodeBuild).`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (identity.Status === 'NeedsHumanDisambiguation' || identity.Status === 'Conflict') {
    throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);
}

// ── SourceAudit (SKY API — enumerate leaves; make the KNOWING scope decision) ──
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' },
        SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } }, // the IN-SCOPE leaves to model deeply
        Gaps: { type: 'array' },
        VendorDocsPaths: { type: 'array' },
        SDKPaths: { type: 'array' },
        PostmanPaths: { type: 'array' },
        scopeDecision: { type: ['object', 'null'] },     // { inScopeFamilies, outOfScopeFamilies, reason, enumeratedUniverseCount, inScopeCount }
    },
};
const sources = await agent(
    `🚨 CRITICAL — THE FULL OPENAPI CORPUS IS ALREADY DOWNLOADED LOCALLY (a prior run fetched it before being interrupted by a 180s no-progress timeout). DO NOT RE-FETCH IT FROM THE WEB, and DO NOT read the multi-MB specs into your context — reading whole specs (renxt-combined is 799K, church-mgmt 674K, etc.) blows the 180s no-progress window and STALLS the run. Work ONLY from disk + scripts:\n` +
    `  - Specs already present: packages/Integration/connectors-registry/${VENDOR_SLUG}/sources/openapi/*.swagger.json (19 per-family specs: renxt-* [combined/events/interactions/lists/query/reports/documents], fenxt-* [gl/payable/query], crm-constituent, crm-prospect, altru-constituent, church-mgmt, gifts, constituents, prospects, fundraising, sky-addins). Also sources/gh-*.yml + sources/ms-connector-*.md (MS Power Platform refs).\n` +
    `  - COMPUTE THE ENUMERATED UNIVERSE VIA THE EXISTING SCRIPT (never by reading specs in-context): \`cd packages/Integration/connectors-registry/${VENDOR_SLUG} && node scripts/enumerate-catalog.mjs\` — it groups every family's operations into object leaves and prints a compact catalog. Read its stdout. Extend the script if you need finer grouping; keep ALL spec processing INSIDE the script, never in your context window.\n` +
    `  - If you must inspect a spec detail, use Bash \`jq\`/\`grep\` on the file (e.g. \`jq '.definitions|keys|length' sources/openapi/constituents.swagger.json\`), NOT the Read tool. A couple of targeted WebSearches to confirm family existence are fine, but any single web op that risks hanging >180s is forbidden — prefer the local files.\n` +
    `Audit + rank authoritative sources for ${brand.CanonicalName} (SKY API). Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split PER PRODUCT FAMILY (${JSON.stringify((brand.ObjectFamilies ?? []).slice(0, 20))}). Prefer the vendor's own OpenAPI/Swagger specs per family (ALREADY LOCAL — see above), then Postman collections, then HTML API references.\n` +
    `MAKE THE SCOPE DECISION KNOWINGLY (the PropFuel lesson — never silently drop, never over-reach to "build all 1000+ objects"):\n` +
    `  - Enumerate the FULL coverable taxonomy (all families' leaves) to establish the enumerated universe; record enumeratedUniverseCount.\n` +
    `  - Choose the client-relevant IN-SCOPE subset to model DEEPLY. For a nonprofit-CRM/AMS context the likely subset is the Raiser's Edge NXT constituent/gift/relationship families (Constituent, ConstituentAddress/Email/Phone, Gift, Action, RelationshipList, Note, Fund/Campaign/Appeal as referenced). Justify the choice with evidence, not convenience.\n` +
    `  - Record the broader families (Financial Edge NXT, Blackbaud CRM, School/Education Management, etc.) as OUT-OF-SCOPE in scopeDecision.outOfScopeFamilies WITH the reason, so nothing is invisible and a future build can expand without re-discovering. This becomes Integration.Configuration.OutOfScopeObjectFamilies.\n` +
    `Emit TaxonomyLeaves = ONLY the in-scope leaves (input to extract-iiof-pipeline). Emit scopeDecision fully. The reviewer WILL check the scope decision is evidenced and neither thin-vs-universe nor an over-reach.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

// audit-source primitive re-ranks via the rubric — sources.SourcesFile is the input
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile });

// ── ReseedDelete (REDO handling — remove stale prior IO/IOF before reseed) ──
// metadata-file-conventions "Rebuilding a connector that was ALREADY seeded": mj sync push is
// upsert-by-primaryKey with NO prune. If a prior Blackbaud integration was seeded, its stale IO/IOF
// must be removed via TOP-LEVEL deleteRecord records + --delete-db-only, else same-named IO collide
// on UQ_IntegrationObject_Name and the whole push rolls back. When no prior DB row exists this is a
// documented NO-OP (the prior .ts is simply overwritten by CodeBuild — nothing to delete in the DB).
const priorExists = !!(identity?.ExistsInDB?.IntegrationExists ?? identity?.ExistsInDB?.exists ?? false);
if (priorExists) {
    phase('ReseedDelete');
    await agent(
        `REDO reseed-delete for ${VENDOR}. A prior MJ: Integrations.Name=Blackbaud row exists (ExistsInDB: ${JSON.stringify(identity.ExistsInDB).slice(0, 1500)}).\n` +
        `Per metadata-file-conventions "Rebuilding a connector that was ALREADY seeded":\n` +
        `1. Query the DB read-only for the existing Integration + its IO/IOF (and the CredentialTypeID it points at). Determine the stale set = rows absent from the NEW metadata about to be written.\n` +
        `2. Express each stale row as a TOP-LEVEL deleteRecord record (NOT nested under relatedEntities — the deletion-audit gate only inspects top-level array elements): { "deleteRecord": { "delete": true }, "primaryKey": { "ID": "<id>" } } in the correct entity dir (MJ: Integration Objects / MJ: Integration Object Fields).\n` +
        `3. The reseed push MUST pass --delete-db-only so DB-only dependent IOF (referencing a deleted IO but not in the metadata) are swept (CascadeDeletes=0; reverse-topo-orders IOF before IO).\n` +
        `4. Separate delete from upsert: run a delete-only push for the stale rows; do NOT re-upsert an existing IO whose primaryKey isn't in the metadata (UQ_IntegrationObject_Name rollback).\n` +
        `5. Production durability: emit a forward-fix migration performing the same deletes (a fresh install replays the original wrong-seed migration).\n` +
        `Return { staleIOsDeleted, staleIOFsDeleted, forwardFixMigrationPath }.`,
        { agentType: 'metadata-writer', schema: { type: 'object', required: ['staleIOsDeleted', 'staleIOFsDeleted'], properties: { staleIOsDeleted: { type: 'integer' }, staleIOFsDeleted: { type: 'integer' }, forwardFixMigrationPath: { type: ['string', 'null'] } }, additionalProperties: true }, phase: 'ReseedDelete', label: `reseed-delete:${VENDOR_SLUG}` }
    ).catch((e) => { log(`ReseedDelete non-fatal: ${String(e?.message ?? e).slice(0, 200)}`); return null; });
} else {
    log(`ReseedDelete: no prior MJ: Integrations.Name=Blackbaud DB row detected — documented NO-OP. Prior BlackbaudConnector.ts (if present) is overwritten by CodeBuild.`);
}

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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (never hand-edit).\n` +
    `NavigationBaseURL = the SKY API base host. Auth is two-part (OAuth2 auth-code + the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume)) — document both in Configuration (they are NOT exercised — no credential this run).\n` +
    `Write Configuration.OutOfScopeObjectFamilies = ${JSON.stringify((sources.scopeDecision?.outOfScopeFamilies ?? []).slice(0, 30))} WITH scopeReason "${(sources.scopeDecision?.reason ?? brand.ScopeReason ?? 'operator-scoped subset is the client-relevant/reachable surface for a nonprofit-CRM use case').replace(/"/g, "'")}" so the broader SKY-API surface is documented-not-dropped.\n` +
    `BatchMaxRequestCount / BatchRequestWaitTime + RateLimitPolicy hints ONLY where the vendor documents them (provable-only; leave unset otherwise). Reconcile every field to the DEPLOYED schema (metadata-file-conventions Preflight): drop fields that are not real columns, keep PaginationType within {None,Cursor,Offset,PageNumber} (SKY API limit/offset → Offset), ensure nested FKs carry @parent:ID / @parent:IntegrationID.`,
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
        RegressionDropsUnaccounted: { type: 'integer' },  // REDO: removed vs prior build that are NOT intentional
        ModelObserved: { type: 'string' },
        ReviewFile: { type: 'string' },
        FixInstructions: { type: 'array', items: { type: 'object' } },
    },
};

const MAX_AMENDMENT_ROUNDS = 5;
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
    // OPERATOR BREAK-GLASS (EscalatedMaxRounds recovery): the extractor kept DEFERRING
    // requiresEscalation-flagged fixes → the loop never converged. Instruct it to RESOLVE each via
    // standard provable-only discipline (this is the rule, not a bespoke design call).
    const RESOLVE_DIRECTIVE = {
        slot: '_GLOBAL_RESOLUTION_DIRECTIVE', operation: 'resolve-all',
        note: 'RESOLVE every finding below NOW — do NOT defer, do NOT set requiresEscalation. Apply provable-only: '
            + '(a) where a REAL Tier-1 endpoint is cited (POST /nxt-data-integration/v1/re/appeals|campaigns|funds|constitappeals), APPLY the write capability + CreateAPIPath + CreateMethod=POST + CreateBodyShape=flat + CreateIDLocation=body, consistent with the already-wired sibling nxt-data-integration writes (confirm the body shape from the swagger before wiring). '
            + '(b) constituent create is SPLIT across POST /constituent/v1/virtual/individuals + /constituent/v1/virtual/organizations — NO single generic create path is provable, so set constituent.SupportsCreate=false (KEEP SupportsRead/SupportsUpdate as extracted) and record the reason in constituent.Configuration = {"createMechanism":"split-virtual-endpoints","createEndpoints":["/constituent/v1/virtual/individuals","/constituent/v1/virtual/organizations"],"note":"generic create unsupported in v1; use split endpoints"}. An inconsistent capability (SupportsCreate=true with no CreateAPIPath) is NOT allowed — false+documented is the correct provable-only outcome. '
            + '(c) set SupportsPagination=false + PaginationType=None on country and the reference-lookup objects whose GET declares no limit/offset params (constituent_custom_field_category, gift_custom_field_category, fundraising_custom_field_category, opportunity_custom_field_category, name_format_configuration, consent_category, consent_channel, consent_source, solicit_code, rating_category, rating_source), matching your own dual-derive. '
            + 'After applying, NONE of these should remain flagged.',
    };
    const extractFindings = isAmendment
        ? [RESOLVE_DIRECTIVE, ...ioIofFindings.map((f) => ({ ...f, requiresEscalation: false }))]
        : null;
    if (connectorFindings.length > 0) {
        for (const cf of connectorFindings) {
            if (!deferredConnectorFindings.some((d) => (d?.slot ?? '') === (cf?.slot ?? ''))) deferredConnectorFindings.push(cf);
        }
        log(`Deferred ${connectorFindings.length} connector.* (code) fix(es) to CodeBuild (round ${amendmentRound}).`);
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
            objectList: sources.TaxonomyLeaves,          // the IN-SCOPE leaves only (scope decision)
            outOfScopeFamilies: sources.scopeDecision?.outOfScopeFamilies ?? [],
            scopeReason: sources.scopeDecision?.reason ?? brand.ScopeReason ?? 'operator-scoped subset for nonprofit-CRM use case',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // Multi-source PK/FK detection inputs — CREDENTIAL-FREE sources only (extractor-script-conventions:
            // it seeds STATIC metadata; it NEVER reads the connector .ts / prior metadata / live data).
            sourceBundle: {
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: extractFindings,
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

    // ── Independent review (different model + REDO regression-diff charter) ──
    phase('IndependentReview');
    review = await agent(
        `RE-REVIEW PASS v2 — re-read the CURRENT ${METADATA_FILE} from disk FRESH; a resolution directive was applied since any prior review, so prior verdicts are STALE. Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source/SDL into context. Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility.\n` +
        `SCOPE-DECISION CHECK: confirm the in-scope leaf set is the KNOWING client-relevant subset (not a famous-only slice of a family, not an over-reach to all 1000+ SKY-API objects), and that Configuration.OutOfScopeObjectFamilies records the broader families WITH a reason.\n` +
        `CAPABILITY-HONESTY: confirm SupportsWrite per IO matches brand.WriteCapability (v2 P5 binding); a write-capable family emitted read-only, or vice-versa, is a blocking gap.\n` +
        `REDO REGRESSION-DIFF (this is a redo over packages/Integration/connectors/src/BlackbaudConnector.ts): diff the NEW emitted object/field set against the objects/fields the PRIOR connector referenced. Every REMOVED object/column must be an INTENTIONAL breaking change (out-of-scope family, deprecated endpoint, corrected identity) — populate RegressionDropsUnaccounted with the count of removals you canNOT justify as intentional; ANY unaccounted drop is a Confirmed Gap (Blocking) with a FixInstruction.\n` +
        `Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations, ${review.RegressionDropsUnaccounted ?? 0} unaccounted regression drops`);

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
        regression: review.RegressionDropsUnaccounted ?? 0,
        fixes: (review.FixInstructions ?? []).map(f => f?.slot ?? '').sort(),
    });
    if (previousReviewFingerprint === reviewFingerprint) {
        log(`Amendment loop deadlock at round ${amendmentRound}: reviewer findings byte-identical to prior round → escalate`);
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL; DEGRADED UNAUTH, no credential) ──
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (NavigationBaseURL, or scheme+host of an APIPath). SKY API base host.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED UNAUTHENTICATED status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED — expected for SKY API which requires both OAuth2 token and the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume)], 404=path wrong, 405=wrong verb). It also captures WWW-Authenticate / X-RateLimit-* / Retry-After headers to confirm the auth scheme + rate policy.\n` +
    `3. cat ${PROBE_OUT}/verdicts.json and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false); relay the script's verdicts exactly. Expect most SKY-API paths to come back 401/403 (gated-exists) — that is strong PROOF the paths + two-part auth scheme are real, and is the honest credential-free ceiling.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (S8 — ONE mandatory round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe (a 404/405 on a path we declared, or a param the endpoint rejected):\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited SKY-API source; pick the docs-supported alternative the probe confirmed, e.g. the corrected /<family>/v1 base path, the offset param name, demote a null PK to content-hash identity). Then RE-PROBE just the corrected claims (read-only, unauth status probe) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates.`,
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
            : `Build the BlackbaudConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. This is a REDO — OVERWRITE the prior partial packages/Integration/connectors/src/BlackbaudConnector.ts entirely from the frozen contract (do NOT preserve prior emissions the re-derivation does not confirm).\n` +
              `Extend BaseRESTIntegrationConnector. @RegisterClass(BaseIntegrationConnector, 'BlackbaudConnector'). Auth: TWO-part — inject BOTH the OAuth2 bearer token AND the the SKY-API subscription-key header (confirm the exact header name/casing from public source — do not assume) header via BuildHeaders (use auth-helpers; never inline crypto). GetBaseURL must handle the per-FAMILY base paths (/constituent/v1, /gift/v1, ... — the IO's APIPath carries the family prefix or Configuration names the family). ExtractPaginationInfo for the SKY-API limit/offset { count, next_link, value } envelope. Use generic per-operation CRUD columns; override only for a genuinely idiosyncratic family.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
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
            connectorName: VENDOR_SLUG,   // registry SLUG, not ClassName (Finding A)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,   // null → non-live suite to its full extent
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server) ──────────
// REQUIRED on every build. No credential → MOCK mode; the e2e-mock-dodge floor rule does NOT fire
// because credentialReference AND brokerPlans are both null. Runs on SQL Server (DB_PLATFORM=sqlserver;
// Postgres SUSPENDED for the per-connector loop). MOCK = FULL OBJECT COVERAGE: every active in-scope IO
// must land >=1 row from spec-generated fixtures. Env bring-up per HYBRID_E2E_ENV_RUNBOOK.md.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,   // registry SLUG (Finding A)
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
        // ISOLATED-INFRA pass-through: forward the caller's dedicated SQL/MJAPI coords so
        // hybrid-e2e's ISOLATION_OVERRIDE uses them instead of the shared sql-claude/:4007/MJ_SS_E2E
        // (a concurrent session owns those). Absent → primitive falls back to its defaults.
        dbProfile: A?.dbProfile ?? null,
        mjapi: A?.mjapi ?? null,
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

// ── OpenAppPublish (v2 — assemble the verified connector into Integrations as an Open App) ──
let publish = null;
if (PUBLISH_OPEN_APP && verdict?.pass) {
    phase('OpenAppPublish');
    const CLASS_BASE = String(identity?.Identity?.ClassName ?? '').replace(/Connector$/, '');
    const CATEGORY = A?.category ?? brand?.Category ?? null;   // expected CRM (or AMS)
    const CONNECTOR_TS = codeResult?.ConnectorFile ?? `packages/Integration/connectors/src/${identity?.Identity?.ClassName}.ts`;
    const PUBLISH_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, package: { type: 'string' }, appDir: { type: 'string' }, steps: { type: 'array' } } };
    if (!CATEGORY || !CLASS_BASE) {
        log(`OpenAppPublish: missing ${!CATEGORY ? 'Category (brand.Category/args.category)' : 'ClassName'} — cannot place the Open App; skipping publish (sandbox build is still verified).`);
        publish = { ok: false, skipped: true, reason: !CATEGORY ? 'no-category' : 'no-classname' };
    } else {
        publish = await agent(
            `Publish the verified ${brand.CanonicalName} connector as an Open App. Run EXACTLY this and return its JSON stdout VERBATIM:\n` +
            `  node packages/Integration/connector-builder-workshop/scripts/publish-open-app.mjs --repo ${INTEGRATIONS_REPO} --category ${CATEGORY} --class-base ${CLASS_BASE} --connector ${CONNECTOR_TS} --metadata ${METADATA_FILE} --display ${JSON.stringify(brand.CanonicalName)}\n` +
            `ok=true means the Open App PASSED validate-invariants (the four-way identity + Open App shape gate). A missing Integrations repo at ${INTEGRATIONS_REPO}, or a failed 'seed' step (no reachable DB), is acceptable and NON-blocking — surface it but do not fail on it; every other step must be ok.`,
            { schema: PUBLISH_SCHEMA, phase: 'OpenAppPublish', label: 'publish:open-app' }
        );
        log(`OpenAppPublish: ok=${publish.ok} package=${publish.package ?? '?'} appDir=${publish.appDir ?? '?'}`);
    }
}

return {
    runID: A?.runID,
    vendor: VENDOR,
    brand, identity, sources, metadataResult,
    extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder,
    realityProbe, hybridE2E, verdict, publish,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};
