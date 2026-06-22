# External Data Sources Guide

**External Data Sources** let an MJ **Entity** or **Query** be backed by a remote system — PostgreSQL, SQL Server, MySQL, Oracle, Snowflake, MongoDB, etc. — and read **live at request time** through a pluggable driver, *without replicating the data into the MJ database*. It's conceptually similar to a SQL Server Linked Server: metadata declares where the data actually lives, and MJAPI proxies reads through a driver.

The design is **additive and read-only**: an entity/query with a null `ExternalDataSourceID` behaves exactly as before. Writes across heterogeneous systems are an explicit non-goal (they break MJ's transaction, Record-Changes, and RLS guarantees).

---

## When to use what

MJ has three ways to work with data that originates outside the MJ database. Pick by access pattern:

| Mechanism | What it does | Use when |
|---|---|---|
| **External Data Sources** (this guide) | Reads the remote system **live**, every request, through a driver. No copy. | You want always-current remote data and can tolerate per-request remote latency/cost (mitigated by TTL caching). |
| **Integrations** (pull-sync) | Scheduled **copy** of remote data into MJ tables. | You want the data physically in MJ (full query/join/RLS power) and periodic freshness is acceptable. |
| **Query/Entity Materialization** (see `plans/query-entity-materialization.md`) | Persists *proven-hot* query/view results into MJ-managed physical tables, refreshed on a schedule. | A hot analytical path is too expensive live and you want to buy back speed without full ETL. |

External Data Sources is the right tool when the answer to "do we need a copy of this in MJ?" is **no**.

---

## Architecture

```
Caller (Explorer UI / Action / agent / code)
   │  RunView / RunQuery / Load   ← standard MJ APIs, unchanged
   ▼
GenericDatabaseProvider
   │  if entity/query has ExternalDataSourceID → route out (before any MJ-DB SQL)
   ▼
ExternalDataSourceReadRouter   (abstract, @memberjunction/core — dependency-inversion seam)
   │  resolved at runtime via MJGlobal.ClassFactory
   ▼
ExternalDataSourceReadRouterImpl   (@memberjunction/external-data-sources, server-only)
   │  picks the driver + connection for the data source
   ▼
BaseExternalDataSourceDriver  →  Postgres / SQL Server / MySQL / Oracle / Snowflake / MongoDB driver
   ▼
Remote system
```

Key points:
- The **router contract** lives in `@memberjunction/core` (abstract `ExternalDataSourceReadRouter`); the concrete engine lives in the server-only `@memberjunction/external-data-sources`. This keeps driver SDKs out of `core` and the browser bundle.
- Dispatch happens inside `GenericDatabaseProvider` for `RunView`, `RunQuery`, and single-record `Load`, guarded by a null `ExternalDataSourceID` check. Browser/Explorer reads route externally transparently (they flow through the same provider).
- External entities generate to extend **`ReadOnlyExternalBaseEntity`** (CodeGen), and CodeGen **skips** SQL-object generation (sprocs/views/indexes) and **GraphQL mutations** for them.

---

## Setup

### 1. Register the data source *type* (driver catalog)

`ExternalDataSourceType` (entity `MJ: External Data Source Types`) maps a type name to a `DriverClass` (the `@RegisterClass` key of a driver). Types are seeded as metadata in `metadata/external-data-source-types/`. The starter catalog ships with **PostgreSQL, SQL Server, MySQL, Oracle, Snowflake, and MongoDB** (all `Active` — drivers included). Add more by seeding rows (see *Adding a driver* below).

> **Note:** the `Status` column only accepts `Active` or `Deprecated` — there is no "Draft". Only seed a type as `Active` once its driver actually ships; otherwise selecting it produces a runtime "no driver registered" error.

### 2. Create the data source *instance*

`ExternalDataSource` (entity `MJ: External Data Sources`) is one configured connection:
- `TypeID` → the type above
- `CredentialID` → an `MJ: Credentials` record (secrets are encrypted at rest by `CredentialEngine`; **never** put secrets in `ConnectionConfig`)
- `DefaultSchema` / `DefaultDatabase` → schema/namespace/dbName on the remote side
- `ConnectionConfig` → JSON blob of **non-secret** driver config (host, port, Snowflake account/warehouse, Mongo URI, SSL flag, pool size, …)
- `DefaultCacheTTLSeconds` → how long external reads are cached (default 300; `0` disables caching for this source)
- `Status` → `Active` / `Disabled` / `TestFailed`

### 3. Point an Entity or Query at it

- **Entity**: set `Entity.ExternalDataSourceID` and `Entity.ExternalObjectName` (the remote table/view/collection). Set `AllowCreateAPI`/`AllowUpdateAPI`/`AllowDeleteAPI` to `0` (read-only). After CodeGen runs, the generated entity class extends `ReadOnlyExternalBaseEntity` and no sprocs/views are generated. (If a write API flag is left on, the generated GraphQL mutation still rejects at runtime via `ReadOnlyExternalBaseEntity.Save()`/`.Delete()` — it fails loudly with the read-only reason, never reaching a sproc.)
- **Query**: set `Query.ExternalDataSourceID`. The query's SQL is executed in the remote dialect via the driver's native-query path (full multi-table joins authored in the remote dialect are supported).

> **EntityField provisioning is automatic.** During a normal `mj codegen` run, the `manageExternalEntities` pass introspects the **remote** schema of each external-backed entity (via the driver's `IntrospectSchema`) and syncs its `EntityField` rows — the remote analogue of how CodeGen already manages view-backed `VirtualEntity` fields from `INFORMATION_SCHEMA`. You set `ExternalDataSourceID` + `ExternalObjectName` on the entity; CodeGen fills in the fields. (The engine + driver packages must be installed in the CodeGen process; they're loaded on demand only when external entities exist.)

> **Foreign keys become MJ relationships.** The four relational drivers (PostgreSQL, SQL Server, MySQL, Oracle) also introspect **primary and foreign keys** from the source catalog into the schema contract's `Relationships`. When CodeGen imports a single-column FK whose referenced remote object is *also* an imported external entity in the same data source, `manageExternalEntities` sets the FK field's `RelatedEntityID` / `RelatedEntityFieldName` / `IsSoftForeignKey`, and a follow-up `manageEntityRelationships` pass materializes a real `EntityRelationship` record — so an external `orders.customer_id → customers` FK behaves like any other MJ relationship (e.g. a `Customers → Orders` one-to-many). Composite-column FKs and references to objects that haven't been imported yet are skipped with a log rather than guessed at (that hardening is a follow-on). MongoDB has no foreign keys, and Snowflake's catalog doesn't expose them reliably, so those drivers leave `Relationships` empty by design.

---

## Behavior & guarantees

### Read-only
External entities extend `ReadOnlyExternalBaseEntity`: `Save()`/`Delete()` short-circuit (no remote write), return `false`, and populate `LatestResult` with a clear message. CodeGen also omits the Create/Update/Delete GraphQL mutations for external entities.

### Caching (TTL)
Remote data can't be event-invalidated (no `BaseEntity` save/delete events fire for it), so external reads are cached **time-bounded** by the data source's `DefaultCacheTTLSeconds`:
- `RunView` results are cached via `LocalCacheManager` with a TTL (an external read cached *without* a TTL is refused outright — a fail-safe against serving stale data forever).
- `RunQuery` results are cached with the same TTL.
- A `DefaultCacheTTLSeconds` of `0` disables caching for the source.

Set a **generous TTL on warehouse sources** (e.g. Snowflake) where per-query cost matters.

### Security
- **Credentials** are resolved and decrypted through `CredentialEngine`; nothing secret lives in code or `ConnectionConfig`.
- **Row-Level Security is never silently bypassed.** A remote system can't enforce MJ's RLS WHERE clauses, so if RLS would filter a user's rows, the external read is **refused** with a clear error. Users exempt from RLS pass through. Do **not** back an RLS-protected entity with an external data source.
- **Filter injection** is guarded: the single-record `Load` primary-key filter single-quote-escapes values. `ExtraFilter` is passed to the remote dialect with the same trust model as a normal MJ `RunView` `ExtraFilter`.
- **Connectivity tests require auth** (e.g. the Mongo driver uses `listCollections`, not a pre-auth `ping`).

### Supported / unsupported read params
`RunView` on an external entity supports `ExtraFilter`, `OrderBy`, `Fields`, and offset paging (`StartRow`/`MaxRows`). Params that can't be honored remotely **hard-fail with a clear error** rather than being silently dropped:
- `AfterKey` (keyset pagination) — use offset paging instead.
- `Aggregates` — author an external MJ Query for aggregate results.
- a non-empty `UserSearchString` — use `ExtraFilter`.

### Field-drift warning (Queries)
After an external `RunQuery`, the returned columns are checked (case-insensitively) against the query's declared `QueryField` metadata. If a declared field is missing (a remote column was renamed/dropped), a **warning is logged** and the rows are still returned (non-fatal).

### Connection self-heal
If a read fails with an auth/credential error (e.g. a rotated or expired credential against a pooled connection), the driver base class evicts the cached connection, re-resolves the credential, and **retries the read once** — recovering without a process restart. Non-auth errors propagate immediately.

---

## Adding a driver

A driver proxies one family of remote systems. To add one (e.g. another SQL dialect or NoSQL store):

1. **New package** `@memberjunction/external-data-source-<name>` that depends on `@memberjunction/external-data-sources`.
2. **Subclass `BaseExternalDataSourceDriver<TConnection>`** and implement:
   - `getConnection(dataSource, contextUser)` — open/cache a connection/pool per `ExternalDataSource.ID`.
   - `invalidateConnection(dataSourceId)` — close + evict the cached connection (powers the auth self-heal).
   - `RunView`, `RunNativeQuery`, `LoadSingle`, `TestConnection`, `IntrospectSchema`.
   - Wrap read ops in `this.withConnectionRetry(dataSource, op)` to get the auth self-heal.
   - Use `this.resolveCredential(...)` for secrets and `this.parseConnectionConfig(...)` for non-secret config.
3. **Register it**: `@RegisterClass(BaseExternalDataSourceDriver, '<DriverClass>')` — the key must match the `ExternalDataSourceType.DriverClass`.
4. **Seed a type row** in `metadata/external-data-source-types/` (`Status: 'Active'`, the right `FilterDialect`/`PagingStrategy`/`MetadataIntrospectionStrategy`).

The class-registration manifest captures the driver automatically (no extra wiring).

### Shipped drivers
| Driver | `DriverClass` | SDK | Auth | Identifier quoting · paging | Introspection (incl. FKs?) |
|---|---|---|---|---|---|
| PostgreSQL | `PostgresExternalDriver` | `pg` | username/password | `"quotes"` · `LIMIT`/`OFFSET` | `information_schema` — PK + **FK** |
| SQL Server | `SQLServerExternalDriver` | `mssql` | username/password | `[brackets]` · `TOP`/`OFFSET..FETCH` | `INFORMATION_SCHEMA` + `sys.*` — PK + **FK** |
| MySQL | `MySQLExternalDriver` | `mysql2` | username/password | `` `backticks` `` · `LIMIT`/`OFFSET` | `INFORMATION_SCHEMA` — PK + **FK** |
| Oracle | `OracleExternalDriver` | `oracledb` (Thin) | username/password | `"quotes"` · `OFFSET..FETCH` | `ALL_*` catalog — PK + **FK** |
| Snowflake | `SnowflakeExternalDriver` | `snowflake-sdk` | password / PAT / key-pair (JWT) | `"quotes"` · `LIMIT`/`OFFSET` | `INFORMATION_SCHEMA` — PK only (no reliable FKs) |
| MongoDB | `MongoExternalDriver` | `mongodb` | username/password | n/a · skip/limit | document sampling — no FKs |

All four relational drivers introspect foreign keys (composite-key aware) into the schema contract's `Relationships`; CodeGen consumes them as described under *Point an Entity or Query at it* above. `node-oracledb` runs in **Thin mode** — pure JS, no Oracle Instant Client to install.

---

## Known limitations

- **No cross-source joins.** A single `RunView`/`Query` hits exactly one source; federation across sources is the agent/orchestration layer's job.
- **MongoDB filter translation is type-blind.** The SQL-WHERE → Mongo translator preserves literal types as written, so `id = '100'` (string) won't match a numeric `100`, and date literals stay strings. `LIKE` is **case-insensitive** (matches SQL Server's default; deliberately diverges from Postgres `LIKE`). For type-sensitive filters, use a native Mongo query.
- **`count_only` RunView still fetches rows.** An external `RunView` with `ResultType: 'count_only'` returns an accurate `TotalRowCount` but fetches up to `MaxRows` rows to obtain it (no remote `COUNT(*)` optimization). And `TotalRowCount` falls back to the returned page size when a driver doesn't report a separate total — so deep-pagination "are there more pages?" checks over external sources can be approximate.
- **EntityField type/length mapping is best-effort.** The native→MJ type mapping is approximate; in particular `nvarchar` lengths are carried as the remote **character** count (not byte count), so a remote `varchar(255)` surfaces with a declared `Length` of 255.
- **No per-end-user identity passthrough.** Drivers use the shared service-account credential bound to the data source.
- **Transport is secure-by-default for the SQL drivers.** Postgres, SQL Server, MySQL, Oracle, and MongoDB **refuse** a plaintext connection to a non-local host: enable TLS (Postgres `ssl:true` — cert verification then on by default via `sslRejectUnauthorized`; SQL Server `ssl:true`; MySQL `ssl:true`; Oracle via TCPS; MongoDB `tls:true` or a `mongodb+srv://`/`tls=true` URI), or set `allowInsecureTransport:true` in `ConnectionConfig` to consciously accept plaintext. Local hosts (`localhost`/`127.0.0.1`) are exempt for dev convenience. Snowflake's SDK is always HTTPS.
- **Snowflake fidelity caveats** (large `NUMBER` precision past 2^53; uppercased column identifiers) are being hardened as the Snowflake driver matures.
- **Integration tests** — the Postgres, SQL Server, MySQL, Oracle, and MongoDB driver suites are self-seeding and run in CI against service containers (`.github/workflows/eds-integration.yml`), each gated by its own `RUN_<DB>_INTEGRATION=1` flag so the default unit-test gate stays DB-free. The Snowflake suite is opt-in (`RUN_SNOWFLAKE_INTEGRATION=1`) against your own account — it needs a hosted Snowflake (no service container) and tester-supplied credentials via env vars (never committed).

---

## Reference
- Plan: `plans/external-data-sources.md`
- Engine: `packages/ExternalDataSources/Engine` · Drivers: `packages/ExternalDataSources/Providers/*`
- Router contract: `packages/MJCore/src/generic/externalDataSourceReadRouter.ts`
- Read-only base: `packages/MJCoreEntities/src/custom/ReadOnlyExternalBaseEntity.ts`
- Dispatch: `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`
