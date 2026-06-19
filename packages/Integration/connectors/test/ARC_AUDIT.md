# Connector-Builder ARC Audit (READ-ONLY)

Audit of the connector-builder AGENT ARC in `/Users/madhavsubramaniyam/Projects/MJ/MJ-unified`.
Two questions per item: (1) does the arc ENCODE the capability? (2) for each proposed change E1–E8,
HOW to make it + is it partly there. Honest — UNVERIFIED where I couldn't confirm.

Scope read: `.claude/agents/*.md`, `.claude/rules/connector-*.md`, `.claude/skills/{build,test}-connector/SKILL.md`,
`packages/Integration/connector-builder-workshop/{primitives,floor,plans,scripts}/`, the test harness under
`packages/Integration/connectors/test/`, and the engine (`packages/Integration/engine/src/`).

---

## JOB 1 — Capability encoding (MATCH / PARTIAL / MISSING)

The arc has two layers: (a) the **engine** (`@memberjunction/integration-engine`) provides the runtime
hooks; (b) the **agent rules/floor** force the connector + metadata to fill them. Verdicts below cover both.

| # | Capability | Verdict | Evidence |
|---|------------|---------|----------|
| a | Static metadata: soft PK/FK + type/nullability constraints (provable-only) | **MATCH** | Slots `IntegrationObjectField.IsPrimaryKey/IsRequired/IsReadOnly/IsUniqueKey` + `RelatedIntegrationObjectID` in `floor/phase0-slots.json:462+`. Provable-only enforced by `floor-check.workflow.js:368-381` (PK/FK demand source evidence). Overlay precedence `IntegrationSchemaSync.decideBooleanOverlay` (undefined=curated wins). Rules: `connector-code-conventions.md` §"Source-side DTOs", `connector-provenance-conventions.md`. |
| b | Custom tables + columns: full-record pass-through, overflow, promotion — capture ENFORCED? | **MATCH (capture); PARTIAL (promotion test)** | `FullRecordPassThrough` is a T1 invariant (`connector-code-conventions.md` §"Full-record pass-through", `ioiof-extractor.md`). `BaseRESTIntegrationConnector.applyTransformPreservingKeys` (`:204-217`) re-adds dropped keys structurally. Floor gates capture: `hybrid-e2e.workflow.js:127,257,327` `captureEngaged` — `__mj_integration_CustomOverflow` must exist on every created table AND customs written where source carries them (else FAIL). **Promotion** (overflow→minted columns) is asserted only as advisory `customColumnsCaptured` (`hybrid-e2e:332`, NOT gated) — promotion firing is not a hard gate. |
| c | Template DAG / access-path: `ResolveParentChain`, `TraversalOrder`, nested-graph access-path | **MATCH** | `BaseIntegrationConnector.ResolveParentChain` + `TraversalOrder` (engine, grep-confirmed). Agent: `ioiof-extractor.md:103-104` (composite-PK junction edges, multi-parent FK-DAG, TraversalOrder = topo sort), `extractor-script-conventions.md` §"Access path for nested-graph". Template-var path rule in `connector-code-conventions.md`. DAG-layering live cell: `phase0-slots.json` E2E.PhaseB §3.6. |
| d | Syncing + data shape: transform, normalize, type-enforcement | **MATCH** | `TransformRecord` (`BaseRESTIntegrationConnector:185`), `NormalizeResponse`, `PostProcessRecord` (`BaseIntegrationConnector:494`). Documented `connector-code-conventions.md` §"Sync-efficiency contract". |
| e | Error handling: dead-letter, transient retry | **PARTIAL** | Transient retry IS real: `IntegrationEngine.ts:37-38` (`ClassifyError`/`IsRetryableError`/`WithRetry`/`RetryRunner`), AIMD throttle (`:1375`). `FetchWarning`/silent-empty surfacing documented. **Dead-letter queue**: no DLQ found in engine (grep `deadletter|DLQ` → none). Failed-record quarantine is reported via run counts/warnings, not a persistent dead-letter store. Arc has NO explicit DLQ encoding. |
| f | Incremental / watermarks | **MATCH** | `WatermarkService` (engine), `IncrementalWatermarkField` slot (`phase0-slots.json:168`), bijection rule (set when `SupportsIncrementalSync=true`). Harness `phaseWatermark` (`connector-e2e-harness.mjs:273-326`) proves server-side `*_since` OR content-hash narrowing. |
| g | Write-backs: per-op CRUD columns + capability↔method bijection | **MATCH** | All per-op slots present (`phase0-slots.json:186-298`: Create/Update/Delete APIPath/Method/BodyShape/BodyKey/IDLocation). Bijection floor-check enforces capability↔path+method. `BuildCreatedResult` loud-empty-ID rule. **Note:** write-path is proven by MOCKED tiers + unit tests only — live e2e is READ-ONLY (per `connector-test-conventions.md` read-only revision). Harness `phaseDelta` exercises create/update/delete in mock. |
| h | Concurrency: `MaxConcurrencyHint` | **MATCH (hook); PARTIAL (test)** | `BaseIntegrationConnector.MaxConcurrencyHint` getter (`:458`, default null). Engine concurrency cap honors it (`:848`). Live cell §3.7 "per-layer concurrency" exists but is live-only/advisory — no credential-free assertion of per-layer concurrency. |
| i | Rate-limiting: `RateLimitPolicy`, `ExtractRetryAfterMs` | **MATCH (hook); PARTIAL (test)** | `RateLimitPolicy` getter (`:430`), `ExtractRetryAfterMs` (`:452`), AIMD token bucket wired (`IntegrationEngine.ts:1375`, test `IntegrationEngine.ratelimit-wiring.test.ts`). Adaptive RL behavior under load is **live-only** (`plan.md` matrix M; no mock-429 calibration cell yet — see E1). |

**Job-1 summary:** core sync machinery is solidly encoded. The two genuine gaps: **(e) no dead-letter
queue** in the engine, and **(b/h/i) promotion + concurrency + adaptive-rate-limit are real hooks but
under-tested credential-free** — exactly what E1's matrix cells 10–17 target.

---

## JOB 2 — HOW to make each change (file + edit + partly-there)

### E1 — test-connector harness CODE for matrix cells 10–17
**Where the harness lives:** `packages/Integration/connectors/test/connector-e2e-harness.mjs` (the
connector-agnostic phase orchestration), composed of phase fns re-used from `gql-live-harness.mjs`. The
workshop wrapper is the `hybrid-e2e` primitive (`primitives/hybrid-e2e.workflow.js`) which stands up the
env and drives the harness. Phases are added as exported `async function phaseX({...})` then wired into
`runConnectorE2E` (`:435-504`).

**Partly there already:**
- Cell 13 (Merkle/content-hash skip): `phaseIdempotent` (`:232`) + `phaseWatermark` content-hash branch (`:315`). **Have.**
- Cell 16 (per-layer concurrency) / 14 (adaptive-RL): only `phase0-slots.json` §3.7 (live-only). **Mock cells MISSING.**
- Cell 17 (error/retry): engine `WithRetry` tested in unit tests; no harness cell. **MISSING in harness.**
- Cell 10 (discover-objects overlay+deactivation): `decideAbsentDeactivations` is unit-tested in the engine (`IntegrationSchemaSync.test.ts`) but NOT exercised in the harness. **MISSING in harness.**
- Cell 11 (discover-columns 3-source + streaming): not a harness cell. **MISSING.**
- Cell 12 (DAG-layering assertion): live-only §3.6; no mock cell. **MISSING.**
- Cell 15 (bidirectional write round-trip): `phaseBackwardCRUD` exists (live+broker-gated, `:479`); mock skips. **Live-only.**

**Smallest way to add each cell** (all in `connector-e2e-harness.mjs`, each a new `phaseX` + a call in `runConnectorE2E`, mock-mode where possible):
- **10 deactivation:** after setup, mutate the mock manifest to drop one object, call schema-refresh GraphQL, assert that IO flips `Status='Disabled'` (DB read) and reactivates when re-added. Uses existing `mock.manifest` + `db.rows`.
- **11 discover-columns 3-source:** drive `DiscoverFields` through (a) mock describe-endpoint route, (b) data-header, (c) stream-sample; assert each surfaces fields. Needs a small mock route + `db.rows` on `IntegrationObjectField`.
- **12 DAG-layering:** read `TraversalOrder` off discovered IOs (DB), assert it's a valid topo order of the FK edges (no parent after child). Pure DB + JS — cheapest cell.
- **13 Merkle skip:** already covered by `phaseIdempotent`; add an explicit Merkle-batch assertion using `HashDiff.js` if you want batch-level proof.
- **14 adaptive-RL via mock-429:** add a mock route mode that returns 429 + `Retry-After` for the first N calls; assert the run backs off (timing/`ExtractRetryAfterMs` parsed) and still completes. `mock-vendor-server.mjs` would need a transient-status mode.
- **15 bidirectional:** keep live/broker-gated (read-only floor forbids live mutation); mock round-trip is the substitute — extend `phaseBackwardCRUD` to a mock store.
- **16 per-layer concurrency:** instrument the mock to record concurrent in-flight count; assert peak ≤ `MaxConcurrencyHint`. Needs request-timestamp capture in `mock-vendor-server.mjs`.
- **17 error/retry:** mock returns a transient 5xx then 200; assert the record still lands (retry fired) and a permanent 4xx is surfaced as a warning, not a silent drop.
- **calibration vs credentialed headers (E8 overlap):** in live mode capture `X-RateLimit-*`/`Retry-After` and compare to the mock-429 calibration.

### E2 — promote `deploy-preflight.mjs` into floor-check
**STATUS: the file DOES NOT EXIST.** `find . -name "deploy-preflight*"` → nothing; the only hits are
prose mentions in `plan.md`, `AGENT_ARC_IMPROVEMENTS.md`, `salesforce/HYBRID_E2E_PROOF.md`. So E2 is
**author-then-wire**, not promote. (The closest existing artifact is `scripts/env-preflight.mjs`, which
checks the *env*, not metadata-vs-deployed-schema drift.)

**Where floor-check is:** `primitives/floor-check.workflow.js`. It's a JS-computed gate; the byte-fetcher
agent cats files (`:196-220`), then JS pushes to `failures[]`. New rules go in the `rule` enum (`:79-117`)
+ a JS check block.

**How to wire:** (1) write `floor/deploy-preflight.mjs` that takes the metadata file + a connection to the
deployed schema and diffs IO/IOF field names against actual `__mj.IntegrationObject`/`IntegrationObjectField`
columns + validates enum/CHECK values; (2) have the byte-fetcher run it (like step 12 `enumerate-catalog.mjs`
at `:216`) and return stdout; (3) add a `deploy-preflight-drift` rule that fails on any dropped field or
invalid enum.

**Fields the current (prose-spec'd) preflight misses** — per `plan.md` F1/F9 findings, the drop-list
should ADD: `IsForeignKey` (37k/10k silently dropped — not a deployed column), `Integration.Configuration`,
and the `@parent:IntegrationID` vs `@parent:ID` FK-lookup check (E5). The full DROPPED_FIELDS set already
known: `Source`, `IsForeignKey`, `SupportsCreate/Update/Delete`, `SyncStrategy`, `ContentHashApplicable`,
`StableOrderingKey`, `IsMutable`, `IsAppendOnly`, `IncludeInActionGeneration`, `Integration.Configuration`.

### E3 — stop the extractor emitting `IsForeignKey`/`Source` into persisted metadata
**Where emitted:** the per-vendor extractor scripts under `connectors-registry/<vendor>/scripts/extract-io-iof.ts`.
Confirmed: `netsuite/scripts/extract-io-iof.ts:377` emits `IsForeignKey: true` on the IOF object;
`Source` is referenced (NetSuite uses `fieldSchemaSource`, but `Source` is in the DROPPED_FIELDS list —
some scripts emit a `Source` field key). The **AGENT instruction** that prescribes FK shape is
`ioiof-extractor.md:51-104` (it tells the extractor to emit `IsForeignKey=true`).

**The nuance:** `IsForeignKey` is NOT a deployed column, so `mj sync push` silently drops it — the FK
survives only via `RelatedIntegrationObjectID`. So emitting `IsForeignKey` is harmless-but-misleading
(it never persists). To stop it: edit the extractor scripts to NOT set `IsForeignKey`/`Source` on the
emitted IOF literal, and amend `ioiof-extractor.md` to say "the FK is carried by `RelatedIntegrationObjectID`
+ (for soft-FK) `Configuration.ReferencedType` ONLY; do not emit `IsForeignKey`/`Source` (non-deployed,
dropped)." **Caveat:** `connector-code-conventions.md` and the soft-FK rule (`metadata-file-conventions.md`)
currently say soft-FK = `IsForeignKey=true` + `Configuration.ReferencedType` — so if you kill `IsForeignKey`
you must reconcile that rule too, or soft-FK loses its marker.

### E4 — auto-author `integration-object-deletes` when superseding a seeded connector
**Where it'd hook:** there's a `metadata/integration-object-deletes/` directory pattern (referenced in
`plan.md` F10) holding top-level `deleteRecord` files keyed on the prior baseline IDs. The arc currently
does NOT auto-author these — `plan.md:172` explicitly notes only `nimble` has a deletes file; salesforce/imis/
growthzone/propfuel are MISSING theirs ("real F10 gap"). **Author point:** a new workshop stage (or a
`metadata-writer` sub-step) that, before push, queries the deployed DB for the existing Integration's IO/IOF,
diffs against the new metadata, and emits top-level `deleteRecord` records for the stale rows into
`metadata/integration-object-deletes/<vendor>/`. The recipe is fully documented in
`metadata-file-conventions.md` §"Rebuilding a connector that was ALREADY seeded" (top-level deletes,
`--delete-db-only`, delete-before-upsert). **Partly there:** the recipe + the directory convention exist;
the AUTO-AUTHORING step does not. This is also a floor-check candidate ("seeded connector pushed without
a deletes file → stale-IO leftover").

### E5 — fix FK `@lookup` to use `&IntegrationID=@parent:IntegrationID` (not `@parent:ID`)
**Where the lookup string is built — TWO places, both still wrong:**
1. **Agent instruction** `ioiof-extractor.md:85`: `@lookup:MJ: Integration Objects.Name=<TargetIO>&IntegrationID=@parent:ID` — prescribes `@parent:ID` as the default.
2. **Extractor scripts** (the actual emit): `netsuite/scripts/extract-io-iof.ts:326,377`, `salesforce/scripts/extract-io-iof-all.ts:592,632`, `salesforce/scripts/extract-io-iof.ts:419,470` — all build `&IntegrationID=@parent:ID`.

**The defect** (per memory `project_connector_fk_lookup_parent_integrationid`): `@parent:ID` resolves to
the IO's own id, not its IntegrationID. The correct form is `&IntegrationID=@parent:IntegrationID` (reads
the parent IO's resolved IntegrationID). **Edit:** replace `@parent:ID` with `@parent:IntegrationID` in
`ioiof-extractor.md:85` AND in every extractor script's lookup-builder. **Partly there:** the CORRECT
form is already documented as the rule in `metadata-file-conventions.md` §"Connector-to-connector FK" and
proven on the NetSuite deploy — but the extractor scripts + the extractor agent still emit the wrong one.

### E6 — regenerate fixtures from CURRENT deployed metadata (kill drift)
**Where fixtures are generated:** multiple generators exist — `connectors/test/gen-fixture.mjs`,
`gen-sf-rich-fixtures.mjs`, `connector-builder-workshop/scripts/gen-fixtures.mjs`, and per-vendor
`connectors-registry/<vendor>/scripts/gen-fixtures*.mjs`. The mock path reads
`fixtures/<vendor>/fixtures/fixtures.json` (`hybrid-e2e.workflow.js:195`). **Drift risk:** fixtures are
hand/spec-authored, not derived from the deployed IO/IOF, so a metadata change can leave a stale fixture
shape (exactly `plan.md`'s "thin fixture" / "stale different-shape scaffold" findings; `hybrid-e2e:267`
warns "if fixtures are a STALE different-shape scaffold, regenerate them first"). **How:** make
`scripts/gen-fixtures.mjs` read the CURRENT metadata file (or the deployed `__mj.IntegrationObject*` rows)
as the source of object/field shape, then synthesize example payloads — so fixtures are a projection of
metadata, never independent. Wire it into the bring-up before the mock run. **Partly there:** the
generators exist and the harness already detects+warns on stale fixtures; what's missing is a
metadata-driven (not spec-driven) regeneration tied to the build.

### E7 — scoped-ApplyAll default in the test harness (not full-catalog)
**Where ApplyAll objects are chosen:** `plans.mjs:526-595` (`connector-e2e`). Objects =
`objectsOverride > fixtures Objects[] (mock) > cfg default`. Live mode reconciles against discovered IOs
and bounds to a **Goldilocks subset** (`GOLDILOCKS = 3`, `:583-590`). BUT the **deep** path in
`connector-e2e-harness.mjs:441-452` deliberately runs **FULL-catalog ApplyAll** (`setup.maps` = ALL
selectable objects) and only the DATA phases use the Goldilocks subset (`setup.syncMaps`). So today the
default is full-catalog ApplyAll on purpose (to prove DAG + at-scale DDL). **To make scoped the default:**
in `phaseSetup` (in `gql-live-harness.mjs`) accept a `cfg.applyScope` and, when scoped, pass only the
Goldilocks objects to ApplyAll. **Partly there:** the Goldilocks subset selection already exists for data
phases (`setup.syncMaps`); E7 is wiring ApplyAll itself to that subset by default (with full-catalog as an
opt-in). Note this trades away the at-scale DDL/DAG proof — keep a periodic full-catalog run.

### E8 — bake cred-free↔credentialed calibration (GZ/PropFuel both-ways) into the harness
**Where:** the live path is the same `runConnectorE2E` in live mode (`plans.mjs` connector-e2e-live,
broker-driven). The calibration concept exists only as prose in `plan.md` ("Live benchmark — how close
did cred-free get?") + `test.md:101`. **How:** add a comparison artifact — run both mock and live for
GZ/PropFuel, diff the per-cell verdicts (discover counts, rowcounts, watermark strategy, rate headers),
emit a `calibration.json` reporting which cells the cred-free run reproduced vs which only creds closed
(write round-trip, true rate). This is a new orchestration script (e.g. `connectors/test/calibrate.mjs`)
that invokes the harness twice and diffs. **Partly there:** both modes exist and the broker readonly
plans (`growthzone-readonly`, `propfuel-readonly`) are wired; the DIFF/calibration emission does not exist.

---

## JOB 3 — Token efficiency / how it thinks

**The general flow is sound — keep it.** The arc is built on the right principle: **answers come from
SCRIPT OUTPUT, not from content held in agent context.**

Confirmed good patterns:
- `source-auditor.md:37` "Scratch-pad, never context" — multi-MB schemas go to disk, inspected with `grep`/`node`/`jq`, never pulled into the reasoning window.
- `source-auditor.md:39-61` + memory `feedback_object_catalog_must_be_script_output`: `TaxonomyLeaves` is a SCRIPT's stdout (`enumerate-catalog.mjs`), never an in-context object list. `floor-check.workflow.js:416-481` re-runs the same enumerator itself and reconciles — so a hand-recited catalog can't pass.
- `ioiof-extractor.md`: agent cost is **FLAT in schema size** — one extractor script walks the whole catalog programmatically; the catalog never enters per-object reasoning. This is the single biggest structural token-saver and it's already in place.
- `floor-check` is JS-computed (the verdict is `failures.length===0` in JS); agents only fetch raw bytes.

**Flags (things that still risk large content in context):**
1. **`independent-reviewer` re-walks the sources** to build its own expected inventory (by design, to catch shared blind spots) — this re-reads big docs. It's a deliberate adversarial cost, but it's the one place a large doc can re-enter context. Mitigation: ensure the reviewer also uses `enumerate-catalog.mjs` output rather than re-reading the raw schema (memory `feedback_object_catalog_must_be_script_output` notes the slim reviewer "can't re-read source" — so it must rely on the script, not eyeballing).
2. **The byte-fetcher in `floor-check`** cats the connector `.ts`, metadata file, provenance, code-evidence, all cred schemas, all extractor scripts, the plan — into one agent return (`hybrid-e2e`/`floor-check:196-220`). For a 1,694-object metadata file (Salesforce) this is a very large blob in one agent turn. Mitigation: have the JS parse from disk paths via a tiny helper rather than round-tripping the whole file through an agent's structured return.

**Single highest-leverage token-saver:** the extractor's **one-script-walks-the-whole-catalog, flat-cost**
model (already implemented). The biggest *remaining* win is keeping the **floor-check / reviewer off the raw
source bytes** — both should consume the enumerator's structured output and read files via JS/`grep`, not
pull whole multi-MB schemas/metadata through an agent's reasoning window.

---

## Bottom line

- **Job 1:** 6 of 9 capabilities MATCH outright; **(e) dead-letter is MISSING** (no DLQ in engine — only retry); **(b) promotion, (h) concurrency, (i) adaptive-RL** are real engine hooks but **under-tested credential-free** (E1 closes these).
- **Job 2:** E2 (`deploy-preflight.mjs` does not exist — author, don't promote) and E4 (auto-author deletes — recipe exists, automation doesn't) are net-new. E5 is a clean find-replace in `ioiof-extractor.md:85` + the extractor scripts. E3/E6/E7/E8 are partly there. E1 needs ~8 new mock-mode phase fns in `connector-e2e-harness.mjs`.
- **Job 3:** flow is sound; keep it. Top saver = script-output-not-context (in place). Remaining win = keep floor-check + reviewer off raw source bytes.
