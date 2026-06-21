# MJ — Unified External Data Access Strategy

**Status:** Proposed (design only — no code). The unification design-review artifact for external data access:
External Data Sources (#2449) + Query/Entity Materialization (#2770) + the integration framework + the generic
Set/Record-processing engine (#2907). Facilitator: rkihm-BC, with Josue + AN.

> Companion: PR #2913 (`plans/integration-data-source-connector-strategy.md`) is the original **standalone**
> relational-connector strategy. This doc **supersedes** its build approach by unifying it with EDS; #2913 is retained
> as the historical/standalone artifact.

---

## 1. Why this exists

A first draft proposed building a dialect-pluggable **relational integration connector** from scratch (a new
`IRelationalSourceDriver`, SQL Server → PG → MySQL, with its own connection/introspection/PK-FK reading). That was
halted with: *"different purposes and use cases, highly complementary … the vision needs to unify."* Reading the related
work confirms it — most of that "new" layer **already exists**, and building a parallel one is the exact divergence the
review exists to prevent.

- **#2449 External Data Sources (EDS) — fully implemented.** `BaseExternalDataSourceDriver` (TestConnection,
  IntrospectSchema, RunView, LoadSingle, RunNativeQuery, pooled `getConnection`, `resolveCredential` via CredentialEngine,
  auth self-heal) with **PostgreSQL / MongoDB / Snowflake** drivers. Core introspection contract `ExternalSchemaDescriptor`
  (columns w/ `isPrimaryKey` + `nullable` + native type; composite-FK-aware `relationships`). Clean metadata model
  (`ExternalDataSource` → `CredentialID` → CredentialEngine; secrets never in config). **SQL Server is its named deferred
  fast-follow.**
- **#2770 Query & Entity Materialization — design doc.** Persist hot Query/entity results into MJ physical tables,
  scheduled refresh, shadow-swap. *"EDS = live-read half; #2770 = materialize half; designed to compose."*
- **#2907 — generic Set/Record-processing engine.** Abstracts the integration engine's field-transforms
  (`FieldMappingEngine.ts`) out into a reusable transform engine.

## 2. One foundation, three access modes

External data reaches MJ in three modes that **share one foundation** and differ only in what happens after introspection:

| Mode | What it does | Owner | Best for |
|---|---|---|---|
| **Live-read** | Proxy a virtual entity/query to the source at query time | **EDS (#2449)** | Always-fresh reads, low volume, no copy |
| **Materialize** | Persist results into MJ tables, scheduled refresh | **#2770** (composes w/ EDS) | Hot analytical paths; mirror raw tables on a schedule |
| **Pull-sync (ETL)** | Incremental delta pull + transform into a *curated* MJ entity shape, with write-back | **Integration framework** | Transform-heavy ingestion, bidirectional sync, curated mapping |

**Key reframing:** "mirror a customer's SQL Server into MJ, refreshed on a schedule" is **Live-read + Materialize**, not a
new integration connector. The integration framework's distinct value is the **Pull-sync** column: delta watermark/keyset
fetch, write-back, and transform-heavy curated mapping — none of which EDS does.

## 3. The shared foundation (already built in EDS — reuse, don't rebuild)

All three modes need the same four things, and EDS already provides them:

1. **Connect + pool** per source — `BaseExternalDataSourceDriver.getConnection` (cached per `ExternalDataSource.ID`).
2. **Credentials** — `resolveCredential` via `@memberjunction/credentials` CredentialEngine. Secrets live in the credential
   store, never in config. (The integration framework today parses `user`/`password` out of `CompanyIntegration.Configuration`
   JSON — the anti-pattern EDS already avoids.)
3. **Schema introspection** → `ExternalSchemaDescriptor` (core): objects (table/view/collection), columns (native type,
   `nullable`, `isPrimaryKey`), and `relationships` (composite-FK-aware). **This is the PK/FK/constraint reading the first
   draft was going to add — already a platform contract.**
4. **TestConnection** + auth self-heal (`withConnectionRetry`).

## 4. What is genuinely the integration framework's (not in EDS)

- **Incremental delta pull** — `FetchChanges` watermark/keyset sync. EDS has no notion of "what changed since last time."
- **Write-back (CRUD)** — EDS is read-only-enforced; integration can create/update/delete in the source.
- **Curated transform mapping** — landing source rows into a *different* MJ entity shape (field maps, custom-overflow
  capture/promotion), which should ride **#2907's** generic transform engine rather than its own.

## 5. The unified architecture

```
            ┌──────────────────────── shared foundation (EDS, #2449) ────────────────────────┐
            │  BaseExternalDataSourceDriver  +  ExternalSchemaDescriptor  +  CredentialEngine  │
            │  per engine: connect/pool · introspect (cols+PK+FK) · TestConnection · creds     │
            │  drivers: Postgres ✅  Mongo ✅  Snowflake ✅   SQL Server ⏳   MySQL ⏳            │
            └───────────────▲───────────────────────▲───────────────────────▲──────────────────┘
                            │                       │                       │
              ┌─────────────┴───────┐   ┌───────────┴─────────┐   ┌─────────┴───────────────────┐
              │  LIVE-READ (EDS)    │   │  MATERIALIZE (#2770)│   │  PULL-SYNC (Integration)     │
              │  RunView/Load/Query │   │  persist + schedule │   │  FetchChanges (delta) +      │
              │  filter translation │   │  shadow-swap views  │   │  write + transform (#2907)   │
              └─────────────────────┘   └─────────────────────┘   └──────────────────────────────┘
```

One driver per engine, built once, consumed by all three modes. No parallel `IRelationalSourceDriver`.

## 6. Choosing a mode (decision guidance)

- **Need always-fresh, low-volume reads, no copy?** → Live-read (EDS).
- **Need raw tables mirrored physically + fast, refreshed on a schedule?** → Live-read + Materialize (EDS + #2770).
- **Need to transform/curate into a different entity model, or write back to the source, or capture deltas with rich
  mapping?** → Pull-sync (Integration framework) — built **on** the EDS driver/introspection/credential layer.

## 7. Engines & families (the driver backlog, on the shared foundation)

Relational engines are added as **EDS drivers** (one per engine), reused by all modes:

| Engine | Driver | Status |
|---|---|---|
| PostgreSQL (+ Supabase/Neon/Redshift/Cockroach/Yugabyte/Aurora via wire-compat) | `pg` | ✅ EDS |
| MongoDB | `mongodb` | ✅ EDS |
| Snowflake | `snowflake-sdk` | ✅ EDS |
| **SQL Server** | `mssql` | ⏳ EDS deferred fast-follow — **first build** |
| **MySQL/MariaDB** | `mysql2` | ⏳ next |
| Oracle / Db2 / warehouses (BigQuery, Databricks, ClickHouse) | per-SDK | future |

Semi-structured (Parquet/XML+XSD/JSON/CSV) and non-relational beyond Mongo (Cassandra/Elasticsearch) remain future driver
families on the **same** `BaseExternalDataSourceDriver` foundation + the same three modes — not a separate architecture.
(The "sibling connector family" framing in #2913 collapses into "more drivers + the materialize mode.")

## 8. Open decisions for the design review (the real forks)

- **D1 — raw-relational ownership:** all-EDS+materialize, or keep a Pull-sync integration connector (built on EDS) for the
  transform/write case? Drives whether the legacy `RelationalDBConnector` is deprecated or refactored.
- **D2 — credentials:** integration migrates `CompanyIntegration.Configuration` secrets → CredentialEngine.
- **D3 — one introspection contract:** integration's `DiscoverObjects/DiscoverFields` adopt/map `ExternalSchemaDescriptor`.
- **D4 — transforms:** integration field-mapping rides #2907's generic Set/Record-processing engine.
- **D5 — driver home:** SQL Server (and MySQL) built **once** on EDS, reused by integration — not two introspectors.

## 9. Phasing

- **Phase 0 — align (no code):** this doc → rkihm + Josue + AN; settle D1 & D5.
- **Phase 1 — SQL Server EDS driver** (safe under any D1 outcome; EDS's own backlog). `IntrospectSchema` via
  `INFORMATION_SCHEMA` + `TABLE_CONSTRAINTS` / `KEY_COLUMN_USAGE` / `REFERENTIAL_CONSTRAINTS` → `ExternalSchemaDescriptor`
  (incl. relationships); `RunView` filter translation; `LoadSingle`; pooling; credential. Validate end-to-end against a
  Dockerized SQL Server (reusing EDS's `*.integration.test.ts` pattern) through MJ's normal `RunView` path.
- **Phase 2 — Materialize SQL Server sources** (compose with #2770) → covers the "physical mirror on a schedule" need.
- **Phase 3 — Pull-sync, only if D1 keeps it:** refactor/replace `RelationalDBConnector` to consume the EDS layer and add
  only `FetchChanges` (delta) + write + #2907 transforms. MySQL driver alongside.

## 10. Impact / migration

- **#2913:** retained as the original standalone relational strategy; THIS doc is the unified successor.
- **EDS #2449:** unaffected — the foundation; our SQL Server driver is its fast-follow.
- **#2770 / #2907:** we become consumers (materialize composition; transform engine) — coordinate timing with AN.
- **Legacy `RelationalDBConnector.ts`** (SQL-Server-only, connectors pkg): deprecated-for-raw-DB or refactored onto EDS per
  D1. SaaS REST connectors (MemberSuite #2912, workshop v2) are **unaffected** — different domain.
- **No new external-DB driver layer is created.** The only net-new code is per-engine EDS drivers + (if D1 keeps it) the
  thin Pull-sync delta/write/transform layer on top.
