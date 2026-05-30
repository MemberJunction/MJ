# Phase 0 / PR 1 — Integration Framework Extension (concrete scope)

Companion to [integration-framework-redesign.md](integration-framework-redesign.md)
(the design) and [integration-pr-roadmap.md](integration-pr-roadmap.md) (the PR
sequence). This doc is **what lands in PR 1** — the deliverables, file by file, method
by method, the open decisions to lock first, and the internal sequencing.

**Goal:** ship a framework that the existing 25 connectors migrate cleanly onto, that
the daily-cadence PRs can build new connectors against without thrashing, and that the
local Agentic plan (separate doc) can wrap as a dynamic Workflow once stable. **No new
connectors in PR 1.** Framework + migration of the 25 only.

**Non-goals:**
- The dynamic Workflow / planner agent — that's Agentic local plan, not PR 1.
- OpenApp-per-category packaging — AN-BC's pre-LTS milestone, separate.
- File-storage composition track (FS-1..5) — separate small PR set after PR 1.
- The Knowledge-Hub/Entity-Documents cross-modal layer — separate concern, not blocking.

---

## 0. Open decisions to lock BEFORE PR 1 starts

| # | Decision | Recommendation | Why |
|---|----------|----------------|-----|
| D1 | Write-column migration | Hard-migrate `WriteAPIPath/WriteMethod/DeleteMethod` to explicit `Create*/Update*/Delete*` (path + method + bodyShape + idLocation). Keep `Write*` as transient deprecated alias for one release; remove in PR 2's bump. | Cleaner end state, no quadratic alias logic in the generic CRUD. Aliases live one release for any external metadata in flight. |
| D2 | `MetadataSource` rollout | Add new column + computed `IsCustom` shim (`= MetadataSource != 'Declared'`) on view layer; migrate all 25 metadata files in PR 1; retire `IsCustom` field in next release. | Shim lets old code keep reading `IsCustom`; cutover happens once metadata is consistent. |
| D3 | Where `EnrichSchemaConstraints` lives | Standalone engine service `@memberjunction/integration-schema-enrich`. | Testable without a connector, reusable by the UI button and by RSU, doesn't fatten the connector base class. |
| D4 | Runtime per-connector `mj sync push` trigger | Programmatic MetadataSync API (in-process). | No CLI shell-out, no env munging, runs inside the connector-creation transaction, structured progress flows out via the existing callback hooks. |

These four are *blocking*. Until they're answered, every other deliverable below
has at least one branch in it.

---

## A. Schema migrations

**A1. `IntegrationObject` — operation columns.**
`ALTER TABLE __mj.IntegrationObject ADD`:
- `CreateAPIPath NVARCHAR(MAX) NULL`
- `CreateMethod NVARCHAR(20) NULL`
- `UpdateAPIPath NVARCHAR(MAX) NULL`
- `UpdateMethod NVARCHAR(20) NULL`
- `DeleteAPIPath NVARCHAR(MAX) NULL` (separate from existing `DeleteMethod`)
- `CreateBodyShape NVARCHAR(50) NULL` (enum: `flat | wrapped | literal`)
- `UpdateBodyShape NVARCHAR(50) NULL`
- `CreateBodyKey NVARCHAR(100) NULL` (used when BodyShape = `wrapped`)
- `UpdateBodyKey NVARCHAR(100) NULL`
- `CreateIDLocation NVARCHAR(20) NULL` (enum: `path | body | n/a`)
- `UpdateIDLocation NVARCHAR(20) NULL`
- Keep `WriteAPIPath`/`WriteMethod` for one release with `sp_addextendedproperty`
  description noting deprecation.
- `IncrementalWatermarkField NVARCHAR(255) NULL` — the vendor cursor/timestamp
  field name when SupportsIncrementalSync=1.

Each new column gets `sp_addextendedproperty MS_Description` so CodeGen picks up
human descriptions on regen.

**A2. `MetadataSource` enum.**
- `ALTER TABLE __mj.IntegrationObject ADD MetadataSource NVARCHAR(20) NOT NULL
  DEFAULT 'Declared' CHECK (MetadataSource IN ('Declared','Discovered','Custom'))`
- Same on `__mj.IntegrationObjectField`.
- View-level computed `IsCustom = CASE WHEN MetadataSource = 'Declared' THEN 0 ELSE 1 END`
  via `vwIntegrationObject` / `vwIntegrationObjectField` rebuild — so old code keeps reading.

**A3. CodeGen run.**
- Single migration file containing A1 + A2 ALTER TABLEs (consolidated per CLAUDE.md rule).
- Run CodeGen → emit `entity_subclasses.ts` regen + GraphQL resolver regen.

**A4. Migration file naming.**
`V<YYYYMMDDHHMM>__v5.X.x__IntegrationFramework_PhaseO.sql` per repo convention.

---

## B. Entity layer + TS interfaces

**B1. Regen `entity_subclasses.ts`** picks up A1/A2 columns automatically.

**B2. Close the interface↔entity gap (smoking gun from source read).**

`BaseIntegrationConnector.ts:50-77` — `ExternalFieldSchema`:
- Add `IsPrimaryKey?: boolean` (currently missing — only `IsUniqueKey` exists,
  and `IntrospectSchema:464` does `IsPrimaryKey: f.IsUniqueKey` which is wrong).
- Add the operation-shape fields exposed by IntegrationObject: at minimum
  `RelatedIntegrationObjectFieldName` already mostly present via `ForeignKeyTarget`,
  but reconcile naming with the entity column.

`SourceFieldInfo` and `SourceObjectInfo` (`types.ts:282-333`) — audit against entity
columns, add any gaps (PrimaryKey, watermark field on object, MetadataSource).

**B3. Fix `IntrospectSchema:464`** — `IsPrimaryKey: f.IsPrimaryKey ?? false` (not
`f.IsUniqueKey`); `PrimaryKeyFields = fields.filter(f => f.IsPrimaryKey)`. Hard
correctness bug.

---

## C. Engine — base classes

**C1. `BaseRESTIntegrationConnector` — generic, metadata-driven CRUD.**

Implement at the base (currently absent — all 20 connectors hand-roll):
```ts
public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult>
public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult>
public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult>
public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null>
```

Each:
1. Looks up the `IntegrationObject` for `ctx.ObjectName` from the engine cache.
2. Reads `CreateAPIPath`+`CreateMethod`+`CreateBodyShape`+`CreateIDLocation` (etc).
3. Returns throw-style error if columns null AND no override → keeps "null capability"
   honest.
4. Resolves auth (`Authenticate` → `BuildHeaders`).
5. Builds URL via existing `GetBaseURL` + path substitution (path-template vars resolve
   the same way as FetchChanges).
6. Body shape:
   - `flat`: `JSON.stringify(ctx.Attributes)`.
   - `wrapped`: `JSON.stringify({ [BodyKey]: ctx.Attributes })`.
   - `literal`: requires connector override — base throws with a clear "override
     CreateRecord for this object" message. (Escape hatch flag.)
7. Calls `MakeHTTPRequest` (existing abstract).
8. Extracts `ExternalID` from response per `IDLocation`.
9. Returns `CRUDResult { Success, ExternalID, StatusCode, ErrorMessage }`.

**Capability getters** read from any-of-object-supports-X, not class-level:
```ts
public get SupportsCreate(): boolean {
  return this.CachedObjects().some(o => o.CreateAPIPath != null && o.CreateMethod != null);
}
```
(or expose them per-object on a new `GetObjectCapabilities(objectName)` helper)

**Concrete connectors** delete their hand-rolled CreateRecord/UpdateRecord/DeleteRecord
unless they actually need the literal override.

**C2. New protocol bases (scaffolds only; populate as connectors need them).**
- `BaseGraphQLIntegrationConnector` — abstract: `Authenticate`, `BuildHeaders`,
  `MakeGraphQLRequest`, `BuildQuery(objectName, vars)`, `BuildMutation(verb, objectName, vars)`,
  `ExtractData`. Generic CRUD over the entity layer reads `Configuration.graphql.{queryName,
  mutations}` for per-object query/mutation names.
- `BaseSOAPIntegrationConnector` — abstract: `Authenticate`, `BuildSOAPEnvelope`,
  `MakeSOAPRequest`, `ExtractSOAPBody`. Generic CRUD reads `Configuration.soap.{actions}`.
- `BaseFileIntegrationConnector` — abstract: `BuildStoragePath`, plus `FetchChanges`
  default implementation that walks a folder tree (FK-graph traversal applies). Bytes
  delegate to the matching `MJStorage` driver via injection. **Separate small PR after
  PR 1** — captures the FS composition track; not blocking PR 1.

All concrete connectors keep `@RegisterClass(BaseIntegrationConnector, '<Name>Connector')`
— registration stays root-level (decided earlier).

---

## D. Engine — services + pipelines

**D0. Discovery & persistence path (FIRST-CLASS deliverable — was buried).**

The runtime "get all tables/fields the user's endpoint exposes and persist as IO/IOF"
path. **Two distinct methods, both on `BaseIntegrationConnector` (already present, need
hardening):**

- `DiscoverObjects(companyIntegration, contextUser)` — abstract; concrete connectors
  list available external objects.
- `DiscoverFields(companyIntegration, objectName, contextUser)` — abstract; per-object
  field metadata.
- `DiscoverAndPersistAuthenticatedSchema(companyIntegration, contextUser, options)` —
  the canonical orchestrator (already partially exists via `IntrospectSchema` →
  `IntegrationSchemaSync.PersistDiscoveredSchema`). Hardened in PR 1:
  - Calls `PreSeedDeclaredMetadata` first (see D8).
  - Calls `IntrospectSchema` (parallel describe).
  - Persists via `IntegrationSchemaSync.PersistDiscoveredSchema` — **upgraded to use
    `TransactionGroup` for bulk IO/IOF saves** instead of per-record `Save()` loops
    (your "BaseEntity.Save() or TransactionGroup to send a bunch of these over"). Order
    of magnitude faster on large schemas (Salesforce ~1,800 sobjects).
  - Sets `MetadataSource = 'Discovered'` on new rows; preserves `'Declared'` on
    existing rows the merge overlays.

Net result: one prominent method invoked at runtime that brings every API-reachable
table/column into IO/IOF with provable metadata only (no hallucinated constraints).
Custom rows (genuinely customer-created — detected via vendor signals like HubSpot's
namespace or SF's `__c` suffix) get `MetadataSource = 'Custom'`. Unsignaled new rows
default to `Discovered` (the safer label per the redesign decision).

**D1. `IntegrationConnectorCreationPipeline` (NEW service).**
The "user creates a Company Integration" pipeline, in process:

```ts
class IntegrationConnectorCreationPipeline {
  async Run(companyIntegrationID: string, options: {
    seedMetadata: boolean,    // run mj sync push on connector folder
    runDiscovery: boolean,    // call DiscoverAndPersistAuthenticatedSchema
    generateActions: boolean, // build DB-driven actions
    runEnrichment: boolean,   // optional EnrichSchemaConstraints
    applyEnrichmentViaRSU: boolean,
  }, contextUser: UserInfo, progress?: OnProgressCallback): Promise<CreationPipelineResult>;
}
```

Steps, each one emitting a structured progress event (see H), and **each emitting a
resumable checkpoint** so a server restart mid-pipeline can resume:
1. **Validate** — credentials present, test connection passes.
2. **Seed declared metadata** — programmatic `MetadataSync.push({ dir: connectorFolder })`
   for that connector only.
3. **Pre-seed in-memory IO/IOF** (calls D8 `PreSeedDeclaredMetadata`): load freshly-
   pushed declared rows into the working set BEFORE step 4.
4. **Discover** — `BaseIntegrationConnector.DiscoverAndPersistAuthenticatedSchema`
   overlays declared, appends Discovered/Custom rows via `IntegrationSchemaSync`
   (batched via TransactionGroup).
5. **PK rule application** (D2) — per IO: declared PK → mark for entity generation;
   no declared PK → IO/IOF row persists, no entity generated (D7).
6. **Entity generation** for IOs with PK → create `__mj.Entity` + `__mj.EntityField`
   records pointing at the integration schema.
7. **Notify** — `OnNotificationCallback` fires `Completed` / `Failed` event.

**No action generation in the pipeline** (per AN-BC). Generic `MJ_Integration_CRUD`
exists at framework level; strongly-typed wrappers are on-demand, not at creation.

**No enrichment step** (D4 deferred). PK-less IOs stay PK-less.

Returns `CreationPipelineResult { Success, IO_Created, IOF_Created, ActionsGenerated,
EnrichmentApplied, Errors }`.

**D2. PK rule — declared → classifier → none.**

Three states:
1. **Declared PK exists** → use it. Generate `__mj.Entity` + `__mj.EntityField`.
2. **No declared PK → call the lightweight Soft PK Classifier** (D4 below).
3. **Classifier confident** → emit as soft PK in `additionalSchemaInfo`; generate entity.
4. **Classifier not confident / no candidate** → no PK. IO/IOF persists; MJ entity NOT
   generated (D7). The object stays "known to exist at the external API, not syncable
   yet." No synthesis.

Writes `pkResolution: { strategy: 'declared'|'classifier'|'none', confidence, nominee }`
into the IO's `Configuration` JSON.

**D4. Soft PK Classifier (NEW lightweight service — built from scratch, NOT DBAutoDoc reuse).**

Standalone package `@memberjunction/integration-pk-classifier`. Narrow scope — PK only,
no FK or description enrichment in Phase 0 (those defer).

```ts
class SoftPKClassifier {
  async Classify(opts: {
    object: MJIntegrationObjectEntity,
    fields: MJIntegrationObjectFieldEntity[],
    sampleRows?: Record<string, unknown>[],   // optional, if pipeline has discovered any
    universalConvention?: string,             // optional agent-side hint, e.g. "id" for HubSpot
  }): Promise<PKClassifierResult>;
}

interface PKClassifierResult {
  Confident: boolean;
  Nominee?: string;                           // field name
  Confidence: number;                         // 0-1
  Strategy: 'universal-convention' | 'naming-heuristic' | 'statistical' | 'llm' | 'none';
  Reason: string;
}
```

Internal cascade (deterministic before LLM):
1. **Universal convention** — if `universalConvention` passed (e.g. HubSpot 'id'), and a
   field with that name exists, return it with high confidence.
2. **Naming heuristic** — single field named `id` / `ID` / `<ObjectName>Id`. Cheap.
3. **Statistical uniqueness** — if sample rows present, check which fields are unique
   across the sample. If exactly one is unique + non-null in all rows, return it.
4. **One-shot LLM** — given field list + sample (if any), ask the LLM "which field is
   the primary key, or none?" with a confidence score. ONE shot, no iteration.
5. **None** — return `Confident: false`.

No DBAutoDoc dependency. No FK detection. No description generation. ~100-200 lines.

The pipeline (D1 step 5) calls this for any IO without a declared PK; `Confident=true`
triggers entity generation, `Confident=false` skips entity generation.

UI button to manually rerun the classifier later (e.g. after vendor adds a PK to docs)
lives in the connector dashboard.

**D7. No-PK rule — gate at metadata creation, NOT at CodeGen (CORRECTED).**

CodeGen stays as-is — its "drop entities without PK" behavior is correct and we don't
touch it. Instead we gate one step earlier: **don't create the `__mj.Entity` +
`__mj.EntityField` records for an IO until it has a PK** (declared or classifier-found
soft PK). The IO/IOF rows themselves persist regardless (they describe external schema
and don't need a local PK), but the MJ-side entity that CodeGen would generate isn't
created until we have a key strategy. So:
- IO+IOF (`__mj.IntegrationObject` / `__mj.IntegrationObjectField`) — created on
  discovery; PK-less IOs are fine here.
- MJ Entity (`__mj.Entity` + `__mj.EntityField`) — only created when the IO has a PK
  (declared or classifier-soft via `EnrichSchemaConstraints`).
- An IO without a PK = "known to exist at the external API, not yet syncable into MJ."
  When PK resolves later (better classifier confidence, or vendor adds it to docs, or
  human enters one), the entity gets generated and CodeGen picks it up on next run.

This is cleaner than modifying CodeGen and matches the principle: don't fabricate
metadata. PK-less external objects are recorded but don't enter the sync layer until
they're keyable. No CodeGen changes; no fake PKs.

**D8. `BaseIntegrationConnector.PreSeedDeclaredMetadata(integrationID, contextUser)` (NEW BASE-CLASS METHOD).**

Per your "populate IO/IOF more before calling DiscoverObjects/DiscoverFields, in
`BaseIntegrationConnector`":
```ts
public async PreSeedDeclaredMetadata(integrationID: string, contextUser: UserInfo): Promise<void>
```
Loads the freshly-pushed declared IO/IOF rows from the DB into the engine's working
cache. Called by the creation pipeline BEFORE `DiscoverAndPersistAuthenticatedSchema`
so the merge logic in `IntegrationSchemaSync` (declared-wins for constraints,
discovered-wins for type/size) has both sides present. Also callable directly by a
connector that wants to pre-seed without running discovery (testing, manual override).

**D3. DB-driven action generation — AN-BC's model.**

NEW: `BuildActionGeneratorConfigFromDB(integrationID, contextUser)` builds an
`ActionGeneratorConfig` by reading `IntegrationObject` / `IntegrationObjectField` rows
(via `IntegrationEngineBase` cache), not from `connector.GetIntegrationObjects()` (TS).

**Generic CRUD action — formalize as canonical.** `integration-action-executor.ts` is
already the dispatcher. Expose it as a first-class action `MJ_Integration_CRUD` with
inputs `{IntegrationName, ObjectName, Verb, Attributes, ExternalID}` — one action covers
*every* integration's CRUD without per-object actions existing.

**Selective strongly-typed wrappers.** New service:
```ts
class StrongTypedActionMaterializer {
  async MaterializeForObject(integrationID: string, objectName: string,
    verbs: ('Get'|'Create'|'Update'|'Delete'|'Search'|'List')[],
    contextUser: UserInfo): Promise<{ActionsCreated: number}>;
}
```
Invoked on-demand (UI button, or agent imports it like MCP tools import). Generates
`{Verb} {ObjectName}` actions only when asked.

**Retire bulk gen** — delete `generate-integration-actions.ts` (the TS-driven script).
**Plan BizApps dedup** — emit a tracking doc listing all `packages/Actions/BizApps/*`
single-record-CRUD actions and which ones the generic layer subsumes. Retirement happens
in subsequent PRs (per AN-BC: "solve this once").

**D4. `EnrichSchemaConstraints` — NEW standalone engine service.**
`@memberjunction/integration-schema-enrich`:
```ts
class IntegrationSchemaEnrichEngine {
  async Enrich(opts: {
    tables: string[],
    generate: ('pk'|'fk'|'descriptions')[],
    apply: 'emit-only' | 'rsu',
    integrationID?: string,
    contextUser: UserInfo,
    progress?: OnProgressCallback,
  }): Promise<EnrichResult>;
}
```

Internal:
- Reuses DBAutoDoc's deterministic `PKDetector` + `FKDetector` (cheap).
- One-shot LLM per table for descriptions (no iterate/converge/prune).
- Emits `additionalSchemaInfo.json` patches via DBAutoDoc's `AdditionalSchemaInfoGenerator`
  and entity-description SQL via `SQLGenerator`.
- If `apply='rsu'`: calls `RuntimeSchemaManager.RunPipeline({ SkipGitCommit: true })` to
  apply in-process (codegen + compile + optional restart).
- If `apply='emit-only'`: writes artifacts to disk for review.

UI affordance: an "Auto-find FKs / descriptions" button in the connector-instance view
that calls this with `{generate: ['fk','descriptions']}`. PK is auto-run during pipeline
step 5 for tables lacking one.

**D5. FK-graph traversal in FetchChanges.**

Replace `BaseRESTIntegrationConnector.FetchWithTemplateVars` single-level loop with a
proper graph topological pass:
- Build dependency graph from IOF `RelatedIntegrationObjectID` edges across all selected
  objects.
- Topologically sort; fetch in dependency order.
- Resolve `{TemplateVar}` from ANY already-fetched ancestor row (not just immediate
  parent) — multi-level nesting works.
- Cycles → error with the offending edge named.
- Bonus: emit a "template-var-requires-parent" signal as FK evidence into the
  EnrichSchemaConstraints feedback loop (D4 can use it as a prior).

**D6. `TransformRecord` per-record hook (per `INTEGRATION-AGENT-TODO.md` §2.4).**

Not speculative — already specified. Optional override-only hook between
`NormalizeResponse` and `ToExternalRecord` on `BaseRESTIntegrationConnector`:
```ts
protected TransformRecord(
  raw: Record<string, unknown>,
  obj: MJIntegrationObjectEntity,
  fields: MJIntegrationObjectFieldEntity[]
): Record<string, unknown> { return raw; }
```
Default identity. Override for nested-field flattening, format conversion, computed
fields, vendor-metadata stripping (Salesforce `attributes`). Wired into both `FetchFlat`
and `FetchWithTemplateVars` — every record passes through `TransformRecord` before
`ToExternalRecord`. Distinct from field-mapping `TransformStep[]` (that's per-field
value at the field-mapping layer); this is per-record shape at the connector layer.

## M. Packaged infrastructure (auth helpers, type translation, MCP safe channels)
Per `INTEGRATION-AGENT-TODO.md` §2.15-2.20 — these are framework-package work, not
agent-side, and they belong in PR 1:

**M1. Auth helpers submodule** (§2.15) — extract reusable auth primitives the protocol
bases + concrete connectors call: OAuth2 client-credentials, OAuth2 auth-code,
OAuth1-HMAC, API-key, Basic, two-step (login-then-token), token-exchange. Lives at
`packages/Integration/engine/src/auth-helpers/` with one file per pattern.

**M2. Type-translation utility** (§2.16) — vendor-type → MJ type mapping that
IOIOFExtractor + MetadataWriter + CodeBuilder all use. Centralizes the current
`IntegrationSchemaSync.MapSourceType` logic + corrects the NVARCHAR-everything
behavior flagged in F (preserve provably-known numeric types).

**M3. `@memberjunction/mcp-mj-metadata` MCP server** (§2.18) — structured channel for
the eventual agent system to read/write IO/IOF with atomic operations + provenance
schemas. Defined now in PR 1 as the package, so consumers (agentic local plan) have a
stable interface. Tools: `read_integration`, `upsert_integration_fields`,
`upsert_integration_object`, `upsert_integration_object_field`, `list_connectors`,
`append_provenance`, `append_code_evidence`. Zod schemas enforce structured input
including provenance shape `{URL, AccessedAt, UsedFor, SourceTier, SourceCategory,
EvidenceStrength, TargetField, Excerpt?}`.

**M4. `@memberjunction/mcp-mj-test-runner` MCP server** (§2.19) — **THE CREDENTIAL SAFE
CHANNEL**. The only place credential file paths are dereferenced; runs in its own
subprocess; reads credentials in a way the agent cannot inspect; returns test results
without the credential bytes entering the conversation. Exposes the 13-tier testing
ladder T0-T12 (see Agentic-local doc §5 for the full ladder). Tier inputs:
`{TierID, ConnectorName, CredentialFilePath?}`. Only T10 (Live API) + T11 (SDK
differential) require credentials; the other 11 tiers run without. This is the
infrastructure that makes "agents physically cannot read credentials" enforceable.

**M5. Connector class templates per base class** (§2.20) — one template file per
`Base*IntegrationConnector` showing the canonical override shape. Used by CodeBuilder
agent and by humans hand-rolling new connectors.

---

## E. Runtime per-connector metadata seeding

**E1. Move integration metadata OUT of main `metadata/`.**

New top-level folder: `metadata-integrations/<connector-name>/` with the same shape
the current `metadata/integrations/` entries have:
- `.integration.json` (root Integration record with IO + IOF children)
- `.credentials.json` (the cred-type used)
- `schemas/<connector>-auth.schema.json` (if a new cred schema)

`metadata-integrations/.mj-sync.json` config at the top to scope the folder.

Per-connector seeding via `MetadataSync.push({ dir: 'metadata-integrations/<connector>' })`
from `IntegrationConnectorCreationPipeline` step 2.

**E2. Backward-compat shim.** Keep `metadata/integrations/` working for the duration of
PR 1's connector migration (the 25 still live there until migrated). Once all 25 are
moved to `metadata-integrations/`, delete the old folder.

**E3. Bulk-build skip.** `mj sync push` at the repo root skips `metadata-integrations/`
unless `--include=metadata-integrations` — so a normal full push doesn't seed every
connector's IO/IOF. (This is the size answer for the "metadata is getting huge"
problem, ahead of the OpenApp packaging milestone.)

---

## F. Structured progress artifacts (FAR better artifacts — user emphasized)

Current state: ad-hoc console logs; `SyncProgress`/`OnProgressCallback` exist in memory
but nothing persists. Sync logs are unreadable; what's running is opaque.

## F. Structured progress, checkpointing, persistence (BEEFED UP — major deliverable)

This is one of the load-bearing pieces of Phase 0 and we treat it accordingly. It's
the difference between "MJ has integrations" and "MJ is *how a platform handles
integrations*." Especially critical for GraphQL connectors where queries are dense and
opaque without structured telemetry.

**F1. New service `@memberjunction/integration-progress-artifacts` — with RESUMABILITY.**

Writes structured per-run progress files to a configurable location (default:
`logs/integration-runs/<runID>/`):
- `manifest.json` — run metadata: ID, started, integration, trigger, expected stages.
- `progress.jsonl` — append-only events: `{ ts, stage, eventType, message, counts,
  level }`. Event types include `stage.start`, `stage.complete`, `stage.error`,
  `records.batch.start`, `records.batch.complete`, `record.error`, `progress.heartbeat`,
  **and crucially `checkpoint`**.
- `result.json` — terminal state: aggregate counts, errors, duration, exit reason.

**Checkpoint events are first-class** — every long-running stage emits
`{eventType:'checkpoint', resumableState: {watermark, lastRecordID, batchIndex,
pageCursor, ...}}` at safe-to-resume boundaries. On MJAPI restart or transient failure,
the sync/creation engine reads the latest checkpoint from `progress.jsonl` for any
in-flight run and **resumes from there, not from scratch**. This addresses your "for
syncs, we need persistence in case of transient or server restart occurrence"
requirement structurally — the JSONL on disk IS the resumability state.

Generic across: integration creation (D1), sync runs (existing loop), RSU pipeline,
table-creation (schema-builder). Each consumer defines its own `resumableState` shape
in the checkpoint event; the engine knows how to interpret based on `stage`.

**F2. Standardized event vocabulary.** Generic types apply across operation kinds:
- `run.start` / `run.complete` / `run.fail` (terminal)
- `stage.start` / `stage.complete` / `stage.error`
- `records.batch.start` / `records.batch.complete` / `record.error`
- `progress.heartbeat` (for long-running stages with no record-level progress)
- `checkpoint` (carries `resumableState`)
- `external.call.start` / `external.call.complete` / `external.call.retry`
  (vendor-API-specific — especially valuable for GraphQL debugging: shows the
  actual query + variables + response timing per call)
- `transform.applied` (when `TransformRecord` reshapes a record)
- `discovery.object.added` / `discovery.field.added` (when D0 finds new IO/IOF)
- `pk.classifier.invoked` / `pk.classifier.result` (D4 telemetry)
- `entity.generated` / `entity.skipped-no-pk` (D7 outcomes)

**F3. GraphQL-specific richness.** For GraphQL connectors, the `external.call.*` events
include the query name, variables, response data shape. This is the difference between
"GraphQL sync failed somewhere" and "the `getContacts(after: $cursor)` mutation at
batch 4 returned 200 records but the schema validation rejected one." Worth the extra
column.

**F4. Resumption engine.** On MJAPI startup, scan `logs/integration-runs/` for runs
whose `result.json` is absent (= in-flight when killed). For each:
1. Read tail of `progress.jsonl` to find the latest `checkpoint` event.
2. Hand the `resumableState` + `runID` back to the originating service (sync engine /
   creation pipeline / RSU).
3. That service resumes from the checkpoint, appending fresh events to the same
   `progress.jsonl` (with a `run.resumed` marker for audit).
4. If the originating service no longer knows how to resume that particular stage,
   mark the run `failed-not-resumable` in `result.json` and surface to UI.

**F5. Frontend integration surface.** Reader API exposes:
- `ListRuns({filter, limit})` — for the dashboard list.
- `GetRun(runID)` — manifest + latest progress snapshot + result if terminal.
- `Tail(runID, sinceEventID)` — for live progress.
- Optional GraphQL subscription `IntegrationRunProgress(runID)` — streaming events
  to the UI for real-time view (especially valuable during the verbose
  connector-creation-pipeline view).

**F6. Migration of existing logging.** Remove ad-hoc `console.log` from sync paths,
`IntegrationEngine`, `IntegrationSchemaSync`, `RuntimeSchemaManager`, etc. Every
significant event goes through the structured emitter. Console output becomes opt-in
human-readable mirror, not the primary record. Old `SyncProgress`/`OnProgressCallback`
machinery wraps onto F1 emitter (back-compat for existing callers).

**F7. Test coverage.** Specifically test: (a) kill a long-running sync mid-stage, restart,
verify resumption from last checkpoint without record duplication; (b) MJAPI restart
during D1 pipeline at each step boundary, verify pipeline resumes; (c) reader API tail
returns coherent stream during concurrent writes.

**F2. Wire into existing callbacks.**
- `OnProgressCallback` (`types.ts:198`) → write `progress.jsonl` events.
- `OnNotificationCallback` → write `result.json` terminal entry.
- `RuntimeSchemaManager.RunPipeline` → emit `manifest.json` + per-step events.
- `IntegrationConnectorCreationPipeline` (D1) emits events natively.

**F3. Reader API.** Small library `IntegrationProgressArtifactReader` for the frontend
to consume: `ListRuns()`, `GetRun(runID)`, `Tail(runID, sinceEventID)`. Generic so any
UI can build a live progress view without knowing about the underlying API.

**F4. Migration of existing logging.** Remove ad-hoc `console.log` from sync paths and
discovery; everything goes through the progress callback → artifacts service. Console
output becomes opt-in human-readable mirror, not the primary record.

---

## G. Explorer / UI affordances

**G1. Integration runs view.** A new view (or extension of existing) reads progress
artifacts (F5) and shows live runs with per-stage breakdowns, current record counts,
errors, checkpoint state. Replaces "stare at the console" with "stare at a structured
timeline." For GraphQL connectors, expose the query/variables/response telemetry from
F3.

**G2. Connector-instance creation flow (the user's expected UX, codified):**
1. **Pick connector** from the connector list.
2. **Credential step** — UI shows ONLY the credential type associated with this
   connector (via `Integration.CredentialTypeID`), not the full credentials list. User
   enters credentials (or picks an existing matching credential).
3. **Test connection** — runs `connector.TestConnection`; failure stops here with the
   error surfaced.
4. **Pipeline runs verbosely** — the creation pipeline (D1) starts immediately. The
   user sees the live structured-progress view (F5) showing each step: seeding declared
   metadata, pre-seed, discovery (with `discovery.object.added` events streaming as
   tables are found), PK classifier per object (`pk.classifier.invoked` /
   `pk.classifier.result`), entity generation (`entity.generated` /
   `entity.skipped-no-pk`).
5. **Dashboard** — pipeline complete → land on the connector dashboard showing: IOs
   discovered, MJ entities generated, IOs with no PK (with re-run-classifier button),
   sync schedule (initially disabled until user opts in).
6. **Configure + sync** — as today: schedules, entity-map config, sync triggers.

User's exact words echoed: pipeline runs verbosely between cred entry and dashboard;
nothing skips; the pipeline IS the setup; structured progress is what the user watches.

**G3. ~~Enrich Schema button~~** — REMOVED (D4 deferred from Phase 0).

**G4. Materialize strongly-typed actions.** Per-object button: "Generate Get/Create/
Update/Delete actions for this object" → D3 selective materializer (MCP-Client-style).
Does NOT generate at connector creation; only on user opt-in here.

**G5. Better artifact returns for users** generally — the wizard/runs view should
surface what was created, what was skipped, what needs follow-up, in a structured
panel rather than a log dump. Tracked here as a scoping requirement; concrete component
work is its own PR after PR 1 if it's heavy.

---

## H. Retire `connector-validator` + plan BizApps dedup

**H1.** Delete `packages/Integration/connector-validator/`. Remove all consumers (none
in production code paths; only the agent skill referenced it).

**H2.** Fold the *invariant concepts* (ProvableOnly, ThreeWayNameMatch, FKCorrectness,
CapabilityMethodMatch, NoUnresolvedEmissions) into:
- `mj sync validate` (for the structural ones — already partially does this).
- The Agentic local plan's locked-primitive library (for ProvableOnly/ThreeWayNameMatch
  which are agent-side checks).

**H3.** BizApps dedup tracking doc: enumerate every single-record-CRUD action in
`packages/Actions/BizApps/{AMS,Accounting,CRM,FormBuilders,LMS,Social}/` and map each
to its generic-CRUD-action equivalent + selective-strongly-typed-wrapper plan.
Retirement of each is its own future PR ("solve this once" per AN-BC, but execution is
incremental).

---

## I. Migrate the 25 existing connectors onto the new framework — IN-SCOPE for Phase 0

**This is not a separable / deferrable phase.** Framework changes + 25-connector
migration land as one unified Phase 0 effort. The migration **is the validation test**
for the framework — until real connectors run on the new code, we can't honestly claim
the framework works.

For each of: Aptify, Betty, Blackbaud, ConstantContact, FileFeed, GrowthZone, HubSpot,
IMIS, MJToMJ, MagnetMail, Mailchimp, NetForum, NetSuite, NimbleAMS, PropFuel,
QuickBooks, Rasa, Reach360, RelationalDB, SageIntacct, Salesforce, SharePoint, Wicket,
WildApricot, YourMembership:

1. Move metadata from `metadata/integrations/.<name>.json` to
   `metadata-integrations/<name>/.integration.json`.
2. Populate the new operation columns (`CreateAPIPath`/`UpdateAPIPath`/etc.) from
   what's currently hardcoded in the connector's TS CreateRecord/UpdateRecord/DeleteRecord
   method bodies.
3. **Delete the hand-rolled CreateRecord/UpdateRecord/DeleteRecord** from the connector
   TS unless it's genuinely idiosyncratic (literal-shape override).
4. Set `MetadataSource = 'Declared'` on all IO/IOF rows.
5. Run `mj sync push --include=metadata-integrations/<name>` and verify zero validate
   errors.
6. Run the new pipeline (D1) against a fresh DB and verify the connector creates,
   discovers, generates the generic CRUD action.
7. **No expansion of coverage** in this PR — just the migration. The expand+test work
   is the daily-cadence PRs that come after.

**HubSpot end-to-end is the gold-standard regression check.** Beyond unit tests, we
run the full creation pipeline (D1) for HubSpot against a fresh scratch DB with real
credentials, verify discovery returns the expected object set, generic CRUD works for
representative verbs on Contacts/Companies/Deals, and the structured progress
artifacts (F) capture the run cleanly. **User (MS-BC) will personally drive the
HubSpot end-to-end test** — Claude executes the framework code + migration, MS-BC
validates the live result. Salesforce stays tested as a secondary regression baseline.

The other 23 stay marked `format-verified-no-creds` until the daily-cadence PRs reach
them — Phase 0 doesn't change their cred status, only their framework alignment.

**Migration as dogfood.** Each connector migrated is an answer to "did we get the
framework right?" If migrating HubSpot exposes a missing column, a broken assumption
in the generic CRUD, or a gap in `TransformRecord` semantics — that's a Phase 0
framework fix, not a future PR. The framework isn't done until the 25 sit on it
cleanly.

---

## J. Tests + CI

**J1. New unit tests** for: PK cascade resolver (D2), generic CRUD path resolution
(C1), FK-graph topological traversal (D5), `BuildActionGeneratorConfigFromDB` (D3),
`EnrichSchemaConstraints` deterministic path (D4 statistical detectors only — LLM
parts mocked).

**J2. Integration test** running `IntegrationConnectorCreationPipeline` (D1)
end-to-end against a scratch DB for HubSpot — the full migration verified once
end-to-end before merging.

**J3. CI gate updates.** The Unit Tests workflow must catch the things our recent
near-misses missed:
- Add an Integration smoke test workflow to PR target list (currently absent — same
  category of slip as the PG-migration parity gap).

**J4. Migration test.** Run the connector-migration script (I) against scratch DB and
assert: all 25 metadata files validate, all 25 IO/IOF persisted, all 25 connectors
instantiate, capability flags match expectation per connector's known support.

---

## K. Internal sequencing within PR 1

Suggested commit order, each commit independently buildable:

1. **Locks** — record D1-D4 decisions in this doc (start point).
2. **Migrations** — A1, A2, A3 (single consolidated migration file).
3. **Entity regen** — B1 (run CodeGen; commit `entity_subclasses.ts` + GraphQL regen).
4. **Interface fixes** — B2, B3 (the IsPrimaryKey bug + interface↔entity audit).
5. **Progress artifacts foundation** — F1, F2 (so subsequent work can already emit
   structured events as it's built).
6. **`EnrichSchemaConstraints` service** — D4 (standalone, testable, no other deps).
7. **PK cascade helper** — D2.
8. **Generic CRUD in REST base** — C1.
9. **FK-graph traversal** — D5.
10. **DB-driven action gen + generic CRUD action exposure** — D3.
11. **Per-connector seeding folder + metadata move** — E1, E2 (+ retain shim).
12. **`IntegrationConnectorCreationPipeline`** — D1 ties everything together.
13. **Connector migration** — I (one connector at a time; HubSpot + Salesforce first as
    the regression baseline).
14. **Retire connector-validator** — H1, H2.
15. **Explorer affordances** — G1-G5 to the extent feasible in PR 1; balance scope.
16. **Tests + CI** — J1-J4.
17. **BizApps dedup tracking doc** — H3 (planning artifact only).

Numbers 1-12 are framework; 13 is migration; 14-17 are cleanup + verification.

**Scope rule: framework + migration ship together.** Per user direction, we do NOT
split Phase 0 — the 25-connector migration is what validates the framework, so they
land as one effort. If the PR diff is large, we manage by atomic commits, not by
deferring the migration. HubSpot end-to-end pass is a hard gate before merge; the
remaining 24 must at minimum compile + pass their unit tests + register cleanly with
the new generic CRUD.

---

## L. Out of PR 1 (deferred but tracked)

- File-storage composition track (FS-1..5) — separate small PR set.
- OpenApp packaging per category — AN-BC's pre-LTS milestone.
- BizApps single-record CRUD retirement — incremental future PRs once the generic
  action is canonical.
- Knowledge-Hub cross-modal layer — separate concern.
- `BaseGraphQLIntegrationConnector` / `BaseSOAPIntegrationConnector` *populated* — the
  scaffolds land in PR 1, real implementations land when the first GraphQL/SOAP
  connector PR demands them (Fonteva/Nimble for SF; ACGI/NetForum Enterprise for SOAP).
