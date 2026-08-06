# CodeGen Large-Schema & Operational Resilience Plan

**Status:** Re-scoped 2026-06-29 against current source. Original draft 2026-05-11 (NSTA/Aptify onboarding); first code-verification pass 2026-05-12.
**Author:** Captured 2026-05-11; re-scope by Pranav Rao.
**Trigger case:** Onboarding the Aptify product database for [National Science Teachers Association (NSTA)] — 2,116 `dbo` tables, ~390 GB, several tables in the 20–50M row range, heavy customer customization on top of the core Aptify product.

> ## ⚑ Re-scope note (2026-06-29)
>
> This plan sat for ~7 weeks while ~100 commits landed on `CodeGenLib` and the metadata hot-path. A four-cluster code audit on 2026-06-29 found that **most of the original Tier-1 correctness work and the entire metadata-refresh concern are already done or obsolete.** Rather than delete the history, every finding and task below now carries a **`STATUS (2026-06-29)`** box with the current code state and a citation.
>
> **What's actually left collapses into 4 workstreams — see [§9](#9-rescope-2026-06-29--the-four-workstreams).** The headline is parallelism: there is still **zero `worker_threads` / `os.cpus()` usage anywhere in CodeGen**, several generation loops are still serial, and the SQL-exec batch is still hardcoded at 5.

## 1. Problem Statement

MJ CodeGen works well for greenfield MJ projects and modest brownfield schemas, but on large, wide, complex schemas it hits the following operational realities:

- **Wall-clock time** balloons. A single CG run on the NSTA database is still running after several hours, with no clear progress signal.
- **Brittle failure modes.** A single SQL timeout (e.g., `RequestError: Failed to cancel request in 5000ms` from the `tedious` driver) can abort the entire run. There's no resume / checkpoint.
- **Operational blast radius.** Some operations (audit-column backfill via `UPDATE WHERE col IS NULL`) lock multi-million-row tables for minutes. On a 49M-row table this is 15–30 min of pure UPDATE time per table.
- **CG processes tables it shouldn't.** Things like `EntityRecordVersions` (Aptify's own audit/versioning system, 49M rows) get full MJ entity treatment — views, CRUD procs, audit columns added on top of the existing audit columns — when they should be skipped entirely. CG has no way to know.
- **Visibility is poor.** The CLI shows a spinner and occasional "Created new entity X" lines. Whether CG is making progress, stuck, or dead is not observable without querying the database directly.

> **STATUS (2026-06-29):** Two of these five are materially improved.
> - *Brittle failure on a single timeout* — the metadata load is no longer one fat query; it's a single dataset call fanned into 21 **parallel, per-item-cached** queries (`GenericDatabaseProvider.ts:3419-3630`), so one slow query no longer loses the whole load. See §2.2.
> - *Visibility* — a `CodeGenReporter` now records a full nested phase tree with durations to `~/.mj/codegen-state/run-<timestamp>.json` and a live elapsed-time ticker exists (`status_logging.ts:49-69`). The data is captured but **not yet surfaced** as phase/ETA output. See §2.5.
> - *Wall-clock*, *blast radius*, and *processes tables it shouldn't* remain real → Workstreams **A** (skip-entity) and **B** (parallelism) in §9.

## 2. Concrete Findings From the NSTA Run

The following were observed first-hand during the NSTA CG run, not theoretical. Each one is independently fixable and several are quick.

### 2.1 Default driver request timeout is too low

`packages/CodeGenLib/src/Config/db-connection.ts:36` — `tedious` request timeout defaults to 120s. The `dbRequestTimeout` config key exists ([config.ts:552](packages/CodeGenLib/src/Config/config.ts#L552)) but isn't always plumbed through to the pool.

Symptom: `RequestError: Failed to cancel request in 5000ms`. The application code hit its 120s timeout, tried to cancel the request, and the cancel itself timed out at the hardcoded 5s tedious limit. From the user's perspective the whole CG run dies for what is sometimes a single transient slow query.

Default of 120s should be raised, and the timeout should be configurable per-phase (not just globally).

> **STATUS (2026-06-29): MOSTLY DONE.** A unified, cross-platform `codegenPool.statementTimeoutMs` now exists and is plumbed to both providers — SQL Server maps it to mssql `requestTimeout` (`db-connection.ts:56`), PostgreSQL to libpq `-c statement_timeout` (`pg-connection.ts:56-57`); schema at `config.ts:581-615` (commit `c611164182`). Precedence: `statementTimeoutMs` → legacy `dbRequestTimeout` → 120000. **Remaining gaps:** (a) the default is still 120s — raising it is a one-line config change; (b) no *per-phase* override; (c) `acquireTimeoutMillis` is still not coupled to the request timeout. Low priority — fold the leftover bits into Workstream C.

### 2.2 `Metadata.Refresh()` is atomic and unparallelized

`packages/MJCore/src/generic/providerBase.ts:2655–2701` — `GetAllMetadata()` runs a sequential dataset load of 26 `RunView` calls, no pagination, no parallelism, then does an O(n²) post-process join in JavaScript.

On a database with 2,000 entities and 60K+ EntityField rows, any single one of those 26 queries can blow the request timeout. The whole load is then lost.

> **Correction (2026-05-12):** The "26 sequential `RunView` calls" framing was wrong. `GetAllMetadata` makes a single `GetDatasetByName('MJ_Metadata')` call.

> **STATUS (2026-06-29): OBSOLETE — close T2.1 / T1.9.** The concern is gone on both axes:
> - **Load:** `GetAllMetadata` (`providerBase.ts:3415-3461`) issues one `GetDatasetByName('MJ_Metadata')`, which fans into 21 independent queries executed in parallel via `ExecuteSQLBatch` (`GenericDatabaseProvider.ts:3541-3550`, `Promise.all` at `867-885`), each with its own LocalCacheManager entry. A single query failing no longer loses the others.
> - **Post-process:** the O(n²) JS join was replaced with O(N+M) pre-indexed `Map` lookups (`groupByNormalizedUUID`, `providerBase.ts:3487-3554`; commit `d5a51b3bb8`, 2026-05-24) — ~1800× fewer ops on 2K entities / 60K fields.
> - **Hardening:** a fast-start pre-validation circuit-breaker (`preValidateAndRefresh`, commit `8e92d87b85`) validates freshness up front and degrades gracefully on timeout; field lookups are now O(1) (commit `5f82aa8202`, 2026-06-27).
> The only residual is raw row volume on the `EntityFields` query — a DB/view-cost issue, not a CodeGen architecture issue. **T2.1 (chunked refresh) and T1.9 (retry the 26 queries) are both dropped.**

### 2.3 Audit-column backfill is brutal on large tables

`packages/CodeGenLib/src/Database/manage-metadata.ts` (audit-column logic) — adds `__mj_CreatedAt` / `__mj_UpdatedAt` via:

```sql
ALTER TABLE x ADD __mj_CreatedAt DATETIMEOFFSET NULL;
UPDATE x SET __mj_CreatedAt = GETUTCDATE() WHERE __mj_CreatedAt IS NULL;
ALTER TABLE x ALTER COLUMN __mj_CreatedAt DATETIMEOFFSET NOT NULL;
ALTER TABLE x ADD CONSTRAINT DF_x___mj_CreatedAt DEFAULT GETUTCDATE() FOR __mj_CreatedAt;
```

On `EntityRecordVersions` (49M rows) that UPDATE takes 15–30 min. On `ScheduleTransAccountEntry` (20.8M rows), 10+ min. With multiple such tables, this single phase can take hours.

In SQL Server 2012+, `ALTER TABLE ADD col NOT NULL DEFAULT <runtime constant>` is a metadata-only operation for fixed-size types — instant, regardless of row count.

> **STATUS (2026-06-29): STILL 3-statement, BUT INTENTIONAL — do not "fix" in isolation.** The 3-statement pattern is still live for `DATETIMEOFFSET` on SQL Server/Azure (`SQLServerCodeGenProvider.ts:1148-1169`, executed batch-separated via `manage-metadata.ts:3136`). The single-statement metadata-only ADD was **deliberately rejected** as a documented defensive workaround (`SQLServerCodeGenProvider.ts:1156`) because SQL Azure throws an implicit-conversion error adding a `NOT NULL DEFAULT DATETIMEOFFSET` in one statement. Non-`DATETIMEOFFSET` types already use a single statement (`:1168`).
> **Conclusion:** the original T1.3 ("switch to metadata-only ALTER") is **not a free win** and risks breaking Azure. The right mitigation for the 49M-row case is *not touching the table at all* → **Workstream A (skip-entity)** moots this. T1.3 is dropped as a standalone task.

### 2.4 No skip-entity capability for "metadata-y" tables

`packages/CodeGenLib/src/Config/config.ts:647–656` — `excludeSchemas` and `excludeTables` exist, but they only affect file generation and JSON schema output. **They do not stop the table from being treated as an MJ entity.**

Tables that should be skipped at the *entity-treatment* level:
- Audit/versioning systems already provided by the source app (`EntityRecordVersions`, `*History`, `*Audit`, `*Log`, `*Trace`)
- High-row-count tables where adding MJ overhead is more cost than benefit
- Tables that already carry their own audit metadata columns

> **STATUS (2026-06-29): PARTIALLY DONE.** `excludeTables` now *does* skip at the entity level — `createNewEntities` applies `createExcludeTablesAndSchemasFilter()` to the candidate-table query (`manage-metadata.ts:4065-4096`), so excluded tables get no `__mj.Entity` row (and therefore no audit columns / CRUD procs). Schema/table matching supports wildcards. **Still missing:** pattern-family globs (`%History`, `%Audit%`, `%Log`), a row-count auto-suggest heuristic, and an `excludeFromEntityTreatment` mode that distinguishes "discover but don't generate" from "skip entirely." → **Workstream A.**

### 2.5 CLI feedback is opaque on long runs

`packages/CodeGenLib/src/Misc/status_logging.ts` — the CLI shows a spinner and emits sporadic `Created new entity X` lines. There is no top-level phase indicator, within-phase progress, ETA, or persisted phase log.

> **STATUS (2026-06-29): HALF DONE — and the remaining half is now cheap.** A `CodeGenReporter` records a full nested phase tree with per-phase durations, entity breakdown, and LLM costs, persisting each run to `~/.mj/codegen-state/run-<timestamp>.json` (retains the last 50; `codegen-reporter.ts:144,373`), and `status_logging.ts:49-69` shows a live elapsed-time ticker (commit `e776c117d0`). **Still missing:** the user-facing `[Phase X/N name]` boundary print, within-phase counts (`705/2116`), and an ETA. Because the durations are already persisted per run, **ETA becomes a lookup against the last successful run-state, not a model.** → **Workstream C.**

### 2.6 No checkpoint / resume

If a CG run dies after processing 1,800 of 2,000 entities, the next run starts at 0. The DB writes that did succeed are persisted but CG has no manifest tying that state back to a phase position.

> **STATUS (2026-06-29): NOT DONE.** No `--resume` / checkpoint exists (the run-state files are read-only telemetry archives, never consulted to resume). This is the one genuinely large item still open → **Workstream D (defer-decide):** the run-state file is the natural foundation, but if Workstream A makes full runs fast enough, the semantic cost of resume ("is it the same run?") may not pay off. Sequence last.

### 2.7 Connection pool acquire timeout

Companion to 2.1 — the SQL pool's `acquireTimeoutMillis` was hitting much earlier than the request timeout. Needs to be coupled to `dbRequestTimeout`.

> **STATUS (2026-06-29): NOT DONE.** Still uncoupled. Trivial; fold into Workstream C.

### 2.8 `dbRequestTimeout` config key path is non-obvious

A reasonable operator places `dbRequestTimeout` under `databaseSettings` and CG silently ignores it, keeping the 120s default.

> **STATUS (2026-06-29): IMPROVED (env layer).** PG_*/DB_* env-var precedence now emits a de-dup'd startup warning when both are set (commits `8d64480f1e`, `c611164182`). But there is still **no startup echo of the effective resolved statement timeout**, which is the cheapest possible misconfiguration guard. Fold into Workstream C.

### 2.9 AI "smart field identification" lacks output validation

`packages/CodeGenLib/src/Database/manage-metadata.ts:~4959-4985` — `applyDefaultInViewUpdates` calls `result.defaultInView.includes(...)` directly on the AI's response, crashing with `TypeError: Cannot read properties of undefined` when the AI returns a malformed shape or invents field names.

> **STATUS (2026-06-29): FIXED — close T1.6.** Null-guard in place (`const defaultInView = result.defaultInView ?? []`, `manage-metadata.ts:5245`) plus field-name validation against the entity's real field list with a logged error for invented names (`:5251-5256`). The crash cascade is resolved. **Dropped.**

### 2.10 Generated base view assumes every entity has a `Name` column

Dozens of `Invalid column name 'Name'` warnings during view creation on Aptify tables lacking a literal `Name` column.

> **STATUS (2026-06-29): FIXED — close T1.7.** A single-winner `IsNameField` refactor (commit `724492f6ce`, 2026-06-12) enforces exactly one name field per entity: `selectNameFieldWinner` (`manage-metadata.ts:5184-5203`) picks one deterministically and clears losers, gated by an eligibility guardrail that rejects PKs, virtual fields, and unbounded text (`isFieldEligibleForNameField`, `:5218-5233`). 57 core entities had drifting multi-flag state; now stable. **Dropped.**

### 2.11 Generated view column-name collisions

`Column name 'Entity_Virtual' ... specified more than once.` — two FK relationships to the same entity generating the same default virtual-column name.

> **STATUS (2026-06-29): FIXED — close T1.8.** Collision detection + disambiguation now exists: FK-name joins append a `_Virtual` suffix on collision (`sql_codegen.ts:1819-1830`), explicitly-configured colliding aliases are detected and skipped (`:1862-1866`), via `hasAliasCollision()` checking base fields, generated aliases, and system columns (`:1938-1950`). **Dropped.**

## 3. Additional Findings From Code Study

### 3.1 Hardcoded batch size of 5

`packages/CodeGenLib/src/Database/sql_codegen.ts:504–625, 4710–4717` — SQL object generation processes entities in batches of 5 via `Promise.all()`. The 5-wide parallelism is sized for LLM rate limits but reused for SQL generation where rate limits don't apply.

> **STATUS (2026-06-29): STILL CONFLATED (DB side).** `advancedGeneration.batchSize` (LLM) is now correctly separate — advanced/AI generation batches at that knob via `Promise.allSettled` (`manage-metadata.ts:4888-4921`). But **SQL object generation is still hardcoded**: `perEntityBatchSize = dbPlatform === 'postgresql' ? 1 : 5` (`sql_codegen.ts:216`), batch-then-`Promise.all` at `:566-624`, permissions batch of 5 at `:504-556`. The PG `1` is a *deliberate* serial fallback (catalog deadlocks under parallel phased DDL, explained `:203-215`) and must stay. The SQL Server `5` is arbitrary and DB-I/O-bound → raise + make configurable in **Workstream B**.

### 3.2 EntityField backfill is per-entity in some paths

`manage-metadata.ts:~2449+` — field validation/audit/relationship checks iterate entity-by-entity, O(n²) shape. No batched-DML path implemented.

> **STATUS (2026-06-29): NOT ADDRESSED.** Still per-entity in these paths. Lower priority than the generation loops; candidate for Workstream B if profiling flags it after the bigger wins land.

### 3.3 Cascade-delete dependency analysis is uncached

`sql_codegen.ts:2186–2243` — `buildCascadeDeleteDependencies()` walks every entity and every field every run, O(n²), no memoization. On unchanged schemas the result is identical run to run.

> **STATUS (2026-06-29): STILL UNCACHED + SERIAL.** Confirmed: `buildCascadeDeleteDependencies` (`sql_codegen.ts:2190-2221`) calls `analyzeCascadeDeleteDependencies` (`:2145-2184`) which does nested `md.Entities × e.Fields` scans, rebuilt from scratch every run. Pure CPU + metadata work → strong **Workstream B** candidate (memoize by metadata hash; optionally parallelize the FK scan).

### 3.4 No cross-schema parallelism in SQL generation

SQL object generation batches don't partition by schema.

> **STATUS (2026-06-29): NOT ADDRESSED.** Still no schema partitioning. Subsumed by the concurrency-width work in **Workstream B**; cross-schema worker partitioning is the stretch goal there.

### 3.5 Angular subclass generation is serial

`packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts:149–150` — appears to await per-entity. CPU-bound, easily parallelizable.

> **STATUS (2026-06-29): STILL SERIAL — prime worker-threads target.** Confirmed serial `for...await` (`entity_subclasses_codegen.ts:147-149`). The work splits in two: the `skipDBUpdate` emit pass is pure template/AST string-building (CPU-bound → `worker_threads`), while the DB-writeback pass awaits `LogSQLAndExecute` (`:534`, I/O-bound → concurrency). The same shape applies to GraphQL and Angular generation. → core of **Workstream B**.

### 3.6 No "fast mode" for unchanged-schema re-runs

No flag for "schema didn't change, just regenerate output artifacts."

> **STATUS (2026-06-29): NOT DONE.** Still pays full discovery/validation cost every run. Related to Workstream D (a schema-state hash is shared infrastructure between resume and fast-mode); deferred with it.

## 4. Original Tier-1 / Tier-2 / Tier-3 Tasks — Disposition

The original plan enumerated tasks T1.1–T1.13, T2.1–T2.4, T3.1–T3.3. Their current disposition:

| Task | Original intent | Disposition (2026-06-29) | Citation |
|---|---|---|---|
| T1.1 | Raise default timeout, plumb pool | **Mostly done** (unified `statementTimeoutMs`); default still 120s | `db-connection.ts:56`, `config.ts:581-615` |
| T1.2 | Skip-entity config + patterns | **Partial** — name-based entity skip done; patterns/row-count missing → **WS A** | `manage-metadata.ts:4065-4096` |
| T1.3 | Metadata-only audit ALTER | **Dropped** — intentional 3-stmt Azure workaround; mooted by WS A | `SQLServerCodeGenProvider.ts:1156` |
| T1.4 | Structured CLI status | **Partial** — telemetry persisted, not surfaced → **WS C** | `codegen-reporter.ts:373`, `status_logging.ts:49-69` |
| T1.5 | Timeout discoverability | **Partial** — env warning yes, timeout echo no → **WS C** | `config.ts:661-680` |
| T1.6 | AI smart-field validation | **DONE** | `manage-metadata.ts:5245-5256` |
| T1.7 | `Name` field resolution | **DONE** (single-winner) | commit `724492f6ce`; `manage-metadata.ts:5184-5203` |
| T1.8 | View column collisions | **DONE** | `sql_codegen.ts:1819-1950` |
| T1.9 | Retry the 26 metadata queries | **Dropped** — premise obsolete | `GenericDatabaseProvider.ts:3541-3550` |
| T1.10 | Aptify sample exclude config | **Open** → **WS A** | — |
| T1.11 | Audit-column NULL-tolerance audit | **Moot** (T1.3 dropped) | — |
| T1.12 | Cross-platform ALTER parity | **Moot** (T1.3 dropped) | — |
| T1.13 | Phase-level wall-clock telemetry | **DONE** (captured) / surface → **WS C** | `codegen-reporter.ts` |
| T2.1 | Chunked Metadata.Refresh | **Dropped** — already parallel + cached + O(N+M) | `providerBase.ts:3415-3554` |
| T2.2 | Checkpoint / `--resume` | **Open** → **WS D** | — |
| T2.3 | Interactive mode + flags | **Open** — UX polish; fold into WS A confirmation prompts | — |
| T2.4 | Separate LLM/SQL/file concurrency knobs | **Partial** — LLM split done; SQL/file knobs missing → **WS B** | `sql_codegen.ts:216` |
| T3.1 | Cross-schema parallelism | **Open** → **WS B** (stretch) | — |
| T3.2 | Cached dependency graph | **Open** → **WS B** | `sql_codegen.ts:2190-2221` |
| T3.3 | Fast mode | **Open** → **WS D** (deferred) | — |

---

## 9. Re-scope (2026-06-29) — The Four Workstreams

Everything still worth doing collapses into four workstreams, ordered by leverage-per-effort. The guiding correction vs. the original plan: **the correctness bugs are fixed and the metadata path is hardened — what's left is wall-clock (skip work + parallelize work) plus observability and an optional resume.**

### Workstream A — Skip-entity heuristics *(highest leverage, lowest risk)*

Finish what `excludeTables` started. Skipping the 49M-row `EntityRecordVersions` *entirely* is strictly better than backfilling it faster — and it moots the audit-column lock (§2.3) without touching the deliberate Azure workaround.

- Pattern-family skip: glob support for `%History`, `%Audit%`, `%Log`, `%RecordVersion%` (extend `createExcludeTablesAndSchemasFilter`, `manage-metadata.ts:4065-4096`).
- Row-count auto-suggest: flag tables over a configurable threshold (default ~5M) and, in interactive mode, offer skip / add-without-backfill / proceed (absorbs the useful half of old T2.3).
- Ship a curated `metadata/sample-configs/aptify-excludes.cjs` so every Aptify onboarding doesn't rediscover the same list (old T1.10).

**Effort:** ~2 days. **Risk:** low — additive. **Builds on:** existing entity-level skip.

### Workstream B — Parallelism, split honestly by bottleneck *(the worker-threads ask)*

There is no `worker_threads` / `os.cpus()` usage in CodeGen today. But the win only materializes if we route each loop to the *right* primitive — threads for CPU work, wider async for I/O work.

- **B1 · CPU-bound → `worker_threads`.** The `skipDBUpdate` code-emit passes for entity subclasses, GraphQL, and Angular (`entity_subclasses_codegen.ts:147-149` and siblings) are template/AST string-building. Run them on a worker pool sized `os.cpus()-1`.
- **B2 · CPU-bound → cache + parallelize.** Memoize `buildCascadeDeleteDependencies` (`sql_codegen.ts:2190-2221`) keyed by a metadata hash so unchanged schemas skip the O(n²) rebuild; parallelize the FK scan if still hot.
- **B3 · I/O-bound → widen async, no threads.** Split the hardcoded SQL-exec batch (`sql_codegen.ts:216`) into a configurable `sqlGenerationConcurrency` (raise to ~20 on SQL Server). **Leave PostgreSQL at 1** — its serial fallback guards real catalog deadlocks (`:203-215`).
- **B4 · Free restructure.** The top-level file-gen phases (GraphQL / Angular / DBSchema) run serially in `runFileGenerationPhase` (`runCodeGen.ts:510-659`) but are independent — `Promise.all` the independent ones.
- **Stretch:** cross-schema worker partitioning (old T3.1).

> ⚠️ **Worker-threads packaging gotcha.** MJ ships as bundled/symlinked workspace packages, so a worker entry file must stay resolvable inside the published `@memberjunction/cli` — the same failure class as the dynamic-`import()` `ERR_MODULE_NOT_FOUND` documented in `CLAUDE.md` §8. Use a deliberate, declared worker entry point; do **not** rely on `new Worker(__filename)` surviving the bundle.

**Effort:** B3/B4 ~2–3 days; B1/B2 ~1 week incl. the packaging work + tests. **Risk:** medium — measure DB throughput before settling `sqlGenerationConcurrency` defaults.

### Workstream C — Surface the telemetry that already exists *(cheap, high perceived value)*

The phase tree and per-phase durations are already persisted; only the display is missing.

- Print `[Phase X/N name]` at each boundary and within-phase counts (`705/2116`).
- ETA by projecting against the last successful `~/.mj/codegen-state/run-*.json` (a lookup, not a model).
- Echo the resolved effective statement timeout at startup (§2.8) and couple `acquireTimeoutMillis` to it (§2.7).

**Effort:** ~2 days. **Risk:** none — observability only.

### Workstream D — Resume / checkpoint *(defer-decide)*

The one genuinely large architectural item. The run-state file is the natural foundation, and a schema-state hash would also unlock "fast mode" (old T3.3). **But** if Workstream A makes full Aptify runs fast enough, the semantic complexity of resume ("is this the same run? is entity 1,800 the same entity?") may not pay off. **Sequence last; decide after measuring with Workstreams A + C in place.**

**Effort:** 1–2 weeks if pursued. **Risk:** medium — content-addressed identity, not positional.

### Recommended sequence

1. **A** (skip-entity) — biggest wall-clock win, lowest risk; unblocks fast iteration on the big DB.
2. **C** (surface telemetry) — cheap, and gives the *measurements* that justify B and the D go/no-go.
3. **B** (parallelism) — the worker-threads work, now data-driven.
4. **D** (resume) — only if A+C+B haven't already made runs short enough.

## 6. Risks and Open Questions

- **Cross-platform parity.** Audit-column metadata-only ALTER is intentionally *not* used on SQL Azure (§2.3) — leave it. PG handles its own path.
- **What does "metadata-y" mean precisely?** Pattern detection (`%History`, `%Audit`) will have false positives. Confirmation defaults + opt-out flags (Workstream A) handle this; the heuristic still needs tuning across customer schemas.
- **Worker packaging.** See the gotcha box in Workstream B — the highest-risk part of B1.
- **Resume semantics.** "Resume from entity 1,800" needs a content-addressed identifier, not a positional one (Workstream D).
- **Concurrency safety.** Wider SQL concurrency and any cross-schema partitioning must respect the PG catalog-deadlock constraint (`sql_codegen.ts:203-215`) and concurrent writes to shared metadata tables.

## 7. Source Material

Captured in conversation 2026-05-11; re-verified 2026-06-29. Current code references:

- `packages/CodeGenLib/src/Config/db-connection.ts:56` — unified `statementTimeoutMs` (SQL Server)
- `packages/CodeGenLib/src/Config/pg-connection.ts:56-57` — `statementTimeoutMs` (PostgreSQL)
- `packages/CodeGenLib/src/Config/config.ts:581-615` — `codegenPool` block
- `packages/CodeGenLib/src/Database/manage-metadata.ts:4065-4096` — entity-level exclude filter
- `packages/CodeGenLib/src/Database/manage-metadata.ts:5184-5268` — single-winner NameField + AI field validation
- `packages/CodeGenLib/src/Database/sql_codegen.ts:203-216` — SQL batch sizing + PG serial fallback
- `packages/CodeGenLib/src/Database/sql_codegen.ts:1819-1950` — view alias collision handling
- `packages/CodeGenLib/src/Database/sql_codegen.ts:2145-2221` — uncached cascade-delete dependency analysis
- `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts:147-149` — serial subclass generation
- `packages/CodeGenLib/src/Misc/codegen-reporter.ts` — persisted run-state telemetry
- `packages/CodeGenLib/src/Misc/status_logging.ts:49-69` — live elapsed ticker
- `packages/MJCore/src/generic/providerBase.ts:3415-3554` — `GetAllMetadata` (single dataset, O(N+M) post-process)
- `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts:3419-3630` — 21-query parallel dataset load

NSTA database snapshot at time of capture:
- 2,116 `dbo` tables, 277 `__mj` tables; ~390 GB total
- 49.3M rows in `EntityRecordVersions`; 20.8M in `ScheduleTransAccountEntry`; 7.9M in `OrderDetail`; 5.3M in `Subscription`
- Compatibility level bumped 110 → 160 for modern T-SQL used by MJ procs

## 8. Post-Review Addendum (2026-05-12) — superseded

The 2026-05-12 addendum (§2.2/§2.4/§2.10 corrections, sequencing, T1.10–T1.13) has been folded into the per-section `STATUS` boxes above and the §4 disposition table. Retained here only as a pointer; **§9 is the live plan.**
