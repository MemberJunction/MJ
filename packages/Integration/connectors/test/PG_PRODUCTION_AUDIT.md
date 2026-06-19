# PostgreSQL / AWS Aurora RDS Production Readiness Audit

**Date:** 2026-06-17  
**Branch:** connectors/integration-v2-unified  
**Scope:** MemberJunction integration framework (`packages/Integration/`) — read-only architecture audit  
**Methodology:** Pure file reading + grep; no servers started, no migrations run, no code modified

---

## Q1 — PostgreSQL Dialect Coverage

**Verdict: ✅ SOLID with one minor naming artifact**

### DDLGenerator — `packages/Integration/schema-builder/src/DDLGenerator.ts`

The generator has clean, exhaustive `platform === 'sqlserver'` / `platform === 'postgresql'` branching throughout:

- **Line 44-52:** `switch(platform)` with explicit `never` default for `GenerateIdempotentCreateTableStatement`. Both branches fully handled; unreachable default asserts exhaustiveness.
- **Lines 108-179:** `GenerateExtendedProperties` / `GuardExtendedProperty` call `sys.fn_listextendedproperty` (SQL Server metadata). Correctly guarded at **line 74** with `if (platform === 'sqlserver')` — PG path skips SS-only extended properties entirely.
- **Lines 241-264:** PG ALTER COLUMN wraps in a `DO $mj_dropviews$ ... $mj_dropviews$` anonymous block to drop and re-create dependent views — this is the Bug 5a fix specifically for PostgreSQL column type evolution.
- **Lines 48-52:** Comment text says "NVARCHAR(450)" as context but the actual PK string cap is computed via `dialect.MaxKeyStringLength` from the `SQLDialect` abstraction — dialect-aware, not hardcoded.

`StandardColumns` correctly emits:
| Concept | SQL Server | PostgreSQL |
|---|---|---|
| Short string | `NVARCHAR(50)` | `VARCHAR(50)` |
| Timestamp | `DATETIMEOFFSET` | `TIMESTAMPTZ` |
| Boolean | `BIT` | `BOOLEAN` |

### TypeMapper — `packages/Integration/schema-builder/src/TypeMapper.ts`

No platform branching in the mapper itself — fully delegates to `GetDialect(platform).ResolveAbstractType()`. The TYPE_MAP (lines 13-26) correctly maps abstract types to dialect-specific SQL via the dialect registry. `MaxKeyStringLength` for PK string caps is consumed from `dialect.MaxKeyStringLength`, not hardcoded.

### IntegrationEngine raw SQL — `packages/Integration/engine/src/IntegrationEngine.ts`

All raw SQL uses the provider's dialect for quoting:

- **Line 2956-2964:** `const dialect = provider.Dialect; const table = dialect.QuoteIdentifier(...)` — UPDATE statement is dialect-safe
- **Lines 4029-4033:** DELETE/SELECT pruning likewise uses `provider.Dialect` for quoting
- **Line 3439:** Code comment explicitly notes: "Plain (unbracketed) identifiers → dialect-agnostic (SS brackets break Postgres)"

### CustomColumnPromoter — `packages/MJServer/src/integration/CustomColumnPromoter.ts`

- **Line 319:** `const platform = this.dbProvider.PlatformKey as DatabasePlatform;`
- **Line 351:** `TargetSqlType: platform === 'sqlserver' ? inferred.SqlServerType : inferred.PostgresType`

The `InferredColumnType` interface in `packages/Integration/engine/src/CustomColumnPromotion.ts` carries both `SqlServerType` and `PostgresType` for every inference, and the promoter correctly picks the right one at runtime.

### Minor artifact (not a bug)
DDLGenerator.ts line 48 has a comment `// NVARCHAR(450) cap` — this is documentation of the SS PK cap concept, but the actual enforcement is via `dialect.MaxKeyStringLength`. Not a dialect-safety issue.

---

## Q2 — Per-Tenant Credential Provisioning

**Verdict: ✅ CLEAN — fully per-CompanyIntegration, nothing hardcoded**

### IntegrationCreateConnection mutation — `packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts`

The `IntegrationCreateConnection` GraphQL mutation at line ~2491:
1. Creates a new `MJ: Credentials` record with `input.CredentialValues` (customer-supplied JSON)
2. Creates a `CompanyIntegration` record linked via `ci.CredentialID = credentialID`

This means every customer gets their own `Credentials` row. There is no shared or global credential used by the engine at runtime.

### OAuth2TokenManager — `packages/Integration/engine/src/auth-helpers/OAuth2TokenManager.ts`

- `OAuth2TokenRequest` interface (lines 31-58) requires `ClientId`, `ClientSecret` as runtime parameters — never read from process environment or a constant
- `GetAccessToken(req, grant)` at line 107 accepts the full credential set per-call
- In-memory token cache (`private cached: OAuth2Token | null = null`, line 97) is per-instance, not shared across tenants
- `Reset()` method at line 122 clears the cache when config changes — correct for reconnect scenarios

### Schema isolation

`deriveSchemaName()` at IntegrationDiscoveryResolver.ts line ~3422:
```ts
return (integrationName || 'integration').toLowerCase().replace(/[^a-z0-9_]/g, '_')
```
Integration schema names are derived from the integration name, not hardcoded to `dbo` or any fixed schema. On PostgreSQL this means each integration gets its own schema (e.g. `hubspot`, `salesforce`, `netsuite`) independent of the search path.

### No hardcoded credentials found

Grep across the entire `packages/Integration/` tree for hardcoded secrets (`api_key`, `client_secret`, `bearer_token` as string literals) found none. All auth helpers (`APIKeyHeaderBuilder`, `HMACSigner`, `OAuth2TokenManager`) accept credentials as runtime parameters from the caller.

---

## Q3 — Aurora RDS Specifics

### SSL/TLS — ⚠️ GAP: defaults to OFF

**`packages/PostgreSQLDataProvider/src/pgConnectionManager.ts`, line 85:**
```ts
ssl: config.SSL ?? false
```

`PGConnectionConfig.SSL` is optional (`SSL?: boolean | pg.ConnectionConfig['ssl']`). When not configured, SSL defaults to `false`. AWS Aurora PostgreSQL requires SSL connections by default for security compliance — connecting without SSL will either be rejected by the Aurora parameter group (`rds.force_ssl=1`) or succeed over an unencrypted channel (a security violation).

**Fix required:** In `mj.config.cjs`, add `ssl: true` (or an SSL config object with `rejectUnauthorized: false` for self-signed certs during dev) to the PG connection settings. For Aurora, the Aurora CA certificate bundle should be provided as `ca:`.

Current `mj.config.cjs` has `dbTrustServerCertificate` for SQL Server but no PG SSL equivalent — this must be added before production deployment.

### UUID comparison — ✅ CORRECT throughout

SQL Server returns UUIDs uppercase; PostgreSQL returns lowercase. The integration engine consistently uses `UUIDsEqual()` from `@memberjunction/global` for all identity comparisons:

- `packages/Integration/engine/src/IntegrationEngine.ts` line 2: `import { UUIDsEqual } from '@memberjunction/global'`
- Line 741: `UUIDsEqual(i.ID, companyIntegration.IntegrationID)` — integration lookup
- `packages/Integration/engine-base/src/IntegrationEngineBase.ts`: all `.find()` calls use `UUIDsEqual`
- `packages/Integration/engine/src/BaseRESTIntegrationConnector.ts` lines 808, 1239: FK resolution uses `UUIDsEqual`

No raw `===` UUID comparisons found in the integration code paths.

### Transaction handling — ✅ CORRECT

`packages/Integration/engine/src/IntegrationEngine.ts` lines 2845-2878: explicit `BeginTransaction` → work → `CommitTransaction` with `catch` block calling `RollbackTransaction`. The transaction abstraction delegates to the provider's dialect-appropriate implementation.

Aurora Aurora reader/writer endpoint routing is transparent to the application layer since the engine uses MJAPI's configured connection pool.

### Schema privileges — ✅ CLEAN

Integration schemas are created via `SchemaBuilder` DDL at runtime (`CREATE SCHEMA IF NOT EXISTS <name>`). The PG user running MJAPI needs `CREATE` privilege on the database plus DDL rights in the integration schema. This is a deployment-time grant requirement, not a code defect. The schema name derivation avoids reserved words via the sanitize regex in `deriveSchemaName()`.

### Aurora-specific connection pooling — ⚠️ NOTE

`PGConnectionManager` uses `pg.Pool`. Aurora has a maximum connection limit per instance class. The `mj.config.cjs` `databaseSettings.connectionPool.max` setting (default 50) should be reviewed against the Aurora instance class's `max_connections` parameter. For Aurora `db.t3.medium` (96 connections), `max: 50` is reasonable but leaves little headroom for multiple app instances. For production, Aurora Serverless v2 or a Proxy (RDS Proxy) is recommended to handle connection multiplexing.

---

## Q4 — Known PostgreSQL Gaps

### ❌ BLOCKER 1: Missing PG migration for DeclaredIntent columns (v5.41.x)

**SS migration:** `migrations/v5/V202606171600__v5.41.x__Integration_DeclaredIntent_Columns.sql`  
**PG migration:** **DOES NOT EXIST** — `migrations-pg/v5/` has no equivalent

This migration adds to `IntegrationObject`:
- `SupportsCreate BIT NOT NULL DEFAULT 0`
- `SupportsUpdate BIT NOT NULL DEFAULT 0`
- `SupportsDelete BIT NOT NULL DEFAULT 0`
- `SyncStrategy NVARCHAR(50) NULL`
- `ContentHashApplicable BIT NOT NULL DEFAULT 0`
- `StableOrderingKey NVARCHAR(255) NULL`

And adds to `Integration`:
- `Configuration NVARCHAR(MAX) NULL`

These columns are:
1. Present in `packages/MJCoreEntities/src/generated/entity_subclasses.ts` as typed properties
2. Actively used in `packages/Integration/engine/src/IntegrationEngine.ts` (capability gating for Create/Update/Delete operations)
3. Used in `packages/Integration/connectors-registry/` connector capability declarations

Without this migration on PG, `BaseEntity.SetLocal` silently drops these fields on save — connector capability flags will not persist, and sync operations that check `SupportsCreate`/`SupportsDelete` will see `undefined` (falsy), disabling write-path operations silently.

**Resolution:** Author `migrations-pg/v5/V202606171600__v5.41.x__Integration_DeclaredIntent_Columns.pg.sql` translating `BIT` → `BOOLEAN`, `NVARCHAR(50)` → `VARCHAR(50)`, `NVARCHAR(MAX)` → `TEXT`.

---

### ❌ BLOCKER 2: Missing PG migration for RecordMap identity index (v5.41.x)

**SS migration:** `migrations/v5/V202606130000__v5.41.x__Integration_RecordMap_Identity_Index.sql`  
**PG migration:** **DOES NOT EXIST**

This creates:
```sql
CREATE UNIQUE INDEX IDX_CompanyIntegrationRecordMap_Identity
ON CompanyIntegrationRecordMap (CompanyIntegrationID, EntityID, ExternalSystemRecordID);
```

This composite index is the primary lookup path for every sync record dedup and upsert-by-identity operation. Without it, every sync run performs a full table scan on `CompanyIntegrationRecordMap`. At production scale (millions of rows), this is a severe performance regression — sync operations that take seconds on SS will take minutes on PG.

**Resolution:** Author `migrations-pg/v5/V202606130000__v5.41.x__Integration_RecordMap_Identity_Index.pg.sql` with the same `CREATE UNIQUE INDEX` (PG syntax is identical here).

---

### ❌ BLOCKER 3: V202603080719 left CompanyIntegration tables with missing columns on PG

**Source:** `migrations-pg/PG_MIGRATION_REPORT.md` (generated 2026-03-12)

The V202603080719 migration left PG CompanyIntegration tables short versus SQL Server:

| Table | SS cols | PG cols | Missing |
|---|---|---|---|
| `CompanyIntegration` | 29 | 25 | 4 scheduling/lock columns |
| `CompanyIntegrationEntityMap` | 15 | 13 | 2 columns |
| `CompanyIntegrationFieldMap` | 15 | 13 | 2 columns |
| `CompanyIntegrationSyncWatermark` | 9 | 7 | 2 columns |
| `IntegrationSourceType` | 8 | 6 | 2 columns |

The specific missing columns include scheduling orchestration fields and optimistic-lock fields used by the sync engine. Operations that write these fields on PG will silently drop them via `BaseEntity.SetLocal`.

**Resolution:** Audit the exact column diff against the SS schema and author a backfill migration for PG.

---

### ⚠️ GAP 4: `type "INTEGER" does not exist` in Memory Manager dialect conversion

**Source:** `migrations-pg/PG_TESTING_AUDIT.md`

A `type "INTEGER" does not exist` PG error is swallowed non-fatally in the Memory Manager's dialect conversion path. This is non-blocking (the server starts and operates) but represents a real PG type-handling bug that could manifest in column creation or type-cast operations.

---

### ⚠️ GAP 5: PG baseline covers v5.38.x but v5.39–v5.41 migrations are absent

**Source:** `project_pg_v538_baseline_build_slip.md` (memory) + `migrations-pg/v5/` directory listing

The shipped PG baseline covers through v5.38.x. Migrations from v5.39.x through v5.41.x (current SS tip) have no PG equivalents with the exception of a few early v5.39 files. A fresh PG install is 2-3 minor versions behind SS, meaning:

- The v5.39 Integration Framework Expansion columns may be partially present (a `V202606041200__v5.39.x__Integration_Framework_Expansion.pg.sql` exists) but the v5.41 additions (Blockers 1 and 2 above) are confirmed absent
- Any connector that depends on v5.40–v5.41 behavior will fail silently or noisily on PG

---

## SSL Fix — Code Change Required

The only **code change** (not migration) required for Aurora production readiness is in `PGConnectionManager`:

**`packages/PostgreSQLDataProvider/src/pgConnectionManager.ts`, line 85:**
```ts
// Current (insecure for Aurora):
ssl: config.SSL ?? false

// Required for Aurora:
ssl: config.SSL ?? (process.env.NODE_ENV === 'production' ? true : false)
```

Or better, document the `SSL` config key in `mj.config.cjs` schema and require operators to set it explicitly. Aurora with `rds.force_ssl=1` (the AWS-recommended default) will reject unencrypted connections.

---

## Production-PG Readiness Verdict

**Status: GAPS-TO-CLOSE (3 blockers, 2 gaps)**

### What works
- ✅ Full SQL Server / PostgreSQL dialect abstraction in DDLGenerator, TypeMapper, engine raw SQL
- ✅ CustomColumnPromoter correctly picks SS vs PG column types at runtime via `PlatformKey`
- ✅ All UUID comparisons in integration code use `UUIDsEqual()` — no case-sensitivity bugs
- ✅ Transaction handling is correct and dialect-agnostic
- ✅ Per-tenant credential isolation is complete — no shared or hardcoded credentials
- ✅ Schema naming is derived and configurable — no SS-specific schema defaults

### Must-fix before Aurora production

| Priority | Finding | Impact | Fix |
|---|---|---|---|
| P0 | ❌ Missing PG migration: `V202606171600` DeclaredIntent columns | Connector write-path capabilities silently disabled on PG | Author `.pg.sql` equivalent |
| P0 | ❌ Missing PG migration: `V202606130000` RecordMap identity index | Full table scans on every sync at production scale | Author `.pg.sql` equivalent |
| P0 | ❌ V202603080719 column gap in CompanyIntegration tables | Sync orchestration and lock fields silently dropped | Audit diff + backfill migration |
| P1 | ⚠️ `PGConnectionManager` defaults SSL to `false` | Aurora with force_ssl=1 will reject connections; unencrypted in transit otherwise | Add `ssl: true` to PG config in mj.config.cjs |
| P2 | ⚠️ `type "INTEGER"` swallowed error in Memory Manager | Latent PG type-handling bug | Investigate + fix dialect conversion |

### Recommended deployment sequence for Aurora

1. Apply Blocker 3 backfill migration (column gap audit → PG ALTER TABLE)
2. Author and apply Blockers 1 and 2 PG migrations
3. Configure `ssl: true` in `mj.config.cjs` PG settings with Aurora CA bundle
4. Set `databaseSettings.connectionPool.max` appropriate to Aurora instance class
5. Verify full CodeGen passes on fresh PG install (known v5.38 baseline issue — replay history if needed; see memory `project_pg_v538_baseline_build_slip`)
6. Run connector hybrid-e2e on SQL Server to validate connector behavior pre-Aurora
7. Re-run on Aurora PG to validate dialect parity with the new PG migrations applied
