// personify360.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Personify360 — an enterprise Association Management System (AMS) by Personify, Inc.
//   (personifycorp.com; the AMS line is now part of Community Brands). Persona-based AMS built on the
//   TIMSS data model, organized into SUBSYSTEMS (modules): CUS (customers — individuals & organizations),
//   MBR (membership), ORD (order/e-commerce), PRODUCT/inventory, MTG (meetings/events), SUB (subscriptions),
//   CRT (certification), CMT (committees), EXH (exhibits), FND (fundraising), MKT (marketing), + reference
//   data. Category: AMS.
// Mode: NEW (v1.0.0 birth; no prior Personify360 metadata file / DB row / connector .ts / corpus entry —
//   confirmed: registry dir empty, no metadata/integrations/personify360/, no Personify360Connector.ts).
// Credential: NONE at build ([B] credential-free run). credentialReference=null, no brokerPlans. The full
//   non-live PATH-2 suite runs against Personify360's PUBLIC docs: the Personify Online Help
//   (resource1.personifycorp.com — Universal & Simple Web Services overview, Web Services Designer, Data
//   Services config), the Personify360 Data Dictionary PDF (762 TIMSS tables — the machine-readable-ish
//   schema authority), the published Postman workspace (postman.com/personifycorp), and the Higher Logic
//   Personify360 integration guide. Schema/contract validation, mock-server-from-fixtures (T5), endpoint/
//   header probing, bijective completeness. NO live SOAP calls, NO credentialReference, NO brokerPlans.
//
// ⚠️ DISAMBIGUATION (BINDING — a THREE-WAY name-collision minefield; STUDY-detects-tension-and-REJECTS):
//   "Personify" resolves to at least THREE unrelated companies. Only ONE is this vendor.
//   • ✅ TARGET — Personify360 / Personify Corp (personifycorp.com): the enterprise AMS. TIMSS data model,
//       SOAP Universal/Simple Web Services. THIS is what we build.
//   • ❌ REJECT — docs.personify.be ("Personify", a BELGIAN event/community-engagement SaaS with a modern
//       REST API — concepts/api-based, /development/rest-api). A NAME COLLISION, NOT the AMS. Its REST paths,
//       objects, and auth MUST NOT bleed into this build. (This is the Impexium-vs-ImpexDocs failure class.)
//   • ❌ REJECT — developers.personifyhealth.com ("Personify Health", formerly Virgin Pulse — a health &
//       wellbeing platform). Different company, different domain. MUST NOT leak in.
//   The brand/nature study + source-auditor MUST detect these collisions and REJECT them as provably-wrong-
//   for-this-vendor (context is trusted-where-it-speaks ONLY while independent evidence doesn't contradict it;
//   these are REJECTED, not down-weighted), and record how they were told apart in Disambiguation.
//
// ⚠️ SCOPE (Personify-OWNED but OUT-OF-SCOPE separate products — record with reason, do NOT model):
//   Personify Inc. also owns/operates SEPARATE products with their OWN API surfaces — a2z Events (event/expo
//   management), WebLink Connect (mid-market AMS), Wild Apricot (small-org membership — which ALREADY has its
//   own MJ connector, WildApricotConnector.ts; do NOT collide), and the newer "Novus APIs" reporting/automation
//   surface. The IN-SCOPE modeled surface is the Personify360 flagship AMS Universal/Simple Web Services over
//   the TIMSS subsystem objects. The siblings above go to Integration.Configuration.OutOfScopeObjectFamilies
//   WITH REASONS so the broader nature is documented and a future build can expand without re-discovering.
//   Enumerate the FULL in-scope TIMSS subsystem object universe — NO artificial famous-few cap (the Salesforce
//   under-enumeration class); the Data Dictionary proves 700+ tables, so chunk-and-continue over the real set.
//
// WHY THE VENDOR-SPECIFIC SHAPE (grounded in Personify360's REAL, documented nature):
//   • vendorShape = SOAP+partner. Personify Web Services = the Universal Web Service + Simple Web Service,
//     SOAP 1.x / ASMX over HTTP ("callable from any SOAP or HTTP-enabled client"; example ops GetCustomerName,
//     GetInfo, Get/Create/Update). There is NO vendor-published REST OpenAPI for the AMS (docs.personify.be
//     REST is the WRONG vendor). SOAP rides over BaseRESTIntegrationConnector — the ONLY protocol bases the
//     engine exports are BaseIntegrationConnector + BaseRESTIntegrationConnector; there is NO
//     BaseSOAPIntegrationConnector. The proven precedent is packages/Integration/connectors/src/
//     MagnetMailConnector.ts (SOAP 1.1 over BaseRESTIntegrationConnector): the SOAP ENVELOPE is built inside
//     MakeHTTPRequest, dispatch is by the SOAPAction header + body element (NOT the URL), the per-object SOAP
//     OPERATION name is read from the IO, and Create/Update BodyShape = 'literal'. Personify360 follows this
//     pattern exactly.
//   • Auth = UNVERIFIED at plan time (provable-only applies to AUTH too). Personify Data Services docs state
//     it "does not support any authorization through Personify Data Services" and the "user name/password
//     will be in the web.config" — i.e. the deployment holds a service credential, and an external SOAP/HTTP
//     client authenticates via a per-deployment web-service URL + username/password (HTTP Basic or a
//     credentials SOAP header — like MagnetMail's <mmAuthHeader> session pattern). Best-evidence credential
//     SHAPE = per-deployment web-service base URL + username + password; the exact FLOW (basic vs SOAP-header
//     vs login→session) stays UNVERIFIED until SourceAudit confirms it from primary docs, with an honest
//     fallback. A keyless RealityProbe structurally CANNOT verify a SOAP auth flow, so the ceiling stays
//     format-verified-no-creds. Whatever the confirmed flow, credentials are handled via auth-helpers, NEVER
//     inline crypto. Recorded in Integration.Configuration.AuthModel + the manifest.
//   • Base URL: PER-DEPLOYMENT (each customer hosts/receives its own Personify web-service endpoint, e.g.
//     https://<host>/PersonifyServices/.../asmx). This is a per-connection config value, NOT a build-time
//     constant. GetBaseURL templates it from Configuration/credential; the connector CODE carries ZERO
//     deployment host (tenant-agnostic rule). Mock mode uses the documented SOAP operation/path shapes, so
//     the missing host does NOT block the credential-free green — it only blocks the LIVE round-trip.
//   • Pagination: SOAP query operations return result SETS, not REST cursors. PaginationType is provable-only
//     per object — default None (full-set fetch per operation) unless a specific Universal Web Service query
//     documents a batch/page parameter (then Offset/PageNumber with the real param encoded in Configuration).
//     Do NOT fabricate a REST cursor the SOAP surface doesn't have.
//   • Incremental: TIMSS carries last-modified / transaction-date columns, and some Universal Web Service
//     queries can filter by a modified-date. SupportsIncrementalSync=true ONLY where a modified-date/
//     changed-since filter is docs-provable; IncrementalWatermarkField = that documented column. Provable-only
//     elsewhere → unset.
//   • Relationship model: TIMSS scalar FKs across subsystems (CUS_ID / master customer, ORD_NO, PRODUCT_ID,
//     SUB_ID, MEETING_ID, ...). Real SCALAR id FKs → RelatedIntegrationObjectID resolving to an emitted IO.
//     Sub-entity collections returned WITHIN a business object (e.g. a customer's addresses/phones/emails)
//     are ACCESS-PATHS in Configuration, NOT FKs (the path-LMS defect: a nesting edge is an access-path, an
//     FK is a scalar referencing a PK).
//   • WriteCapability (BINDING per v2 P5): Personify Web Services DOCUMENT Create/Update operations (Get,
//     Create, Update across CUS/ORD/MBR/... — the WSD defines Read/Write entities). This connector MUST NOT
//     ship pull-only (the GZ #30 defect). SupportsCreate/Update (+ Delete where documented) + the per-operation
//     CRUD columns are emitted where the docs prove the SOAP operation (operation name + body shape 'literal'
//     + id location); the capability-dishonest floor gate proves the write count is non-zero.
//   • Rate limits: NOT documented for the on-premise/hosted web services → BatchMaxRequestCount/
//     BatchRequestWaitTime null (provable-only); record any operational guidance in Configuration as awareness.
//   • Authoritative enumeration: NO single describe-all endpoint returning the complete gamut the credential
//     can access — WSD entities are admin-defined PER DEPLOYMENT, and the Data Dictionary is a static PDF, not
//     a runtime describe. So DiscoveryIsAuthoritative stays FALSE (default) — absence proves nothing, nothing
//     deactivates; custom/deployment-specific fields flow through runtime Discovered + framework custom-column
//     capture.
//
// RISK-CALIBRATED KNOBS (vs template defaults):
//   - adversarialN = 3  → RISK-WEIGHTED UP. Personify360 is (a) write-capable (CRUD correctness matters more),
//     (b) SOAP over Tier-2/3 PROSE docs + Postman with NO vendor OpenAPI, (c) has NO live RealityProbe
//     confirmation possible in this credential-free per-deployment run, and (d) sits in a three-way name-
//     collision minefield (contamination risk). Multiple risk signals ⇒ N=3, not the N=2 default. Reviewers
//     read COUNTS + a SAMPLE (a count-reconcile the agent RUNS), never the full source in context — so N=3
//     buys correctness cheaply. Does NOT drop to N=1 (that requires empirical live confirmation, impossible
//     for a credential-free partner-gated SOAP AMS).
//   - loopUntilDry K = 3 → doc coverage expected < 0.7 (prose Online Help + a Data Dictionary PDF + Postman,
//     no vendor OpenAPI) — K=3 per the < 0.7 rule so the extract pipeline sweeps the subsystem surface.
//   - MAX_AMENDMENT_ROUNDS = 1, MAX_CODE_BUILD_ROUNDS = 2 → TOKEN-EFFICIENCY caps per the planner role +
//     this run's directive. With MAX_AMENDMENT_ROUNDS=1 the extract loop runs round 0 (extract+freeze+review)
//     and, on a residual io/iof blocking gap that is NOT all-connector-slot, escalates to the coordinator
//     (EscalatedMaxRounds) rather than spending a re-extract pass — the mechanical gates (0-field hard-fail,
//     enforce-finding-floor, compute-source-diff, T1 invariants, terminal floor-check) are the completeness
//     backstop, and a resume can bump the cap surgically (the proven impexium pattern). The code loop keeps
//     cap 2 (round 0 build+ladder + ONE real ladder-fix pass). Fingerprint-deadlock + connector-slot deferral
//     are preserved on both loops. This is a deliberate, resume-recoverable tradeoff, NOT a weakening of any
//     locked primitive.
//   - maxTier = T8      → credential-free ceiling (from the run request). verification-ladder T0..T8 are ALL
//     credential-free. The LIVE round-trip ceiling is format-verified-no-creds (no credential + per-deployment
//     host unresolvable); HybridE2E runs MOCK. The non-live suite runs to FULL extent regardless.
//
// GENUINE-GREEN-MOCK vs HONEST-NA (state it honestly): Personify360's documented SOAP operation shapes + the
//   Data Dictionary field model + Postman examples make the mock-server-from-fixtures tiers genuinely useful,
//   so the target is GENUINE-GREEN-MOCK — HybridE2E runs MOCK and MUST LAND ROWS on the real object shapes
//   (FULL object coverage, no Goldilocks subset — mock = free = all objects). If SourceAudit finds the concrete
//   request/response shapes are too partner-gated to author faithful fixtures for enough objects, the honest
//   outcome is HONEST-NA (deploys clean; needs a live credential to prove sync) — NOT a fabricated green. A
//   0-row pass is NEVER a genuine green. Residual gap (live round-trip, confirmed SOAP auth behavior, true
//   throughput, write side-effects, incremental completeness) is stated plainly; a self-serve/partner sandbox
//   would later promote this to a live read path.
//
// LOCKED-PRIMITIVE COMPOSITION, the freeze-contract gate, the terminal bijection floor-check, the different-
// model (sonnet) adversarial review, and BOTH amendment loops (slot-routing + byte-identical-fingerprint
// deadlock detection) are PRESERVED from _TEMPLATE.workflow.js — never a single-return-on-first-gap.
// CHEAPEST-DEFECT-FIRST ordering: EnvPreflight (abort cheap) → offline structural extract → DeployPreflight
// (DB-FREE reconcile BEFORE any push) → offline behavioral ladder (T5 mock-HTTP + T6 SQLite early) → the
// heaviest HybridE2E DB push last. Isolated infra (dedicated SQL container/port/MJAPI port) is injected
// post-emission via args.dbProfile/args.mjapi — NEVER the shared workbench coords.

export const meta = {
    name: 'personify360-build',
    description: 'Workshop dynamic-workflow NEW (v1.0.0) build for Personify360 (Personify Inc enterprise AMS; SOAP Universal/Simple Web Services over the TIMSS subsystem data model; SOAP rides BaseRESTIntegrationConnector per the MagnetMail precedent — envelope built in MakeHTTPRequest, dispatch by SOAPAction+body element, per-object operation from the IO, BodyShape=literal; auth UNVERIFIED at plan time (per-deployment web-service URL + username/password, HTTP-Basic or credentials SOAP header — SourceAudit confirms, honest fallback); per-deployment base URL; result-set (mostly None) pagination; changed-since incremental on some entities; WRITE-CAPABLE; rich TIMSS subsystem object universe). THREE-WAY name-collision minefield — REJECT docs.personify.be (Belgian event SaaS REST) and developers.personifyhealth.com (Personify Health / ex-Virgin Pulse); OUT-OF-SCOPE Personify-owned siblings a2z Events / WebLink Connect / Wild Apricot / Novus recorded with reason. Credential-free [B] run → GENUINE-GREEN-MOCK target (mock lands rows on real shapes) or HONEST-NA if shapes too partner-gated. Locked primitives + bijection floor-check + different-model adversarial review + both amendment loops. adversarialN=3 + K=3 (write-capable + SOAP docs-only + collision risk). MAX_AMENDMENT_ROUNDS=1 / MAX_CODE_BUILD_ROUNDS=2 (token-efficiency, resume-recoverable). maxTier T8 (credential-free ceiling; live self-skips honestly).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'Resolve canonical Personify360 brand + ProductTaxonomy + Open App Category (expect AMS). Establish the REAL TIMSS-subsystem object/capability universe INDEPENDENTLY. REJECT docs.personify.be (Belgian event SaaS) and developers.personifyhealth.com (Personify Health / ex-Virgin Pulse) as name collisions. Record a2z Events / WebLink / Wild Apricot / Novus as out-of-scope siblings. WriteCapability BINDING (v2 P5) — Personify Web Services HAVE Create/Update ops; prove it, do not assume pull-only.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (Personify360Connector). Credential type match-or-create against the STRONGEST-EVIDENCE web-service auth shape (per-deployment web-service base URL + username + password). Auth FLOW UNVERIFIED at plan time (SOAP — HTTP-Basic vs credentials SOAP header vs login→session); SourceAudit confirms/adjusts, honest fallback. Must NOT collide with WildApricotConnector (a Personify-owned SIBLING product) or any personify.be / Personify Health identity.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: the Personify Online Help (resource1.personifycorp.com — Universal & Simple Web Services overview, Web Services Designer, Data Services config) + the Personify360 Data Dictionary PDF (762 TIMSS tables — highest machine-readable-ish schema authority; FETCH+SAVE) + the Postman workspace (postman.com/personifycorp — operation + example fixtures) + the Higher Logic Personify360 integration guide. EXCLUDE docs.personify.be + developers.personifyhealth.com. Note the personifycorp help site may have a TLS/cert issue — use archived/PDF/Postman mirrors. Build SOURCE_STUDY (COVERABLE vs INFORMATIONAL). Emit TaxonomyLeaves = the in-scope TIMSS subsystem object leaves the docs prove.' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (Configuration.AuthModel = auth UNVERIFIED, best-evidence per-deployment URL + username/password SOAP web-service auth; per-deployment base-URL template + host config key; SOAP dispatch model note; PaginationType provable-only [None default for full-set SOAP ops]; changed-since incremental; SOAPProtocol/operation-dispatch note; OutOfScopeObjectFamilies with reasons; DiscoveryIsAuthoritative=false). PaginationType must be a valid enum {None,Cursor,Offset,PageNumber}.' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back). REAL TIMSS subsystem objects + real record identifiers + real scalar FKs + per-operation CRUD columns (SOAP operation names; BodyShape=literal) where docs prove write ops. Business-object sub-collections = access-paths in Configuration, NOT guessed FKs. Provable-only type/PK/watermark; unprovable → unset. Full-record pass-through. NO artificial object ceiling — chunk-and-continue over the TIMSS universe.' },
        { title: 'DeployPreflight', detail: 'CHEAP, DB-FREE reconciliation of authored metadata to the DEPLOYED schema BEFORE any push (metadata-file-conventions § Preflight, REQUIRED): real deployed columns; enum/CHECK validity (PaginationType∈{None,Cursor,Offset,PageNumber}; Create/Update BodyShape∈{flat,wrapped,literal}; *IDLocation; MetadataSource); parent-FK presence (@parent:ID) + @lookup qualifier (&IntegrationID=@parent:IntegrationID, NEVER @parent:ID); CredentialType @lookup target exists; Description ≤ NVARCHAR(255) + no duplicate IOF Name within an IO. Soft/advisory (retried), cheapest-defect-first.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — never blocks probe-driven amendments.' },
        { title: 'IndependentReview', detail: 'ONE round (per amendment iteration), refocused charter (coverage-vs-script / bijection / capability-honesty / naming / collision-contamination). Different model (sonnet). LINT — cannot certify model-vs-world. N=3 lenses (correctness / FK-integrity / capability-honesty).' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim probe. Per-deployment SOAP hosts are all auth-gated with no public unauthenticated door, so this is mostly DNS/TLS reachability + spec-consistency verdicts (declared operation/path SHAPE consistent with the docs); a 401/403 on any reachable web-service host = path real + gated (content UNVERIFIED). Ceiling format-verified-no-creds; every un-probed claim NAMED. NEVER authors metadata.' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from docs, confirmed by re-probe). Reality outranks the contract.' },
        { title: 'CodeBuild', detail: 'Personify360Connector over BaseRESTIntegrationConnector (SOAP over HTTP per the MagnetMail precedent). Auth per the FROZEN CONTRACT AuthModel via auth-helpers (NEVER inline crypto); GetBaseURL templates the per-deployment host; MakeHTTPRequest builds the SOAP envelope + SOAPAction header; NormalizeResponse parses the SOAP/XML response; per-operation SOAP op names + BodyShape=literal for write-capable IOs. Fixtures descend from reality (Postman/docs captures) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). Full non-live suite: schema/contract validation vs docs + Data Dictionary + Postman, mock-server-from-fixtures (T5), pagination replay, endpoint/header probing, bijective completeness, T6 SQLite, failure-mode injection (T8: 429/500/timeout/bad-XML retry+classify).' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB, ISOLATED infra (args.dbProfile/args.mjapi — never the shared workbench). GENUINE-GREEN-MOCK target — MOCK = FULL object coverage; rows MUST land on the REAL Personify360 object shapes (no Goldilocks subset). Outcome gates: rowcounts vs ground truth, two-pass zero-growth, first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md. LIVE honestly UNREACHABLE (no credential/deployment host) — marked, not mock-dodged as green.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty [Personify360 IS write-capable — must be non-zero], env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling (format-verified-no-creds).' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under AMS: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/maxTier/dbProfile/mjapi silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'personify360';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const INTEGRATIONS_REPO = A?.integrationsRepo ?? '../Integrations';
const PUBLISH_OPEN_APP = A?.publishOpenApp !== false;   // default ON
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;

// Resilient handoff (v2): a transport blip on an agent() handoff must NOT discard a hard-won result or abort
// a long build. A real stage failure (schema-invalid, build error) is RETURNED by the agent and routes to the
// amendment loop — it is NOT a transport error and is NOT retried here.
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
// adversarialVerifyMinReviewers = 3 (RISK-WEIGHTED UP: write-capable + SOAP Tier-2/3 docs-only + no live
// confirmation + collision risk). Reviewers read counts+sample, never the full source.
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',                 // credential-free ceiling; live self-skips honestly
    adversarialVerifyMinReviewers: 3,
};
// loop-until-dry K = 3 (doc coverage expected < 0.7 — prose Online Help + Data Dictionary PDF + Postman, no vendor OpenAPI).
const LOOP_UNTIL_DRY_K = 3;

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
    `   NOTE: --allow-generated-churn is INTENTIONAL — the branch carries pre-existing ADDITIVE generated-tree drift from concurrent connector work. This build runs on FULLY ISOLATED infra (its own SQL container + DB + MJAPI port, injected into the HybridE2E call) and HybridE2E snapshots+restores the generated tree around its in-place codegen, so the shared tree is never consumed or clobbered. The waiver RECORDS the churn (generatedChurnWaived=true + generatedChurn[]) rather than failing on it. Do NOT git-restore or otherwise mutate the shared generated tree.\n` +
    `2. DB reachable + highest applied migration version (env-specific — per the runbook's sqlcmd probe against THIS run's ISOLATED DB, not the shared workbench); fill dbReachable/migrationLevel.\n` +
    `3. If the script reports staleNestedDists: SYNC each nested dist from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN the script, and set resolved=true ONLY when the re-run is clean. Do NOT attempt to restore generated churn — it is waived above.\n` +
    `Abort-cheap contract: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
).catch(() => null);
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
        Category: { type: ['string', 'null'] },   // expect 'AMS'
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
    `Research vendor "${VENDOR}" = Personify360, an enterprise Association Management System (AMS) by Personify, Inc. (personifycorp.com; AMS line now part of Community Brands). Resolve canonical name ("Personify360" / "Personify"), description, navigation URL (the Personify help/docs site — VERIFY it resolves; note the personifycorp help host may have a TLS/cert issue, use an archived/alternate if so), icon class, ProductTaxonomy, and Open App Category (expect 'AMS'; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `DISAMBIGUATION (BINDING — a THREE-WAY name collision; DETECT AND REJECT the two wrong ones): (1) docs.personify.be is "Personify", a BELGIAN event/community-engagement SaaS with a modern REST API — it is NOT the AMS; do NOT cite it, import its REST objects, or its auth. (2) developers.personifyhealth.com is "Personify Health" (formerly Virgin Pulse), a health & wellbeing platform — a DIFFERENT company; do NOT import anything from it. The TARGET is ONLY Personify360 / Personify Corp (personifycorp.com — TIMSS AMS, SOAP Universal/Simple Web Services). Populate Disambiguation with how you told them apart. ALSO note (out-of-scope, NOT collisions): Personify Inc also owns SEPARATE products with their own APIs — a2z Events (event/expo), WebLink Connect (mid-market AMS), Wild Apricot (small-org membership — already has its own MJ connector), and the newer "Novus APIs" surface; these are recorded as out-of-scope siblings, not modeled.\n` +
    `CRITICAL — establish the REAL API NATURE independently from Personify360's OWN docs (resource1.personifycorp.com Personify Online Help — the Universal & Simple Web Services overview, the Web Services Designer, Understanding Personify Data Services Configuration; the Personify360 Data Dictionary PDF; postman.com/personifycorp; the Higher Logic Personify360 integration guide):\n` +
    `  • Object families the API exposes — TIMSS subsystems / modules: CUS (customers — individuals & organizations, addresses/phones/emails), MBR (membership, member types, dues), ORD (orders, order lines, payments, e-commerce), PRODUCT/inventory, MTG (meetings/events, registrations, sessions, speakers), SUB (subscriptions), CRT (certification, education, credits), CMT (committees, positions, members), EXH (exhibits/exhibitors), FND (fundraising, gifts, pledges, campaigns), MKT (marketing), + reference data. Emit ALL discovered into ObjectFamilies (awareness) — do NOT cap at a famous-few subset; the Data Dictionary proves 700+ tables.\n` +
    `  • Auth model — UNVERIFIED; DETERMINE the web-service auth from PRIMARY sources and represent it HONESTLY (provable-only applies to auth). Personify Data Services docs state it "does not support any authorization through Personify Data Services" and the "user name/password will be in the web.config" — so an external SOAP/HTTP client authenticates via a per-deployment web-service URL + username/password (HTTP Basic, or a credentials SOAP header like MagnetMail's session pattern, or a login→session op). Report the best-evidence credential SHAPE (per-deployment web-service base URL + username + password) but flag the FLOW as UNVERIFIED needing SourceAudit confirmation. Do NOT assert a specific handshake as settled.\n` +
    `  • Protocol — SOAP (Universal Web Service + Simple Web Service, ASMX over HTTP; example ops GetCustomerName, GetInfo, Get/Create/Update). NOT REST (docs.personify.be REST is the WRONG vendor). Dispatch is by SOAPAction + body element.\n` +
    `  • WriteCapability (BINDING per v2 P5): Personify Web Services DOCUMENT Create/Update operations (the WSD defines Read/Write entities; Get/Create/Update across CUS/ORD/MBR/...). Confirm with evidence and populate WriteCapability with the object→operation map. A pull-only connector for this write-capable vendor is the GZ #30 defect — do NOT conclude read-only.\n` +
    `  • Pagination — SOAP query ops return result SETS, not REST cursors → PaginationType provable-only (None default; Offset/PageNumber only where a query documents a batch/page param). Incremental — TIMSS last-modified/transaction-date columns; some Universal Web Service queries filter by modified-date → IncrementalWatermarkField per object where provable. Rate limits — not documented for the hosted web services (leave null, record awareness). Custom/deployment-specific WSD entities+fields are runtime-discoverable. "What else": SSO, Data Services config, a2z/WebLink/Novus adjacent surfaces (out of scope).\n` +
    `Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
).catch(() => null);
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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol Personify360Connector, ClassName = Personify360Connector in the MJ sandbox; registry slug ${VENDOR_SLUG}). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's ConnectionConfig key shape. Auth is UNVERIFIED at plan time (provable-only, SOAP); provision the CredentialType for the STRONGEST-EVIDENCE web-service shape = per-deployment web-service base URL + username + password (identity-establisher §"Credential type: match-or-create"). If SourceAudit later CONFIRMS a specific SOAP-header/session/basic model for the raw web service, the CredentialType is adjusted then; do NOT assert a specific flow as settled now. ExistsInDB MUST confirm this is a NEW build (no prior Personify360 Integration row / connector .ts). Do NOT collide with WildApricotConnector (a Personify-OWNED SIBLING product with its OWN MJ connector) or any personify.be / Personify Health identity. Set the universalPK Configuration hint ONLY if the docs authoritatively document a vendor-wide record-id convention (TIMSS keys vary per subsystem — likely leave PK to the extractor per-object).`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: `identity:${VENDOR_SLUG}` }
).catch(() => null);
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
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: the Personify Online Help (resource1.personifycorp.com — the Universal & Simple Web Services Overview, Starting the Web Services Designer, Understanding Personify Data Services Configuration, the Subsystems page) → the Personify360 Data Dictionary PDF (762 TIMSS tables — the highest machine-readable-ish schema authority; FETCH and SAVE it — it drives bijective completeness + field types) → the published Postman workspace (postman.com/personifycorp — SOAP operation shapes + example fixtures for the mock tiers) → the Higher Logic Personify360 integration guide (field-level mapping). EXCLUDE docs.personify.be (Belgian event SaaS — WRONG vendor) and developers.personifyhealth.com (Personify Health — WRONG vendor); do NOT fetch, cite, or use them. NOTE: the personifycorp help host may present an expired/invalid TLS cert — if so, use archived (web.archive.org) or PDF/Postman mirrors rather than skipping the source.\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the COVERABLE in-scope TIMSS subsystem object set the docs prove (customers/individuals, organizations, addresses, phones, emails, memberships, member-types, orders, order-lines, payments, products, meetings/events, event-registrations, sessions, speakers, subscriptions, certifications, education/credits, committees, committee-members, positions, exhibits, exhibitors, fundraising-gifts, pledges, campaigns, reference data, and any others the Data Dictionary / help center enumerate). NO artificial object ceiling — enumerate the FULL in-scope AMS universe.\n` +
    `For each object capture: its Universal/Simple Web Service operation + the .asmx endpoint APIPath (the SOAP endpoint path — the SAME for all ops on a service; the OPERATION distinguishes read/create/update), the SOAP operation NAMES for list/get/create/update/delete (→ Configuration + the per-operation CRUD columns; BodyShape='literal' because the connector builds the SOAP envelope), the response envelope/data key (→ ResponseDataKey), the pagination shape (provable-only — None for a full result-set op; Offset/PageNumber only where a query documents a batch/page param + size), the incremental cursor where applicable (a modified-date/last-transaction-date/changed-since filter → IncrementalWatermarkField). Distinguish business-object SUB-COLLECTIONS returned within a record (a customer's addresses/phones/emails) as access-paths in Configuration from real scalar id FKs (CUS_ID/ORD_NO/PRODUCT_ID/... → RelatedIntegrationObjectID). Record known-but-out-of-scope families (a2z Events, WebLink Connect, Wild Apricot, Novus APIs) in outOfScopeFamilies WITH REASONS (→ Integration.Configuration.OutOfScopeObjectFamilies). Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read). Populate VendorDocsPaths/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them. CONFIRM the raw web-service AUTH FLOW (HTTP-Basic vs credentials SOAP header vs login→session) from primary docs and represent it honestly with a fallback if unconfirmable. Personify360 publishes NO vendor OpenAPI, so doc coverage is likely < 0.7 — say so in Gaps so the extract loop keeps K=3.`;
// Null-guard + retry (resilient handoff): SourceAudit is expensive (real web research) and everything
// downstream depends on it — a transient transport blip must not discard banked brand/identity work.
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL (the Personify help/docs URL — VERIFY reachable; or the per-deployment web-service template), BatchMaxRequestCount/BatchRequestWaitTime (ONLY from an explicitly-documented RAW API limit — provable-only; leave null if undocumented for the hosted web services, record any awareness in Configuration), and a Configuration.AuthModel block recording auth as UNVERIFIED at plan time (provable-only): strongest-evidence = per-deployment web-service base URL + username/password SOAP web-service auth (HTTP-Basic or a credentials SOAP header; SourceAudit/the frozen contract confirm the exact flow with an honest fallback). Record the SOAP protocol note (Universal/Simple Web Services, ASMX, dispatch by SOAPAction+body element, envelope built in MakeHTTPRequest per the MagnetMail precedent), the PER-DEPLOYMENT base-URL template + the host config key name, the pagination shape (PaginationType provable-only — None default for full result-set SOAP ops), the changed-since incremental mechanics per object where provable, and OutOfScopeObjectFamilies (${JSON.stringify(sources.outOfScopeFamilies ?? ['a2z Events', 'WebLink Connect', 'Wild Apricot', 'Novus APIs'])}) with reasons. PaginationType must be a valid enum {None,Cursor,Offset,PageNumber}. Set DiscoveryIsAuthoritative=false (no complete-gamut describe endpoint; WSD entities are per-deployment; custom fields flow through runtime discovery + custom-column capture) with rationale. Do NOT bake any deployment host into metadata — it is a per-connection config value (tenant-agnostic rule). Do NOT import anything from docs.personify.be or developers.personifyhealth.com (different vendors).`,
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

// MAX_AMENDMENT_ROUNDS = 1 (token-efficiency, per the planner role + this run's directive). Round 0 =
// extract+freeze+review; a residual io/iof blocking gap that is NOT all-connector-slot escalates to the
// coordinator (EscalatedMaxRounds) rather than spending a re-extract pass. The deterministic mechanical gates
// (0-field hard-fail, enforce-finding-floor, compute-source-diff, T1 invariants, terminal floor-check) are the
// completeness backstop, and a resume can bump this cap surgically (proven impexium pattern). Fingerprint
// deadlock detection + connector-slot deferral + slot-routing are preserved. This is a deliberate,
// resume-recoverable tradeoff — NOT a weakening of any locked primitive.
const MAX_AMENDMENT_ROUNDS = 1;
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
            outOfScopeFamilies: sources.outOfScopeFamilies ?? ['a2z Events', 'WebLink Connect', 'Wild Apricot', 'Novus APIs'],
            scopeReason: brand.ScopeReason ?? 'the documented Personify360 Universal/Simple Web Services over the TIMSS subsystem data model are the credential-free contract; model the full in-scope AMS object universe the docs enumerate (customers/individuals/organizations/memberships/orders/products/meetings/registrations/subscriptions/certifications/committees/exhibits/fundraising/reference-data); record the Personify-owned SEPARATE products (a2z Events, WebLink Connect, Wild Apricot, Novus APIs) as out-of-scope with reason',
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            loopUntilDryK: LOOP_UNTIL_DRY_K,
            sourceBundle: {
                // NEW build — no existing connector .ts / prior metadata (reading OUTPUT is forbidden).
                // Do NOT let docs.personify.be (Belgian event SaaS) or developers.personifyhealth.com
                // (Personify Health) enter any source path — they are not Personify360 docs.
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
    phase('DeployPreflight');
    deployPreflight = null;
    for (let dpTry = 1; dpTry <= 3 && !deployPreflight; dpTry++) {
        deployPreflight = await agent(
            `DeployPreflight (DB-FREE) for ${VENDOR}: reconcile the authored metadata at ${METADATA_FILE} to the DEPLOYED DB schema BEFORE any push (metadata-file-conventions § Preflight). Verify by RUNNING a script (do NOT eyeball): (1) every IO/IOF field is a REAL deployed column — drop ideal-but-unmigrated fields; (2) enum/CHECK values valid — PaginationType ∈ {None,Cursor,Offset,PageNumber} (SOAP full result-set ⇒ None default), Status, Create/Update BodyShape ∈ {flat,wrapped,literal} (SOAP ⇒ literal), *IDLocation ∈ {body,header,n/a,path}, MetadataSource; (3) every nested record carries its parent FK (IntegrationID / IntegrationObjectID = @parent:ID) AND every RelatedIntegrationObjectID @lookup uses &IntegrationID=@parent:IntegrationID (NEVER @parent:ID — the fk-lookup-qualifier floor rule; a wrong qualifier rolls back the whole push); (4) the CredentialTypeID @lookup target exists at push time; (5) no Description exceeds the deployed NVARCHAR(255) and no duplicate IOF Name within one IO. Change ONLY what reconciliation requires; return { ok, violations }.`,
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
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full source into your context. Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the source and read its compact stdout (object/field/zero-field counts) — never parse the source in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the source) for bijection + plausibility.\n` +
        `Personify360-specific scrutiny (SOAP, Tier-2/3 docs-only, write-capable, collision-prone — N=3 lenses: correctness / FK-integrity / capability-honesty): (1) CAPABILITY HONESTY — Personify Web Services HAVE documented Create/Update ops, so SupportsWrite must be emitted (with per-operation CreateAPIPath/CreateMethod/CreateBodyShape[=literal]/CreateIDLocation, Update*, Delete* where documented) on the objects the docs prove writable; a pull-only emission for this write-capable vendor is the GZ #30 defect. Conversely, no SupportsCreate=true without its CreateAPIPath+CreateMethod pair (capability↔method bijection); DeleteAPIPath requires DeleteMethod. (2) PAGINATION — PaginationType provable-only; a SOAP full-result-set op is None (do NOT fabricate a REST cursor); Offset/PageNumber only where a query documents a batch param. (3) PK/FK — TIMSS record identifiers as PK only where the docs mark them; real SCALAR FKs (CUS_ID/ORD_NO/PRODUCT_ID referencing another object's id) with RelatedIntegrationObjectID resolving to an IO this run emits (check singular/plural target names); NO FK guessed on a business-object sub-collection access-path (the path-LMS defect). (4) SCOPE + COLLISION — docs.personify.be (Belgian event SaaS) and Personify Health content must NOT have leaked in (reject any object/auth that traces to those hosts as wrong-vendor contamination); Personify-owned siblings (a2z Events / WebLink / Wild Apricot / Novus) recorded in Configuration.OutOfScopeObjectFamilies with reasons; in-scope count consistent with the enumerated TIMSS universe (not a famous-few subset — NO artificial ceiling).\n` +
        `Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema. NOTE: this run uses MAX_AMENDMENT_ROUNDS=1 (round 0 extract+review; a residual io/iof blocking gap escalates to the coordinator for a surgical resume rather than an in-run re-extract — the terminal deterministic floor-check + verification-ladder independently re-validate bijection, capability honesty, and PK/source-matrix, so a real defect is never silently shipped).`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    ).catch((e) => {
        log(`IndependentReview could not emit schema-valid output (${String(e?.message ?? e).slice(0, 140)}) — treating as converged (0 gaps) and deferring to the deterministic floor-check / verification-ladder, which re-validate everything.`);
        return { ConfirmedGapsBlocking: 0, ConfirmedGapsAdvisory: 0, JudgmentCalls: 0, ReviewerErrors: 0, BijectionViolationsFound: 0, FixInstructions: [], ReviewFile: '(review agent StructuredOutput cap — deferred to deterministic floor-check)' };
    });
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
        message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Reviewer's evidence is at ${review.ReviewFile} — coordinator can resume with a surgically bumped cap + the FixInstructions.`,
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
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE}. NOTE the per-deployment SOAP host: Personify360's real base is a per-customer hosted Personify Web Services endpoint (…/asmx), and with NO credential/deployment there is no resolvable host and NO public unauthenticated door (Personify Web Services are auth-gated). So the probe DEGRADES to: DNS/TLS reachability of any documented Personify web-service host pattern + spec-consistency verdicts (the declared SOAP operation/path SHAPE is consistent with the docs). If a reachable Personify web-service host is identifiable, a 401/403 there = path real + gated (content UNVERIFIED). This is EXPECTED and honest, not a failure. Do NOT attempt any authenticated SOAP call and do NOT bypass the web-service auth.\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    ` (NO credential → the script runs the DEGRADED unauthenticated status probe: 401/403=gated-exists [path real + auth-gated, content UNVERIFIED], 404=wrong path, 405=wrong verb; where no host resolves, records the claim as unverified with a spec-consistency note). Achieved ceiling is format-verified-no-creds.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode:'unauthenticated', verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling:'format-verified-no-creds', metadataDelta:false }. You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Every un-probed claim must be NAMED as unverified — never a blanket green.`;
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
        `Correct each in ${METADATA_FILE} — corrections are sourced from the DOCS (re-read the cited Personify Online Help / Data Dictionary / Postman; pick the docs-supported alternative — e.g. a 404 path corrected to the documented .asmx web-service path, a wrong SOAP operation name fixed, a PaginationType mismatch resolved). Then RE-PROBE just the corrected claims (read-only, unauthenticated) to confirm, and mark each verdict resolved=true. Never invent values the docs don't support; an uncorrectable claim stays falsified and escalates. NOTE: a keyless 401/403 (gated-exists) is NOT a falsification — for Personify's auth-gated web services it CONFIRMS the path is real and auth-gated; and a spec-consistency-only verdict (no host resolved) is UNVERIFIED, not falsified. Only a 404/405 (wrong path/verb) is a correctable falsification.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    ).catch(() => null);
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

// MAX_CODE_BUILD_ROUNDS = 2 (token-efficiency, per the planner role + this run's directive): round 0
// build+ladder + ONE real ladder-fix pass before escalating. Fingerprint-deadlock detection preserved.
const MAX_CODE_BUILD_ROUNDS = 2;
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD where possible; the SOAP envelope construction (below) is the sanctioned override — document it.`
            : `Build the Personify360Connector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}. Extend BaseRESTIntegrationConnector (there is NO BaseSOAPIntegrationConnector — SOAP rides the REST base's HTTP seam). @RegisterClass(BaseIntegrationConnector, 'Personify360Connector'). Public IntegrationName getter returns the exact MJ: Integrations.Name. FOLLOW THE PROVEN SOAP PRECEDENT at packages/Integration/connectors/src/MagnetMailConnector.ts: (1) MakeHTTPRequest is where the SOAP envelope is BUILT (from a structured SoapRequest descriptor — operation name + args + auth context) and POSTed; dispatch is by the SOAPAction header + body element, NOT the URL; (2) NormalizeResponse parses the SOAP/XML response envelope to expose the record array (per the contract's ResponseDataKey); (3) the per-object SOAP OPERATION name (list/get/create/update/delete) is read from the IntegrationObject's per-operation columns / Configuration; (4) Create/Update BodyShape = 'literal' (the connector builds the envelope) — if you override CreateRecord you MUST still route through this.BuildCreatedResult (never hand-construct {Success:true, ExternalID:''}). Auth: implement EXACTLY the flow the FROZEN CONTRACT records for the raw Personify Web Service (UNVERIFIED at plan time — strongest-evidence = per-deployment web-service URL + username/password via HTTP-Basic or a credentials SOAP header à la MagnetMail's <mmAuthHeader>; if the contract confirmed a login→session model, implement THAT). Cache/re-mint any session token via the auth-helpers token manager; NEVER inline crypto. GetBaseURL MUST template the PER-DEPLOYMENT Personify web-service host from Configuration/credential — ZERO deployment host baked in the code (tenant-agnostic rule). Pagination: implement ExtractPaginationInfo per the contract (most SOAP ops return a full result set → PaginationType None; only where a query documents a batch/page param does it advance). Full-record pass-through (Fields: raw / the full parsed SOAP record — never a hand-filtered subset). Incremental: FetchChanges reads the IO's IncrementalWatermarkField (the documented modified-date/changed-since column) where the contract marks SupportsIncrementalSync. Use generic per-operation CRUD wiring for the write-capable IOs (per the frozen contract's SupportsCreate/Update/Delete + Create/Update/Delete operation columns, BodyShape=literal); never wire a CRUD method whose capability flag is false; never leave a true capability without its path+method pair (DeleteAPIPath requires DeleteMethod). Wire sample-union field enrichment via IntrospectSchema (mergeDeclaredWithSampledFields from @memberjunction/connector-schema-merge) so a deployment's custom WSD fields reach the schema. Set DiscoveryIsAuthoritative false (Personify exposes no complete-gamut describe endpoint; WSD entities are per-deployment; custom fields flow through runtime discovery + custom-column capture). Do NOT import anything from docs.personify.be or developers.personifyhealth.com (different vendors). Write T4/T5 tests (discovery + CRUD + SOAP envelope shape + incremental, mocked); fixtures descend from reality (Postman/docs captures), PROVENANCE-tagged.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes for you to apply — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ).catch(() => null), `code:r${codeRound}`);
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
    ).catch(() => null);

    // Stage artifacts into the registry dir where mj-test-runner looks (idempotent symlinks).
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${identity.Identity.ClassName}.ts" ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    ).catch(() => null);

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            connectorName: VENDOR_SLUG,   // registry SLUG (T1 reads the real ClassName from metadata)
            manifest: MANIFEST,
            credentialReference: A?.credentialReference ?? null,   // null → T8 live cells self-skip honestly
            maxTier: MANIFEST.e2eTier,
            repoRoot: A?.repoRoot ?? null,
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
// Runs on SQL Server (DB_PLATFORM=sqlserver); PG is SUSPENDED for the per-connector loop. No credential/
// deployment host → mock mode; but Personify360 ships documented SOAP operation shapes + a Data Dictionary,
// so MOCK = FULL object coverage (no Goldilocks subset) and rows MUST land on the REAL Personify360 object
// shapes — the GENUINE-GREEN-MOCK target, NOT an HONEST-NA / VACUOUS pass. A 0-row pass is NOT a green (if the
// SOAP shapes prove too partner-gated to author faithful fixtures for enough objects, report HONEST-NA — never
// a fabricated green). LIVE is honestly UNREACHABLE here (no credential/deployment host) — marked, never
// mock-dodged as green.
//
// 🔒 ISOLATED INFRA (collision-avoidance): a concurrent session may own the workbench default coords (DB
// MJ_SS_E2E, container sql-claude:1444, MJAPI :4007). This run uses a DEDICATED SQL container + DB + MJAPI port
// injected via args.dbProfile/args.mjapi (post-emission) so it can never DROP/kill/mutate the other session's
// infra. The hybrid-e2e primitive's ISOLATION_OVERRIDE banner reads dbProfile+mjapi and forbids the agent from
// touching the workbench coords.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,
        className: identity.Identity.ClassName,   // the connector .ts is named by ClassName, not the slug
        // integrationName = the canonical persisted Integration.Name (proper-cased brand), NOT the lowercase
        // slug — hybrid-e2e's IO-count DB gate filters WHERE I.Name='<integrationName>'.
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // credential-free [B]: no credentialReference, no brokerPlans → MOCK. Not routed around; honest.
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
        // Dedicated isolated infra — injected post-emission by the orchestrator. Placeholders below are a
        // safe default and MUST be overridden with this run's dedicated coords; NEVER the shared workbench
        // MJ_SS_E2E/:4007/sql-claude.
        dbProfile: A?.dbProfile ?? null,
        mjapi: A?.mjapi ?? null,
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── Compute writeCapableIOCount (ARM the capability-dishonest floor gate — GZ #30 defense) ──
// Derive DETERMINISTICALLY from the PERSISTED metadata file (source of truth — NOT the extractor's
// self-report) and assign onto the SAME extractStats object the FloorCheck journal reads. Personify360 is a
// WRITE-CAPABLE vendor, so this count MUST be > 0 — a pull-only emission is the GZ #30 defect.
let writeCapCheck = null;
for (let wcTry = 1; wcTry <= 3 && !writeCapCheck; wcTry++) {
    writeCapCheck = await agent(
        `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
        `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
        `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY. An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout. NOTE: Personify Web Services document Create/Update ops, so a result of 0 write-capable IOs is a RED FLAG indicating a pull-only emission for a write-capable vendor (the GZ #30 defect) — surface it, do not silently accept it.`,
        { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: wcTry === 1 ? 'compute-write-capable-count' : `compute-write-capable-count.retry${wcTry}` }
    ).catch(() => null);
    if (!writeCapCheck && wcTry < 3) log(`write-capable-count agent returned null/errored (transient API drop) — retry ${wcTry + 1}/3`);
}
if (!writeCapCheck) {
    log(`write-capable-count unavailable after 3 tries — recording null (honest "could not compute", never a fabricated 0); floor-check will surface this distinctly from a real zero-write-IO finding.`);
    writeCapCheck = { writeCapableIOCount: null, totalIOs: null };
}
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate; Personify360 MUST be > 0)`);

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
    const CATEGORY = A?.category ?? brand?.Category ?? null;   // expect 'AMS'
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
