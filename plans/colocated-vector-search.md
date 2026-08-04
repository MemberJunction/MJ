# Colocated Vector Search — Implementation & Testing Plan

**Branch:** `feature/colocated-vector-search` (cut from `next`)
**Status:** Implemented (Phases 0–3); pgvector unit-tested, integration + SQL Server pending
**Author:** drafted with Claude, 2026-05-29

---

## ✅ Implementation status (2026-05-29)

Decisions taken (per review): adapter interface · sibling table · `ClassKey` inference (no
migration) · fail-loud on incapable DB · **test pgvector only** (SQL Server 2025 written but
untested — awaiting a 2025 instance).

**Built & building green:**

| Area | What landed | Tested |
|---|---|---|
| `ai-vectordb` | `IColocatedVectorHost` + `IsColocatedVectorHost` guard, `ColocatedQuery*` types, `VectorDBBase.{SupportsColocatedQuery, SetColocatedHost, TryWireColocatedHost, ColocatedQuery}` | unit ✅ (30) |
| `postgresql-dataprovider` | implements `IColocatedVectorHost` — `RunColocatedSQL` reuses the active txn/pool; type-only dep on `ai-vectordb` | build ✅, suite ✅ (122) |
| `sqlserver-dataprovider` | implements `IColocatedVectorHost` + `GetSQLServerMajorVersion()` | build ✅ |
| `ai-vectors-pgvector` | `PgVectorColocated` provider (sibling table `id/embedding/metadata/content/tsv`, HNSW+GIN), RRF hybrid, pgvector capability detection; pure SQL builder `pgvectorColocatedSQL` | unit ✅ (26) |
| `ai-vectors-sqlserver` (NEW pkg) | `SQLServerVectorDatabase` (`VECTOR(N)` + `VECTOR_DISTANCE`, DiskANN, version gate); pure builder `sqlserverColocatedSQL` | pure builders unit ✅ (9); **I/O untested** |
| `ai-vector-sync` | wires host into the provider after `CreateInstance`; colocated providers need no API key | build ✅ |
| `search-engine` | `VectorSearchProvider.queryOneIndex` routes colocated indexes through `ColocatedQuery` (hybrid, passes query text as keyword), wiring `this.Provider`; external path untouched | build ✅ |

**Key realizations during build (vs. the original plan):**
- pgvector **already** stores `RecordID` in metadata and `VectorSearchProvider` reads it directly
  — so "skip `MJEntityRecordDocument`" was *already* true for pgvector. The genuine new wins are
  **connection reuse** (one pool / same transaction) and **hybrid pushdown** (old pgvector had
  `SupportsHybridSearch=false`).
- The **sync write path needed no structural change** — `CreateRecords` is generic; the colocated
  provider derives the `content`/`tsvector` keyword corpus from metadata. Only the host-wiring +
  API-key bypass were added.
- No metadata seed file: vector databases are environment-specific runtime config, not lookup
  data. **To enable: create an `MJ: Vector Databases` row with `ClassKey='PgVectorColocated'`**
  (no `DefaultURL`/`CredentialID` needed), then point a `MJ: Vector Indexes` row at it.

**Not done / explicitly deferred:**
- **Live integration tests** (Dockerized Postgres+pgvector): cross-store equivalence vs. external
  pgvector, transactional-consistency test. Scaffolding described in §5; needs a DB.
- **SQL Server 2025**: provider written, builds, pure builders tested — but every I/O path is
  unverified. Hybrid keyword on SQL Server is vector-only for now (full-text `CONTAINS` needs a
  full-text catalog — future). Alert when a 2025 instance is available.
- **Runtime registration of the new `ai-vectors-sqlserver` package**: like other provider
  packages it registers via `@RegisterClass` + the manifest system, but the package must be
  imported by whatever bundle/app loads vector providers. Wire it into the provider bundle / app
  deps when SQL Server colocation is actually deployed.
- **Live relational-column filtering** (JOIN the vector sibling table to the entity view to filter
  on *current* column values, not the embedded metadata snapshot): still a future enhancement —
  v1 filters on the metadata JSONB to keep parity with the external pgvector path.

---

## 1. Problem

MJ's search splits storage across **two databases**: the relational ("normal") DB
(`SQLServerDataProvider` / `PostgreSQLDataProvider`) and a separate **vector DB**
(Pinecone, Qdrant, pgvector). This is correct when the vector store is genuinely
remote — but it's wasteful when the relational DB *itself* can store and query
vectors:

- **Postgres + pgvector** — same instance already holds the rows.
- **SQL Server 2025** — native `VECTOR` type + `VECTOR_DISTANCE()` + ANN indexes.

The key observation: **MJ already runs pgvector, but models it as a foreign
store.** `PgVectorDatabase` opens its *own* `pg.Pool` from a connection string
passed as the `apiKey` constructor arg
(`packages/AI/Vectors/Providers/pgvector/src/config.ts`), with no knowledge that
it might be pointing at the same database MJ is already connected to. So we pay
for colocation's costs (vectors in Postgres) without reaping its benefits.

### What colocation actually buys us

1. **One connection, one transaction.** Embeddings written in the same
   transaction as the row via the existing data-provider pool. No second
   credential, no cross-store drift.
2. **No query-time mapping hop.** Today: embed → `QueryIndex` → get `VectorID` →
   look up `MJEntityRecordDocument` → get `RecordID` → fetch row. Colocated: a
   single SQL statement returns ranked **rows** directly (vector lives next to /
   FK'd to the row).
3. **True hybrid search in one query.** SQL Server 2025 (`VECTOR_DISTANCE` +
   full-text `CONTAINS`) and Postgres (`<=>` + `tsvector`/`pg_trgm` + RRF) can
   fuse **BM25 keyword + vector similarity + relational `WHERE` predicate**
   server-side. `VectorDBBase.HybridQuery()` is currently a stub that falls back
   to vector-only because a foreign store can't see relational predicates. A
   colocated store can.

---

## 2. Design

**Thesis:** This is *not* "add a SQL Server vector provider." It's "teach
`VectorDBBase` that the store can be the same DB — reuse the connection, skip the
mapping hop, push hybrid down to one query." The SQL Server 2025 provider is then
just the second instance of the colocated pattern; pgvector-colocated is the
first.

We keep the `VectorDBBase` abstraction. We add a **colocated flavor** plus
capability flags and a selection mechanism. Nothing in `SearchEngine`,
`EntityVectorSyncer`, or the dupe detector changes structurally — they all talk
to `VectorDBBase` via `ClassKey`.

### 2.1 New capability surface on `VectorDBBase`

`packages/AI/Vectors/Database/src/generic/VectorDBBase.ts`

```ts
/** True when this provider stores vectors inside the application's relational DB
 *  and can resolve results to entity records without an external mapping hop. */
public get SupportsColocatedQuery(): boolean { return false; }

/** Query that returns ranked entity record IDs (and optionally rows) directly,
 *  fusing an optional relational ExtraFilter and an optional keyword string.
 *  Only meaningful when SupportsColocatedQuery === true. */
public ColocatedQuery?(
    params: ColocatedQueryOptions,
    contextUser?: UserInfo
): Promise<ColocatedQueryResult>;
```

`ColocatedQueryOptions` (new, in `query.types.ts`):
- `vector?: number[]` — query embedding (optional if keyword-only)
- `keyword?: string` — for hybrid / BM25
- `entityName: string` + `entityID: string`
- `extraFilter?: string` — a relational predicate pushed into the SQL `WHERE`
- `topK`, `metric`
- `fusion?: 'rrf' | 'vector-only' | 'keyword-only'`

`ColocatedQueryResult`: `{ matches: { recordID: string; score: number }[] }`
(record IDs in MJ `CompositeKey` URL format, matching what
`VectorSearchProvider.extractRecordIDFromCompositeKey` already parses).

`HybridQuery`'s existing contract is unchanged; colocated providers additionally
implement `ColocatedQuery`.

### 2.2 Connection reuse — the central seam

A colocated provider must **not** open its own pool. It receives the active MJ
data provider and reuses it.

- `PostgreSQLDataProvider` already exposes `get DatabaseConnection(): pg.Pool`
  and `ExecuteSQL<T>(...)` — reuse these.
- `SQLServerDataProvider` exposes its connection/pool similarly — reuse for the
  SQL 2025 provider.

**Wiring problem:** `VectorSearchProvider` currently instantiates the vector DB
via `MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase,
vectorDB.ClassKey, apiKey)` — a string `apiKey` is the only ctor input. Colocated
providers need a *provider reference*, not a connection string.

**Approach:** introduce an optional second factory path for colocated providers.
When `MJVectorDatabaseEntity` is flagged colocated (see 2.4), `VectorSearchProvider`
(and `EntityVectorSyncer`, dupe detector) pass the active `IMetadataProvider` /
data provider instance to the colocated provider via a setter
(`SetHostProvider(provider)`) rather than a connection-string ctor. The provider
falls back to `Metadata.Provider` **only** as a last resort (per the
per-provider-code rule in CLAUDE.md — prefer the passed provider).

> Open decision (see §6): provider-instance injection vs. a thin
> `ColocatedConnection` adapter interface that both data providers implement. The
> adapter keeps `ai-vectordb` from depending on the data-provider packages.
> **Leaning toward the adapter** to avoid a dependency-direction inversion
> (`ai-vectordb` should not import `PostgreSQLDataProvider`).

### 2.3 Storage layout

Default to a **sibling table**, not a column on the entity's own table:

- Doesn't touch CodeGen'd entity DDL / sprocs / views.
- Supports multiple embedding models per row (one row per (RecordID, ModelID)).
- Keyed by entity PK so joins back to the source row are a single `JOIN`.

Sibling table (per index), e.g. `${schema}.__mj_vec_<IndexExternalID>`:
| col | type (PG / SQL2025) | note |
|---|---|---|
| `RecordID` | `TEXT` / `NVARCHAR(450)` | CompositeKey URL format |
| `EntityID` | `uuid` / `UNIQUEIDENTIFIER` | |
| `EmbeddingModelID` | `uuid` / `UNIQUEIDENTIFIER` | |
| `Embedding` | `VECTOR(N)` | pgvector / SQL2025 native |
| `Keyword` | `tsvector` / (full-text catalog) | optional, hybrid |

ANN index: HNSW (pgvector) / DiskANN (SQL 2025). Keep the registry-table pattern
pgvector already uses (`_mj_vector_indexes`) for index bookkeeping.

### 2.4 Selection / configuration

Drive external-vs-colocated off existing metadata, no schema change required to
*start*:

- `MJVectorDatabaseEntity.ClassKey` selects the provider as today. Add new keys:
  `'PgVectorColocated'` and `'SQLServerVectorDatabase'`.
- A colocated provider, on init, runs **capability detection** against the host
  DB and throws a clear error (or marks itself unavailable) if the DB can't do
  vectors:
  - Postgres: `SELECT extname FROM pg_extension WHERE extname='vector'` (create
    if permitted).
  - SQL Server: `SELECT SERVERPROPERTY('ProductMajorVersion')` — require ≥ the
    2025 major; **no version detection exists anywhere in the repo today**, so
    this is net-new and must fail gracefully.
- Fallback: if a colocated index is configured but the host DB lacks capability,
  log and fall back to the configured external provider (or surface a config
  error at sync time, not query time).

> Optional later: a `Colocated BIT` / `StorageMode` field on
> `MJVectorDatabaseEntity` via migration, so it's explicit metadata rather than
> inferred from `ClassKey`. Not required for v1.

---

## 3. Implementation phases

Each phase compiles green and has tests before the next starts.

### Phase 0 — Abstraction & types (no behavior change)
- Add `SupportsColocatedQuery`, optional `ColocatedQuery`, and `ColocatedQuery
  Options`/`Result` types to `VectorDBBase` + `query.types.ts`.
- Decide and define the connection-reuse seam (adapter interface — §6).
- Build `@memberjunction/ai-vectordb`. **Unit tests** for the default
  (`SupportsColocatedQuery === false`, `ColocatedQuery` undefined) so existing
  providers are unaffected.

### Phase 1 — pgvector colocated provider (lower risk, testable today)
- New `ClassKey 'PgVectorColocated'` extending `PgVectorDatabase` (or a shared
  base) that, instead of `new Pool(...)`, uses the injected host connection.
- Implement `ColocatedQuery`: single SQL combining `embedding <=> $1` ordering +
  optional `extraFilter` + optional `tsvector`/`pg_trgm` keyword with RRF fusion.
- Capability detection for the `vector` extension.
- `EntityVectorSyncer` write path: when index is colocated, upsert into the
  sibling table within the host connection.

### Phase 2 — SearchEngine integration
- `VectorSearchProvider`: when `vectorDB` is colocated, call `ColocatedQuery`
  and use returned `recordID`s directly — **bypass** the
  `MJEntityRecordDocument` lookup and the metadata→CompositeKey mapping. Keep the
  external path untouched for non-colocated providers.
- Verify dupe detector (`duplicateRecordDetector.ts`) still works (it calls
  `QueryIndex`/`ListVectorIDs`; colocated must still implement those, or the
  dupe path explicitly routes through `ColocatedQuery`).

### Phase 3 — SQL Server 2025 native provider
- New `ClassKey 'SQLServerVectorDatabase'` extending `VectorDBBase`, reusing the
  `SQLServerDataProvider` connection.
- `VECTOR(N)` sibling table, `VECTOR_DISTANCE('cosine', ...)` ordering, DiskANN
  index, full-text `CONTAINS` for hybrid.
- SQL Server major-version detection + graceful unavailability.

### Phase 4 — Migration & docs (only if adding explicit `StorageMode` metadata)
- Single `ALTER TABLE ... ADD` migration in highest `migrations/v*/` (currently
  v5), with `sp_addextendedproperty`. Re-run CodeGen; do **not** hand-edit
  generated output.
- Update `MJEntityRecordDocument` role to "sync ledger, off the read path" in
  docs.

---

## 4. File-level change map

| File | Change |
|---|---|
| `packages/AI/Vectors/Database/src/generic/VectorDBBase.ts` | Add colocated capability flag + optional `ColocatedQuery` |
| `packages/AI/Vectors/Database/src/generic/query.types.ts` | `ColocatedQueryOptions` / `ColocatedQueryResult` |
| `packages/AI/Vectors/Database/src/generic/*` (new) | `ColocatedConnection` adapter interface (§6) |
| `packages/AI/Vectors/Providers/pgvector/src/models/PgVectorColocatedDatabase.ts` (new) | Colocated pgvector provider |
| `packages/AI/Vectors/Providers/SQLServer/` (new package) | SQL Server 2025 native provider |
| `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` | Implement `ColocatedConnection` adapter (expose pool/ExecuteSQL through it) |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | Same adapter + version detection helper |
| `packages/SearchEngine/src/generic/VectorSearchProvider.ts` | Branch to `ColocatedQuery` when colocated; bypass `MJEntityRecordDocument` |
| `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` | Colocated upsert path |
| `metadata/...` (vector DB seed) | New `ClassKey` rows via mj-sync metadata, **not** SQL INSERT |

No changes needed in `EntityVectorSyncer`'s record-streaming/keyset logic, or in
the dupe detector's clustering — those stay provider-agnostic.

---

## 5. Testing strategy

### Unit (Vitest, no DB) — gate every phase
- `VectorDBBase` defaults: colocated off, `ColocatedQuery` undefined; existing
  providers unaffected.
- `ColocatedQueryOptions` → SQL builder: **pure function**, assert generated SQL
  string + params for vector-only, keyword-only, hybrid (RRF), and
  `extraFilter`-present cases. (Functional-core: keep SQL generation pure and
  test it with plain assertions; the provider's `ExecuteSQL` call is the
  imperative shell.)
- Capability detection: mock the host `ExecuteSQL` to return present/absent
  extension and low/high SQL Server version → assert available vs. graceful
  fallback.
- `VectorSearchProvider` colocated branch: mock a colocated `VectorDBBase`
  returning `recordID`s; assert it does **not** call `MJEntityRecordDocument`
  RunView, and that results map to records correctly.
- Mock via `@memberjunction/test-utils` (singleton reset, mock RunView).

### Integration (Dockerized DBs) — full-stack regression suite
- **Postgres + pgvector**: seed N rows, vectorize via `EntityVectorSyncer`, run
  colocated vector / keyword / hybrid queries; assert ranking parity with the
  external pgvector path on the same data (results should match within metric
  tolerance).
- **SQL Server 2025**: same matrix once a 2025 image is available in
  `docker/`. Until then, mark Phase 3 integration tests `xfail`/skipped with a
  logged reason (no silent skips).
- **Cross-store equivalence test**: identical corpus + query against external
  pgvector vs. colocated pgvector vs. (later) SQL 2025 → top-K overlap above a
  threshold. This is the regression guard that colocation didn't change search
  semantics.
- **Transaction test**: row insert + embedding upsert in one transaction; roll
  back → assert neither persisted (proves the single-transaction benefit).

### Manual / verification
- Use the workbench DB (`/docker-workbench`) for a real end-to-end:
  vectorize an entity, run a hybrid search from the UI / a script, eyeball
  results.

---

## 6. Open decisions (need your call before/at implementation)

1. **Connection-reuse mechanism** — *(my lean: adapter interface)*
   - **A. `ColocatedConnection` adapter interface** in `ai-vectordb`, implemented
     by both data providers. Keeps dependency direction clean (`ai-vectordb`
     never imports the data-provider packages). Provider gets the adapter via
     `SetHostConnection()`.
   - **B. Inject the data-provider instance directly.** Simpler, but inverts
     dependency direction or forces a shared base-interface package.

2. **Storage: sibling table (my lean) vs. column on entity table.** Sibling
   avoids CodeGen DDL churn and supports multi-model embeddings; column is one
   fewer join. Recommend sibling for v1.

3. **Selection: infer from `ClassKey` (v1, no migration) vs. explicit
   `StorageMode` metadata field (cleaner, needs migration + CodeGen).** Recommend
   ClassKey for v1, add metadata field later if it earns its keep.

4. **SQL Server 2025 availability** — do we have a 2025 image/license for the
   Docker regression suite yet? If not, Phase 3 ships behind skipped integration
   tests and pgvector-colocated (Phases 1–2) is the deliverable that lands first.

5. **Fallback policy** — colocated configured but DB incapable: fail at **sync
   config time** (loud) vs. **fall back to external** at query time (lenient)?
   Recommend loud at config/sync time.

---

## 7. Risks

- **Dependency direction** — `ai-vectordb` must not depend on data-provider
  packages (decision §6.1 addresses this).
- **SQL Server 2025 newness** — `VECTOR` type and DiskANN are new; perf and index
  semantics may shift. Isolated to Phase 3.
- **Hybrid ranking parity** — RRF fusion must be tested against the external path
  so "hybrid" doesn't silently regress recall vs. today's vector-only.
- **`MJEntityRecordDocument` demotion** — ensure incremental re-embed / staleness
  logic in `EntityVectorSyncer` still uses the ledger even though it's off the
  read path.

---

## 8. Suggested landing order

Phases 0 → 1 → 2 deliver **pgvector colocation** end-to-end (testable on today's
infra) and are independently shippable. Phase 3 (SQL Server 2025) layers on once
a 2025 DB is available. Phase 4 only if we adopt explicit `StorageMode` metadata.
