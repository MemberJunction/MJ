# Integration framework changes — findings & edits

Branch: `connectors/integration-v2-unified`. Scope: integration engine + migrations + the
IntegrationDiscoveryResolver only (no codegen / metadata-sync core touched).

---

## A6 — apply `RequireSystemUser` in `IntegrationDiscoveryResolver.ts` — IMPLEMENTED

`RequireSystemUser` was imported at `packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:56`
but never applied. It is a TypeGraphQL field directive (`packages/MJServer/src/directives/RequireSystemUser.ts`)
that throws `AuthorizationError` when `context.userPayload.isSystemUser` is false. `isSystemUser` is set
ONLY when the request authenticates with the **system API key** (`x-mj-api-key`,
`packages/MJServer/src/context.ts:358-368`); regular JWT/Explorer users are NOT system users.

Sibling pattern mirrored: `@RequireSystemUser()` is a **method decorator placed directly under the
`@Query`/`@Mutation` decorator** — confirmed in `RSUResolver.ts:230-233`, `GetDataResolver.ts:114/218`,
`QueryResolver.ts`, `InfoResolver.ts`, `CacheStatsResolver.ts`.

### Decision: gate the privileged infrastructure / schema-mutating / external-write mutations ONLY

There are **no subscriptions** in this resolver. The mutations split into two classes:

1. **Privileged server-side infrastructure / schema-mutating / external-write** — run RSU/CodeGen/
   server-restart, persist Declared/Discovered schema, run SoftPKClassifier, generate actions, or
   write to the external vendor. These match exactly what `RSUResolver`/`GetDataResolver` gate. The
   canonical consumer (the live e2e harness, `gql-live-adapters.mjs:40-50`) drives them as the **system
   user** via `x-mj-api-key`, so gating does NOT break it.
2. **Per-tenant config / CRUD on MJ rows** — `IntegrationUpdateConnection`, `SetSyncConfig`,
   `Deactivate/Reactivate`, `CreateEntityMaps`, `CancelSync`, schedule CRUD, `Update/DeleteEntityMaps`,
   `DeleteConnection`. These mutate MJ entity rows under the **authenticated user + RLS** path
   (`getAuthenticatedUser(ctx)` + RunView). Gating these to system-only would **break the existing
   user-auth+RLS path** for a normal-user admin managing their own connections.

Per the A6 caveat ("if applying it would break the existing user-auth+RLS path, do NOT apply"), I
gated class 1 and left class 2 on the existing user-auth+RLS path. The read-only **queries** (discover
connectors/objects/fields, list, preview, status, history) are also left ungated — they are the
user-facing read surface and rely on RLS via the authenticated user.

Note: there is **no Angular/Explorer UI consumer** of any of these operations (grep across `packages/`
found consumers only in `GraphQLDataProvider/src/graphQLIntegrationClient.ts`, the
`IntegrationDiscoveryScheduledJobDriver` — which calls the engine directly, NOT via GraphQL — and the
test harnesses).

### Edits (11 mutations gated) — each is `@Mutation(...)` → insert `@RequireSystemUser()` → `async Integration...(`

| Mutation | line (approx) | why system-only |
|---|---|---|
| `IntegrationRefreshConnectorSchema` | 1261 | ConnectionTest→Introspect→Persist→PKClassify |
| `IntegrationGenerateAction` | 1346 | generates action metadata |
| `IntegrationCreateConnection` | 2491 | writes credential + runs IntegrationConnectorCreationPipeline |
| `IntegrationPromoteCustomColumns` | 2814 | promotes custom columns (schema mutation) |
| `IntegrationApplySchema` | 3019 | RSU migration→CodeGen→compile→restart |
| `IntegrationApplySchemaBatch` | 3109 | batched RSU |
| `IntegrationApplyAll` | 3181 | full apply: schema + maps + sync |
| `IntegrationApplyAllBatch` | 4781 | multi-connector apply |
| `IntegrationStartSync` | 3747 | kicks off a sync run |
| `IntegrationWriteRecord` | 3894 | writes to the external vendor |
| `IntegrationSchemaEvolution` | 5400 | schema evolution (DDL) |

Before/after (representative — all 11 are identical in shape):

```
BEFORE
    @Mutation(() => ApplyAllOutput)
    async IntegrationApplyAll(

AFTER
    @Mutation(() => ApplyAllOutput)
    @RequireSystemUser()
    async IntegrationApplyAll(
```

NOT gated (left on user-auth+RLS, deliberately): `IntegrationUpdateConnection`, `IntegrationSetSyncConfig`,
`IntegrationDeactivateConnection`, `IntegrationReactivateConnection`, `IntegrationCreateEntityMaps`,
`IntegrationCancelSync`, `IntegrationCreateSchedule`, `IntegrationUpdateSchedule`,
`IntegrationToggleSchedule`, `IntegrationDeleteSchedule`, `IntegrationUpdateEntityMaps`,
`IntegrationDeleteEntityMaps`, `IntegrationDeleteConnection`, and all read-only `@Query` methods.

**Build:** `packages/Integration/engine` builds clean (`tsc && tsc-alias` — no errors). `packages/MJServer`
`tsc --noEmit` produced **no errors** referencing the resolver / directive — the decorator edits compile.

---

## B3 — Integration batch DEFAULT constraints migration — IMPLEMENTED (with a correction to the premise)

File: `migrations/v5/V202606171605__v5.41.x__Integration_Batch_Defaults.sql`.

### Verification result — premise PARTIALLY FALSE (the columns ALREADY have a default)

The B3 task said "verify they're currently NOT NULL with no default before writing." Finding:

- `BatchMaxRequestCount` / `BatchRequestWaitTime` are **`INT NOT NULL`** ✅ (v5.38 baseline
  `B202605291452__v5.38.x__Baseline.sql:3530-3531`).
- But they **already carry a DEFAULT constraint of `((-1))`** — `DF__Integrati__Batch__522FEADD` and
  `DF__Integrati__Batch__53240F16` (`B202605291452...:7825/7827`, identical in the v5.0/v5.34/v5.37
  baselines). The EntityField metadata records also list `((-1))` as the default value.

So the stated failure mode ("a row created without them fails NOT-NULL") is **not true today** — an
insert that omits these columns gets `-1` (the column descriptions read `-1` = "no limit" / "disable
batching"). I still authored the migration per the explicit instruction, changing the defaults to
**200 / 100** as requested.

⚠️ **This is a behavior change, not just a NOT-NULL backstop:** any Integration row inserted WITHOUT
these columns previously got `-1` (no batching) and will now get `200` / `100` (batching ON). Existing
rows are untouched (a DEFAULT only fires on INSERT-with-column-omitted). Flagging this because callers
that relied on the `-1` "disable batching" default will silently start batching.

The migration drops any existing default constraint **by lookup in `sys.default_constraints`** (the
auto-generated `DF__...` name is not stable across installs) before adding the new named constraints
`DF_Integration_BatchMaxRequestCount` (200) / `DF_Integration_BatchRequestWaitTime` (100). No
`sp_addextendedproperty` (columns already exist), `${flyway:defaultSchema}` used, single concern,
timestamp 1605 > the existing `...1600__v5.41.x` migration so it orders after it.

---

## B2 — RSUAuditLog fresh-install gap — FALSE POSITIVE, no migration authored

Checked all three conditions:

- **(a)** `RSUAuditLog` IS referenced in `migrations/v5/CodeGen_Run_2026-06-15_16-32-44.sql` and
  `..._23-02-12.sql` (CodeGen_Run files, not `V`-prefixed → flyway does not apply them). **BUT** those
  references are only `ALTER TABLE [...].[RSUAuditLog] ADD __mj_CreatedAt/__mj_UpdatedAt`, view
  (`vwRSUAuditLogs`), index, sproc, and `__mj.Entity`/`EntityField` metadata inserts — there is **NO
  `CREATE TABLE RSUAuditLog`** anywhere in any migration (CodeGen never creates base tables). ✅/❌ mixed.
- **(b)** No `V`-prefixed (or `B`-baseline) migration creates the table. ✅ (true)
- **(c)** `MJRSUAuditLogEntity` is imported by `ServerBootstrap/src/generated/mj-class-registrations.ts`
  (lines 451, 1525) and is absent from **committed HEAD** `entity_subclasses.ts`. **BUT** both generated
  files are currently **uncommitted working-tree modifications** (`git status` shows both as `M`), and in
  the **working tree they are consistent**: `entity_subclasses.ts` exports `MJRSUAuditLogEntity`
  (`:86801`) and the class-registration imports it from `@memberjunction/core-entities`. In **committed
  HEAD, neither file** references `RSUAuditLog` (both counts = 0 — also consistent). The "mismatch" only
  appears when comparing working-tree class-reg against committed-HEAD entity_subclasses, i.e. mixing
  tree states. In any single consistent state there is no compile break.

### Why it's NOT a fresh-install build break

The `RSUAuditLog` table is **created at runtime by `RuntimeSchemaManager`**, not by any migration.
`writeAuditLog()` (`packages/SchemaEngine/src/RuntimeSchemaManager.ts:1602-1615`) calls
`buildAuditTableDDL()` (`:1674-1706`) → `CreateTableIfNotExistsDDL(...)` and runs it via `ExecuteSQL` at
the end of every RSU pipeline run, **best-effort** (wrapped in try/catch, gated on
`rsuConfig.IsAuditLogEnabled`). It is an RSU-internal operational table (sibling of `RSULock`, created the
same lazy way at `:1648-1671`). The uncommitted `entity_subclasses` + class-registration entries are
generated artifacts from a CodeGen run against a DB that already had the runtime-created table.

Authoring a `V` migration would be (1) redundant with the runtime self-creation, and (2) impossible to do
cleanly within migration conventions — the CodeGen_Run content is views/sprocs/EntityField inserts, which
migrations are explicitly forbidden to contain. **No migration authored.**

---

## A4 — Merkle/partition hash-diff default-ON — INVESTIGATION (no edit)

Gate: `IntegrationEngine.ts:1503` —
`const partitionReconcile = !isKeysetConnector && this.isPartitionReconcileEnabled(entityMap);`
`isPartitionReconcileEnabled` (`:2685-2687`) reads `entityMap.Configuration` JSON
`partitionReconcile === true`. It is **per-entity-map** (not global) and default OFF.

### How to flip it default-ON

Change `isPartitionReconcileEnabled` to default true when the key is unset:
`return this.parseEntityMapConfig(entityMap)?.partitionReconcile !== false;` (so only an explicit
`false` disables). That single getter is the only gate; flipping it makes every NON-keyset, non-watermark
object reconcile via Merkle partitions.

### RISK — significant; do NOT flip globally

1. **Unbounded RAM.** `applyViaPartitionReconcile` (`:2710`, doc `:2695-2708`) buffers the **ENTIRE
   fetched record set** in RAM (`accumulatedMapped`) until a post-loop apply — it does not stream
   batch-by-batch. There is already a hard ceiling (`:59-63`, the `partitionReconcile accumulated …`
   guard at `:1738-1748`) that ABORTS the sync when the set is too large. Default-ON would push every
   medium/large watermark-less object through this RAM path and trip that abort on big rosters — a hard
   regression for objects that sync fine today via streaming per-record content-hash.
2. **Behavior change for EVERY non-keyset sync**, including the watermark path interaction: when on, it
   `initialWatermark = null` (`:1506`) and stores a rollup snapshot on the watermark record instead of a
   timestamp — orthogonal to keyset (hence the `!isKeysetConnector` guard) but it repurposes the
   watermark row.
3. It is **explicitly documented as off-by-default** because "the throughput win is only measurable
   against a live run" and it is "intended for watermark-less small/medium objects... don't enable it on
   a multi-million-row object" (`:2704-2708`).

**Verdict:** if ever made default-ON it MUST be paired with a **per-object opt-OUT** AND a size-based
auto-disable (fall back to streaming above the RAM ceiling rather than aborting). It already has a
per-object opt-in; a blanket default flip is unsafe. Not flipped.

## A5 — cross-layer pipelined concurrency default-ON — INVESTIGATION (no edit)

Default path: strict **layer-barrier** loop (`IntegrationEngine.ts:986+`) — layers run in FK order,
parents-before-children, maps within a layer up to the AIMD cap.

Pipelined path: `runPipelinedDAG` (`:1233-1272`), selected at `:975-984` only when
`getCrossLayerPipelineEnabled(config)` is true. `getCrossLayerPipelineEnabled` (`:1188-1194`) reads
`companyIntegration.Configuration` JSON `crossLayerPipeline === true`, default false.

### How to make pipelined the default

Flip `getCrossLayerPipelineEnabled` to default true (`!== false`). Then `mapDeps =
this.buildMapDependencies(config)` builds the per-map parent set and `runPipelinedDAG` runs; it falls
back to the layer barrier automatically if `buildMapDependencies` returns null (graph unresolvable).

### RISK — FK-ordering correctness is preserved by design, but two real concerns

- **Correctness:** `runPipelinedDAG` gates each child on its **own parents' completion** (`:1248-1250`
  awaits `donePromises` of `mapDeps`), and a parent's row writes are committed + record-count recorded
  before the child begins (doc `:1183-1185`). FK ordering is therefore respected; this is the safer of
  the two flags. It is deadlock-free even at cap=1 (a map awaiting parents does NOT hold a concurrency
  slot — `:1252-1258`).
- **Concern 1 — graph completeness.** Pipelining trusts `buildMapDependencies` (`:1201-1225`), derived
  from the IntegrationObject FK graph. If a real FK dependency is missing from that graph (e.g. an
  association whose FK wasn't discovered), a child could start before a logically-required parent —
  whereas the layer barrier is conservative (whole layer finishes first). So correctness hinges on FK
  metadata being complete.
- **Concern 2 — higher concurrency pressure.** Overlapping branches raises peak in-flight work against
  the shared provider connection and the vendor rate limit earlier than the barrier does. The AIMD
  controller + per-request RateLimiter are the backstops, but the realized peak is higher.

It is off-by-default specifically because "the throughput win is only measurable against a live run"
(`:1186`). Not flipped.

## B4 — existing ApplyAll scope mechanism — INVESTIGATION (mechanism EXISTS; do not add a new one)

**The scope mechanism already exists — it is the `SourceObjects` input array. There is no full-catalog
ApplyAll path; the caller IS the scope.**

- `ApplyAllInput.SourceObjects: SourceObjectInput[]` —
  `IntegrationDiscoveryResolver.ts:99`. `SourceObjectInput` (`:90-94`) =
  `{ SourceObjectID?, SourceObjectName?, Fields?[] }`. The caller passes **only the objects to
  materialize**; an empty/absent `Fields` means "all fields of that object," a populated `Fields` narrows
  to those fields.
- `IntegrationApplyAll` resolves the materialized object set **exclusively** from `input.SourceObjects`
  via `resolveSourceObjectsToNames(input.SourceObjects, sourceSchema, user)` (`:3279`, method
  `:1936-1985`). Objects not in `SourceObjects` are never built; any `SourceObjects` entry that resolves
  to no name is dropped (logged). So materialization is strictly the passed subset.
- Batch form: `ApplyAllBatchInput.Connectors[].SourceObjects` (`ApplyAllBatchConnectorInput`, `:150-157`)
  — same per-object scoping, per connector.
- Companion picker: `IntegrationListSourceObjects` (`:1080`) returns the full source catalog cheaply
  (with `AlreadyPersisted` flags) so a UI/caller can pick the subset to pass into `SourceObjects`.

### How to avoid a full-catalog ApplyAll (using the existing mechanism)

Pass a **narrowed `SourceObjects` array** (only the objects you want) — by `SourceObjectID` (existing
IntegrationObject row) or `SourceObjectName` (new object, server describes+persists it). Optionally set
`Fields` per object to limit columns. Additional knobs already present: `SyncScope` (`'created'` vs
`'all'`, `:104`), `StartSync` (`:102`), `FullSync` (`:103`). **No new flag is needed.**

## F7 — `Metadata.Refresh()` vs stale-sproc `@ResultTable` — INVESTIGATION (no edit)

`Metadata.Refresh()` (`packages/MJCore/src/generic/metadata.ts:67-70`) →
`ProviderBase.Refresh()` (`packages/MJCore/src/generic/providerBase.ts:3663-3671`): sets `_refresh=true`,
calls `Config()` → `GetAllMetadata(provider, hardRefresh=true)` (`:3351-3389`).

`GetAllMetadata` loads the **`MJ_Metadata` dataset** (Entities, EntityFields, EntityFieldValues,
EntityPermissions, EntityRelationships, EntitySettings, OrganicKeys, Applications, …) and rebuilds the
in-memory `AllMetadata` object (with `hardRefresh=true` it bypasses `LocalCacheManager`). It is **purely
an in-memory refresh of MJ's metadata-table rows** — the client's view of entities/fields/etc.

**It is NOT relevant to the F7 stale-sproc / `@ResultTable` problem.** A sproc whose result column list
lags a widened table is a **database stored-procedure DDL** issue — only **CodeGen** regenerates the
sproc DDL to match the new schema. `Metadata.Refresh()` does not regenerate, recompile, or execute any
stored-procedure/view DDL; it only re-reads metadata rows into memory. Refreshing metadata cannot fix a
stale sproc — the sproc must be regenerated (CodeGen), which is out of scope here.
