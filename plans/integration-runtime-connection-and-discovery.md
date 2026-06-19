# Integration Runtime — Connection Setup & Schema Discovery

**Zero-gap implementation reference.** This documents how a connection is created + tested and how
its object/field schema is discovered at runtime, for *both* consumers of the same GraphQL API:
**MJExplorer's Integration application** and any **external system surfacing an MJ instance's object
model over GraphQL**. There is no MJExplorer-only path — the entire lifecycle is GraphQL resolvers in
`packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts`; MJExplorer is just one client.

Every claim below was verified against the code (file:line cited). Status tags:
- **[BUILT]** — implemented + wired.
- **[PARTIAL]** — implemented but incomplete or not wired to a caller.
- **[TO BUILD]** — required by this spec, not present.

---

## Part 1 — Connection setup (Company + CompanyIntegration + credentials, tested safely)

A user creates a Company, then a CompanyIntegration with credentials, then tests the credentials. The
supported sequence is **create-the-instance-then-test** (the test query needs the CompanyIntegration to
exist), and the create mutation can also test inline.

### 1. Create the Company — **[BUILT]** (standard entity, not in the integration resolver)
`CompanyID` is an *input* to connection creation (`CreateConnectionInput.CompanyID`,
`IntegrationDiscoveryResolver.ts:531`); the Company row is created via the normal MJ entity-create
mutation (GraphQLDataProvider), the same in MJExplorer and any GraphQL client. The integration resolver
never creates a Company.

### 2. `IntegrationCreateConnection` (mutation) — **[BUILT]** (`:2433-2537`)
- **Inputs:** `input: CreateConnectionInput` = `{ IntegrationID, CompanyID, CredentialTypeID,
  CredentialName, CredentialValues, ExternalSystemID?, Configuration? }` (`:529-545`), plus scalar args
  `testConnection` (default **false**), `runSchemaRefresh` (default **true**), `universalPKConvention?`.
- **Creates two entities:** (1) an `MJ: Credentials` row — `credential.Values = input.CredentialValues`
  then `Save()` (`:2446-2453`); (2) an `MJ: Company Integrations` row linked via
  `ci.CredentialID = credentialID` (`:2461-2471`).
- **Tests inline only when `testConnection=true`:** `testConnectionForCI(...)` (`:2481`); on failure it
  **rolls back** the created CI + credential (`:2483`).
- **Schema refresh:** with `runSchemaRefresh=true` (default) it runs the full
  `IntegrationConnectorCreationPipeline` via `runSchemaRefreshPipeline` (`:2502`) — see Part 2.
- **Output `CreateConnectionOutput`** (`:551`): `Success, Message, CompanyIntegrationID?, CredentialID?,
  ConnectionTestSuccess?, ConnectionTestMessage?, SchemaRefresh?`. **No secret in the output.**

### 3. `IntegrationTestConnection` (query) — **[BUILT]** (`:1166-1193`)
- **Input:** `companyIntegrationID` only — i.e. the connection must already exist (this is what makes the
  flow *create-then-test*).
- Resolves the connector and runs the auth handshake **server-side**:
  `connector.TestConnection(companyIntegration, user)` (`:1177-1179`).
- **Output `ConnectionTestOutput`** = `{ Success, Message, ServerVersion? }` — **no secret returned.**

### 4. Credential safety — **[BUILT]**, with one **[TO BUILD]** hardening
- **Encrypted at rest.** Credentials live in `MJ: Credentials.Values` with MJ **field-level encryption**
  (`EntityField.Encrypt=true` + `EncryptionKeyID`, declared in `MJCore/src/generic/entityInfo.ts:749-768`).
  Encrypt-on-save / decrypt-on-read run in `GenericDatabaseProvider` via `EncryptionEngine`
  (`EncryptFieldValuesForSave` `GenericDatabaseProvider.ts:771-816`; `PostProcessRows` `:715-732`). The
  secret transits the create mutation once (client→server over TLS), is stored encrypted, tested
  server-side, and is never echoed by the integration resolvers.
- **⚠️ [TO BUILD] hardening:** the *generated* `MJCredential_` GraphQL type exposes `Values` as a
  `@Field()` (`generated.ts:36651-36652`) and the standard entity read path **decrypts it for authorized
  users** — so a plain `MJ: Credentials` query can return the decrypted secret. The integration flow
  itself is safe, but to make credentials *write-only over GraphQL* the `Values` field should be removed
  from the read projection (or permission-gated). Track as a security follow-up.

---

## Part 2 — Schema discovery (once credentials exist)

**Three tiers of structure** (governs WHERE each object/field comes from):
- **Declared** — credential-free build-time metadata (Part of the connector seed; see the build docs).
- **Discovered** — runtime, with credentials: `DiscoverObjects`/`DiscoverFields` against an auth-gated
  describe endpoint, OR data-sampling when there is no such endpoint.
- **Custom** — sync-time: pervasive unmapped keys captured into `__mj_integration_CustomOverflow` and
  promoted post-sync.

### 5. The discover actions
- `IntegrationDiscoverObjects` (query `:991`) — **[PARTIAL]**: binds + calls `connector.DiscoverObjects`
  and returns the **list only**; it does **not** persist.
- `IntegrationDiscoverFields` (query `:1130`) — **[PARTIAL]**: returns the field list from the connector's
  describe; does **not** persist.
- `IntegrationRefreshConnectorSchema` (mutation `:1211`) — **[BUILT]**, **this is the persist action**:
  runs `IntegrationConnectorCreationPipeline.Run(...)`, whose StagePersist
  (`IntegrationConnectorCreationPipeline.ts:332-367`) calls
  `IntegrationSchemaSync.PersistDiscoveredSchema(...)`, upserting `MJ: Integration Objects` /
  `Integration Object Fields`; newly-discovered objects are written `Status='Active'`,
  `MetadataSource='Discovered'` (`IntegrationSchemaSync.ts:415-417`), then the cache is refreshed.

> **Required GraphQL discover-then-read flow** (your spec) — **[PARTIAL → TO BUILD the explicit UX
> contract]**: discovery must be an explicit, on-demand GraphQL action — NOT run on every render.
> `IntegrationRefreshConnectorSchema` already persists; subsequent reads should just list the **active**
> IO/IOF for the integration (a cache/`RunView` read). **MJExplorer flow:** on the entity-maps /
> field-maps page, show a *"Discover objects & fields"* action that calls
> `IntegrationRefreshConnectorSchema`; on success show the active objects/fields; a re-run re-discovers;
> otherwise the page just reads the persisted active rows. The persist exists; the "read active only
> until re-run" contract is the consumer's to honor (and a thin `ListActiveObjects` query is worth adding
> so the client never has to re-discover to render).

### 6. Data-sampling discovery (no describe endpoint) — **[BUILT]** (`BaseIntegrationConnector.ts:530-665`)
- `DiscoverFieldsViaFetch` (`:613`) loops the read path (`FetchChanges`, `WatermarkValue:null`),
  **per-object**, bounded by operator-tunable env vars (`:621-627`):
  `MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS` (default 5 min), `MJ_INTEGRATION_DISCOVERY_BATCH_SIZE`
  (default 500), `MJ_INTEGRATION_DISCOVERY_MAX_RECORDS` (default **5000**).
- **PK guess from statistics** (your "null-heavy ≠ PK" assertion, exactly): a column null on many of the
  sampled rows cannot be the PK; the picker (`pickKeyFromStats` / `pickPrimaryKeyFromStats`) selects the
  smallest provable unique+non-null key, else a SOFT convention-named near-unique single key; `IsUniqueKey`
  only when `!DistinctCapped && DistinctNonNull===Occurrences` (`:567`). Non-PK custom columns are NOT
  minted here — they are caught later by custom-column promotion during full sync.
- **Safe typing** (your rule — never infer numbers/dates from a slice): stream-discovered fields default
  **nullable** (`AllowsNull=true` always, `:580`), sized as **bounded strings with headroom** (≥2×,
  bucketed, key columns capped at 450, `:588-593`); integer/decimal inferences are re-mapped to `nvarchar`
  on persist (`IntegrationSchemaSync.MapSourceType:152-153`).
- **[TO BUILD] PK-only, omit FK-from-stream:** keep discovery a *lightweight PK guess* (it gates entity
  creation), and **omit FK inference from streamed/sampled columns**. The runtime FK inference
  `EnrichSchemaConstraints.InferForeignKeys` (called unconditionally at `IntegrationSchemaSync.ts:198`,
  composite-PK-junction heuristic) should be **removed from the runtime path** — FKs come only from
  Declared metadata, never guessed.

### 7. Deactivate objects/fields not found by any means — **[MUST BUILD — non-negotiable]**
Your spec: objects/columns absent from discovery have their Declared metadata set **inactive** (never
deleted). The code EXISTS — `IntegrationSchemaSync.ts:52` (`DeactivateAbsent?` option) + `:281-297` set
`obj.Status='Disabled'` for active objects not in the discovered set — but it is **dead**: no caller ever
passes `DeactivateAbsent:true` (StagePersist `IntegrationConnectorCreationPipeline.ts:339-345` omits it).
**This MUST be built:**
- (a) Set `DeactivateAbsent:true` on a **comprehensive** discovery refresh (the one that re-discovers the
  *whole* surface — NOT a scoped/partial discovery, which must never deactivate what it simply didn't look
  at). The full-discovery path must thread the flag down through StagePersist.
- (b) Add **field-level** deactivation (today only object-level is implemented).
- (c) Pairs with §8 reactivate-on-rediscover: deactivation is reversible — an object/field that reappears
  on a later discovery flips back to `Active`, so the active set always reflects the live source.
- (d) GraphQL-gated: the comprehensive-vs-partial distinction is a GraphQL input, so a consumer explicitly
  asks for a deactivating refresh.

### 8. Reactivate on reappearance — **[PARTIAL]**
- Custom-column promotion reactivates an inactive IOF instead of duplicating it: `CustomColumnPromoter.ts:317-335`
  "lookup-or-reactivate-or-create" (`if (existing.Status !== 'Active') { reIof.Status='Active'; ... }`). **[BUILT]**
- **[TO BUILD]:** `IntegrationSchemaSync.UpsertObject` (`:344-394`) only updates Description/watermark on an
  existing object — it **never touches Status**, so a previously-`Disabled` object that reappears on
  re-discovery stays disabled. Add object-level (and field-level) **reactivate-on-rediscover**.

### 9. `additionalSchemaInfo.json` — **[BUILT]** (ApplyAll path)
Soft-PK/FK is written by `SchemaBuilder` → `SoftFKConfigEmitter.EmitConfigFile` (`SchemaBuilder.ts:137-145`,
`SoftFKConfigEmitter.ts:182`, path from `RSU_ADDITIONAL_SCHEMA_INFO_PATH`) during ApplyAll, with
`MergeSoftPKs`/`MergeSchemaConfig` so a re-run merges rather than clobbers. (Discovery persists soft-PK onto
the IOF rows; the JSON is emitted at ApplyAll time.)

### 10. Table / column limits — **[TO BUILD]** (ABSENT today)
No `MaxTables` / `MaxColumnsPerTable` ceiling exists (the only caps are the discovery *sample* caps and
`CustomColumnPromoter.MAX_PROMOTIONS_PER_PASS=25`, which bounds columns *added per sync pass*, not totals).
**TO BUILD per spec:**
- Optional `MaxTables` + `MaxColumnsPerTable` config (**default: unbounded**), stored on
  `CompanyIntegration.Configuration`, **GraphQL-settable** (extend `IntegrationSetSyncConfig`).
- Enforced at **ApplyAll/RSU select-time**: if the user selects more active tables than `MaxTables`, or a
  selected table has more active/found columns than `MaxColumnsPerTable`, **reject the RSU run** with a
  clear error (not silently truncate).

### 11. Efficiency — don't read 5000 rows × 100 entities — **[PARTIAL → TO BUILD: tune + GQL-settable]**
- **Only data-sample objects that LACK a describe endpoint.** Objects with a describe endpoint use
  `DiscoverFields` (cheap, no row reads); data-sampling (`DiscoverFieldsViaFetch`) is the fallback only for
  schema-less objects. So a 100-object source where most have describe metadata samples *few* of them.
- For the schema-less ones, the per-object cap + 5-min time budget already bound it — but the **5000-row
  default is large for discovery's purpose** (a PK guess + column corpus needs far fewer). **TO BUILD:**
  lower the discovery default sample (a few hundred rows is statistically sufficient for the null-heavy PK
  test), run objects with bounded concurrency, and make the cap **GraphQL-settable** (today
  `MJ_INTEGRATION_DISCOVERY_MAX_RECORDS`/`BATCH_SIZE` are **env-only**).

### 12. Interruption + dedupe on re-run — **[BUILT]** (dedupe) / **[PARTIAL]** (resume)
- **Dedupe: BUILT.** `PersistDiscoveredSchema` upserts by `(IntegrationID, Name)` for objects and
  `(IntegrationObjectID, Name)` for fields (`IntegrationSchemaSync.ts:342,463`), backstopped by DB UNIQUE
  constraints `UQ_IntegrationObject_Name` / `UQ_IntegrationObjectField_Name`. So an interrupted discovery
  that is re-run **never duplicates** — it re-upserts in place. The create-time double-fire is also
  coalesced (`IntegrationConnectorCreationPipeline.ts:95-144`).
- **Resume: PARTIAL.** Stage checkpoints with `resumableState` are emitted (`:228,317,359,447`) but the
  pipeline always re-runs all four stages — there is no in-pipeline "skip completed stages" consumer. Not
  required for correctness (dedupe covers re-run); a resume consumer is an efficiency follow-up.

### 13. Scheduled discovery — **[MUST BUILD]** (ABSENT today; only sync is schedulable)
`IntegrationCreateSchedule` (`:3789`) creates an `MJ: Scheduled Jobs` row hard-wired to
`DriverClass='IntegrationSyncScheduledJobDriver'` (`:4949`), which only calls `RunSync` — it does **no**
discovery. **Build a NEW, separate scheduled-job type whose ONLY job is to re-discover:**
- A new driver (e.g. `IntegrationDiscoveryScheduledJobDriver`) registered as a distinct `MJ: Scheduled
  Jobs` `DriverClass`, that runs **`IntegrationRefreshConnectorSchema`** (DiscoverObjects/Fields → persist,
  with `DeactivateAbsent` per §7) on a cron — and **nothing else** (it does not sync data).
- **Effect:** it keeps the underlying `MJ: Integration Objects` / `Integration Object Fields` continuously
  in step with the live source — new tables/columns appear as `Active` (Discovered), vanished ones flip to
  `Disabled`, reappeared ones flip back. So the **Entity-Map / Entity-Field-Map picker in the UI simply
  re-reads the active set** and now offers the newly-discovered tables/columns for selection (and stops
  offering the gone ones). Discovery and selection are decoupled: the job evolves the catalog; the user
  later selects from it.
- **GraphQL-exposed (required):** the option to create/manage a *discovery* schedule (vs a *sync* schedule)
  is a GraphQL input — extend `IntegrationCreateSchedule` (a job-kind arg: `sync` | `discovery`) or add a
  dedicated `IntegrationCreateDiscoverySchedule` mutation; list/update/delete via the existing schedule
  resolvers. A consumer must be able to turn scheduled discovery on/off and set its cadence entirely over
  GraphQL.

### 14. GraphQL config settability — **[PARTIAL → TO BUILD: cover everything]**
Your rule: *all* configs controllable via GraphQL, none hardcoded — otherwise the integration resolver
needs work. Current state:
- **GQL-settable** via `IntegrationSetSyncConfig` (`:2625`, read by `IntegrationGetSyncConfig` `:2658`),
  merged into `CompanyIntegration.Configuration`: `SyncConcurrency, MaxConcurrency, RateLimitTokensPerSec,
  RateLimitBurst, CrossLayerPipeline, PartitionReconcile, DiscoveryTimeBudgetMs`; plus per-entity-map
  `Configuration`.
- **NOT GQL-settable (env/hardcoded) — TO BUILD:** discovery `MAX_RECORDS` + `BATCH_SIZE` (env-only),
  `OVERFLOW_SAMPLE_SIZE`, `MAX_PROMOTIONS_PER_PASS`, the pipeline coalesce window, and the new
  `MaxTables`/`MaxColumnsPerTable` (§10) + `DeactivateAbsent` toggle (§7) + discovery-schedule (§13).
  Extend `IntegrationSetSyncConfig` (and the `Configuration` read precedence in the engine) to cover all of
  these so consumers can change them without a code deploy.

---

## TO-BUILD summary (to fully satisfy this spec)
1. **Wire `DeactivateAbsent` — MUST (non-negotiable)** (§7) — set it true on a comprehensive refresh; add field-level deactivation; reversible via §8 reactivate-on-rediscover; GraphQL-gated (comprehensive vs partial).
2. **Reactivate-on-rediscover** for objects/fields in `UpsertObject`/`UpsertField` (§8).
3. **`MaxTables` / `MaxColumnsPerTable`** config (default unbounded), GraphQL-settable, enforced at RSU select-time (§10).
4. **Lower + GraphQL-expose the discovery sample cap**; bounded concurrency; sample only schema-less objects (§11).
5. **New discovery-only scheduled-job type** (§13) — a separate `MJScheduledJob` driver that ONLY re-discovers (RefreshConnectorSchema + DeactivateAbsent), continuously evolving the IO/IOF catalog so the Entity-Map / EFM picker offers the newly-discovered tables/columns; created/managed entirely over GraphQL (job-kind `sync` | `discovery`).
6. **Expose all remaining configs via GraphQL** (§14).
7. **Omit FK-from-stream / remove `InferForeignKeys` from the runtime path** — PK-only lightweight guess (§6).
8. **Harden credential `Values`** to write-only / permission-gated over GraphQL (§4).
9. (Optional) in-pipeline **resume** consumer for interrupted discovery (§12).
10. **Per-record failure handling — dead-letter, never poison-pill the watermark** (sync). Today any errored
    record holds `lastCleanWatermark` at the last clean batch (`IntegrationEngine.ts:1818`, `:1906`) → the
    failed window re-fetches + re-fails every run forever. Fix: classify each per-record `Save()` failure via
    the existing `ClassifyError`/`IsRetryableError`. **Provably transient** (deadlock/timeout/connection) →
    retry inline N times within the batch (bounded backoff). **Exhausted or non-transient** → log it as a
    failed record (transparent, queryable over GraphQL) and **keep going** — do NOT hold the watermark.
    Watermark always advances to max-seen at end; drop the `lastCleanWatermark` clamp. `Status='Failed'`
    still fires on any failed record (50-of-1M ⇒ Failed). Recovery is the operator's call: trigger a full
    sync (`fullSync` ignores the watermark, `:1462`) to re-attempt the dead records.

## Recommendations / deviations from spec (where I think there's a better call)
- **FK inference: agree — remove it.** Runtime FK guessing affects nothing the connector needs and risks
  wrong relationships; FK belongs to Declared metadata only.
- **Discovery sample default:** I'd set it well below 5000 (a few hundred) — the null-heavy PK test is
  statistically sound at small N, and it directly fixes the 100×5000 waste. Keep it GraphQL-tunable.
- **Credential `Values` exposure** is a real (pre-existing) gap worth closing regardless of this feature.

---

## Build-status update (since first draft)

- **§7 DeactivateAbsent — now BUILT.** Threaded resolver→pipeline→`PersistDiscoveredSchema`;
  `IntegrationRefreshConnectorSchema` gained a `deactivateAbsent` arg (default true). Field-level
  deactivation + reactivate-on-rediscover (Disabled→Active when it reappears) are in. **Gated on
  `SourceSchemaInfo.IsAuthoritative`** (connector's `DiscoveryIsAuthoritative` getter, default false):
  a stubbed/cache-driven/scoped discovery never deactivates. The choice is the pure, unit-tested
  `IntegrationSchemaSync.decideAbsentDeactivations` (6 tests). Deactivate-never-delete, reversible.
- **§13 discovery-only scheduled job — still TO-BUILD** (separable, doesn't affect connector-building):
  new `MJScheduledJob` driver that runs only `IntegrationRefreshConnectorSchema` on a cron + a job-kind
  GraphQL arg on `IntegrationCreateSchedule`.

---

## Build batch status (2026-06-13, branch `connectors/integration-v2-unified`)

Built this batch (engine compiles; safefloor test rewritten + green):

- **#10 Per-record dead-letter — BUILT.** Dropped the `lastCleanWatermark` clamp; watermark always advances
  to max-seen. Per-record save failures now run through `WithRetry` with `IsRetryableError` — transient
  (NETWORK_TIMEOUT/RATE_LIMIT/DATABASE_ERROR) retry inline within the batch; permanent/exhausted are
  dead-lettered (counted + logged via `result.Errors` + `sync.record.error`, queryable over GraphQL) and the
  sync moves on. `Status='Failed'` still fires on any error. Both apply paths (transactional
  `applyRecordsIndividually` + opt-in concurrent) covered. `sync.record.retry` added to `SyncLogEvent`.
  `IntegrationEngine.safefloor.test.ts` rewritten to assert advance-on-error + dead-letter (3/3 green).
- **D Omit FK-from-stream — BUILT.** Removed the runtime `EnrichSchemaConstraints.InferForeignKeys` call
  (+ unused import) from `IntegrationSchemaSync.PersistDiscoveredSchema`. FK now comes ONLY from declared
  metadata OR the connector's `DiscoverFields`/`DiscoverObjects`. (Class stays exported for offline use.)
- **C Efficient discovery — BUILT.** `DiscoverFieldsViaFetch` default `MJ_INTEGRATION_DISCOVERY_MAX_RECORDS`
  5000 → 500 (one batch; a column corpus + PK guess, not a full scan). Concurrency was already bounded
  (8-way AIMD honoring `MaxConcurrencyHint`/`Configuration.maxConcurrency`). Sampling is the documented
  fallback used only when the source lacks a describe endpoint. Per-connection overrides wired (see A).
- **B Table/column limits — BUILT (ENV-based, operator guardrail).** `enforceSchemaLimits(objects, filteredSchema)`
  gate added to `buildSchemaForConnector` (the single shared chokepoint for ApplyAll/ApplyAllBatch/ApplySchemaBatch).
  Reads **`MJ_INTEGRATION_MAX_TABLES` / `MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE` from ENV** (absent/≤0 = unbounded);
  REJECTS an over-limit selection with a clear error (never truncates). **Deliberately env-only, NOT
  per-connection `Configuration`/GraphQL** — a table/column cap is a deployment guardrail; a user able to raise
  it via the same API they apply with would render it toothless. Discovery still surfaces every object/field.
- **A All configs GraphQL-settable — BUILT.** `IntegrationSyncConfigInput`/`Output` + `IntegrationSetSyncConfig`
  setter + `readSyncConfig` reader gained `DiscoveryBatchSize`, `DiscoveryMaxRecords`, `DeactivateAbsent`
  (the per-connection TUNING knobs). The §B table/column CAPS are intentionally excluded here (env-only — see B).
  `DiscoverFieldsViaFetch` now reads `discoveryTimeBudgetMs`/
  `discoveryBatchSize`/`discoveryMaxRecords` from `Configuration` (precedence opts > Configuration > env >
  default). `IntegrationRefreshConnectorSchema` honors `Configuration.deactivateAbsent` as its default
  (arg > Configuration > true).

Remaining:

- **E Credential `Values` write-only — DEFERRED to a separate framework PR (CodeGen-core boundary).** The leak
  is real: `PostProcessRows` (`GenericDatabaseProvider.ts:715`) auto-decrypts encrypted fields on every read,
  and the generated `Credentials` GraphQL type exposes `Values`, so `query { Credentials { Values } }` returns
  the plaintext secret. There is **no field-level "write-only / suppress-from-read" flag** in MJ today:
  `IncludeInAPI` is entity-level; `AllowUpdateAPI=0`/`IsVirtual` make a field read-only (the opposite). Making
  `Values` write-only requires EITHER a new field-level flag (e.g. `APIReadSuppress`) honored by a one-line skip
  in `graphql_server_codegen.ts:generateServerField` (CodeGen-core → separate PR per the boundary rule) OR a
  bespoke Credential resolver override (fragile, couples to generated-resolver internals). The **write path is
  already safe** (credentials are set via dedicated mutations `credential.Values=…; Save()` server-side, not the
  generated entity mutation), and decryption for legitimate server-side use is unaffected. Pre-existing exposure,
  independent of the integration work. **Recommended fix:** separate framework PR adding the reusable
  `APIReadSuppress` field flag + migration setting it on `MJ: Credentials.Values`.
- **F Discovery-only scheduled job — IN PROGRESS** (this batch). New `MJScheduledJob` driver running only
  `IntegrationRefreshConnectorSchema` on a cron, via a discovery job-kind on `IntegrationCreateSchedule`.

---

## Part 3 — How an EXTERNAL system consumes this over GraphQL

Everything is the MJ GraphQL API (same resolvers MJExplorer's Integration app uses). The lifecycle an
external consumer drives, in order:

1. **Create the Company** — the standard `CreateCompany` entity mutation (GraphQLDataProvider).
2. **Create the connection + credential** — `IntegrationCreateConnection(input, testConnection, runSchemaRefresh, universalPKConvention)`:
   `input = { IntegrationID, CompanyID, CredentialTypeID, CredentialName, CredentialValues, ExternalSystemID?, Configuration? }`.
   Returns `{ CompanyIntegrationID, CredentialID, ConnectionTestSuccess, ConnectionTestMessage, SchemaRefresh }`.
   The secret is stored **encrypted** and never returned.
3. **Test (anytime)** — `IntegrationTestConnection(companyIntegrationID)` → `{ Success, Message, ServerVersion }`.
   Server-side handshake; the secret never leaves the server.
4. **Discover + persist schema** — `IntegrationRefreshConnectorSchema(companyIntegrationID, universalPKConvention?, deactivateAbsent?=true)`:
   discovers objects/fields, upserts `MJ: Integration Objects`/`Integration Object Fields` (Active/Discovered),
   deactivates absent ones **iff the connector's discovery is authoritative**, reactivates reappeared ones.
   Returns `{ ObjectsCreated, ObjectsUpdated, FieldsCreated, FieldsUpdated, PKVerdicts, UnresolvedObjects }`.
   Run **on demand** (a "Discover objects & fields" action), NOT per render.
5. **List the active set** — `IntegrationListSourceObjects` / `IntegrationDiscoverObjects` (read), or a
   `RunView` over `MJ: Integration Objects` filtered `Status='Active' AND IntegrationID=…` (+ its fields).
   Between refreshes the picker just reads this; it does not re-discover.
6. **Select what to materialize** — `IntegrationCreateEntityMaps(...)` (+ field maps) for the chosen
   tables/columns; `IntegrationListEntityMaps` / `IntegrationSetSyncConfig` to configure.
7. **Apply the schema (RSU)** — `IntegrationApplyAll` / `IntegrationApplySchema` / `IntegrationApplyAllBatch`
   creates the real tables/columns. (Then a server restart exposes new columns; values sync in subsequently.)
8. **Sync** — `IntegrationStartSync(companyIntegrationID, …)` → `{ RunID }`; monitor via `IntegrationGetRun`
   / `IntegrationTailRunEvents`. Watermark/content-hash drive change detection.
9. **Write-back** — `IntegrationWriteRecord(...)` (create/update/delete via the per-operation CRUD columns).
10. **Schedule** — `IntegrationCreateSchedule` / `IntegrationListSchedules` (sync today; a `discovery`
    job-kind is the §13 TO-BUILD).

Identical for MJExplorer and any external GraphQL client — there is no MJExplorer-only path.
