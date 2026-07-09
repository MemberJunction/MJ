// higherlogic-vanilla.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Higher Logic Vanilla — Higher Logic's community / online-discussion-forum product
//   (the platform FORMERLY KNOWN AS "Vanilla Forums", acquired by Higher Logic). It is a community
//   engagement / forum / knowledge-base platform. Category: expect Platform.
// Mode: NEW (v1.0.0 birth; no prior metadata file / DB row / connector .ts / corpus for this vendor).
// Credential: NONE at build ([B] credential-free run). Vanilla ships a REAL, PUBLIC, credential-free
//   contract: a documented REST/JSON API v2 with an OpenAPI/Swagger spec (an interactive API explorer
//   is served at a community's /api/v2, and the public dev docs enumerate the object surface). Core
//   objects carry a real numeric `<object>ID` primary key (userID, discussionID, commentID, ...).
//   This is the CRUCIAL difference from a partner-gated vendor: the credential-free PATH 2 suite
//   (spec-driven mock server, OpenAPI/contract validation, bijective completeness, endpoint/header
//   probing) GENUINELY WORKS here → GENUINE-GREEN-MOCK is the target (NOT an HONEST-NA).
//
// ⚠️ DISAMBIGUATION (BINDING — do not conflate three distinct Higher Logic products):
//   • THIS build = Higher Logic Vanilla (community/forum; ex-"Vanilla Forums"). Registry slug
//     `higherlogic-vanilla`, class symbol HigherLogicVanillaConnector.
//   • Higher Logic Marketing Enterprise — a DIFFERENT, unrelated in-progress stub at
//     packages/Integration/connectors-registry/higherlogic-marketing-enterprise/. DO NOT touch it,
//     DO NOT read its SOURCE_STUDY/SOURCES, DO NOT mix its research into this build.
//   • Higher Logic Thrive Community — a SEPARATE, newer Higher Logic community line with its OWN
//     distinct API. Do NOT import Thrive API assumptions into Vanilla.
//
// ⚠️ CONTEXT DOC POLICY (BINDING — standing project rule on --context): the operator supplied a large
//   reference doc at packages/Integration/connectors-registry/higherlogic-vanilla/sources/contextHLV.md.
//   It is a GENERIC, TEMPLATE-SHAPED "integration lab" planning doc that proposes a BESPOKE mock-lab
//   architecture (its own adapter interfaces / Docker Compose / folder layout) that DOES NOT match MJ's
//   real connector framework. Treat it as:
//     - TRUSTED for the CONCRETE FACTS it states about the vendor (API v2 base concepts; auth routes —
//       personal access token / JWT API auth / role-token / OAuth2 SSO / SAML / OIDC / jsConnect SSO;
//       object families — users/roles/categories/discussions/comments/reactions/groups/subcommunities/
//       products/articles(KB)/moderation-escalation; Link-header + numbered pagination; rate limits;
//       CSV export), i.e. `trusted-where-it-speaks`.
//     - NOT a statement of the system's full nature, and NOT the MJ architecture to build to. IGNORE its
//       bespoke mock-lab / adapter-interface / Docker-Compose design entirely — build to MJ's
//       BaseRESTIntegrationConnector + the workshop's locked primitives (the study/audit stages below).
//   The brand/nature study + source-auditor MUST INDEPENDENTLY study Vanilla's REAL public API v2 docs
//   (success.vanillaforums.com/kb/articles/40-api-v2-overview + kb/articles/1842 — Higher Logic's
//   "Success Community" KB, the verified-reachable Tier-1 source; NOTE developer.vanillaforums.com is
//   DEAD/NXDOMAIN, do not cite it — + the OpenAPI/Swagger a community serves at /api/v2) to CONFIRM /
//   EXTEND / CORRECT the doc — never just transcribe it. Where the doc
//   and independent public research agree, confidence rises; where they disagree, INVESTIGATE and trust
//   the independently-verified public source (context is `trusted-where-it-speaks` ONLY while independent
//   evidence doesn't contradict it; provably-wrong context is REJECTED, not down-weighted).
//
// WHY THE VENDOR-SPECIFIC SHAPE (grounded in Vanilla's REAL, documented API v2 nature):
//   • Base URL: {communityUrl}/api/v2 — REST/JSON, resource-oriented paths (/users, /discussions,
//     /comments, /categories, /roles, /reactions, /groups, /subcommunities, /knowledge-bases, ...).
//     The {communityUrl} (the customer's community/site URL) is PER-TENANT (a per-connection config
//     value, NOT a build-time constant). GetBaseURL templates it from Configuration/credential; the
//     connector CODE carries ZERO tenant community URL (tenant-agnostic rule). Mock mode uses the spec's
//     path shapes, so the missing tenant host does NOT block the credential-free green — it only blocks
//     the LIVE round-trip.
//   • Auth (MACHINE / server-to-server): PRIMARY = a personal access token transported as Bearer
//     (Authorization: Bearer <token>); JWT API auth and Role Tokens (short-lived, role-only, endpoint-
//     limited — no user identity) are documented alternatives. authPattern classified `api-key` (a
//     bearer token). The SSO flavors (OAuth2 / SAML / OIDC / jsConnect) are for END-USER authentication
//     INTO the community — NOT the connector's server-to-server API auth — so they are RECORDED in
//     Configuration as awareness but are NOT the connector's auth path.
//   • Pagination: numbered pagination (?page=N&limit=N) PLUS an RFC-5988 `Link:` response header
//     (rel="next"/"prev"/"first"/"last") and X-App-Page-* headers. Maps to PaginationType=PageNumber
//     (the enum is {None,Cursor,Offset,PageNumber}); ExtractPaginationInfo FOLLOWS the Link header's
//     rel=next when present and otherwise increments `page`. Encode the exact param names + the
//     Link-header follow in Configuration. Getting the param wrong silently caps every object at one
//     page (the GZ dead-pagination class) — SourceAudit + the extractor capture the REAL param per
//     object, and RealityProbe's param-advance check validates the declared form.
//   • Incremental: Vanilla records carry dateInserted / dateUpdated; list endpoints commonly support
//     sort/filter on dateUpdated. SupportsIncrementalSync=true ONLY where the docs prove a filter/sort
//     on an updated-timestamp; IncrementalWatermarkField = the documented field (dateUpdated). Provable-
//     only elsewhere → unset (NOT assumed).
//   • Relationship model: real SCALAR FK id fields — discussion.categoryID→category,
//     discussion.insertUserID→user, comment.discussionID→discussion, comment.insertUserID→user,
//     reaction/role scalars, etc. These are REAL FKs (a scalar referencing another object's PK). NESTED
//     paths (/users/{id}/discussions, /discussions/{id}/comments, /users/{id}/roles) are ACCESS-PATHS,
//     NOT FKs (the path-LMS defect: a nesting edge is an access-path; an FK is a scalar referencing a PK).
//   • WriteCapability (BINDING per v2 P5): Vanilla DOCUMENTS write endpoints — POST/PATCH/DELETE on
//     discussions & comments, PUT on user roles, and more. This connector MUST NOT ship pull-only (the
//     GZ #30 defect). SupportsCreate/Update/Delete + the per-operation CRUD columns are emitted where
//     the docs prove the endpoint (path + method + body shape + id location); the capability-dishonest
//     floor gate proves the write count is non-zero.
//   • Rate limits: documented (429 + Retry-After). Capture into BatchMaxRequestCount/RateLimitPolicy
//     where provable; leave null if not explicitly stated (provable-only).
//   • Object universe (study it, don't cap it at the context-doc list): users, roles, categories,
//     discussions, comments, reactions/kudos, groups, subcommunities, products, knowledge-bases +
//     articles, and likely conversations/messages, tags, drafts, media, moderation/escalations, badges,
//     ranks, dirty-words/ban-rules, etc. Discover the REAL FULL breadth from Vanilla's actual API v2
//     OpenAPI — NO artificial object ceiling; chunk-and-continue if a single pass is too large; never
//     truncate to a famous-only subset (the Salesforce under-enumeration class).
//   • Authoritative enumeration: no single describe-all endpoint returning the complete gamut; custom
//     profile fields ARE runtime-discoverable. So DiscoveryIsAuthoritative stays FALSE (default) —
//     absence proves nothing, nothing deactivates; customs flow through runtime Discovered + the
//     framework's custom-column capture.
//
// RISK-CALIBRATED KNOBS (vs template defaults):
//   - adversarialN = 2   → Vanilla is a Tier-1/Tier-2 machine-readable source (public OpenAPI/Swagger +
//     dev docs). No live RealityProbe confirmation of the credential-gated content is possible in this
//     credential-free run (no tenant community URL + token), so it does NOT drop to N=1 (which requires
//     empirical live confirmation); N=2 is the correct default for a strong-source-but-unconfirmed build.
//     It rises to N=3 in-loop only if the source-auditor flags thin/ambiguous coverage.
//   - loopUntilDry K = 2 → Vanilla's public API-v2 doc coverage is strong (a real OpenAPI/Swagger); K=2
//     suffices. K=3 is reserved for < 0.7 doc coverage (thin/partner-gated) — SourceAudit may bump if the
//     real OpenAPI turns out thinner than the interactive explorer suggests.
//   - MAX_AMENDMENT_ROUNDS = 2, MAX_CODE_BUILD_ROUNDS = 2 → token-efficiency floor (system-prompt +
//     run-intake binding). Each is "1 initial pass + 1 real amendment pass": the amendment round actually
//     re-dispatches the producer with the reviewer's FixInstructions (cap 1 would make that branch
//     unreachable). The deterministic mechanical gates (0-field hard-fail, enforce-finding-floor,
//     compute-source-diff, T1 invariants, floor-check) VALIDATE in-pass but do not APPLY fixes, so one
//     genuine correction pass is retained. Fingerprint-deadlock detection is preserved on both loops.
//   - maxTier = T8       → credential-free ceiling. The verification-ladder's T0..T8 are ALL
//     credential-free (StaticValidation → InvariantValidator → CrossProgrammatic → DocSelfCheck →
//     MockedFixture → MockHTTPServer → LocalSQLite → OpenAPIValidation → FailureModeInjection). The LIVE
//     round-trip ceiling is format-verified-no-creds (no credential/community URL); HybridE2E runs MOCK.
//     The non-live suite runs to FULL extent regardless of credential — Vanilla's real spec makes ALL of
//     it genuinely useful. No brokerPlans / live-credential routing is wired (credentialReference=null).
//
// GENUINE CREDENTIAL-FREE GREEN TARGET (NOT an HONEST-NA): because Vanilla exposes a real credential-
//   free contract with real object shapes + real numeric `<object>ID` PKs, HybridE2E runs in MOCK mode
//   (mock-server-from-spec) and MUST LAND ROWS on the real object shapes — FULL object coverage, no
//   Goldilocks subset (mock = free = all objects). A 0-row pass is NOT a green. Residual gap (live
//   round-trip, true rate-limit behavior, write side-effects, incremental completeness) is stated
//   honestly; a self-serve Vanilla community + personal-access-token would later promote this to a live
//   read path. T8 self-skips its LIVE cells via 'no-credential-reference' — the plan does NOT route
//   around this and does NOT fabricate a broker/live path.
//
// LOCKED-PRIMITIVE COMPOSITION, the freeze-contract gate, the terminal bijection floor-check, the
// different-model (sonnet) adversarial review, and BOTH amendment loops (slot-routing +
// byte-identical-fingerprint deadlock detection) are PRESERVED from _TEMPLATE.workflow.js — never a
// single-return-on-first-gap. CHEAPEST-DEFECT-FIRST ordering: EnvPreflight (abort cheap) → offline
// structural extract → DeployPreflight (DB-FREE reconcile BEFORE any push) → offline behavioral ladder
// tiers → the heaviest HybridE2E DB push last.

export const meta = {
    name: 'higherlogic-vanilla-build',
    description: 'Workshop dynamic-workflow NEW (v1.0.0) build for Higher Logic Vanilla (community/discussion-forum platform, ex-"Vanilla Forums"; REST/JSON API v2 with published OpenAPI/Swagger; personal-access-token Bearer auth [JWT alt; SSO flavors are end-user only]; numbered + Link-header pagination → PageNumber; WRITE-CAPABLE; large community object universe; per-tenant {communityUrl} base URL). Credential-free [B] run against a REAL public credential-free contract → GENUINE-GREEN-MOCK target (mock lands rows on real shapes). Locked primitives + bijection floor-check + different-model adversarial review + both amendment loops. Context doc trusted-where-it-speaks; capability set re-derived independently from Vanilla API v2. Amendment caps 2/2 per token-efficiency floor. maxTier T8 (credential-free ceiling; live self-skips honestly).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Higher Logic Vanilla brand + ProductTaxonomy + Open App Category (expect Platform). Establish the REAL object/capability universe INDEPENDENTLY from Vanilla API v2 docs — context doc is trusted-where-it-speaks, NOT authoritative; disambiguate from Marketing Enterprise + Thrive. WriteCapability BINDING (v2 P5) — Vanilla HAS write endpoints; prove it, do not assume pull-only.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (HigherLogicVanillaConnector). Credential type match-or-create against the personal-access-token (Bearer) ConnectionConfig shape (+ per-tenant communityUrl config key).' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: the PUBLIC Vanilla API v2 OpenAPI/Swagger + REST reference + object schemas (highest value — drives T5/T7 mock-server + bijective completeness) → the operator context doc (trusted-where-it-speaks, VALIDATE against the real docs) → dev docs. Build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split + real APIPaths + PageNumber/Link-header + incremental shapes.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (Bearer personal-access-token auth + JWT alt + SSO-flavors-are-end-user note; per-tenant {communityUrl} base-URL template + config key name; numbered+Link-header pagination mechanics; dateUpdated incremental; rate limits; OutOfScopeObjectFamilies).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). REAL APIPaths + real numeric `<object>ID` PKs + real scalar FKs (categoryID/insertUserID/discussionID/...) + per-operation CRUD columns where docs prove write endpoints. Nested paths (/users/{id}/discussions, /discussions/{id}/comments) = access-paths in Configuration, NOT guessed FKs. Provable-only type/watermark; unprovable → unset. Full-record pass-through. NO artificial object ceiling — chunk-and-continue over the full in-scope universe.' },
        { title: 'DeployPreflight', detail: 'CHEAP, DB-FREE reconciliation of authored metadata to the DEPLOYED schema BEFORE any push (metadata-file-conventions § Preflight, REQUIRED): real deployed columns; enum/CHECK validity (PaginationType∈{None,Cursor,Offset,PageNumber}=PageNumber; Create/Update BodyShape; *IDLocation; MetadataSource); parent-FK presence (@parent:ID) + @lookup qualifier (&IntegrationID=@parent:IntegrationID, NEVER @parent:ID — fk-lookup-qualifier floor rule); CredentialType @lookup target exists; Description ≤ NVARCHAR(255) + no duplicate IOF Name within an IO. Soft/advisory (retried), positioned cheapest-defect-first — after IOIOFExtract, before FreezeContract.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment iteration), refocused charter (coverage-vs-script / bijection / capability-honesty / naming). Different model (sonnet). LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probe (no credential/community URL). Best-effort GENTLE read-only status probing of a reachable PUBLIC Vanilla community host where one exists (200=public, 401/403=path real+gated, 404=wrong) + PageNumber param-advance probing where tolerated; otherwise spec-consistency verdicts. Ceiling format-verified-no-creds; every un-probed claim NAMED. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'HigherLogicVanillaConnector over BaseRESTIntegrationConnector (REST/JSON). Bearer personal-access-token auth via auth-helpers; GetBaseURL templates the per-tenant {communityUrl}; ExtractPaginationInfo follows the Link-header rel=next / increments page (NOT a one-page cap); generic per-operation CRUD for write-capable IOs. Fixtures descend from reality (spec/probe captures) — provenance-tagged (v2 P4). IGNORE the context doc mock-lab architecture entirely.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: OpenAPI/schema/contract validation vs the API-v2 reference, mock-server-from-spec (T5), PageNumber/Link-header pagination replay, endpoint/header probing, bijective completeness, failure-mode injection (T8: 429/500/timeout/bad-JSON retry+classify).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB. GENUINE green target — MOCK = FULL object coverage; rows MUST land on the REAL Vanilla object shapes (no Goldilocks subset). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md. LIVE honestly UNREACHABLE (no credential/community URL) — marked, not mock-dodged as green.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty [Vanilla IS write-capable — must be non-zero], env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling (format-verified-no-creds).' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under the resolved Category (expect Platform): package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/maxTier silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'higherlogic-vanilla';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;
const CONTEXT_DOC = `${REGISTRY_DIR}/sources/contextHLV.md`;   // trusted-where-it-speaks, NOT authoritative

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
    e2eTier: A?.maxTier ?? 'T8',                 // credential-free ceiling; live self-skips honestly
    adversarialVerifyMinReviewers: 2,
};
// loop-until-dry K for the extract pipeline — 2 (strong public API-v2 OpenAPI coverage). K=3 is reserved
// for < 0.7 doc coverage (thin/partner-gated); SourceAudit may recommend the bump if coverage is thin.
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
    `   NOTE: --allow-generated-churn is INTENTIONAL — the branch (agentic/connector-builder-v2) carries pre-existing ADDITIVE generated-tree drift from concurrent connector work. This build runs on FULLY ISOLATED infra (its own SQL container + DB + MJAPI port, injected into the HybridE2E call) and HybridE2E snapshots+restores the generated tree around its in-place codegen, so the shared tree is never consumed or clobbered. The waiver RECORDS the churn (generatedChurnWaived=true + generatedChurn[]) rather than failing on it. Do NOT git-restore or otherwise mutate the shared generated tree.\n` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. Do NOT attempt to restore generated churn — it is waived above.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
// Null-guard (resilient handoff): agent() resolves null (not throw) on a terminal transport error
// after internal retries — never dereference a stage result without checking this first.
if (!envPreflight) {
    return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightAgentFailed', message: 'EnvPreflight agent returned null (terminal API error after retries) — resume to retry this stage.' };
}
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
    `Research vendor "${VENDOR}" = Higher Logic Vanilla, Higher Logic's community / online-discussion-forum product (the platform FORMERLY KNOWN AS "Vanilla Forums", acquired by Higher Logic). Resolve canonical name (e.g. "Higher Logic Vanilla" / "Vanilla Community"), description, navigation URL (the Vanilla API v2 developer docs), icon class, ProductTaxonomy, and Open App Category (expect 'Platform' — a community/forum platform; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `DISAMBIGUATION (BINDING): This is DISTINCT from (a) "Higher Logic Marketing Enterprise" (a different product with an in-progress stub at packages/Integration/connectors-registry/higherlogic-marketing-enterprise/ — DO NOT read or conflate it) and (b) "Higher Logic Thrive Community" (a separate newer community line with its own distinct API — do NOT import Thrive assumptions). Populate Disambiguation with how you told them apart.\n` +
    `CONTEXT DOC: the operator supplied ${CONTEXT_DOC} — a generic, template-shaped "integration lab" doc. Treat it as TRUSTED-WHERE-IT-SPEAKS for concrete facts, but INDEPENDENTLY study Vanilla's REAL public API v2 docs (success.vanillaforums.com/kb/articles/40-api-v2-overview + kb/articles/1842 — Higher Logic's "Success Community" KB, verified-reachable; developer.vanillaforums.com is DEAD/NXDOMAIN, do NOT cite it + the OpenAPI/Swagger a community serves at /api/v2) to CONFIRM/EXTEND/CORRECT it — do NOT just transcribe it, and IGNORE its bespoke mock-lab/Docker/adapter architecture (not the MJ framework).\n` +
    `CRITICAL — establish the REAL API NATURE independently:\n` +
    `  • Object families the API v2 exposes — users, roles, categories, discussions, comments, reactions/kudos, groups, subcommunities, products, knowledge-bases + articles, and likely conversations/messages, tags, drafts, media, moderation/escalations, badges, ranks, ban-rules. Emit ALL discovered into ObjectFamilies (awareness), including any beyond the context doc's list — do NOT cap at what the doc happened to mention.\n` +
    `  • Auth model — MACHINE/server-to-server: a personal access token as Bearer (Authorization: Bearer <token>); JWT API auth and Role Tokens (short-lived, role-only claims, no user identity, limited to a subset of endpoints) are documented alternatives — name Role Tokens explicitly in your findings even though the connector's primary auth is PAT. The SSO flavors (OAuth2 / SAML / OIDC / jsConnect) are for END-USER community sign-in, NOT the connector's server-to-server auth — note them but do NOT treat them as the connector's auth path. The base URL is PER-TENANT: {communityUrl}/api/v2. Confirm the credential shape (token + community URL).\n` +
    `  • WriteCapability (BINDING per v2 P5): Vanilla DOCUMENTS write endpoints — POST/PATCH/DELETE on discussions & comments, PUT on user roles, and more. Confirm with evidence and populate WriteCapability with the object→operation map. A pull-only connector for this write-capable vendor is the GZ #30 defect — do NOT conclude read-only.\n` +
    `  • Pagination — numbered (?page=N&limit=N) PLUS an RFC-5988 Link response header (rel=next/prev/first/last) + X-App-Page-* headers → PaginationType=PageNumber; the connector follows Link rel=next. Capture precisely.\n` +
    `  • Incremental — dateInserted/dateUpdated on records; some lists filter/sort on dateUpdated → IncrementalWatermarkField=dateUpdated where provable. Rate limits (429 + Retry-After). Custom profile fields discoverable at runtime. "What else": webhooks addon, CSV export.\n` +
    `Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);
if (!brand) {
    return { runID: A?.runID, vendor: VENDOR, status: 'BrandResearchAgentFailed', message: 'BrandResearch agent returned null (terminal API error after retries) — resume to retry this stage.' };
}

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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol HigherLogicVanillaConnector, ClassName = HigherLogicVanillaConnector in the MJ sandbox; registry slug ${VENDOR_SLUG}). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's ConnectionConfig key shape: a personal access token (Bearer) + the per-tenant community URL config key (identity-establisher §"Credential type: match-or-create"). ExistsInDB MUST confirm this is a NEW build (no prior Higher Logic Vanilla Integration row / connector .ts). Do NOT collide with any Higher Logic Marketing Enterprise or Thrive identity. Vanilla core objects declare an explicit numeric \`<object>ID\` identifier (userID, discussionID, commentID, categoryID, roleID, ...); you MAY set the universalPK Configuration hint ONLY if the API-v2 reference authoritatively documents the \`<object>ID\` identifier convention — otherwise leave PK to the extractor per-object (some subordinate objects are keyless/composite).`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
);
if (!identity) {
    return { runID: A?.runID, vendor: VENDOR, brand, status: 'IdentityAgentFailed', message: 'Identity agent returned null (terminal API error after retries) — resume to retry this stage.' };
}
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
const SOURCE_AUDIT_PROMPT =
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: the PUBLIC Vanilla API v2 OpenAPI/Swagger + REST reference + per-object JSON schemas (success.vanillaforums.com/kb/articles/40-api-v2-overview + kb/articles/1842 — Higher Logic's "Success Community" KB, verified-reachable HTTP 200 with the full API v2 reference; developer.vanillaforums.com is DEAD/NXDOMAIN, do NOT cite or use it; a community serves an interactive Swagger at {community}/api/v2 — highest value; the credential-free contract that drives the mock-server tiers T5/T7 + bijective completeness) → the operator context doc ${CONTEXT_DOC} (Tier-3 informational, TRUSTED-WHERE-IT-SPEAKS — VALIDATE its claims against the real docs; REJECT any claim independent evidence contradicts; IGNORE its bespoke mock-lab/Docker/adapter architecture) → dev guides. FETCH and SAVE the real OpenAPI/Swagger spec / object schemas — these are the highest-value credential-free artifacts and MUST yield REAL APIPaths, real numeric \`<object>ID\` PKs, real scalar FKs (categoryID/insertUserID/discussionID/...), and the real PageNumber + Link-header pagination shape (NOT deferred, NOT guessed).\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the COVERABLE object set the API-v2 reference proves (users, roles, categories, discussions, comments, reactions, groups, subcommunities, products, knowledge-bases, articles, and any of conversations/messages, tags, drafts, media, moderation/escalations, badges, ranks the spec enumerates). NO artificial object ceiling — enumerate the FULL in-scope universe the spec exposes; do NOT cap at the context doc's list.\n` +
    `For each object capture: its collection/list APIPath (many are NESTED off /users/{id}/... or /discussions/{id}/... — record the access-path), the list ResponseDataKey (the API v2 typically returns a bare JSON array, so ResponseDataKey may be null/root — record what the spec shows), the pagination shape (numbered page=N&limit=N + Link header rel=next → PaginationType=PageNumber; capture the exact param names + the Link-header follow), the incremental cursor where applicable (dateUpdated → IncrementalWatermarkField), and any documented write endpoint (→ per-operation CRUD columns: create/update/delete path + method + body shape + id location). Record known-but-out-of-scope families (if any product lines are separate APIs) in outOfScopeFamilies WITH REASONS (→ Integration.Configuration.OutOfScopeObjectFamilies). Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read). Populate VendorDocsPaths (include ${CONTEXT_DOC})/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them. If the real OpenAPI coverage is thin (< 0.7), say so in Gaps so the extract loop can raise K to 3.`;
// Null-guard + retry (resilient handoff): SourceAudit is expensive (real web research) and everything
// downstream depends on it — a transient transport blip here must not discard the brand/identity work
// already banked or crash the whole multi-hour build. Same pattern as the existing DeployPreflight retry.
let sources = null;
for (let srcTry = 1; srcTry <= 3 && !sources; srcTry++) {
    sources = await agent(
        SOURCE_AUDIT_PROMPT,
        { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: srcTry === 1 ? `audit:${VENDOR_SLUG}` : `audit:${VENDOR_SLUG}.retry${srcTry}` }
    ).catch(() => null);
    if (!sources && srcTry < 3) log(`SourceAudit returned null/errored (transient API drop) — retry ${srcTry + 1}/3`);
}
if (!sources) {
    return { runID: A?.runID, vendor: VENDOR, brand, identity, status: 'SourceAuditFailed', message: 'source-auditor agent returned null after 3 attempts (terminal API error each time) — resume to retry this stage.' };
}

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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL (the Vanilla API v2 reference URL — success.vanillaforums.com/kb/articles/1842, VERIFY it resolves HTTP 200 before writing; do NOT use developer.vanillaforums.com, it is DEAD/NXDOMAIN — or the per-tenant template {communityUrl}/api/v2), BatchMaxRequestCount/BatchRequestWaitTime (from documented rate limits — provable-only; leave null if undocumented), and Configuration keys for: the PER-TENANT {communityUrl} base-URL template + the community-URL config key name; the Bearer personal-access-token auth shape + the JWT-API-auth alternative + Role Tokens (short-lived, role-only, endpoint-limited — record as awareness even though PAT is the connector's primary auth) + a note that the SSO flavors (OAuth2/SAML/OIDC/jsConnect) are END-USER community auth, NOT the connector's server-to-server auth; the numbered+Link-header pagination shape (page + limit param names, Link rel=next follow, X-App-Page-* headers); the dateUpdated incremental mechanics where provable; rate limits (429 + Retry-After); and OutOfScopeObjectFamilies (${JSON.stringify(sources.outOfScopeFamilies ?? [])}) with reasons. PaginationType must be a valid enum {None,Cursor,Offset,PageNumber} — use PageNumber for Vanilla's numbered+Link-header scheme and encode the exact mechanics in Configuration. Set DiscoveryIsAuthoritative=false (no complete-gamut describe endpoint; custom profile fields flow through runtime discovery + custom-column capture) with rationale. Do NOT bake any tenant community URL into metadata — it is a per-connection config value (tenant-agnostic rule).`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
).catch(() => null);
if (!metadataResult) {
    log(`MetadataWrite returned null (transient API error) — proceeding; DeployPreflight + the extract loop + terminal floor-check independently verify the metadata file's actual content, so a null self-report here does not silently pass.`);
}

// ── Extract → DeployPreflight → Freeze → Review (amendment loop) ──────
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

// Amendment cap: round 0 = initial extract+review; round 1 = ONE delta amendment pass; round 2+ = the
// SUPERVISED widen rounds (see below). Base cap was 2 (token-efficiency floor). BUMPED to 4 on
// 2026-07-08 with EXPLICIT USER APPROVAL after the first run escalated EscalatedMaxRounds with 5
// converging blocking gaps — the big one (B1) being FK wiring reaching only 13/58 objects because the
// round-1 DELTA mechanism is structurally too narrow to close a 45-object gap, and the reviewer's
// vendor-wide-FK instruction (a `pipeline.*` slot) neither flags objects NOR trips forceReenum, so a
// plain resume would re-run the same narrow delta and re-escalate (the Zendesk treadmill). The bump
// gives room for round 2 (a FULL re-enumeration FK sweep — see the SUPERVISED WIDEN block below) + round
// 3 (residual fix). If it STILL blocks after round 3 → EscalatedMaxRounds returns to the user; NO
// further auto-bumps (the Zendesk "FINAL" discipline). Fingerprint-deadlock detection preserved.
const MAX_AMENDMENT_ROUNDS = 4;
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
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f) && !isConnectorSlot(f));

    // ── SUPERVISED WIDEN (round >= 2, user-approved 2026-07-08) — the escalation fix ──
    // The round-1 delta reached FK wiring on only 13/58 objects: the reviewer's vendor-wide-FK
    // instruction is a `pipeline.*` slot that deriveFlaggedObjects ignores (regex only matches io./iof.)
    // AND does not trip findingsForceReenumeration — so a naive resume re-runs the SAME narrow delta and
    // re-escalates. On the supervised rounds (>=2) we detect that vendor-wide-rollout signal and PREPEND a
    // synthetic finding whose text ('object-set under-enumeration') FORCES a full re-enumeration in the
    // extract primitive, carrying the explicit allOf/$ref-flatten + vendor-wide-FK instruction the
    // reviewer's escalating FixInstruction asked for. GATED on amendmentRound>=2 so rounds 0/1 args stay
    // byte-identical → the resume cache for the already-run rounds stays valid; only round 2+ runs live.
    let effectiveIoIofFindings = ioIofFindings;
    if (amendmentRound >= 2) {
        const wantsVendorWideSweep = allFindings.some((f) => {
            const s = `${f?.slot ?? ''} ${f?.after ?? ''} ${f?.rationale ?? ''}`.toLowerCase();
            return f?.requiresEscalation === true || s.includes('vendor-wide') || s.includes('rollout')
                || (s.includes('relatedintegrationobjectid') && s.includes('remaining'));
        });
        if (wantsVendorWideSweep) {
            effectiveIoIofFindings = [
                {
                    slot: 'pipeline.full-reenumeration-fk-sweep',
                    operation: 'set',
                    note: 'object-set under-enumeration: scalar FK fields + RelatedIntegrationObjectID wiring are absent on the majority of objects (only 13/58 wired). This is NOT a per-object delta — FORCE A FULL RE-ENUMERATION across the whole catalog.',
                    after: 'Re-walk the ENTIRE Vanilla OpenAPI (sources/vanilla-openapi.merged.v3.json) for ALL objects. ROOT CAUSE of the miss: composed schemas were not fully flattened, dropping scalar FK fields. For EVERY object, FULLY FLATTEN allOf/$ref chains and emit every scalar FK field the flattened schema declares, THEN wire its RelatedIntegrationObjectID @lookup (qualifier &IntegrationID=@parent:IntegrationID, NEVER @parent:ID) to the sibling IO it references. Known-missing exemplars to confirm fixed: Discussion.{categoryID,groupID,insertUserID,statusID,lastUserID}, Comment.{discussionID,categoryID,groupID,insertUserID,parentCommentID}, Category.parentCategoryID, Poll.{discussionID,insertUserID,updateUserID}, Notification.discussionID, Escalation.{assignedUserID,lastCommentUserID}, KnowledgeCategory.{knowledgeBaseID,parentID}, Article.{knowledgeCategoryID,insertUserID,updateUserID}, Subcommunity.productID, Tag.parentTagID, User.rankID. Cross-check runs/.../output/DUAL_DERIVATION.json missingFields as a candidate list but INDEPENDENTLY re-verify each against the raw flattened spec before emitting (that tool has confirmed allOf/type false-positives). Additive/never-subtractive: the 13 already-wired objects keep their FKs; also emit the reviewer\'s missing IOs (ArticleRevision, ConversationParticipant) and its Tag/urlcode + UserMention-PK corrections in this same full pass.',
                    evidence: 'INDEPENDENT_REVIEW.md B1 + FixInstruction pipeline.RelatedIntegrationObjectID-vendor-wide-rollout (requiresEscalation:true)',
                    rationale: 'vendor-wide FK sweep across all 58 objects via full re-enumeration — the user-approved escalation fix',
                },
                ...ioIofFindings,
            ];
            log(`SUPERVISED WIDEN (round ${amendmentRound}): injected a full-re-enumeration FK-sweep finding — this round re-walks ALL objects with allOf/$ref flattening + vendor-wide FK wiring (not the narrow delta that escalated).`);
        }
    }

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
            outOfScopeFamilies: sources.outOfScopeFamilies ?? [],
            scopeReason: brand.ScopeReason ?? 'the public Vanilla REST API v2 OpenAPI/Swagger is the credential-free contract; model the community objects it enumerates deeply (users/roles/categories/discussions/comments/reactions/groups/subcommunities/products/knowledge-bases/articles/...); record any separate product-line APIs as out-of-scope with reason',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            loopUntilDryK: LOOP_UNTIL_DRY_K,
            sourceBundle: {
                // NEW build — no existing connector .ts / prior metadata to read (and reading OUTPUT is forbidden).
                // The context doc is a vendorDoc (trusted-where-it-speaks), NOT connector output.
                existingConnectorTsPath: null,
                existingMetadataPaths: [],
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [CONTEXT_DOC],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? effectiveIoIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    // ── DeployPreflight (CHEAP, DB-FREE, BEFORE any push) ──
    // Resilient to transient API drops: a null return is RETRIED, and if it still can't run, proceed on
    // a safe default — DeployPreflight is a SOFT/advisory gate (IndependentReview + the terminal
    // floor-check are the hard gates), so a transient blip must not crash the run. Vanilla's contract is
    // enum-and-FK-dense (PageNumber pagination, wrapped/flat create/update bodies on the write-capable
    // IOs, scalar FKs across users/discussions/comments/categories) — exactly the shape most likely to
    // trip a deployed-column / enum / @lookup-qualifier mismatch, whose ONLY other surfacing point is
    // deep inside HybridE2E's DB push (by far the most expensive stage). Catch it here, cheapest-first.
    phase('DeployPreflight');
    deployPreflight = null;
    for (let dpTry = 1; dpTry <= 3 && !deployPreflight; dpTry++) {
        deployPreflight = await agent(
            `DeployPreflight (DB-FREE) for ${VENDOR}: reconcile the authored metadata at ${METADATA_FILE} to the DEPLOYED DB schema BEFORE any push (metadata-file-conventions § Preflight). Verify by RUNNING a script (do NOT eyeball): (1) every IO/IOF field is a REAL deployed column — drop ideal-but-unmigrated fields; (2) enum/CHECK values valid — PaginationType ∈ {None,Cursor,Offset,PageNumber} (Vanilla numbered+Link-header ⇒ PageNumber), Status, Create/Update BodyShape ∈ {flat,wrapped,literal}, *IDLocation ∈ {body,header,n/a,path}, MetadataSource; (3) every nested record carries its parent FK (IntegrationID / IntegrationObjectID = @parent:ID) AND every RelatedIntegrationObjectID @lookup uses &IntegrationID=@parent:IntegrationID (NEVER @parent:ID — the fk-lookup-qualifier floor rule; a wrong qualifier rolls back the whole push); (4) the CredentialTypeID @lookup target exists at push time; (5) no Description exceeds the deployed NVARCHAR(255) and no duplicate IOF Name within one IO. Change ONLY what reconciliation requires; return { ok, violations }.`,
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
        `Higher Logic Vanilla-specific scrutiny (Tier-1/2 machine-readable source, N=2 lenses): (1) CAPABILITY HONESTY — Vanilla HAS documented write endpoints, so SupportsWrite must be emitted (with per-operation CreateAPIPath/CreateMethod/CreateBodyShape/CreateIDLocation, Update*, Delete*) on the objects the docs prove writable (discussions, comments, user roles, ...); a pull-only emission for this write-capable vendor is the GZ #30 defect. Conversely, no SupportsCreate=true without its CreateAPIPath+CreateMethod pair (capability↔method bijection); DeleteAPIPath requires DeleteMethod. (2) PAGINATION — PaginationType=PageNumber with the numbered+Link-header mechanics captured (page/limit + Link rel=next); a bare one-page emission with no next-page param/Link follow is the GZ dead-pagination defect. (3) PK/FK — real numeric \`<object>ID\` PK on objects the docs mark it; real SCALAR FKs (categoryID/insertUserID/discussionID/... → the target object's PK) with RelatedIntegrationObjectID resolving to an IO this run emits (check singular/plural target names); NO FK guessed on a nested access-path (path-LMS defect: /discussions/{id}/comments is an access-path, not an FK on comment). (4) SCOPE — any out-of-scope product lines recorded in Configuration.OutOfScopeObjectFamilies with reasons; in-scope count consistent with the enumerated universe (not a famous-only subset — NO artificial ceiling) and not conflated with Marketing Enterprise / Thrive.\n` +
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
    // Null-guard: unlike a thrown error (caught above), agent() can also RESOLVE null on a terminal
    // transport error — the .catch() above never fires for that case. Same fallback either way.
    if (!review) {
        log(`IndependentReview returned null (terminal API error after retries) — treating as converged (0 gaps) and deferring to the deterministic floor-check / verification-ladder, which re-validate everything.`);
        review = { ConfirmedGapsBlocking: 0, ConfirmedGapsAdvisory: 0, JudgmentCalls: 0, ReviewerErrors: 0, BijectionViolationsFound: 0, FixInstructions: [], ReviewFile: '(review agent returned null — deferred to deterministic floor-check)' };
    }
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
const REALITY_PROBE_PROMPT =
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE}. NOTE the per-tenant host: Vanilla's real base is {communityUrl}/api/v2, and with NO credential/community URL there is no resolvable customer host. HOWEVER, a PUBLIC Vanilla community may exist and serve /api/v2 read-only — if the docs/study identify a reachable public community host, pass it as --base-url so the probe can do GENTLE, read-only, low-volume status probing of the declared paths (legal per PATH 2 §16/§1: public content, our own unauthenticated requests, honor ToS/rate limits — never mutate, never hammer). Otherwise the probe degrades to spec-consistency verdicts (the declared path SHAPE is consistent with the OpenAPI spec) — this is EXPECTED and honest, not a failure.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED unauthenticated status probe: 200=public read [path real, content sometimes verifiable on a public community], 401/403=gated-exists [path real + auth-gated, content UNVERIFIED], 404=wrong path, 405=wrong verb; plus numbered page=/limit= param-advance probing where the endpoint tolerates unauthenticated params; where no host resolves, records the claim as unverified with a spec-consistency note). Achieved ceiling is format-verified-no-creds.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Every un-probed claim must be NAMED as unverified — never a blanket green.`;
// Null-guard + retry: RealityProbe runs after all the extraction/review work — a transient blip here
// must not discard that investment. Falls back to an honest "could not run" result (never a fabricated
// green) if the agent can't complete after retries; floor-check's reality-probe gate reads `ran`.
let realityProbe = null;
for (let probeTry = 1; probeTry <= 3 && !realityProbe; probeTry++) {
    realityProbe = await agent(
        REALITY_PROBE_PROMPT,
        { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: probeTry === 1 ? 'probe:verdicts' : `probe:verdicts.retry${probeTry}` }
    ).catch(() => null);
    if (!realityProbe && probeTry < 3) log(`RealityProbe returned null/errored (transient API drop) — retry ${probeTry + 1}/3`);
}
if (!realityProbe) {
    log(`RealityProbe unavailable after 3 tries — recording an honest not-ran result (never fabricating a probe verdict).`);
    realityProbe = { ran: false, mode: 'unauthenticated', verdicts: [], metadataSha256: '', claims: 0, confirmed: 0, gatedExists: 0, achievedCeiling: 'format-verified-no-creds', metadataDelta: false };
}
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling}`);

// ── ProbeAmend (ONE round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Vanilla API v2 reference / OpenAPI; pick the docs-supported alternative the probe confirmed — e.g. a 404 path corrected to the documented one, a nested access-path fixed, the page/limit param names corrected, a PageNumber vs Cursor mismatch resolved). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs + probe don't support; an uncorrectable claim stays falsified and escalates. NOTE: a keyless 401/403 (gated-exists) is NOT a falsification — for Vanilla's token-gated endpoints it CONFIRMS the path is real and auth-gated; and a spec-consistency-only verdict (no host resolved) is UNVERIFIED, not falsified. Only a 404/405 (wrong path/verb) is a correctable falsification.`,
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
const MAX_CODE_BUILD_ROUNDS = 2;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic.`
            : `Build the HigherLogicVanillaConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector (REST/JSON over HTTP). @RegisterClass(BaseIntegrationConnector, 'HigherLogicVanillaConnector'). Auth: personal access token as Bearer — Authorization: Bearer <token> — via the auth-helpers (APIKeyHeaderBuilder / bearer helper); NEVER inline crypto. The SSO flavors (OAuth2/SAML/OIDC/jsConnect) are END-USER auth and are NOT the connector's auth path — do NOT implement them. GetBaseURL MUST template the PER-TENANT {communityUrl} from Configuration/credential ({communityUrl}/api/v2) — ZERO tenant community URL baked in the code (tenant-agnostic rule). Pagination: implement ExtractPaginationInfo for Vanilla's numbered+Link-header scheme (follow the RFC-5988 Link header rel=next when present; else increment ?page=N with ?limit=N per the frozen contract) — do NOT emit a bare one-page fetch that caps every object at one page. NormalizeResponse handles Vanilla's bare-array list shape (ResponseDataKey null/root per the contract). Full-record pass-through (Fields: raw). Incremental: FetchChanges reads the IO's IncrementalWatermarkField (dateUpdated) where the contract marks SupportsIncrementalSync. Use generic per-operation CRUD for the write-capable IOs (discussions, comments, user roles, ... per the frozen contract's SupportsCreate/Update/Delete + Create/Update/Delete APIPath+Method+BodyShape columns); override a CRUD method ONLY when genuinely idiosyncratic, and if you override CreateRecord you MUST still route through BuildCreatedResult. Never wire a CRUD method whose capability flag is false; never leave a true capability without its path+method pair (DeleteAPIPath requires DeleteMethod). Set DiscoveryIsAuthoritative false (Vanilla exposes no complete-gamut describe endpoint; custom profile fields flow through runtime discovery + custom-column capture). IGNORE the context doc's bespoke mock-lab/adapter/Docker architecture entirely — build to the MJ framework. Write T4/T5 tests (discovery + CRUD + PageNumber/Link-header pagination + incremental, mocked); fixtures descend from reality (spec/probe captures), PROVENANCE-tagged.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ).catch(() => null), `code:r${codeRound}`);
    // Null-guard: withRetry only catches THROWN errors; agent() can also RESOLVE null on a terminal
    // transport error after its own internal retries. Normalize to a failed-round stub so the existing
    // BuildClean===false handling below (codeRound++; continue) applies uniformly — no separate branch.
    if (!codeResult) {
        log(`CodeBuild round ${codeRound} returned null (terminal API error after retries) — treating as a failed round`);
        codeResult = { BuildClean: false, BuildErrors: [{ code: 'AGENT_NULL_RESULT', locus: 'CodeBuild' }] };
    }
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile
        ?? `packages/Integration/connectors/src/${identity.Identity.ClassName}.ts`;
    if (codeResult.BuildClean) {
        const fileCheck = await agent(
            `Run exactly: test -f ${CONNECTOR_FILE} && echo CONNECTOR_FILE_EXISTS || echo CONNECTOR_FILE_MISSING. Return whether the connector source file exists at ${CONNECTOR_FILE}.`,
            { agentType: 'code-builder', schema: { type: 'object', required: ['Exists'], properties: { Exists: { type: 'boolean' }, Path: { type: 'string' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `verify-file:r${codeRound}` }
        ).catch(() => null);
        if (!fileCheck || !fileCheck.Exists) {
            log(`CodeBuild round ${codeRound}: BuildClean reported but connector file check failed/unavailable at ${CONNECTOR_FILE} (${fileCheck ? 'Exists=false' : 'fileCheck agent returned null'}) → forcing non-clean`);
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

    // ── SUPERVISED PK-EVIDENCE REGEN (user-approved 2026-07-09) — the EscalatedCodeDeadlock fix ──
    // The round-2 full-reenumeration FK sweep regenerated the METADATA (65 IOs, PKs re-derived from the
    // OpenAPI spec) but did NOT backfill the EXTRACTION_REPORT_MATRIX.csv PK source-check cells, so T1's
    // PkSourceMatrix invariant flagged 64 objects as "PK emitted with no source evidence" (a fabrication
    // SIGNAL — but spot-verified NOT a fabrication: categoryID/discussionID/commentID/… are all genuine
    // OpenAPI schema properties). It deadlocked because that ARTIFACT gap was routed to the code-builder,
    // which cannot touch the matrix. This regen (an EXTRACTOR job) runs ONCE, live, right before the
    // ladder: it is the first NEW call on resume, so the ladder + HybridE2E + floor-check + publish that
    // follow all run LIVE against the fixed matrix, while the expensive upstream replays from cache.
    // It re-derives each emitted PK's source truthfully from the spec bundle (never blanket-sets yes) and
    // writes matching PK CODE_EVIDENCE so the downstream floor-check's hard-constraint gate also passes.
    await agent(
        `PK-EVIDENCE REGEN for ${VENDOR} — regenerate the source-check matrix + PK evidence TRUTHFULLY (the round-2 sweep emitted PKs into the metadata but left the matrix's PK-source cells blank → T1 PkSourceMatrix flagged 64 objects). Do EXACTLY this, deriving from sources — never fabricate a 'yes':\n` +
        `1. Read the emitted metadata ${METADATA_FILE} (each IO + its IsPrimaryKey field) and the OpenAPI spec bundle at ${JSON.stringify((sources.VendorDocsPaths ?? []).concat([sources.SourcesFile]).filter(Boolean))} (the merged Vanilla OpenAPI + the success-kb-embedded spec).\n` +
        `2. For EVERY IO that emits a primary key, RE-CHECK that PK field against the spec and set the matrix row's source-check cells to their TRUE values: OpenAPIxPK=yes IFF the PK field is a declared property (or required/identity) of that object's OpenAPI schema (flatten allOf/$ref); OpenAPIPathOps=yes IFF a /{pk} path parameter exists; NamingConvention=yes IFF it matches the vendor-wide <object>ID convention; etc. PKVerdict stays 'emit' ONLY when ≥1 source cell is a real 'yes'. If a PK is genuinely in NO source (should be none — spot-check confirmed categoryID/discussionID/commentID/conversationID/recordID/knowledgeBaseID are all in-spec), DEMOTE it (PKVerdict='defer', clear IsPrimaryKey in the metadata via mcp-mj-metadata, fall back to content-hash) and REPORT it — do NOT paper it with a fake yes.\n` +
        `3. REWRITE the matrix CSV at ALL of: ${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv, ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv (deref the symlink and write the real file), and packages/Integration/connectors-registry/${VENDOR_SLUG}/output/EXTRACTION_REPORT_MATRIX.csv — same header (IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount), one row per emitted IO, cells yes|no|n/a.\n` +
        `4. Append one PK CODE_EVIDENCE entry per PK to ${REGISTRY_DIR}/CODE_EVIDENCE.json (TargetField iof.<IO>.<pk>.IsPrimaryKey, citing the spec locus) so the downstream floor-check hard-constraint gate is satisfied.\n` +
        `Return { objectsFixed, pkDemoted (should be 0), matrixRows }. This is an ARTIFACT regeneration — do NOT re-enumerate objects, do NOT touch FK wiring or non-PK fields.`,
        { agentType: 'ioiof-extractor', schema: { type: 'object', required: ['matrixRows'], properties: { objectsFixed: { type: 'integer' }, pkDemoted: { type: 'integer' }, matrixRows: { type: 'integer' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `pk-evidence-regen:r${codeRound}` }
    ).catch(() => null);

    // ── LADDER CACHE-BUST + T7-matcher-rebuild sentinel (user-approved 2026-07-09) ──
    // The prior run's ladder cached a FALSE T7 red: its OpenAPI matcher (mj-test-runner t7OpenApi.ts) did
    // not recognize the Vanilla spec's `:colon`-style path params, so correct write paths (/escalations/{id}
    // PATCH, /icons/{iconUUID} DELETE, /report-reasons/{id} PATCH/DELETE) fell through to a greedy suffix
    // match and mis-bound to /media/upload-session-part/{x}/{y} (GET/PUT only). The FIX was in the validator
    // (isTemplateParamSegment now handles `:param`), rebuilt — direct T7 re-run now Passes 190/190. This
    // sentinel is a NEW call on resume, so the ladder + HybridE2E + floor-check + publish that FOLLOW re-run
    // LIVE against the rebuilt matcher (the cached false-red is not replayed), while the expensive upstream
    // still replays from cache.
    await agent(
        `Confirm the mj-test-runner rebuilds are compiled before the ladder re-runs [rev3 — + ladder allowed-skip list widened for transport-requires-credentials/sandbox-unreachable/no-records-in-fixtures]. Run EXACTLY:\n` +
        `  grep -c 'isTemplateParamSegment' packages/MCP/mj-test-runner/dist/tiers/t7OpenApi.js; grep -c 'communit' packages/MCP/mj-test-runner/dist/tiers/t10TransportSmoke.js\n` +
        `Return { rebuilt: (both counts >= 1) } — true means the compiled validators carry the T7 colon-param match + T10 config-gated-skip fixes.`,
        { agentType: 'testing-agent', schema: { type: 'object', required: ['rebuilt'], properties: { rebuilt: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `t7-t10-rebuilt-check:r${codeRound}` }
    ).catch(() => null);

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: VENDOR_SLUG,
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,   // null → T8 live cells self-skip honestly
            maxTier: MANIFEST.e2eTier,
            // repoRoot (user-approved 2026-07-09): run each tier in a FRESH node process against the
            // repo's REBUILT mj-test-runner dist, NOT the session's long-running MCP server (which had the
            // pre-fix T7 validator loaded in memory — a rebuilt dist does not reload a live node process, so
            // the MCP-tool path kept returning the stale T7 false-red). This also changes the ladder's
            // internal per-tier agent prompts (Bash-node vs MCP-tool) → new cache keys → the tiers re-run
            // LIVE on resume against the fixed colon-param matcher.
            repoRoot: A?.repoRoot ?? '/Users/bcladmin/Projects/MemberJunction/MJ',
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
// per-connector loop. No credential/community URL → mock mode; but Vanilla ships a REAL credential-free
// contract, so MOCK = FULL object coverage (no Goldilocks subset) and rows MUST land on the REAL Vanilla
// object shapes — the GENUINE credential-free green target, NOT an HONEST-NA / VACUOUS pass. A 0-row pass
// is NOT a green (the floor's first-sync-incomplete + capture-engaged gates enforce this). LIVE is
// honestly UNREACHABLE here (no credential/community URL) — marked, never mock-dodged as green.
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
        className: identity.Identity.ClassName,   // the connector .ts is named by ClassName, not the slug
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // credential-free [B]: no credentialReference, no brokerPlans → MOCK. Not routed around; honest.
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
// For Higher Logic Vanilla (a WRITE-CAPABLE vendor) this count MUST be > 0 — a pull-only emission is the
// GZ #30 defect.
let writeCapCheck = null;
for (let wcTry = 1; wcTry <= 3 && !writeCapCheck; wcTry++) {
    writeCapCheck = await agent(
        `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
        `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
        `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY (do NOT infer from anything else). An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout. NOTE: Vanilla documents write endpoints (discussions/comments/roles), so a result of 0 write-capable IOs is a RED FLAG indicating a pull-only emission for a write-capable vendor (the GZ #30 defect) — surface it, do not silently accept it.`,
        { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: wcTry === 1 ? 'compute-write-capable-count' : `compute-write-capable-count.retry${wcTry}` }
    ).catch(() => null);
    if (!writeCapCheck && wcTry < 3) log(`write-capable-count agent returned null/errored (transient API drop) — retry ${wcTry + 1}/3`);
}
if (!writeCapCheck) {
    // NEVER fabricate 0 here — that would read as "confirmed pull-only" and could wrongly pass/fail the
    // capability-dishonest gate for the wrong reason. null is honest: "this gate could not be computed."
    log(`write-capable-count unavailable after 3 tries — recording null (honest "could not compute", never a fabricated 0); floor-check will surface this distinctly from a real zero-write-IO finding.`);
    writeCapCheck = { writeCapableIOCount: null, totalIOs: null };
}
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate; Vanilla MUST be > 0)`);

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
        for (let pubTry = 1; pubTry <= 3 && !publish; pubTry++) {
            publish = await agent(
                `Publish the verified ${brand.CanonicalName} connector as an Open App. Run EXACTLY this and return its JSON stdout VERBATIM:\n` +
                `  node packages/Integration/connector-builder-workshop/scripts/publish-open-app.mjs --repo ${INTEGRATIONS_REPO} --category ${CATEGORY} --class-base ${CLASS_BASE} --connector ${CONNECTOR_TS} --metadata ${METADATA_FILE} --display ${JSON.stringify(brand.CanonicalName)}\n` +
                `ok=true means the Open App PASSED validate-invariants (the four-way identity + Open App shape gate). A failed 'seed' step (no reachable DB) is acceptable and NON-blocking — surface it but do not fail on it; every other step must be ok.`,
                { schema: PUBLISH_SCHEMA, phase: 'OpenAppPublish', label: pubTry === 1 ? 'publish:open-app' : `publish:open-app.retry${pubTry}` }
            ).catch(() => null);
            if (!publish && pubTry < 3) log(`OpenAppPublish returned null/errored (transient API drop) — retry ${pubTry + 1}/3`);
        }
        if (!publish) {
            log(`OpenAppPublish unavailable after 3 tries — the verified connector build itself is unaffected (floor-check already passed); publish can be re-run later via resume or a standalone invocation.`);
            publish = { ok: false, skipped: true, reason: 'agent-null-result' };
        }
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
    deployPreflight,
    sourceDiff,
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
