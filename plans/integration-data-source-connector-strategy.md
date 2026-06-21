# MJ Integration Framework — Data-Source Connector Strategy (Relational, Semi-Structured & Non-Relational)

**Status:** Proposed (design only — no code yet). Not for *now*, but on the near roadmap.
**Author:** drafted 2026-06-20
**Scope:** A complete strategy for pulling data FROM external **data stores** (relational databases, cloud data
warehouses, semi-structured file feeds, and non-relational/NoSQL stores) INTO MemberJunction — landing it in
whichever backend MJ itself runs on (SQL Server *or* Postgres). The **relational connector is the detailed first
deliverable** (Part A); the semi-structured and non-relational families (Parts B/C) are the same architecture
applied along a single distinguishing axis, sequenced in the unified roadmap (§7).

---

## 1. Problem & motivation

A common, mundane enterprise ask — especially in MJ's Microsoft-heavy association/nonprofit market — is *"connect
to my data and pull it in."* That data lives in many shapes: a legacy SQL Server with **no API**, a **read-replica
or data warehouse** (Snowflake/BigQuery), a nightly **XML/CSV file feed** dropped on SFTP, or a **MongoDB**. The
sync framework should treat all of these as first-class sources, exactly like a SaaS REST API — because to the
sync engine, every source is "discover a schema, pull records incrementally, land them as MJ entities."

Today only one of these exists, and skeletally: `packages/Integration/connectors/src/RelationalDBConnector.ts` —
SQL-Server-only, read-only, column-discovery-only (it throws away the constraint catalog the DB *declares*), no
bounded typing, and named as an "abstraction" while welded to `mssql`. This doc fixes that connector properly AND
sets the architecture so the other families are additive rather than one-offs.

## 2. Why this is NOT a `build-connector` (workshop) task — for ANY of these families

The connector-builder arc researches a **SaaS vendor's published API docs** and extracts a **per-vendor static
catalog** into metadata, then generates REST CRUD. Every data-store family below breaks that model the same way:

| build-connector (SaaS) | data-store families (this doc) |
|---|---|
| Research published API docs | No docs — the schema is the *customer's own data* |
| Extract a per-vendor static catalog | Schema **discovered at runtime** (catalog / schema-artifact / sampling) |
| Per-vendor connector code | **One** connector per *engine*, serving every customer of that engine |
| Guess PK/FK from bare-string fields | The store often **declares** PK/FK/types (relational, Cassandra, ES mappings) |
| Credential-gated live tier (broker) | A throwaway **Docker store *is* the vendor** — fully testable, no creds |

So this is normal hand-authored framework engineering — outside the workshop entirely. (The connector-builder
*rules* saying "`RelationalDBConnector` … do not exist" mean "don't invent a DB protocol base in the engine when
building a SaaS connector"; the real class lives in the connectors package and is unaffected.)

## 3. The unifying architecture — one spine, three discovery modes

### 3.1 The shared spine (every family converges here)

Every source family implements the **same `BaseIntegrationConnector` contract** (`TestConnection` /
`DiscoverObjects` / `DiscoverFields` / `FetchChanges`) and emits the **same neutral `ExternalFieldSchema`**, which
flows through the **already-built, dual-dialect** write side:

```
<any source>  →  neutral ExternalFieldSchema  →  TypeMapper.MapSourceType + @memberjunction/sql-dialect  →  target DDL
                  (DataType, MaxLength,            (NO platform === 'sqlserver' branching;                  (SQL Server
                   Precision, Scale, AllowsNull,    target = whichever MJ runs on)                            or Postgres)
                   IsPrimaryKey, IsForeignKey…)
```

`packages/Integration/schema-builder/src/TypeMapper.ts` already maps a neutral type to the target platform
(`string → NVARCHAR | VARCHAR`, `decimal → DECIMAL | NUMERIC`, `json → NVARCHAR(MAX) | JSONB`). **All new work is
on the READ side** — discovering the source's schema and normalizing native types into the neutral vocab. The
families differ ONLY in *how* the read side discovers schema.

### 3.2 The schema-discovery spectrum (the axis that distinguishes every family)

This is the intellectual backbone. A source's schema is knowable in exactly one of three ways, in descending
confidence — and this maps **directly** onto the framework's existing provable-only discipline + the three-case
discovery rule already in the connector conventions:

| Mode | Meaning | Confidence | Framework analogue |
|---|---|---|---|
| **Declared** | The store exposes a machine-readable catalog of its own schema (types, keys, constraints) | Highest — provable, no guessing | Relational `INFORMATION_SCHEMA`; case-2 runtime discovery |
| **Provided** | Schema lives in a separate artifact shipped with the data (XSD, JSON Schema, Avro/Parquet footer, ES mappings) | High — provable from the artifact | Static `Declared` metadata from a credential-free spec |
| **Inferred** | No schema anywhere — structure is knowable only by sampling the records | Low — sampled, flagged as inferred | Case-3 **custom-overflow capture** (`__mj_integration_CustomOverflow` → promotion) |

The payoff: **Inferred sources need NO new machinery** — they ride the framework's existing full-record
pass-through → overflow-capture → post-sync promotion. A schemaless MongoDB collection or a header-less CSV is
treated exactly like a SaaS connector's custom columns: capture everything, promote what materializes. So the
"scary" schemaless case is already solved; the connector just declares what it *can* prove and lets capture do
the rest.

### 3.3 The source-family taxonomy

| Family | Examples | Discovery mode | Part |
|---|---|---|---|
| **Relational / SQL** | SQL Server, Postgres, MySQL, Oracle, Db2, … | **Declared** (catalog) | A |
| **Cloud warehouse** | Snowflake, BigQuery, Redshift, Databricks, Synapse, ClickHouse | **Declared** (catalog) | A (extends relational) |
| **Self-describing files** | Parquet, Avro, ORC | **Provided** (embedded schema) | B |
| **Schema'd documents** | XML+XSD, JSON+JSON-Schema | **Provided** (artifact) | B |
| **Schemaless files** | CSV/TSV, bare JSON/JSONL | **Inferred** (sampling) | B |
| **Wide-column / search** | Cassandra (CQL), Elasticsearch/OpenSearch (mappings) | **Declared/Provided** | C |
| **Document stores** | MongoDB, CosmosDB, Couchbase | **Inferred** (+ validators if present) | C |
| **Key-value / graph** | DynamoDB, Redis, Neo4j | **Inferred / partial** | C |

Note the pleasant surprises: **Cassandra, Elasticsearch, Parquet/Avro are Declared/Provided**, not Inferred — so
several "NoSQL" sources are actually *high-confidence*, same tier as relational.

---

## PART A — Relational & warehouse connector (the detailed first deliverable)

### A.1 The engine universe (it is not "just 4")

3 engines already have drivers in-repo; several more **ride an existing driver via wire-compatibility**, so 3
drivers reach ~8 engines.

#### Traditional RDBMS
| Engine | Driver | In repo? | Catalog | Notes |
|---|---|---|---|---|
| **SQL Server** | `mssql` | ✅ (this connector) | `INFORMATION_SCHEMA` | Current path; refactor into a driver |
| **PostgreSQL** | `pg` | ✅ (PostgreSQLDataProvider, DBAutoDoc) | `INFORMATION_SCHEMA` / `pg_catalog` | |
| **MySQL / MariaDB** | `mysql2` | ✅ (DBAutoDoc) | `INFORMATION_SCHEMA` | Backtick quoting |
| **Oracle** | `oracledb` | ❌ new dep | `ALL_TABLES`/`ALL_TAB_COLUMNS`/`ALL_CONS_*` | No `INFORMATION_SCHEMA`; `FETCH FIRST` |
| **IBM Db2** | `ibm_db` | ❌ new dep | `SYSCAT.*` | Enterprise/legacy |
| **SQLite** | `better-sqlite3` | ❌ new dep | `sqlite_master`/`pragma` | Rarely an "external" DB; cheap |
| **SAP HANA** | `@sap/hana-client` | ❌ new dep | `SYS.*` | Enterprise |

#### Cloud data warehouses (strong "pull from my warehouse" demand)
| Engine | Driver | Notes |
|---|---|---|
| **Snowflake** | `snowflake-sdk` | Key-pair / SSO auth (own credential type) |
| **Google BigQuery** | `@google-cloud/bigquery` | Service-account auth, not user/pass |
| **Amazon Redshift** | `pg` (wire-compat) | **Rides the Postgres driver** |
| **Databricks SQL** | `@databricks/sql` | Delta/Lakehouse |
| **Azure Synapse** | `mssql`/TDS | Largely SQL-Server-shaped |
| **ClickHouse** | `@clickhouse/client` | Columnar OLAP |

#### Wire-compatible free-riders (no new driver)
- **Postgres wire** (`pg`): **Supabase**, **Neon**, Amazon Redshift, CockroachDB, YugabyteDB, AlloyDB, Aurora
  Postgres. *(Supabase is just hosted Postgres — it rides `pg` directly; its PostgREST API is a separate, optional path.)*
- **MySQL wire** (`mysql2`): Aurora MySQL, PlanetScale, MariaDB.

**The seam is the leverage:** one `pg` adapter unlocks ~7 targets; one `mssql` adapter covers SQL Server *and*
Synapse. Adding an engine is "one ~100-line driver," not "a new connector."

### A.2 The driver seam (the core new contract)

```ts
// packages/Integration/connectors/src/relational/IRelationalSourceDriver.ts
export interface IRelationalSourceDriver {
  connect(cfg: RelationalConnectionConfig): Promise<RelationalPool>;       // pool
  probe(pool: RelationalPool): Promise<{ version: string }>;               // TestConnection
  listTables(pool: RelationalPool, schema: string): Promise<RawTable[]>;   // DiscoverObjects
  listColumns(pool: RelationalPool, schema: string, table: string): Promise<RawColumn[]>;        // native type+precision+nullability
  listConstraints(pool: RelationalPool, schema: string, table: string): Promise<RawConstraints>; // PK/FK/unique the DB DECLARES
  mapNativeType(raw: RawColumn): NeutralFieldType;                         // native → neutral
  quoteIdent(name: string): string;                                        // [x] | "x" | `x`
  paginate(sql: string, offset: number, limit: number): string;           // TOP | LIMIT/OFFSET | FETCH FIRST
  watermarkExpr(field: string): string;                                    // dialect timestamp predicate
}
```

`RelationalDBConnector` becomes **engine-agnostic orchestration** that keeps its `BaseIntegrationConnector`
contract and pool cache but delegates every dialect-specific step to a driver selected from a new `Engine` field
in `CompanyIntegration.Configuration`:

```
TestConnection  → driver.probe
DiscoverObjects → driver.listTables                         → ExternalObjectSchema (SupportsWrite:false)
DiscoverFields  → driver.listColumns + driver.listConstraints
                  → ExternalFieldSchema { DataType:neutral, MaxLength, Precision, Scale, AllowsNull,
                                          IsPrimaryKey, IsUniqueKey, IsForeignKey, ForeignKeyTarget }
FetchChanges    → driver.paginate + driver.watermarkExpr (watermark/keyset loop)
```

### A.3 The neutral-type pipeline (source engine ≠ target engine is already solved)

```
Oracle NUMBER(10,2)
   │  READ  — driver.mapNativeType (per source engine: native → neutral)
   ▼
neutral 'decimal' (precision 10, scale 2)         — in ExternalFieldSchema
   │  WRITE — TypeMapper.MapSourceType + @memberjunction/sql-dialect (no platform branching)
   ▼
SQL Server DECIMAL(10,2)   — or —   Postgres NUMERIC(10,2)   (whichever MJ runs on)
```

The write side is built and dual-dialect; the only new work is the per-source-engine `mapNativeType` (today the
connector passes the raw SQL Server `DATA_TYPE` string straight through — no normalization to reuse).

### A.4 Reading the constraint catalog (biggest correctness win)

Provable-only jackpot — the DB *declares* its keys, so we read, never guess:

| | SQL Server / Postgres / MySQL (ANSI) | Oracle |
|---|---|---|
| **PK / unique** | `TABLE_CONSTRAINTS` + `KEY_COLUMN_USAGE` | `ALL_CONSTRAINTS` (P/U) + `ALL_CONS_COLUMNS` |
| **FK + target** | `REFERENTIAL_CONSTRAINTS` + `KEY_COLUMN_USAGE` | `ALL_CONSTRAINTS` (R) → referenced constraint |

Emit `IsPrimaryKey` only when the catalog declares a PK (not inferred from uniqueness), plus `IsUniqueKey`,
`IsForeignKey` + `ForeignKeyTarget` (referenced table → resolved to a sibling IO at persist). Same provable-only
discipline the framework already enforces — except the source's model is authoritative and complete.

### A.5 Bounded typing

Read `CHARACTER_MAXIMUM_LENGTH` / `NUMERIC_PRECISION` / `NUMERIC_SCALE` / `COLUMN_DEFAULT` (and Oracle's
`DATA_LENGTH`/`DATA_PRECISION`/`DATA_SCALE`) into `ExternalFieldSchema` so the target column is bounded
(`DECIMAL(10,2)`, `NVARCHAR(255)`) not `NVARCHAR(MAX)`. Null where the source states no size → schema builder
sizes generously.

### A.6 Config, credentials, discovery

- **Config** gains an `Engine` discriminator: `{ Engine, Server, Port, Database, User, Password, Schema }`. Target
  is per-`CompanyIntegration` runtime config (the connector dials whichever DB the customer configures).
- **Credential types** — a "Relational Database" type (host/port/db/user/password); warehouse engines that auth
  differently (BigQuery service account, Snowflake key-pair) get their own credential types.
- **NO static metadata files** — discovery is 100% runtime against the live schema. (The cleanest proof this is
  not a build-connector artifact.)
- **Pooling / multi-tenant** — pool keyed by `engine|server|database|user`; per-`CompanyIntegration` isolation.
  Audit the current `server|database`-only key for multi-tenant contamination in Phase 0.

### A.7 File layout

```
packages/Integration/connectors/src/
  RelationalDBConnector.ts                 # engine-agnostic orchestration (refactored)
  relational/
    IRelationalSourceDriver.ts             # the seam
    types.ts                               # RawTable/RawColumn/RawConstraints/NeutralFieldType/config
    SqlServerSourceDriver.ts               # mssql  (refactored out of today's connector)
    PostgresSourceDriver.ts                # pg     (+ Supabase/Neon/Redshift/Cockroach free-riders)
    MySqlSourceDriver.ts                   # mysql2
    drivers.ts                             # Engine → driver registry
    __tests__/                             # per-driver unit tests + fixtures
```

---

## PART B — Semi-structured / file-based family (sibling, not merged)

A separate connector family — **`StructuredFileConnector`** — under the same `BaseIntegrationConnector`,
emitting the same neutral schema. Merging it into the relational connector would *defeat* the relational
connector's purpose (which is to exploit the *declared catalog*); keeping it a sibling **protects** that purpose
and lets each family discover schema honestly.

### B.1 Format handlers (the read-side seam, analogous to the dialect driver)

| Format | Schema mode | Schema source | Notes |
|---|---|---|---|
| **Parquet / Avro / ORC** | **Provided** | Embedded footer/schema | Self-describing — typed + nullable; nearly as good as relational |
| **XML + XSD** | **Provided** | The XSD | Types/cardinality from the schema; flatten nested → tabular |
| **XML (no XSD)** | **Inferred** | Sample documents | Structure inferred from a sample window |
| **JSON + JSON-Schema** | **Provided** | The JSON Schema | |
| **JSON / JSONL (bare)** | **Inferred** | Sampling | Nested → flatten; arrays → child objects |
| **CSV / TSV** | **Inferred** | Header row + value sampling | Header = names; sample → types; no header → positional |

> **XML clarification (important):** XML-as-a-*wire-format* is already handled **inside REST/SOAP connectors**
> (`SageIntacctConnector`, `NetForumConnector`, `MagnetMailConnector` parse XML responses over HTTP). That is NOT
> this family. This family is XML-as-a-*data-source* — a file feed of XML documents (with or without an XSD). The
> two share an XML *parser* but nothing else; do not conflate them.

### B.2 Transport seam (where the files live)

Orthogonal to format — a small transport interface: **local FS**, **S3 / Azure Blob / GCS**, **SFTP**, **HTTP(S)
endpoint**. `DiscoverObjects` = enumerate files/globs (one object per file-pattern); `FetchChanges` = list new/
modified files since the watermark (by mtime/ETag) + stream-parse. Reuses the framework's keyset/watermark loop.

### B.3 Nested → relational flattening

The one genuinely new concern: semi-structured data is nested; MJ targets are tabular. Flatten deterministically
(declare flattened keys in `ExcludedSourceKeys` for the removed parents, per the full-record pass-through rule),
and route child collections to child IOs (FK back to parent) — exactly the access-path/descent pattern the
framework already uses for nested REST graphs.

---

## PART C — Non-relational / NoSQL family (sibling)

Same base, same neutral schema; per-engine connectors. The discovery mode varies — and several are higher
confidence than "NoSQL" implies:

| Engine | Driver | Discovery | Notes |
|---|---|---|---|
| **Cassandra / ScyllaDB** | `cassandra-driver` | **Declared** | CQL has a real typed schema + keys — relational-tier confidence |
| **Elasticsearch / OpenSearch** | `@elastic/elasticsearch` | **Provided** | Index *mappings* are a declared schema |
| **MongoDB** | `mongodb` | **Inferred** (+ `$jsonSchema` validator if present) | Sample collection → flatten; ride overflow-capture |
| **Azure Cosmos DB** | `@azure/cosmos` | **Inferred** | SQL-API documents |
| **Couchbase** | `couchbase` | **Inferred** | |
| **DynamoDB** | `@aws-sdk/client-dynamodb` | **Partial** (key schema declared; attrs inferred) | PK/SK declared; item attrs sampled |
| **Neo4j** | `neo4j-driver` | **Partial** | Node labels + rel types as objects |
| **Redis** | `ioredis` | **Inferred** | Key-pattern → object; limited |

The Inferred ones plug straight into the **custom-overflow capture + promotion** path — no new schema machinery,
just the connector declaring what it can prove and capturing the rest.

---

## 4. Testing strategy — the credential-free superpower (all families)

A data-store connector is the **one** connector class fully end-to-end testable with **zero credentials**, because
a throwaway **Docker store *is* the real vendor** — no secrets, no broker, no mock-vs-real gap. Every engine here
(SQL Server, Postgres, MySQL, Oracle-XE, Mongo, Cassandra, Elasticsearch, MinIO-for-S3) ships an official
container.

1. **Unit (pure):** each driver/format handler's SQL/parse generation (quoting, pagination, watermark predicate,
   native→neutral mapping, XSD/JSON-Schema → neutral, CSV inference) + constraint/mapping parsing from fixtures.
2. **Integration (containerized, credential-free):** spin the store, seed a typed+keyed schema, run
   TestConnection / Discover(objects+fields+constraints) / FetchChanges, assert real rowcounts and the recovered
   key graph.
3. **Cross-engine fidelity matrix:** seed each *source* with typed+keyed columns, pull into a SQL Server MJ target
   *and* a Postgres MJ target, assert types/keys/precision/nullability survived:

   | Source ↓ \ Target → | MJ on SQL Server | MJ on Postgres |
   |---|---|---|
   | SQL Server / Postgres / MySQL | ✓ | ✓ |
   | Oracle (Phase A2) | ✓ | ✓ |
   | Parquet / XML+XSD / CSV (Part B) | ✓ | ✓ |
   | Cassandra / Elasticsearch / Mongo (Part C) | ✓ | ✓ |

## 5. Unified roadmap / phasing

- **Phase A0 — relational seam + SQL Server parity (regression-safe).** Extract `IRelationalSourceDriver`; move
  the existing `mssql` code into `SqlServerSourceDriver` (behavior-identical); add constraint-reading + bounded
  typing; audit the pool key for multi-tenant isolation. Net new: PK/FK/unique emitted, columns bounded.
- **Phase A1 — Postgres + MySQL** (drivers in repo) + containerized matrix. Unlocks the Postgres-wire free-riders
  (Supabase, Neon, Redshift, Cockroach, Yugabyte, Aurora) with documented caveats.
- **Phase A2 — Oracle** (`oracledb` + `ALL_*` catalog) and the warehouse tier (Snowflake/BigQuery/Databricks/
  ClickHouse) as demand warrants.
- **Phase B — semi-structured `StructuredFileConnector`:** start with the Provided/self-describing formats
  (Parquet/Avro, XML+XSD, JSON+Schema — highest confidence), then the Inferred ones (CSV, bare JSON) on the
  overflow-capture path. Transport: local FS + S3 first.
- **Phase C — non-relational:** start with the Declared/Provided ones (Cassandra, Elasticsearch — relational-tier
  confidence), then MongoDB on the capture path.
- **Cross-cutting (any phase):** write-back is a separate, later feature (see non-goals).

## 6. Scope boundaries / non-goals

- **Read-only for v1** across all families (`SupportsWrite: false`). Writing back into a customer's store mutates
  a system MJ doesn't own — a separate, riskier feature, explicitly out of scope here.
- **No store-specific query semantics** in v1 (warehouse clustering keys, ES relevance scoring, graph traversal
  beyond node/edge extraction) beyond basic read + watermark.
- **XML-as-wire-format stays in the REST/SOAP connectors** — not migrated into the file family.
- **Inference is always flagged, never claimed as declared.** An Inferred-mode field carries lower confidence and
  leans on overflow-capture; we never present a sampled schema as if the source declared it (the provable-only
  honesty rule).

## 7. Open questions / risks

1. **Reuse `@memberjunction/sql-dialect` for quoting/pagination?** It already resolves abstract types per
   platform; confirm whether it also exposes identifier-quoting/pagination so drivers reuse rather than duplicate.
2. **Multi-tenant pool key.** Current `server|database` may collide across tenants/credentials — widen to include
   user (and tenant) in Phase A0.
3. **Watermark column discovery.** Which source column is the incremental cursor (`ModifiedDate`/`rowversion`/
   `ora_rowscn`/file mtime/ES `@timestamp`)? Per-engine + per-object config; fall back to keyset on the PK.
4. **Type edge cases (the hard part).** Oracle `NUMBER` no-scale (int vs float?), Oracle `DATE` = datetime, MySQL
   `UNSIGNED`, `BLOB`/`CLOB`, timezones, SQL Server `rowversion`, Mongo mixed-type fields, CSV numeric-vs-string.
   Each handler's `mapNativeType` needs deliberate decisions + dedicated fidelity tests.
5. **Very wide / very large sources.** Reuse keyset pagination + the materializability scoping gate (dialect
   column limits) so a 1000-column source table (or a deeply-nested document flattened to 1000 columns) is scoped,
   not crashed.
6. **Auth diversity in warehouses/cloud.** BigQuery (service account), Snowflake (key-pair), DynamoDB/S3 (IAM) do
   not fit user/password — each needs its own credential type + the broker boundary.
```
