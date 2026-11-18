# Managed PostgreSQL Readiness — Plan

- **Status:** Proposed. This PR adds the plan only; no code changes.
- **Date:** 2026-11-18
- **Targets:** AWS RDS / Aurora (MJ Central's PG tiers today), Azure Database for PostgreSQL Flexible Server, Azure HorizonDB, and other managed PostgreSQL hosts.
- **Related:** [`pg-parity-audit-findings.md`](pg-parity-audit-findings.md) · [`pg-migration-architecture/DEV_ON_PG_GUIDE.md`](pg-migration-architecture/DEV_ON_PG_GUIDE.md) · [`colocated-vector-search.md`](colocated-vector-search.md) · [`../migrations-pg/README.md`](../migrations-pg/README.md)

---

## 1. Why

MJ Central (MJC) hosts tenants on managed PostgreSQL today. It runs three Postgres-on-AWS sizes, small dedicated instances where `max_connections` is tight, plus an Enterprise bring-your-own-cloud tier on AWS or Azure. Microsoft's **Azure HorizonDB** is a new option for the Azure side:

- a PostgreSQL-compatible, scale-out managed database, in public preview since June 2026;
- compute and storage scale separately, and data is replicated across availability zones;
- `pg_diskann` vector indexing and `pg_textsearch` BM25 full-text search;
- Microsoft Entra ID login and Private Link;
- an extension allowlist (`azure.extensions`), with no way to install your own extensions.

We reviewed how MJ would run on HorizonDB, and the review found gaps in MJ's PostgreSQL layer that have nothing to do with HorizonDB. **Every managed PostgreSQL host hits them.** This plan closes those gaps so that MJ installs and runs cleanly on any managed PostgreSQL host, with HorizonDB as one target in the validation matrix rather than a special case.

Out of scope here: which MJC tiers use HorizonDB, and the pricing. That is a product decision, and it waits for HorizonDB to reach GA.

## 2. The gaps (verified against `next` @ `e52c0daa4`)

| # | Gap | Where | Severity |
|---|---|---|---|
| G1 | MJAPI's own pools never set `ssl`. The provider pool gets SSL only from `NODE_ENV === 'production'`. There is no CA bundle and no `sslmode` setting. | `packages/MJServer/src/postgresqlPoolSettings.ts:116-130` (`ToPGPoolConfig`), `packages/PostgreSQLDataProvider/src/pgConnectionManager.ts:111` | 🔴 Blocks any host that forces TLS, unless `NODE_ENV` happens to be `production`. Never verifies the server certificate. |
| G2 | No token-based database login (Entra ID, AWS RDS IAM). `Password` is a plain `string` everywhere. | `pgConnectionManager.ts:17`, `postgresqlPoolSettings.ts:51-58` | 🟠 Blocks a passwordless or managed-identity posture, which enterprise Azure and AWS buyers expect. |
| G3 | A large and partly duplicated connection footprint. MJAPI opens an API pool (`index.ts:634`), then `provider.Config()` opens a **second** API-sized pool (`index.ts:701` → `PostgreSQLDataProvider.ts:401`). Add two read-only pools (`:653`, `:668`) and two CodeGen pools of 10 (`:784`, `:806`). With defaults that is about 100 API connections plus up to about 60 read-only and 20 CodeGen per MJAPI instance. Nothing checks it against the server's `max_connections`. | `packages/MJServer/src/index.ts`, `postgresqlPoolSettings.ts` | 🔴 Exhausts connections on small RDS tiers and on any multi-replica MJAPI fleet. |
| G4 | The read-only pools reuse the primary host with a different login. There is no way to point reads at a replica endpoint. | `postgresqlPoolSettings.ts:141-152`, `index.ts:651-675` | 🟡 Leaves read scale-out unused on HorizonDB, Aurora and Flexible Server. |
| G5 | Every converted migration runs `CREATE EXTENSION` for `pgcrypto` and `uuid-ossp`, which managed hosts must allowlist. Neither is needed on PG ≥ 13: all UUID defaults use the built-in `gen_random_uuid()`, and no `pgcrypto` function is called. | `packages/SQLConverter/src/rules/DialectHeaderBuilder.ts:44-45`, `packages/MJInstaller/src/phases/DatabaseProvisionPhase.ts` (`POSTGRES_MJ_EXTENSIONS`) | 🟡 An avoidable allowlist dependency. HorizonDB's default parameter group reportedly allows only `plpgsql`. |
| G6 | Migrations assume the `cdp_*` group roles and the extensions already exist. Only the installer creates them. A pre-provisioned managed database driven straight by `mj migrate` fails partway through, with a GRANT or extension error. | `DatabaseProvisionPhase.ts` (`POSTGRES_MJ_GROUP_ROLES`), newest `migrations-pg` baseline | 🟡 Poor first-install experience on BYO-cloud. |
| G7 | SSL handling is inconsistent across the other PG clients. The pgvector provider uses `rejectUnauthorized: false` when SSL is on. CodeGen defaults SSL off. `mj migrate` passes only SQL Server flags (`Encrypt`, `TrustServerCertificate`). MetadataSync is unaudited. | `packages/AI/Vectors/Providers/pgvector/src/models/PgVectorDatabase.ts:97`, `packages/CodeGenLib/src/Config/pg-connection.ts:48-52`, `packages/MJCLI/src/config.ts:~372` | 🟠 The same TLS problem as G1, spread across five clients, one of them insecure. |
| G8 | User search on PostgreSQL uses `LIKE`, which is case-sensitive. SQL Server's default collation is not. | `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts:1170-1188` | 🟡 A silent behaviour difference between the two platforms. |
| G9 | The open items in the parity audit: F9 (`R__RefreshMetadata` is not equivalent, so a from-scratch database is not reproducible), F12 (`mj codegen` cannot exit 0 on PG), and no CI lane running the deterministic integration tier on PG. 47 of 61 bundles pass. | `plans/pg-parity-audit-findings.md` | 🔴 Nothing keeps PG working. Every fix above can silently regress. |

## 3. Design principles

1. **One connection-settings builder for PostgreSQL.** SSL, authentication and endpoint resolution live in one place, used by MJAPI, the provider, CodeGen, `mj migrate`, MetadataSync and pgvector. G1 and G7 exist because each client built its own.
2. **Secure by default, explicit to loosen.** `verify-full` is the target default for remote hosts. Disabling verification takes an explicit setting, and MJAPI logs a warning at startup when it is disabled.
3. **No cloud SDK in core.** Token providers are pluggable classes registered with `@RegisterClass`. The Azure and AWS SDKs are optional peer dependencies, loaded only when that provider is configured, which is category 2 of the dynamic-import rule.
4. **Additive config.** Every new setting has a default that preserves today's behaviour, except the ones this plan deliberately flips, which are called out in §5.
5. **Every gap gets a regression guard.** Unit tests for config mapping, plus the PG CI lane from W7 for runtime behaviour.

## 4. Workstreams

### W1 — TLS for every PostgreSQL client (G1, G7)

**Settings** (in `databaseSettings` and in env vars, with env winning, following the existing `PG_*` pattern):

| Setting | Env | Values | Default |
|---|---|---|---|
| `pgSsl.mode` | `PG_SSL_MODE` | `disable` · `require` · `verify-ca` · `verify-full` | `disable` for `localhost`/`127.0.0.1`/`::1`, else `verify-full` (see §5) |
| `pgSsl.caFile` | `PG_SSL_CA_FILE` | path to a PEM bundle | Node's default trust store, which covers RDS, Azure and HorizonDB public CAs |
| `pgSsl.servername` | `PG_SSL_SERVERNAME` | SNI override for Private Link or proxy setups | none |

**Changes**
- Add a `PgSslSettings` type and a `ResolvePgSsl(endpoint, settings, env)` helper that returns `pg.ConnectionConfig['ssl']`. It lives in `@memberjunction/postgresql-dataprovider`, so every client can import it without depending on MJServer.
- Set `ssl` in `BuildPostgreSQLConnectionConfig`, and map it in `ToPGPoolConfig`. That one change covers the API, read-only, ad-hoc and CodeGen pools, and the provider pool too, because the provider receives the same `PGConnectionConfig`.
- Have `PGConnectionManager` honour an explicit `SSL` value and stop deriving it from `NODE_ENV`, keeping the `NODE_ENV` fallback only when `SSL` is `undefined`, for compatibility.
- Change CodeGen's `codegenPool.ssl` default from `false` to `ResolvePgSsl(...)`. A local shell still gets `disable` from the localhost rule.
- Pass a PG SSL option through `mj migrate` to Skyway's `PostgresProvider`. This needs a small change in the `MemberJunction/skyway` repo if the provider doesn't already accept a `pg` `ssl` object; check that first.
- In pgvector, drop the hard-coded `rejectUnauthorized: false` and use `ResolvePgSsl`, keeping `PG_VECTOR_SSL=true` as an alias for `require`.
- Audit MetadataSync's PG connection (`packages/MetadataSync/src/lib/provider-utils.ts`) and route it through the same helper.

**Tests:** unit tests over a mode × host matrix for `ResolvePgSsl`; a `ToPGPoolConfig` test asserting that `ssl` is carried; a CodeGen config test for the default change.

### W2 — Pluggable token authentication (G2)

node-postgres accepts `password` as `string | (() => string | Promise<string>)` and calls it for every new physical connection. That is exactly the hook short-lived tokens need: Entra ID tokens last about 60–90 minutes, and RDS IAM tokens 15 minutes.

**Changes**
- Widen `PGConnectionConfig.Password` (and `PostgreSQLEndpoint.Password`) to `string | PgPasswordSource`, where `type PgPasswordSource = () => Promise<string>`. Every place that compares configs (for example `connectionConfigsEqual`) has to stop serialising the function. Compare an `AuthMode` plus the user instead.
- Add an abstract `BasePgCredentialProvider` in `@memberjunction/postgresql-dataprovider` with `GetPassword(endpoint): Promise<string>`, chosen by `PG_AUTH_MODE` / `pgAuth.mode`:
  - `password`, the default and today's behaviour;
  - `azure-entra`, in a new package `@memberjunction/pg-auth-azure`: `DefaultAzureCredential().getToken('https://ossrdbms-aad.database.windows.net/.default')`, cached until 5 minutes before it expires. Covers managed identity, workload identity and az-cli in dev;
  - `aws-rds-iam`, in a new package `@memberjunction/pg-auth-aws`: `@aws-sdk/rds-signer` `getAuthToken()`, cached for about 10 minutes.
- Use one credential provider instance per endpoint and share it across every pool, so a fleet of pools fetches one token rather than N.
- Make TLS mandatory when the mode is not `password`. Startup fails loudly if `PG_SSL_MODE=disable` is combined with token authentication.
- Apply the same source to CodeGen and `mj migrate`. Migrations against an Entra-only server must work, or BYO-Azure installs still need a password login.

**Tests:** a fake credential provider that returns a different token per call, asserting that a new connection after expiry gets the new token; the config-equality regression test; a startup guard test for token authentication without TLS.

### W3 — Right-size and observe the connection footprint (G3)

**Changes**
1. **Remove the duplicate API pool.** Build the API `pg.Pool` once, adding the `types: MJPostgresTypes` it lacks today, and hand it to the provider with `ConfigWithSharedPool(pgConfigData, pgPool)` (`PostgreSQLDataProvider.ts:461`) rather than `provider.Config()`. The MSSQL-compat wrapper wraps the same pool. This halves API connections. Check that metadata refresh (`Config()` re-entry, `PostgreSQLDataProvider.ts:391-404`) cannot close a shared pool. `PGConnectionManager.Close()` is already a no-op for shared pools (`pgConnectionManager.ts:190`).
2. **Open the CodeGen pools lazily.** Today they open at startup whenever `CODEGEN_DB_USERNAME` is set. Open them on first use instead (an API-triggered CodeGen or entity refresh), and close them after an idle timeout.
3. **Run a budget check at startup.** After connecting, read `SHOW max_connections` and `current_setting('superuser_reserved_connections')`. Compute this instance's worst case (the sum of every pool's `max`), multiply by an optional `connectionPool.expectedReplicas` (default 1), and log a **warning** with the numbers when it exceeds 80% of the usable connections. Don't fail: CodeGen pools are lazy now, so the worst case is pessimistic.
4. **Document pooler mode.** MJ uses session-level features in places: advisory locks (`PostgreSQLDataProvider.ts:617-625`), `SET` startup options and temp objects. Write down which of these break under a **transaction-mode** pooler (PgBouncer, RDS Proxy pinning, HorizonDB or Flexible Server built-in PgBouncer on port 6432), and either make MJ pooler-safe or state that session mode is required. This is investigation work, and its output goes into `DEV_ON_PG_GUIDE.md`.

**Tests:** a unit test that the provider is configured with the shared pool; a budget-check unit test with a mocked `SHOW` result.

### W4 — Read replica routing (G4) — opt-in

**Changes**
- Add `PG_READ_HOST` / `PG_READ_PORT`, or `dbReadOnlyHost` / `dbReadOnlyPort`, defaulting to the primary endpoint. Use them only to build the `'read-only'` and `'adhoc-read-only'` pools.
- The `'read-only'` pool serves application `RunView*` reads, so replica lag would break read-your-writes (save, then reload). Guard it as follows:
  - keep these on the **primary**: anything with `BypassCache: true`, any read inside a transaction, and any read within N ms of a write by the same request (track it on the provider instance — it is per request);
  - add `connectionPool.readReplicaMaxLagMs`, default 0, which means "use the replica only for the ad-hoc pool", so the first rollout moves only untrusted ad-hoc SQL and reporting to the replica.
- Report the replica lag (`pg_last_xact_replay_timestamp()` where available) through the health signals from `mj-health-signals-and-openapp-live-probes.md`.

**Open question:** should application `RunView*` ever use a lagging replica, or only analytics, ad-hoc SQL and Skip/agent reads? The recommendation is the latter for v1.

### W5 — Drop unnecessary extensions (G5)

- In `DialectHeaderBuilder.ts`, stop emitting `CREATE EXTENSION "uuid-ossp"` and `"pgcrypto"` for **new** conversions. MJ's documented PG minimum is 14, and `gen_random_uuid()` has been built in since PG 13.
- Add a converter guard: if converted output references a `uuid_generate_*` or `pgcrypto` function (`digest`, `crypt`, `gen_salt`, `pgp_*`), emit the matching `CREATE EXTENSION`. Extensions are then added only when they are used.
- Trim `POSTGRES_MJ_EXTENSIONS` in the installer to the same rule. Keep pre-creating them on existing installs, because shipped migrations are immutable and still contain the statements.
- **Shipped migrations are not edited.** Document the allowlist requirement (`azure.extensions = 'pgcrypto,uuid-ossp'` on Azure; nothing extra on RDS) in `DEV_ON_PG_GUIDE.md`, until the next baseline rolls the old files out of the fresh-install path.
- Verify that `CREATE EXTENSION IF NOT EXISTS` for an extension that is already installed succeeds on HorizonDB even when it is not allowlisted. If it does, a provisioning step that pre-creates the extensions is enough for old migrations.

### W6 — Managed-host preflight (G6)

Add `mj doctor --db`, and run the same check at the start of `mj migrate` on PostgreSQL. It connects with the migrate login and checks:

- the server version is 14 or later;
- the `cdp_*` roles exist (`POSTGRES_MJ_GROUP_ROLES`);
- every extension that pending migrations will `CREATE` is installed or allowlisted (`pg_available_extensions` plus `SHOW azure.extensions` when present);
- the login has `CREATE` on the database and owns, or can create, the target schema;
- TLS is in effect (`pg_stat_ssl` for the current backend), with a warning if it is not;
- the connection budget from W3.

When a check fails, it prints the exact SQL an administrator must run: the same statements `DatabaseProvisionPhase` would issue, generated from the same constants so the two cannot drift. It exits non-zero before the first migration, rather than failing at file 37 with a GRANT error.

### W7 — Close the parity audit and add a CI lane (G8, G9)

This plan sequences these items but doesn't re-plan them. Details are in `pg-parity-audit-findings.md`.

- **F9:** make `R__RefreshMetadata` equivalent on PG, so a from-scratch database is consistent with no manual repair.
- **F12:** stop shipping metadata that turns on SQL Server-only layered views for PG installs, or make CodeGen skip them cleanly, so `mj codegen` can exit 0.
- **The remaining T-series dialect leaks** in the 14 failing bundles.
- **G8:** use `ILIKE` for PG user search predicates. Check the GIN and `pg_trgm` trade-off; `ILIKE '%x%'` cannot use a btree index any more than `LIKE` can. Optionally use `citext` comparisons where an entity opts in.
- **A PG CI lane:** extend `.github/workflows/pg-migrations.yml`, or add a new workflow, to bootstrap a clean PG 16 database from shipped migrations, run `mj codegen` (it must exit 0), and run `Integration Tests — Deterministic`. It must require TLS on the CI Postgres (`ssl=on` with a self-signed CA passed through `PG_SSL_CA_FILE`), so W1 is exercised on every PR, and run with a deliberately small `max_connections` (for example 60), so W3 regressions show up.

### W8 — Managed-host validation matrix

When W1–W7 have landed, run the same script on each host:

| Host | Notes |
|---|---|
| AWS RDS PostgreSQL 16, smallest MJC tier | the `max_connections` budget, `rds.force_ssl=1`, IAM auth |
| Aurora PostgreSQL | reader endpoint used for W4 |
| Azure Database for PostgreSQL Flexible Server, Burstable B1ms and General Purpose | Entra auth, built-in PgBouncer, the `azure.extensions` allowlist |
| **Azure HorizonDB (preview)** | Entra auth, extension allowlist, replica routing, and a `PgVectorColocated` HNSW-vs-`pg_diskann` comparison feeding a follow-up plan |

The script runs an installer or `mj migrate` from an empty database, `mj codegen` (it must exit 0), the deterministic integration tier, a 30-minute soak with token rotation and failover to prove reconnects (`MEMORY_LEAK_AUDIT.md` notes the risk of exhausting the pool on failover), and the W6 preflight. Results are written to `plans/managed-postgres-validation-results.md`.

## 5. Behaviour changes to call out in the changeset

- **The TLS default flips** for non-localhost PG hosts, from "off unless `NODE_ENV=production`" to `verify-full`. A remote dev database without TLS now needs `PG_SSL_MODE=disable`. This is deliberate. MJAPI logs a single, clear startup error naming the setting.
- **The CodeGen SSL default flips** in the same way.
- **The duplicate API pool goes away**, so PG connections per MJAPI drop by about 50 at defaults. No configuration change is needed.
- All other settings are new and opt-in.

## 6. Sequencing

```
W1 TLS ─┬─> W2 token auth ─┐
        └─> W6 preflight ──┤
W3 pool footprint ─────────┼─> W8 validation matrix
W5 extensions ─────────────┤
W7 parity + CI lane ───────┘  (W7's CI lane should land early; it guards everything else)
W4 replicas (after W3, opt-in)
```

Suggested PR slicing, one reviewable PR each:

1. W1, W7 CI lane skeleton (the TLS-enforcing PG service)
2. W3
3. W5 + W6
4. W2 (adds two optional packages)
5. W7 F9 / F12 / G8
6. W4
7. W8 results doc

## 7. Open questions

1. **Skyway:** does `@memberjunction/skyway-postgres` accept a `pg` `ssl` object and a password function today? If not, W1 and W2 need a coordinated Skyway release.
2. **Pooler mode:** do we commit to supporting transaction-mode poolers (W3.4), or document session mode as required? This affects how far MJC can scale tenant density on a single PG instance.
3. **Replica reads:** is ad-hoc SQL plus analytics on the replica the right v1 boundary (W4)?
4. **Minimum PostgreSQL version:** confirm 14 is still the floor. W5 relies on 13 or later.
5. **HorizonDB-specific features** (`pg_diskann` in `PgVectorColocated`, `pg_textsearch` BM25 as a CodeGen full-text search option) are intentionally left out. They get their own plan after W8 produces numbers.
