# `scripts/` — repository script registry

Ad-hoc and release-engineering scripts for the MemberJunction monorepo. This file is the
complete index — every file in this directory appears below exactly once.

**What does *not* live here:**

- **CI gates** live in [`.github/scripts/`](../.github/scripts/) and are wired into workflows
  (`check:ui`, `check:esm`, `check:codegen-tail`, `check:browser-manifest`, …). Run them via
  their root `package.json` aliases — see the *Local CI mirrors* section of the root
  [`CLAUDE.md`](../CLAUDE.md).
- **Supported developer commands** live in the `mj` CLI ([`packages/MJCLI`](../packages/MJCLI/)).
  If a task has an `mj` subcommand, prefer it over anything in this directory.

**Status column:** ✅ active — a script you would plausibly run today. 🕰️ historical — written
for one past migration or incident, kept for provenance; read it before running it, since many
hardcode database names, credentials, or paths from the moment they were written.

| Category | Scripts |
|---|---|
| [Dependencies](#dependencies) | 4 |
| [Testing/DOM](#testing-dom) | 12 |
| [Migrations](#migrations) | 4 |
| [PostgreSQL](#postgresql) | 30 |
| [Metadata/Data](#metadata-data) | 8 |
| [UI/Design](#ui-design) | 7 |
| [Docs/Audit](#docs-audit) | 1 |
| [Misc](#misc) | 1 |
| **Total** | **67** (49 active, 17 historical, 1 unclassified) |

---

## Dependencies

Knip-driven dependency hygiene across the workspace. These are the ones with root `package.json` script aliases.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `fix-missing-dependencies.mjs` | ✅ | Runs Knip for unlisted imports, writes each missing dep into the owning package.json, then runs `npm install` at the repo root. | When dependency-check CI flags missing deps — but this repo is pnpm, so let its npm install step fail/skip and run pnpm install yourself. | `pnpm run deps:fix-missing  (preview: pnpm run deps:fix-missing:dry)` |
| `format-knip-report.mjs` | ✅ | Turns raw `knip --reporter compact` output into a markdown PR comment grouped by package, filtering false positives like src/dist/lib. | Run by the dependency-check workflow; run locally to preview the PR comment from a knip-report.txt you captured yourself. | `node scripts/format-knip-report.mjs <knip-output-file>  (defaults to knip-report.txt)` |
| `post-changeset-version.js` | 🕰️ | Rewrites @memberjunction/core+global and every dep on them back to a hardcoded 2.100.3 after `changeset version`, then npm install. | Never — dead weight: core is at 6.1.0, the repo uses pnpm not package-lock.json, and no package.json script invokes it. | `node scripts/post-changeset-version.js` |
| `remove-unused-dependencies.mjs` | ✅ | Runs Knip, strips the deps it reports as unused from each package.json, waits 5s, then runs `npm install` (not pnpm) at the root. | During a dependency cleanup pass — run the :dry variant first; the trailing npm install conflicts with this repo's pnpm lockfile. | `pnpm run deps:remove-unused (preview: pnpm run deps:remove-unused:dry)` |

## Testing/DOM

Test scaffolding, DOM-spec reporting, and live end-to-end probes you run by hand against a real database or API.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `check-dom-spec-placement.mjs` | ✅ | Fails if any *.dom.test.ts sits inside a __tests__/ dir, where the dual vitest presets match it in neither project so it silently never runs. | Before pushing Angular DOM specs; this is the CI gate wired into .github/workflows/test.yml. | `node scripts/check-dom-spec-placement.mjs packages` |
| `check-spec-antipatterns.mjs` | ✅ | Lints *.test.ts for test theater: vacuous expects, bare skips, NO_ERRORS_SCHEMA, and `as any` — with an allowlist gracing legacy node specs only. | Before pushing tests; CI gate in test.yml. Burn its ALLOWLIST down, never add new code to it. | `node scripts/check-spec-antipatterns.mjs packages` |
| `classify-explorer-components.mjs` | ✅ | Buckets every Explorer component as covered/deferred/in-scope for DOM tests; --min fails below a coverage %, --register writes the deferral register. | When adding an Explorer component or checking the DOM-coverage gate; CI runs it as --min 85 despite the file's "one-off" header comment. | `node scripts/classify-explorer-components.mjs --min 85` |
| `dom-test-report.mjs` | ✅ | Scores every Angular component's DOM-test coverage (solid/partial/stub/none) by test count, @Output coverage and selector usage. | When adding an Angular component or ratcheting coverage; CI (test.yml) runs it with --max-none on Generic and Bootstrap. | `node scripts/dom-test-report.mjs packages/Angular/Generic --max-none=134` |
| `gen-dom-stub.mjs` | ✅ | Emits a *.component.dom.test.ts stub of TODOs from a component's TS-AST surface; --write also wires the package's vitest + tsconfig.spec. | When starting a DOM test for an Angular component, especially one dom-test-report.mjs ranks as none/stub. | `node scripts/gen-dom-stub.mjs <path/to/x.component.ts> [--write] [--no-config]` |
| `integration-golden-diff.mjs` | ✅ | Diffs two EMIT_OUTCOMES JSON files for one integration suite by check id (S1/C3), failing on missing/extra checks or pass-fail mismatches. | After moving integration checks from a standalone tsx script into the test driver, to prove no check was lost or silently flipped. | `node scripts/integration-golden-diff.mjs <orig.json> <migrated.json> [suiteLabel]` |
| `scaffold-tests.mjs` | ✅ | Writes vitest.config.ts, a src/__tests__ starter spec and test scripts into a package; --dom adds the Angular jsdom/TestBed preset. | When adding the first tests to a package that has none — run before writing specs; use --dom for Angular component DOM tests. | `node scripts/scaffold-tests.mjs <package-directory> [--dom]` |
| `test-esignature-send.mjs` | ✅ | Sends a real DocuSign demo envelope through SignatureEngine against a live MJ DB, using a hardcoded account ID and recipient email. | After changing @memberjunction/esignature or the DocuSign driver — edit the hardcoded SIGNATURE_ACCOUNT_ID/recipient before running. | `node scripts/test-esignature-send.mjs  (reads DB_* from .env)` |
| `test-search-entity.ts` | ✅ | Live end-to-end run of Provider.SearchEntity — lexical, semantic and hybrid RRF passes — prints ranked hits with resolved record names. | When changing search/embedding plumbing and you need to eyeball real ranked results — no UI surfaces SearchEntity yet. | `npx tsx scripts/test-search-entity.ts [--entity "MJ: Users"] [query] [topK]` |
| `test-segments.ts` | 🕰️ | Writes, lists, deletes and re-reads segmented .webm objects through the Box file-storage driver on a hardcoded 'Praxis Box Demo' account. | One-off verification of Box 2-level folders + per-object delete; only runs if a 'Praxis Box Demo' storage account exists in your DB. | `npx tsx scripts/test-segments.ts` |
| `vendor-smoke.ts` | ✅ | Runs one AI prompt twice per active inference vendor via AIPromptRunner, then tables token counts, cache read/write, cost, TTFT per run. | After changing token normalization, prompt caching, or cost calculation — to compare vendors side by side in one live run. | `npx tsx scripts/vendor-smoke.ts [--prompt "Name"] [--vendor Groq]` |
| `verify-bundle-smoke.mjs` | ✅ | Opens an `mj bundle` ZIP and asserts entry count plus the required root, MJAPI, MJExplorer and SQL Scripts entries are present. | After changing MJInstaller's DistributionAssembler or the bundle CLI — it is also the assertion step in the claude-pack CI workflow. | `node scripts/verify-bundle-smoke.mjs <path-to-zip>` |

## Migrations

T-SQL migration authoring and debugging aids. Migration *conventions* live in [`migrations/CLAUDE.md`](../migrations/CLAUDE.md).

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `escape-flyway-both-patterns.js` | ✅ | Rewrites ${x} and $${x} in one migration file to SQL concat form ($'+'{x}) so Flyway won't read them as placeholders; makes a backup. | Before running a migration whose SQL embeds literal JS template-literal strings that Flyway would reject as unresolved placeholders. | `node scripts/escape-flyway-both-patterns.js <migration-file>` |
| [`FLYWAY_PLACEHOLDER_SOLUTION.md`](FLYWAY_PLACEHOLDER_SOLUTION.md) | ✅ | Explains how to stop Flyway eating JS template literals like ${type} inside migration SQL, using $'+'{ string-concatenation escaping. | When a migration fails with "No value provided for placeholder" because its SQL embeds ${...} literals that are not Flyway placeholders. | `n/a (reference doc)` |
| `generate-v545-metadata-reseed.mjs` | 🕰️ | Regenerates the committed v5.50 PG reseed migration that heals v5.45's missing metadata; guards CREATEs, drops later-superseded UPDATEs. | One-shot artifact for issue #3253; the migration is already committed, so nobody re-runs this except to re-review the supersession analysis. | `node scripts/generate-v545-metadata-reseed.mjs --converted <legacy-converted.pg.sql> [--out <path>]` |
| `run-migration-debug.mjs` | ✅ | Runs a T-SQL migration batch-by-batch (split on GO) in a transaction, naming the failing batch's line range; rolls back unless --commit. | When a migration fails with an unhelpful error and you need the exact offending line before re-running mj migrate. | `node scripts/run-migration-debug.mjs <migration-file> [--commit]` |

## PostgreSQL

The PostgreSQL conversion toolchain — snapshot, convert, apply, diff, verify. **Read [`migrations/CLAUDE.md`](../migrations/CLAUDE.md) first:** PG conversion is run by the build engineer at release time, not per feature PR. Most of these are release-engineering tools, not day-to-day development tools.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `audit-baseline-completeness.mjs` | ✅ | Parses each .pg.sql migration for objects it creates, then queries a PG database to confirm each exists; exits nonzero listing what is missing. | After regenerating the PG baseline, or to verify a PG database really contains everything the migration files declare. | `PG_PASSWORD=... PG_DATABASE=mj_pg_baseline_test node scripts/audit-baseline-completeness.mjs` |
| `check-pg-migration-content.mjs` | ✅ | Flags .pg.sql counterparts that are effectively empty beside a substantial T-SQL source, unless marked with -- PG-EMPTY-BY-DESIGN or grandfathered. | After mj migrate convert emits PG counterparts, to catch silently-dropped conversions; CI gate in pg-migrations.yml (--self-test validates it). | `node scripts/check-pg-migration-content.mjs` |
| `compare-pg-ss-snapshots.mjs` | ✅ | Diffs SQL Server vs PostgreSQL snapshot dumps, classifying each difference as real drift, known MJ type override, or dialect alias. | After snapshot-ss.sh/snapshot-pg.sh, to verify a PG conversion matches SS without flagging intentional TIMESTAMPTZ/type-alias diffs. | `node scripts/compare-pg-ss-snapshots.mjs <ss-prefix> <pg-prefix>` |
| `fix-bool-comparisons.mjs` | 🕰️ | Rewrites "BoolCol" = 0/1 to = FALSE/TRUE in WHERE/SET clauses of PG migration .sql files, skipping INSERT VALUES, CHECK and comments. | One-off aid from the pg_cast-removal effort; needs a hand-built /tmp/pg-boolean-cols.txt dumped from a live PG — nobody runs it today. | `node scripts/fix-bool-comparisons.mjs <dir>  (also requires /tmp/pg-boolean-cols.txt)` |
| `fix-bool-constraint-bug.mjs` | 🕰️ | Repairs converter output that turned (1) into TRUE inside ALTER TABLE ... CHECK expressions on INTEGER columns, restoring >=1 / <=0. | One-time repair for a past SQLConverter bug; the converter no longer emits this pattern, so the script is dead weight now. | `node scripts/fix-bool-constraint-bug.mjs <file1> [file2...]` |
| `fix-pg-cast-and-booleans.mjs` | 🕰️ | Strips the `UPDATE pg_cast` block from PG migration files and rewrites 0/1 at BOOLEAN column positions in INSERT VALUES to FALSE/TRUE. | One-off from making the v5.x PG baseline installable on managed Postgres; needs a live-DB-derived /tmp/pg-boolean-cols.txt to run at all. | `node scripts/fix-pg-cast-and-booleans.mjs <migrations-dir> [--dry-run]` |
| [`pg-bootstrap-helpers.sql`](pg-bootstrap-helpers.sql) | ✅ | Creates the cdp_* roles, installs the spGetPrimaryKeyForTable function, and seeds a System user with Developer/UI roles on a PG database. | On a PG database that has migrations applied but has not run CodeGen yet — CodeGen fails without these roles and the PK helper. | `psql -d <db> -f scripts/pg-bootstrap-helpers.sql` |
| `pg-codegen-await.mjs` | ✅ | Runs MJ CodeGen in-process and awaits it, exiting non-zero on failure; the bare `mj codegen` CLI can fire-and-forget and exit 0 as a no-op. | Any scripted or CI CodeGen run, especially on PostgreSQL, where a silent exit-0 no-op would otherwise go unnoticed. | `DB_PLATFORM=postgresql DB_HOST=... DB_DATABASE=... DB_USERNAME=... DB_PASSWORD=... node scripts/pg-codegen-await.mjs [--skipfiles] [--skipdb]` |
| `pg-crud-oracle.mjs` | ✅ | Exercises every entity's generated spCreate/spUpdate/spDelete on a PG database in rolled-back transactions, verifying round-tripped values. | After a PG migration + CodeGen run, to catch generated CRUD that exists but misbehaves — name-level parity cannot see that. | `ORACLE_DB=<db> node scripts/pg-crud-oracle.mjs [--only "Entity Name"]` |
| `pg-diff-non-header.mjs` | ❓ | Compares regenerated .pg.sql to a snapshot after stripping a fixed 22-line converter header, splitting diffs into cosmetic vs substantive. | Only when triaging converter regeneration diffs; the 22-line header constant is pinned to a past converter build, so re-verify it first. | `node scripts/pg-diff-non-header.mjs <snapshot-dir> [regen-dir]` |
| `pg-diff-regenerated.mjs` | ✅ | Diffs regenerated .pg.sql against a snapshot dir: files the converter missed or added, identical vs differing, per-file byte/line deltas. | After re-running the T-SQL to PG converter over a migration set, to see what changed relative to the committed .pg.sql output. | `node scripts/pg-diff-regenerated.mjs <snapshot-dir> [regen-dir]` |
| `pg-install-fresh.mjs` | ✅ | Ten-step fresh PG install: drop/create DB, scaffold from a template dir, patch in local Skyway+MJ builds, migrate, CodeGen, seed a user. | End-to-end smoke test of the PG install path; needs a local Skyway checkout, a template sqlserver-install dir, and auth/encryption secrets. | `SKYWAY_ROOT=... SOURCE_INSTALL=... TARGET_DIR=... PG_ADMIN_PASSWORD=... MJ_BASE_ENCRYPTION_KEY=... WEB_CLIENT_ID=... TENANT_ID=... node scripts/pg-install-fresh.mjs` |
| `pg-parallel-pilot.sh` | 🕰️ | Converts migrations/v5 with the AST dialect into its own fresh PG DB, then reports table/column/type drift against a DB pg-migrate built. | Historical pilot that answered whether split-and-regenerate could replace pg-migrate; that path shipped as the /pg-migrate-v2 flow. | `./scripts/pg-parallel-pilot.sh <pgMigrateDB> [astDB] [migrationsDir]` |
| `pg-ss-parity.sh` | ✅ | Name-level diff of __mj tables, FK names, views and CRUD sprocs between a PostgreSQL DB and a SQL Server DB built from the same migrations. | After building both platforms from one migration set, to confirm structural parity; needs the postgres-claude container and local sqlcmd. | `./scripts/pg-ss-parity.sh [pgDb] [ssDb]  (defaults: mj_pg_540 / MJ_SS_540)` |
| `pgdiff-apply-faithful.sh` | ✅ | Stages the highest-versioned B*.pg.sql baseline plus every later V*.pg.sql, then hands that set to pgdiff-apply-psql.sh in version order. | When filling a scratch PG database from a directory of converted .pg.sql files the way a real fresh `mj migrate` would. | `./scripts/pgdiff-apply-faithful.sh <db> <dir-of-pg-sql> [errlog]` |
| `pgdiff-apply-psql.sh` | ✅ | Substitutes ${flyway:defaultSchema} with __mj and psql-applies each .pg.sql in order with ON_ERROR_STOP off, tallying ERROR lines per file. | For an error census across a converted migration set rather than a stop-on-first-failure apply; assumes the postgres-claude container. | `./scripts/pgdiff-apply-psql.sh <db> <dir-of-pg-sql> [errlog]` |
| `pgdiff-bootstrap.sh` | ✅ | Builds a fresh PG database from AST-converted migrations: baseline, metadata-view pack, post-baseline V files, then mj codegen. | When standing up a codegen-complete PostgreSQL database from repo files only, as step 2 of the split-and-regenerate PG pipeline. | `./scripts/pgdiff-bootstrap.sh <db> <astDir> [packFile]` |
| `pgdiff-convert-ast.mjs` | ✅ | Converts a directory of T-SQL migrations to .pg.sql: strips codegen/metadata DML, then transpiles via the SQLGlot mj_postgres dialect. | Before pgdiff-bootstrap.sh — step 1 of the split-and-regenerate PG pipeline; needs the /tmp/sqlglot-venv Python env. | `node scripts/pgdiff-convert-ast.mjs <sourceDir> <outDir>` |
| `pgdiff-snapshot.sh` | ✅ | Dumps a PG database's __mj tables, columns, routines, views and column comments to five sorted text files for diffing. | When comparing two PG databases (e.g. AST-built vs migrations-pg-built); needs the postgres-claude Docker container. | `./scripts/pgdiff-snapshot.sh <db> <output-prefix>` |
| [`README-migration-equivalence.md`](README-migration-equivalence.md) | ✅ | Workflow for proving a ported PG migration yields the same schema as its T-SQL original: snapshot both DBs before/after, then diff the deltas. | When verifying a converted .pg.sql matches its SQL Server source; drives snapshot-ss.sh / snapshot-pg.sh and lists cross-platform type aliases. | `n/a (reference doc)` |
| `regenerate-pg-baseline.sh` | 🕰️ | pg_dumps __mj from a live PG database (minus runtime tables), scrubs PII and boolean defaults, writes a Flyway B*.pg.sql baseline. | Historical — built for the v5.30 baseline; the committed v5.46 PG baseline uses the newer pre/post-data split method instead. | `PGDATABASE=<db> PGUSER=<user> PGPASSWORD=<pw> bash scripts/regenerate-pg-baseline.sh` |
| `run-pg-migrate.mjs` | 🕰️ | Runs Skyway against migrations-pg/v5 with hardcoded localhost credentials, printing per-migration pass/fail and full failure detail. | One-off debugging harness — DB name and password are hardcoded (mj_pg_dev), so edit before use; `mj migrate` is the real path. | `node scripts/run-pg-migrate.mjs (no args; edit DB_CONFIG in the file first)` |
| `snapshot-pg.sh` | ✅ | Dumps a PG __mj schema's tables, columns, constraints, routines, views and non-unique indexes to six sorted text files for diffing. | Before/after applying a ported migration, to prove SS↔PG parity; hardcodes a Windows psql.exe path and password — edit for Linux. | `bash scripts/snapshot-pg.sh <db-name> <output-prefix>` |
| `snapshot-ss.sh` | ✅ | Same six-file schema dump as snapshot-pg.sh but for SQL Server, via sqlcmd inside the mj-sql Docker container. | Paired with snapshot-pg.sh in the migration-equivalence workflow; needs the mj-sql container and its hardcoded sa password. | `bash scripts/snapshot-ss.sh <db-name> <output-prefix>` |
| `ss-pg-view-equivalence.mjs` | ✅ | Transpiles every vw* T-SQL view from migrations/v5 into a scratch PG schema and diffs pg_get_viewdef against the live __mj views. | After a PG build, to catch views that exist on both platforms but behave differently; exits 1 on any real semantic divergence. | `EQUIV_DB=<pg-db> node scripts/ss-pg-view-equivalence.mjs` |
| `test-pg-autoquoter-coverage.mjs` | ✅ | Fires 19 GraphQL view/entity queries at a running MJAPI and flags any that error, exposing identifier-quoting failures in PG SQL. | After changing PostgreSQLDataProvider.ExecuteSQL/autoQuoter, with MJAPI running against PG; correlate failures with the MJAPI log. | `MJ_API_KEY=<key> node scripts/test-pg-autoquoter-coverage.mjs  (MJ_API_ENDPOINT defaults to http://localhost:4001/)` |
| `test-pg-ci-flow.mjs` | ✅ | Simulates the pg-migrations CI workflow locally: creates mj_pg_ci_test, converts v5 T-SQL→PG, applies migrations, reports schema parity. | Pre-flight before pushing PG migration changes; hardcoded to migrations/v5 and migrations-pg/v5, so it needs edits for v6. | `PG_PASSWORD=<pass> node scripts/test-pg-ci-flow.mjs [--skip-convert]` |
| `test-single-migration.mjs` | ✅ | Applies one .sql file to a local Postgres DB with ${flyway:defaultSchema} replaced by __mj, printing the error position and surrounding SQL. | When a converted PG migration fails and you need to isolate the exact character offset Postgres choked on. | `node scripts/test-single-migration.mjs <path-to-sql-file>  (PG_* env vars; DB defaults to mj_pg_ci_test)` |
| `validate-pg-codegen.mjs` | ✅ | Generates views/CRUD functions/permissions from PostgreSQLCodeGenProvider with mock entities and executes them against a real PG test DB. | After changing PostgreSQLCodeGenProvider; needs CodeGenLib built and a mj_pg_codegen_test DB with the v5 PG schema + cdp_* roles. | `PG_PASSWORD=<pass> node scripts/validate-pg-codegen.mjs` |
| `validate-pg-metadatasync.mjs` | 🕰️ | Seeds a System user, then checks MetadataSync's PG provider init, UserCache load, transaction commit/rollback, and pool cleanup. | Written as one-time proof for the MetadataSync PG port; rerun only if you touch provider-utils PG init and have mj_pg_codegen_test. | `PG_PASSWORD=<pass> node scripts/validate-pg-metadatasync.mjs` |

## Metadata/Data

Bulk metadata and reference-data authoring helpers. Most are one-shot fills whose output is already committed.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `check-recording.ts` | ✅ | Prints the 5 newest AI Agent Sessions, reads one session's recording file back out of file storage, and dumps its per-turn transcript timings. | When debugging why a realtime agent session's audio recording or utterance timings did not persist; needs .env DB config. | `npx tsx scripts/check-recording.ts` |
| `clear-knowledge-hub-data.mjs` | ✅ | Deletes all Knowledge Hub rows (ContentItem, tags, EntityRecordDocument, ContentProcessRun) in FK order, then wipes every Pinecone namespace. | Destructive: run against a dev DB to reset before re-running Knowledge Hub ingestion/classification from scratch. Needs .env DB_* + Pinecone key. | `node scripts/clear-knowledge-hub-data.mjs` |
| `fix-boundary-file-refs.mjs` | 🕰️ | Rewrites @file:boundaries/... refs in state-province metadata to @file:by-country/XX/boundaries/..., reporting refs whose target is missing. | One-off cleanup — every @file: ref under metadata/state-provinces already carries the by-country prefix, so a run finds nothing to fix. | `node scripts/fix-boundary-file-refs.mjs` |
| `fix-state-province-metadata.mjs` | 🕰️ | Rewrites _CountryISO2 fields into CountryID @lookup refs and parses escaped CommonAliases JSON strings into real arrays, in place. | One-off cleanup already applied across metadata/state-provinces; only useful if new files arrive in the old _CountryISO2 shape. | `node scripts/fix-state-province-metadata.mjs` |
| `generate-missing-state-provinces.mjs` | 🕰️ | Fetches ISO 3166-2 data from GitHub and writes .xx-states.json subdivision metadata for countries not yet present under by-country/. | One-off seeding aid — all 234 countries with subdivisions already have files, so a run today skips everything and creates nothing. | `node scripts/generate-missing-state-provinces.mjs` |
| `link-boundary-geojson.mjs` | ✅ | Rewrites state-province metadata JSON so each record's BoundaryGeoJSON points at @file:boundaries/<ISO3166-2>.geojson when that file exists. | After dropping new .geojson boundary files into metadata/state-provinces/by-country/<CC>/boundaries/, before mj sync push. | `node scripts/link-boundary-geojson.mjs` |
| `populate-boundaries-from-naturalearth.mjs` | 🕰️ | Writes Natural Earth admin-1 polygons into metadata/state-provinces boundaries/*.geojson and fills each record's lat/lng and @file ref. | One-time bulk fill — the ~2,900 geojson files are already committed; only re-run after refreshing /tmp/ne_admin1.geojson. | `node scripts/populate-boundaries-from-naturalearth.mjs (requires /tmp/ne_admin1.geojson)` |
| `provision-box-storage.ts` | 🕰️ | Creates the Praxis Box Demo storage provider/credential/account via the MJ ORM, uploads a test WAV to Box, and points a co-agent at it. | One-off Praxis demo setup — hardcodes the account names and a specific Realtime Co-Agent UUID; needs STORAGE_BOX_* vars in .env. | `npx tsx scripts/provision-box-storage.ts (from repo root)` |

## UI/Design

Screenshot capture and UI adoption measurement, used with the `playwright-cli` skill.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `alert-backdrop-independence.sh` | 🕰️ | Renders the same <mj-alert> error on 4 different backdrops in light and dark to a static HTML page, proving its tint is opaque not translucent. | One-off harness that proved a past dark-mode alert-color fix; only worth rerunning if alert backgrounds ever go translucent again. | `bash scripts/alert-backdrop-independence.sh` |
| `alert-migrated-instances.sh` | 🕰️ | Renders a hardcoded snapshot of the actual alerts produced by the mj-alert migration into one light/dark HTML page for eyeballing. | One-off review aid from the completed alert migration; the instance list is frozen in the script and is now stale. | `bash scripts/alert-migrated-instances.sh` |
| `alert-states-gallery.sh` | ✅ | Builds a static light/dark HTML gallery of every <mj-alert> variant/size/state, using CSS extracted live from alert.component.ts plus real tokens. | After changing mj-alert, to eyeball all its states without running the app; note it writes into the plans/complete/ archive folder. | `bash scripts/alert-states-gallery.sh` |
| `audit-explorer-pages.mjs` | ✅ | Playwright-walks ~60 hardcoded Explorer routes, screenshotting landing/detail/filters and recording per-page UI-chrome flags into manifest.json. | When auditing Explorer pages for design-system consistency; needs Explorer on :4201 and /tmp/mj-audit-storage-state.json login state. | `node scripts/audit-explorer-pages.mjs` |
| `build-audit-index.mjs` | ✅ | Turns plans/explorer-page-audit/manifest.json into a self-contained index.html gallery of the screenshots plus modern/legacy chrome badges. | Right after audit-explorer-pages.mjs finishes, to browse its results as one page; it fails without that manifest. | `node scripts/build-audit-index.mjs` |
| `measure-ui-adoption.sh` | ✅ | Greps packages/Angular for canonical MJ components vs bespoke markup and writes a date-stamped adoption table to plans/adoption-metrics.md. | When reporting progress on the UI consistency program, or before/after a batch migration to a canonical component. | `pnpm run check:ui:adoption` |
| `visual-shot-dual.sh` | ✅ | Screenshots the current playwright-cli page in light and dark by toggling data-theme, writing two PNGs and leaving the app in light. | Standard capture for any UI visual check; repoint its DIR out of plans/complete/ first — it writes into a finished archive folder. | `scripts/visual-shot-dual.sh <out-basename> [force-js]` |

## Docs/Audit

Documentation and audit index generation.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `fix-typedoc-configs.mjs` | ✅ | Checks every package's typedoc.json for the correct relative extends path and entryPoints, creating or rewriting them when given --fix. | After adding or moving a package, when the TypeDoc build skips it or resolves typedoc.base.json from the wrong directory depth. | `pnpm run docs:fix-configs  (dry run: pnpm run docs:fix-configs:dry)` |

## Misc

Everything else.

| Script | Status | What it does | When to use it | Run it with |
|---|---|---|---|---|
| `diag-recording.ts` | ✅ | Connects to the dev DB and prints recent AI Agent Sessions, their recording/storage provider config, and the 12 newest MJ: Files rows. | When a realtime agent recording did not get stored and you need to see whether the agent had recording providers configured. | `npx tsx scripts/diag-recording.ts` |

---

## Subdirectories

| Path | Contents |
|---|---|
| `lib/` | `component-surface.mjs` — shared helper for the Explorer component classifiers above. |
| `verification/` | `verify-agent-run-ui.mjs` — Playwright check of the agent-run UI. |

---

## Adding a script here

1. **Check it belongs here first.** A durable, contributor-facing command belongs in the `mj`
   CLI; an enforcement check belongs in [`.github/scripts/`](../.github/scripts/) with a
   workflow step and a `check:*` alias.
2. **Give it a header comment** — one paragraph saying what it does and what it assumes
   (database, container, env vars). Half the entries above needed their body read because the
   filename lied.
3. **Add a row above**, in the right category, with an honest status.
4. **Prefer arguments over hardcoded values.** The most common defect in this directory is a
   hardcoded database name, password, or absolute path that made the script single-use.
