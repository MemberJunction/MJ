# Medallion Architecture Consumption — Microsoft Fabric + Databricks External Data Source Support

**Status:** Proposed
**Depends on:** External Data Sources primitive (shipped v5.45 — see [guides/EXTERNAL_DATA_SOURCES_GUIDE.md](../guides/EXTERNAL_DATA_SOURCES_GUIDE.md))
**Related:** [plans/external-data-sources.md](external-data-sources.md), Integrations pull-sync (`packages/Integration/`), [plans/query-entity-materialization.md](query-entity-materialization.md)

---

## 1. Why

Customers who have invested in a **medallion lakehouse** (bronze = raw, silver = conformed, gold = business-curated) already have a clean, governed data model — their **gold layer**. MJ's External Data Sources primitive was built for exactly this shape of problem: surface remote data **live and read-only** through MJ entities and queries, no replication, with the medallion remaining the source of truth and MJ acting as the **consumption and application layer** (Explorer, agents, workflows, Record Processes).

The strategic positioning per medallion layer:

| Medallion layer | MJ mechanism | Notes |
|---|---|---|
| **Gold** tables | External Data Source **entities** (live `RunView`/`Load`) | The default. CodeGen introspects the remote schema and provisions `EntityField` rows automatically. |
| **Gold** aggregates | External MJ **Queries** (`RunQuery`, remote dialect) | External `RunView` hard-fails on `Aggregates` by design; saved Queries carry the analytics. |
| Gold/silver slices needing MJ-native joins, RLS, or write-back workflows | **Integrations pull-sync** (`RelationalDBConnector` family) | Watermark incrementals + content-hash diffing; the copy lives in MJ. |
| Bronze | *Never touched by MJ* | Raw landings are pipeline territory. |
| MJ → medallion (return path) | Customer's own ingestion (Fabric mirroring / ADF / Lakeflow) lands the MJ DB into **bronze** | MJ never writes to the lakehouse directly — deliberate (read-only guarantee). |

Today the shipped driver catalog covers PostgreSQL, SQL Server, MySQL, Oracle, Snowflake, and MongoDB. A Snowflake-based medallion works **now**. The two dominant Microsoft-ecosystem medallion platforms do not:

1. **Microsoft Fabric** (lakehouse SQL analytics endpoint / Fabric Warehouse) — speaks **TDS** (SQL Server wire protocol), so our `mssql`-based driver is protocol-compatible, but Fabric **refuses SQL authentication**: only Microsoft Entra ID (service principal) is accepted. Our SQL Server driver currently only does username/password.
2. **Azure Databricks / Databricks** (SQL warehouse) — needs a **new driver** over the `@databricks/sql` Node SDK.

This plan covers both, plus the vendor test environments and sample datasets we validate against.

---

## 2. Workstream A — Microsoft Fabric SQL endpoint support (extend the SQL Server driver)

**Shape:** no new driver. Extend `SQLServerExternalDataSourceDriver` with an Entra service-principal auth mode and seed a new `ExternalDataSourceType` metadata row that reuses the same `DriverClass`. The `mssql`/tedious stack natively supports `authentication: { type: 'azure-active-directory-service-principal-secret' }`, so this is an auth-plumbing change, not a protocol change.

### A1. Credential type (metadata)

New `MJ: Credential Types` row **"Azure Service Principal"** in `metadata/credential-types/` with a `@file:` schema (`schemas/azure-service-principal.schema.json`):

```json
{ "tenantId": "...", "clientId": "...", "clientSecret": "..." }
```

All three live in the credential (encrypted at rest via `CredentialEngine`), mirroring the DocuSign JWT precedent of keeping the full auth identity in one credential record. `clientSecret` is the only true secret, but co-locating tenant/client IDs keeps `ConnectionConfig` purely topological (host/port/pool).

### A2. Driver changes (`packages/ExternalDataSources/Providers/SQLServer/src/SQLServerExternalDataSourceDriver.ts`)

- **`SQLServerConnectionConfig`**: add `authMode?: 'sql' | 'entra-service-principal'` (default `'sql'` — fully backward-compatible; existing sources are untouched).
- **`SQLServerCredentialValues`**: widen to a union-ish optional shape — `username`/`password` (SQL auth) or `tenantId`/`clientId`/`clientSecret` (Entra). Auth mode is inferred from `authMode`, falling back to "Entra if `clientId` present, else SQL" so a correctly-shaped credential Just Works.
- **`createPool()`**: when Entra mode, build the mssql config with

  ```ts
  authentication: {
    type: 'azure-active-directory-service-principal-secret',
    options: { clientId, clientSecret, tenantId },
  }
  ```

  instead of `user`/`password`, and **force `options.encrypt = true`** (Fabric endpoints are TLS-only; silently honoring `ssl: false` would just produce a confusing connect failure). `assertSecureTransport` passes trivially since TLS is on.
- **`isAuthError()`**: extend the retryable-auth-failure detection with AAD token signatures (`AADSTS` error codes, "token is expired", "failed to authenticate the service principal") so the base class's rotated-credential **self-heal** works for expired client secrets exactly as it does for rotated passwords.
- **Introspection**: `INFORMATION_SCHEMA` works on both the lakehouse SQL analytics endpoint and Fabric Warehouse. Two graceful-degradation points:
  - The **lakehouse endpoint** exposes no enforced PK/FK constraints (Delta tables); the Warehouse supports *informational* (`NOT ENFORCED`) PK/FK. The existing `sys.*` FK introspection must tolerate empty results (it already returns empty `Relationships` when nothing is found — verify, don't assume).
  - Fabric endpoints are **case-sensitive** (`Latin1_General_100_BIN2_UTF8` collation) — object/column names must be matched exactly. Our identifier handling is already quote-and-pass-through, so this is a docs/verification item, not a code change.

### A3. Type row (metadata)

New row in `metadata/external-data-source-types/.external-data-source-types.json`:

```
Name: "Microsoft Fabric SQL Endpoint (External)"
DriverClass: "SQLServerExternalDriver"       ← same driver, different type row
MetadataIntrospectionStrategy: "InformationSchema"
FilterDialect: "tsql"
PagingStrategy: "OffsetFetch"
SupportsSchemaIntrospection: true, SupportsNativeQueries: true, SupportsReadWrite: false
Status: "Active"                              ← only in the same release the auth mode ships
```

(Hardcoded UUID per metadata conventions; `RequiredCredentialTypeID` → the new Azure Service Principal credential type.)

### A4. Known Fabric caveats to document in the guide

- **Endpoint metadata-sync lag**: the lakehouse SQL analytics endpoint discovers new Delta tables asynchronously; a just-written gold table can lag by seconds-to-minutes. Irrelevant for steady-state gold consumption, worth a sentence in the guide.
- **Tenant prerequisites**: Fabric admin must enable *"Service principals can use Fabric APIs"*; the SPN needs workspace (Viewer is sufficient for reads) or item-level access.
- **Capacity billing**: every query consumes Fabric capacity units. The existing external-read row caps (default 1,000 / hard 50,000) and TTL cache (default 300s) are the cost governors; reiterate the least-privilege, read-only SPN guidance — the source credential is load-bearing on the subquery-filter and native-query paths.

**Estimate:** 2–3 days including unit tests + the gated integration suite (A6 below).

---

## 3. Workstream B — Databricks SQL warehouse driver (new package)

**Shape:** new sibling provider package, closely modeled on the Snowflake driver (the other "cloud warehouse behind an HTTPS SDK" driver — 518 lines including precision handling).

### B1. Package

`packages/ExternalDataSources/Providers/Databricks` → `@memberjunction/external-data-source-databricks`

- `DatabricksExternalDataSourceDriver extends BaseSqlExternalDataSourceDriver<TSession>`, registered `@RegisterClass(BaseExternalDataSourceDriver, 'DatabricksExternalDriver')`.
- SDK **`@databricks/sql`** as an **optional peer dependency loaded via dynamic import** — same justified pattern as `snowflake-sdk` (CLAUDE.md dynamic-import category 2: optional cloud SDK loaded only when the provider is configured; declared in `peerDependenciesMeta` as optional).
- Standard provider scaffolding: `index.ts`, `vitest.config.ts`, unit tests with a mocked SDK, gated integration test (B5).

### B2. Dialect surface (the genuinely new code)

| Concern | Implementation |
|---|---|
| Identifier quoting | `` `backticks` `` (like MySQL) |
| Paging | `LIMIT n OFFSET m` → `PagingStrategy: 'LimitOffset'` |
| Filter dialect | `ansi` (Databricks SQL is ANSI-conformant; same choice as Snowflake) |
| Read-only screen | inherited `sqlReadOnlyScreen` with the default `'ansi'` parse key |
| Transport | always HTTPS via the SDK — skip `assertSecureTransport` (Snowflake precedent) |

### B3. Connection & auth

- **`ConnectionConfig`** (non-secret): `serverHostname`, `httpPath` (the SQL warehouse's HTTP path), optional `catalog`, session/pool sizing. Mapping: `ExternalDataSource.DefaultDatabase` → Unity Catalog **catalog**, `DefaultSchema` → **schema** (mirrors how Snowflake maps database/schema).
- **Credential shapes** (via `CredentialEngine`, mirroring Snowflake's multi-mode credential):
  - **PAT**: `{ token }` → SDK `authType: 'access-token'` (works everywhere, including trials; the near-term default).
  - **OAuth M2M (service principal)**: `{ clientId, clientSecret }` → SDK `authType: 'databricks-oauth'` (the production-grade recommendation; requires a real account, not Free Edition).
- **Connection caching**: one client/session per `ExternalDataSource.ID` with the race-safe in-flight-promise cache (copy the SQL Server/Snowflake pattern), `invalidateConnection` with identity guard, `isAuthError` matching 401/`Invalid access token`/OAuth token-expiry signatures so credential rotation self-heals.

### B4. Introspection & fidelity

- **Schema**: Unity Catalog `information_schema` (`<catalog>.information_schema.tables/columns`) — standard `InformationSchema` strategy.
- **Relationships**: Unity Catalog supports **informational PK/FK constraints** (`table_constraints` / `key_column_usage`). Import them when present (managed UC tables often have them on curated gold models); return empty `Relationships` when absent — never guess. This gives Databricks better relationship fidelity than Snowflake (whose catalog FKs we deliberately skip as unreliable).
- **Numeric fidelity**: `DECIMAL` columns risk 2^53 precision loss depending on SDK result marshalling — verify against the SDK's Arrow/JSON paths and apply the Snowflake remedy (CAST-to-string projection for high-precision decimals in structured reads) if needed.
- **Type mapping**: Delta/Spark types (`STRING`, `TIMESTAMP`, `DECIMAL(p,s)`, `ARRAY`/`MAP`/`STRUCT`) → MJ types; complex types surface as JSON strings via the inherited `normalizeRows()`.

### B5. Type row (metadata)

```
Name: "Databricks SQL Warehouse (External)"
DriverClass: "DatabricksExternalDriver"
MetadataIntrospectionStrategy: "InformationSchema"
FilterDialect: "ansi"
PagingStrategy: "LimitOffset"
SupportsSchemaIntrospection: true, SupportsNativeQueries: true, SupportsReadWrite: false
Status: "Active"                              ← only once the driver ships (no Draft status exists)
```

Credential type: reuse the PAT shape via a new **"Databricks Access Token"** credential type (or generic API-key type if the schema fits) + the OAuth2 Client Credentials type for M2M.

**Estimate:** 1–2 weeks including tests. The scaffolded base absorbs SELECT building, PK WHERE, FK grouping, read-only screening, value normalization, credential resolution, and auth-retry; the novel work is the SDK session lifecycle, introspection queries, and decimal verification.

---

## 4. Vendor test environments & sample datasets

Both vendors provide free environments **with built-in sample data**, so integration tests need zero seeding on the read path.

### 4.1 Databricks

| Environment | Cost | What we get | Auth available |
|---|---|---|---|
| **Databricks Free Edition** ([limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations)) | Free (non-commercial use) | Serverless-only workspace incl. a **serverless SQL warehouse** and Unity Catalog | Email OTP / Google / Microsoft sign-in; **no account console → no service principals**, so **PAT is the path here** (verify PAT issuance is enabled in Free Edition during implementation — if not, fall back to the trial below) |
| **Azure Databricks / AWS 14-day trial** | Free 14 days (cloud infra may bill) | Full workspace | PAT **and** OAuth M2M service principals — required to exercise the `databricks-oauth` path |

**Sample data (pre-provisioned, read-only, in every workspace):** the **`samples`** catalog —

- `samples.nyctaxi.trips` — NYC taxi trip records (the canonical connectivity/read test)
- `samples.tpch.*` — TPC-H tables (`orders`, `lineitem`, `customer`, …) — multi-table, typed, **great for join-bearing external Queries and paging tests**

Because `samples` is read-only and universally present, the **integration suite reads it directly — no fixture seeding, inherently self-cleaning**. This is *better* than the Snowflake suite (which must seed its own objects). Constraint-introspection coverage (UC informational PK/FK) does need a writable schema, so that sub-suite creates + drops its own schema in the workspace catalog, tagged `(mj-integration-test — safe to delete)` per suite conventions.

**Gating:** `RUN_DATABRICKS_INTEGRATION=1` + env vars (`DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN` or client id/secret) — opt-in like Snowflake (no service container exists for Databricks; a hosted workspace is required). Register in `.github/workflows/eds-integration.yml` as the opt-in tier.

### 4.2 Microsoft Fabric

| Environment | Cost | What we get |
|---|---|---|
| **Fabric trial capacity** | Free **60 days** (needs a Microsoft Entra tenant; a free Power BI / Fabric-free license is enough to activate) | Full workspace: lakehouses, warehouses, SQL analytics endpoints |

**Sample data (built into the product):**

- **Warehouse → "Use sample database"** — loads a **Wide World Importers** sample warehouse in one click. Exercises the Warehouse flavor of the endpoint incl. informational PK/FK introspection.
- **Lakehouse end-to-end tutorial dataset** — Wide World Importers loaded into a lakehouse ([tutorial](https://learn.microsoft.com/en-us/fabric/data-engineering/tutorial-lakehouse-introduction)); its **SQL analytics endpoint** is the exact surface a medallion gold layer exposes. This is the primary target: it also validates the endpoint's Delta-table metadata-sync behavior.
- **Copy-Data "NYC Taxi – Green" sample** — one-pipeline ingestion into a lakehouse when we want a large single table for paging/row-cap tests.

**SPN test setup (one-time, scripted in the suite README):**
1. Entra app registration → tenant ID / client ID / client secret.
2. Fabric admin portal → enable *"Service principals can use Fabric APIs"*.
3. Add the SPN to the test workspace (Viewer role — deliberately least-privilege, mirroring the guidance we give customers).
4. Copy the SQL connection string from the lakehouse SQL analytics endpoint / warehouse settings.

**Gating:** `RUN_FABRIC_INTEGRATION=1` + env vars (`FABRIC_SQL_ENDPOINT`, `FABRIC_DATABASE`, `FABRIC_TENANT_ID`, `FABRIC_CLIENT_ID`, `FABRIC_CLIENT_SECRET`). Opt-in with tester-supplied credentials, same model as Snowflake. The suite is read-only against the sample WWI tables (no seeding, no cleanup), plus a negative test asserting SQL-auth is correctly rejected and a clear error surfaces.

**Trial-expiry note:** the Fabric trial is 60 days (extendable workspaces vary); the suite must stay opt-in and never become a required CI gate tied to a perishable environment. Long-term we can move test capacity to a paid F2 (smallest SKU) if we want scheduled coverage.

### 4.3 Snowflake (already covered)

No new work — the shipped `SnowflakeExternalDriver` + its opt-in suite (`RUN_SNOWFLAKE_INTEGRATION=1`) already covers Snowflake-based medallions. Mentioned for completeness in customer conversations.

---

## 5. Test plan

1. **Unit tests** (default gate, DB-free): mocked SDK/mssql — auth-config construction for each mode (SQL vs Entra SP; PAT vs OAuth M2M), `isAuthError` classification, quoting/paging clause generation, config parsing, credential-shape inference. Vitest, standard scaffold.
2. **Integration suites** (opt-in env-gated, per §4): connectivity (`TestConnection`), `IntrospectSchema` (incl. constraint presence/absence handling), `RunView` with filter/order/paging against sample tables, `LoadSingle` by PK, `RunNativeQuery` (a TPC-H / WWI join), read-only screen rejection of a write statement, auth self-heal (invalidate + retry path), row-cap enforcement.
3. **CodeGen verification**: point a scratch entity at `samples.nyctaxi.trips` (Databricks) and a WWI table (Fabric), run `mj codegen`, confirm `manageExternalEntities` provisions `EntityField` rows and (Fabric Warehouse / UC where constraints exist) relationships.
4. **Deterministic integration tier** (`npm run test:integration`): add deterministic, credential-free cases where possible (driver registration resolves via ClassFactory, type rows load, config validation errors are clear) so the required tier gains coverage without live credentials.

---

## 6. Delivery phases

| Phase | Scope | Estimate |
|---|---|---|
| **1** | Fabric: Entra SP auth mode in SQL Server driver + credential type + type row + unit tests + `RUN_FABRIC_INTEGRATION` suite + guide updates | 2–3 days |
| **2** | Databricks: new provider package + type/credential rows + unit tests + `RUN_DATABRICKS_INTEGRATION` suite (samples-catalog based) + guide updates | 1–2 weeks |
| **3** | Docs/enablement: EXTERNAL_DATA_SOURCES_GUIDE driver-table rows, medallion positioning section (the layer-mapping table from §1), suite READMEs with the vendor environment setup recipes from §4 | 1–2 days, overlaps 1–2 |

Phases 1 and 2 are independent — parallelizable.

---

## 7. Risks & open questions

- **Free Edition PAT availability** — Databricks Free Edition docs don't explicitly confirm PAT issuance; if unavailable, dev/integration testing moves to the 14-day full trial (which also unlocks the OAuth M2M path we need to test anyway). Resolve in the first day of Phase 2.
- **Fabric endpoint quirks** — case-sensitive collation, Delta metadata-sync lag, and lakehouse-endpoint `sys.*` catalog coverage need empirical verification; the plan assumes graceful degradation paths already in the driver but Phase 1 must confirm.
- **`@databricks/sql` result marshalling** — decimal precision and Arrow-vs-JSON paths need a spike before committing to the fidelity approach (§B4).
- **Metered-compute cost in agent loops** — server-side external `RunView` results are not yet TTL-cached (documented follow-up in the guide). Both Fabric CUs and Databricks DBUs make this more acute; the row caps bound worst-case cost, but the server-side cache follow-up rises in priority once these drivers ship.
- **Trial perishability** — both vendor environments are trial-bound; suites stay opt-in (never required CI) until/unless we fund a small persistent capacity.

## 8. References

- [Fabric medallion lakehouse architecture](https://learn.microsoft.com/en-us/fabric/onelake/onelake-medallion-lakehouse-architecture)
- [Fabric warehouse connectivity (TDS)](https://learn.microsoft.com/en-us/fabric/data-warehouse/connectivity) · [Entra ID authentication](https://learn.microsoft.com/en-us/fabric/data-warehouse/entra-id-authentication) · [Service principals in Fabric DW](https://learn.microsoft.com/en-us/fabric/data-warehouse/service-principals)
- [Fabric lakehouse end-to-end tutorial (WWI sample)](https://learn.microsoft.com/en-us/fabric/data-engineering/tutorial-lakehouse-introduction) · [SQL analytics endpoint use cases](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-sql-analytics-endpoint-use-cases)
- [Databricks medallion architecture](https://learn.microsoft.com/en-us/azure/databricks/lakehouse/medallion) · [Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations) · [Databricks SQL samples catalog usage](https://docs.databricks.com/aws/en/dev-tools/python-sql-connector)
- MJ: [guides/EXTERNAL_DATA_SOURCES_GUIDE.md](../guides/EXTERNAL_DATA_SOURCES_GUIDE.md) · `packages/ExternalDataSources/Engine` · `packages/ExternalDataSources/Providers/{SQLServer,Snowflake}` (reference implementations)
