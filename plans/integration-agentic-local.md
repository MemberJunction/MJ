# Agentic Plan — Local Connector Builder (never PR'd)

Companion to:
- [integration-framework-redesign.md](integration-framework-redesign.md) (the framework
  design)
- [integration-phase-0-pr1.md](integration-phase-0-pr1.md) (the framework PR scope)
- [integration-pr-roadmap.md](integration-pr-roadmap.md) (the connector PR sequence)
- Agent-side memory: `project-integration-redesign-agent`

**Where this work lives:** a local branch off the **Phase 0 framework branch**
(`feat/integration-framework-phase-0`), NOT off `next` directly — because the agentic
work depends on the new schema, base classes, EnrichSchemaConstraints, generic CRUD
action, MCP safe channels, etc. So:
- Branch 1 = `feat/integration-framework-phase-0` (off `next`) → opens PR 1.
- Branch 2 = `agentic/connector-builder` (off Branch 1) → **NEVER opens a PR**.

This is the workshop. Output that ships is *connector PRs* (per the roadmap), authored
by the system; the workshop itself stays private until the pattern is stable enough to
justify shipping its artifacts as a normal package.

**Existing prior work to build ON (not redo):**
- `INTEGRATION-AGENT-TODO.md` (273KB, in CCAF-exam-prep) — the master agent-build
  plan; §2.0-2.21 is the prior Phase 0 spec that this workshop's framework dependency.
- `INTEGRATION-REDESIGN-V1.md` — the clean-redesign V1 canonical design (§1-10).
- `MJ-INTEGRATIONS-ARCHITECTURE.md` (47KB) — AS-IS source of truth on MJ's existing
  framework.
- `AGENT-DESIGN-FRAMEWORK.md` — CCAF 8 paradigms (Patterns B/E/D/F mapping).
- `PHASE2-CONNECTOR-BUILDER-REQUIREMENTS.md` — Phase 2 design process.
- `POST-EXAM-INTEGRATION-PLAN.md` — control-comparison strategy (HubSpot ground truth).
- **10 existing agent definitions** on `connector-improvement` branch
  (`.claude/agents/`): `super-coordinator`, `connector-creator`, `identity-establisher`,
  `source-auditor`, `vendor-brand-researcher`, `metadata-writer`, `ioiof-extractor`,
  `code-builder`, `independent-reviewer`, `testing-agent`.
- **2 skills** on `connector-improvement` (`.claude/skills/`): `build-connector`
  (orchestration), `playwright-cli`.
- **5 convention rules** on `connector-improvement` (`.claude/rules/`):
  `connector-code-conventions`, `connector-provenance-conventions`,
  `connector-test-conventions`, `extractor-script-conventions`,
  `metadata-file-conventions`.

The dynamic-workflow direction is a **refinement** of these existing agents, not a
rebuild. The 10 agent .md files become starting capabilities/prompts; the
`build-connector` skill becomes the planner-emitted workflow shape. The rules become
the locked-primitive contracts.

**Why local-only:** the system *learns* during phase A (first connectors) and the
shape changes weekly. PR-ing iterations would thrash code review and pollute `next`.
The output that matters is the connector PRs the system produces — that's the public
surface.

---

## 0a. Bijective mapping — Phase 0 ↔ Agent framework (THE keystone)

The agent framework's correctness rests on a **bijection** between Phase 0's input
slots and the agent's emission points. For every slot Phase 0 expects, exactly one
agent step produces it via exactly one locked primitive; for every agent emission,
exactly one Phase 0 consumer absorbs it. **No missing inputs, no orphan outputs.**

Structurally enforced by three things:
1. `mcp-mj-metadata` Zod schemas reject any emission that doesn't match Phase 0 columns.
2. `mcp-mj-test-runner` exposes exactly the 13-tier ladder Phase 0 provides.
3. The **floor-check** sub-workflow iterates the Phase 0 input universe and confirms
   each slot has a non-null emission with valid provenance.

### Slot table (per-connector agent emissions ↔ Phase 0 consumers)

| Phase 0 slot | Phase 0 ref | Agent producer | Locked primitive |
|---|---|---|---|
| `Integration.{Name, Description, ClassName, ImportPath, NavigationBaseURL, BatchMaxRequestCount, BatchRequestWaitTime, CredentialTypeID, Icon}` | A schema; E metadata folder | **metadata-writer** | `audit-source` → `verify-claim` |
| `IntegrationObject.{Name, DisplayName, Description, Category, APIPath, ResponseDataKey, DefaultPageSize, PaginationType, SupportsPagination, SupportsIncrementalSync, IncrementalWatermarkField, SupportsWrite, DefaultQueryParams, Configuration, Sequence, Status}` | A schema; D0 discovery | **ioiof-extractor** | `extract-iiof-pipeline` |
| `IntegrationObject.{Create/Update/Delete}{APIPath, Method, BodyShape, BodyKey, IDLocation}` | A schema (write columns); C generic CRUD | **ioiof-extractor** (operation analysis from docs) | `extract-iiof-pipeline` |
| `IntegrationObject.MetadataSource` | A schema enum | Deterministic — `Declared` for research-emitted; runtime sets `Discovered`/`Custom` | (none — pipeline) |
| `IntegrationObjectField.{Name, DisplayName, Description, Category, Sequence, Status}` | A schema | **ioiof-extractor** | `extract-iiof-pipeline` |
| `IntegrationObjectField.{Type, Length, Precision, Scale, AllowsNull, DefaultValue, IsRequired, IsReadOnly, IsUniqueKey}` | A schema; B4 provable-only | **ioiof-extractor** (provable only; `type:[X,null]` for unprovable) | `extract-iiof-pipeline` + `verify-claim` |
| `IntegrationObjectField.IsPrimaryKey` | A schema; D2 PK rule | **ioiof-extractor** if declared in docs; otherwise runtime pipeline → D4 SoftPKClassifier | `extract-iiof-pipeline` (declared); pipeline-side (classifier) |
| `IntegrationObjectField.{RelatedIntegrationObjectID, RelatedIntegrationObjectFieldName}` | A schema; D5 FK-graph | **ioiof-extractor** (FK research — required-ordering in API paths = evidence) | `extract-iiof-pipeline` + `verify-claim` |
| Metadata file `metadata-integrations/<name>/.integration.json` | E folder; D1 step 2 | **metadata-writer** + **ioiof-extractor** assembled | `freeze-contract` |
| `connector.Authenticate()` body | C BaseREST; I auth helpers | **code-builder** (selects auth-helper pattern from research) | `emit-connector-code` |
| `connector.{BuildHeaders, MakeHTTPRequest, NormalizeResponse, ExtractPaginationInfo, GetBaseURL, TestConnection}()` bodies | C BaseREST methods | **code-builder** | `emit-connector-code` |
| `connector.TransformRecord()` body (optional override) | C TransformRecord hook | **code-builder** if record-shape research demands it; else omit (default identity) | `emit-connector-code` |
| `connector.{DiscoverObjects, DiscoverFields}()` bodies | D0 discovery abstracts | **code-builder** (per-vendor describe-endpoint research) | `emit-connector-code` |
| `@RegisterClass(BaseIntegrationConnector, '<Name>Connector')` | C registration rule | **code-builder** (deterministic from connector name) | `emit-connector-code` |
| Test fixtures + recorded responses | K tests | **code-builder** scaffolds + **testing-agent** records during T3/T4 | `verification-ladder-T0..T12` |
| Test execution results T0-T12 | K tests; H mcp-mj-test-runner | **testing-agent** | `verification-ladder-T0..T12` |
| Final connector PR | productization (out of Phase 0) | **planner** + runtime workflow execution | (whole workflow) |

### Phase 0 slots NOT in the per-connector bijection (Phase 0 ships once, not per-connector)

Framework substrate that's present once, not agent-emitted:
- Schema migrations (A) + entity classes via CodeGen (B).
- `BaseIntegrationConnector` + `BaseRESTIntegrationConnector` + `BaseGraphQL`/`BaseSOAP` scaffolds + generic CRUD (C).
- `IntegrationConnectorCreationPipeline` + `DiscoverAndPersistAuthenticatedSchema` + `PreSeedDeclaredMetadata` (D).
- `SoftPKClassifier` package (D4) — pipeline calls it; agents don't.
- `MJ_Integration_CRUD` canonical action + `StrongTypedActionMaterializer` (D3).
- FK-graph traversal in FetchChanges (D5).
- Progress-artifacts service + checkpoint engine (F).
- Auth helpers + type translation (H).
- `mcp-mj-metadata` + `mcp-mj-test-runner` servers (H).
- Connector class templates (H).
- The Phase 0 25-connector migration is in-scope but human-/agent-driven WITHIN Phase 0;
  the *agent framework* takes over for connector #26 onward.

### Floor-check enforces the bijection at the end of every run
```ts
for (const slot of PHASE_0_SLOTS_BIJECTION) {
  const emission = journal.findEmissionFor(slot);
  if (!emission) failures.push({rule: 'slot-not-filled', slot: slot.id});
  if (!emission.provenance) failures.push({rule: 'slot-not-verified', slot: slot.id});
  if (emission.value === undefined && !slot.nullable)
    failures.push({rule: 'unprovable-required', slot: slot.id});
}
```
Any missing / unverified / unprovable-required → run rejected → no PR. The bijection
is a runtime gate, not an aspiration.

### Spec drift = framework retraining trigger (the durability mechanism)

When Phase 0 changes (new column, deprecated field, new base method), the bijection
must update in lockstep. Concretely:
- `mcp-mj-metadata` Zod schemas are regenerated from entity definitions → schema
  changes propagate to agent interface automatically.
- The planner's structured spec digest is regenerated from `integration-phase-0-pr1.md`
  on every Branch 2 build — CI check on Branch 2 rejects builds where the digest is
  out of sync with current Branch 1 head.
- The floor-check's slot table is sourced from the same Phase 0 doc — single source of
  truth, updated once, propagated to verifier and planner together.

This is what makes the bijection durable: it can't drift silently because both sides
read from the same spec, and the runtime gate rejects any divergence.

## 0. Operating model (decided direction)

Per the dynamic-workflow conversation: the connector builder is a **dynamic Workflow**
where a *planning agent* authors a per-vendor workflow script, an *adversarial
reviewer* approves it, and the Workflow runtime executes it deterministically. Depth
of agents lives in (a) parallel expert breadth at judgment points, (b) Opus capability
where reasoning matters, (c) a scoped escalation hatch. Non-laziness is enforced by
**locked primitives the planner is forced to compose with** + a floor-checking gate +
a minimum-thoroughness manifest. Static workflow is rejected — it under-serves the
real variety across vendors.

**Two phases internally:**
1. **Learning phase** (first 3-5 connectors, the workshop): deep adaptive agents
   build connectors with looser orchestration so we *discover* what the deterministic
   pattern actually is. Free-reasoning, depth-first.
2. **Factory phase** (after pattern stabilizes): crystallize the learned pattern into
   the dynamic-workflow + locked-primitive library. The planner authors per-vendor
   scripts; the runtime enforces gates; productization wraps it.

Phase 1 happens in this workshop. Phase 2 starts when the pattern is stable enough
that the next connector goes through the dynamic workflow end-to-end.

---

## 1. Workspace shape

```
agentic/connector-builder/   (local branch off next, never PR'd)
├── workshop/
│   ├── primitives/           # locked sub-workflows the planner must compose with
│   ├── planner/              # planning agent prompts, schemas, model selection
│   ├── reviewer/             # adversarial reviewer agent
│   ├── verifiers/            # T0-T4 verification ladder implementations
│   ├── floor/                # floor-checking + minimum-thoroughness manifest
│   ├── corpus/               # learned per-vendor + per-shape lessons (gated)
│   ├── docker/               # productization shape (docker -p, service bus)
│   └── plans/                # planner-emitted workflow scripts per vendor (artifacts)
└── connectors-registry/      # per-vendor workspace (sources, evidence, plans)
    └── <vendor>/
        ├── sources/          # attached + scraped authoritative docs (pinned)
        ├── provenance/       # provenance sidecar, JSON-path keyed
        ├── evidence/         # extraction scripts + outputs
        ├── plan.workflow.js  # the per-vendor dynamic workflow script (planner output)
        ├── plan.review.json  # reviewer verdict
        ├── runs/             # journaled run artifacts (resumable)
        └── output/           # the actual connector PR contents (code + metadata)
```

This mirrors the redesign doc's "connector workspace" shape, expanded for the dynamic
model.

---

## 2. Locked-primitive library (the non-laziness floor)

Each primitive is a Workflow sub-workflow with structural guarantees baked in. The
planner MUST compose with these where they apply; the floor-checking gate rejects
plans that omit them. Authoring spec:

| Primitive | Purpose | Structural guarantee |
|-----------|---------|---------------------|
| `verify-claim` | Re-runs the extraction script for a claim against the pinned source (URL re-fetch OR attachment re-extract). Asserts `contract[path] === extractedValue`. | A claim only "exists" in the contract if its provenance script reproduces. Hallucination/staleness caught structurally. |
| `audit-source` | Multi-modal `parallel()` sweep over a URL (web/registry/attached file) returning {sourceType, freshness, coverage, authority, formatQuality} via schema. No self-score. | Source rankings can't be "I think it's good" — schema forces structured score. |
| `compute-source-diff` | Derives the source universe programmatically (docs nav tree / OpenAPI paths / describe enumeration) and diffs against extracted. Returns gap-set. | Completeness is computed, not judged. |
| `gap-fill-fork` | Spawns a context-forked agent with ONLY the gap-set + relevant sources. Returns proposed write-back. | Fork output flows through structured handoff; never fragments the canonical metadata. |
| `loop-until-dry` | Repeats finder rounds (parallel) until K consecutive rounds return zero new items. Schema-bound output per round. | Exit condition is structural, not producer-declared. |
| `adversarial-verify` | `parallel()` of N skeptics (different model, blind, prompted to REFUTE). Majority survives. | Single-producer laziness filtered by N reviewers. |
| `extract-iiof-pipeline` | `pipeline()` over the object universe — extract → verify → write metadata file per object. Schema returns stats only. | No huge token blobs returned; per-item verification before any synthesis. |
| `freeze-contract` | Materializes the structured contract artifact + provenance sidecar. Adversarial-verify runs on the contract itself. | Code-builder consumes only frozen contract; ad-hoc churn impossible. |
| `amendment-review` | Cheap reviewer over the diff between current and proposed plan/contract. Schema forces verdict + reasons. | Dynamic mutations don't bypass review. |
| `verification-ladder-T0..T4` | Each rung as its own sub-workflow with structured pass/fail + classified failure list. | Cannot ascend without lower rungs green; failures classify back to fix locus. |
| `floor-check` | Final gate: every claim through verify-claim? source-diff empty? T4 reached or T3 logged with reason? unprovable-asserted = 0? | Done is structural. Agent cannot declare done. |

Implementation: each primitive is a JS file in `workshop/primitives/` invoked via
`workflow({scriptPath: 'workshop/primitives/<name>.workflow.js'}, args)`. Strictly
content-addressed for resumability.

---

## 3. Planning agent

**Role:** given a vendor name + any attached documentation + optional credentials,
emit a per-vendor workflow script (`<vendor>/plan.workflow.js`) that the runtime can
execute to produce a connector PR.

**Inputs:**
- Vendor name + category.
- Attachments (PDFs, Postman collections, OpenAPI specs, partner HTML exports) —
  primary source type for private-doc vendors (Aptify, ACGI, etc.).
- Optional credentials (passed as opaque path; never read).
- Corpus lessons for this vendor or vendor-shape (auto-injected from gated corpus).

**Capabilities (structured contract via `schema`):**
- Classify the vendor against the API-shape taxonomy: protocol (REST/GraphQL/SOAP/file),
  auth pattern, pagination type, discovery pattern, doc accessibility.
- Decide which locked primitives to compose and in what shape (pipeline structure,
  parallel breadth, escalation thresholds).
- Generate a workflow script (TypeScript-as-JS) that imports the locked primitives,
  defines the pipeline/parallel/loop structure, and emits per-stage `agent({schema})`
  calls for the judgment points.
- **Cannot weaken** the locked primitives, omit `floor-check`, or skip
  `minimum-thoroughness-manifest` declarations (rejected by the floor before execution).

**Output schema (validated by Workflow runtime):**
```ts
{
  vendorName: string,
  vendorShape: 'REST+OpenAPI' | 'REST+private-PDF' | 'SOAP+partner' | 'GraphQL'
             | 'salesforce-derivative' | 'dynamics-derivative' | 'file' | 'other',
  authPattern: 'oauth2-cc' | 'oauth2-authcode' | 'oauth1' | 'api-key' | 'basic'
             | 'two-step' | 'token-exchange' | 'other',
  scriptPath: string,                    // workshop/plans/<vendor>.workflow.js
  scriptHash: string,                    // content-addressed (resumability)
  minimumThoroughnessManifest: {
    extractEveryIO: boolean,
    verifyEveryClaim: boolean,
    sourceDiffMustClose: boolean,
    e2eTier: 'T2' | 'T3' | 'T4',         // realistic ceiling given creds available
    adversarialVerifyMinReviewers: number,
  },
  primitivesUsed: string[],              // names from §2
  rationale: string,                     // short prose justification for adversarial reviewer
}
```

**Model:** Opus (genuine reasoning required). Heavy budget — this is the most expensive
single agent call per connector but it amortizes across the entire build.

---

## 4. Adversarial reviewer agent

**Role:** prove the planning agent's plan is incomplete, lazy, or weakly gated. NOT
self-score, NOT "is this good" — actively try to break it.

**Inputs:**
- The plan script + manifest from §3.
- The corpus's prior failure modes for this vendor-shape.

**Output schema:**
```ts
{
  verdict: 'approved' | 'rejected' | 'approved-with-amendments',
  weaknesses: { area: string, evidence: string, suggestedFix: string }[],
  omittedPrimitivesWhereTheyApply: string[],
  underScopedManifest: boolean,
  amendmentRequests: { stage: string, proposed: string }[],
}
```

**Model:** Different from planner (Opus or Sonnet on a different prompt family). Blind
to the planner's confidence/rationale beyond the script artifact.

**Gate:** `rejected` → plan goes back to planner with reviewer's evidence. Loop up to
N times (budget-bounded); persistent rejection → escalate to human (this is the
honest "we can't build this vendor without intervention" path).

**Primitive:** the review itself runs through `amendment-review` for consistency.

---

## 5. Verification ladder — 13 tiers (T0-T12, per `INTEGRATION-AGENT-TODO.md` §2.19)

Run through `@memberjunction/mcp-mj-test-runner` (the credential safe channel — only
place credential paths are dereferenced; agent passes opaque path, MCP subprocess reads
in isolation, results return without credential bytes entering the conversation).

| Rung | What it verifies | Cred? | Notes |
|------|------------------|-------|-------|
| T0_StaticValidation | Metadata parses; provenance scripts re-run; source-diff closes; no unprovable-asserted. | No | Free; every handoff. |
| T1_InvariantValidator | The structural invariants formerly in `connector-validator` (ProvableOnly, ThreeWayNameMatch, FKMetadataCorrectness, CapabilityMethodMatch, NoUnresolvedEmissions). | No | Folded out of the retired package into this tier. |
| T2_CrossProgrammaticConsistency | Multiple extraction scripts produce consistent claims about the same field across sources. | No | Catches one-source-says-X-other-says-Y. |
| T3_DocStructureSelfCheck | The doc-structure parsing is internally consistent (the script that built the script still produces the same output). | No | Catches scrape-pattern drift. |
| T4_MockedFixture | Connector code runs against recorded response fixtures end-to-end. | No | The cheapest "does the code work" check. |
| T5_MockHTTPServer | Connector runs against a local HTTP server emulating the vendor API per the contract. | No | Catches request-shape bugs without live calls. |
| T6_LocalSQLiteBackend | Sync run executes against a local SQLite MJ backend; full pipeline minus the real vendor. | No | Cheap-ish; isolates connector bugs from DB integration. |
| T7_OpenAPIValidation | Request/response shapes validated against an OpenAPI spec (when vendor publishes one). | No | Only applies when OpenAPI available. |
| T8_FailureModeInjection | Inject 429/500/timeout/bad-JSON at the HTTP boundary; verify retry + classify. | No | Forces failure handling without waiting for prod. |
| T9_PropertyBasedFuzz | Generated random valid + invalid inputs against the connector; assert no crashes, errors classify correctly. | No | Stress test. |
| **T10_LiveAPIIntegration** | **Real vendor calls** via mj-test-runner with creds. Discover, pagination, one-page parse, sync into MJ. | **YES** | The "live" tier. |
| **T11_SDKDifferential** | **Same operations** via official SDK vs our connector; assert results match. | **YES** | Catches semantic divergence from vendor's own client. |
| T12_CommunityFixtures | Run against community-supplied fixtures (Postman exports, shared response samples). | No | Optional; supplemental confidence. |

**Anti-thrash invariant** (unchanged): if T10/T11 fail on something a lower rung could
have caught → gate-placement bug; add the check at the lower rung.

**Batch-fix-then-rerun** (unchanged): collect all failures from one tier-run, classify
each against the existing `SyncErrorCode` enum (reuse `ClassifyError`), fix the batch,
rerun the tier once.

**Credential safety**: T10 + T11 are the ONLY rungs that need credentials. Eleven
non-cred rungs cover most quality risks. A connector marked `format-verified-no-creds`
runs T0-T9 + T12 (everything credential-free) — that's substantially more thorough
than a static check, just not live-validated.

**Anti-thrash invariant:** if T4 fails on something a lower rung could have caught,
that's a *gate-placement bug* — add the check at the lower rung, do not silently
re-run T4. The ladder gets denser over time; T4 failures asymptote toward genuinely
T4-only phenomena.

**Batch-fix-then-rerun:** when T4 fails, collect ALL failures from one run, classify
each against the existing `SyncErrorCode` enum (`ClassifyError` in
`packages/Integration/engine/src/types.ts:48` — REUSE, don't reinvent), fix the
batch, rerun T4 once. Each class has a known fix locus (NULL violation → metadata
over-constraint; length overflow → sizing; 401 → auth code; missing field →
extraction gap).

---

## 6. Floor-checking + minimum-thoroughness manifest

After a planned run completes (or attempts to), the **floor-check** sub-workflow
runs as a final gate against the journal:

```ts
schema FloorVerdict {
  pass: boolean,
  failures: {
    rule: 'every-claim-verified' | 'source-diff-closed' | 'no-unprovable-asserted'
        | 'manifest-extractEveryIO' | 'manifest-verifyEveryClaim' | 'e2e-tier-met'
        | 'min-adversarial-reviewers-met',
    detail: string,
  }[],
}
```

`pass: false` → run rejected, output NOT promoted to a connector PR. The planner can
amend and retry; persistent floor failures escalate to human review.

The **minimum-thoroughness manifest** (declared by the planner in §3) is what the
floor checks against. The planner must declare it covers each of:
- Every IO discovered/declared goes through `extract-iiof-pipeline`.
- Every claim in the contract goes through `verify-claim`.
- `compute-source-diff` must close (or every gap explicitly skip-logged with a checkable
  reason: needs-auth / docs-unscrapable / deprecated / vendor-confirmed-absent).
- E2E ladder must reach the declared tier (T4 sync-verified OR T2/T3 format-verified
  with the reason logged — see roadmap's `sync-verified` vs `format-verified-no-creds`).
- Adversarial verifiers per claim ≥ declared minimum.

A lazy planner produces a thin manifest → reviewer (§4) rejects the manifest → no run.
A lazy executor passes the manifest's structural checks → floor rejects on actual
journal → no PR. Two independent gates; both must pass.

---

## 7. Corpus + learning (gated promotion)

**Append-only knowledge base** keyed by `(vendor, vendor-shape-signature)`. Each
PASSING build writes back:
- Authoritative sources that worked (URL + selector pattern, or attachment path).
- Scrape patterns that extracted cleanly (with success rates).
- Universal PK convention (if vendor has one).
- Pagination/auth shape parameters.
- Gotchas hit during T3/T4 that needed amendment.
- VERIFIED rubric scores (from §4 + §5, not self-reported).

**Poisoning guard:** a lesson is promoted to the corpus ONLY if the build that
produced it passed `floor-check`. Unverified lessons stay quarantined in
`workshop/corpus/quarantine/` for human review.

**Process meta-learning:** which gates keep failing across vendor-shapes, which
source types are reliable. This may *propose* primitive-library updates or new
manifest defaults — but human-gated promotion only. No auto-mutation of the
framework. (Same trap that produced connector-validator inflation.)

**Vendor-shape signature:** the planner's `vendorShape` classification (§3) becomes
the corpus key. Connector #200 of shape `salesforce-derivative` starts from the
corpus entry for `salesforce-derivative` — auth boilerplate known, pagination known,
discovery endpoint known.

---

## 8. Testing harness — with and without credentials

**With creds:** standard T3 → T4 ladder via `mj-test-runner` MCP (opaque cred path
handed to the MCP; agent never reads). E2E sync runs against docker workbench.

**Without creds (most connectors initially):**
- `curl format-check` sub-workflow: hits public endpoints (404s and 401s are FINE —
  the *format* of the error envelope is what's being verified), validates auth-header
  shape ("Authorization: Bearer …" / "x-api-key: …"), validates URL construction
  against documented format, validates that documented endpoints exist as paths
  (a 401 means the path *exists*).
- **Sandbox-key hunt:** the planner is instructed to look for legal vendor sandbox
  programs, public demo endpoints, sandboxed Postman collections with sample tokens.
  When found, T3 elevates with the sandbox key.
- **Status mark:** the floor's manifest captures the realistic ceiling. A no-creds
  build outputs a PR marked `format-verified, NOT sync-verified` — never laundered as
  proven (per the roadmap standing rule).
- **Credential arrival preempts:** when a real cred arrives for a previously
  format-only connector, the standing rule fires and a sync-verify PR jumps the queue.

---

## 9. First 3-5 learning-phase connectors

These run with *looser* orchestration than the final dynamic workflow — partly free-
reasoning agents — to discover the deterministic pattern. Suggested selection:

1. **HubSpot** (already tested, control case) — re-run through the workshop to
   establish ground truth for what the pattern should look like when it works.
2. **Aptify** (private-doc, attachment-driven) — establishes the attachment
   provenance flow and the Discovered-tier-heavy path.
3. **Stripe** (REST + OpenAPI, public, well-documented) — establishes the
   well-documented-public path; should be the cheapest, fastest build.
4. **Fonteva** (Salesforce-derivative) — establishes the derivative-corpus path
   (reuse Salesforce auth/pagination corpus entry).
5. **NetForum** (SOAP + partner) — establishes the SOAP-protocol-base requirements.

After these 5, the patterns observed across them are the input to crystallization
(§10). If patterns diverge wildly, run 2-3 more before crystallizing — don't lock the
script too early.

---

## 10. Crystallization criteria — when to lock the script

Move from learning phase to factory phase when:
- Three consecutive connectors from §9 produce floor-passing builds *with the same
  primitives composed in the same shape* for each vendor-shape class.
- The planner's `vendorShape` classification is stable (no new shape categories
  emerging).
- The minimum-thoroughness manifest defaults are clear (we know what every build
  must cover regardless of vendor).
- The corpus has at least one verified entry per major vendor-shape.

At that point: freeze the primitive library, the manifest defaults, the planner
prompt structure, and the reviewer rubric. The dynamic workflow is now the canonical
path. Productization (§11) wraps it.

If crystallization stalls, the right response is *not* to force-freeze a half-baked
pattern. It's to run more learning-phase connectors. The workshop earns its keep here.

---

## 11. Productization shape (docker -p, multi-tenant)

**Trigger:** user requests a connector via the multi-tenant SaaS UI → Azure service
bus queues the request with `{vendorName, attachments[], credentialReference}`.

**Worker:** spins up a fresh docker container with the workshop image + Claude Code
with `-p`. Container has the agentic primitive library mounted read-only; per-run
workspace is the connector-registry directory.

**Run:** the planner agent fires (§3); reviewer approves (§4); the dynamic workflow
executes; floor-check gates the output.

**Output:** the system raises a PR (NEVER merges) against the appropriate MJ repo
branch (per the roadmap, a daily-cadence PR slot). PR body includes:
- The plan + reviewer verdict.
- The minimum-thoroughness manifest.
- The journal + run artifacts.
- The floor-check verdict.
- T3/T4 results if creds were available.
- The corpus delta proposed.

**Resumability:** `resumeFromRunId` reactivates a killed run from the last green
gate, *not* from the start. Required for any productized pipeline that hits token
limits or container kills.

**Peek-friendly:** the structured progress artifacts (Phase 0 §F) make a run
auditable post-hoc without interrupting it. A human can watch any run's progress in
real time.

**Cost-bound:** each run has a `budget` (token target). Planner scales depth
(adversarial reviewer count, loop-until-dry K, T4 retries) to remaining budget.
Hard ceiling prevents runaway.

**Goal:** hundreds of connectors in ~30 days post-crystallization. Until then,
manual runs in the workshop, learning the pattern.

---

## 12. What gets PR'd vs stays local

| Lives on agentic local branch (NEVER PR'd) | Ships as a PR |
|--------------------------------------------|---------------|
| Workshop directory + primitives + planner + reviewer prompts | Connector PRs the system produces (per roadmap) |
| Docker workshop image config | The Phase 0 framework changes (separate PR — phase-0-pr1.md) |
| Corpus + quarantine | Action retirement PRs (BizApps dedup) |
| Per-vendor plan scripts (planner artifacts) | OpenApp packaging PRs (post-LTS) |
| Run journals + artifacts | Framework-level fixes the workshop discovers |

The workshop is the kitchen; the connectors are the meals. The kitchen never goes on
the menu. If the kitchen design stabilizes enough to be useful externally, *then* we
extract a package (`@memberjunction/connector-builder`) as its own future PR — but
that's not a PR 1 problem.

---

## 12a. The prior topology preserved under the dynamic-workflow model (canonical principle)

The rant from the user remains the canonical principle — **decomposition to avoid
duplicate logic, the order and way of gathering info is THE key, completeness over
speed, provable-only, no NVARCHAR(MAX), no fabricated PK/FK, runtime per-connector
seeding, lightweight enrichment over heavy DBAutoDoc, depth of agent hierarchy
(ConnectorCreator → WebSearchAgent → 3 subagents → CodeBuilder → TestingAgent),
gaps are the real enemy**. The dynamic-workflow model SERVES this principle; it does
not replace it.

### Two depth dimensions (the reconciliation)

- **Workflow nesting depth**: capped at 1 (`workflow()` inside a child throws — Workflow
  tool spec). Runtime constraint on sub-workflow invocation, not agent hierarchy.
- **Agent depth within any `agent()` call**: UNLIMITED. An agent invocation can
  recursively spawn its own Task subagents, which can spawn their own. The prior
  ConnectorCreator → WebSearchAgent → 3-subagents tree survives as a *deep agent
  hierarchy inside one `agent({schema})` call*. Depth is not flattened.

### Topology mapping (prior agent architecture ↔ dynamic-workflow)

| Prior agent | Dynamic-workflow role | Internal sub-agents | Authoring agency |
|---|---|---|---|
| **ConnectorCreator (coordinator)** | Planner agent that authors top-level per-vendor workflow script. Sacred. | (none direct — invokes sub-agents via workflow stages) | Authors top-level script |
| **WebSearchAgent** | `agent({schema})` stage in workflow | source-search, metadata-fill-tool, IO/IOF-extractor (via Task) | Authors sub-workflows when sub-agents discover novel patterns |
| **source-search subagent** | Recursively within WebSearchAgent | Multi-modal parallel sweeps (web/registry/attachment) | Doesn't author workflows; feeds composition upstream |
| **metadata-fill-tool subagent** | Recursively within WebSearchAgent | Direct `mcp-mj-metadata` writes | Authors metadata-write sub-workflows for vendor-specific patterns |
| **IO/IOF-extractor subagent** | Recursively within WebSearchAgent (the hardest part per the rant) | Per-doc-structure scrape scripts | Authors per-vendor extraction sub-workflows (script-grep patterns) |
| **CodeBuilder** | Separate `agent({schema})` stage post-freeze-contract | Per-method-body Task subagents | Authors code-emission sub-workflows; spawns context:fork for gaps |
| **Independent reviewer** | Separate `agent({schema})` stage (different model, blind) | (none) | Authors amendment-review sub-workflows on diffs |
| **TestingAgent** | Separate `agent({schema})` stage post-build | Per-tier subagents | Authors per-tier sub-workflows; on T10 failure authors failure-classification sub-workflow |

### Authoring agency at every level

- Coordinator: top-level script.
- WebSearchAgent: sub-workflows when evidence demands (e.g., a vendor with unusual
  doc structure → extractor sub-agent writes a doc-specific scrape script + invokes it).
- IO/IOF-extractor: per-doc-structure extraction sub-workflows — exactly the
  "scrapable, fully understand format, mix of grep + tooling on HTML tree, structured
  rules for the pattern" from the rant.
- CodeBuilder: method-body composition sub-workflows; context:fork for gaps.
- TestingAgent: failure-handling sub-workflows on tier failures.

All gated by: **locked primitives (floor, immutable guarantees) + amendment-review
(gate-affecting changes rejected) + bijection floor-check (final gate; no shipping
with missing slots regardless of how the workflow evolved)**.

### What this preserves from the rant

- **Decomposition without duplication.** Each agent owns its scope; structured
  handoffs replace re-extraction. No agent re-reads what an upstream agent already
  emitted via `mcp-mj-metadata`. Files are the transfer medium for big things;
  schemas are the transfer medium for small things.
- **Order and way of gathering info as THE key.** WebSearchAgent's order is:
  sources → integration code-info (Phase 2b small) → IO/IOF (Phase 2c large, files).
  CodeBuilder runs in parallel with IO/IOF once Phase 2b is enough to start.
- **Programmatic generation over token return.** Sub-agents write scripts that emit
  IO/IOF to files via mcp-mj-metadata; only stats return via schema. Token-efficient
  per the rant.
- **Scratchpads + memory-efficient handoffs.** Per-vendor `connectors-registry/<vendor>/`
  workspace IS the scratchpad. Provenance sidecar + extraction scripts pinned there.
- **Coordinator decides gap-handling.** Sub-agents that hit gaps return structured
  results to the coordinator, which decides: spawn context:fork to fill, or accept
  with `type:[X,null]`, or escalate to human.
- **Completeness over speed.** Loop-until-dry K=2 minimum (K=3 for sparse docs).
  Coordinator doesn't declare done; floor-check does.
- **Web search agent as 3-sub-agent or flatten?** Per the rant's open question — both
  work. Under the dynamic-workflow model with depth-inside-agent-calls unlimited, the
  3-subagent variant (source/metadata-fill/IO-IOF) lives inside one WebSearchAgent
  invocation cleanly. The flatten alternative (3 separate agent stages in the
  workflow) is also valid but loses the shared context that the WebSearchAgent
  coordinates. **Recommend: keep the 3-subagent structure inside WebSearchAgent** for
  context sharing; promote to separate agent stages only if a sub-agent demands its
  own budget ceiling.

### What this changes from the prior framing

- The "flatten to one level" recommendation I gave earlier was wrong — that conflated
  workflow nesting (one level cap) with agent depth (unlimited). Depth survives as
  agent recursion inside any `agent({schema})` call. The prior topology stays intact.
- Dynamic workflow authoring extends to every sub-agent. A novel doc structure
  → IO/IOF-extractor subagent writes a custom extraction sub-workflow on the spot.
  A novel auth pattern → metadata-fill-tool subagent writes a custom auth-detection
  sub-workflow. CodeBuilder hits a missing piece → spawns context:fork research
  sub-workflow. TestingAgent finds T10 fail → authors classification + amendment
  sub-workflow.

This is the union — full prior depth + on-spot dynamic workflow authoring at every
level, all gated by locked primitives + bijection + floor-check. The rant's principles
are preserved, the dynamic-workflow benefits (resumability, structured contracts,
deterministic gates) are added on top.

## 12b. Workflow authoring is agent work at every level (clarifying principle)

Workflows are the substrate because of their structural benefits — **context
management** (each agent sees only what it needs via the `agent({schema})` boundary),
**contract enforcement** (schemas force structured output), **long-task durability**
(`resumeFromRunId`), **deterministic gates** (the runtime executes the same way every
time). Those benefits are why we use workflows at all.

**But the workflows themselves are AGENT-CREATED, not human-pre-written.** At every
level. Evidence-driven. On-the-spot.

### Two layers, not one

- **Locked primitives = the GUARANTEES floor** (verify-claim, audit-source,
  extract-iiof-pipeline, adversarial-verify, loop-until-dry, floor-check, etc.).
  Immutable. Their structural guarantees can never be weakened by anything composing
  with them. This is the non-laziness substrate.
- **Composition of primitives = the FLEXIBILITY ceiling.** Authored by agents at every
  level based on evidence as it arrives. Not pre-planned exhaustively. Not one big
  script written upfront. Dynamic, layered, evidence-reactive.

### Multi-level authoring (the deep sub-agent point)

1. **Top-level planner** writes the initial per-vendor workflow script — uses the
   capability discovery from Gap 1 + corpus + attached docs to compose primitives into
   a vendor-specific shape.
2. **Sub-agents within that workflow can spawn their own sub-workflows.** When a
   running extract-iiof-pipeline encounters an unexpected vendor pattern (a paginated
   resource embedded in a non-paginated parent, say), the sub-agent doesn't fail or
   fall back to a generic — it authors a sub-workflow on-the-spot using locked
   primitives in a novel composition, invokes it via `workflow({scriptPath:...})`, and
   continues.
3. **Evidence-driven amendments to the running plan.** When T3 live-read contradicts
   the frozen contract (the auth flow has an undocumented refresh step, the watermark
   field name in production differs from docs), the affected branch of the workflow is
   regenerated mid-run, the amendment-review primitive evaluates the diff (Gap 9
   thresholds), and execution continues from the resumable checkpoint.

This is what "deep sub-agent stuff" means concretely — every sub-agent has authoring
agency over the workflow shape within its scope, gated by:
- Locked primitive guarantees (cannot be weakened).
- Amendment-review threshold (gate-weakening changes rejected; gate-strengthening or
  scope-neutral additions approved).
- Bijection floor-check (final gate; no shipping with missing slots regardless of how
  the workflow evolved during the run).

### Why this matters more than "pre-write one script"

- **Real APIs surprise you.** Static research can't predict every quirk; runtime
  evidence forces composition changes that no pre-written script could anticipate.
- **Long tasks need adaptive depth.** A simple vendor finishes in 30 minutes with a
  shallow script; a hard one needs the runtime to spawn additional verifier rounds
  when a contradiction surfaces. Same framework, evidence-scaled depth.
- **Context efficiency.** A sub-agent authoring a sub-workflow operates on the minimal
  context for its scope, not the full vendor build. The schema boundary at every
  `agent()` call compresses what each agent sees to what it can act on.
- **Contracts as enforcement.** Each composed primitive carries its guarantees with
  it; no agent can compose them in a way that bypasses those guarantees. The
  flexibility is *within* the floor, never below it.

So workflow choice is twofold: **use the Workflow primitive for its structural
benefits; let agents author the shape dynamically because evidence is the only
honest source of structure.** Pre-written workflows are static workflows are dead
workflows. Dynamic agent-authored workflows are how the framework actually handles
real-world variety while preserving the bijection + floor.

## 13a. Operational specs — closing the 10 design gaps

These are the gaps I flagged when honestly auditing the plan. Each now has a concrete
spec; the workshop builds against them rather than discovering them mid-flight.

### Gap 1 — Planner agent system prompt structure

```
ROLE: Planner Agent for the MJ Integration Connector Builder.

OBJECTIVE: Given a vendor, output a deterministic per-vendor workflow script (JS,
content-addressed) that the runtime executes to build a connector PR.

INPUTS INJECTED PER RUN:
  - {spec_digest}            // Phase 0 slot table + base-class signatures + primitive catalog
  - {vendor_request}         // name, category, attachments, credentialReference (opaque), budget
  - {corpus_lookup}           // matching vendor-shape entries (may be empty for new shapes)

DISCOVERY MODEL — capability-based, NOT shape-classification:
  Vendors do not reliably fit pre-defined shapes. Treat shape categories as
  HEURISTIC starting points for primitive composition + corpus lookup, NOT as
  gates on what's buildable. Discover the API's actual capabilities empirically
  from whatever sources exist.

CAPABILITY DISCOVERY (empirical, not classified):
  For each capability, answer from sources or leave null:
  - Read access: does the vendor document a way to read records? What addressing scheme?
  - Write access: documented create/update/delete? How structured?
  - Auth flow: what mechanism, what credentials, what flow shape?
  - Pagination: present? What kind? Where in the request/response?
  - Incremental signal: present? Which field/header/mechanism marks change?
  - Relationship model: how are inter-object relationships expressed (path nesting? FK fields? association endpoints?)
  - Batch semantics: are operations one-at-a-time or batch?
  - Async semantics: are operations sync or do they return jobs?
  - Filter/search: present? What query language?
  - Rate limiting: documented limits?

  Each capability's answer informs primitive composition. Each unprovable answer
  → null. The framework supports any combination that has discoverable
  capabilities.

SHAPE HEURISTICS (use for corpus lookup + composition defaults; not for gating):
  - If OpenAPI 3.x discoverable → likely REST+OpenAPI defaults apply.
  - If WSDL discoverable → likely SOAP+partner defaults apply.
  - If /graphql introspection responds → likely GraphQL defaults apply.
  - If vendor built on Salesforce AppExchange → likely Salesforce-derivative corpus useful.
  - If vendor uses Microsoft Dynamics OData → likely Dynamics-derivative corpus useful.
  - If data delivered as files only → likely File defaults apply.
  - NONE of the above is required; vendor may exhibit hybrid or novel patterns.

WHEN TO ESCALATE (not by failure to classify; by inability to discover):
  - No discoverable read capability → cannot build a connector; escalate.
  - No documented auth flow → cannot test; escalate or build format-only with explicit
    no-auth marker.
  - Capability discovery yields fewer than 3 confident capabilities → confidence too low
    to build; escalate.
  - Otherwise: build, composing primitives against the discovered capability set.
    Novel shapes are buildable; only undiscoverable APIs are not.

PRIMITIVE COMPOSITION HEURISTICS:
  - Always include: audit-source, extract-iiof-pipeline, freeze-contract,
    verification-ladder, floor-check.
  - Adversarial-verify N: easy shapes N=3; medium N=4; hard N=5.
  - Loop-until-dry K=2 minimum; if doc coverage <0.7 set K=3.
  - Gap-fill-fork: include only if source-diff is not guaranteed to close.
  - Amendment-review: include for any vendor with attached docs (mutation likely).

DISCIPLINE (NON-NEGOTIABLE):
  - Provable-only: every slot is `type:[X,null]`; null is the safe default.
  - You MAY NOT weaken any locked primitive's declared guarantees.
  - You MUST declare a minimum-thoroughness manifest that the floor-check can verify.
  - Output: a workflow script + manifest + rationale (≤500 words). NEVER raw IO/IOF data.

MODEL: Opus. Budget: per-run cap from caller; track via budget.remaining().
```

### Gap 2 — Reviewer agent adversarial prompt + bias mitigation

```
ROLE: Adversarial Reviewer Agent.

OBJECTIVE: Prove the planner's plan is incomplete, lazy, or weakly gated.
You do NOT score. You TRY to break it.

INPUTS YOU SEE:
  - The workflow script artifact
  - The manifest
  - The Phase 0 spec digest
  - Prior corpus failure modes for this vendor-shape

INPUTS YOU DO NOT SEE:
  - The planner's rationale, self-confidence, or model identity.
  - (Architectural firewall, not a request — the framework hides these.)

DEFAULT VERDICT: rejected. You must find a positive refutation OR explicitly
state "no refutation possible after exhaustive search" to flip to approved.

REFUTATION CHECKLIST (run all; each independently sufficient for rejection):
  1. Bijection coverage — iterate every Phase 0 slot; flag any without an emission stage.
  2. Adversarial-verify count vs vendor difficulty (table per Gap 4 below).
  3. Primitive omission — is any standard primitive missing where it applies?
  4. Manifest realism — sandbox claimed but no provenance? e2eTier over-declared?
  5. Source-ranking — script accepts tier-2/3 sources where tier-1 exists?
  6. Loop-until-dry K — flag if K=1 (insufficient convergence).
  7. Provenance shape — every claim slot has an extractionScript declared?

OUTPUT:
  { verdict: 'approved' | 'rejected' | 'approved-with-amendments',
    weaknesses: [{area, evidence, suggestedFix}],
    omittedPrimitivesWhereTheyApply: [...],
    underScopedManifest: boolean,
    amendmentRequests: [{stage, proposed}] }

BIAS MITIGATION:
  - You RUN on a different model from the planner (enforced by workflow runtime).
  - You see only the artifact, not the producer's reasoning.
  - If you find NO refutations after running every checklist item, return
    'rejected' with reason 'reviewer-found-no-refutations-suspicious' rather
    than 'approved' — silent approval suggests checklist gaming, not actual
    plan quality. The coordinator decides next action.
```

### Gap 3 — Locked-primitive script implementations (specs, not prose)

| Primitive | Input | Logic (high-level) | Output | Guarantee |
|---|---|---|---|---|
| `verify-claim` | `{claim:{slot, value, extractionScript, sourcePath}}` | URL re-fetch OR attachment re-extract → run script → assert `script_output === claim.value` | `{verified, actualValue, mismatch?}` | If verified=true, claim reproduces from pinned source |
| `audit-source` | `{url\|attachmentPath}` | Parallel agents per source kind; score on fixed rubric (tier/category/freshness/coverage/authority/formatQuality) — NOT self-score | `{sourceID, tier, category, freshness, coverage, authority, formatQuality}` | Structured reproducible scoring |
| `compute-source-diff` | `{universe: string[], extracted: string[]}` | `setDiff` both directions | `{missing, orphan}` | Deterministic; no LLM |
| `gap-fill-fork` | `{gapSet, sources}` | Spawn context-forked agent with ONLY gap-set + sources; structured handoff back to canonical files | `{filledSlots, residualGaps}` | Knowledge stays in canonical workspace; fork doesn't fragment |
| `loop-until-dry` | `{finders: Finder[], K: number}` | Repeat finder rounds until K consecutive return zero new items | `{accumulated: Item[]}` | Exit is structural, not producer-declared |
| `adversarial-verify` | `{claim, N: number, model: string}` | N skeptics in parallel on `model`, blind, prompted to refute; majority survives | `{survives: boolean, refutations: [...]}` | Single-producer laziness filtered |
| `extract-iiof-pipeline` | `{sourceID, objectList}` | `pipeline(objects, extract→verify)`; each object's IO/IOF written via `mcp-mj-metadata`; schema returns stats only | `{objectsExtracted, fieldsExtracted, gapsRemaining, provenanceVerified}` | Per-item independent; no synthesis before per-object pass |
| `freeze-contract` | `{contract, provenanceSidecar}` | Materialize contract artifact; adversarial-verify on contract itself | `{frozenContractHash}` | Code-builder consumes only frozen contract |
| `amendment-review` | `{currentPlan, proposedPlan}` | AST diff between scripts; classify each element as gate-affecting vs cosmetic; reject gate-weakening (see Gap 9) | `{verdict, gateAffectingChanges}` | Dynamic mutations cannot bypass review |
| `verification-ladder` | `{connectorName, manifest}` | Run T0→T12 via mcp-mj-test-runner; can't ascend rung until lower green | `{tierResults: TierResult[]}` | Strict gating; failures classify via ClassifyError |
| `floor-check` | `{runID, manifest}` | Iterate `PHASE_0_SLOTS_BIJECTION`; verify presence + provenance + manifest declarations met | `{pass, failures: [{rule, slot, detail}]}` | Final gate before PR open |

Each primitive lives at `workshop/primitives/<name>.workflow.js` and is invoked via
`workflow({scriptPath: ...})`. Implementations land iteratively during learning phase.

### Gap 4 — Per-connector cost projections + ceilings

Targets (validated against during learning phase):

| Vendor shape difficulty | Target tokens | Target wall-clock | Adv-verify N | Loop-until-dry K |
|---|---|---|---|---|
| Easy (REST+OpenAPI + sandbox available) | 50-150k | ~30 min | 3 | 2 |
| Medium (REST+public-HTML; partial sandbox) | 150-400k | ~2 hr | 4 | 2 |
| Hard (REST+private-PDF; no sandbox) | 400-800k | ~4-6 hr | 5 | 3 |
| Hard novel-shape (SOAP+partner first-of-kind) | 800k-1M | up to 8 hr | 5 | 3 |

**Hard ceiling: 1M tokens per connector run.** Above that, workflow self-terminates
with `floor-check.fail = 'budget-exhausted'` and escalates to human (Gap 5). No
runaway runs.

**Calibration:** measure actual cost for the 5 learning-phase connectors
(HubSpot/Aptify/Stripe/Fonteva/NetForum). If any exceeds 2× target, the table updates
and crystallization defers until we understand why.

### Gap 5 — Escalation hatch (when, what, how)

**When it fires:**
- Planner returns `vendorShape: 'other'` (novel API shape).
- Reviewer persistent reject after 3 amendment cycles.
- Floor-check fails with rule `unresolvable-gap` (manifest can't be met from inputs).
- Budget hits 1M ceiling (Gap 4).
- Test ladder fails at T10/T11 with `classify-failure: unknown` after batch-fix-rerun.

**Context provided to escalation:**
- Full workflow journal (events.jsonl).
- Planner's classification attempt + reviewer's rejection chain.
- Specific failure mode (which rule, which slot, which tier).
- Vendor identity + attachments inventory.
- Suggested next actions from the failing primitive (when it knows).

**Escalation output (structured human decision):**
```json
{
  "decision": "expand-taxonomy" | "mark-unbuildable" | "force-build-format-only"
            | "request-more-docs" | "retry-with-hints",
  "notes": "free-form for corpus",
  "hints": { /* shape-specific overrides for retry */ }
}
```

**Implementation:** escalation hatch writes to `connectors-registry/<vendor>/escalations/<ts>.json`;
UI surfaces it; **no auto-retry** without explicit human decision. Resumption uses
`resumeFromRunId` from the last green gate with the human's hints injected.

### Gap 6 — Corpus key collision: vendor-shape-signature is a tuple, not a string

```ts
type VendorShapeSignature = {
  protocol: 'REST' | 'GraphQL' | 'SOAP' | 'file' | 'other';
  authPattern: 'oauth2-cc' | 'oauth2-authcode' | 'oauth1' | 'api-key'
            | 'basic' | 'two-step' | 'token-exchange' | 'other';
  paginationType: 'Cursor' | 'Offset' | 'PageNumber' | 'None' | 'custom';
  docAccessibility: 'public-openapi' | 'public-html' | 'partner-pdf'
                  | 'mixed' | 'unavailable';
  platformDerivative: 'salesforce' | 'dynamics' | 'salesforce+nimble' | 'none';
};
```

Lookup uses **exact tuple match**. Collisions = identical API patterns, which is
intentional sharing (Stripe + Adyen + Square may all be `REST+OpenAPI/oauth2-cc/Cursor/
public-openapi/none` → they SHARE corpus, which is good). Subtle differences = different
buckets (Salesforce vs Salesforce+Nimble differ on `platformDerivative` → separate
entries, no cross-poisoning).

Promotion gate: lessons promoted only if floor-check passed AND the tuple was an
exact match (no near-match heuristics — those go to quarantine for human review).

### Gap 7 — Test-artifact data handling (PII safety on top of credential safety)

**Rule: synced test data NEVER ships with the connector PR.**

- T10/T11 sync test produces real records (PII risk).
- Records written to `connectors-registry/<vendor>/runs/<runID>/test-data/` during run.
- **`scrub-fixture` primitive runs before any fixture commits:**
  - Names → `<scrubbed-name-N>` placeholders.
  - Emails → `example+N@example.com`.
  - Phones → `555-01XX` test-range numbers.
  - Addresses → `123 Test St, Example, XX 00000`.
  - Dates → randomized within `2026-01-01` to `2026-12-31`.
  - IDs (ExternalIDs) → kept (needed for FK relationship verification).
  - Free-text → `<redacted>` if no clear safe substitution.
- **Test-data directory is wiped on PR open.** Only scrubbed fixtures ship.
- T4 mocked-fixture tier consumes the scrubbed fixtures, not raw.

**Credential safety + data safety:**
- Agent never sees credentials (mcp-mj-test-runner subprocess isolation).
- Agent never sees raw PII either (scrub runs at primitive boundary; agent receives scrubbed view).
- Wipe is enforced by floor-check: `runID/test-data/*` directory presence at PR-open time = floor-fail.

### Gap 8 — Spec-digest extraction pipeline

**Source:** `plans/integration-phase-0-pr1.md` (the Phase 0 spec).
**Target:** `workshop/planner/spec-digest.json` (structured, machine-readable).

**Extracted artifacts:**
- Bijection slot table (from §0a of this agentic doc).
- Schema migration column list (from Phase 0 §A).
- Base-class method signatures (Phase 0 §C).
- Locked primitive catalog (this doc §13a Gap 3).
- 13-tier ladder definitions (this doc §5).

**Implementation:**
- Script `workshop/planner/regenerate-spec-digest.ts` parses both markdown files
  (Phase 0 + agentic) using a deterministic AST-of-markdown approach (tables → JSON
  arrays, headers → sections).
- Runs as a **pre-commit hook on Branch 2** + as a **CI gate on Branch 2**.
- Mismatch detection: if Phase 0 has a column that the digest doesn't mention OR vice
  versa → build fails with the specific delta.
- Planner injects `spec-digest.json` into its context at run time — single source of
  truth, no drift.

### Gap 9 — Amendment-review diff threshold (what triggers reject)

AST-diff the workflow script (not text diff). Classify each changed element:

**REJECT (gate-weakening):**
- Adversarial-verify N reduced.
- Loop-until-dry K reduced.
- Locked primitive removed.
- Manifest declaration weakened: `e2eTier` downgraded, `extractEveryIO=true→false`,
  `verifyEveryClaim=true→false`, `sourceDiffMustClose=true→false`.
- Bijection slot coverage reduced.

**APPROVE (gate-strengthening or scope-neutral additions):**
- N or K increased.
- Additional primitives included.
- Manifest declarations strengthened.
- New slots added to bijection.
- Pure documentation/comment changes.

**REVIEW (equivalent substitutions):**
- One primitive replaced with another covering the same guarantee (e.g., switch
  model for adversarial-verify, swap source order in audit-source).
- Verdict required from full reviewer; not auto-approved.

Implementation: each script element annotated with `gateAffecting: boolean`; diff
walks both trees; gate-affecting changes route to full review, cosmetic changes
auto-approve.

### Gap 10 — Static PK/FK detection (multi-source evidence convergence)

**Revised 2026-05-30 after YourMembership test surfaced 126 deferred PKs and 0 emitted FKs against a vendor whose REST PDF + existing connector source + parametric paths all carried valid signal. The "explicit-OpenAPI-marker only" rule was too narrow and produced empty emissions.**

The agent **MUST extract every PK and FK it can find across all viable sources** before deferring to runtime D4. Deferring to runtime is the failure mode, not the safe default — it leaves the connector unusable until live sample data exists.

#### Viable source tier (any of these qualifies as evidence)

| Tier | Source | What it tells you |
|---|---|---|
| 1 | OpenAPI `x-primary-key` extension | Explicit PK |
| 1 | Vendor docs prose: "primary key" / "unique identifier" / "system ID" / "record ID" / "must be unique and non-null" | Explicit PK |
| 1 | Existing connector source code (when present) — `IsPrimaryKey`, `RelatedIntegrationObjectID`, PK-field literals | **Tier-1 evidence**: vendor-validated code that works in production |
| 1 | GetById / GetByX operation: the path parameter IS the field | Explicit PK |
| 1 | POST response `Location` header points at `/{Resource}/{field}` | Explicit PK (field is the new record's identifier) |
| 1 | POST response body returns the same field as the new record's identifier | Explicit PK |
| 1 | Parametric child paths `/Parent/{ParentId}/Children` where `ParentId` matches the parent's emitted PK | Explicit FK (`Children.ParentId → Parent`) |
| 2 | Consistent vendor-wide naming convention applied ≥ 80% of objects (e.g., every object has an `Id` field that GetById uses) | Strong convention signal |
| 2 | Field name = sibling-IO's-PK-name AND sibling IO exists in this emission | Strong cross-IO FK signal (`Note.ContactId → Contact` when `Contact.Id` is PK) |
| 2 | Sample response data shows the field is unique + non-null across N records | Statistical signal (when sample data fetchable without creds) |

#### Decision rule

The producer aggregates evidence across ALL applied sources, then emits per this table:

| Evidence convergence | Emission |
|---|---|
| ≥ 1 Tier-1 signal | `IsPrimaryKey=true` / `IsForeignKey=true` with provenance per signal |
| ≥ 2 Tier-2 signals (no Tier-1 contradicts) | `IsPrimaryKey=true` / `IsForeignKey=true` with provenance per signal; mark `EvidenceStrength='Convergent'` in CODE_EVIDENCE |
| 1 Tier-2 signal only, no Tier-1 | `IsUniqueKey=true` (when applicable); `IsPrimaryKey=undefined` (defer); note in EXTRACTION_REPORT.md why convergence didn't reach the bar |
| 0 viable signals AFTER actually checking each source | Defer to runtime D4 — but **the EXTRACTION_REPORT must list every source checked and prove the field was actually examined** |

#### Honesty rules

- **NO FABRICATION.** A field that has zero signal across all sources still defers — but the EXTRACTION_REPORT must enumerate every source consulted (per the checklist below). "I didn't check" is not "I checked and found nothing."
- **Provenance per signal.** Every Tier-1 / Tier-2 signal cites its source + locus. Multi-signal emissions list each contributing signal independently in CODE_EVIDENCE.
- **Cross-IO FK resolution.** When emitting a FK, the `RelatedIntegrationObjectID` target name MUST match an IO emitted in the same run. Singular-vs-plural mismatches (`Member` vs `Members`, `Event` vs `Events`) are bijection violations that the independent-reviewer will block.

#### Sources the producer MUST consult (in order)

For each IO:

1. **Existing connector source** at `packages/Integration/connectors/src/<Name>Connector.ts` (when present) — read it for PK/FK literals.
2. **Existing metadata file** at `metadata/integrations/<vendor>/.<vendor>.integration.json` (when present, may be legacy slug like `.<dot-vendor>.json`) — extract prior PK/FK assertions.
3. **OpenAPI spec** — `x-primary-key`, path operations, response Location headers.
4. **Vendor PDF / HTML docs** — prose markers for PK/unique identifier/FK relationships.
5. **SDK type definitions** — TypeScript / Python / C# SDK types carry annotations.
6. **Postman collection / community fixtures** — sample request/response data.
7. **Naming convention scan** — apply across the full emitted IO set; ≥ 80% threshold to qualify as Tier-2.
8. **Cross-IO name matching** — every IOF whose name matches another emitted IO's PK is an FK candidate.

#### Runtime D4 SoftPKClassifier still exists

D4 still runs at pipeline time for the residual (objects the agent honestly couldn't determine PK for after the multi-source sweep). But it's the **last** classifier, not the first. The agent is no longer entitled to "explicit marker only" laziness.

#### Floor-check enforcement

Floor-check inspects every IO's IOF set and rejects when:
- No IOF is marked `IsPrimaryKey=true` AND the EXTRACTION_REPORT does not enumerate the source-checks performed → producer was lazy, re-dispatch.
- A field named `<ObjName>Id` or `Id` is `IsPrimaryKey=false` AND no Tier-1 signal contradicts → suspicious miss, re-dispatch with reviewer evidence.
- A field name matches another IO's PK name AND `IsForeignKey=false` → suspicious miss, re-dispatch.

#### Sample data probing without credentials

For vendors where parts of the API are accessible without credentials (public ORCID record reads; published Postman snippets), the producer SHOULD probe sample endpoints to gather statistical signal — uniqueness, non-null, format patterns. This is Tier-2 evidence. The probe is a `curl` against a public path; nothing fancy.

## 13. Sequencing with PR 1

| When | What |
|------|------|
| Now → during PR 1 framework dev | Build skeleton of workshop, locked primitives, planner agent stub. Use HubSpot as test target since it's already built — feed its current code/metadata to the system as ground truth, see if the system can produce something *equivalent* to what already exists. Pure dry-run; no PR generated. |
| When PR 1 merges to next | Run the first 3-5 learning-phase connectors (§9) against the new framework. Workshop discovers the pattern. |
| When crystallization criteria met (§10) | Freeze primitives + planner + reviewer. Productization (§11) wraps the dynamic workflow. |
| Phase A of roadmap begins | System raises daily-cadence PRs from productization. Standing rules apply (credential arrivals preempt, etc.). |

The workshop and PR 1 develop in parallel. Workshop output starts feeding the
roadmap only after PR 1 has merged AND learning phase has run.
