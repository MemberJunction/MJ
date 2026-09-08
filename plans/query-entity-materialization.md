# MemberJunction — Query & Entity Materialization
### Unified Design & Implementation Plan

> **Status:** Design / decision record (pre-implementation).
> **Purpose:** Capture the architecture, the key decisions, and the *why* behind a materialization capability for MJ, grounded in how MJ actually works (stored Queries, CodeGen, RLS, the scheduler, and the existing query cache), in enough detail to hand to a coding agent for implementation.
> **Relationship to other plans:** Supersedes the standalone `MJQueryMaterializationPlan.md` draft and picks up the "View-Query Bridge" future phase sketched in [`composable-queries-next-steps.md`](composable-queries-next-steps.md).

> ## ⚠️ AMENDMENT (2026-06 — divergence from original scope)
> The original plan scopes materialization to a **performance optimization for hot _local_ stored Queries / entity base views — it does not address External Data Sources at all.** Per leadership direction (AN-BC) and the unified external-data strategy (#2914), we are **elevating External Data Source composition — "mirror external data into MJ on a schedule" — to a first-class, near-term use case**, ahead of the original Phase 2 (local parameterization). This **reuses the existing Phase 1 mechanism** (MJ-managed table + wrapper view + scheduled refresh + atomic swap), not a new subsystem. See **[§1A — External Data Source Composition](#1a-eds-composition)** and the revised **[§16 Phasing](#16-phasing)**. Recorded here as a deliberate divergence from the original design record; the original sections below are preserved as written.

---

## Table of Contents

1. [Executive Overview — Why We're Doing This](#1-executive-overview)
1A. [External Data Source Composition — Amendment](#1a-eds-composition)
2. [Core Architecture](#2-core-architecture)
3. [The Entity Model — How Materialized Results Surface](#3-entity-model)
4. [CodeGen-Driven, Not Runtime](#4-codegen-driven)
5. [Keys](#5-keys)
6. [RLS & Security — Standard Entity RLS on a New Shape](#6-rls-security)
7. [Read Path & Nomenclature (`Live` vs `Materialized`)](#7-read-path)
8. [Selection Contract (metadata)](#8-selection-contract)
9. [Parameterization Model (the crux)](#9-parameterization)
10. [Classification & Verification](#10-classification)
11. [Refresh, Scheduling & Atomic Swap](#11-refresh)
12. [DDL & Index Ownership](#12-ddl-index)
13. [Drift, Mixed-Freshness & Other Correctness Requirements](#13-correctness)
14. [Positioning vs. the Existing Query Cache](#14-vs-cache)
15. [Lifecycle & Governance](#15-governance)
16. [Suggested Phasing](#16-phasing)
17. [Open Questions](#17-open-questions)
18. [Appendix — Key Code References](#18-appendix)

---

## 1. Executive Overview — Why We're Doing This <a id="1-executive-overview"></a>

MJ's data thesis holds for our domain: **association data is small.** Even a large association is a few million constituents and tens of millions of events/transactions — data that fits comfortably in RAM on modest hardware. The "you need a columnar warehouse" argument addresses scale we don't have, so we can do the overwhelming majority of analytics on a normalized relational base (SQL Server / PostgreSQL) and skip the rigid physical dimensional modeling (star/snowflake) and the ETL maintenance burden that comes with it.

On top of that base we lean on three things to keep analytics tractable:

1. **Dynamic, logical denormalization via views** — keep normalized base tables (integrity, single source of truth) but present a denormalized, query-friendly surface.
2. **Composable, reusable stored Queries** used like functions — a curated layer of vetted, performant building blocks the AI assembles from, rather than freelancing raw SQL.
3. **AI analytics (Skip) on top** — metadata-driven query generation that can navigate complexity because MJ already documents what everything is.

**The gap this feature closes:** logical simplicity is not execution efficiency. Deeply nested views can defeat the optimizer (especially on SQL Server), and an LLM will happily emit a pathological query because it never feels the pain. For *proven-hot* analytical paths we want to buy back execution speed — without abandoning the normalized base or reintroducing a full ETL pipeline.

**The principle:** *logical first, physical only when earned.* Materialization is a targeted optimization for hot paths, **not** a default. If it becomes a casual checkbox on everything, we wake up in a year with dozens of snapshots, staggered refresh contention, and the exact star-schema maintenance burden we set out to avoid.

> _**Amended:** this anti-sprawl principle governs **local** materialization. External Data Source mirroring is a separate, legitimately-broad category — materialization is frequently the **only** way to make external data joinable with local data — so it is expected to be comparatively common and is "earned" by construction. See [§1A](#1a-eds-composition)._

**Why build it on stored Queries (not a bespoke new subsystem):** a stored Query already carries the metadata a materialized result needs — LLM analysis of *what the query is*, per-field provenance mapping each output column to its underlying entity/field (`QueryField.SourceEntityID` / `SourceFieldName`), the set of source entities it touches (`QueryEntity`), composition edges (`QueryDependency`), and typed parameters (`QueryParameter`). Reusing that means we don't rebuild drift detection, index hints, or the selection contract from scratch. The stored-Query layer is the de-complexifier.

---

## 1A. External Data Source Composition — Amendment <a id="1a-eds-composition"></a>

> **This section is an amendment** (see the banner at the top). Everything outside this section is the original plan, which targets *local* hot-path optimization and does not mention External Data Sources. We add EDS composition as a first-class use case **without changing the underlying mechanism.**

### Why this is here
EDS (#2449) gives MJ **live, read-only** access to external systems through per-source drivers, but deliberately **cannot join external data with local data — or across two different external sources — at read time** (different engines; per-user RLS can't be enforced remotely). Leadership's stated intent is to *"materialize quite a lot of data that could be a **combination of internal and external**"* (AN-BC), and the unified strategy (#2914) names the canonical use case: *"Mirror a SQL Server into MJ on a schedule = Live-read (EDS) + Materialize (#2770)."* **Materialization is the mechanism that closes EDS's cross-source-join gap.**

### How it works on the existing mechanism (no new subsystem)
A stored Query can already carry `Query.ExternalDataSourceID` (an EDS-backed query), and an entity can be EDS-backed (`Entity.ExternalDataSourceID`). Materializing either one:
1. The refresh job runs the source read **through the EDS path** (the driver's native-query / RunView), pulling remote rows.
2. Persists them into the MJ-managed `materialized_<Name>` table behind the wrapper view — exactly as for a local source.
3. Once materialized, the data is an **ordinary local MJ table**, so a normal Query can join it with internal entities (or with other materialized external sources). The "combination of internal + external" is achieved by **composition, not a new join engine** — this is #2914's "not a new connector" point.

### What this changes vs. the original plan
- **Scope:** external-backed Queries / entity base views become a supported, encouraged materialization source — not just local stored Queries.
- **Philosophy (scoped):** the original anti-sprawl stance (§1) is **retained for *local* materialization**. For **external** sources, materialization is often the only way to make the data joinable, so broad external mirroring is "earned" by construction and expected to be common. Keep the breadth, keep the governance machinery (scheduling, atomic swap, freshness, anti-contention §11.4) that prevents "a lot of mirrored data" from becoming a maintenance burden.
- **Phasing:** EDS composition is promoted **ahead of** the original Phase 2 (local parameterization). See §16.

### Work this implies (beyond Phase-1-as-built)
- Verify/support the refresh driver executing an **external** source read end-to-end (EDS native-query/RunView path → persist), including RLS-downgrade-gate semantics for a source that has no MJ RLS to carry.
- Remote-appropriate refresh scheduling/freshness defaults (likely longer intervals than local; align with EDS's `DefaultCacheTTLSeconds` thinking).
- Document the **"mirror external → join locally"** recipe for Skip / QueryBuilder / Database Research Agent (ties to EDS's join-eligibility metadata: same `ExternalDataSourceID` = joinable; differing/local = not joinable *live*, materialize first).

### Downstream dependency
#2940 (Predictive Studio) gates its **SP5 materialized prediction columns** on this PR (#2770); landing Phase 1 + this composition is what unblocks it.

### Recipe — "mirror external → join locally" (as built)

**When to reach for it.** A live EDS read (`RunView`/`Query` against an external entity/query) is single-source and read-time. Reach for materialization when you need to **join external data with local data** (or across two *different* external sources), or when a specific external read is a proven-hot path. Join-eligibility rule: two objects on the **same** `ExternalDataSourceID` are joinable *live*; anything crossing sources — external↔local, or two different external sources — is **not** joinable live, so **materialize first**, then join the local copies.

**How (no new subsystem):**
1. **External entity base view** — point a `MJ: Materialized Results` row at an EDS-backed entity (`SourceType='EntityBaseView'`, `SourceEntityID` = the external entity whose `ExternalDataSourceID` is set). The refresh driver fetches the remote rows through the EDS `RunView` path and persists them into `materialized_<Name>` behind the wrapper view (`rebuildFromExternalEntity`).
2. **External stored query** — point it at an EDS-backed query (`SourceType='Query'`, the query's `ExternalDataSourceID` set). The refresh runs the (broad, for `RowFilterBroad`) query via the EDS native-query path and persists it, prepending a synthetic surrogate key (`rebuildFromExternalQuery`).
3. Once refreshed, the result is an **ordinary local MJ table/entity** — Skip, QueryBuilder, and the Database Research Agent treat it like any other internal entity and can join it freely. The "combination of internal + external" is achieved by **composition**, not a new join engine.

**Freshness / refresh cadence (the "remote-appropriate defaults" guidance).** Cadence is authored per-materialization via `RefreshSchedule` (a cron; `NULL` = manual only) — there is no auto-interval, so this is a **choosing-the-right-cadence** decision, not a system default:
- External data can't be event-invalidated (it changes on the remote system), so the mirror's cadence **is** your staleness tolerance. Choose it to match how fresh the join needs to be — typically **longer** intervals than a local hot-path materialization.
- Align the thinking with the source's `ExternalDataSource.DefaultCacheTTLSeconds`: if a few minutes of live-read staleness is acceptable there, a comparable (or longer) mirror cadence is usually fine.
- **Stagger** `RefreshSchedule` across external mirrors to avoid refresh-window contention against the same remote source (§11.4).

**Security.** No RLS downgrade occurs for an external **base-view** materialization: it REUSES the source entity (§6.1), so any `ReadRLSFilterID` on that entity is enforced at read time against the materialized wrapper view exactly as against the live view (`DataSource:'Materialized'` only swaps the FROM). The physical mirror holding all rows is correct — RLS filters at READ, like any base table. The mint-time refusal gate is therefore only needed for the **query** case (§6.2, a new differently-shaped entity that loses source RLS), which `processQueryMaterializations` enforces. Still scope external reads with a least-privilege source credential — and note MJ RLS is a local read-time `WHERE`, so it protects the materialized reads even if the *live* EDS read path doesn't apply it.

---

## 2. Core Architecture <a id="2-core-architecture"></a>

### 2.1 Two front doors — and they are genuinely two mechanisms

This plan deliberately departs from the original "one mechanism, two doors" framing. At the *entity* layer they are **two related-but-distinct mechanisms**, and that distinction is what makes RLS and CodeGen fall out cleanly:

- **Materialize an entity's base view** *(the no-sprawl convenience case)* — declared in `additionalSchemaInfo` (`database-metadata-config.json`). The materialized table is a **1:1 copy of the existing entity's shape**, so it **reuses the existing entity**. No new entity is minted. Callers opt in to the snapshot via a read-path flag (§7). Because the shape and columns are identical, the entity's existing **RLS applies directly and unchanged**.

- **Materialize a stored Query** — a flag on a qualifying stored Query. The query's result shape is generally **not** an existing entity, so CodeGen **mints a new, read-only Virtual Entity** for it, linked back to the source Query. RLS is authored **fresh** on that new entity against its result shape (§6).

Both still produce the same *physical* shape underneath — a table wrapped in a view — but they differ in whether they reuse or create an entity. Name this split explicitly so agents/Skip understand both doors.

### 2.2 Physical storage model

- **MJ-managed physical table — NOT native materialized views.**
  - SQL Server indexed views are too restrictive (schemabinding, no outer joins, determinism rules) for arbitrary denormalized/aggregate queries.
  - Postgres matviews are workable but `REFRESH ... CONCURRENTLY` needs a unique index and is slower.
  - MJ runs on **both** engines; a self-managed table gives us **one consistent refresh model across both**. This portability is the deciding factor, and MJ already has the cross-engine SQL-generation abstraction to support it (`CodeGenDatabaseProvider` with `sqlserver`/`postgresql` subclasses).
- **Wrap the physical table in a SQL view** linked back to the source query/entity.
  - The **view is the stable contract**; the **table underneath is swappable storage**. This indirection is what enables the atomic swap in §11 (build a shadow table, repoint the view).
  - Drill-down FKEY links continue to resolve against the stable view name.
  - **Naming convention (grep-able by design):**
    - SQL Server: table `materialized_<Name>`, wrapper view `materialized_vw<Name>` (the secondary view body is simply `SELECT * FROM <schema>.materialized_<Name>`).
    - PostgreSQL: table `materialized_<name>`, wrapper view `materialized_vw_<name>` (matching PG's existing `vw_` base-view convention).

### 2.3 Refresh model (summary; full detail in §11)

- **Scheduled rehydration** via the existing `ScheduledJobEngine`.
- **Atomic swap, never truncate-in-place.** Build into a shadow table, then repoint the wrapper view. Readers never see a half-populated or locked result.
- **v1 = full rebuild.** Simple and fine at association scale.
- **Incremental (later) = MERGE on key.** The metadata supports incremental from day one even though v1 ships full rebuild only.

---

## 3. The Entity Model — How Materialized Results Surface <a id="3-entity-model"></a>

The load-bearing decision: **a materialized query becomes a real MJ entity.** Once it's an entity, it gets `RunView`/`RunViews`, RLS, server-side caching, drill-down, GraphQL, and Explorer browsing **for free** — we are not building a parallel read path.

### 3.1 The generated entity (query-materialization case)

- Flagged `VirtualEntity = true` (existing concept: view-backed, read-only — `AllowCreateAPI`/`AllowUpdateAPI`/`AllowDeleteAPI` all `false`, no CRUD generated).
- `BaseView` points at the wrapper view `materialized_vw<Name>`.
- Requires a single-column primary key (§5).
- Linked back to its source Query (§3.3).

### 3.2 `MJ: Materialized Results` — the auditable metadata edge

Rather than bolting ten columns onto `Query` (and having nothing clean for the base-view case, which has no Query), lift the materialization record into a dedicated entity. This is the "real, enumerable, auditable metadata edge" governance (§15) requires, the work queue the scheduler reads, and the single object that unifies both front doors at the metadata layer:

| Field | Purpose |
|---|---|
| `ID` | PK |
| `SourceType` | `'Query'` \| `'EntityBaseView'` |
| `SourceQueryID` | FK → `Query` (null for base-view case) |
| `SourceEntityID` | FK → `Entity` (the source entity for the base-view case; null for query case) |
| `GeneratedEntityID` | FK → `Entity` (the new Virtual Entity for the query case; null for base-view case, which reuses the source entity) |
| `SchemaName`, `TableName`, `ViewName` | Physical objects |
| `ParamMode` | `'None'` \| `'RowFilterBroad'` \| `'PerValueCache'` \| `'BoundFixed'` (§9) |
| `RefreshStrategy` | `'FullRebuild'` \| `'Incremental'` \| `'DirtyGroupRecompute'` |
| `RefreshSchedule` | cron expression |
| `LastRefreshedAt`, `NextRefreshAt` | freshness surfacing |
| `Watermark` | last-seen `MAX(__mj_UpdatedAt)` for incremental/dirty-group (§11) |
| `Status` | `'Active'` \| `'Stale'` \| `'Building'` \| `'Disabled'` \| `'DriftHold'` (§13) |
| `RowCount`, `ApproxBuildCostMs` | cost/size profile for the selection contract (§8) |
| `IntendedWorkload` | free-text / structured note: what this is good for (§8) |

### 3.3 Linking back to the source Query

- New flags/columns on **`Query`**: `IsMaterialized` (bit), `MaterializedResultID` (FK → `MJ: Materialized Results`), plus the materialization config knobs the author sets pre-CodeGen (refresh cadence, param-binding choices). These are the flags CodeGen scans for (§4).
- The `MJ: Materialized Results` row carries the authoritative state; the `Query` flags are the **author's declared intent** that CodeGen acts on.

### 3.4 Anti-sprawl at the metadata/API surface

Generated materialized entities will otherwise pollute the entity picker, GraphQL schema, and Explorer browse list. Mitigations:
- Put them in a dedicated entity **category** (e.g. *"Materialized"*).
- Default them **out** of normal entity browsing; surface them through the selection contract (§8) and the source Query, not the generic entity list.
- Consider `IncludeInAPI` gating for materializations meant purely for internal reporting.

---

## 4. CodeGen-Driven, Not Runtime <a id="4-codegen-driven"></a>

**Decision: materialization is a dev-side, CodeGen-time activity — never a runtime/app-button action.** This resolves the "who creates the entity metadata?" seam cleanly and keeps materialization on the same disciplined rails as the rest of MJ's schema management.

The runtime SQL-execution facilities (the "RSU" path) are scoped to UDTs and simpler runtime constructs; materialization is heavier dev-side machinery and belongs in CodeGen.

### 4.1 Base-view materialization → `additionalSchemaInfo`

Declared in `database-metadata-config.json` alongside the existing `VirtualEntities` / `Entities` / `ISARelationships` arrays consumed by `ManageMetadataBase`. CodeGen projects the declaration into entity metadata and generates the table + wrapper view + refresh proc. Because the shape is 1:1 with the source entity, no new entity is created — the config attaches a `MJ: Materialized Results` row to the existing entity and CodeGen wires the read-path flag.

### 4.2 Query materialization → a new CodeGen section

Add a CodeGen phase that **scans `Query` rows where `IsMaterialized = 1`** and, for each:

1. Resolves the query's **`FinalSQL`** through the existing `RenderPipeline` (composition → comment-strip → Nunjucks → safety-check). For composed queries, the fully-rendered SQL is what gets materialized (not references to inner materialized tables).
2. Runs **classification & verification** (§10) to confirm the query qualifies and to determine `ParamMode`.
3. Derives the **result shape** from `QueryField` (+ deterministic SELECT analysis) and the **PKEY** (§5).
4. Emits the **DDL** for the table (or detects a migration-provided table and reuses it — §12) and the wrapper view.
5. Registers/updates the **Virtual Entity** metadata (`Entity` + `EntityField` rows) so `RunView` works, and emits the typed entity subclass + Angular form on the normal CodeGen passes.
6. Creates/updates the **`MJ: Materialized Results`** row and the `Query.MaterializedResultID` back-link.
7. Seeds/updates the **scheduled job** (§11).

Everything downstream — strong-typed subclass, base view, GraphQL resolver, Explorer form — is produced by the existing CodeGen generators because the materialized result is now just an entity.

---

## 5. Keys <a id="5-keys"></a>

A non-repeating, single-column key is required — it enables uniqueness enforcement, indexing, drill-down, and (later) incremental MERGE refresh. The rule by query shape:

- **Base-view materialization:** uses the **existing entity PKEY** (1:1 copy). Solved.
- **Aggregations:** the `GROUP BY` tuple *is* a candidate key (each group appears once). **Hash the grouping columns into a deterministic single-column surrogate.** Gives the entity layer the single-column PKEY it expects and makes incremental MERGE trivial.
- **Join / projection with fan-out** (e.g. `Members ⋈ Donations`, many rows per member, no natural single-column key): **hash the full combined key set of the resultset** — i.e. a deterministic hash over the tuple of all contributing source primary keys for that row — into the single-column surrogate. This is the general rule that also subsumes the aggregate case (the `GROUP BY` tuple is just the combined-key set for an aggregated row).

> **Determinism requirement:** the hash must be stable across refreshes and across engines (SQL Server vs PostgreSQL byte/collation differences). Define a canonical serialization of the key tuple (ordered, type-normalized, NULL-sentinel'd) before hashing, and compute the hash in the build SQL the same way on both engines.

### Measure-additivity caveat (drives refresh strategy for aggregates)

- **Additive** measures (`SUM`, `COUNT`) → incremental-friendly.
- **Non-additive** measures (`COUNT(DISTINCT)`, median, percentile, ratios) → **cannot** be delta-adjusted; recompute any group whose source rows changed.
- Therefore aggregates lean toward **full rebuild** or **"recompute dirty groups since watermark,"** not delta math. Don't promise uniform incremental across measure types.

---

## 6. RLS & Security — Standard Entity RLS on a New Shape <a id="6-rls-security"></a>

**This is the section that most changed from the original draft.** The clean model: materialization projects a query result into a physical table that *is its own entity*, so **RLS is just standard MJ entity RLS authored on that entity**, evaluated at read time as an injected `WHERE` clause like any other entity.

### 6.1 Source RLS does **not** carry over (by design)

The new entity has a **new shape**. The RLS rules of the source entity (or entities) **do not map onto it** — there is no general, sound way to project per-row entitlement of `Donations` onto an arbitrary denormalized or aggregated result (you cannot filter a `GROUP BY` row by per-row ownership). So RLS on a materialized-query entity is authored **fresh**, against the result shape, at whatever granularity actually makes sense (often coarser — e.g. role-gated).

The **base-view case is the exception that proves the rule**: it's a 1:1 copy of an existing entity, so that entity's RLS **applies directly and unchanged** (same columns, same injected predicate). No fresh authoring needed.

### 6.2 The one sharp edge: silent RLS downgrade

Because source RLS doesn't carry over, materializing a query over an RLS-protected source entity, *then* leaving the new entity unprotected, is a **privilege-escalation / data-leak vector** — the data didn't leak through a bug, it leaked through the feature working as designed.

**Mitigation — a promotion-time gate (mandatory):**
- At CodeGen materialization time, use `QueryEntity` provenance to enumerate the query's source entities and check whether any carry a read RLS filter (`EntityPermissionInfo.ReadRLSFilterID`).
- If any do, **refuse-or-warn by default**: *"Source entity `Donations` is RLS-protected; the materialized entity `<X>` will NOT inherit it. Author equivalent protection on `<X>` or explicitly confirm this is intentional."*
- This is the §10 asymmetric-risk principle applied to security: the dangerous direction (protected → unprotected) must be **loud**; over-restriction is harmless.
- **As built:** the gate is stricter than "refuse-or-warn" — it is **fail-closed**. `processQueryMaterializations` refuses to materialize a query not only when a source entity carries a read RLS filter, but also when source-entity provenance is missing or unresolvable (so RLS-safety *cannot* be verified). Base-view materializations need no gate — they reuse the source entity and its RLS.
- **Post-review hardening (mint-time gate is not enough on its own):** an adversarial review found the gate was **mint-time-only** — a source that gains a read RLS filter *after* the query was materialized would keep serving the full unscoped snapshot. Three additions close this:
  - **Re-assessment on every CodeGen run (C1).** `detectMaterializationDrift` re-runs the same RLS-safety assessment (`assessQuerySourceRLSSafety`, shared with the mint gate) for every active *query* materialization. If a source has since gained RLS (or lost provenance), the materialization is set to `DriftHold` **and the minted entity's read permissions are revoked** (`CanRead=0` on all its `EntityPermission` rows) — the fail-closed enforcement point, since a precomputed snapshot cannot enforce per-user scoping. Non-destructive (rows are flipped, not deleted) so a human can restore access after authoring protection. Base-view materializations are exempt (they re-apply source RLS at read time).
  - **Permission intersection at mint (C2).** A minted query entity no longer receives broad config-default read permissions. `addMaterializedQueryEntityPermissions` grants read to a role only if that role can read **every** source entity (intersection), read-only always — so a user who cannot read a source can never read its rows through the snapshot. Empty intersection ⇒ no role-based read (fail-closed; a human grants after review).
  - **CodeName-collision guard (C3).** Two query names that normalize to the same `CodeName` (`"Sales Report"` / `"Sales-Report"`) derive the same physical table; minting the second is refused rather than clobbering the first's snapshot with two dueling refreshers.

### 6.3 A desirable property: live entitlement over snapshot data

Because RLS is an injected read-time `WHERE` against the wrapper view, an RLS predicate that subqueries **live** permission tables stays **current even when the materialized data is stale**. Entitlement is evaluated live; only the rows are a snapshot. Document this as intended behavior — it's a feature, not a quirk.

### 6.4 Read-time param filtering composes with RLS via one mechanism

Bucket-1 "materialize broad, filter at read" (§9) and RLS are the **same machinery** — both are read-time `WHERE` injection against the wrapper view. They share the same prerequisite: **any column a predicate needs must be physically present in the materialized table.** Unify the "required columns present" check across both.

> **As built (Phase 2 not shipped):** the provider does **not** yet auto-inject the row-filter predicate the way it auto-applies RLS — the read-time filter is currently caller-supplied via `ExtraFilter`. To prevent a caller reading the *unfiltered* broad set, Bucket-1 (`RowFilterBroad`) materialization is **gated off by default** behind an `allowRowFilterBroad` flag (mirroring `allowPerValueCache`); a parameterized row-filter query stays live-only until Phase 2 finalizes the auto-injection.

---

## 7. Read Path & Nomenclature (`Live` vs `Materialized`) <a id="7-read-path"></a>

- **Query-materialization case:** the caller **picks the door by picking the entity.** Querying the materialized entity *is* choosing the snapshot — explicit by construction, satisfying the "no silent routing to stale data" principle.
- **Base-view-materialization case:** source and snapshot are the **same entity**, so add an explicit opt-in on the read call.

**Decision — read-path parameter:** add to `RunViewParams` / `RunViewsParams`:

```ts
/** Choose live source-of-truth vs the materialized snapshot (base-view materialization only). Default 'Live'. */
DataSource?: 'Live' | 'Materialized';
```

When `DataSource = 'Materialized'`, `GenericDatabaseProvider` routes the read to the secondary wrapper view `materialized_vw<Name>` (body: `SELECT * FROM <schema>.materialized_<Name>`) instead of the entity's live base view. RLS, paging, and caching all apply identically because it's the same entity/shape. This is an explicit caller choice (not silent), so it honors §4 of the original design philosophy.

> The `Live | Materialized` enum (over a bare boolean) leaves room for future modes without a breaking signature change.

---

## 8. Selection Contract (metadata) <a id="8-selection-contract"></a>

Making materialized results separate/explicit trades *silent staleness* for *selection burden* — now two-or-more entities (or two doors on one entity) represent "the same thing" and the caller must pick well. The `MJ: Materialized Results` metadata (§3.2) **is** the selection contract, machine-readable so Skip can auto-select and humans get a clear signpost:

- **Provenance** — `SourceType` + `SourceQueryID`/`SourceEntityID`, and (from existing `QueryField` analysis) which underlying entities/fields each column maps to.
- **Intended workload** — `IntendedWorkload`: what this materialization is good for.
- **Freshness** — `LastRefreshedAt` + expected staleness (`RefreshSchedule`).
- **Cost/size profile** — `RowCount` / `ApproxBuildCostMs`, so an agent can reason "this aggregates 10M rows, daily freshness is acceptable → use the materialized variant."

Selection burden remains, but it's *informed* rather than a guess.

---

## 9. Parameterization Model (the crux) <a id="9-parameterization"></a>

Parameters are Nunjucks template variables; stored queries are full Nunjucks templates, so the query text itself can be arbitrarily dynamic. A materialized result is a single fixed physical table, but a parameterized query is a *family* of queries. We do **not** try to materialize arbitrary complexity.

### Qualifying rule

A query qualifies for materialization iff **(a) it has no params** (`UsesTemplate = 0` / no `QueryParameter` rows), OR **(b) its params fall into a restricted, classifiable set** (below).

### Three param buckets

**Bucket 1 — Row-filter on an output column** *(the common, elegant case → `ParamMode = 'RowFilterBroad'`)*
- The param only narrows rows on a column present in the resultset.
- **Strategy:** materialize the *broad* form (widest superset, no param filter) once; apply the param as a **read-time predicate** against the materialized table — the same injection mechanism as RLS (§6.4).
  - e.g. `donations WHERE chapter = {{chapterId}}` → materialize all chapters, filter by `chapterId` on read.
- **Required check:** the filter column must actually be *in* the output. If the param filters on a projected-away column, either auto-include that column in the materialization or disqualify the query.
- **As built:** the classifier, broad-render, and persistence (`RowFilterColumns`/`BroadSQL`) are implemented, but Bucket 1 is **gated off by default** (`allowRowFilterBroad=false`) pending the Phase-2 read-time predicate auto-injection (§6.4) — parameterized row-filter queries currently refuse and stay live-only.

**Bucket 2 — Bounded structural variant** *(`ParamMode = 'PerValueCache'`)*
- Param changes query *structure* (different `GROUP BY` granularity, columns/joins) over a **small, enumerable domain** (e.g. `reportType ∈ {5 values}`).
- **Strategy options:** a small **per-value materialized cache** (hard-capped), or recompute live.
- **Guards:** hard cap on per-value materializations; **runtime guard** — if an unseen param value arrives, recompute live rather than assume the enumerated domain was complete. Over-optimistic domain extraction degrades to *slow but correct*, never *wrong*.
- *(Open decision — see §17: support per-value cache in v1, or defer and treat all structural params as recompute.)*

**Bucket 3 — Unbounded / arbitrary structural**
- Arbitrary Nunjucks generating genuinely different SQL.
- **Strategy:** not materializable. Disable with a clear reason, OR let the author **bind params to fixed values** and materialize that specific instance (`ParamMode = 'BoundFixed'`, which becomes an unparameterized query).

---

## 10. Classification & Verification <a id="10-classification"></a>

**Pattern: LLM proposes the hypothesis; deterministic analysis proves it; iterate until solid.** This runs at CodeGen materialization time (§4.2, step 2).

- **LLM = fast proposer.** Reuse the existing query-analysis capability (the `query-extraction` pipeline / `SQL Query Parameter Extraction` system prompt) to classify each param's role (bucket, column, candidate domain). The LLM handles the messy template reasoning.
- **Deterministic render-and-diff = the proof / oracle.** Nunjucks templates are fully renderable and `RenderPipeline` already emits a deterministic `FinalSQL` (with a per-pass `Trace`), so we have ground truth:
  - Render the query with 2–3 distinct param values.
  - Diff the resulting SQL (parse to ASTs to be robust to whitespace; the AST/dialect tooling already exists — see `plans/ast-dialect-adapter.md`).
  - **Pure row-filter is *confirmed* iff** the only difference is a substituted literal at a `WHERE`/`AND` position on column X — SELECT list, joins, `GROUP BY` all byte-identical. If anything structural shifts, it is **not** a pure filter, regardless of what the LLM said.
- **Domain extraction (Bucket 2):** LLM-proposed domain is **advisory only** — enforce the hard cap + runtime guard from §9.

### Bias to refuse under uncertainty (asymmetric risk)

- **Structural mistaken for row-filter → dangerous.** Materialize-broad-then-filter would silently return wrong or over-scoped results.
- **Row-filter mistaken for structural → harmless.** Just a missed optimization.

Default to **not materializable** unless the deterministic check *proves* row-filter safety. The LLM widens the net; the verifier guarantees soundness. (This is the same asymmetric-risk posture as the RLS gate in §6.2.)

---

## 11. Refresh, Scheduling & Atomic Swap <a id="11-refresh"></a>

### 11.1 Scheduler — reuse `ScheduledJobEngine` (not "MJ Audience")

> **Correction to the original draft:** MJ Audience (`packages/Lists`, `packages/Communication/SendToAudience`) is **list-membership delta computation + messaging fan-out** (`ResolveSource` / `ComputeDelta` / `ApplyDelta`), *not* a reusable incremental-sync engine. Do not build on it.

The real reusable infrastructure is **`ScheduledJobEngine`** (`packages/Scheduling/engine`): cron-driven, with a `BaseScheduledJob` driver pattern (`ActionScheduledJobDriver` is the template) and `MJ: Scheduled Job Types` / `MJ: Scheduled Job Runs` entities.

**Decision:** implement a **`MaterializationRefreshDriver extends BaseScheduledJob`**, registered via `@RegisterClass`, with a seeded job-type row. It reads its work queue from `MJ: Materialized Results` (rows due per `NextRefreshAt`/`RefreshSchedule`), executes the refresh, and updates `LastRefreshedAt` / `Watermark` / `RowCount` / `Status`.
- **As built:** the driver class is `MaterializationRefreshScheduledJobDriver` (`packages/Scheduling/engine/src/drivers/`), and the job-type row is seeded via **metadata sync** (`metadata/scheduled-job-types/.materialization-refresh-type.json`), not a SQL migration.

### 11.2 Atomic swap (per engine)

- **Build into a shadow table, then repoint the wrapper view** — never truncate-in-place. Readers always see a complete result.
- **SQL Server:** build `materialized_<Name>__shadow`, then `CREATE OR ALTER VIEW materialized_vw<Name>` to point at the shadow (then drop/rename the old table). MJ's base-view generation already does `CREATE/ALTER VIEW` patterns, so this reuses known machinery.
- **PostgreSQL:** same shape via `CREATE OR REPLACE VIEW materialized_vw_<name>`.
- **Avoid partition-switch in v1** — it requires aligned partition schemes and buys nothing at association scale. Keep the swap to a cheap view redefinition.
- **As built — crash-atomic on BOTH engines (post-review fix R1).** The SQL Server swap runs inside a single `SET XACT_ABORT ON; BEGIN TRANSACTION … COMMIT` batch (a mid-swap failure rolls back, leaving the old snapshot intact). An adversarial review found the PostgreSQL swap ran its drop/rename/repoint/index steps as **independent autocommit statements**, so a failure after the drop (lock timeout on the rename, disk pressure on the index) could destroy the old table and leave the entity pointing at a half-built one. The PG full-rebuild **and** external-rebuild swaps now wrap those steps in a single `BEGIN … COMMIT` (PG DDL is transactional) — matching the SQL Server path and the dirty-group recompute path, which already wrapped its delete+insert.

### 11.3 Refresh strategies

- **v1: full rebuild** for all materializations.
- **Shipped (Phase 3/4):** incremental `MERGE` on the surrogate key for keyed **additive** aggregates (`RefreshStrategy='Incremental'`); **dirty-group recompute since `Watermark`** for keyed non-additive aggregates (`DirtyGroupRecompute`). The `Watermark` reuses the `MAX(__mj_UpdatedAt)` fingerprint pattern that the existing query smart-cache (`CacheValidationSQL`) already relies on — same probe, different consumer.
- **Shipped: forced-full-rebuild cadence.** The incremental delete-detection guard only catches a *net* source row-count drop; a balanced delete+insert (net-zero) can leave a group stale. `RefreshesSinceFullRebuild` (on `MJ: Materialized Results`) counts consecutive incremental refreshes and forces a full rebuild every `FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES` (10), so any such drift self-heals within N cycles without author intervention.

### 11.4 Anti-contention

Stagger `RefreshSchedule`s across materializations to avoid a refresh-window thundering herd (§15).

---

## 12. DDL & Index Ownership <a id="12-ddl-index"></a>

**Single source of truth: migrations own table + index DDL; CodeGen auto-creates a minimal viable table only when no migration-provided table exists.**

- **Convention with escape hatch:** if a migration has already created `materialized_<Name>` (with whatever bespoke indexing, covering indexes, partitioning, or columnstore the DBA wants), materialization **detects and reuses it**. Otherwise CodeGen emits the minimal table: the surrogate **PKEY + its unique index**, plus **drill-down indexes** derived from the `QueryField` PKEY/FKEY provenance analysis.
- **Do not run a second "declarative index spec" as a parallel apply path** — that guarantees drift between what metadata claims and what the migration built. If we want declarative index hints, they may *generate* a migration, but the migration remains the thing that actually applies DDL.
- This keeps maximum DB flexibility (the original draft's instinct) while avoiding two competing authorities over physical structure.

---

## 13. Drift, Mixed-Freshness & Other Correctness Requirements <a id="13-correctness"></a>

- **Drift detection — reuse CodeGen's existing schema-change detection.** `ManageMetadataBase` already introspects schema and detects upstream changes. Hook materialization invalidation into that path (using `QueryField`/`QueryEntity` provenance to know which materializations depend on a changed entity/field) rather than building a parallel drift detector. On detected drift, set `MJ: Materialized Results.Status = 'DriftHold'` and surface for review (see §17 open question on auto-rebuild vs hold).
- **Composition drift.** A materialized query that composes reusable inner queries (`{{query:"..."}}`) must be invalidated when an inner query changes — add composition edges (`QueryDependency`) to the drift graph.
- **Mixed-freshness joins.** Once live and snapshot entities coexist, callers will join across them, yielding subtly inconsistent results (e.g. a member present in live but not yet in last night's snapshot). The selection-contract metadata should let an agent **notice and flag** this rather than silently return it.
- **Read-only enforcement.** Generated entities are `VirtualEntity` with `AllowCreate/Update/DeleteAPI = false`; refresh is a privileged system operation, never a CRUD path.

### 13.1 Documented deferrals (from the adversarial review)

These were surfaced by review and are **deliberately deferred** — each is bounded, self-healing, or degrades safely; none is a silent correctness/leak risk. Recorded so operators know the edges:

- **Refresh failure does not downgrade `Status`; freshness advisor has no max-age (R2).** A refresh that fails repeatedly leaves `Status='Active'` with a stale `LastRefreshedAt`; `MaterializationFreshness` flags only `Status !== 'Active'`, not staleness age. A silently-failing refresh is therefore not surfaced as stale. Mitigation for a follow-up: downgrade status on repeated failure and/or add an age threshold to the advisor.
- **Watermark commit-skew mostly closed by a safety overlap (R3).** The persisted incremental watermark is now `MAX(__mj_UpdatedAt) − WATERMARK_SAFETY_OVERLAP_MS` (`MaterializationRefresher.applyWatermarkSafetyOverlap`, default 10 s), so the next incremental pass **re-scans the last overlap window** — a row whose `__mj_UpdatedAt` predates the probed MAX but whose transaction commits *after* the probe (the commit-ordering race, and the same-tick boundary case) is re-processed rather than skipped. The MERGE/`ON CONFLICT` upsert is idempotent, so re-scanning is harmless (verified live: stored watermark = source `MAX` − exactly 10 000 ms). Residual: a source whose commit latency exceeds the overlap is still backstopped by the forced-full-rebuild cadence (§11.3, every 10 cycles). Tuning the overlap per deployment is the follow-up.
- **Concurrent same-materialization refresh contends but is corruption-safe (R4).** Each refresh now builds into a **run-unique shadow table** (`MaterializationRefresher.makeShadowTableName()` → `mj_mat_shd_<uuid>`), so two concurrent refreshers (multi-node scheduler, or a manual "refresh now" racing a sweep) can no longer clobber each other's in-flight shadow, and no partially-built shadow can be renamed into the canonical name — the corruption path is **closed**. What remains: the two swaps still compete for the one shared canonical table name, so under genuine concurrency **one refresh wins and the losers fail safely** — SQL Server deadlock victims and "name already in use / index already exists" conflicts, all rolled back by the swap transaction (`XACT_ABORT`), leaving a valid snapshot and **no orphan shadow tables** (verified: 5-way concurrent race → 1 success, 4 safe rollbacks, snapshot intact, 0 orphans). The failed refreshes are retried by the next sweep. The **default serial sweep never triggers this** (`ConcurrencyMode` defaults to non-Concurrent). A `Status='Refreshing'` in-flight lease so the losers *skip cleanly* instead of erroring remains the follow-up (needs a lock column or connection-pinned advisory lock + its own test cycle).
- **Read routing does not gate base-view snapshots on `Status` (C4 staleness half).** A `DriftHold`/`Disabled`/`Building` base-view snapshot is still *served* when the caller explicitly passes `DataSource:'Materialized'` (staleness, not a leak — base-view reads re-apply source RLS, and `Materialized` is an explicit opt-in). The **leak** half is closed (§6.2: query materializations are held *and* have read revoked on RLS drift). Gating base-view reads on `Status` needs a per-read status lookup the provider can't do cheaply from its layer; deferred as a staleness (not security) refinement.
- **Gate trusts `QueryEntity`/`vwQueryEntities` provenance completeness (P1).** The RLS gate can only inspect source entities that query analysis actually linked; a source reached only via a CTE/subquery/wrapping-view/function that analysis under-links would be invisible to the gate. Fail-closed on *zero* and *unresolvable* links bounds this, but a *partially*-linked query rests on query-analysis fidelity. Hardening (fail closed when a query's parsed table set exceeds its linked-entity set) is a follow-up.

---

## 14. Positioning vs. the Existing Query Cache <a id="14-vs-cache"></a>

MJ **already** has query-result caching — `Query.CacheEnabled` / `CacheTTLMinutes` / `CacheMaxSize` / **`CacheValidationSQL`** (the "smart cache": client sends a `MAX(__mj_UpdatedAt)`+`COUNT(*)` fingerprint, server validates freshness), plus `RunView`/`RunViews` server-side auto-caching. Materialization must be positioned **distinctly** so we don't ship two overlapping freshness systems:

| | **Existing query cache** | **Materialization** |
|---|---|---|
| Nature | Transient result memoization | Durable physical table |
| Lifetime | TTL / fingerprint, in-memory | Persisted, scheduled refresh |
| Indexable | No | **Yes** |
| Joinable as an entity | No | **Yes** (it's an entity) |
| Use case | Repeat reads of the same result | Proven-hot analytical paths needing physical speed/joins |

**Reuse, don't duplicate:** the `CacheValidationSQL` fingerprint (`MAX(__mj_UpdatedAt)`, `COUNT(*)`) is exactly the **watermark / staleness probe** §11.3 needs for incremental and dirty-group refresh. Share that mechanism; don't reinvent it.

---

## 15. Lifecycle & Governance <a id="15-governance"></a>

- **Promotion lifecycle:** compose a query from vetted building blocks → run it logically → **if usage proves it hot, promote it to materialized** (set `Query.IsMaterialized`, re-run CodeGen). Consider AI-suggested promotion from observed query frequency/cost.
- **Anti-sprawl governance:**
  - Gate materialization behind "provably hot," not a casual checkbox.
  - **Stagger refresh schedules** to avoid refresh-window contention (§11.4).
  - **Track usage**; enable retirement of unused materializations.
  - Keep the source → materialized link a **real, enumerable, auditable metadata edge** (`MJ: Materialized Results`, §3.2).
  - Keep generated entities out of the default entity surface (§3.4).

---

## 16. Suggested Phasing <a id="16-phasing"></a>

**Phase 1 — Foundation**
- `MJ: Materialized Results` entity; `Query.IsMaterialized` / `MaterializedResultID` flags.
- CodeGen: base-view materialization via `additionalSchemaInfo`; minimal-table DDL + wrapper view, cross-engine (SQL Server + PostgreSQL); migration-reuse detection (§12).
- Full-rebuild refresh via `MaterializationRefreshDriver` on `ScheduledJobEngine`, with shadow-table atomic swap.
- Materialize **unparameterized** stored queries and entity base views only.
- Read-only enforcement; `DataSource: 'Live' | 'Materialized'` read-path param; selection-contract metadata; last-refreshed/freshness surfacing.
- **RLS downgrade gate** (§6.2) — ship from day one; it's a security guarantee, not a Phase-4 nicety.

**Phase 1.5 — External Data Source composition** *(Amendment — see [§1A](#1a-eds-composition); prioritized ahead of Phase 2 per AN-BC + #2914)*
- Materialize EDS-backed stored Queries and external entity base views: the refresh driver runs the source read through the EDS path and persists into the MJ-managed table (reusing all of Phase 1's table/view/swap machinery).
- Enable "mirror external → join locally" by composition (no new join engine); document the recipe for Skip / QueryBuilder / Database Research Agent.
- Remote-appropriate refresh/freshness defaults; RLS-downgrade-gate semantics for sources with no MJ RLS to carry.

**Phase 2 — Parameterization (Bucket 1)** *(partially built, gated off — NOT shipped)*
- LLM classification + render-and-diff verification on top of `RenderPipeline`. **Built.**
- Row-filter params: materialize broad + read-time predicate, with output-column-presence check and RLS composition unified (§6.4). **Broad-materialize + classify + persist are built; the read-time predicate auto-injection is not — so `RowFilterBroad` is gated off (`allowRowFilterBroad=false`) and parameterized row-filter queries stay live-only. See §6.4 / §9 "As built".**

**Phase 3 — Aggregations & keys** ✅ *Shipped*
- ✅ Combined-key-set surrogate hashing (`SHA2_256` over the §17.1 canonical serialization; within-engine deterministic, cross-engine best-effort).
- ✅ Aggregation-key auto-detection at CodeGen (grouping columns → `MaterializedResult.KeyColumns`; conservative — any ambiguity falls back to the synthetic surrogate + full rebuild).
- ✅ Dirty-group recompute via `Watermark` (`DirtyGroupRecompute` strategy): recompute only the groups whose source rows changed since the watermark, in place. Handles **both** additive and non-additive measures (it recomputes whole groups, so it needs no per-measure delta math — the delta-math fast path for purely-additive measures is the Phase-4 `MERGE` refinement). Guards: single-source + `__mj_UpdatedAt` + baseline watermark required; a source-count drop (deletes) falls back to full rebuild. New `MaterializedResult.SourceRowCount` is the delete-detection guard.

**Phase 4 — Incremental & advanced params** ✅ *Shipped (except explicitly-deferred items)*
- ✅ `MERGE`-based incremental refresh on the key (`RefreshStrategy='Incremental'`): recompute the changed groups and UPSERT on the surrogate (SQL Server `MERGE` / PG `INSERT…ON CONFLICT`) — in-place, no row churn. CodeGen assigns it to keyed single-source **additive** aggregations (SUM/COUNT); non-additive stay on DirtyGroupRecompute. Shares all eligibility/guard logic with the Phase-3 path.
- ✅ Drift-detection automation (hooked into `ManageMetadataBase` via provenance) → `DriftHold` per §17.2; the refresh driver skips held rows.
- ✅ Mixed-freshness join flagging (`MaterializationFreshness` — advisory report for agents/Skip composing multi-entity reads).
- ✅ Forced-full-rebuild cadence (`RefreshesSinceFullRebuild` + `FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES`) — periodic full reconcile that self-heals balanced-delete drift the incremental delete-guard can't localize (§11.3).
- ⏸️ **Deferred (§17):** Bucket 2 bounded-structural per-value cache (§17.1); AI-suggested promotion (§17.4).

---

## 17. Open Questions — Resolved (Phase 3/4 design decisions) <a id="17-open-questions"></a>

Settled at Phase 3 kickoff. Defaults honor the §1 thesis (logical-first, physical-only-when-earned, keep v1 simple). The two UX-flavored ones (2, 6) are team-overridable.

1. **Bucket 2 (per-value structural cache) → DEFER.** v1 stays "structural params → recompute; only row-filters materialize" (the code already gates it off, `allowPerValueCache=false`). Revisit only if a real hot structural-param workload appears.
2. **Drift policy → FLAG-AND-HOLD (`DriftHold`).** On an upstream schema change, mark the materialization `DriftHold` and stop refreshing (surface for review) rather than auto-rebuild — never silently run an expensive rebuild on a schema shift.
3. **Index-hint authoring → MIGRATION-AUTHORED (§12).** No metadata-spec-generates-migration path in v1; index DDL stays in hand-authored migrations per repo convention.
4. **Promotion trigger → MANUAL ONLY (v1).** No usage-telemetry/AI-suggested promotion yet — materialization stays an explicit, earned decision.
5. **PKEY hashing primitive → `SHA2_256` over a strict canonical serialization** (spec below). The correctness-critical Phase-3 task.
6. **Generated-entity visibility → HIDDEN-BY-DEFAULT CATEGORY.** Materialized entities live in a dedicated, hidden category — an optimization detail, not a first-class Explorer surface.

### 17.1 Canonical hash-key serialization (decision #5 detail)
The combined-key surrogate (Phase 3 aggregation keys; the match key for Phase 4 incremental `MERGE` / dirty-group recompute) is `SHA2_256` of a **canonical string**, computed **in-DB** during refresh.

**Correctness requirement = within-engine determinism.** Incremental MERGE and dirty-group recompute match rows on ONE engine across refreshes, so the binding rule is: on a given engine, the same logical row MUST hash identically every refresh. That's achieved by a stable, deterministic canonical serialization (deterministic `CAST`/`CONVERT` + NULL sentinel + delimiter). **Cross-engine byte-identity** (SQL Server and PG producing the *same* surrogate for the same row) is a **best-effort portability goal, NOT a correctness requirement** — a materialization lives on one engine, and a rebuild on a different engine regenerates keys via full rebuild anyway. The canonical rules below are chosen to get close to cross-engine identity, but only within-engine determinism is guaranteed/tested.

Canonical rules (applied per engine):

- **Per-column canonical text** — cast each key column to a fixed, engine-agnostic string (implemented in `MaterializationRefresher.canonicalKeyColumnSql`):
  - **NULL** → control-char-wrapped sentinel `CHAR(30) + 'NULL' + CHAR(30)` (`chr(30)` on PG), emitted explicitly on both engines — never rely on engine-default NULL-concat. (Uses the CHAR(30) record-separator rather than a literal `\x00` NUL, which some string paths truncate on.)
  - **Integers** → base-10, no separators, leading `-` for negatives.
  - **Decimal/numeric/money** → fixed-point, no scientific notation, locale-independent (SQL Server `CONVERT(varchar(50),..)`; PG `(col::numeric)::text` — routing `money` through `::numeric` avoids the lc_monetary-dependent `money::text`).
  - **Float/real** → discouraged in keys; **not** given a canonical case in v1 (falls to the default text cast, which may be lossy / scientific) — treat float keys as unsupported until a 17-sig-fig form is added.
  - **Date/datetime** → ISO-8601 fixed `.fff` precision (`yyyy-MM-ddTHH:mm:ss.fffZ`). **TZ-aware** (`datetimeoffset`/`timestamptz`) is normalized to UTC first; **naive** (`datetime`/`datetime2`/`smalldatetime`/PG `timestamp`) is formatted as the stored wall-clock with a literal `Z` and **no** session-TZ conversion (a naive→timestamptz cast would be session-`TimeZone`-dependent, breaking within-engine determinism).
  - **Bool/bit** → `1`/`0`.
  - **GUID/uniqueidentifier** → **lowercase, hyphenated, no braces** (matches `UUIDsEqual` normalization — resolves the SQL-Server-uppercase vs PG-lowercase split).
  - **Strings** → as-is (no case-fold, no whitespace trim) to preserve fidelity.
- **Delimiter** → join canonical column values with `\x1F` / `CHAR(31)` (unit separator) in the materialization's declared key order (stable).
- **Encoding** → PG hashes UTF-8 (`convert_to(.., 'UTF8')`); SQL Server v1 hashes the `nvarchar` (UTF-16) bytes directly. Both are **within-engine deterministic** (the correctness bar). This means cross-engine byte-identity is NOT achieved for non-ASCII keys in v1 — acceptable, since cross-engine identity is explicitly best-effort (a materialization lives on one engine; an engine switch full-rebuilds).
- **Hash** → `HASHBYTES('SHA2_256', ..)` (SQL Server) / `digest(.., 'sha256')` (PG); stored as lowercase hex.
- **Validation** → the correctness guardrail is a **within-engine determinism** test: build the surrogate twice for the same row set on the same engine and assert identical results (covering every type + edge values — null, empty string, unicode, extreme decimal, fractional-second date, negative, GUID casing). This is what protects incremental `MERGE` from silent mismatch. A cross-engine comparison (SQL Server vs PG producing the same surrogate) is run as a **best-effort** check, not a hard assertion.

---

## 18. Appendix — Key Code References <a id="18-appendix"></a>

| Area | File (representative) |
|---|---|
| Query + related entities | `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (`Query`, `QueryField`, `QueryParameter`, `QueryEntity`, `QueryDependency`, `QueryPermission`) |
| Field provenance population | `packages/MJCoreEntitiesServer/src/custom/query-extraction/` (pipeline, enrich, sync) |
| Query render pipeline / `FinalSQL` | `packages/GenericDatabaseProvider/src/renderPipeline.ts`, `queryCompositionEngine.ts` |
| Query param processing (Nunjucks) | `packages/QueryProcessor/src/queryParameterProcessor.ts` |
| `RunQuery` / `RunView` entry | `packages/MJCore/src/generic/runQuery.ts`, `runView.ts` |
| Cross-engine CodeGen | `packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts` + `providers/{sqlserver,postgresql}/` |
| Metadata management / `additionalSchemaInfo` | `packages/CodeGenLib/src/Database/manage-metadata.ts` (`VirtualEntityConfig`, `EntityConfig`, config extraction) |
| Entity metadata (BaseView, VirtualEntity, Allow*API) | `packages/MJCore/src/generic/entityInfo.ts` |
| RLS | `packages/MJCore/src/generic/entityInfo.ts` (`GetUserRowLevelSecurityWhereClause`, `UserExemptFromRowLevelSecurity`), `securityInfo.ts` (`RowLevelSecurityFilterInfo`) |
| Scheduler | `packages/Scheduling/engine/src/ScheduledJobEngine.ts`, `ActionScheduledJobDriver.ts` |
| Existing query cache | `Query.CacheEnabled` / `CacheValidationSQL`; `packages/MJCore/src/generic/localCacheManager.ts` |
| Adjacent plan | `plans/composable-queries-next-steps.md` (View-Query Bridge future phase) |

---

*Design principle to carry through all of it: **LLM inference for the hypothesis, statistical/deterministic analysis for the proof, iterate until solid** — and **logical first, physical only when earned.***
