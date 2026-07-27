# Testing Framework

Metadata-driven testing framework for MemberJunction supporting agent evals, workflow scenarios, and multi-oracle evaluation.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [EngineBase](./EngineBase/README.md) | `@memberjunction/testing-engine-base` | Metadata cache for test types, suites, and tests (UI-safe, no execution logic) |
| [Engine](./Engine/README.md) | `@memberjunction/testing-engine` | Core test execution and evaluation engine supporting multiple test types |
| [CLI](./CLI/README.md) | `@memberjunction/testing-cli` | Command-line interface for test execution and management |
| testing-integration | `@memberjunction/testing-integration` | Integration bootstrap, the `IntegrationCheckRegistry`, and the `IntegrationTestDriver` |
| integration-test-suite | `@memberjunction/integration-test-suite` | **Private, never published** — MJ's own integration check bundles |

---

## Database platforms

The integration suite runs against **both** SQL Server and PostgreSQL. Both lanes are blocking in
`integration.yml` (`integration-sqlserver` and `integration-postgresql`), so PostgreSQL runtime
parity is a verified property rather than an assumption.

### Running the suite locally against PostgreSQL

```bash
# .env — point at a migrated PostgreSQL database
DB_PLATFORM=postgresql
DB_PORT=5432          # without this the committed mj.config.cjs would resolve the SQL Server port
DB_HOST=localhost
DB_DATABASE=mj_pg_local
DB_USERNAME=postgres
DB_PASSWORD=...

npm run test:integration
```

Provision the database with `npx mj migrate --dir=migrations-pg/v5`, then
`mj sync push --dir=metadata` followed by `mj sync push --dir=metadata-optional/integration-test`.
The `cdp_UI` / `cdp_Developer` / `cdp_Integration` roles must exist before migrating — 129 migration
files carry `GRANT` statements against them, and the first one aborts with
`role "cdp_UI" does not exist` on a blank database. See the `Bootstrap PostgreSQL roles` step in
`.github/workflows/integration.yml` for the exact SQL.

### The platform-declaration boundary rule

A bundle may declare which platforms it runs on:

```ts
IntegrationCheckRegistry.Instance.RegisterBundlePlatforms('metadata-consistency', ['sqlserver']);
```

Undeclared bundles run everywhere, and **that is the default you should almost always keep**. A
declaration is justified in exactly one situation: the bundle is **dialect-impossible** on the other
platform — its checks issue platform-specific SQL that has no equivalent there.
`metadata-consistency` qualifies because it reads `sys.objects` / `sys.check_constraints` /
`sys.indexes`, which PostgreSQL simply does not have. It is the only declared bundle.

**A declaration is not a quarantine list.** A bundle that *can* run on both platforms and fails on
one has found a parity bug — which is the entire reason the PostgreSQL lane exists — and belongs
red until it is fixed or tracked. Declaring it away converts a finding into a silent gap.

When a bundle is excluded, the driver reports the whole test as `Skipped` **without invoking any
check body**, and only when *every* selected bundle is excluded — a mixed selection still runs, so a
declaration can never silently drop coverage that would otherwise have executed.

### `Skipped` is a real status

`DriverExecutionResult.status` includes `'Skipped'`, distinct from `'Passed'`. A test is skipped when
a tier gate is closed (`RUN_MUTATION_TESTS` / `RUN_AGENT_TESTS`) or a bundle is platform-excluded.

This used to report as `Passed` with `score: 1` because the driver's enum had no `'Skipped'` — which
made "never ran" indistinguishable from "verified" in every count, report and exit code. Skips are now
excluded from pass/fail ratios and from `averageScore` rather than counted on either side, the pass
rate is computed over *executed* tests, and both the console and Markdown reports list every skip with
its reason. A skipped test does not fail `mj test run` or `mj test suite`.

### The mutation axis

Both CI lanes set `RUN_MUTATION_TESTS=1`. Before #3257 no workflow set it, so the 52 mutation-tier
checks across 12 bundles never ran in CI even though the release procedure ran them locally — CI was
gating on a strictly weaker suite than the documented release check. `pg-parity`'s CRUD legs are
mutation-tier, so without this the bundle would register, dispatch and skip every write check.

### How the user cache is fed on each platform

`UserCache.Refresh(pool)` is hard-typed to an mssql `ConnectionPool` and speaks bracket-quoted T-SQL,
so it cannot serve PostgreSQL. The seam is
**`UserCache.RefreshFromRows(users, roles, provider)`** — a platform-neutral, data-in method that owns
the role join and `UserInfo` construction. Each backend only supplies rows in its own dialect:

| Caller | Query dialect | Feeder |
|---|---|---|
| `setupSQLServerClient` | T-SQL, bracket-quoted | `UserCache.Refresh(pool)` |
| Integration bootstrap + `mj test` CLI | PostgreSQL, double-quoted | `feedUserCacheFromPG(...)` in testing-integration |
| MJServer / MetadataSync | PostgreSQL, own query | direct `RefreshFromRows` call |

**Why a feeder rather than relocating `UserCache`.** `UserCache` lives in
`@memberjunction/sqlserver-dataprovider` and roughly 30 files import it from there. Moving it to a
neutral package would be a wide, cross-cutting change, and this repo forbids re-exporting a symbol
from another package to soften the move. An additive data-in method achieves platform neutrality
without touching a single existing import; relocation stays tracked as a follow-up.

`RefreshFromRows` **fails loudly** on an empty user set. A silently empty cache is indistinguishable
from a working one at the call sites (`GetSystemUser()` just returns `undefined`), which is how
empty-cache misconfigurations reach production. Two production sites — MJServer and MetadataSync —
previously worked around the mssql-only `Refresh` by smashing the private `_users` field through an
`as unknown as` cast; both now call `RefreshFromRows`, and both consequently throw where they used to
proceed with no users. `_users` is initialized to `[]` and left untouched on a throw, so `Users` never
returns `undefined` to the several call sites that dereference it unguarded.
