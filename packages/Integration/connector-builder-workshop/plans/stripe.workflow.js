// stripe.workflow.js — per-vendor build plan (emitted by connector-creator planner)
//
// Vendor: Stripe (https://stripe.com) — payments / billing / financial infrastructure platform.
// Mode: NEW (v1.0.0 birth; no prior metadata file / DB row / connector .ts / corpus — cold build,
//   confirmed: no metadata/integrations/stripe/, no connectors-registry/stripe/src, no DB row).
// Credential: NONE at build ([B] credential-free run) — BUT Stripe ships one of the STRONGEST
//   credential-free contracts of any SaaS vendor: an OFFICIAL, complete, machine-readable OpenAPI 3.0
//   specification (github.com/stripe/openapi → spec3.json + spec3.sdk.json, published + versioned),
//   an official Postman collection, and per-resource published example payloads. Every top-level
//   resource carries a real, explicitly-documented `id` primary key (`ch_`, `cus_`, `in_`, `pi_`,
//   … prefixed). This is the CRUCIAL difference from a partner-gated vendor: the credential-free
//   PATH 2 suite (schema/contract validation, mock-server-from-spec, endpoint/header probing,
//   bijective completeness) GENUINELY and fully applies here. Stripe additionally publishes
//   self-serve TEST-MODE tokens (pk_test_/sk_test_) — a real API surface — so a later live read path
//   is trivially obtainable; NOT required to build. (See connector-credential-testing.md §0a #1:
//   test-mode credentials are treated as PATH 1 when present.)
//
// WHY THE VENDOR-SPECIFIC SHAPE (grounded in Stripe's REAL, documented nature — study establishes
// BOTH breadth AND scope because NO client-need context was provided; scope is decided KNOWINGLY):
//   • Base URL: https://api.stripe.com/v1/ — REST/JSON, resource-oriented paths, form-encoded write
//     bodies (application/x-www-form-urlencoded — NOT JSON on writes; a per-vendor idiosyncrasy the
//     code-builder must honor; reads return JSON). Auth is Bearer over the *secret* key.
//   • Auth: API-key bearer (Authorization: Bearer sk_...). Secret key is the credential; the connector
//     encodes the MECHANISM (bearer header), never a baked key. authPattern = api-key (bearer form).
//     Stripe-Version header pins the API version — capture into Configuration (provable-only).
//   • Pagination: CURSOR pagination — list responses carry `object:"list"`, a `data[]` array, a
//     boolean `has_more`, and the next page is requested with `?starting_after=<last object id>`
//     (also `ending_before`, `limit` up to 100). This maps to PaginationType=Cursor (encode the
//     has_more flag key + the starting_after cursor param + the `data` ResponseDataKey + limit=100 in
//     Configuration). It is NOT page-number and NOT offset — getting this wrong silently caps every
//     object at one page (the GZ pagination class of defect: skip-vs-$skip). SourceAudit + the
//     extractor MUST read the real param from the OpenAPI spec; RealityProbe's param-advance check
//     (degraded/unauth) validates the declared form on the live endpoint.
//   • Incremental signal: Stripe exposes a `created` timestamp on virtually every object AND supports
//     range filters on list endpoints (`created[gte]` / `created[gt]` / `created[lte]`). Many mutable
//     objects also stream via the Events API (`/v1/events`, type-filtered). Model per-object
//     incremental via the `created` watermark where the list endpoint documents the range filter
//     (IncrementalWatermarkField = 'created' with the range-param form in Configuration); DEFER (leave
//     SupportsIncrementalSync=false) where the object's list endpoint does not document a range filter
//     — provable-only, never assume a watermark param exists.
//   • Object universe (VERY LARGE, richly bidirectional — STUDY it, do NOT assume thin; a thin
//     emission ≪ the OpenAPI universe is a FLAG needing evidence, not a pass): the Stripe spec
//     enumerates 100+ resources across Core (customers, charges, payment_intents, setup_intents,
//     payment_methods, refunds, disputes, balance_transactions, payouts, events, tokens, sources),
//     Billing (products, prices, plans, subscriptions, subscription_items, invoices, invoiceitems,
//     credit_notes, coupons, promotion_codes, tax_rates, quotes, usage_records), Connect
//     (accounts, transfers, application_fees, top_ups, capabilities, external_accounts, persons),
//     Checkout/PaymentLinks (checkout.sessions, payment_links), Terminal, Issuing, Radar, Reporting,
//     Files, Identity, Financial Connections, Treasury, Climate, and more. Many are NESTED
//     access-paths off a parent (/customers/{id}/sources, /invoices/{id}/lines,
//     /subscriptions/{id}/… , /accounts/{id}/persons) — model those as ACCESS-PATHS in Configuration,
//     NOT as guessed FKs (path-LMS defect: a nesting edge is an access-path; an FK is a scalar that
//     references another object's PK — e.g. `customer` on a charge is a scalar id → a real FK).
//   • WriteCapability (BINDING per v2 P5): Stripe is one of the most WRITE-CAPABLE APIs in existence —
//     the OpenAPI spec documents POST create + POST update (Stripe uses POST for both) + DELETE across
//     nearly every resource, plus structured action endpoints (capture, cancel, confirm, refund,
//     finalize, void, pay). This connector MUST NOT ship pull-only (the GZ #30 defect). SupportsCreate/
//     Update/Delete + per-operation CRUD columns are emitted where the spec proves the operation:
//       - CreateMethod = POST, CreateBodyShape = flat (form-encoded attrs), CreateIDLocation = body
//         (the response `id`); UpdateMethod = POST (NOT PATCH — Stripe idiosyncrasy),
//         UpdateAPIPath = /<resource>/{id}, UpdateIDLocation = path; DeleteMethod = DELETE,
//         DeleteAPIPath = /<resource>/{id}, DeleteIDLocation = path — where the spec declares delete
//         (many resources are non-deletable → leave Delete columns null; capability<->method bijection).
//     The capability-dishonest floor gate (armed at BrandResearch by deriving a `capability` STRING
//     from the WriteCapability object→operation map — Fix 1) proves the write count is NON-ZERO.
//   • Rate limits: Stripe documents ~100 read + ~100 write requests/second in live mode (25/25 in test
//     mode), and returns 429 with rate-limit context. Capture the documented numbers into
//     BatchMaxRequestCount / RateLimitPolicy where explicitly stated (provable-only); the connector's
//     RateLimitPolicy + ExtractRetryAfterMs hooks parse the 429 signal. Leave null if not explicit.
//
// ── KNOWING SCOPE DECISION (no client-need context provided ⇒ study establishes both breadth AND the
//    scope, decided EXPLICITLY — neither a blind union of the whole 100+ universe [over-reach: modeling
//    Issuing/Treasury/Climate/Terminal the way clients rarely consume payments-sync] NOR the famous few
//    [under-reach: the Salesforce-11-of-1694 defect]):
//   IN-SCOPE object families (modeled DEEPLY — the payments + billing + connect core that constitutes
//   the useful, credential-free-provable, most-consumed surface for a financial-data sync):
//     • Core payments: customers, charges, payment_intents, setup_intents, payment_methods, refunds,
//       disputes, balance_transactions, payouts, events, tokens, sources, cards (customer sources).
//     • Billing/subscriptions: products, prices, plans, subscriptions, subscription_items, invoices,
//       invoiceitems, invoice line items (nested), credit_notes, coupons, promotion_codes, tax_rates,
//       quotes, usage_records.
//     • Connect (multi-account): accounts, persons (nested), external_accounts (nested), transfers,
//       application_fees, top_ups, capabilities (nested).
//     • Checkout: checkout.sessions, payment_links.
//   OUT-OF-SCOPE object families (recorded WITH REASONS in Integration.Configuration.
//   OutOfScopeObjectFamilies so the broader nature the study found is DOCUMENTED and a future build can
//   expand WITHOUT re-discovering — NOT silently capped):
//     • Issuing (issuing.cards/authorizations/transactions/cardholders/disputes), Treasury
//       (financial_accounts/received_credits/outbound_payments), Terminal (readers/locations),
//       Financial Connections, Identity (verification), Radar (value_lists/reviews),
//       Reporting (report_runs/report_types), Climate, Tax (registrations/settings), Sigma, Files,
//       Apps/Secrets, Webhook Endpoints management, Test Helpers.
//       REASON: these are specialized product-line surfaces most payments/billing data-sync consumers
//       do NOT ingest; they are provable-in-spec but out of the useful in-scope subset. Recording them
//       (with the reason + the spec section) keeps nobody blind to Stripe's true breadth and lets a
//       future scoped build add any of them without re-studying the API.
//   The scope is decided KNOWINGLY: aware of the FULL 100+ universe, focused on the payments+billing+
//   connect core, with the deferred remainder written down + justified. The extractor emits the
//   in-scope leaves the OpenAPI spec proves (with real APIPaths, real `id` PKs, real write columns);
//   the source-diff completeness gate closes against the IN-SCOPE universe (TaxonomyLeaves), and the
//   scope-unjustified-thin floor gate reads scopeDecision — normalized to the gate's exact keys
//   ({mode:'source-breadth', evidence, excludedFamilies[]}) at SourceAudit (Fix 2) — to confirm the
//   narrowing is evidence-backed rather than WRONGLY hard-failing a well-justified scope.
//
// RISK-CALIBRATED KNOBS (vs template defaults; per connector-creator §"adversarial-verify N"):
//   - adversarialN = 2   → Stripe is a Tier-1/Tier-2 MACHINE-READABLE source (official OpenAPI 3.0 spec
//     + SDK spec + Postman). N=1 is permitted ONLY when a machine-readable source is ALSO live-confirmed
//     by the RealityProbe; this is a credential-free run (no live confirmation), so it does NOT drop to
//     N=1 — N=2 is the correct default for a strong-source-but-unconfirmed build. It rises to N=3
//     in-loop only if the source-auditor flags thin/ambiguous coverage (it should not for Stripe, whose
//     spec is exhaustive) OR write-surface risk warrants a correctness lens. Never 4-5 (cost defect).
//   - loopUntilDry K = 2 → Stripe's public doc coverage is exceptionally strong (a complete, official,
//     machine-readable spec), so K=2 suffices; K=3 is reserved for < 0.7 doc coverage (thin/partner-
//     gated). audit-source's rubric will confirm coverage >> 0.7.
//   - maxTier = T8       → credential-free live CEILING (RECORDS the live ceiling; does NOT gate the
//     non-live suite). T0..T8 all run. The NON-LIVE suite (schema/contract validation vs the OpenAPI
//     spec, mock-server-from-spec T5, cursor-pagination replay, endpoint/header probing, bijective
//     completeness vs the RAW spec) runs to FULL applicable extent regardless of credential — Stripe's
//     official spec makes ALL of it genuinely high-value.
//
// AMENDMENT-ROUND KNOBS (per the /build-connector run spec for this build + connector-creator token-
//   efficiency rule): extract-amendment MAX 1 real amendment round; code-build-amendment MAX 2 real
//   amendment rounds. The template's while-loop starts round at 0 (round 0 = initial extract/build),
//   so ONE amendment round ⇒ MAX_AMENDMENT_ROUNDS = 2 (round 0 initial + round 1 amend), and TWO code
//   amendment rounds ⇒ MAX_CODE_BUILD_ROUNDS = 3 (round 0 build + rounds 1,2 amend). The slot-routing,
//   deferredConnectorFindings, byte-identical-fingerprint deadlock detection, and escalation returns
//   are PRESERVED verbatim from _TEMPLATE.workflow.js. The deterministic gates (0-field hard-fail,
//   enforce-finding-floor, compute-source-diff, T1 invariants) catch defects in-pass, so a low
//   amendment cap is a token-efficiency choice, not a correctness compromise.
//
// GENUINE CREDENTIAL-FREE GREEN TARGET (NOT an HONEST-NA):
//   Because Stripe exposes a real, complete credential-free contract with real object shapes + real
//   `id` PKs + real write endpoints, HybridE2E runs in MOCK mode (mock-server-from-spec) and MUST LAND
//   ROWS on the real object shapes — FULL object coverage over the IN-SCOPE set, NO Goldilocks subset
//   (mock = free = every active object ≥1 row; every writable object's write round-trips in mock). A
//   0-row pass is NOT a green; this build's target is GENUINE-GREEN-MOCK (rows land on real shapes
//   through MJAPI → SQL Server), with the residual gap (live round-trip completeness, true rate-limit
//   behavior under load, real write side-effects, conflict/echo-loop) stated HONESTLY. A self-serve
//   sk_test_ token would later promote this to a live read path (and, in test mode, a live write path).
//
// CHEAPEST-DEFECT-FIRST ORDERING (REQUIRED): the cheap detectors run FIRST — EnvPreflight (DB-free
//   abort) → the deterministic deploy/metadata gates inside extract-iiof-pipeline + freeze + T0/T1
//   structural rungs → the DEGRADED RealityProbe (unauth status probe: 401/403=path real, 404=path
//   wrong) BEFORE code is built on the claims → CodeBuild → offline behavioral rungs (T4/T5 mock-HTTP,
//   T6 SQLite) EARLY in the ladder → only then the heavier HybridE2E real-engine push. A green
//   STRUCTURAL ladder over a behaviorally-broken connector is the most expensive false signal; the mock
//   behavioral tiers must land rows on the REAL fetch path before we spend on structural confidence.
//
// LOCKED-PRIMITIVE COMPOSITION (audit-source, extract-iiof-pipeline, freeze-contract,
//   verification-ladder, floor-check), the freeze-contract gate before code-build, the terminal
//   bijection floor-check, the different-model (sonnet) adversarial review, and BOTH amendment loops
//   (with slot-routing + byte-identical-fingerprint deadlock detection) are PRESERVED verbatim from
//   _TEMPLATE.workflow.js — never a single-return-on-first-gap; their guarantees are composed, not
//   weakened.

export const meta = {
    name: 'stripe-build',
    description: 'Workshop dynamic-workflow build for Stripe (Payments / billing / financial-infrastructure platform, REST/JSON API v1, api-key bearer [sk_] auth, form-encoded writes, cursor pagination [has_more + starting_after], `created` timestamp incremental, VERY write-capable). NEW v1.0.0, credential-free [B] run against a REAL, complete public OpenAPI 3.0 contract. Locked primitives + bijection floor-check. Independent capability discovery yields REAL APIPaths + real `id` PKs + real per-operation CRUD (not deferred). KNOWING scope decision: payments+billing+connect core IN, specialized product lines (Issuing/Treasury/Terminal/Radar/Reporting/…) recorded OUT-of-scope with reasons. GENUINE credential-free green target (mock lands rows on real shapes).',
    phases: [
        { title: 'EnvPreflight', detail: 'S0 (v2 P7): DB reachable @ expected migration, MJAPI bootable, generated tree clean-or-accounted, NO stale nested @memberjunction/integration-* dists (GZ #31 detector), turbo dist freshness. Abort cheap (cheapest-defect-first).' },
        { title: 'BrandResearch', detail: 'Resolve canonical Stripe brand + ProductTaxonomy. Establish the REAL object/capability universe (100+ resources across Core payments / Billing / Connect / Checkout / and specialized product lines) INDEPENDENTLY from the official OpenAPI spec. WriteCapability is BINDING (v2 P5) — Stripe is heavily write-capable; prove it, do not assume pull-only. A `capability` string is DERIVED from the WriteCapability object→operation map to ARM the floor gate (Fix 1). Category expected: Finance.' },
        { title: 'Identity', detail: 'Fill Integration row identity slots (StripeConnector). Credential type match-or-create against the api-key-bearer (sk_) ConnectionConfig shape.' },
        { title: 'SourceAudit', detail: 'Audit + rank sources: the OFFICIAL OpenAPI 3.0 spec (spec3.json / spec3.sdk.json — highest value; drives T5/T7 mock-server + OpenAPI contract validation + bijective completeness) → official Postman collection → API reference docs → published SDKs. Build SOURCE_STUDY with COVERABLE vs INFORMATIONAL split + real APIPaths + cursor-pagination (has_more + starting_after) + `created` watermark shape. Emit the IN-SCOPE TaxonomyLeaves (payments+billing+connect+checkout) and record OUT-of-scope product-line families WITH REASONS. scopeDecision is normalized to the floor gate keys ({mode:source-breadth, evidence, excludedFamilies[]}) here (Fix 2).' },
        { title: 'MetadataWrite', detail: 'Integration row non-identity slots + Configuration JSON (api-key-bearer auth [sk_], base URL https://api.stripe.com/v1/, form-encoded write bodies, Stripe-Version header, cursor pagination [data ResponseDataKey + has_more flag + starting_after cursor + limit=100], documented rate limits, OutOfScopeObjectFamilies with reasons).' },
        { title: 'IOIOFExtract', detail: 'Per-object extract-iiof-pipeline (verify + write-back), ONE dispatch over the whole in-scope schema. REAL APIPaths + real `id` PKs (Stripe objects declare explicit prefixed ids) + per-operation CRUD columns where the spec proves the operation (Create/Update = POST, Delete = DELETE where present; UpdateIDLocation=path, CreateIDLocation=body). `created` watermark where the list endpoint documents the range filter; DEFER incremental where it does not (provable-only). Nested objects = access-paths in Configuration; scalar id refs (customer, invoice, subscription) = real FKs. Full-record pass-through.' },
        { title: 'IndependentReview', detail: 'ONE round per amendment iteration, refocused charter (coverage-vs-script / bijection / capability-honesty / naming). Different model (sonnet). SLIM: counts + ~15-field sample, never the full spec in context. LINT — cannot certify model-vs-world.' },
        { title: 'RealityProbe', detail: 'S7 (v2 P2, EMPIRICAL): DEGRADED unauthenticated per-claim status probe (no credential) — 401/403=path real+auth-gated, 404=path wrong (Stripe returns 401 on missing auth, so nearly every real path is provably-real); validates the starting_after cursor param form where the endpoint tolerates it. Ceiling format-verified-no-creds. NEVER authors metadata (verdicts in, authorship out).' },
        { title: 'ProbeAmend', detail: 'ONE amendment round from probe verdicts (corrections from the OpenAPI spec, confirmed by re-probe). Reality outranks the frozen contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance) — must never block probe-driven amendments.' },
        { title: 'CodeBuild', detail: 'StripeConnector class + tests over BaseRESTIntegrationConnector (REST/JSON reads; form-encoded writes). Generic per-operation CRUD wired for write-capable IOs (Update=POST per Stripe idiosyncrasy); cursor pagination (has_more + starting_after) in ExtractPaginationInfo; Stripe-Version header + Bearer sk_ in BuildHeaders. Form-encoded write bodies use BRACKET NOTATION for nested/array attributes (Fix 3). Fixtures descend from reality (probe captures / spec examples) — provenance-tagged (v2 P4).' },
        { title: 'VerificationLadder', detail: 'T0..T8 (credential-free ceiling) + two-pass volatile-field idempotency rung (v2 P3). CHEAPEST-DEFECT-FIRST: structural T0/T1 → offline behavioral T4/T5 (mock-HTTP-from-spec) + T6 (SQLite) EARLY → T7 OpenAPI contract validation → T8 failure-mode injection. Full non-live suite: schema/contract validation vs the OpenAPI spec, mock-server-from-spec, cursor-pagination replay, endpoint/header probing, bijective completeness vs the RAW spec.' },
        { title: 'HybridE2E', detail: 'Deep §1→§7 e2e in MOCK mode (no credential): real MJ engine → real SQL Server, FRESH DB. GENUINE green target — MOCK = FULL in-scope object coverage; rows MUST land on the REAL Stripe object shapes (no Goldilocks subset). Outcome gates: rowcounts vs ground truth, two-pass zero-growth (content-hash idempotency on volatile fields), first-sync completeness, capture engaged, bounded typing. Env per HYBRID_E2E_ENV_RUNBOOK.md (SQL Server; PG suspended).' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + v2 EMPIRICAL gates (reality-probe, e2e-mock-dodge, capability-honesty [Stripe IS heavily write-capable — brand.WriteCapability.capability=read-write ARMS the gate; writeCapableIOCount MUST be non-zero], env-preflight, second-sync-grew, first-sync-incomplete, capture-engaged, scope-unjustified-thin [scopeDecision normalized to {mode,evidence,excludedFamilies}]). Verdict states the EMPIRICAL/LINT split + the honest credential-free ceiling (format-verified-no-creds live; genuine-green mock).' },
        { title: 'OpenAppPublish', detail: 'Assemble the verified connector into MemberJunction/Integrations as a standalone Open App under Category=Finance: package-name @RegisterClass key + metadata ClassName/ImportPath=package + seed migration + catalog + changeset + validate-invariants gate.' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING — normalize FIRST so every A?.x read
// works either way (without this, runID/credentialReference/brokerPlans/maxTier silently default).
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'stripe';
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
// adversarialVerifyMinReviewers = 2 (strong Tier-1/2 machine-readable OpenAPI source, but no live
// RealityProbe confirmation in this credential-free run ⇒ default N=2, NOT N=1 which requires empirical
// live confirmation).
const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',
    adversarialVerifyMinReviewers: 2,
};
// loop-until-dry K for the extract pipeline — 2 because Stripe's public doc coverage is exceptionally
// strong (a complete, official, machine-readable OpenAPI 3.0 spec); K=3 is reserved for < 0.7 coverage
// (thin/partner-gated).
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
    `Abort-cheap contract (cheapest-defect-first): if ok=false and unresolved, the workflow stops here — 10 stages must never burn on a broken env.`,
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
        Category: { type: ['string', 'null'] },   // expect 'Finance'
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
    `Research vendor "${VENDOR}" (Stripe, https://stripe.com) — a PAYMENTS / billing / financial-infrastructure platform. Resolve canonical name, description, navigation URL (developer/API reference — https://docs.stripe.com/api), icon class, ProductTaxonomy, and Open App Category (expect 'Finance'; choose from AMS|CRM|Events|Finance|LMS|Marketing|Platform).\n` +
    `CRITICAL — establish the REAL API NATURE independently from Stripe's OFFICIAL machine-readable OpenAPI 3.0 spec (github.com/stripe/openapi → spec3.json / spec3.sdk.json). The spec is complete + versioned, so absence there would be a genuine finding, not a doc gap:\n` +
    `  • Object families the API exposes — enumerate from the spec: Core payments (customers, charges, payment_intents, setup_intents, payment_methods, refunds, disputes, balance_transactions, payouts, events, tokens, sources), Billing (products, prices, plans, subscriptions, subscription_items, invoices, invoiceitems, credit_notes, coupons, promotion_codes, tax_rates, quotes, usage_records), Connect (accounts, persons, external_accounts, transfers, application_fees, top_ups, capabilities), Checkout (checkout.sessions, payment_links), AND the specialized product lines (Issuing, Treasury, Terminal, Financial Connections, Identity, Radar, Reporting, Climate, Tax, Sigma, Files). Emit ALL discovered into ObjectFamilies (awareness) — including the ones likely out of scope.\n` +
    `  • Auth model — API-key BEARER over the SECRET key (Authorization: Bearer sk_...); a self-serve TEST-MODE key (sk_test_) is obtainable and is a real API surface (would ADD a live read/write path later; NOT needed to build). Confirm the credential shape (single secret key; Stripe-Version header pins the API version).\n` +
    `  • WriteCapability (BINDING per v2 P5): Stripe is heavily write-capable — the spec documents POST create + POST update (Stripe uses POST for BOTH — NOT PATCH) + DELETE across nearly every resource, plus action endpoints (capture/cancel/confirm/refund/finalize/void/pay). Confirm with evidence and populate WriteCapability with the object→operation map (e.g. { customers:['create','update'], charges:['create','update'], subscriptions:['create','update','delete'], ... }). A pull-only connector for this write-capable vendor is the GZ #30 defect — do NOT conclude read-only.\n` +
    `  • Pagination — CURSOR (list responses: object:"list", data[] array, has_more boolean; next page via ?starting_after=<last id>; also ending_before, limit up to 100). Capture precisely; it is Cursor, NOT page-number/offset.\n` +
    `  • Rate limits (documented ~100 read + ~100 write req/s live, 25/25 test; 429 on breach), incremental signal (the ubiquitous created-timestamp + list range filters created[gte]/[lte]; the Events API for change streams), and "what else the system exposes" (webhooks, Files, test helpers).\n` +
    `Schema-bound output only.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: `brand:${VENDOR_SLUG}` }
);

// ── ARM the capability-dishonest floor gate (Fix 1 / GZ #30 defense) ─────────────────────────────────
// floor-check's `capability-dishonest` rule (floor-check.workflow.js:911-921) reads
// journal.brand.WriteCapability and NORMALIZES it via String(raw.capability ?? raw.Capability ?? ''),
// then tests /read-write|bidirectional/i to decide whether to fire. Our BRAND_SCHEMA.WriteCapability is
// an object→operation MAP (e.g. { customers:['create','update'], charges:['create'], ... }) with NO
// `.capability`/`.Capability` key — so the gate's normalizer yields '' → the check is a silent NO-OP
// (it never fires), even though this plan asserts (above / in the manifest) that it is armed. DERIVE a
// `capability` STRING from the object→operation map and ATTACH it onto the map, preserving the map's
// existing per-object keys, so the gate's normalizer finds `capability` and the check ARMS. Stripe
// documents POST create + POST update + DELETE across nearly every resource (genuine inbound sync AND
// write-back) ⇒ 'read-write' (matches the gate's /read-write|bidirectional/i test and arms the check).
// If, on the day, the map carries no operations, it degrades to 'read-only' and the gate correctly stays
// quiet. This must run BEFORE `brand` is threaded into the FloorCheck journal (journal.brand, below).
const _wc = brand.WriteCapability;
const _anyWrite = _wc && typeof _wc === 'object'
    && Object.values(_wc).some(ops => Array.isArray(ops) && ops.length > 0);
brand.WriteCapability = (_wc && typeof _wc === 'object')
    ? { ..._wc, capability: _anyWrite ? 'read-write' : 'read-only' }
    : _wc;
log(`WriteCapability(brand): capability='${(brand.WriteCapability && typeof brand.WriteCapability === 'object') ? brand.WriteCapability.capability : brand.WriteCapability}' — arms the capability-dishonest gate (Stripe: read-write)`);

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
    `Fill Integration row identity slots for "${brand.CanonicalName}" (class symbol StripeConnector, ClassName = StripeConnector in the MJ sandbox). Read SOURCE_STUDY when ready. Resolve CredentialTypeID via match-or-create against the connector's api-key-bearer (sk_ secret key) ConnectionConfig key shape (identity-establisher §"Credential type: match-or-create"). Stripe objects declare an explicit prefixed \`id\` primary key (ch_/cus_/in_/pi_/sub_…) — you MAY set the universalPK Configuration hint {fieldName:'id'} ONLY if the OpenAPI spec authoritatively documents \`id\` as the object identifier (it does, on every top-level resource); do not guess beyond what the spec states.`,
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
    `Audit + rank authoritative sources for ${brand.CanonicalName}. Source-tier priority: the OFFICIAL OpenAPI 3.0 spec (github.com/stripe/openapi → spec3.json and spec3.sdk.json — HIGHEST value; it is the machine-readable credential-free contract that drives the mock-server tier T5, the OpenAPI-validation tier T7, and bijective completeness) → official Postman collection (postman.com/stripedev) → the API reference docs (https://docs.stripe.com/api) → published SDKs (stripe-node/stripe-python types). FETCH and SAVE the OpenAPI spec + object schemas + Postman collection to disk (read-once → scratch → grep; never re-read the huge spec in successive turns) — these MUST yield REAL APIPaths, real prefixed \`id\` PKs, the real cursor-pagination shape (has_more + starting_after + limit), and the per-object write operations (POST create/update, DELETE) — NOT deferred, NOT guessed.\n` +
    `Build SOURCE_STUDY.md with a COVERABLE vs INFORMATIONAL split. Emit TaxonomyLeaves = the leaves of the IN-SCOPE object set the spec proves (the payments+billing+connect+checkout core): customers, charges, payment_intents, setup_intents, payment_methods, refunds, disputes, balance_transactions, payouts, events, tokens, sources, products, prices, plans, subscriptions, subscription_items, invoices, invoiceitems, credit_notes, coupons, promotion_codes, tax_rates, quotes, usage_records, accounts, persons, external_accounts, transfers, application_fees, top_ups, capabilities, checkout.sessions, payment_links, and their documented nested access-paths (invoice line items, customer sources, subscription items). For each object capture: its collection/list APIPath (record the access-path for NESTED objects like /customers/{id}/sources, /invoices/{id}/lines), the list ResponseDataKey (\`data\`), the pagination envelope shape (has_more + starting_after → PaginationType=Cursor, limit=100), the incremental range filter where documented (created[gte] → IncrementalWatermarkField='created'; DEFER where absent), and each documented write operation (→ per-operation CRUD columns; remember Update = POST, not PATCH).\n` +
    `Record known-but-OUT-of-scope product-line families in outOfScopeFamilies WITH REASONS (Issuing, Treasury, Terminal, Financial Connections, Identity, Radar, Reporting, Climate, Tax, Sigma, Files, Apps/Secrets, Webhook Endpoints mgmt, Test Helpers — reason: specialized product surfaces most payments/billing data-sync consumers do not ingest; provable-in-spec but outside the useful in-scope subset) → Integration.Configuration.OutOfScopeObjectFamilies. Emit scopeDecision (the in-scope-vs-universe justification the floor's scope-unjustified-thin + capability gates read — aware of the FULL 100+ universe, focused on the core, remainder documented) with rich fields inScopeObjectFamilies / inScopeRationale / outOfScopeObjectFamilies / outOfScopeReason / flagGuard. Populate VendorDocsPaths/PostmanPaths/SDKPaths so the extractor's multi-source PK/FK detection can consult them.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: `audit:${VENDOR_SLUG}` }
);

// ── Normalize scopeDecision to the floor gate's EXACT keys (Fix 2) ──────────────────────────────────
// floor-check's `scope-unjustified-thin` rule (floor-check.workflow.js:576-589) computes:
//   const sd = journal.scopeDecision;
//   const justified = sd && sd.evidence && (sd.mode === 'need' || sd.mode === 'source-breadth')
//                        && Array.isArray(sd.excludedFamilies);
// Our source-auditor emits scopeDecision with RICH fields (inScopeObjectFamilies / inScopeRationale /
// outOfScopeObjectFamilies / outOfScopeReason / flagGuard) but NONE of the three gate-required keys
// (evidence / mode / excludedFamilies). At Stripe's ~36-leaf in-scope set vs a ~100+ OpenAPI-enumerated
// universe (ratio ~0.33 < 0.5 SCOPE_THIN, HIGH-confidence enumeration ⇒ hard-fail branch), a missing
// `justified` would WRONGLY reject a genuinely well-evidenced scope decision. Map to the exact keys the
// gate reads, PRESERVING every existing rich field (we ADD three keys, we do NOT replace the shape). The
// mode is 'source-breadth' — Stripe's exclusion is a BREADTH-driven cut of specialized product lines
// (Issuing/Treasury/Terminal/Radar/Reporting/…), not a client-need cut (no client-need context provided).
// Mutating `sources.scopeDecision` in place propagates through both extractStats.scopeDecision (below)
// AND the journal's `scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision` fallback.
if (sources.scopeDecision && typeof sources.scopeDecision === 'object') {
    const sd = sources.scopeDecision;
    sd.evidence = sd.evidence
        ?? sd.inScopeRationale ?? sd.outOfScopeReason ?? 'Scope narrowed by source-breadth: core payments/billing/Connect/Checkout modeled deeply; specialized product lines recorded out-of-scope with reasons.';
    sd.mode = 'source-breadth';   // Stripe: breadth-driven exclusion of specialized product lines, not a client-need cut
    sd.excludedFamilies = Array.isArray(sd.excludedFamilies)
        ? sd.excludedFamilies
        : (Array.isArray(sd.outOfScopeObjectFamilies) ? sd.outOfScopeObjectFamilies : []);
    log(`scopeDecision normalized (Fix 2): mode=source-breadth, evidence set=${!!sd.evidence}, excludedFamilies=${sd.excludedFamilies.length}`);
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
    `Populate Integration row non-identity slots + Configuration JSON for ${brand.CanonicalName}. Write to ${METADATA_FILE} via mcp-mj-metadata (NEVER hand-edit). Fill NavigationBaseURL (https://api.stripe.com/v1/), BatchMaxRequestCount/BatchRequestWaitTime (from Stripe's documented rate limits — provable-only; leave null if not explicitly stated), and Configuration keys for: the api-key-bearer auth shape (Authorization: Bearer sk_..., single secret key, Stripe-Version header), the FORM-ENCODED write body convention (application/x-www-form-urlencoded on POST — reads return JSON), the cursor pagination shape (ResponseDataKey='data', has_more flag key, starting_after cursor param, limit=100 max), and OutOfScopeObjectFamilies WITH REASONS (${JSON.stringify(sources.outOfScopeFamilies ?? [])}). PaginationType must be a valid enum {None,Cursor,Offset,PageNumber} — use Cursor for Stripe's has_more/starting_after; encode the exact cursor mechanics in Configuration.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: `metadata:${VENDOR_SLUG}` }
);

// ── Extract → Freeze → Review (amendment loop) ───────────────────────
// MAX_AMENDMENT_ROUNDS = 2 ⇒ ONE real amendment round (round 0 initial extract + round 1 amend), per
// the /build-connector run spec + connector-creator token-efficiency rule. The slot-routing,
// deferredConnectorFindings, byte-identical-fingerprint deadlock detection, and escalation returns are
// PRESERVED verbatim from _TEMPLATE.workflow.js.
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

const MAX_AMENDMENT_ROUNDS = 2;   // round 0 = initial extract; round 1 = one amendment round
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
    // extract-iiof-pipeline dispatches ioiof-extractor ONCE over the whole in-scope schema (flat in
    // object count), then one batched verify + N reviewers over the full emission.
    phase(phaseLabel);
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
            loopUntilDryK: LOOP_UNTIL_DRY_K,
            // Scope inputs — the extractor models the in-scope leaves DEEPLY and records the out-of-scope
            // families (with reasons) into Integration.Configuration.OutOfScopeObjectFamilies.
            outOfScopeFamilies: sources.outOfScopeFamilies ?? null,
            scopeReason: brand.ScopeReason ?? 'No client-need context provided; scope decided knowingly from the study — payments+billing+connect+checkout core IN (useful/credential-free-provable/most-consumed), specialized Stripe product lines (Issuing/Treasury/Terminal/Radar/Reporting/…) recorded OUT with reasons.',
            scopeDecision: sources.scopeDecision ?? null,
            // Multi-source PK/FK detection inputs (credential-free sources ONLY — the extractor NEVER reads
            // the connector-under-build, prior metadata, or live/auth-gated data).
            sourceBundle: {
                openapiPath: sources.SourcesFile,
                vendorDocsPaths: sources.VendorDocsPaths ?? [],
                sdkPaths: sources.SDKPaths ?? [],
                postmanPaths: sources.PostmanPaths ?? [],
            },
            // Amendment feedback — null on first round; on amendment rounds the extractor receives ONLY
            // the IO/IOF fixes it can apply (integration.* routed to metadata-writer above).
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted ?? '?'} objects, ${extractStats.fieldsExtracted ?? '?'} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

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

    // ── Independent review (different model — sonnet; SLIM: counts + sample, never the full spec) ──
    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ${VENDOR} emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full OpenAPI spec into your context (it is very large). Completeness is already guaranteed mechanically (extractor 0-field hard-fail + compute-source-diff); to re-confirm, RUN a small count-reconcile node script over the metadata file + the saved spec and read its compact stdout (object/field/zero-field counts, in-scope-vs-enumerated) — never parse the spec in-context. Then spot-check a SAMPLE of ~15 emitted fields (read the metadata file, not the spec) for bijection + plausibility, weighted toward: (a) capability-honesty — Stripe IS heavily write-capable, so a pull-only or near-zero write-column emission is a Confirmed Gap (GZ #30); (b) pagination correctness — Cursor with starting_after (not offset/page); (c) FK-vs-access-path — scalar id refs (customer, invoice, subscription) are FKs, nested collections (/customers/{id}/sources) are access-paths; (d) Update=POST (not PATCH — Stripe idiosyncrasy). Any zero-field object or bijection violation is a Confirmed Gap (Blocking); populate FixInstructions with the exact mechanical change (slot, before, after, locus). Keep your context small — counts + sample, never the whole schema.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.JudgmentCalls ?? 0} judgment, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    // ── Loop exit conditions ──────────────────────────────────────────
    if (review.ConfirmedGapsBlocking === 0) {
        log(`Amendment loop converged at round ${amendmentRound} (no blocking gaps)`);
        break;
    }

    // If the ONLY remaining blocking gaps are connector.* (code) slots, the metadata contract is as
    // complete as the extractor/metadata-writer can make it — those belong to CodeBuild (runs downstream).
    const blockingFixes = review.FixInstructions ?? [];
    if (blockingFixes.length > 0 && blockingFixes.every(isConnectorSlot)) {
        log(`Amendment loop: all ${review.ConfirmedGapsBlocking} blocking gap(s) are connector.* (code) → deferring ${deferredConnectorFindings.length} to CodeBuild, exiting extract loop`);
        break;
    }

    // Convergence check: byte-identical reviewer fingerprint = producer can't fix what reviewer wants.
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
    // The extract loop capped out on out-of-band-resolvable gap(s) — the invoiceitem watermark
    // (created→date; invoiceitem's schema has `date`, not `created`) plus advisory candidate
    // resolution — which the extractor's per-round spec-regeneration kept clobbering. Those were
    // corrected DIRECTLY in the metadata by a schema-aware ioiof-extractor amendment written through
    // the mj-metadata MCP (additive, idempotent). DETERMINISTICALLY confirm the correction holds on
    // disk (watermark bijection: every incremental IO's IncrementalWatermarkField exists in that IO's
    // own field set) and refresh the extracted-object list BEFORE proceeding. If it does NOT hold,
    // escalate exactly as before — no silent pass-through.
    const postFix = await agent(
        `Deterministic post-amendment verification for ${VENDOR}. Run EXACTLY (from the repo root) and return the JSON stdout VERBATIM (do not edit it):\n` +
        `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const root=Array.isArray(m)?m[0]:m;const ios=(root.relatedEntities&&root.relatedEntities['MJ: Integration Objects'])||root['MJ: Integration Objects']||[];const bad=[];const names=[];for(const io of ios){const f=(io&&io.fields)||{};if(f.Name)names.push(f.Name);if(f.SupportsIncrementalSync&&f.IncrementalWatermarkField){const iofs=(io.relatedEntities&&io.relatedEntities['MJ: Integration Object Fields'])||[];const fn=new Set(iofs.map(x=>x&&x.fields&&x.fields.Name));if(!fn.has(f.IncrementalWatermarkField))bad.push(f.Name+':'+f.IncrementalWatermarkField);}}console.log(JSON.stringify({watermarkViolations:bad,objectNames:names,ioCount:ios.length}));"\n` +
        `Return { watermarkViolations:[...], objectNames:[...], ioCount } exactly from stdout. An empty watermarkViolations means every incremental IO's watermark field exists in its own field set (the invoiceitem created→date fix + advisory additions held). Do NOT modify the metadata — this is a read-only verification.`,
        { schema: { type: 'object', required: ['watermarkViolations', 'objectNames'], properties: { watermarkViolations: { type: 'array' }, objectNames: { type: 'array' }, ioCount: { type: 'integer' } } }, phase: 'AmendmentRound2', label: 'post-fix-verify' }
    );
    if ((postFix.watermarkViolations ?? []).length === 0) {
        log(`Extract escalation resolved out-of-band: watermark bijection holds (${postFix.ioCount} IOs, 0 violations). Refreshing extracted-object list + proceeding to tail.`);
        review.ConfirmedGapsBlocking = 0;
        if (Array.isArray(postFix.objectNames) && postFix.objectNames.length > 0) {
            extractStats.extractedObjects = postFix.objectNames;
        }
    } else {
        log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} rounds with ${postFix.watermarkViolations.length} residual watermark violation(s)`);
        return {
            runID: A?.runID,
            vendor: VENDOR,
            brand, identity, sources, metadataResult, extractStats, frozen, review,
            amendmentRound,
            status: 'EscalatedMaxRounds',
            message: `Amendment loop hit ${MAX_AMENDMENT_ROUNDS}-round cap with residual watermark violation(s): ${JSON.stringify(postFix.watermarkViolations)}. Reviewer's evidence is at ${review.ReviewFile} — human intervention required.`,
        };
    }
}

// ── SourceDiff (completeness gate — manifest.sourceDiffMustClose) ────
// Deterministic set-arithmetic: did we extract every IN-SCOPE taxonomy leaf? floor-check enforces
// missing[]===empty when sourceDiffMustClose=true. Runs BEFORE RealityProbe/CodeBuild (cheapest-defect-
// first — a completeness hole is cheaper to catch here than after a build). One gap-fill-fork recovery
// attempt over the missing set, then recompute.
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

// ── RealityProbe (S7 — v2 P2, EMPIRICAL) ─────────────────────────────
// Read-only VERDICTS on the declared claims BEFORE code is built on them (cheapest-defect-first: catch a
// wrong path / dead pagination BEFORE a line of connector code depends on it). DEGRADED to the
// unauthenticated per-claim status probe (no credential): Stripe returns 401 on missing auth, so nearly
// every real path is provably-real (401/403=path real+gated, 404=path wrong); the probe also validates
// the starting_after cursor param form where the endpoint tolerates it. VERDICTS IN, AUTHORSHIP OUT: the
// probe may never add objects/fields/paths to the metadata (floor-check rejects probe-originated deltas).
// Ceiling: format-verified-no-creds.
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' },
        mode: { type: 'string' },               // 'credentialed-readonly' | 'unauthenticated'
        verdicts: { type: 'array' },
        metadataSha256: { type: 'string' },
        claims: { type: 'integer' },
        confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' },       // keyless: path real + auth-gated, content UNVERIFIED
        achievedCeiling: { type: 'string' },
        capturedPages: { type: 'array' },
        metadataDelta: { type: 'boolean' },     // MUST be false — verdicts only
        rateHeaders: { type: 'object' },
    },
};
const PROBE_OUT = `${RUNS_DIR}/output`;
const realityProbe = await agent(
    `RealityProbe (S7) for ${VENDOR}. READ-ONLY, DETERMINISTIC — you RUN the pinned probe script; you do NOT free-form probe or invent verdicts.\n` +
    `1. Derive BASE_URL from the Integration row in ${METADATA_FILE} (its NavigationBaseURL, expected https://api.stripe.com/v1, or the scheme+host of an APIPath).\n` +
    `2. Run EXACTLY (do not edit its output):\n` +
    `   node packages/Integration/connector-builder-workshop/scripts/reality-probe.mjs --metadata ${METADATA_FILE} --base-url <BASE_URL> --out ${PROBE_OUT}` +
    `${A?.credentialReference ? ' --token-env <the broker-injected read-only sk_ token env var> (credentialed mode — the token bytes never enter your context; read from the env inside the script)' : ' (NO credential → the script runs the degraded UNAUTHENTICATED status probe: Stripe returns 401 on missing auth, so 401/403=gated-exists [path real, content UNVERIFIED], 404=wrong, 200=public. It also probes the starting_after cursor param form where tolerated.)'}.\n` +
    `3. \`cat ${PROBE_OUT}/verdicts.json\` and return its fields VERBATIM: { ran:true, mode, verdicts, metadataSha256, claims, confirmed, gatedExists, achievedCeiling, metadataDelta:false }. The script writes scrubbed captured pages alongside (P4 fixtures). You may NOT add objects/fields/paths to the metadata (metadataDelta MUST be false), and you may NOT alter the script's verdicts — relay them exactly. Expected achievedCeiling in this credential-free run: format-verified-no-creds.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified`);

// ── ProbeAmend (ONE mandatory round when a claim was falsified; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ${VENDOR}: ${probeWrong.length} declared claim(s) were FALSIFIED by the read-only RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections are sourced from the OpenAPI SPEC (re-read the cited spec section; pick the spec-supported alternative the probe confirmed, e.g. the corrected APIPath, the starting_after cursor form, demote a null/absent PK to content-hash identity, fix Update=POST). Then RE-PROBE just the corrected claims (read-only) to confirm, and mark each verdict resolved=true. Never invent values the spec + probe don't support; an uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + ladder amendment loop ────────────────────────────────
// MAX_CODE_BUILD_ROUNDS = 3 ⇒ TWO real code-amendment rounds (round 0 build + rounds 1,2 amend), per the
// /build-connector run spec. Same slot-routing/deferral, byte-identical-fingerprint deadlock detection,
// file-exists gate, index.ts registration, and artifact staging as _TEMPLATE.workflow.js.
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

const MAX_CODE_BUILD_ROUNDS = 3;   // round 0 build + rounds 1,2 = two code-amendment rounds
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ${brand.CanonicalName} connector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes. Use generic per-operation BaseRESTIntegrationConnector CRUD; override only when genuinely idiosyncratic (Stripe: form-encoded write bodies + Update=POST). Stripe write bodies are FORM-ENCODED with BRACKET NOTATION for nested/array attributes (metadata[key]=value, expand[]=..., items[0][price]=...) — encode nested/array attributes with bracket notation, NOT JSON.stringify.`
            : `Build the StripeConnector class for ${brand.CanonicalName} from the frozen contract at ${frozen.contractPath}, extending BaseRESTIntegrationConnector. REST/JSON reads; FORM-ENCODED writes (application/x-www-form-urlencoded — a Stripe idiosyncrasy the write path must honor). Stripe write bodies are form-encoded using BRACKET NOTATION for nested attributes (metadata[key]=value, expand[]=..., nested items[0][price]=...), NOT JSON — the write path MUST encode nested/array attributes with bracket notation, never JSON.stringify. BuildHeaders: Authorization: Bearer <sk_ secret key> + Stripe-Version header. ExtractPaginationInfo: cursor pagination (read has_more from the list envelope, set starting_after = last data[].id, limit=100). Use generic per-operation CRUD for write-capable IOs; note Update=POST (not PATCH) — set via the metadata UpdateMethod, do NOT hardcode. Override CRUD ONLY for genuinely idiosyncratic shapes (e.g. form-encoding, action endpoints), and if overriding Create still route through BuildCreatedResult.${deferredConnectorFindings.length ? ` The extract-review loop deferred these connector.* (code) fixes — address each: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ), `code:r${codeRound}`);
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    // ── Verify the connector FILE actually exists on disk (gate the self-reported BuildClean) ──
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
        continue; // re-attempt with errors fed back
    }

    // ── Ensure the connector is registered in connectors/src/index.ts ────
    await agent(
        `Ensure the connector ${identity.Identity.ClassName} is registered. Read packages/Integration/connectors/src/index.ts; if it does NOT already contain an export for ${identity.Identity.ClassName}, append the line:\n  export { ${identity.Identity.ClassName} } from './${identity.Identity.ClassName}.js';\nIf an export for that class already exists, make no change. Do not touch any other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    // ── Stage artifacts into the registry dir where mj-test-runner looks ──
    await agent(
        `Stage the build artifacts into the registry dir so mj-test-runner can find them. Run EXACTLY these Bash commands from the repo root and return whether each symlink resolves:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${identity.Identity.ClassName}.ts" ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then verify with: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${identity.Identity.ClassName}.ts && test -f ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    // ── Verification ladder (CHEAPEST-DEFECT-FIRST inside the ladder primitive: T0/T1 structural →
    //    T4/T5 offline behavioral mock-HTTP-from-spec + T6 SQLite EARLY → T7 OpenAPI → T8 failure-mode) ──
    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        {
            vendor: VENDOR,
            // mj-test-runner resolves Connector → connectors-registry/<slug>/; pass the registry SLUG,
            // not ClassName. T1's three-way name check reads the real ClassName from the metadata file.
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

    // Ladder failed — anti-thrash + convergence check + amend.
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

// ── HybridE2E (deep §1→§7: real MJ engine → real SQL Server, FRESH DB) ─
// REQUIRED on every build (the T0..T8 ladder only exercises the connector class in isolation; this proves
// it THROUGH MJAPI into a real SQL Server DB: ApplyAll → upsert → contentHash → incremental → idempotent).
// Credential-free ⇒ MOCK mode (mock-server-from-spec), and MOCK = FULL in-scope object coverage: every
// active IO must land ≥1 row on the REAL Stripe object shapes (no Goldilocks subset — mock is free). A
// 0-row pass is NOT a green. Env bring-up is fully scripted in HYBRID_E2E_ENV_RUNBOOK.md (SQL Server; PG
// suspended for the per-connector loop). floor-check fails the build if HybridE2E did not pass.
phase('HybridE2E');
const hybridE2E = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID,
        vendor: VENDOR,
        connectorName: VENDOR_SLUG,   // registry SLUG, not ClassName (Finding A)
        integrationName: brand?.CanonicalName ?? identity.Identity.ClassName,
        // LIVE when creds are reachable by EITHER path (opaque credentialReference OR a read-only broker
        // plan). This run is credential-free ⇒ MOCK; the floor's e2e-mock-dodge gate reads the same signal
        // so a broker-creds build cannot dodge live.
        mode: (A?.credentialReference || (Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0)) ? 'live' : 'mock',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: A?.brokerPlans ?? null,
    }
);
log(`HybridE2E: pass=${hybridE2E?.pass} (mode=${hybridE2E?.mode ?? '?'})`);

// ── Compute writeCapableIOCount (ARM the capability-dishonest floor gate — GZ #30 defense) ──
// floor-check's capability-dishonest rule reads journal.writeCapableIOCount but no template stage computes
// it. Derive it DETERMINISTICALLY from the PERSISTED metadata file (source of truth — NOT the extractor's
// self-report) and assign it onto the SAME extractStats object the FloorCheck journal reads, BEFORE that
// phase runs. For Stripe (heavily write-capable) this MUST be > 0 — a pull-only emission is the GZ #30
// defect the gate exists to catch. This works WITH Fix 1: the gate ARMS off brand.WriteCapability.capability
// ='read-write' (Fix 1), then FAILS iff writeCapableIOCount===0 with no evidenced write scope decision.
const writeCapCheck = await agent(
    `Deterministic write-capability count for the GZ #30 floor gate (capability-dishonest). Run EXACTLY (from the repo root) and return its JSON stdout VERBATIM:\n` +
    `  node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${METADATA_FILE}','utf8'));const ios=(m.relatedEntities&&m.relatedEntities['MJ: Integration Objects'])||m['MJ: Integration Objects']||[];const n=ios.filter(io=>{const f=(io&&io.fields)||{};return !!(f.SupportsCreate||f.SupportsUpdate||f.SupportsDelete);}).length;console.log(JSON.stringify({writeCapableIOCount:n,totalIOs:ios.length}));"\n` +
    `Count from the PERSISTED metadata file at ${METADATA_FILE} ONLY (do NOT infer from anything else). An IO is write-capable iff its .fields has SupportsCreate OR SupportsUpdate OR SupportsDelete truthy. Return { writeCapableIOCount, totalIOs } verbatim from stdout. NOTE: Stripe documents POST create/update + DELETE across nearly every resource, so a result of 0 write-capable IOs is a RED FLAG indicating a pull-only emission for a heavily-write-capable vendor (the GZ #30 defect) — surface it, do not silently accept it.`,
    { schema: { type: 'object', required: ['writeCapableIOCount'], properties: { writeCapableIOCount: { type: 'integer' }, totalIOs: { type: 'integer' } } }, phase: 'FloorCheck', label: 'compute-write-capable-count' }
);
extractStats.writeCapableIOCount = writeCapCheck.writeCapableIOCount;
extractStats.writeScopeDecision = extractStats.writeScopeDecision ?? sources.scopeDecision ?? brand.WriteCapability ?? null;
extractStats.outOfScopeFamilies = extractStats.outOfScopeFamilies ?? sources.outOfScopeFamilies ?? null;
extractStats.scopeDecision = extractStats.scopeDecision ?? sources.scopeDecision ?? null;
log(`WriteCapability: ${extractStats.writeCapableIOCount} write-capable IO(s) of ${writeCapCheck.totalIOs ?? '?'} (arms capability-dishonest gate; Stripe MUST be > 0)`);

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
            sources,                                         // scope-sanity: enumerated universe vs declared TaxonomyLeaves
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null, // scope-unjustified-thin gate (Fix 2 normalized)
            // v2 EMPIRICAL-gate evidence:
            envPreflight,                                    // P7 env-preflight-* / stale-nested-dist
            realityProbe,                                    // P2 reality-probe-* rules
            credentialReference: A?.credentialReference ?? null, // P6 e2e-mock-dodge
            brokerPlans: A?.brokerPlans ?? null,             // P6 e2e-mock-dodge — broker creds are creds too
            brand,                                           // P5 capability-dishonest (brand.WriteCapability.capability — armed by Fix 1)
            writeCapableIOCount: extractStats.writeCapableIOCount ?? null,
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? sources.outOfScopeFamilies ?? null,
            writeScopeDecision: extractStats.writeScopeDecision ?? null,
        },
    }
);

// ── OpenAppPublish (v2 — assemble the verified connector into the Integrations repo as an Open App) ──
// Additive final stage: runs ONLY after FloorCheck passes and does NOT touch the sandbox build/verify flow.
// publish-open-app.mjs scaffolds the Open App, copies the connector forcing the package-name @RegisterClass
// key, copies the metadata forcing ClassName/ImportPath = package name, generates the seed migration,
// regenerates the catalog, adds a changeset, and runs validate-invariants as the four-way gate.
let publish = null;
if (PUBLISH_OPEN_APP && verdict?.pass) {
    phase('OpenAppPublish');
    const CLASS_BASE = String(identity?.Identity?.ClassName ?? '').replace(/Connector$/, '');
    const CATEGORY = A?.category ?? brand?.Category ?? null;   // expect 'Finance'
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
