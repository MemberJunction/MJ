# Integration Framework Redesign — Code Changes (Phase 0 + capability expansion)

**Status:** proposal, pre-implementation. This doc is CODE changes only. Agent
architecture is tracked separately (see memory `project_integration_redesign_agent`).

**Guiding principle (the user's, internalized):** *The order and way we gather
information per connector is THE hard problem. Once we have complete, accurate,
gap-free metadata in the right format, writing the connector code is trivial.
Gaps are the real enemy. Every stored constraint must be **provable** from an
authentic source — never assumed, never hallucinated. The one exception is
string sizing: we avoid `NVARCHAR(MAX)` where we can by being generously sized,
but we never invent precision.*

---

## A. The two-branch plan (from the latest `next`)

1. **Branch 1 — `feat/connectors-current-edition`** (boss needs now): gather the
   ~20 connector branches that are NOT in published MJ (growthzone, etc.),
   bring their code + metadata up to the *current* MJ edition, compile/verify
   ALL of them, done. No redesign — just make them correct and building.
2. **Branch 2 — `feat/integration-framework-redesign`** (the real work, **never
   PR'd until ready**): implement everything in this doc, re-research + fix all
   ~27 connectors to the new guidelines, then build more. Agent work lives here
   too but in its own working area we never PR.

---

## B. Schema changes (Integration / IntegrationObject / IntegrationObjectField)

### B1. Write/CRUD model — DEAD COLUMNS + DUPLICATED LOGIC (verified in source)
**What's actually true (not what I first assumed):**
- `WriteAPIPath` / `WriteMethod` / `DeleteMethod` on IntegrationObject have **ZERO
  readers anywhere in the repo** — vestigial metadata.
- `BaseRESTIntegrationConnector` implements **no** write CRUD. All **20 connectors
  hand-roll their own** `CreateRecord`/`UpdateRecord`/`DeleteRecord` in TS.
- Generated actions carry a `Verb`; `integration-action-executor.ts:196` dispatches
  Verb → `connector.CreateRecord(ctx)` (ctx = {ObjectName, Attributes, Relationships}).
  So the executor is already generic; only the connector method bodies are duplicated.

**Decision — make writes metadata-driven in the REST base (the real dedup):**
Give `BaseRESTIntegrationConnector` GENERIC `CreateRecord/UpdateRecord/DeleteRecord`
that read from the IntegrationObject entity:
- `CreateAPIPath`+`CreateMethod`, `UpdateAPIPath`+`UpdateMethod`,
  `DeleteAPIPath`+`DeleteMethod` (replace the conflated `WriteAPIPath/WriteMethod`),
- a `BodyShape` descriptor per operation (`flat` | `wrapped:{key}` | literal) and
  `IDLocation` (`path` | `body`),
- `Configuration.operations` JSON for non-HTTP shapes (GraphQL mutation, SOAP action).
Concrete connectors override CreateRecord/etc. **only** when the API is idiosyncratic
(HubSpot `{properties}`, JSON:API relationships, multi-step writes) — the 80% become
metadata + the generic base; the weird 20% stay overrides. This:
- makes the dead columns live + justifies the per-op expansion,
- DELETES hand-rolled write logic from ~20 connectors (the "avoid duplicate logic" win),
- makes DB-driven action-gen (D) coherent: Verb+Object → generic method → metadata path,
- aligns with null→capability-off: no `CreateAPIPath` ⇒ `SupportsCreate=false`, no action.

### B2. `IsCustom` is a misnomer → replace with provenance enum
`IsCustom bit` can't express the real 3-way distinction the user needs:
- **Declared** — from docs/static, no key needed, authoritative baseline.
- **Discovered** — STANDARD objects only reachable *with* a key (e.g. Salesforce
  `/describe`), not in our static set, NOT customer-custom.
- **Custom** — genuinely customer-created.

**Decision:** add `MetadataSource NVARCHAR(20)` enum `{Declared, Discovered, Custom}`
on both IntegrationObject and IntegrationObjectField. Keep `IsCustom` as a
computed/back-compat shim (`= MetadataSource != 'Declared'`) during migration,
then retire.

**The "can't differentiate Discovered vs Custom" answer:** when a runtime
describe gives no reliable custom signal, default to **`Discovered`** (the less
presumptuous label). Vendor overrides (`IsVendorCustomObject()` — HubSpot
namespace, Salesforce `__c` suffix) promote to `Custom` only on a reliable
signal. The practical treatment is identical for both (minimal constraints,
soft keys), so mislabeling Custom-as-Discovered costs nothing.

### B3. Incremental watermark column — make it explicit
Where is incremental config stored? `SupportsIncrementalSync bit` exists but the
*which column is the watermark* is not first-class. **Decision:** add
`IncrementalWatermarkField NVARCHAR(255)` on IntegrationObject (the vendor
cursor/timestamp field). Provable-only; if the API doesn't clearly expose one,
leave null and `SupportsIncrementalSync=0`.

### B3a. Interfaces don't mirror entities — CONCRETE bug found
The user's complaint ("interfaces don't represent entities") is real and I found
the smoking gun. `ExternalFieldSchema` (BaseIntegrationConnector.ts:50-77) has
`IsUniqueKey` but **NO `IsPrimaryKey`** — yet the entity `IntegrationObjectField`
has BOTH as distinct columns. Consequence: `IntrospectSchema` (line 464) does
`IsPrimaryKey: f.IsUniqueKey` and (line 468) `PrimaryKeyFields = fields.filter(f =>
f.IsUniqueKey)` — it **conflates unique key with primary key**. So discovered PKs
are really "first unique key," which is wrong for tables with multiple unique
columns and no surrogate. **Fix:** add `IsPrimaryKey` to `ExternalFieldSchema` (+
`SourceFieldInfo` already mostly mirrors but inherits the conflation via the map).
Audit all interfaces (`ExternalObjectSchema`, `ExternalFieldSchema`,
`SourceObjectInfo`, `SourceFieldInfo`) against the entity columns and close gaps.

### B4. Constraints policy (provable-only)
- `Type`: default `nvarchar`. Only set a concrete type when docs prove it.
- `Length/Precision/Scale`: **avoid `NVARCHAR(MAX)`** — size generously from
  evidence; only research precision heavily when the type is known. Never invent.
- `AllowsNull`/`IsRequired`/`IsUniqueKey`/`DefaultValue`: only set when provably
  enforced by the external system. Otherwise leave permissive.
- `IsPrimaryKey`/FK refs: hard only if provably documented. Otherwise soft (see E).

---

## C. Code: base-class strategy + new hooks (engine)

### C1. Connector-type base classes (DECIDED with user)
- **Registration stays `@RegisterClass(BaseIntegrationConnector, '<Name>Connector')`
  for every concrete connector** (root-level registration only).
- Add intermediate, **override-not-abstract** bases that provide working defaults
  a connector can override: `BaseRESTIntegrationConnector` (exists),
  `BaseGraphQLIntegrationConnector`, `BaseSOAPIntegrationConnector` (new, as
  needed). They set a cleaner contract per protocol without forcing implementation.
- MCP-wrapper layer: **PARKED** per user — optional, not now, do not design yet.

### C2. Transform hook (REST) — CORRECTED after reading source
**My earlier proposal was wrong/duplicative.** A transform subsystem ALREADY
exists: `transforms.ts` defines `TransformStep[]` (types: direct/regex/split/
combine/lookup/format/coerce/substring/custom + `OnError`), attached to
`DefaultFieldMapping.TransformPipeline` and applied by `FieldMappingEngine` at the
external→MJ **field-mapping** layer. So per-field value transforms are DONE; do not
add them to the connector.
**The only genuine gap** is RECORD-STRUCTURAL reshaping the field pipeline can't
express (flatten nested envelopes, explode one source record into many, merge
sub-resources). IF needed, that's a narrow override-only `ReshapeRecords(raw, ctx)`
hook — distinct from field transforms, justified only by a concrete connector that
needs it. Default: none. Don't build speculatively.

### C3. Populate IO/IOF BEFORE DiscoverObjects/DiscoverFields
User: "we likely need to populate IO/IOF more before calling Discover* and that
should be in BaseIntegrationConnector." **Decision:** `DiscoverAndPersistAuthenticatedSchema`
seeds the declared IO/IOF (from the just-pushed metadata) into the working set
FIRST, then runs Discover* which **overlays** — declared constraints win;
runtime fills only what's missing and appends Discovered/Custom. (IntegrationSchemaSync
already does declared-wins merge; formalize the pre-seed step.)

### C4. Template traversal — generalize beyond single-level parent→child
**Problem found:** current `{TemplateVar}` system only handles ONE level
(parent→child), resolved via `RelatedIntegrationObjectID` or PK-name match. No
multi-level, no graph, no multi-parent.

**Decision:** make FetchChanges traverse the **FK dependency graph**:
- Build a DAG from IOF `RelatedIntegrationObjectID` edges.
- Topologically sort IOs; fetch in dependency order.
- Resolve a `{TemplateVar}` from ANY already-fetched ancestor (grandparent→
  parent→child), not just the immediate parent.
- Trees, chains (linked-list), and DAGs (graphs) all fall out of this.
- **Bonus signal:** a template var that *requires* a parent to build the path is
  itself strong evidence of an FK — feed that back into FK detection.

---

## D. Generated actions — read from DB, run at runtime (DECIDED)
**Problem found:** `generate-integration-actions.ts` reads from TypeScript
(`connector.GetIntegrationObjects()`) at build time → custom/discovered objects
(which only exist in the DB at runtime) never get actions.

**Grounded:** `ActionMetadataGenerator.Generate(config: ActionGeneratorConfig)` is a
PURE function returning metadata (Actions + ActionParams + ActionResultCodes, one
action per verb). It doesn't self-persist. Today its `config` comes from
`connector.GetIntegrationObjects()` (TS). **The change is just swapping the input
source** — build `ActionGeneratorConfig` from DB IO/IOF instead of TS. The generator
is unchanged. `IntegrationSchemaSync` already persists generator output via Save.

**AN-BC's directive (PR #2623 inline, 2026-05-20) — REVISES my original plan.**
He explicitly warns against bulk-generating all CRUD actions up front: N objects ×
6 verbs × M connectors = "quadratic type explosion" in the Action catalog. His model:
- **A GENERIC action layer** — single-record CRUD against ANY entity in ANY
  integration, **routed through the SAME code as the core integration layer** (one
  source of truth per system). This already substantially EXISTS:
  `integration-action-executor.ts` dispatches Verb+Object → `connector.CRUD`. So the
  generic layer is ~built; it just needs to be the canonical, exposed path.
- **A STRONGLY-TYPED layer above** — friendly actions like `Get Contact` that a human
  or agent (Izzy, Betty) invokes — generated **SELECTIVELY / on-demand**, the way
  MCP Client generates actions when a user imports tools. NOT all up front.
- **Eliminate** the many single-record CRUD actions currently shipped under
  `packages/Actions/BizApps/` (AMS/Accounting/CRM/FormBuilders/LMS/Social) — they
  collapse into the generic layer + selective strong-typed wrappers. (Same dedup
  theme as B1.) AN-BC: "Quite important we solve this once."

**Decision (corrected):**
- Make the GENERIC integration-CRUD action the canonical single source of truth
  (formalize the existing executor; expose it as a first-class action).
- Strongly-typed per-object actions are generated **on demand / selectively**, not in
  bulk — built from the **database** IO/IOF (not TS) when a user/agent opts in.
- Drop the TS-driven `generate-integration-actions.ts` bulk build step.
- Plan the BizApps single-record-CRUD retirement once the generic layer is canonical.

## D2. Packaging / shipping (AN-BC review + Robert, pre-LTS)
AN-BC: integrations are a MIX of metadata + code, so they "probably fit the OpenApp
concept." Ship-now plan: keep it all in the build for 5.35; **before the first LTS
release (EOM), strip integrations out into an OpenApp per category** (CRM, AMS, LMS,
…) and ship a new `B` baseline script. Robert + Madhav to nail down. This is the
distribution answer to "metadata is getting huge" (ties to F: per-connector runtime
seeding). Tracked as a roadmap milestone, not part of the framework-extension PR.

---

## E. Lightweight schema enrichment (the "mini-DBAutoDoc")
**Why not DBAutoDoc:** full DBAutoDoc = 4 phases (statistical PK/FK → iterative
LLM table analysis ×2-3 → two-pass LLM pruning → sample queries), ~50-70k tokens
/100 tables, 10-30 min, built for *messy* schemas. External connector schemas are
not messy and we need a fast, narrow tool.

**Decision — new engine method (not a package):**
`EnrichSchemaConstraints({ tables, generate: ('pk'|'fk'|'descriptions')[], apply: 'emit-only'|'rsu' })`
- Reuse DBAutoDoc's deterministic `PKDetector` + `FKDetector` (statistical, cheap).
- Descriptions: ONE-shot LLM per table, **no** iteration/convergence/backprop/pruning.
- Emit `additionalSchemaInfo.json` (soft PK/FK for CodeGen) + entity-description
  SQL via DBAutoDoc's existing `AdditionalSchemaInfoGenerator` + `SQLGenerator`.
- ~50-60% cheaper, ~75% faster than full DBAutoDoc.
- `apply` flag: `emit-only` (just write artifacts) vs `rsu` (hand to RSU →
  codegen + compile + restart in-process; RSU supports `SkipGitCommit`/`SkipRestart`).

**PK cascade (never hallucinate, rarely drop):**
1. Declared PK (docs/static).
2. **Universal/naming-convention PK** — vendor rule ("all HubSpot objects PK=`id`";
   custom/discovered naming conventions). Provable shortcut, skips the LLM pass.
3. Lightweight statistical+LLM soft PK (this method).
4. If none of the above yields a confident candidate → **explicitly no PK** (state
   it; do not invent a synthetic key). FKs/descriptions = soft keys only.

UI: an "auto-find FKs / descriptions" button that runs E over tables missing them
(existing PK/FK is not re-found); PK is always re-found for tables lacking one.

---

## F. Runtime connector-creation flow (the seeding sequence)
Metadata for integrations moves to a **dedicated folder OUTSIDE `metadata/`** so
the bulk `mj sync push` doesn't seed every connector. Per-connector seeding
happens at runtime:

1. User creates a Company Integration (+ creds, test passes).
2. `mj sync push` on **just that connector's** metadata folder → seeds Declared IO/IOF.
3. Run the discovery method (with creds) → overlay declared, append Discovered/
   Custom IO/IOF with minimal/provable constraints + watermark fields.
4. Generate action metadata from DB IO/IOF (section D) → enable per supported CRUD.
5. `mj sync push` again in-process for the action metadata.
6. Optional: `EnrichSchemaConstraints` (section E) → additionalSchemaInfo + SQL →
   RSU picks up (codegen/compile/restart) to materialize soft keys + descriptions.

RSU already supports this (RSUPendingWork, RunPipeline flags, IntegrationDiscoveryResolver wiring) — confirmed.

**Grounded:** `mj sync push` already takes `--dir` + `--include`/`--exclude`
(comma-separated, push.ts:18/33/37) — so step 2/5's scoped per-connector push is a
solved capability (this is literally what I ran during the PR validation:
`--include=integrations`). Open: whether runtime triggers it via the MetadataSync
programmatic API (preferred, in-process) vs shelling the CLI.

**Type-handling reality to revisit (B4 ties in):** `IntegrationSchemaSync.MapSourceType`
(line 46) currently collapses EVERYTHING to `nvarchar` — including known integers and
decimals (comment: "stored as nvarchar in integration schemas"); only bool→bit,
datetime→datetimeoffset survive. That's MORE lossy than the policy we want (avoid
NVARCHAR(MAX) but PRESERVE provably-known numeric types). Decide whether discovered
known-numeric types should be preserved instead of nvarchar'd.

---

## G. connector-validator — retire the package, keep the concepts
The package encodes good *intent* (ProvableOnly, ScriptInspection,
ThreeWayNameMatch, FKMetadataCorrectness, CapabilityMethodMatch, unresolved-
emissions). But packaging it as standalone "phase gates" is over-engineered.
**Decision:** retire `@memberjunction/connector-validator`; fold the invariant
*concepts* into (a) the agent's self-verification rubric and (b) `mj sync validate`
where a check is genuinely metadata-structural. Migrating off it requires updating
any connector/CI references.

---

## H. Logging + artifacts (new requirement)
**Build on what exists, don't reinvent (verified in source):** `types.ts` already
has `SyncProgress`, `SyncProgressSnapshot`, `OnProgressCallback`,
`OnNotificationCallback`, `SyncNotification`, and `IntegrationEngine` keeps a static
progress-snapshot map; `ClassifyError`/`SyncErrorCode`/`ErrorSeverity` already give
structured sync-error classification (the exact "classify e2e failures to fix loci"
mechanism — the testing agent CONSUMES this, doesn't rebuild it). The gap is
PERSISTENCE: these are in-memory callbacks, not durable artifacts.
Add **structured, file-system progress artifacts** layered on the existing callbacks:
- **RSU**: write a structured run-progress file (machine-readable) as it executes,
  separate from ugly console logs — other software / the frontend can read exact state.
- **Syncs**: structured per-sync progress (generic across APIs) so the frontend can
  show live sync progress; track records-synced counts for e2e verification.
- **Table creation**: structured progress too.
- Explorer: fix it up so it runs and returns better artifacts for users (separate todo).

## H2. Testing without credentials
The testing agent must validate as thoroughly as possible WITH OR WITHOUT creds:
- No key → built-in `curl` checks that the API *format* is correct (endpoint
  shapes, auth-header shape, response envelope) even if calls 401.
- Actively hunt for legal vendor sandbox keys / public demo endpoints / any
  sanctioned way to exercise the live API.
- Goal: never "couldn't test, no key" — maximize coverage regardless.

---

## I. Open code questions to resolve at implementation
- B1: keep `WriteAPIPath/WriteMethod` as alias, or hard-migrate to Create*/Update*?
- B2: `MetadataSource` as new column + computed `IsCustom` shim vs hard cutover
  (impacts all ~27 connectors' metadata + any code reading `IsCustom`).
- E: where the new method lives — `BaseIntegrationConnector` instance method vs a
  standalone `@memberjunction/integration-schema-enrich` engine service.
- F: exact dedicated metadata-folder path + how runtime triggers the scoped
  `mj sync push` (programmatic MetadataSync API vs shelling the CLI).
