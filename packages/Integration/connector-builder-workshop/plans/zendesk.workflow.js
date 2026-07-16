// zendesk.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Zendesk (https://www.zendesk.com) — customer-service / support / help-desk platform
//   (Zendesk Support + Help Center/Guide ticketing suite). Category: Platform.
// Mode: NEW (v1.0.0 birth; no prior metadata file / DB row / connector .ts / corpus).
// Credential: NONE at build ([B] credential-free run). Zendesk ships a REAL, PUBLIC, credential-free
//   contract: an extensive documented REST API v2 with published OpenAPI specs + object schemas +
//   Postman collections (developer.zendesk.com/api-reference). Every core object carries a real
//   numeric `id` primary key. This is the CRUCIAL difference from a partner-gated vendor: the
//   credential-free PATH 2 suite (spec-driven mock server, OpenAPI/contract validation, bijective
//   completeness, endpoint/header probing) GENUINELY WORKS here → GENUINE-GREEN-MOCK is the target.
//
// WHY THE VENDOR-SPECIFIC SHAPE (grounded in the REAL, documented nature of the Zendesk API v2):
//   • Base URL: https://{subdomain}.zendesk.com/api/v2/ — REST/JSON, resource-oriented paths. The
//     {subdomain} is PER-TENANT (a per-connection config value, NOT a build-time constant). The
//     connector's GetBaseURL templates it from Configuration/credential; the connector CODE carries
//     ZERO tenant subdomain (tenant-agnostic rule). Mock mode uses the spec's path shapes, so the
//     missing subdomain does NOT block the credential-free green — it only blocks the LIVE round-trip.
//   • Auth: PRIMARY = API token, transported as HTTP Basic with username "{email}/token" and password
//     "{api_token}" (Authorization: Basic base64(...)); ALSO supported: Basic email/password and OAuth2
//     bearer. Credential shape = subdomain + email + api_token. authPattern classified `api-key`
//     (an API token); the Basic transport + OAuth2 alternative are recorded in Configuration.
//   • Pagination: MODERN cursor-based pagination (CBP) is the recommended default — request
//     ?page[size]=100&page[after]=<cursor>; response carries meta.has_more + meta.after_cursor +
//     links.next (a full next-page URL to follow). LEGACY offset pagination (?page=N&per_page=100 with
//     next_page URL) still applies to some endpoints. Maps to PaginationType=Cursor (encode the CBP
//     mechanics + the links.next full-URL-follow + the per-object list ResponseDataKey in
//     Configuration; mark offset-only endpoints per-object). Getting this wrong silently caps every
//     object at one page (the GZ dead-pagination class) — SourceAudit + the extractor capture the REAL
//     param per object, and RealityProbe's param-advance check validates the declared form.
//   • Incremental: STRONG. Dedicated Incremental Export endpoints —
//     /api/v2/incremental/{tickets,ticket_events,users,organizations}.json?start_time=<unix> — return
//     end_time + end_of_stream + a cursor; plus most records carry updated_at. SupportsIncrementalSync
//     =true on the incremental-export-backed objects; IncrementalWatermarkField = the documented cursor
//     (start_time/end_time unix, or updated_at). Provable-only elsewhere → unset.
//   • Relationship model: SCALAR FK id fields (ticket.requester_id/assignee_id/organization_id/
//     group_id/submitter_id → user/organization/group; comment.author_id; membership.user_id/group_id).
//     These are REAL FKs (a scalar referencing another object's PK). Side-loading via ?include= and
//     nested paths (/tickets/{id}/comments, /users/{id}/identities) are ACCESS-PATHS, NOT FKs
//     (path-LMS defect: a nesting edge is an access-path; an FK is a scalar that references a PK).
//   • Batch/Async: create_many/update_many/destroy_many bulk endpoints return async JOBS (job_status
//     endpoint) — capture batch semantics where documented; the generic single-record CRUD path is the
//     floor, batch hooks are throughput sugar added only where the docs prove the endpoint.
//   • WriteCapability (BINDING per v2 P5): Zendesk DOCUMENTS extensive write endpoints — create/update/
//     delete tickets, users, organizations, groups, macros, views, triggers, ticket_fields, etc. This
//     connector MUST NOT ship pull-only (the GZ #30 defect). SupportsCreate/Update/Delete + the
//     per-operation CRUD columns are emitted where the docs prove the endpoint (path + method + body
//     shape + id location), and the capability-dishonest floor gate proves the write count is non-zero.
//   • Rate limits: documented per-minute plan-based limits (429 + Retry-After + X-Rate-Limit /
//     X-Rate-Limit-Remaining headers). Capture into BatchMaxRequestCount/RateLimitPolicy where
//     provable; leave null if not explicitly stated (provable-only).
//   • Object universe (LARGE — study it, don't assume thin): Support core — tickets, ticket_comments,
//     ticket_audits, ticket_metrics, ticket_fields, ticket_forms, users, user_fields, user_identities,
//     organizations, organization_fields, organization_memberships, groups, group_memberships, macros,
//     views, triggers, automations, tags, brands, custom_roles, sla_policies, satisfaction_ratings,
//     attachments, requests, suspended_tickets, schedules, dynamic_content, targets, audit_logs, and
//     the Help Center/Guide family (articles, sections, categories, posts, topics, user_segments,
//     permission_groups). Separate PRODUCTS on distinct base paths/APIs — Chat, Talk (voice), Sell
//     (CRM), Explore — are recorded as OUT-OF-SCOPE families WITH REASONS (Support+Guide is the
//     coverable, useful ticketing surface; the others are separate connectors). NO artificial object
//     ceiling: emit the FULL enumerated in-scope universe; chunk-and-continue if a single pass is too
//     large; never truncate to a famous-only subset (the Salesforce under-enumeration class).
//   • Authoritative enumeration: Zendesk exposes NO single describe-all endpoint returning the complete
//     gamut; custom fields ARE runtime-discoverable via ticket_fields/user_fields/organization_fields.
//     So DiscoveryIsAuthoritative stays FALSE (default) — absence proves nothing, nothing deactivates;
//     custom fields flow through runtime Discovered + the framework's custom-column capture.
//
// RISK-CALIBRATED KNOBS (vs template defaults):
//   - adversarialN = 2   → Zendesk is a Tier-1/Tier-2 machine-readable source (public OpenAPI specs +
//     object schemas + Postman). No live RealityProbe confirmation is possible in this credential-free
//     run (no subdomain), so it does NOT drop to N=1 (which requires empirical live confirmation); N=2
//     is the correct default for a strong-source-but-unconfirmed build. It rises to N=3 in-loop only if
//     the source-auditor flags thin/ambiguous coverage (it should not, for Zendesk).
//   - loopUntilDry K = 2 → Zendesk's public doc coverage is strong (complete v2 reference + OpenAPI);
//     K=2 suffices. K=3 is reserved for < 0.7 doc coverage (thin/partner-gated).
//   - MAX_AMENDMENT_ROUNDS = 2, MAX_CODE_BUILD_ROUNDS = 2 → token-efficiency floor (system-prompt +
//     run-intake binding). Each is "1 initial pass + 1 real amendment pass": the amendment round actually
//     re-dispatches the producer with the reviewer's FixInstructions (cap 1 would make that branch
//     unreachable). The deterministic mechanical gates (0-field hard-fail, enforce-finding-floor,
//     compute-source-diff, T1 invariants, floor-check) VALIDATE in-pass but do not APPLY fixes, so one
//     genuine correction pass is retained. Fingerprint-deadlock detection is preserved on both loops.
//   - maxTier = T8       → credential-free ceiling. The verification-ladder's T0..T8 are ALL
//     credential-free (StaticValidation → InvariantValidator → CrossProgrammatic → DocSelfCheck →
//     MockedFixture → MockHTTPServer → LocalSQLite → OpenAPIValidation → FailureModeInjection). The
//     LIVE round-trip ceiling is format-verified-no-creds (no credential/subdomain); HybridE2E runs
//     MOCK. The non-live suite runs to FULL extent regardless of credential — Zendesk's real spec makes
//     ALL of it genuinely useful.
//
// GENUINE CREDENTIAL-FREE GREEN TARGET (NOT an HONEST-NA): because Zendesk exposes a real credential-
//   free contract with real object shapes + real numeric `id` PKs, HybridE2E runs in MOCK mode
//   (mock-server-from-spec) and MUST LAND ROWS on the real object shapes — FULL object coverage, no
//   Goldilocks subset (mock = free = all objects). A 0-row pass is NOT a green. Residual gap (live
//   round-trip, true rate-limit behavior, write side-effects, incremental-export end_of_stream
//   behavior) is stated honestly; a self-serve Zendesk trial subdomain + API token would later promote
//   this to a live read path.
//
// LOCKED-PRIMITIVE COMPOSITION, the freeze-contract gate, the terminal bijection floor-check, the
// different-model (sonnet) adversarial review, and BOTH amendment loops (slot-routing +
// byte-identical-fingerprint deadlock detection) are PRESERVED from _TEMPLATE.workflow.js — never a
// single-return-on-first-gap. CHEAPEST-DEFECT-FIRST ordering: EnvPreflight + offline structural /
// behavioral tiers before heavy spend.

export const meta = {
    name: 'zendesk-build',
    description: 'Workshop dynamic-workflow build for Zendesk (customer-support / help-desk ticketing platform; REST/JSON API v2 with published OpenAPI; API-token/Basic/OAuth2 auth; cursor (CBP) pagination + Incremental Export endpoints; WRITE-CAPABLE; large Support+Guide object universe; per-tenant {subdomain} base URL). NEW v1.0.0, credential-free [B] run against a REAL public credential-free contract. Locked primitives + bijection floor-check. Independent capability discovery yields REAL APIPaths + real numeric `id` PKs + real FK scalars (not deferred). GENUINE credential-free green target (mock lands rows on real shapes). Amendment caps 2/2 (one real extract amendment round + two code-build rounds) per token-efficiency floor.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Zendesk brand + ProductTaxonomy + Open App Category (expect Platform). Establish the REAL object/capability universe (Support core + Help Center/Guide; Chat/Talk/Sell/Explore as separate out-of-scope products) INDEPENDENTLY. WriteCapability is BINDING (v2 P5) — Zendesk HAS extensive write endpoints; prove it, do not assume pull-only.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (ZendeskConnector). Credential type match-or-create against the API-token (subdomain+email+api_token) ConnectionConfig shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: PUBLIC OpenAPI specs + REST API v2 reference + object schemas (highest value — drives T5/T7 mock-server + bijective completeness) → published Postman collection → developer docs. Build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split + real APIPaths + cursor(CBP) + incremental-export shapes. Record out-of-scope products (Chat/Talk/Sell/Explore) with reasons.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (API-token Basic-encoded auth + OAuth2 alt, per-tenant {subdomain} base-URL template https://{subdomain}.zendesk.com/api/v2/, cursor(CBP) + legacy-offset pagination shapes, incremental-export mechanics, rate limits, OutOfScopeObjectFamilies).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). REAL APIPaths + real numeric `id` PKs + real scalar FKs (requester_id/organization_id/...) + per-operation CRUD columns where docs prove write endpoints. Nested paths + side-loads = access-paths in Configuration, NOT guessed FKs. Provable-only type/watermark; unprovable → unset. Full-record pass-through. NO artificial object ceiling — chunk-and-continue over the full in-scope universe.' },
        { title: 'DeployPreflight', detail: 'CHEAP, DB-FREE reconciliation of the authored metadata to the DEPLOYED schema BEFORE any push (metadata-file-conventions § Preflight, REQUIRED): every IO/IOF field a real deployed column; enum/CHECK validity (PaginationType∈{None,Cursor,Offset,PageNumber}=Cursor for CBP; Create/Update BodyShape=wrapped for Zendesk {resource:{...}} bodies; *IDLocation; MetadataSource); parent-FK presence (@parent:ID) + @lookup qualifier (&IntegrationID=@parent:IntegrationID, NEVER @parent:ID — the fk-lookup-qualifier floor rule); CredentialType @lookup target exists; Description ≤ NVARCHAR(255) + no duplicate IOF Name within an IO. Soft/advisory gate (retried), positioned CHEAPEST-DEFECT-FIRST — after IOIOFExtract, before FreezeContract — so an enum/FK-dense mismatch surfaces here instead of deep inside the expensive HybridE2E DB push.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment iteration), refocused charter (coverage-vs-script / bijection / capability-honesty / naming). Different model (sonnet). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probe (no credential/subdomain) — 401/403=path real+gated, 404=path wrong, plus CBP param-advance probing where tolerated; without a tenant subdomain many claims degrade to spec-consistency + api-reference-host verdicts. Ceiling format-verified-no-creds; every un-probed claim named. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'ZendeskConnector class + tests over BaseRESTIntegrationConnector (REST/JSON). API-token Basic-encoded auth via auth-helpers; GetBaseURL templates the per-tenant {subdomain}; ExtractPaginationInfo implements cursor(CBP) links.next/after-cursor (NOT a page-number/offset loop); generic per-operation CRUD wired for write-capable IOs. Fixtures descend from reality (spec/probe captures) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: OpenAPI/schema/contract validation vs the v2 reference, mock-server-from-spec (T5), cursor(CBP) pagination replay, incremental-export replay, endpoint/header probing, bijective completeness, failure-mode injection (T8: 429/500/timeout/bad-JSON retry+classify).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB. GENUINE green target — MOCK = FULL object coverage; rows MUST land on the REAL Zendesk object shapes (no Goldilocks subset). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md. LIVE is honestly UNREACHABLE (no credential/subdomain) — marked, not mock-dodged as green.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty [Zendesk IS write-capable — must be non-zero], env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling (format-verified-no-creds).' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under Category=Platform: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/brokerPlans/maxTier silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'zendesk';
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
// loop-until-dry K for the extract pipeline — 2 because Zendesk's public doc coverage is strong (a
// complete v2 reference + OpenAPI); K=3 is reserved for thin/partner-gated (< 0.7) coverage.
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
        Category: { type: ['string', 'null'] },   // expect 'Platform'
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
    `Research vendor "${VENDOR}" (Zendesk, https://www.zendesk.com) — a customer-service / support / help-desk (ticketing) platform. Resolve canonical name, description, navigation URL (developer.zendesk.com/api-reference), icon class, ProductTaxonomy, and Open App Category (expect 'Platform'; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `CRITICAL — establish the REAL API NATURE independently (Zendesk ships a REAL public REST API v2 with published OpenAPI specs; the docs are complete, so absence here would be a genuine finding, not a doc gap):\n` +
    `  • Object families the Support + Help Center/Guide APIs expose — tickets, ticket_comments, ticket_audits, ticket_metrics, ticket_fields, ticket_forms, users, user_fields, user_identities, organizations, organization_fields, organization_memberships, groups, group_memberships, macros, views, triggers, automations, tags, brands, custom_roles, sla_policies, satisfaction_ratings, attachments, requests, suspended_tickets, schedules, dynamic_content, targets, audit_logs, AND Guide/Help Center (articles, sections, categories, posts, topics, user_segments, permission_groups). Emit ALL discovered into ObjectFamilies (awareness), even ones out of scope.\n` +
    `  • SCOPE — Chat, Talk (voice), Sell (CRM), and Explore are SEPARATE Zendesk products on distinct base paths/APIs; treat them as OUT-OF-SCOPE families with a reason (Support+Guide is the coverable, useful ticketing surface; the others are separate connectors). Populate ScopeReason.\n` +
    `  • Auth model — PRIMARY: API token (Authorization: Basic base64("{email}/token:{api_token}")); ALSO Basic email/password and OAuth2 bearer. Credential shape = subdomain + email + api_token. The base URL is PER-TENANT: https://{subdomain}.zendesk.com/api/v2/. Confirm the credential shape.\n` +
    `  • WriteCapability (BINDING per v2 P5): Zendesk DOCUMENTS extensive write endpoints — create/update/delete tickets, users, organizations, groups, macros, views, triggers, ticket_fields, etc., plus bulk create_many/update_many/destroy_many (async jobs). Confirm with evidence and populate WriteCapability with the object→operation map. A pull-only connector for this write-capable vendor is the GZ #30 defect — do NOT conclude read-only.\n` +
    `  • Pagination — MODERN cursor-based pagination (CBP): ?page[size]=N&page[after]=<cursor>; response meta.has_more + meta.after_cursor + links.next (full URL). Legacy offset (?page=N&per_page=N + next_page URL) on some endpoints. Capture precisely; it is Cursor, NOT page-number/offset by default.\n` +
    `  • Incremental — Incremental Export endpoints /api/v2/incremental/{tickets,ticket_events,users,organizations}.json?start_time=<unix> returning end_time + end_of_stream + cursor; plus updated_at on records. Custom fields discoverable at runtime via ticket_fields/user_fields/organization_fields. Rate limits (429 + Retry-After + X-Rate-Limit headers). "What else": webhooks, Search API, side-loading (?include=).\n` +
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol ZendeskConnector, ClassName = ZendeskConnector in the MJ sandbox). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's API-token ConnectionConfig key shape (subdomain + email + api_token; identity-establisher §"Credential type: match-or-create"). Zendesk core objects declare an explicit numeric \`id\` primary key — you MAY set the universalPK Configuration hint {fieldName:'id'} ONLY if the v2 reference authoritatively documents \`id\` as the object identifier (it does for the Support core); do not guess beyond what the docs state (some subordinate objects are keyless / composite — leave those to the extractor).`,
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
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: the PUBLIC Zendesk OpenAPI specs + REST API v2 reference + per-object JSON schemas (https://developer.zendesk.com/api-reference — highest value; the credential-free contract that drives the mock-server tiers T5/T7 + bijective completeness) → published Postman collections if reachable → developer docs/guides. FETCH and SAVE the OpenAPI spec(s) / object schemas / Postman collection — these are the highest-value credential-free artifacts and MUST yield REAL APIPaths, real numeric \`id\` PKs, real scalar FKs (requester_id/organization_id/assignee_id/group_id/...), and the real cursor(CBP) + incremental-export shapes (NOT deferred, NOT guessed).\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the COVERABLE object set the v2 reference proves (Support core + Help Center/Guide — tickets, ticket_comments, ticket_audits, ticket_metrics, ticket_fields, ticket_forms, users, user_fields, user_identities, organizations, organization_fields, organization_memberships, groups, group_memberships, macros, views, triggers, automations, tags, brands, custom_roles, sla_policies, satisfaction_ratings, requests, suspended_tickets, schedules, dynamic_content, targets, audit_logs, articles, sections, categories, posts, topics, user_segments, permission_groups, ...). NO artificial object ceiling — enumerate the FULL in-scope universe the spec exposes.\n` +
    `For each object capture: its collection/list APIPath (many are NESTED off /tickets/{id}/... or /users/{id}/... — record the access-path), the list ResponseDataKey (e.g. "tickets", "users"), the pagination shape (cursor CBP: page[size]/page[after] + meta.after_cursor + links.next → PaginationType=Cursor; note offset-only endpoints per-object), the incremental-export cursor where applicable (start_time/end_time unix or updated_at → IncrementalWatermarkField), and any documented write endpoint (→ per-operation CRUD columns: create/update/delete path + method + body shape + id location; bulk create_many/update_many as batch notes). Record known-but-out-of-scope PRODUCTS (Chat, Talk, Sell, Explore) in outOfScopeFamilies WITH REASONS (→ Integration.Configuration.OutOfScopeObjectFamilies). Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read). Populate VendorDocsPaths/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them.`,
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL (the developer/api-reference URL or the per-tenant template https://{subdomain}.zendesk.com/api/v2/), BatchMaxRequestCount/BatchRequestWaitTime (from documented per-minute rate limits — provable-only; leave null if undocumented), and Configuration keys for: the PER-TENANT {subdomain} base-URL template + the subdomain config key name; the API-token auth shape (Basic base64("{email}/token:{api_token}")) + the OAuth2-bearer alternative; the cursor(CBP) pagination shape (page[size] + page[after] param names, meta.after_cursor + meta.has_more + links.next follow) AND the legacy-offset fallback shape; the incremental-export mechanics (start_time unix param + end_time/end_of_stream response); and OutOfScopeObjectFamilies (${JSON.stringify(sources.outOfScopeFamilies ?? ['Chat', 'Talk', 'Sell', 'Explore'])}) with reasons. PaginationType must be a valid enum {None,Cursor,Offset,PageNumber} — use Cursor for CBP (default) and encode the exact mechanics + per-object offset exceptions in Configuration. Do NOT bake any tenant subdomain into metadata — it is a per-connection config value (tenant-agnostic rule).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop) ───────────────────────
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

// Amendment cap = 2 (token-efficiency floor + run-intake binding): round 0 = initial extract+review;
// round 1 = ONE genuine amendment pass that re-dispatches the extractor with the reviewer's
// FixInstructions (the isAmendment=true / reviewerFindings branch). Cap 1 would make that branch
// structurally unreachable — any first-pass blocking gap would fall straight to EscalatedMaxRounds
// without the FixInstructions ever being applied (the failure mode _TEMPLATE.workflow.js:232-238 warns
// against; the deterministic gates VALIDATE, they do not APPLY fixes). Mirrors MAX_CODE_BUILD_ROUNDS=2:
// one initial pass + one real correction pass — still tighter than the template's default of two
// correction passes. Fingerprint-deadlock detection preserved on both loops for correctness.
// SUPERVISED ROUND 3 (post-EscalatedMaxRounds, user-approved): cap raised 2→3 for exactly ONE
// additional human-sanctioned amendment pass. Root cause of the wasted round 1: the reviewer's
// grouped placeholder slots (`io.<61-objects>.X`) defeat deriveFlaggedObjects() inside the locked
// extract-iiof-pipeline primitive (its regex captures the literal `<61-objects>` as an object name),
// so the round-1 delta amendment targeted a nonexistent object and silently skipped the 61
// pagination fixes while applying only the concrete users.default_group_id FK fix. The expansion
// below (gated to amendmentRound >= 2 so round-0/1 agent args stay byte-identical for resume
// caching) rewrites placeholder findings into concrete per-object findings using the reviewer's OWN
// enumeration (INDEPENDENT_REVIEW.md, Gap 1, "Affected IOs — 61").
// SUPERVISED ROUND 4 (second user approval): round 3's review verified ALL 9 prior gaps fixed and
// found 4 new blocking gaps in newly-scanned classes (watermark field, StableOrderingKey ×5,
// schedules/schedule_holidays field completeness) — 14 FixInstructions, all concrete slots, zero
// placeholders. Reviewer scan is now full-population across every class. One final round; if the
// round-4 review still blocks, escalate terminally.
// SUPERVISED ROUND 5 (third user approval): round 4 verified all 8 prior gaps still fixed and found
// 2 new concrete blocking classes — (a) the root Integration row never persisted CredentialTypeID /
// ImportPath / Description (identity computed them but metadata-writer didn't land them; the intended
// 'Zendesk API' credential type doesn't exist, so the reviewer redirects to the existing 'Basic Auth'
// type matching Configuration.AuthFlow='basic'), and (b) 3 pagination stragglers (help_center_categories,
// article_comments, post_comments still Cursor → None, the tail of the class rounds 2-3 fixed 62 of).
// 12 concrete FixInstructions, zero placeholders, clean routing (3 integration.* → metadata-writer,
// 9 io.* → delta extract on 3 named objects). Strong convergence (9→4→2 blocking). FINAL sanctioned
// round: if round-5 review still surfaces a new blocking class, escalate terminally — no further bumps.
const MAX_AMENDMENT_ROUNDS = 5;
// Reviewer-enumerated list, copied verbatim from INDEPENDENT_REVIEW.md Gap 1 (61 objects requiring
// PaginationType=None + SupportsPagination=false + DefaultPageSize=null). Not orchestrator-authored.
const REVIEWER_PAG_NONE_OBJECTS = [
    'approval_requests', 'article_attachments', 'article_labels', 'articles',
    'asset_types', 'assets', 'audits', 'bookmarks', 'community_posts', 'community_topics',
    'compliance_deletion_statuses', 'custom_field_options', 'custom_object_access_rules',
    'custom_object_fields', 'custom_object_permission_policies', 'custom_object_record_attachments',
    'custom_objects', 'custom_roles', 'custom_statuses', 'deletion_schedules', 'email_notifications',
    'group_sla_policies', 'help_center_votes', 'itam_asset_fields', 'itam_asset_statuses', 'locations',
    'macro_attachments', 'macro_categories', 'monitored_twitter_handles', 'omnichannel_routing_queues',
    'organization_merges', 'organization_subscriptions', 'post_subscriptions', 'remote_authentications',
    'routing_attribute_values', 'routing_attributes', 'routing_instance_values', 'satisfaction_reasons',
    'saved_searches', 'sections', 'service_catalog_items', 'sharing_agreements', 'skips', 'sla_policies',
    'target_failures', 'targets', 'task_list_templates', 'task_lists', 'tasks', 'ticket_comments',
    'ticket_content_pins', 'ticket_events', 'ticket_form_statuses', 'ticket_metric_events', 'translations',
    'trigger_revisions', 'user_identities', 'user_segments', 'user_subscriptions', 'view_counts', 'workspaces',
];
const expandPlaceholderFindings = (findings) => findings.flatMap((f) => {
    const m = /^io\.<\d+-objects>\.(.+)$/.exec(String(f?.slot ?? '').trim());
    if (!m) return [f];
    return REVIEWER_PAG_NONE_OBJECTS.map((o) => ({ ...f, slot: `io.${o}.${m[1]}` }));
});
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;
let deferredConnectorFindings = [];
let deployPreflight = null;

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
    const rawIoIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f) && !isConnectorSlot(f));
    // Placeholder expansion ONLY for the supervised round (>=2) — round 1's args must stay
    // byte-identical to the original run so resume caching replays it instead of re-running it.
    const ioIofFindings = amendmentRound >= 2 ? expandPlaceholderFindings(rawIoIofFindings) : rawIoIofFindings;
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
            scopeReason: brand.ScopeReason ?? 'the public Zendesk REST API v2 reference + OpenAPI is the credential-free contract; model the Support+Guide objects it enumerates deeply, record Chat/Talk/Sell/Explore products as out-of-scope with reason',
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

    // ── DeployPreflight (CHEAP, DB-FREE, BEFORE any push) ──
    // Resilient to transient API drops: a null return (agent died mid-response) is RETRIED, and if it
    // still can't run, proceed on a safe default — DeployPreflight is a SOFT/advisory gate (IndependentReview
    // + the terminal floor-check are the hard gates), so a transient blip must not crash the run. Zendesk's
    // contract is enum-and-FK-dense (CBP pagination enum, wrapped create/update body shapes on the write-
    // capable IOs, scalar FKs across users/organizations/groups/tickets/comments) — exactly the shape most
    // likely to trip a deployed-column / enum / @lookup-qualifier mismatch, and the ONLY place that would
    // otherwise surface it is deep inside HybridE2E's DB push (by far the most expensive stage). Catch it here.
    phase('DeployPreflight');
    deployPreflight = null;
    for (let dpTry = 1; dpTry <= 3 && !deployPreflight; dpTry++) {
        deployPreflight = await agent(
            `DeployPreflight (DB-FREE) for ${VENDOR}: reconcile the authored metadata at ${METADATA_FILE} to the DEPLOYED DB schema BEFORE any push (metadata-file-conventions § Preflight). Verify by RUNNING a script (do NOT eyeball): (1) every IO/IOF field is a REAL deployed column — drop ideal-but-unmigrated fields; (2) enum/CHECK values valid — PaginationType ∈ {None,Cursor,Offset,PageNumber} (Zendesk CBP ⇒ Cursor; offset-only endpoints encode their mechanics in Configuration), Status, Create/Update BodyShape ∈ {flat,wrapped,literal} (Zendesk wraps create/update bodies as {<resource>:{...}} ⇒ wrapped), *IDLocation ∈ {body,header,n/a,path}, MetadataSource; (3) every nested record carries its parent FK (IntegrationID / IntegrationObjectID = @parent:ID) AND every RelatedIntegrationObjectID @lookup uses &IntegrationID=@parent:IntegrationID (NEVER @parent:ID — the fk-lookup-qualifier floor rule; a wrong qualifier rolls back the whole push); (4) the CredentialTypeID @lookup target exists at push time; (5) no Description exceeds the deployed NVARCHAR(255) and no duplicate IOF Name within one IO. Change ONLY what reconciliation requires; return { ok, violations }.`,
            { agentType: 'metadata-writer', schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, violations: { type: 'array' } } }, phase: 'DeployPreflight', label: dpTry === 1 ? `deploy-preflight:r${amendmentRound}` : `deploy-preflight:r${amendmentRound}.retry${dpTry}` }
        ).catch(() => null);
        if (!deployPreflight && dpTry < 3) log(`DeployPreflight returned null (transient API drop) — retry ${dpTry + 1}/3`);
    }
    if (!deployPreflight) { deployPreflight = { ok: true, violations: [] }; log(`DeployPreflight unavailable after 3 tries — proceeding on safe default (soft gate; review + floor-check still enforce)`); }
    log(`DeployPreflight round ${amendmentRound}: ok=${deployPreflight.ok} violations=${(deployPreflight.violations ?? []).length}`);

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
        `Zendesk-specific scrutiny (Tier-1/2 machine-readable source, N=2 lenses): (1) CAPABILITY HONESTY — Zendesk HAS documented write endpoints, so SupportsWrite must be emitted (with per-operation CreateAPIPath/CreateMethod/CreateBodyShape/CreateIDLocation, Update*, Delete*) on the objects the docs prove writable (tickets, users, organizations, groups, macros, views, triggers, ticket_fields, ...); a pull-only emission for this write-capable vendor is the GZ #30 defect. Conversely, no SupportsCreate=true without its CreateAPIPath+CreateMethod pair (capability↔method bijection); DeleteAPIPath requires DeleteMethod. (2) PAGINATION — PaginationType=Cursor with the CBP mechanics captured (page[size]/page[after] + meta.after_cursor + links.next); a page-number/offset emission on a CBP endpoint, or a bare skip/page param with no cursor, is the GZ dead-pagination defect. (3) PK/FK — real numeric \`id\` PK on objects the docs mark it; real SCALAR FKs (requester_id/organization_id/assignee_id/group_id → the target object's PK) with RelatedIntegrationObjectID resolving to an IO this run emits (check singular/plural target names); NO FK guessed on a nested access-path/side-load (path-LMS defect: /tickets/{id}/comments is an access-path, not an FK on ticket_comments). (4) SCOPE — out-of-scope products (Chat/Talk/Sell/Explore) recorded in Configuration.OutOfScopeObjectFamilies with reasons; in-scope count consistent with the enumerated Support+Guide universe (not a famous-only subset — NO artificial ceiling).\n` +
        `Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema. NOTE: this run uses MAX_AMENDMENT_ROUNDS=2 (one real amendment re-dispatch is reachable; token-efficiency floor); the terminal deterministic floor-check + verification-ladder re-validate bijection, capability honesty, and PK/source-matrix independently, so a mechanical gap you flag that the deterministic gates also catch is not lost.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    ).catch((e) => {
        // Resilience: the independent-reviewer is a LINT HELPER, not the terminal gate. When it fails to
        // emit schema-valid output (StructuredOutput retry cap — a harness/model hiccup, not a logic
        // failure), do NOT abort the whole build — the TERMINAL deterministic floor-check +
        // verification-ladder re-validate bijection, capability honesty, and PK/source-matrix
        // independently. Treat a review that cannot produce output as converged and fall through.
        log(`IndependentReview could not emit schema-valid output (${String(e?.message ?? e).slice(0, 140)}) — treating as converged (0 gaps) and deferring to the deterministic floor-check / verification-ladder, which re-validate everything.`);
        return { ConfirmedGapsBlocking: 0, ConfirmedGapsAdvisory: 0, JudgmentCalls: 0, ReviewerErrors: 0, BijectionViolationsFound: 0, FixInstructions: [], ReviewFile: '(review agent StructuredOutput cap — deferred to deterministic floor-check)' };
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
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} round(s) with ${review.ConfirmedGapsBlocking} unresolved blocking gaps`);
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE}. NOTE the per-tenant subdomain: Zendesk's real base is https://{subdomain}.zendesk.com/api/v2/, and with NO credential/subdomain there is no resolvable tenant host. Use the documented developer/api-reference host where the script can reach it; otherwise the probe degrades to spec-consistency verdicts (the declared path SHAPE is consistent with the OpenAPI spec) — this is EXPECTED and honest, not a failure.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED unauthenticated status probe: 200=public, 401/403=gated-exists [path real + auth-gated, content UNVERIFIED — expected for Zendesk's token-gated endpoints], 404=wrong path; plus CBP page[after]/page[size] param-advance probing where the endpoint tolerates unauthenticated params; where no tenant host resolves, records the claim as unverified with a spec-consistency note). Achieved ceiling is format-verified-no-creds.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Every un-probed claim must be NAMED as unverified — never a blanket green.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (ONE round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Zendesk v2 reference / OpenAPI; pick the docs-supported alternative the probe confirmed — e.g. a 404 path corrected to the documented one, a nested access-path fixed, the CBP param names corrected, an offset-only endpoint re-marked). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates. NOTE: a keyless 401/403 (gated-exists) is NOT a falsification — for Zendesk's token-gated endpoints it CONFIRMS the path is real and auth-gated; and a spec-consistency-only verdict (no tenant host resolved) is UNVERIFIED, not falsified. Only a 404/405 (wrong path/verb) is a correctable falsification.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop ────────────────────────────────
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

// Code+ladder amendment cap = 2 (token-efficiency floor + run-intake binding): round 0 build + ladder,
// round 1 one real fix pass. Fingerprint-deadlock detection exits earlier when identical failures recur.
// Bumped 2→3 (supervised, post T1 PkSourceMatrix fix): the original run deadlocked with T1 red before
// T2..T7 ever ran; after the metadata correction the ladder re-runs from a clean fingerprint and may
// surface a genuinely-new lower-tier finding — give one extra real fix round of headroom.
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
            : `Build the ZendeskConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector (REST/JSON over HTTP). @RegisterClass(BaseIntegrationConnector, 'ZendeskConnector'). Auth: API token transported as HTTP Basic — Authorization: Basic base64("{email}/token:{api_token}") — via the auth-helpers (APIKeyHeaderBuilder / Basic helper); NEVER inline crypto or base64 by hand. GetBaseURL MUST template the PER-TENANT {subdomain} from Configuration/credential (https://{subdomain}.zendesk.com/api/v2/) — ZERO tenant subdomain baked in the code (tenant-agnostic rule). Pagination: implement ExtractPaginationInfo for Zendesk cursor-based pagination (read meta.has_more + meta.after_cursor and/or follow links.next; request the next page with page[after]=<cursor>&page[size]=N) with the legacy-offset fallback (next_page URL / ?page=N&per_page=N) for offset-only endpoints per the frozen contract — do NOT emit a bare page-number loop that caps every object at one page. NormalizeResponse strips the list envelope to the per-object ResponseDataKey. Full-record pass-through (Fields: raw). Incremental: FetchChanges reads the IO's IncrementalWatermarkField and uses the Incremental Export endpoints (start_time unix → end_time/end_of_stream) where the contract marks SupportsIncrementalSync. Use generic per-operation CRUD for the write-capable IOs (tickets, users, organizations, groups, macros, views, triggers, ticket_fields, ... per the frozen contract's SupportsCreate/Update/Delete + Create/Update/Delete APIPath+Method+BodyShape columns; Zendesk wraps create/update bodies as {<resource>: {...}} → CreateBodyShape=wrapped with the resource key); override a CRUD method ONLY when genuinely idiosyncratic (e.g. bulk create_many/async-job), and if you override CreateRecord you MUST still route through BuildCreatedResult. Never wire a CRUD method whose capability flag is false; never leave a true capability without its path+method pair (DeleteAPIPath requires DeleteMethod). Set DiscoveryIsAuthoritative false (Zendesk exposes no complete-gamut describe endpoint; custom fields flow through runtime discovery + custom-column capture).${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
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
        `Stage the build artifacts into the registry dir so mj-test-runner can find them.${A?.revalidateNonce ? ` (revalidate:${A.revalidateNonce} — T1 PkSourceMatrix corrected upstream: custom_objects.key / macro_categories.category / tags.name flipped IsPrimaryKey=false [IsUniqueKey stays true] + matrix regenerated; re-stage + re-run the ladder against the corrected on-disk metadata)` : ''} Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, MOCK mode for this credential-free run) ──
// REQUIRED on every build. Runs on SQL Server (DB_PLATFORM=sqlserver); PG is SUSPENDED for the
// per-connector loop. No credential/subdomain → mock mode; but Zendesk ships a REAL credential-free
// contract, so MOCK = FULL object coverage (no Goldilocks subset) and rows MUST land on the REAL
// Zendesk object shapes — the GENUINE credential-free green target, NOT an HONEST-NA / VACUOUS pass.
// A 0-row pass is NOT a green (the floor's first-sync-incomplete + capture-engaged gates enforce this).
// LIVE is honestly UNREACHABLE here (no credential/subdomain) — marked, never mock-dodged as green.
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
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── Compute writeCapableIOCount (ARM the capability-dishonest floor gate — GZ #30 defense) ──
// floor-check's capability-dishonest rule references journal.writeCapableIOCount; derive it
// DETERMINISTICALLY from the PERSISTED metadata file (source of truth — NOT the extractor's self-report)
// and assign it onto the SAME `extractStats` object the FloorCheck journal reads, BEFORE that phase runs.
// For Zendesk (a WRITE-CAPABLE vendor) this count MUST be > 0 — a pull-only emission is the GZ #30 defect.
const writeCapCheck = await agent(
    `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
    `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
    `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY (do NOT infer from anything else). An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout. NOTE: Zendesk documents extensive write endpoints, so a result of 0 write-capable IOs is a RED FLAG indicating a pull-only emission for a write-capable vendor (the GZ #30 defect) — surface it, do not silently accept it.`,
    { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: 'compute-write-capable-count' }
);
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate; Zendesk MUST be > 0)`);

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
            deployPreflight,
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
    const CATEGORY = A?.category ?? brand?.Category ?? null;   // expect 'Platform'
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
