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
- External entities generate to extend **`ReadOnlyExternalBaseEntity`** (CodeGen), and CodeGen **skips** SQL-object generation (sprocs/views/indexes) for them. GraphQL mutations are governed by the entity's `Allow*API` flags (not by external-ness): with them set to `0` — the required read-only setup — no Create/Update/Delete mutations are generated; if a flag is left on, the mutation **is** generated but rejects at runtime via `ReadOnlyExternalBaseEntity`.

---

## Setup

### 1. Register the data source *type* (driver catalog)

`ExternalDataSourceType` (entity `MJ: External Data Source Types`) maps a type name to a `DriverClass` (the `@RegisterClass` key of a driver). Types are seeded as metadata in `metadata/external-data-source-types/`. The starter catalog ships with **PostgreSQL, SQL Server, MySQL, Oracle, Snowflake, and MongoDB** (all `Active` — drivers included), plus a **Microsoft Fabric SQL Endpoint (External)** type that reuses the SQL Server driver over Microsoft Entra service-principal auth (see *Microsoft Fabric* below). Add more by seeding rows (see *Adding a driver* below).

> **Note:** the `Status` column only accepts `Active` or `Deprecated` — there is no "Draft". Only seed a type as `Active` once its driver actually ships; otherwise selecting it produces a runtime "no driver registered" error.

### 2. Create the data source *instance*

`ExternalDataSource` (entity `MJ: External Data Sources`) is one configured connection:
- `TypeID` → the type above
- `CredentialID` → an `MJ: Credentials` record (secrets are encrypted at rest by `CredentialEngine`; **never** put secrets in `ConnectionConfig`). Create this record via the **Credentials dashboard** (`@memberjunction/ng-credentials`) — the secret is encrypted on save, so it cannot be hand-entered through the generic entity form.
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
External entities extend `ReadOnlyExternalBaseEntity`: `Save()`/`Delete()` short-circuit (no remote write), return `false`, and populate `LatestResult` with a clear message. CodeGen omits the Create/Update/Delete GraphQL mutations when the entity's `Allow*API` flags are `0` (the required read-only setup); if a flag is left on, the mutation is generated but rejects at runtime via the same base class — so external entities are never writable regardless.

### Caching (TTL)
Remote data can't be event-invalidated (no `BaseEntity` save/delete events fire for it), so external reads are cached **time-bounded** by the data source's `DefaultCacheTTLSeconds`:
- Caching applies to the **client smart-cache path** (`RunViewsWithCacheCheck`, which Explorer grids use) and to `RunQuery`: results are stored in `LocalCacheManager` with the source's TTL (an external read cached *without* a TTL is refused outright — a fail-safe against serving stale data forever).
- **Plain server-side `RunView`/`RunViews`** — e.g. `new RunView().RunView(...)` from Actions, agents, or scheduled jobs — do **not** currently cache external results; each call reads the remote. (Server-side external `RunView` caching is a planned follow-up.)
- A `DefaultCacheTTLSeconds` of `0` disables caching for the source.

The TTL primarily benefits Explorer grid reads. If a metered warehouse (e.g. Snowflake) is read in **server-side loops** (agents/jobs), be aware those reads are *not* yet cached — bound cost via the query itself and a least-privilege credential rather than relying on the TTL.

### Security
- **Credentials** are resolved and decrypted through `CredentialEngine`; nothing secret lives in code or `ConnectionConfig`.
- **Row-Level Security is never silently bypassed on entity reads.** A remote system can't enforce MJ's RLS WHERE clauses, so if RLS would filter a user's rows, the external `RunView`/`Load` is **refused** with a clear error. Users exempt from RLS pass through. Do **not** back an RLS-protected entity with an external data source.

  > **⚠️ RLS asymmetry — the Query path is NOT fail-closed.** `RunView` and `Load` refuse external reads under an RLS clause, but an external MJ **Query** (`RunQuery`) runs admin-authored SQL and **intentionally does not apply per-entity RLS** — and it is **not** subject to the hard external-read row ceiling that caps `RunView`. Saved queries are treated as trusted admin SQL, gated only by query permissions. **Do not author an external Query over an RLS-protected table when per-user row scoping matters** — there is no automatic row-level enforcement on this path. Scope it with a least-privilege source credential and query permissions instead.
- **Filter injection** is guarded on two fronts: the single-record `Load` primary-key predicate is **parameter-bound** (placeholders + a separate values array — e.g. Postgres `$1`), never string-interpolated into the SQL. `ExtraFilter` and `OrderBy` are screened at **two layers** — the same forbidden-keyword screen MJ applies to any user-provided clause, **plus** a parser-based read-only clause screen at the driver boundary that rejects a top-level write / `UNION` break-out (a nested `SELECT` subquery stays a read and is allowed).
- **The source credential is load-bearing on two read paths — not just defense-in-depth.** The entity path has three app-layer write guards, but two constructs pass the read-only screens as legitimate *reads* and are then bounded **only by what the source credential is granted**: (a) `ExtraFilter` **subquery reads** (`id IN (SELECT … FROM other_table)`) — a nested `SELECT` is structurally a read, so which tables it can reach is limited only by the credential; and (b) `RunNativeQuery` **side-effecting function calls** (`SELECT nextval(...)`) — indistinguishable from a pure read in the AST. On these paths a least-privilege, read-only credential is the *primary* authority — provisioning one is mandatory, not optional hardening.
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
| SQL Server | `SQLServerExternalDriver` | `mssql` | username/password · **Entra service principal** (Fabric) | `[brackets]` · `TOP`/`OFFSET..FETCH` | `INFORMATION_SCHEMA` + `sys.*` — PK + **FK** |
| MySQL | `MySQLExternalDriver` | `mysql2` | username/password | `` `backticks` `` · `LIMIT`/`OFFSET` | `INFORMATION_SCHEMA` — PK + **FK** |
| Oracle | `OracleExternalDriver` | `oracledb` (Thin) | username/password | `"quotes"` · `OFFSET..FETCH` | `ALL_*` catalog — PK + **FK** |
| Snowflake | `SnowflakeExternalDriver` | `snowflake-sdk` | password / PAT / key-pair (JWT) | `"quotes"` · `LIMIT`/`OFFSET` | `INFORMATION_SCHEMA` — PK only (no reliable FKs) |
| MongoDB | `MongoExternalDriver` | `mongodb` | username/password | n/a · skip/limit | document sampling — no FKs |

All four relational drivers introspect foreign keys (composite-key aware) into the schema contract's `Relationships`; CodeGen consumes them as described under *Point an Entity or Query at it* above. `node-oracledb` runs in **Thin mode** — pure JS, no Oracle Instant Client to install.

### Microsoft Fabric (SQL endpoint)

A Fabric **Warehouse** / **Lakehouse SQL analytics endpoint** speaks the SQL Server wire protocol (TDS), so it's served by the **same `SQLServerExternalDriver`** — no separate driver. Two things differ from a classic SQL Server:

- **Auth is Microsoft Entra only.** Fabric refuses SQL logins. Set `authMode: 'entra-service-principal'` in `ConnectionConfig` (the driver also **infers** it when the credential carries a `clientId`), and store a credential with `tenantId` / `clientId` / `clientSecret`. The service principal must be granted access to the Fabric workspace (Member/Viewer). Encryption is forced on for this path.
- **Requires `mssql` ≥ 12.7.0 (tedious ≥ 19.2.1).** Older `tedious` has a fedauth `FeatureExt` bug that makes Fabric **silently drop the connection right after LOGIN7** (no error — just "socket hang up"); the fix is [tediousjs/tedious#1718](https://github.com/tediousjs/tedious/issues/1563). This is why the EDS SQL Server provider floors `mssql` at `^12.7.0`.
- **`SET XACT_ABORT` is suppressed automatically.** Fabric Warehouse rejects that statement (error 15869), which `tedious` otherwise sends on connect; the driver sets `abortTransactionOnError: null` on the Entra path so it emits neither `on` nor `off`. Read-only reads never need it.

Example `ConnectionConfig` for a Fabric warehouse:

```json
{
  "host": "<workspace-id>-<warehouse-id>.datawarehouse.fabric.microsoft.com",
  "authMode": "entra-service-principal",
  "ssl": true
}
```

with `DefaultDatabase` set to the warehouse name and a credential carrying `tenantId`/`clientId`/`clientSecret`. Everything else — introspection (`INFORMATION_SCHEMA` + `sys.*`, incl. FKs), paging, read-only enforcement, caching — behaves exactly as the SQL Server driver.

> **FK introspection on Fabric.** Fabric Warehouse supports `PRIMARY KEY` / `FOREIGN KEY` constraints only as **`NOT ENFORCED`**, and only when added via `ALTER TABLE` (inline constraints in `CREATE TABLE` error with *"…not supported in this edition"*). When such constraints exist, the driver's `sys.foreign_keys` introspection surfaces them into MJ `Relationships` exactly as for SQL Server — verified by a live integration test that seeds a `NOT ENFORCED` FK and asserts it's introspected. A Fabric source with no declared constraints simply yields empty `Relationships` (the query returns gracefully, it doesn't error).

---

## Known limitations

- **No cross-source joins.** A single `RunView`/`Query` hits exactly one source; federation across sources is the agent/orchestration layer's job.
- **MongoDB filter translation is type-blind.** The SQL-WHERE → Mongo translator preserves literal types as written, so `id = '100'` (string) won't match a numeric `100`, and date literals stay strings. `LIKE` is **case-insensitive** (matches SQL Server's default; deliberately diverges from Postgres `LIKE`). For type-sensitive filters, use a native Mongo query.
- **`count_only` RunView still fetches rows.** An external `RunView` with `ResultType: 'count_only'` returns an accurate `TotalRowCount` but fetches up to `MaxRows` rows to obtain it (no remote `COUNT(*)` optimization). And `TotalRowCount` falls back to the returned page size when a driver doesn't report a separate total — so deep-pagination "are there more pages?" checks over external sources can be approximate.
- **EntityField type/length mapping is best-effort.** The native→MJ type mapping is approximate; in particular `nvarchar` lengths are carried as the remote **character** count (not byte count), so a remote `varchar(255)` surfaces with a declared `Length` of 255.
- **No per-end-user identity passthrough.** Drivers use the shared service-account credential bound to the data source.
- **Cross-instance cache invalidation is a known security-relevant gap (multi-instance only).** `ExternalDataSourceRouter.Resolve()` returns a cached `{driver, dataSource}` snapshot with **no per-read re-check** — `Status` and the credential/config are frozen at first resolve. On a single instance a local save/delete evicts the cached driver immediately, so this is benign. On a **multi-instance** MJAPI deployment, other instances keep serving the stale snapshot until they restart — which is **not** merely a latency concern:
  - **Repointing** a source at a different tenant's database → other instances keep serving the **old tenant's** data until restart (cross-tenant disclosure).
  - **Disabling** a source (e.g. a leaked credential) → other instances keep reading from the open pool until restart (the security cutoff is silently ineffective fleet-wide).

  Interim mitigation until server-side `remote-invalidate` is wired up: set a short `DefaultCacheTTLSeconds`, and/or add a per-read `Status`/row-version re-check to bound the staleness window. **Single-instance deployments are unaffected.**
- **Removing a data source does not auto-remove its entities or relationships.** Deleting an `ExternalDataSource` leaves its imported external entities and their materialized `EntityRelationship` rows in place — deliberate, since auto-pruning on a transient introspection failure would be destructive. They become **stale** (not dangling) and require manual cleanup: delete or re-import the affected entities by hand after removing a source.
- **Transport is secure-by-default for the SQL drivers.** Postgres, SQL Server, MySQL, Oracle, and MongoDB **refuse** a plaintext connection to a non-local host: enable TLS (Postgres `ssl:true` — cert verification then on by default via `sslRejectUnauthorized`; SQL Server `ssl:true`; MySQL `ssl:true`; Oracle via TCPS; MongoDB `tls:true` or a `mongodb+srv://`/`tls=true` URI), or set `allowInsecureTransport:true` in `ConnectionConfig` to consciously accept plaintext. Local hosts (`localhost`/`127.0.0.1`) are exempt for dev convenience. Snowflake's SDK is always HTTPS.
- **Snowflake fidelity.** High-precision `NUMBER` columns (scale > 0, or precision > 15) are **cast to string** in structured `RunView`/`LoadSingle` reads to avoid 2^53 float-precision loss (`FLOAT`/`REAL` stay native); native `RunQuery` reads instead use the blunter `fetchAsString: ['Number']` lever. One open caveat remains: Snowflake returns **uppercase column identifiers**, so result-row keys must line up with the MJ field names as-is.
- **Integration tests** — the Postgres, SQL Server, MySQL, Oracle, and MongoDB driver suites are self-seeding and run in CI against service containers (`.github/workflows/eds-integration.yml`), each gated by its own `RUN_<DB>_INTEGRATION=1` flag so the default unit-test gate stays DB-free. The Snowflake suite is opt-in (`RUN_SNOWFLAKE_INTEGRATION=1`) against your own account — it needs a hosted Snowflake (no service container) and tester-supplied credentials via env vars (never committed). The **Microsoft Fabric** suite (`RUN_FABRIC_INTEGRATION=1`) is likewise opt-in against a live Fabric warehouse via Entra service principal; in CI it runs **manually only** (`workflow_dispatch`) with `FABRIC_*` GitHub Secrets, so it never blocks normal PRs and doubles as a clean-cloud reachability check.

---

## Reference
- Plan: `plans/external-data-sources.md`
- Engine: `packages/ExternalDataSources/Engine` · Drivers: `packages/ExternalDataSources/Providers/*`
- Router contract: `packages/MJCore/src/generic/externalDataSourceReadRouter.ts`
- Read-only base: `packages/MJCoreEntities/src/custom/ReadOnlyExternalBaseEntity.ts`
- Dispatch: `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`
