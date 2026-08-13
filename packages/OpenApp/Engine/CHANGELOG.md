# @memberjunction/open-app-engine

## 6.1.0-edge.2

### Patch Changes

- 6bb2e1f: Fix Open App registration and migrations under pnpm (#3677). server-bootstrap now resolves runtime-configured packages (`dynamicPackages.server[]`, `codeGeneration.packages`) from the host application when a bare import cannot — pnpm's strict layout resolves bare specifiers from the importing package, which cannot declare runtime-known names. open-app-engine now declares the skyway packages as optionalDependencies so app migrations resolve them in every topology; a resolved provider's own load/constructor errors are no longer misreported as "provider not found".
- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Open App migrations run per-migration by default, and the mode is now selectable

  `RunAppMigrations` built its Skyway config without ever setting `TransactionMode`, and the
  option was declared only on the module's internal Skyway config shape — never on the public
  `MigrationRunOptions`. No caller could select a mode, so Open App installs always fell
  through to Skyway's `per-run` default: one transaction wrapping the entire pending set.

  Two changes:
  - `MigrationRunOptions` accepts `TransactionMode?: 'per-run' | 'per-migration'`, threaded onto
    the config handed to Skyway.
  - The default is now **`per-migration`** — each migration file runs and commits in its own
    transaction. `per-run` remains available opt-in.

  This aligns app installs with `mj migrate`, which MJCLI already defaults to `per-migration`;
  the two paths previously had silently different transaction semantics.

  The reason the default matters: `per-run` cannot host every valid migration set. SQL Server
  cannot create a table type and instantiate a variable of that type in the same transaction —
  the `CREATE TYPE` holds a schema-modification lock while TVP instantiation, which runs in a
  nested system transaction that does not share the session's lock ownership, requests
  schema-stability on the same type, so the session deadlocks against itself (error 1205).
  Minimal reproduction, no MemberJunction involved:

  ```sql
  BEGIN TRAN;
      CREATE TYPE dbo.IDList AS TABLE (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
  GO
      DECLARE @ids dbo.IDList;   -- Msg 1205
  GO
  COMMIT;
  ```

  On a from-zero install every migration is pending, so under `per-run` the whole app is one
  transaction and no arrangement of migration files avoids this — making a table type, a
  standard T-SQL construct, impossible to ship. It surfaces only on a clean install, never on an
  incremental development database where the type was committed by an earlier run.

  Note on failure semantics: under `per-migration`, a set that fails partway leaves earlier
  migrations committed and recorded in the app's history table. Undoing a failed install is
  therefore the orchestrator's responsibility rather than the database's.

- 394d276: Align zod to ^3.25.0 with the rest of the workspace (was the last ^3.24.3 straggler; the AI SDK family peers on zod ^3.25).
- 394d276: Fix: a failed Open App install now removes everything it wrote, not just its schema

  With migrations applying per-migration, a set that fails partway leaves earlier files
  committed — the database will not undo them, and it cannot: one transaction spanning a whole
  app's migrations is not something SQL Server can always host. The install's all-or-nothing
  guarantee therefore has to be a compensating action.

  `CompensateSchemaOnFailure` previously did one of the three things `RemoveApp` does — it
  dropped the app's schema. Rows the app's seed migrations wrote into the **shared** core schema
  were left orphaned, because dropping the app's own schema cannot reach them.

  It now runs the same three-step sequence `RemoveApp` uses, in the same order:
  1. `RemoveAppEntityMetadata` — the app's entity metadata and the Application rows its
     migrations declared, in the core schema.
  2. `HandleTeardown` — the app's declared `migrations.teardownDirectory` inverse DELETEs,
     which retire what its seed migrations wrote into the shared core schema.
  3. `DropAppSchema` — the app's own schema, which takes its migration history table with it so
     a retry starts from a clean slate rather than resuming a half-applied set.

  Unchanged: compensation still runs only for a schema **this run actually created**, never a
  reused or adopted one. Because the run created it, no other installed app can legitimately
  share it, so no co-tenant check is needed here.

  Every step is best-effort and reported. One failing step does not skip the others (a teardown
  failure must not leave the schema behind), and nothing here turns a failed install into a
  successful one. An app that declares migrations but no `teardownDirectory` now emits an
  explicit warning that rows in the shared core schema may remain, rather than letting a partial
  rollback look complete.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0

## 5.50.0

### Patch Changes

- a7dfaf5: fix(open-app): detect the workspace layout and write config to every file a consumer loads (#3270, #3271)

  `mj app install` could complete — or report success — while leaving an app that never actually loads. Two causes, both in the install's `[Packages]` / `[Config]` steps.

  **#3270 — workspace layout.** The installer defaulted to the monorepo paths (`packages/MJAPI`, `packages/MJExplorer`), but `mj install` scaffolds a distribution under `apps/`. Installing onto a host created by MJ's own installer failed with `Could not read package.json at <root>/packages/MJAPI/package.json: ENOENT`, and it failed _after_ schema creation and migrations had committed, leaving the app recorded with `Status='Error'`. Both paths are now probed (`packages/…`, then `apps/…`) via a shared `workspace-paths` module, so a plain `mj app install` works on either layout with no configuration; an explicit `openApps.serverPackagePath` / `clientPackagePath` still wins.

  **#3271 — config write target.** Config edits went to a single file: the server workspace's `mj.config.cjs` when present, else the repo root. But the `dynamicPackages.client` array is consumed by `mj codegen manifest --open-app-client-bootstrap`, which resolves config from the _client_ workspace and so never sees a server-workspace config; and a container / App Service deployment that ships only the root config never sees the `server` entry. Either way the miss is silent: the client bootstrap reports `0 client packages wired` so the app's `@RegisterClass` decorators never fire, and a deployed API loads no server package at all — its GraphQL schema lacks every one of the app's types while `__mj.OpenApp` still reports the app `Active`. All config writes (`dynamicPackages`, `entityPackageName`, `excludeSchemas`) now target **every** `mj.config.cjs` a consumer may load. Entry insertion is idempotent, so a config that already has the entry is unchanged.

  A file that genuinely cannot be edited — most commonly the distribution's `module.exports = require('../../mj.config.cjs')` re-export, which has no object literal to insert into — is now reported as a warning instead of failing the install, since it re-exports the root config that _did_ get written. The install fails only when no config could be updated. `ConfigOperationResult` gains an optional `Warnings` field and the orchestrator surfaces them via `OnWarn`.

- d79dd11: fix(open-app): coerce prerelease host versions to base tuple in the MJ version compatibility gate

  `CheckMJVersionCompatibility` called `semver.satisfies(mjVersion, range)` directly, and semver ranges exclude prerelease versions unless tuple-anchored. Once MJ's Edge prerelease grammar activates (every dev/fast-channel build versioned `X.Y.Z-edge.N`), every dev host would fail `satisfies('6.2.0-edge.3', '>=6.0.0 <7.0.0')` and reject every app install even though the app's range is era-correct.

  The host MJ version is now coerced to its base release tuple (`6.2.0-edge.3` → `6.2.0`) via the new exported `CoerceToBaseVersion` helper before the range check. Base-tuple coercion is used instead of `{ includePrerelease: true }` because semver orders a prerelease below its release: `satisfies('7.0.0-edge.0', '>=6.1.0 <7.0.0', { includePrerelease: true })` is `true`, so a 7-era Edge host would wrongly pass a `<7.0.0` cap — coercion correctly fails it as `7.0.0`.

  Only the host-side gate changes; installed app/dependency version comparison (`CheckDependencyVersionCompatibility`, `IsValidUpgrade`) is untouched (tracked separately in #3310).

- 918563e: Harden the Open App install engine: four independent fixes to install, upgrade and remove.

  **Manifest values can no longer inject code into `mj.config.cjs`.** That file is `require`d — and therefore executed — by every `mj migrate`, `codegen` and build. The config writer built entries by concatenating single-quoted strings, so a manifest-sourced value containing a quote could escape its literal and have arbitrary expressions evaluated on the next `mj` command. Every injected value is now emitted as a fully escaped literal, and the removal/detection regexes accept both quote styles so entries written by earlier versions stay removable. As defence in depth — the config writer is not the only consumer of these values — package names and `schema.entityPackage` must now be valid npm names and `startupExport` a single JavaScript identifier, rejected at manifest validation before any engine code touches them.

  **Schema names are compared case-insensitively at read, fixing Postgres install/remove/reinstall.** PostgreSQL folds unquoted DDL identifiers to lowercase, so a schema declared as `__mj_BizAppsCommon` exists as `__mj_bizappscommon` while stored metadata may carry either casing. Three paths were comparing raw casing: the schema-existence check now tests the canonical name the create path actually produces (raw-casing checks sent Postgres reinstalls into an "already exists" dead end), the legacy `Schema Info` delete filter now matches case-insensitively, and the shared-schema check does too — previously two apps storing different casings of the same schema missed each other, and removing one could cascade-drop a schema the other still lives in. Healing happens at read rather than by rewriting stored rows, so installs that already carry mixed casing are fixed the moment this ships.

  **Removing an app keeps npm dependencies that co-installed apps still declare.** The remove path already computed the other installed manifests for prebundle excludes but never passed them to package removal, so uninstalling one app stripped `package.json` entries a surviving app depends on. Package removal now accepts a retain list, and the orchestrator derives it from every other installed app's server, client and shared package lists.

  **A failed `npm install` during upgrade finalizes the app as Disabled.** The upgrade path wrote `Active` unconditionally even when dependency installation had failed, leaving the server to load packages that were never installed. It now mirrors the install path: finalize `Disabled`, switch the app's dynamic-package entries off so the server loader and client bootstrap skip it, and tell the operator to run `npm install` followed by `mj app enable`.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Minor Changes

- f9f60d7: Fix the v5.46.0 PostgreSQL Open App outage (`column "LastCompletedStep" does not exist` on every `mj app` operation). `V202607090600` added `OpenApp.LastCompletedStep` / `LastCompletedStepTargetVersion` + EntityField metadata on PG but did not bake the CodeGen output, so `__mj."vwOpenApps"` never exposed the columns.

  New migration `V202607101200` is the raw `mj codegen` (PostgreSQL) output against a fresh v5.46-migrated DB (generated with the companion PG-codegen differential fix, so it is the differential emit — ~10 entities — not a 184k full regen). It regenerates the OpenApp base view + CRUD sprocs to expose the two columns, and additionally normalizes drifted seed metadata (SS-style type-names/lengths, timestamp defaults) for a handful of recent PG entities that codegen legitimately corrects. The `EntityFieldValue` inserts for the LastCompletedStep value list are guarded with `WHERE NOT EXISTS` so databases that used the documented "run `mj codegen` after migrating" v5.46 workaround don't get duplicate value-list rows (`EntityFieldValue` has no unique key on `(EntityFieldID, Value)`).

### Patch Changes

- 06a1e44: Make the Open-App metadata teardown dialect-driven with full PostgreSQL parity. The FK-graph cascade in `RemoveAppEntityMetadata` (introduced for SQL Server) now runs on **both SQL Server and PostgreSQL**: identifier quoting comes from the provider's `SQLDialect` (`QuoteSchema`/`QuoteIdentifier`) and the FK-graph catalog query comes from a new `SQLDialect.ForeignKeyGraphSQL(schema)` (SQL Server `sys.foreign_keys`; PostgreSQL `pg_catalog.pg_constraint`, with source-column nullability + composite-FK column-count). Previously PostgreSQL fell back to a hardcoded ~6-entity delete list that **under-deleted** (missing e.g. `RecordChange`), so a used PG app could fail remove/reinstall on a foreign-key violation — that path is now the same complete cascade as SQL Server. The provider-selection gate is `has-a-Dialect` (no longer `!== 'postgresql'`), and only a caller that passes no provider uses the legacy entity-layer fallback. Polymorphic tables are covered via their real single-column `EntityID` FK (nullable → `SET NULL`, NOT-NULL → `DELETE`); the FK-less `RecordID` string half is out of scope (a separate single-record-delete concern).
- 31da520: Open-App teardown review follow-ups. Completes the "Dialect owns it" direction and hardens the seam:
  - **`SQLDialect.AtomicBatchScript(statements)`** (new, SS + PG) now owns the all-or-nothing transaction/session wrapper, so `buildTeardownBatchScript` no longer sniffs `PlatformKey` — the last platform branch leaves the OpenApp engine.
  - `RemoveAppEntityMetadata` is now exported from the package index; a deterministic, self-cleaning **integration suite** (`open-app-teardown-tests.ts`, registered in `run-all.ts`) codifies the used-app remove/reinstall scenario (blocking `RecordChange` + link-less fixed-GUID `Application` → clean teardown → re-create without `PK_Application` collision).
  - `RemoveApp` now passes the context's bound provider (not `undefined`) into `RemoveAppEntityMetadata`, so its metadata reads honor the multi-provider rule instead of the process-global `Metadata`.
  - **PostgreSQL schema-name case-sensitivity** (found via a full PG install → remove lifecycle — the true test of PG parity): PostgreSQL folds unquoted identifiers, so an app whose manifest declares schema `__mj_BizAppsTasks` is created + registered on the `Entity` rows as `__mj_bizappstasks`, while the `OpenApp` record keeps the manifest casing. `RemoveAppEntityMetadata`'s case-sensitive `SchemaName = '…'` therefore matched **zero** entities on PG — the teardown silently cleared nothing yet reported success (masked on SQL Server by case-insensitive collation). The entity lookup, the SchemaInfo cleanup, and `buildRootDoomedPredicate` now compare `LOWER(SchemaName) = LOWER(…)`, so the teardown works on PostgreSQL. Without this, the FK-graph PG "parity" was mechanism-correct but never actually deleted anything for a real CLI-installed app.
  - **Reinstall idempotency** (found via a full install → remove → reinstall lifecycle): `mj app remove` soft-removes (keeps the `OpenApp` row + its `OpenAppDependency` rows), so a reinstall reused that record and the blind dependency insert collided on `UQ_OpenAppDep`. `RecordInstallationAtomically` now clears any pre-existing dependency rows for the app in the same transaction group before re-recording (delete-then-insert, atomic — mirrors the upgrade path). Reinstall of a previously-removed app now succeeds.
  - SQL Server `ForeignKeyGraphSQL` gains `ORDER BY fk.name` (deterministic edge/statement order) and a note that disabled FKs are intentionally included (conservative-safe).
  - Docs corrected to match the has-a-Dialect gate (both dialects run the cascade); the migration-declared-`Application` scan is documented as SQL-Server-only (a PostgreSQL follow-up); `RunFkGraphTeardown`/`RemoveAppEntityMetadata` now warn that the raw-SQL teardown bypasses the `BaseEntity` pipeline (no cache invalidation) for in-process callers; the cross-schema-FK limitation and the downloaded-migrations temp-dir cleanup are addressed.

- bfd0de1: Fix Open-App remove/reinstall teardown. `RemoveAppEntityMetadata` now clears **all** of an entity's FK-dependent `__mj` metadata via a dynamic, FK-graph-driven cascade (enumerated from the live FK graph) instead of a hardcoded shortlist — so removing an app that has been _used_ no longer fails on a foreign-key violation (e.g. an orphaned `RecordChange`). It also deletes the app-owned `Application` rows declared in the app's own migrations (unioned with the existing link-based detection), preventing a `PK_Application_ID` collision when the app is reinstalled. (The cascade is dialect-driven and runs on both SQL Server and PostgreSQL — see the companion changeset for the dialect / PG-parity details.)
- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- 33741fc: Make `mj app` install/upgrade/uninstall resumable and idempotent. The install orchestrator now records its last-completed step (new `OpenApp.LastCompletedStep` and `OpenApp.LastCompletedStepTargetVersion` columns) so a crashed or interrupted run picks up where it left off instead of re-running already-applied steps, and mutex guards prevent concurrent install/upgrade/uninstall operations against the same app from racing each other.
- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/sql-dialect@5.45.1

## 5.45.0

### Patch Changes

- 21e33fe: Move Skip to a client-side Open App and remove server-embedded agent; scope-gate query/view/search resolvers with API-key scope authorization; add credential-store fallback for component registry keys; support Open App in-process lifecycle hooks with interactive prompts.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/sql-dialect@5.45.0

## 5.44.0

### Minor Changes

- 7279819: Fixes PostgreSQL lowercase-schema entity class names breaking mixed-case OpenApp builds.

### Patch Changes

- 6cf6c43: Fix `mj app install` corrupting `mj.config.cjs` (#2975). When inserting a new top-level section (`dynamicPackages` / `entityPackageName`) before the closing brace of `module.exports = { ... }`, the preceding property is now comma-terminated, so a config whose last property is a brace-terminated block (e.g. `openApps: { ... }` with no trailing comma) stays valid JavaScript instead of breaking the next `require('mj.config.cjs')` (the `mj migrate` / `mj codegen` / build steps an install runs). The comma logic is string- and comment-aware so a `//` inside a value like `'http://x'` or braces inside strings are never miscounted. Additionally, every config write (all six add/remove/toggle functions) now passes through a post-write parse guard that compiles the result first and, on any malformed output, fails loudly with the file left untouched — so a bad edit can never silently ship a broken config.
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Minor Changes

- 9200b13: feat(open-app): connector-extraction modality — multi-app repos, in-repo subpath, teardown, and `OpenApp.Subpath`

  Adds the Open-App capabilities needed to ship vendor connectors as installable apps from a single multi-app repo (e.g. `MemberJunction/Integrations`):
  - **Multi-app repos via in-repo subpath** — `mj app install <repo>/<subpath>` resolves a per-app manifest under a subdirectory; scoped-tag version resolution (`<subpath>@<version>`) per app.
  - **`OpenApp.Subpath` column** (migration + CodeGen) persists which in-repo directory an app installed from, so upgrade/remove re-fetch the right manifest.
  - **Remove-time teardown** (`migrations.teardownDirectory`) — retires the rows an app's seed migrations wrote into the shared core schema (`__mj` Integration/IO/IOF/Action), which dropping the app's own schema cannot reach. Platform-aware (`-pg` on Postgres) + subpath-aware.
  - **Array-form `dependencies`** accepted in the manifest (normalized to a record), so apps that ship `dependencies` as an array of `{ name, repository, versionRange }` validate and install.

### Patch Changes

- a95ef89: fix(open-app): `mj app` runtime-load + lifecycle correctness, plus installer/Explorer fixes

  The next-applicable subset of the OpenApp lifecycle audit — runtime-load and install/upgrade/remove correctness — across four packages:
  - **`@memberjunction/open-app-engine`.** Makes an installed Open App actually take effect and the lifecycle reversible/repeatable: installed server packages load at boot from `dynamicPackages.server[]` (and their generated GraphQL resolvers enter the live schema), and installed client packages are recorded in `dynamicPackages.client[]`; install status + reinstall correctness (npm-install failure leaves the app `Disabled` not falsely `Active`; an `Error`-state app is reinstallable; rollback drops only a schema we created; migrations baseline so a `V1` migration is never skipped); atomic upgrade dependency rewrite; and remove data-safety (DB-first ordering, co-tenant shared-schema guard, and metadata cleanup committed in one transaction on PostgreSQL). Also removes an app's **own `Application` row on uninstall** — an app's metadata-sync migration registers an `Application` (fixed UUID) grouping its entities; removal previously left it orphaned, so a reinstall's migration re-`INSERT`ed the same UUID and failed on `PK_Application_ID`. Removal now deletes an Application **wholly owned** by the removed schema (best-effort, after the atomic metadata commit; an Application that also groups other apps' entities, or one with user-added dependents, is left intact and reused). +unit tests.
  - **`@memberjunction/cli`.** The Open App client load mechanism now lives in distributed packages instead of bespoke MJExplorer files. `mj codegen manifest` gains `--open-app-client-bootstrap`: after generating the class-registrations manifest, it appends a managed, idempotent block of side-effect imports — one per installed Open App client package recorded in `dynamicPackages.client[]` — so the apps' `@RegisterClass` decorators run when the client bundle loads. The block is rebuilt on every run, so it tracks install/remove/enable/disable (each of which edits `dynamicPackages.client`). This lets MJExplorer drop its hand-written `ensure-open-app-bootstrap.mjs` script, the separate generated bootstrap file, and the extra `app.module.ts` import — keeping the app paper-thin (changes there don't auto-distribute like npm packages). +unit tests for the pure block transform.
  - **`@memberjunction/installer`.** The configure phase wrote a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets via `git init && git add .`. It now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`); idempotent — appends only missing entries, never rewriting user lines.
  - **`@memberjunction/ng-explorer-app`.** Fixes an MJExplorer login crash where `MJNotificationService.Instance` was read before DI constructed the singleton (surfaced by magic-link's instant, no-redirect login) — the service is now injected into `MJExplorerAppComponent` so it's constructed before `handleLogin` runs.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0

## 5.42.0

### Patch Changes

- 63d7610: App-level PostgreSQL support (code-only — no schema/metadata changes):
  - **open-app-engine**: `mj app install/upgrade/remove` now work on PostgreSQL — the CLI orchestrator
    builds a `PostgreSQLDataProvider` when `dbPlatform=postgresql` (was hardcoded to SQL Server), and
    the installer selects the platform-specific migration directory (`<dir>-pg` / `migrations.directoryPostgres`)
    so PG apps run plpgsql migrations instead of T-SQL.
  - **db-auto-doc**: dialect-aware description write-back — emits PostgreSQL `COMMENT ON` statements
    (double-quoted identifiers, no `sp_addextendedproperty` / `GO`) when the configured provider is postgresql.

- b7092ca: PostgreSQL runtime correctness, found during fresh-DB PG end-to-end testing:
  - **codegen-lib**: clean MJAPI engine load on PostgreSQL — `AutoUpdatePath` written as a
    dialect-correct boolean literal, plus a PG-only migration removing orphan related-entity-name
    virtual EntityField rows whose column the generated PG base view never emits (these crashed
    EntityActionEngine / AI Credential Bindings / Scheduling with `column "..." does not exist`).
  - **open-app-engine**: app uninstall now deletes all FK-dependent metadata (Entity Field Values,
    Entity Settings) in dependency order and reports a real failure instead of swallowing errors
    into a false "success".
  - **postgresql-dataprovider**: dialect-correct per-field entity-search predicate (no `N'...'`
    literal prefix, no `ESCAPE` clause) — fixes `syntax error at or near "ESCAPE"` on live search.

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- 21d967f: feat(open-app): resolve the full transitive dependency graph up front, with real cross-repo cycle detection; forward `AllowDoubleUnderscoreSchema` / `Verbose` to dependency installs

  `mj app install` now fetches every reachable dependency's manifest and resolves the complete transitive graph before installing anything, installing members in leaf-first topological order. This detects genuine cross-repo cycles (e.g. `A -> B -> A`) and fails fast with a clear message instead of recursing unbounded. Resolution runs once up front; pre-resolved members install without re-resolving their own subtrees.

  Also fixes a latent bug in the existing recursive install: the `--dangerously-ignore-dbl-underscore-schema-rule` override (and `--verbose`) set on the top-level `mj app install` were not forwarded to the recursive dependency installs. An app whose dependency uses a `__`-prefixed schema (e.g. BCSaaS → `mj-bizapps-common` with schema `__mj_BizAppsCommon`) would fail at the dependency step with "Schema names starting with '\_\_' are reserved for MJ internals" even when the override was set on the parent. Inherited install-behavior options now propagate to dependency installs. App-identity options (`Source`, `Version`) are intentionally not forwarded — each dependency has its own.

  Public `InstallApp`/`UpgradeApp` signatures are unchanged.

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 39710b1: Fix baseline migrations being silently skipped during `mj app install`. The install orchestrator passed `BaselineVersion: '0'` to Skyway, but the resolver only auto-selects the highest baseline file when `BaselineVersion === '1'`. Changed to `'1'` so baseline files (B\* prefix) are correctly discovered and executed on fresh database installs. Also allowed mixed-case schema names in manifest validation (SQL Server is case-insensitive) to support apps like BizApps Common (`__mj_BizAppsCommon`).
- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- 29a1fad: no migration/metadata, just da patch
- 0279a5c: Open App: exact version pins, per-repo tokens, and workspace-wide prefix bumps
  - `--version` flag now pins packages to exact versions (no ^ prefix) and validates the GitHub tag exists before proceeding
  - Per-repo GitHub token map (`openApps.github.tokens`) for multi-private-repo dependency chains
  - `GetLatestVersion` falls back to tags when no GitHub Releases exist
  - Schema reuse when `createIfNotExists: true` and schema already exists (adopts sidestep installs)
  - Don't pass `--registry` for default npm registry (fixes private scoped package auth)
  - Prevent duplicate `dynamicPackages.server` entries on re-install
  - npm install failures demoted to warnings when package.json was updated (auth issues don't abort install)
  - `packages.prefix` manifest field for workspace-wide dependency bumps during install/upgrade

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- 21a04c1: Support per-schema entity package resolution in CodeGen for OpenApp multi-package distribution
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 6214edf: feat: Provider-agnostic OpenApp Engine with configurable project layouts, package manager auto-detection, Azure SQL support, and MJ version fallback detection

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- 8a11457: Add centralized fire-and-forget pattern for all long-running GraphQL mutations (RunTest, RunTestSuite, RunAIAgent, RunAIAgentFromConversationDetail) to avoid Azure's ~230s HTTP proxy timeout. Use fire-and-forget mutation to avoid Azure proxy timeouts on agent execution, allow \_\_ prefixed schema names in Open App manifest validation, add inlineSources to Angular tsconfig for vendor sourcemap support, and add .env.\* to gitignore
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/core@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Minor Changes

- 61079e9: Add Open App system for installing, managing, and removing third-party apps via `mj app` CLI commands. Includes manifest validation, dependency resolution, schema isolation, migration execution, npm package management, and config-manager integration.

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
