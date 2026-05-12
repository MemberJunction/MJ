# CodeGen Large-Schema & Operational Resilience Plan

**Status:** Draft (revised 2026-05-12 with code-verified corrections)
**Author:** Captured 2026-05-11 during NSTA/Aptify onboarding
**Trigger case:** Onboarding the Aptify product database for [National Science Teachers Association (NSTA)] — 2,116 `dbo` tables, ~390 GB, several tables in the 20–50M row range, heavy customer customization on top of the core Aptify product.

> **Revision note (2026-05-12):** §2.2, §2.4, and §2.10 below contain claims that were partially incorrect when checked against the current source. Inline **Correction** boxes flag each one and link to the actual code path. The remediation tasks (T2.1, T1.2, T1.7) are still warranted but need to be re-scoped against the real call sites before implementation. See §8 for a consolidated post-review addendum.

## 1. Problem Statement

MJ CodeGen works well for greenfield MJ projects and modest brownfield schemas, but on large, wide, complex schemas it hits the following operational realities:

- **Wall-clock time** balloons. A single CG run on the NSTA database is still running after several hours, with no clear progress signal.
- **Brittle failure modes.** A single SQL timeout (e.g., `RequestError: Failed to cancel request in 5000ms` from the `tedious` driver) can abort the entire run. There's no resume / checkpoint.
- **Operational blast radius.** Some operations (audit-column backfill via `UPDATE WHERE col IS NULL`) lock multi-million-row tables for minutes. On a 49M-row table this is 15–30 min of pure UPDATE time per table.
- **CG processes tables it shouldn't.** Things like `EntityRecordVersions` (Aptify's own audit/versioning system, 49M rows) get full MJ entity treatment — views, CRUD procs, audit columns added on top of the existing audit columns — when they should be skipped entirely. CG has no way to know.
- **Visibility is poor.** The CLI shows a spinner and occasional "Created new entity X" lines. Whether CG is making progress, stuck, or dead is not observable without querying the database directly.

The pain is real but most of the underlying machinery is in place. This plan splits the work into quick wins (1–3 days each), medium investments (1–2 weeks), and larger architectural changes (multi-week).

## 2. Concrete Findings From the NSTA Run

The following were observed first-hand during the NSTA CG run, not theoretical. Each one is independently fixable and several are quick.

### 2.1 Default driver request timeout is too low

`packages/CodeGenLib/src/Config/db-connection.ts:36` — `tedious` request timeout defaults to 120s. The `dbRequestTimeout` config key exists ([config.ts:552](packages/CodeGenLib/src/Config/config.ts#L552)) but isn't always plumbed through to the pool.

Symptom: `RequestError: Failed to cancel request in 5000ms`. The application code hit its 120s timeout, tried to cancel the request, and the cancel itself timed out at the hardcoded 5s tedious limit. From the user's perspective the whole CG run dies for what is sometimes a single transient slow query.

Default of 120s should be raised, and the timeout should be configurable per-phase (not just globally).

### 2.2 `Metadata.Refresh()` is atomic and unparallelized

`packages/MJCore/src/generic/providerBase.ts:2655–2701` — `GetAllMetadata()` runs a sequential dataset load of 26 `RunView` calls, no pagination, no parallelism, then does an O(n²) post-process join in JavaScript.

On a database with 2,000 entities and 60K+ EntityField rows, any single one of those 26 queries can blow the request timeout. The whole load is then lost.

> **Correction (2026-05-12, code-verified):** The "26 sequential `RunView` calls" framing is wrong. `GetAllMetadata` makes a **single** `GetDatasetByName('MJ_Metadata')` call (providerBase.ts:2663–2675), and post-processing uses `.filter()` lookups (2678–2681), not nested loops. The user-visible symptom on NSTA is real — but it's one fat dataset query timing out, not 26 separate ones. **T2.1 needs to be re-scoped** against the actual call site: the right fix is likely server-side pagination of `MJ_Metadata` (sp returning paged result sets, or splitting into multiple datasets loaded in parallel), not wrapping imaginary 26 calls in retries.

### 2.3 Audit-column backfill is brutal on large tables

`packages/CodeGenLib/src/Database/manage-metadata.ts` (audit-column logic) — adds `__mj_CreatedAt` / `__mj_UpdatedAt` via:

```sql
ALTER TABLE x ADD __mj_CreatedAt DATETIMEOFFSET NULL;
UPDATE x SET __mj_CreatedAt = GETUTCDATE() WHERE __mj_CreatedAt IS NULL;
ALTER TABLE x ALTER COLUMN __mj_CreatedAt DATETIMEOFFSET NOT NULL;
ALTER TABLE x ADD CONSTRAINT DF_x___mj_CreatedAt DEFAULT GETUTCDATE() FOR __mj_CreatedAt;
```

On `EntityRecordVersions` (49M rows) that UPDATE takes 15–30 min. On `ScheduleTransAccountEntry` (20.8M rows), 10+ min. With multiple such tables, this single phase can take hours.

In SQL Server 2012+, `ALTER TABLE ADD col NOT NULL DEFAULT <runtime constant>` is a metadata-only operation for fixed-size types — instant, regardless of row count. The audit columns fit this pattern (`DATETIMEOFFSET`, default `GETUTCDATE()`, NOT NULL). Switching to a single-statement add eliminates the entire UPDATE phase.

### 2.4 No skip-entity capability for "metadata-y" tables

`packages/CodeGenLib/src/Config/config.ts:647–656` — `excludeSchemas` and `excludeTables` exist, but they only affect file generation and JSON schema output. **They do not stop the table from being treated as an MJ entity** (added audit columns, generated CRUD procs, registered in `__mj.Entity`).

Tables that should be skipped at the *entity-treatment* level:
- Audit/versioning systems already provided by the source app (`EntityRecordVersions`, `*History`, `*Audit`, `*Log`, `*Trace`)
- High-row-count tables where adding MJ overhead is more cost than benefit
- Tables that already carry their own audit metadata columns and don't need MJ's

CG has no notion of "discover but don't generate" vs "skip entirely" vs "treat as reference".

> **Correction (2026-05-12, code-verified):** Not quite right for `excludeSchemas`. It is plumbed into `spUpdateExistingEntitiesFromSchema` (manage-metadata.ts:3348) so new entity rows are not created for excluded schemas, and into `ensureCreatedAtUpdatedAtFieldsExist` (manage-metadata.ts:2474, filtered at 2896) so the audit-column phase skips excluded schemas. The real gap is **table-level**: `excludeTables` doesn't propagate into entity treatment, and there's no pattern-based or row-count-heuristic skip at all. **T1.2 should be reframed** as "extend the existing schema-level skip to table-level + patterns + row-count heuristic," not "skip-entity capability doesn't exist."

### 2.5 CLI feedback is opaque on long runs

`packages/CodeGenLib/src/Misc/status_logging.ts` (implied) — the CLI shows a spinner and emits sporadic `Created new entity X` lines. There is no:
- Top-level phase indicator (`[Phase 6/11] Generating SQL objects...`)
- Within-phase progress (`Adding audit columns: 705 / 2116`)
- ETA based on observed rate
- Persisted phase log so a re-run knows where the last run got to

During the NSTA run we had to repeatedly query `sys.columns` and `__mj.Entity` directly to confirm CG hadn't hung.

### 2.6 No checkpoint / resume

If a CG run dies after processing 1,800 of 2,000 entities, the next run starts at 0. The DB writes that did succeed (Entity rows, audit columns on N tables) are persisted but CG has no manifest tying that state back to a phase position. The user has to either let it re-discover the same state or manually intervene.

### 2.7 Connection pool acquire timeout

Companion to 2.1 — the SQL pool's `acquireTimeoutMillis` was hitting much earlier than the request timeout in practice during heavy concurrent generation phases. Needs to be coupled to `dbRequestTimeout`.

### 2.8 `dbRequestTimeout` config key path is non-obvious

`packages/CodeGenLib/src/Config/db-connection.ts:11,36` reads `dbRequestTimeout` from the **root** of the resolved config. But the documented pattern for connection pool tuning (e.g. in `CLAUDE.md` SQL Server Connection Pooling section) shows pool settings under `databaseSettings.connectionPool`. A reasonable operator places `dbRequestTimeout` next to the pool config under `databaseSettings` — and CG silently ignores it, keeping the 120s default.

Observed during the NSTA run: the user set `databaseSettings.dbRequestTimeout: 1800000` thinking it would apply to CG. CG still hit `Timeout: Request failed to complete in 120000ms`. Required moving the key to root level for it to take effect.

Improvement: accept the key in both locations for back-compat, or unify under one namespace, or at minimum warn loudly at CG startup when `databaseSettings.dbRequestTimeout` is set (since that's a clear signal of operator intent).

### 2.9 AI "smart field identification" lacks output validation

`packages/CodeGenLib/src/Database/manage-metadata.ts:~4959-4985` — `applyDefaultInViewUpdates` calls `result.defaultInView.includes(f.Name as string)` directly on the AI's response. Observed failures during NSTA run:

```
TypeError: Cannot read properties of undefined (reading 'includes')
    at applyDefaultInViewUpdates (manage-metadata.js:4104:77)
```

Companion warnings tell the rest of the story:
- `Smart field identification returned invalid searchPredicate field: 'undefined' not found in entity fields` — the AI literally returned the string `'undefined'` as a field name
- `Smart field identification returned invalid searchableFields: _ExternalHousingBlockID not found in entity` — AI invented a field name
- `Smart field identification returned invalid defaultInView fields: Committee_CommitteeType_Name not found in entity` — AI invented a foreign-key-like field name

The AI is unreliable on schemas it hasn't seen patterns for. The downstream code:
- Doesn't null-guard on the AI's response shape (`result.defaultInView` can be `undefined` and that crashes)
- Treats invalid AI output as a warning, then continues into code that assumes the output is valid

Improvement: schema-validate the AI response against the actual entity's field list. Drop any field name the AI returns that isn't in the entity. Add explicit null/undefined checks on the result shape. If validation drops everything, fall back to deterministic heuristics (first string column with "name" in its name, otherwise PK).

### 2.10 Generated base view assumes every entity has a `Name` column

Observed dozens of `Invalid column name 'Name'` warnings during view creation. MJ's base view template appears to reference a `Name` column unconditionally. On Aptify tables without a column literally named `Name` (which is many — Aptify uses `*Name` variants like `FirstName`, `CompanyName`, `Title`, etc.), the generated view is invalid.

Improvement: the generated view should reference a `NameField` resolved per-entity (could be `Name`, `Title`, `Description`, or a configured field). On entities with no obvious name field, the view should still be valid — just without a virtual `Name` column.

> **Correction (2026-05-12, code-verified):** `sql_codegen.ts:1780` (`getIsNameFieldForSingleEntity`) already resolves `NameField` per entity, gated by `IncludeRelatedEntityNameFieldInBaseView` and `RelatedEntityJoinFieldsConfig` (1767–1779). The "unconditional `Name` reference" diagnosis is too sweeping — the `Invalid column name 'Name'` warnings on NSTA almost certainly come from a specific branch (likely a related entity whose configured/inferred NameField is the literal `Name` but the target table lacks that column). **T1.7 should start with a 30-min repro** to localize the offending branch before any fix is scoped.

### 2.11 Generated view column-name collisions

Observed: `Column names in each view or function must be unique. Column name 'Entity_Virtual' in view or function 'vwEntityBaseViewsWizards' is specified more than once.`

The generator emitted two columns named `Entity_Virtual` in the same view. This is a real generator bug — likely two FK relationships pointing to the same entity, both generating a virtual column with the same default name.

Improvement: detect collisions during view-template assembly. Disambiguate (e.g. `Entity_Virtual_1`, `Entity_Virtual_2`, or use the FK column name as a prefix).

## 3. Additional Findings From Code Study

These were uncovered by reading the CodeGen source, not directly observed during the run, but apply to large schemas:

### 3.1 Hardcoded batch size of 5

`packages/CodeGenLib/src/Database/sql_codegen.ts:504–625, 4710–4717` — SQL object generation processes entities in batches of 5 via `Promise.all()`. For 2,000 entities that's 400 sequential batches. The 5-wide parallelism is sized for LLM rate limits (`advancedGeneration.batchSize`) but reused for SQL generation where rate limits don't apply.

Improvement: split `advancedGeneration.batchSize` (LLM-bound, stays at 5–10) from `sqlGenerationBatchSize` (DB-bound, could be 20–50) and `fileGenerationConcurrency` (CPU/disk-bound, could be `os.cpus()`).

### 3.2 EntityField backfill is per-entity in some paths

`packages/CodeGenLib/src/Database/manage-metadata.ts:~2449+` — field validation/audit/relationship checks iterate entity-by-entity. With 2,000 entities × 50 avg fields = 100K rows handled in O(n²) shape. Comment in code already notes the trade-off ("avoid both per-entity round-trips and parallel calls (page-level lock contention)") but no batched-DML path is implemented.

Improvement: batched multi-row UPSERTs against `EntityField`, MERGE-style by `(EntityID, Name)`.

### 3.3 Cascade-delete dependency analysis is uncached

`packages/CodeGenLib/src/Database/sql_codegen.ts:2186–2243` — `buildCascadeDeleteDependencies()` walks every entity and every field every run to build the dependency graph. O(n²) in the worst case. No memoization, no DB-side cache. On unchanged schemas the result is identical run to run.

Improvement: hash the relevant Entity/EntityField columns; cache the dependency graph keyed by that hash; rebuild only when the hash changes.

### 3.4 No cross-schema parallelism in SQL generation

SQL object generation batches don't partition by schema. Two batches touching different schemas could run concurrently with zero lock contention. The current sequencing leaves throughput on the table.

### 3.5 Angular subclass generation is serial

`packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts:149–150` — appears to await per-entity. CPU-bound, easily parallelizable up to `os.cpus()`.

### 3.6 No "fast mode" for unchanged-schema re-runs

There's no flag that says "I'm re-running CG, the schema didn't change, just regenerate output artifacts." Every run pays the full discovery / validation cost.

## 4. Proposed Improvements

Grouped by effort and dependency.

### Tier 1 — Quick wins (1–3 days each, independent)

#### T1.1 Raise default `dbRequestTimeout`, plumb it through the pool

Change default from `120000` → `600000` (10 min). Wire `dbRequestTimeout` into `acquireTimeoutMillis` on the pool. Allow per-phase override (e.g., `metadataRefreshTimeout`, `sqlGenerationTimeout`).

**Effort:** half day. **Risk:** none — defaults change, configurable.

#### T1.2 Skip-entity config and pattern-based auto-skip

Add to `mj.config.cjs`:

```js
codeGen: {
  excludeFromEntityTreatment: {
    // Explicit list
    tables: [
      { schema: 'dbo', table: 'EntityRecordVersions' },
      { schema: 'dbo', table: 'sysdiagrams' },
    ],
    // Pattern-based
    patterns: [
      { schema: 'dbo', tableLike: '%History' },
      { schema: 'dbo', tableLike: '%Audit%' },
      { schema: 'dbo', tableLike: '%Log' },
      { schema: 'dbo', tableLike: '%RecordVersion%' },
    ],
    // Heuristic-based with confirmation
    autoDetect: {
      enabled: true,
      rowCountThreshold: 5000000,    // suggest skip for tables > 5M rows
      requireConfirmation: true,      // ask before skipping in interactive mode
    },
  },
},
```

Plumb through to:
- Entity discovery (don't create `__mj.Entity` row)
- Audit column addition (don't ALTER)
- CRUD proc generation (don't generate)
- File generation (existing `excludeTables` already handles this)

**Effort:** 1–2 days. **Risk:** low — additive feature.

#### T1.3 Switch audit columns to metadata-only ALTER

Replace the three-statement add/update/alter pattern with:

```sql
ALTER TABLE x ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL CONSTRAINT DF_x___mj_CreatedAt DEFAULT GETUTCDATE();
```

In SQL Server 2012+ this is metadata-only for fixed-size types with constant defaults. Detect compat level; fall back to current behavior for `< 110`.

**Effort:** 1 day. **Risk:** medium — needs testing on PostgreSQL/MySQL providers. Worst case, gate behind a flag.

#### T1.4 Add structured CLI status

Required minimum:
- Print `[Phase X/N] Phase Name` at every phase boundary
- Update spinner every N items processed within a phase: `Adding audit columns: 705 / 2116 (33%, ETA 1h 12m)`
- On exit, write a `.codegen-run-state.json` with phase history, durations, errors

**Effort:** 2 days. **Risk:** none — pure CLI/observability.

#### T1.5 Make `dbRequestTimeout` discoverable / hard-to-misconfigure

Two-part fix:
1. Accept the key at `databaseSettings.dbRequestTimeout` in addition to root level.
2. At CG startup, log the effective resolved timeout: `[CodeGen] DB request timeout: 600s (from mj.config.cjs)`. Operators currently have no signal that their override worked until something times out hours later.

**Effort:** half day. **Risk:** none.

#### T1.6 Defensive validation on AI smart-field-identification output

In `applySmartFieldIdentification` and `applyDefaultInViewUpdates`:
- Null-guard every property of the AI response shape (`result.defaultInView`, `result.searchableFields`, `result.searchPredicate`, etc.)
- For each field name the AI returns, verify it exists in the entity's actual field list. Drop any that don't match. Log a warning with the offending name.
- If everything is dropped, fall back to deterministic heuristics (e.g., first string column matching `/name|title|label|description/i`, else the PK).

**Effort:** 1 day. **Risk:** low. Prevents the crash cascade observed on NSTA where ~15 entities failed in this phase.

#### T1.7 Robust `Name` field resolution in generated base view

Replace unconditional `Name` references in the generated base view template with a resolved `NameField` per entity. If no name-like field exists, omit the virtual column rather than emitting an invalid view.

**Effort:** 1 day. **Risk:** low. Eliminates the `Invalid column name 'Name'` view-compile failures observed on NSTA.

#### T1.8 Detect & disambiguate column-name collisions in generated views

When the view template assembles virtual columns from FK relationships, check for name collisions and disambiguate (e.g. append the source FK column name as a suffix). Currently emits invalid SQL when two FKs to the same entity collide.

**Effort:** half day. **Risk:** low.

#### T1.9 Retry-with-backoff on the 26 `Metadata.Refresh()` dataset queries

Wrap each `RunView` inside `GetAllMetadata` with retry: 3 attempts, 5s / 15s / 30s backoff. Log which item retried.

**Effort:** half day. **Risk:** low — only adds resilience.

### Tier 2 — Medium effort (1–2 weeks each)

#### T2.1 Chunked / paginated Metadata.Refresh()

Refactor `GetAllMetadata` so each large item (EntityField, EntityFieldValue, EntityPermission, EntityRelationship) loads in pages of N (default 5,000) instead of all-in-one. Progress reported per page. Failure on one page doesn't lose the rest.

This is the single biggest improvement for "the run takes a long time but at least it can survive a flaky query."

**Effort:** 1 week including tests. **Risk:** medium — touches a hot path, need careful testing for ordering / completeness guarantees.

#### T2.2 Checkpoint / `--resume`

CG writes a per-run manifest to `.codegen-state/<run-id>.json` capturing:
- Phase reached
- Per-phase: items completed (entity IDs for entity-iterating phases)
- Errors encountered
- Database state hash (for sanity)

`--resume <run-id>` (or `--resume-last`) skips completed entities/phases and continues. With a no-op detection layer it should be safe to re-run blindly too.

**Effort:** 1–2 weeks. **Risk:** medium — semantically subtle (what is "the same run"?).

#### T2.3 Interactive mode + `--skip-warnings` / `--auto-yes`

When CG encounters a concern (e.g., "about to backfill 49M rows on `EntityRecordVersions`"), it can prompt interactively:

```
  EntityRecordVersions (49,318,059 rows) looks like an audit/versioning table.
  Adding MJ audit columns will backfill all 49M rows (~25 min).

  [s] Skip this table entirely (recommended)
  [a] Add columns without backfilling (existing rows = NULL)
  [b] Backfill anyway (slow)
  [q] Quit

  Choice [s]:
```

Paired with `--skip-warnings`, `--auto-yes`, and `--non-interactive` for CI / scripted runs.

**Effort:** 1 week. **Risk:** low — additive UX layer over already-decided behavior.

#### T2.4 Separate concurrency knobs for LLM, SQL, and file generation

Split `advancedGeneration.batchSize` from new `sqlGenerationConcurrency` (default 20) and `fileGenerationConcurrency` (default `os.cpus()`). Wire through to existing `Promise.all` sites.

**Effort:** 3–5 days. **Risk:** medium — DB throughput experiments needed to pick safe defaults.

### Tier 3 — Larger architectural

#### T3.1 Cross-schema parallelism in SQL generation

Partition entities by schema. Spawn a worker per schema with its own batch loop. Coordinator collects errors and reports unified progress.

**Effort:** 2 weeks. **Risk:** medium — care needed around cross-schema FKs and shared metadata tables.

#### T3.2 Cached dependency graph

Hash relevant Entity / EntityField columns into a `EntityDependencyCacheHash` per entity. Persist `EntityDependencyCache` table mapping hash → JSON dependency graph. On run start, rebuild only for entities whose hash changed.

**Effort:** 2 weeks. **Risk:** medium — invalidation logic must be conservative (false negatives are fine, false positives = staleness).

#### T3.3 "Fast mode" for unchanged-schema re-runs

`--fast-regenerate` or auto-detected: if the schema hash hasn't changed since the last successful run, skip discovery, validation, and SQL recompilation. Only regenerate TypeScript / Angular artifacts.

**Effort:** 2–3 weeks. **Risk:** higher — needs a robust schema-state hash and careful semantics.

## 5. Sequencing Recommendation

If the goal is to make CG usable on big Aptify-like schemas as soon as possible:

1. **T1.5 (timeout discoverability)** + **T1.4 (CLI status)** — do first. Cheap. Massively reduces "is it dead?" / "did my config take effect?" anxiety, and surfaces where the real slow phases are. Better data for everything else.
2. **T1.3 (metadata-only audit columns)** — biggest wall-clock win. Eliminates hours.
3. **T1.2 (skip-entity)** — second biggest wall-clock win. Skips work that shouldn't happen at all.
4. **T1.6 (AI output validation)** + **T1.7 (Name field resolution)** + **T1.8 (view column collisions)** — these were observed failing on NSTA. They produce broken output even when CG "completes." Each is small.
5. **T1.1 (timeouts default)** + **T1.9 (retry)** — close the easy-failure paths.
6. **T2.1 (chunked refresh)** — once T1 is in, this is the next-biggest reliability gain.
7. **T2.2 (resume)** — gives operators a recovery path when something does still fail.
8. **T2.3 (interactive)** — UX polish on top.
9. **T2.4 → T3.x** — performance scaling work for the next class of problem.

## 6. Risks and Open Questions

- **Cross-platform parity.** Audit-column metadata-only ALTER is SQL Server-specific. Need to verify the equivalent for PostgreSQL (`ADD COLUMN ... DEFAULT ... NOT NULL` is metadata-only in PG 11+) and MySQL (varies by storage engine).
- **What does "metadata-y" mean precisely?** Pattern-based detection (`%History`, `%Audit`, `%Log`) will have false positives. Confirmation defaults + opt-out flags handle this, but the heuristic itself needs tuning across customer schemas.
- **Resume semantics.** "Resume from entity 1,800" assumes entity 1,800 is the same entity on both runs. If the schema changes between runs, the ordering may not be stable. Need a content-addressed identifier, not a positional one.
- **Backwards compatibility.** Audit columns being NULL on pre-MJ rows changes a soft invariant. Verify that downstream code (sp templates, view templates, BaseEntity) doesn't assume non-null.
- **Concurrency safety.** Cross-schema parallelism assumes schemas are independent. Need to verify shared metadata tables (`__mj.Entity`, `__mj.EntityField`) tolerate concurrent writes from multiple generation workers.

## 7. Source Material

Captured in conversation 2026-05-11. Specific code references:

- `packages/CodeGenLib/src/Config/db-connection.ts:36` — request timeout default
- `packages/CodeGenLib/src/Config/config.ts:552` — `dbRequestTimeout` config key
- `packages/CodeGenLib/src/Config/config.ts:647–656` — current exclude options
- `packages/MJCore/src/generic/providerBase.ts:2655–2701` — `GetAllMetadata` body
- `packages/CodeGenLib/src/Database/manage-metadata.ts:~2449` — entity field backfill
- `packages/CodeGenLib/src/Database/sql_codegen.ts:504–625, 2186–2243, 4710–4717` — SQL gen batching, cascade-delete dependencies
- `packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts:149–150` — Angular subclass generation
- `packages/CodeGenLib/src/runCodeGen.ts:209–222, 232–436` — top-level orchestration phases

NSTA database snapshot at time of capture:
- 2,116 `dbo` tables, 277 `__mj` tables
- ~390 GB total data
- 49.3M rows in `EntityRecordVersions`
- 20.8M rows in `ScheduleTransAccountEntry`
- 7.9M rows in `OrderDetail`
- 5.3M rows in `Subscription`
- Compatibility level required to be bumped from 110 → 160 to support modern T-SQL (`STRING_SPLIT` etc.) used by MJ procs

## 8. Post-Review Addendum (2026-05-12)

Findings from a code-verification pass over the original plan. Inline corrections appear under §2.2, §2.4, and §2.10; the items below are additions, sequencing changes, and risk callouts the original plan didn't have.

### 8.1 Sequencing change

Swap **T1.2 ahead of T1.3** in §5. Skipping `EntityRecordVersions` entirely (T1.2) is strictly better than backfilling it faster (T1.3), and T1.2 reduces T1.3's testing surface. Revised order for the first wave:

1. T1.5 + T1.4 (timeout discoverability + CLI status) — lead with these so all subsequent prioritization is data-driven.
2. **T1.2 (skip-entity)** — eliminate work that shouldn't happen at all.
3. **T1.3 (metadata-only audit ALTER)** — speed up the work that should.
4. T1.6 / T1.7 / T1.8 (correctness fixes).
5. T1.1 / T1.9 (resilience defaults).
6. T2.1, then T2.2, etc.

### 8.2 New tasks to add

- **T1.10 — Aptify-specific sample exclude config.** Ship `metadata/sample-configs/aptify-excludes.cjs` (or similar) with a curated skip list for Aptify schemas: `EntityRecordVersions`, `*History`, the trans-log family, etc. Every customer onboarding an Aptify database otherwise rediscovers the same list. Cheap, high-leverage, depends only on T1.2 landing.
- **T1.11 — Audit-column NULL-tolerance audit (precondition for T1.3).** Before shipping the metadata-only ALTER, grep for `__mj_CreatedAt` / `__mj_UpdatedAt` usage across the codebase and confirm nothing assumes NOT NULL post-backfill. View templates, sp templates, and `BaseEntity` are the most likely offenders. Risk-mitigation only; gates T1.3.
- **T1.12 — Cross-platform parity for metadata-only ALTER (precondition for T1.3).** §6 lists this as a risk; promote it to a task. PostgreSQL 11+ supports the equivalent (`ADD COLUMN ... DEFAULT ... NOT NULL` is metadata-only with a non-volatile default). MySQL behavior is storage-engine-dependent and may need to retain the 3-statement path. Compat-detect and gate.
- **T1.13 — Phase-level wall-clock telemetry.** A direct consequence of T1.4: once phase boundaries are logged, also persist per-phase durations to the run-state file. The current plan estimates which phases dominate; we should *measure* before scoping T2.x.

### 8.3 Re-scoping notes for existing tasks

- **T2.1 (chunked `Metadata.Refresh()`)** — see §2.2 correction. The 1-week estimate was based on retrying 26 imagined calls. Actual fix is server-side pagination of one dataset query, which is structurally different work. Re-estimate after reading the actual `GetDatasetByName('MJ_Metadata')` resolver.
- **T1.2 (skip-entity)** — see §2.4 correction. Reframe as "extend schema-level skip to table-level + pattern + row-count heuristic." Smaller than originally scoped.
- **T1.7 (NameField resolution)** — see §2.10 correction. Start with a focused repro on NSTA to identify the offending code branch. Likely a single conditional, not a template-wide rewrite.

### 8.4 Confirmed-as-stated items

These were verified against the source and the plan's framing is accurate:

- §2.1 / T1.1, T1.5 — `db-connection.ts:36` defaults `requestTimeout` to 120s; not coupled to `acquireTimeoutMillis`.
- §2.3 / T1.3 — `manage-metadata.ts:2946–2958` uses the 3-statement add-NULL / UPDATE / ALTER-NOT-NULL pattern via `dbProvider.addColumnSQL()` + `BatchSeparator`.
- §2.9 / T1.6 — `manage-metadata.ts:4965` does `result.defaultInView.includes(...)` with no null-guard on the container. Field-name validation does run (4968–4973), but only when the container is a valid array.
- §3.1 / T2.4 — the `5` from `advancedGeneration.batchSize` is reused for DB-DDL batches at `sql_codegen.ts:216` and `manage-metadata.ts:4710`. Conflation is real.
- §3.3 — `sql_codegen.ts:2186–2217` `buildCascadeDeleteDependencies` is uncached.
- §3.5 — `entity_subclasses_codegen.ts:149–150` is a serial `for…await` loop.
