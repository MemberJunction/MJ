# PG parity audit — findings log

## ⚖️ VERDICT

**MemberJunction does not yet work on PostgreSQL end-to-end, but it is much closer than "unverified"
suggested, and everything still broken is specific and attributable — 47 of 61 deterministic
integration bundles pass on PostgreSQL once the harness is enabled and the database is bootstrapped
correctly; the 14 that fail trace to 8 named dialect leaks, not to the provider being unsound.**

Residual risk, in order:
1. **Nothing keeps this true.** No CI lane runs the tier on PG yet (the one deliverable I did not
   reach). Everything below can silently regress tomorrow.
2. **Bootstrap is not reproducible from the repo alone.** A from-scratch PG database ends internally
   inconsistent (F9) and needs a manual repair I scripted by hand; `mj codegen` cannot exit 0 at all
   (F12). Until F9 is fixed, "install MJ on PostgreSQL from what the repo ships" does not work.
3. **Dialect leaks in hot paths** (T1 `@@ROWCOUNT`, T2 stored queries with no PG variant) — each
   small, but they sit in TaskGraph and RunQuery.
4. **The SQL Server control tier was not re-run locally**, so "no SS regression" rests on unit tests
   + the argument that the changed code paths are PG-only, not on a full SS tier run.
5. `next` is currently red on **both** platforms for an unrelated reason (F10).

Counted honestly: **12 genuine PG defects (class a)** found, **6 fixed** on this branch (all in the
conversion toolchain + one CodeGen provider bug), **6 filed-not-fixed**; plus **1 platform-neutral
bug** (F10) and **1 SQL-Server CI gate hole** (F3) discovered along the way.


Branch: `feat/pg-runtime-parity` = origin/next (dbf033cb38) + #3697 + #3590 + #3351 (all merged clean).
Worktree: /Users/madhav/Projects/MJ-pg-audit · DB: postgres:17 container `mj-pg-audit` :5455
Build: exit 0, 0 TS errors.

---

## F1 — `mj migrate convert --split --bake-codegen` HALTS on v6 tail (converter gap survives #3351)

**Class:** (a) genuine toolchain defect — PG-only path
**Status:** worked around via documented legacy fallback; needs filing

Command (BAKE DB pre-seeded to the pre-missing-5 state via `mj migrate`, 40 applied, 41/41 flyway success):
```
node packages/MJCLI/bin/run.js migrate convert --split --bake-codegen \
  --source-dir ./migrations/v6 --output-dir ./migrations-pg/v6 -v
```
Result: **exit 2**, halted at the FIRST of the 5 (`V202608081200__Durable_EntityAction_Dispatch`).
`transpiled (DDL): 0 · needs hand-authoring: 1 · with unhandled stmts: 1`
Because `haltBake` fired ("working DB was not advanced past this migration"), the **other 4 were never attempted** — one gap blocks the whole tail.

The 7 unhandled statements (from conversion-gaps.report.json):
| kind | statement |
|---|---|
| IF-EXISTS-BEGIN | `IF EXISTS (SELECT 1 FROM sys.check_constraints cc …)` guard around `DROP CONSTRAINT CK_Task_Assignment` (source line 88) |
| EXECUTE ×6 | `EXEC [schema].spUpdateExistingEntitiesFromSchema` / `spUpdateSchemaInfoFromDatabase` / `spDeleteUnneededEntityFields` / `spUpdateExistingEntityFieldsFromSchema` / `spSetDefaultColumnWidthWhereNeeded` / `spRecompileAllProceduresInDependencyOrder` (source lines ~196–216) |

The 6 EXECs are the standard **CodeGen metadata-refresh block** (present in 2 of the 5 migrations: Durable_EntityAction_Dispatch and TaskGraph_Skipped_And_Exclusive_Groups). Dropping them on PG is *correct* (PG maintains those routines in TypeScript — metadataSupportObjects.ts — and reseeds via `mj sync push`); `spRecompileAllProceduresInDependencyOrder` has no PG analogue at all. So the split path fails on statements it should simply be dropping, and the `sys.check_constraints` guard has a well-known PG form (`DROP CONSTRAINT IF EXISTS`).

**Prior art:** PG_MIGRATION_REPORT.md already records that last release `--split` emitted undeployable output and the team fell back to the legacy converter. #3351 (in this baseline) did **not** close this class.

## F2 — legacy converter path handles all 5 cleanly

```
node packages/MJCLI/bin/run.js migrate convert --source-dir ./migrations/v6 \
  --output-dir ./migrations-pg/v6 --file <name>.sql
```
| migration | exit | batches |
|---|---|---|
| Durable_EntityAction_Dispatch | 0 | 145 total, 121 converted, 27 skipped, 0 err |
| ModelConfiguration_JSONType_Columns | 0 | 141 / 126 / 18 / 0 |
| Clear_EntityAction_RelatedNameField | 0 | 1 / 1 / 0 / 0 |
| TaskGraph_Skipped_And_Exclusive_Groups | 0 | 293 / 246 / 54 / 0 |
| Retire_Workflows_Application | 0 | 1 / 1 / 0 / 0 |

Content verification (the #3252/#3253 silent-emptying class):
- Size diff: PG lines ≥ SS lines for all 5 (4946/4731, 2016/1971, 79/62, 8785/8113, 81/65) — no stubs.
- `scripts/check-pg-migration-content.mjs`: **PG content OK — 223 counterparts checked, 0 suspect. Delete parity OK — 0 mismatched.**
- Spot checks on the halting file: `CK_Task_Assignment` present (4 refs), key `ALTER TABLE` DDL present (5), CodeGen `EXEC` block correctly absent (0).

**Provenance for the PR: all 5 produced by the LEGACY converter, not `--split`.**

---

## F2b — 🔴 **SQLConverter quotes CASE/WHEN/THEN/ELSE/END inside CHECK bodies → migration fails to apply**

**Class:** (a) genuine PG defect · **Severity: blocking** (a shipped migration cannot be applied to PostgreSQL) · **FIXED + regression-tested on this branch**

Caught by the fresh-apply gate — *not* by the converter, which reported `0 errors`:
```
FAILED: V202608081200__v6.1.x__Durable_EntityAction_Dispatch.pg.sql
Error: Failed at batch 1/1 (lines 1-4946): syntax error at or near ""WHEN""
```
Emitted SQL (line 4666): `("CASE" "WHEN" "UserID" IS NOT NULL "THEN" 1 "ELSE" 0 "END") + …`

**Root cause:** `packages/SQLConverter/src/rules/AlterTableRule.ts:145` — `CHECK_KEYWORDS`, a hand-maintained **34-entry denylist** consulted by `quoteCheckColumns` to decide which bare words in a `CHECK(...)` body are keywords rather than column names. It omits the CASE-expression keywords, so MJ's mutual-exclusion constraint shape is mangled into invalid SQL.

This is the **#3604 class**, and it shows #3697's shared-tokenizer consolidation did **not** reach SQLConverter: the authoritative `PostgreSQLQuotingKeywords` in `@memberjunction/sql-dialect` (318 entries) *does* contain all five; the converter simply doesn't use it.

**Derived, not guessed** (per the task's discipline — `scratchpad/derive-check-keywords.mjs`): extracted every paren-balanced `CHECK(...)` body from the shipped T-SQL migrations, tokenized bare ALL-CAPS words, intersected against the 318-entry shared list, subtracted the converter's 34:
```
Scanned 67 migration files, 2084 CHECK bodies.
MISSING from CHECK_KEYWORDS but present in real CHECK bodies: 5
  CASE / WHEN / THEN / ELSE / END   (2 files each)
```
Exactly five — no more. Both affected files are in the missing-5 set (Durable_EntityAction_Dispatch, TaskGraph_Skipped_And_Exclusive_Groups); the CASE-in-CHECK shape is new in v6, which is why it had never been hit.

**Fix applied:** add the five measured keywords to `CHECK_KEYWORDS` with a comment recording the derivation. Deliberately **not** swapping in the full 318-entry shared list: that set exists to identify keywords among *PascalCase* identifiers, and applying it wholesale here would suppress quoting of legitimate ALL-CAPS-ish column names — the opposite failure. The deeper consolidation belongs to #3604.

**Regression test:** `AlterTableRule.test.ts` → *"should not quote CASE expression keywords inside a CHECK body"*, asserting none of the five is quoted **and** (control) that `"UserID"`/`"AgentID"` in the same body still are. **Verified falsifiable**: with the five keywords removed the test fails; restored, 27/27 pass.

**SQL Server impact: none** — SQLConverter is a T-SQL→PG transpiler; it has no SQL Server execution path.

## F2c — 🔴 **Every `IF EXISTS (…)` block is dropped by the classifier — a guarded constraint DROP vanishes silently**

**Class:** (a) genuine PG defect · **Severity: blocking + silent** · **FIXED + regression-tested on this branch**

Surfaced by the fresh-apply gate only *after* F2b was fixed:
```
FAILED: V202608081200__…Durable_EntityAction_Dispatch.pg.sql
Error: constraint "CK_Task_Assignment" for relation "Task" already exists
```
The converted file contains the `ADD CONSTRAINT` (line 4664) but **no DROP at all** — the source's
`IF EXISTS (SELECT 1 FROM sys.check_constraints cc JOIN sys.schemas … JOIN sys.tables …) BEGIN ALTER TABLE … DROP CONSTRAINT … END`
was discarded.

**Minimal repro** (whole input = just that guard) — converter **exits 0** and emits only the file header:
```
$ mj migrate convert --source-dir /tmp/mini-src --output-dir /tmp/mini-out --file V209901010000__v6.1.x__Mini.sql
exit=0
# output contains CREATE EXTENSION / CREATE SCHEMA / SET search_path … and nothing else
```
Silent statement loss with a success exit code — the most dangerous shape, and invisible to
`check-pg-migration-content.mjs` (which detects emptiness and DELETE parity, not a lost DROP).

**Root cause:** `packages/SQLConverter/src/rules/StatementClassifier.ts:68-71` classifies **every**
`IF EXISTS (…)` batch (without NOT) as `SKIP_SQLSERVER`. The comment scopes the intent to
"pre-flight checks (drop extended property, etc.)", but the rule is unconditional. Because the batch
is skipped, `ConditionalDDLRule` never runs on it — so its `convertConstraintCatalogCondition`
(which *does* map `sys.check_constraints` → `pg_constraint`, :494-524) is dead code for this shape.

**Recurrence evidence:** this is the same class the build engineer hand-patched last release —
`migrations-pg/PG_MIGRATION_REPORT.md` manual-fix table rows **#1** ("the constraint drop never
converted (T-SQL `sys.key_constraints` guard) → authored `DROP CONSTRAINT IF EXISTS`") and **#9**
("Unguarded `DROP CONSTRAINT` → `IF EXISTS`"). It has been fixed by hand at least twice instead of
in the converter.

**Fix applied (2 edits):**
1. `StatementClassifier.ts` — a guarded batch whose body contains `DROP CONSTRAINT` classifies as
   `CONDITIONAL_DDL` instead of `SKIP_SQLSERVER`.
2. `ConditionalDDLRule.tryConvertGuardedDropConstraint()` — rewrites the block to PG's native
   idempotent `ALTER TABLE <t> DROP CONSTRAINT IF EXISTS <c>;`, returning `null` (i.e. falling
   through to the existing generic DO-block path) unless the guarded body is *solely* DROP
   CONSTRAINT statements. The T-SQL catalog query is intentionally discarded rather than translated:
   it exists only because SQL Server lacks `DROP CONSTRAINT IF EXISTS`.

**Regression tests** (`ConditionalDDLRule.test.ts`): the joined-catalog guard converts and leaves no
`sys.` / `IF EXISTS (` residue; plus a **negative** test that a non-DROP `IF EXISTS` body does *not*
take the new path.

**Whole-suite proof:** `packages/SQLConverter` → **1128 passed, 3 skipped, 0 failed**, including the
corpus tests that re-convert the committed v5/v6 ledger ("zero TODO markers", "zero EntityField
sequence collisions in committed files"). So neither converter fix perturbs any existing conversion.

**SQL Server impact: none** — transpiler-only package, no SQL Server execution path.

## F2d — 🔴 **T-SQL table variables and delete-joins produce unparseable PL/pgSQL**

**Class:** (a) genuine PG defect · **Severity: blocking** · **FIXED + regression-tested**

Surfaced by the gate once F2b/F2c were fixed (each fix advances the gate to the next real defect):
```
FAILED: V202608082130__…Clear_EntityAction_RelatedNameField.pg.sql
Error: syntax error at or near "v_EntityActionConsumers"
```
Two distinct defects in one 62-line migration:
1. `DECLARE @EntityActionConsumers TABLE (EntityID uniqueidentifier PRIMARY KEY)` was emitted as
   **`v_EntityActionConsumers TABLE;`** — PL/pgSQL has no table-variable type, so the declaration is
   invalid. (`DeclareDmlBlockRule.convertDeclareItem` matched the type as the literal word `TABLE`.)
2. `DELETE ef FROM … ef JOIN @X c ON …` was passed through verbatim — valid T-SQL, invalid PG.
   The *UPDATE* analogue was already handled (`convertUpdateFrom`); the DELETE one simply didn't exist.

Same recurring-hand-patch story as F2c: `PG_MIGRATION_REPORT.md` manual-fix **#6** records
`DECLARE @DoomedEntityIDs TABLE` → `CREATE TEMP TABLE … ON COMMIT DROP` being authored by hand.

**Fixes applied (3 edits, all in SQLConverter):**
- `DeclareDmlBlockRule.convertTableVariables()` — new pass, ordered *before* `convertDeclare` so the
  statement lands in the DO-block body rather than the DECLARE section:
  `DECLARE @X TABLE (cols);` → `CREATE TEMP TABLE v_X (cols) ON COMMIT DROP;`
  (`ON COMMIT DROP` matches a table variable's transaction lifetime; the `v_` prefix matches what
  `convertVariableRefs` already rewrites references to). Paren matching is string-literal aware.
- `DeclareDmlBlockRule.convertDeleteFrom()` — the DELETE analogue of `convertUpdateFrom`:
  `DELETE a FROM t a JOIN o c ON <j> WHERE <w>` → `DELETE FROM t a USING o c WHERE <j> AND <w>`.
  PG keeps the target alias, so no alias rewriting is needed. Plain `DELETE FROM` cannot match.
- `ExpressionHelpers.PASCAL_QUOTE_KEYWORDS` += `TEMP`, `COMMIT`, `USING` — without them the
  PascalCase quoter turned the new emission into `CREATE "TEMP" TABLE … ON "COMMIT" DROP`.
  **Risk measured, not assumed:** zero columns named `temp`/`commit` exist in the v5.46 baseline,
  in any v6 counterpart, or in the live migrated database (`information_schema.columns` → 0).

**Regression tests** (`DeclareDmlBlockRule.test.ts`, 3 added): temp-table emission with no `"TEMP"`/
`"COMMIT"` quoting and the body still referencing `v_Consumers`; delete-join → `USING`; and a
**negative** test that a plain `DELETE FROM` is left untouched.

**Whole-suite proof:** `packages/SQLConverter` → **1131 passed, 3 skipped, 0 failed** (up from 1128;
the corpus tests that re-convert the entire committed v5/v6 ledger still pass).

---

## F2 SUMMARY — the converter could not produce a deployable v6 tail; 4 defects, all now fixed

| # | Defect | Detected by | Fixed in |
|---|---|---|---|
| F2b | CASE/WHEN/THEN/ELSE/END quoted as identifiers in CHECK bodies | fresh-apply gate | `AlterTableRule.CHECK_KEYWORDS` |
| F2c | every `IF EXISTS(…)` batch skipped → guarded DROP CONSTRAINT lost **silently, exit 0** | fresh-apply gate | `StatementClassifier` + `ConditionalDDLRule.tryConvertGuardedDropConstraint` |
| F2d.1 | table variable → invalid `v_X TABLE;` | fresh-apply gate | `DeclareDmlBlockRule.convertTableVariables` |
| F2d.2 | `DELETE alias FROM … JOIN` passed through as T-SQL | fresh-apply gate | `DeclareDmlBlockRule.convertDeleteFrom` |
| F2d.3 | `"TEMP"` / `"COMMIT"` quoted as identifiers | fresh-apply gate | `PASCAL_QUOTE_KEYWORDS` |

## F2e — `WITH CHECK ADD CONSTRAINT` survives on non-FK constraints
**Class:** (a) · **FIXED + tested.** Gate: `syntax error at or near "WITH"` on TaskGraph (line 8157:
`ALTER TABLE __mj."Task" WITH CHECK ADD CONSTRAINT "CK_Task_Status" …`). `AlterTableRule` stripped
`WITH NOCHECK` **only inside the `if (/FOREIGN KEY/)` branch** and never handled `WITH CHECK`, so a
CHECK/UNIQUE/PK constraint carrying the prefix reached PG verbatim. Fix: unconditional
`/\bWITH\s+(?:NO)?CHECK\s+(?=ADD\b)/gi → ''`, anchored on the following `ADD` so the separate
`WITH CHECK CHECK CONSTRAINT` *enable* form (already handled as a no-op) is untouched. Test added.

## F2f — T-SQL `END ELSE BEGIN` left verbatim; and the DECLARE section is lost after a blank line
**Class:** (a) · **FIXED + tested.** Two defects in the last of the five:
1. Gate: `syntax error at or near "ELSE"`. `convertIfBlocks` converted `IF … BEGIN` → `IF … THEN` and
   a trailing `END` → `END IF;`, but the `END ELSE BEGIN` join between branches matched neither, so
   PL/pgSQL received a stray `END` and a stray `BEGIN`. Fix: rewrite `END ELSE BEGIN` (and bare
   `END ELSE`) to `ELSE` **before** the standalone-END rule.
2. Gate: `syntax error at or near "v_WorkflowsAppID"`. Root cause was subtle — `convertDeclare`'s
   indent capture `^(\s*)DECLARE` also matched the **newline of a preceding blank line**, so it
   emitted `DECLARE\n\nv_X UUID := …`. `wrapInDoBlock` treats a blank line as the end of the DECLARE
   section, so the declaration was written into the body, where PG rejects it. Any migration with a
   blank line before its `DECLARE` — i.e. the normal formatting — hits this.
   Fix: `([ \t]*)` for the indent (root cause) **and** `wrapInDoBlock` no longer treats a blank line
   as the section terminator (defence in depth). Test asserts the declaration is in the DECLARE
   section *and* absent after `BEGIN`.

## ✅ F2 RESULT — fresh-apply gate GREEN

```
$ mj migrate            # virgin MJ_PG_AUDIT_pgparity, committed ledger + all 5 new counterparts
Migrations complete in 4.1s — 45 applied
GATE7_EXIT=0
```
Post-state: **376 tables · 383 views · 1,986 functions · flyway 46/46 success**, last applied
`202608082330` (the final v6 migration) — PostgreSQL is now at **full migration parity with SQL
Server**. `CK_Task_Assignment` present exactly once (the F2c drop/re-add round-trips correctly).
`check-pg-migration-content.mjs`: 223 counterparts, 0 suspect, delete parity OK.

It took **seven** fresh-apply attempts to get there; each one surfaced exactly one more defect.

**Systemic observations for the report:**
1. **Only the fresh-apply gate caught any of these.** The converter reported `0 errors` every time;
   `check-pg-migration-content.mjs` passed (223 counterparts, 0 suspect) at every stage. DEPLOYMENT.md
   already says "the real gate is a clean `mj migrate` on a fresh PG database" — this run is direct
   evidence for that sentence, and evidence that a converter exit code proves nothing.
2. **Three of the four are keyword/statement denylists** (`CHECK_KEYWORDS`, the `IF EXISTS` skip,
   `PASCAL_QUOTE_KEYWORDS`) — exactly the failure mode **#3604** predicts. #3697 consolidated
   CodeGenLib and PostgreSQLDataProvider onto one shared tokenizer but **did not reach SQLConverter**,
   which still carries ≥4 independent hand-maintained keyword lists.
3. **At least two are documented recurring hand-patches** (PG_MIGRATION_REPORT manual fixes #1/#6/#9):
   the same classes have been fixed by hand at release time instead of in the converter.
4. **F2c is the dangerous shape** — silent statement loss with a success exit code, invisible to every
   existing content check.

## F6 — 🔴 A migration-only PG bootstrap leaves orphan `EntityField` metadata that SQL Server's in-migration CodeGen EXECs clean up

**Class:** (a) genuine SS/PG divergence · **Severity: blocks `mj sync push`** · under investigation

`mj sync push --dir=metadata --ci` on the freshly-migrated PG database fails. **Not** the dashboard
permission error recorded in PG_MIGRATION_REPORT (B2) — a different and more fundamental one:

```
PostgreSQLDataProvider.ExecuteSQL failed: column "EntityAction" does not exist
BaseEngine: Failed to load MJ: Entity Action Filters into _EntityActionFilters: column "EntityAction" does not exist
BaseEngine: Failed to load MJ: Entity Action Invocations …
BaseEngine: Failed to load MJ: Entity Action Params …
PostgreSQLDataProvider.ExecuteSQL failed: column "ModelConfiguration" does not exist
```

**Mechanism, established by measurement rather than inference:**
- `V202608082130__Clear_EntityAction_RelatedNameField` exists precisely to delete these orphan rows.
  Its UPDATE half **worked** (`EntityActionID` FKs still requesting a name field: **0**), but 4 orphan
  `EntityField` rows named `EntityAction` still exist — on exactly the 4 entities it targets.
- Their `__mj_CreatedAt` is `02:29:04.620332`, which equals the `installed_on` of
  **`202608082250` (TaskGraph_Skipped_And_Exclusive_Groups)** — the migration that runs *immediately
  after* the fix (`202608082130` at `.61758`). So the fix deletes them and the next migration
  re-creates them from its baked CodeGen EntityField INSERTs.
- On **SQL Server** that same migration ends with the CodeGen refresh block —
  `EXEC spDeleteUnneededEntityFields`, `spUpdateExistingEntityFieldsFromSchema`, … (source lines
  ~297–317) — which reconciles metadata against the physical schema and removes the orphans.
  On **PostgreSQL** those EXECs are (correctly) dropped by the converter, because PG keeps those
  routines in TypeScript (`metadataSupportObjects.ts`) invoked by `mj codegen`.
- DEPLOYMENT.md Step 8 states the PG deploy flow is `mj migrate` → `mj sync push`, **"never
  `mj codegen`"**. That holds for *schema* objects (baked inline) but not for *metadata
  reconciliation*, which on SQL Server rides inside the migrations and on PG has no equivalent step.
  Net effect: a from-scratch PG database ends with metadata describing columns its own views do not
  have, and every base view over those entities is unqueryable.

Next step under test: `mj codegen --skipfiles` against the fresh PG database (the PG analogue of the
`bootstrap-clean-db` skill's SQL Server step 1b) to see whether it reconciles the orphans.

## F7 — 🔴 One failed statement poisons the whole `mj sync push` transaction on PG (no SS equivalent)

**Class:** (a) genuine PG defect — the brief's "transaction poisoning" hypothesis, confirmed

After the first `column … does not exist`, every subsequent statement in the push fails with:
```
PostgreSQLDataProvider.ExecuteSQL failed: current transaction is aborted, commands ignored until end of transaction block
❌ Processing failed for MJ: State Provinces at MJ: State Provinces[13]
⚠️  Rolling back database transaction due to error...
```
PostgreSQL aborts the entire transaction on any error, so a single failing statement converts into a
whole-push rollback and the reported failure names an **unrelated, innocent record**
(`MJ: State Provinces[13]`) hundreds of records after the real cause. SQL Server does not behave this
way: a failed statement inside a transaction leaves the transaction usable, so the same push
continues and either succeeds or fails pointing at the true culprit.

Two consequences worth reporting separately from the root cause:
1. **Diagnosability** — the surfaced error is maximally misleading. The real error appears ~30 lines
   earlier and is *not* the one the CLI reports as the failure.
2. **This is very likely what B2 actually was.** PG_MIGRATION_REPORT's "You do not have permission to
   edit this dashboard" is the same shape — a downstream victim of an earlier poisoned transaction
   (an engine whose cache failed to load ⇒ permission check sees an empty `_dashboards`) rather than
   a permission defect. The engine-load failures above (`BaseEngine: Failed to load …`) are exactly
   the mechanism that would empty `DashboardEngine._dashboards`.

## F8 — 🔴 `callRoutineSQL` cannot invoke a PG side-effect routine — entity pruning is dead on PostgreSQL

**Class:** (a) genuine PG defect · **FIXED on this branch** · the lynchpin behind F6

`mj codegen --skipfiles` on the fresh PG database fails with, repeatedly:
```
Error removing metadata for entity undefined, error: a column definition list is required for functions returning "record"
```
**Root cause:** `PostgreSQLCodeGenProvider.callRoutineSQL` (PostgreSQLCodeGenProvider.ts:1465) always emits
`SELECT * FROM schema."fn"(args)`. PostgreSQL rejects that form for a function declared
`RETURNS SETOF record` **with no OUT parameters**, because it cannot infer the row shape.

**Measured, not assumed** — of the 7 `SETOF record` functions in `__mj`, exactly **one** lacks OUT
parameters (`pg_proc.proallargtypes IS NULL`):

| function | has OUT params |
|---|---|
| ExtractVersionComponents, fn_MJ_GeoRecordsNear, spDeleteUnneededEntityFields, spGetPrimaryKeyForTable, spUpdateExistingEntitiesFromSchema, spUpdateExistingEntityFieldsFromSchema | ✅ yes — `SELECT * FROM` works |
| **spDeleteEntityWithCoreDependencies** | ❌ **no** — the only breakage |

(An earlier inference that the whole reconciliation path was broken was **wrong** and is corrected
here: 6 of 7 work. `SELECT * FROM __mj."spGetPrimaryKeyForTable"('Entity','__mj')` returns a row.)
The function's body contains **no RETURN statement at all** — it is a pure side-effect routine.

**Why it matters far beyond one error:** this is the call CodeGen uses to prune entities whose base
tables no longer exist. The v6 workflow-retirement migrations drop the Workflow / OutputTriggerType
tables but leave their `Entity` metadata; CodeGen tries to prune them, the call fails, the stale
entities survive, and CodeGen then tries to regenerate *their* views and CRUD routines:
```
Failed to regenerate base view for MJ: Output Trigger Types: relation "__mj.OutputTriggerType" does not exist
[Critical] Post-CodeGen validation detected 22 CRUD routine(s) the runtime expects but the database is missing.
```
So one un-invokable routine cascades into a failed CodeGen run and 22 missing CRUD routines.

**Fix:** add an optional `expectsResultSet` parameter (default `true`) to `callRoutineSQL` on the
abstract provider and both implementations. When `false`, the PG provider emits
`DO $$ BEGIN PERFORM schema."fn"(args); END $$` — PERFORM runs the routine and discards its result,
which is valid for any function. The SQL Server implementation ignores the flag (`EXEC` is correct
either way), so **SQL Server behaviour is byte-identical**. Only the one genuinely void call site
(manage-metadata.ts:3069) passes `false`; the other 7 call sites are untouched.

## F9 — 🔴 **`R__RefreshMetadata` is not equivalent across platforms: 7 reconciliation routines on SQL Server, 1 statement on PostgreSQL**

**Class:** (a) structural SS/PG divergence · **the root cause behind F6, and the headline finding**

Both platforms ship a *repeatable* Flyway migration that re-runs after every migration pass.
They are not the same thing:

| | SQL Server `migrations/R__RefreshMetadata.sql` | PostgreSQL `migrations-pg/v5/R__RefreshMetadata.pg-only.sql` |
|---|---|---|
| statements | **7 EXECs** | **1 UPDATE** |
| recompile all views | ✅ `spRecompileAllViews` | ❌ |
| update entities from schema | ✅ `spUpdateExistingEntitiesFromSchema` | ❌ |
| sync schema info | ✅ `spUpdateSchemaInfoFromDatabase` | ❌ |
| **delete unneeded entity fields** | ✅ `spDeleteUnneededEntityFields` | ❌ |
| update entity fields from schema | ✅ `spUpdateExistingEntityFieldsFromSchema` | ❌ |
| default column widths | ✅ `spSetDefaultColumnWidthWhereNeeded` | ❌ |
| recompile procedures | ✅ `spRecompileAllProceduresInDependencyOrder` | ❌ |
| sync `AllowsNull` from information_schema | ❌ | ✅ (the only thing it does) |

**Crucially, 5 of the 6 missing routines already exist as PG functions** (emitted by
`metadataSupportObjects.ts` — verified present in the live database). The PG repeatable migration
simply never calls them.

**Observed consequences on a from-scratch PG database (all verified against the live DB):**
1. **Stale views.** `V202608081622__ModelConfiguration_JSONType_Columns` adds the physical column and
   its metadata but does not itself recreate `vwAIModels`; on SQL Server `spRecompileAllViews` does.
   Result on PG: `__mj.AIModel` **has** the `ModelConfiguration` column, `__mj.vwAIModels` **does
   not** → `column "ModelConfiguration" does not exist` → `BaseEngine: Failed to load MJ: AI Models`.
2. **Orphan fields.** `V202608082130__Clear_EntityAction_RelatedNameField` deletes 4 orphan
   `EntityField` rows; the very next migration (`202608082250`) re-inserts them from its baked
   CodeGen INSERTs. Timestamps prove it: the surviving rows' `__mj_CreatedAt` = `02:29:04.620332`
   = that migration's `installed_on` exactly. On SQL Server `spDeleteUnneededEntityFields` in the
   repeatable pass cleans them up afterwards; on PG nothing does. → `column "EntityAction" does not
   exist` on 4 entities' base views.
3. Both of the above then poison the `mj sync push` transaction (F7).

**Net:** a PostgreSQL database built only from what the repo ships ends up with metadata that
describes columns its own views do not have. That is a runtime-parity defect, invisible to every
existing PG gate (which check migration *application*, not post-migration metadata consistency).

## F10 — ⚪ `mj sync push` duplicate-key on `MJ: Query Parameters` — **NOT a PG defect; `next` is red on SQL Server too**

**Class: (b)/(c) — platform-neutral, pre-existing on `next`.** This is the classification the control
comparison exists to produce, and it is the one finding that would have been logged as a PG defect
without it.

After F6/F9's metadata drift was repaired, the PG push advanced ~900 log lines further and failed with:
```
PostgreSQLDataProvider.ExecuteSQL failed [Save MJ: Query Parameters]:
  duplicate key value violates unique constraint "UQ_QueryParameter_QueryID_Name"
Record ID: 6C3F8B22-9A41-4E5D-B7C8-1D2E3F4A5B60 · Record Name: agentRunID
```
Before blaming PostgreSQL: **the SQL Server `integration.yml` run on the identical baseline commit
`dbf033cb3` also fails, with the identical error** (run 31345428194):
```
Violation of UNIQUE KEY constraint 'UQ_QueryParameter_QueryID_Name'.
The duplicate key value is (344addad-458b-4fbc-9f2e-34915ed5373a, agentRunID).
```
Same QueryID, same parameter name, both platforms. The constraint exists in both ledgers.

**Origin:** commit `730e5a459d` ("feat(agents): load a whole run tree in one query"), merged into
`next` via PR #3698 — the tip my baseline is built from. It adds
`metadata/queries/.get-agent-run-tree.json`, which declares two `MJ: Query Parameters` with hardcoded
primary keys. Both logs also show the LLM-based extractor failing first for want of credentials:
```
No suitable model found for prompt "SQL Query Parameter Extraction". No valid API credentials …
```
so the heuristic fallback appears to create a parameter that then collides with the declared one.
Neither the ID nor the name pre-exists in the database (verified: 0 rows) — the duplicate is created
**within the push's own transaction**.

**Consequences worth reporting on their own:**
- `next` currently cannot complete `mj sync push --dir=metadata` on **either** backend without AI
  credentials. The SQL Server integration lane has been red since that merge.
- It is a credential-dependent metadata push: a step documented as deterministic now needs a working
  model vendor, and degrades to a constraint violation rather than a skip when one is absent.

**Audit handling:** worked around by excluding that single query file from the bootstrap push (the
defect is unrelated to PG parity), and recorded here rather than counted against PostgreSQL.

## F11 — 🔴 **B2 SOLVED: "You do not have permission to edit this dashboard" is a sync-Validate-over-async-engine defect, not a permission or PG problem**

**Class: (a) genuine product defect, platform-NEUTRAL, in a published package (`@memberjunction/core-entities`).**
Per scope discipline this is **filed, not fixed** — its root cause is broader than PostgreSQL.

This closes the open question PG_MIGRATION_REPORT.md left as *"Needs a decision before PG metadata
reseed can be proven"*, and shows the report's own hypothesis ("a context-user/permission problem")
was **wrong**.

Reproduced cleanly once F6/F9/F10 were out of the way — now the **first and only** error in the push,
after 56 directories completed, so nothing upstream is poisoning it:
```
✖ Push failed Failed to save MJ: Dashboards record at MJ: Dashboards[1]:
  {"Source":"Permission","Message":"You do not have permission to edit this dashboard",
   "Value":"c8dd0c2e-c778-4867-b6ca-8229473faee9","Type":"Failure"}
```

**The decisive measurement — the context user *is* the owner:**
| | value |
|---|---|
| `Dashboard.UserID` for `c8dd0c2e…` ("Security") | `ecafccec-6a37-ef11-86d4-000d3a4e707e` |
| `User` where Name = 'System' → `ID` | `ecafccec-6a37-ef11-86d4-000d3a4e707e` |

`GetDashboardPermissions` grants owners everything (`if (UUIDsEqual(dashboard.UserID, userId))`), so a
working check would have **passed**. It never got that far.

**Mechanism (all three facts verified in code and in the run log):**
1. `MJDashboardEntityExtended.Validate()` (MJCoreEntities/src/custom/MJDashboardEntityExtended.ts:61)
   is **synchronous** and calls `DashboardEngine.Instance.GetDashboardPermissions(...)`. Being sync it
   *cannot* `await Config()`, and the file contains no Config call at all (same at `:90` in `Delete()`).
2. `DashboardEngine` is `@RegisterForStartup()` (engines/dashboards.ts:57), and the CLI push runs in
   **task** startup mode — the run log says so verbatim:
   `MJ startup: task mode — engine pre-warm skipped (14 engine(s) deferred to first use)`.
3. `GetDashboardPermissions` (engines/dashboards.ts:176) reads `this._dashboards` **directly**, not via
   `GetConfigData`, so an unconfigured engine is an empty array rather than an error:
   `find()` → `undefined` → `noPermissions` → `CanEdit:false` → the message above.

So the gate denies **every** dashboard edit in any process where the engine hasn't been warmed —
including the legitimate owner — and reports it as a permission failure.

**Why it looks PG-specific but is not:** on SQL Server the same push does not mark this dashboard
dirty, so `Save()` (and therefore `Validate()`) is never called and the latent defect stays hidden.
On PostgreSQL the record is classified as changed, `Save()` runs, and the gate fires. The
*divergence* (why PG dirties the row) is a separate, smaller question — field-comparison
normalisation, most likely on the JSON `UIConfigDetails` column — and is noted for follow-up.

**Suggested fix (for the issue, not applied here):** the check must distinguish "not permitted" from
"cannot tell yet". Denying on an unloaded cache is a false negative on a security-shaped path, and
`Validate()` being synchronous means the engine has to be warmed by the caller (PushService) or the
check moved to an async path. Both options are a change to a published package's behaviour and
deserve their own PR and their own SQL Server regression evidence.

## F12 — 🟠 Shipped metadata enables a SQL-Server-only feature, so `mj codegen` can never exit 0 on PostgreSQL

**Class: (a) genuine PG parity gap** (product/metadata, not a code bug — CodeGen behaves correctly)

`metadata/entities/.layered-base-views.json` — shipped, pushed to every database — sets
`GeneratedBaseViewName` on two core entities:
```
MJ: Version Installations  → vwVersionInstallationsGenerated
MJ: User View Run Details  → vwUserViewRunDetailsGenerated
```
CodeGen **deliberately refuses** that configuration on PostgreSQL, with an unusually good error:
> Entity "MJ: Version Installations" sets GeneratedBaseViewName …, but layered base views are not
> supported on PostgreSQL. PostgreSQL freezes a view's column list at creation and has no
> sp_refreshview equivalent, so the application-owned view … would silently stop gaining columns …

The refusal is right. The problem is that the metadata is pushed to PostgreSQL anyway, so
`mj codegen` exits **1** on every from-scratch PG database — even though everything else succeeds
(`Post-CodeGen CRUD validation passed (375 entities checked)` in the same run). The paired migration
`V202608050105__Layered_Base_Views_Pilot` *is* a documented PG no-op; the metadata half has no such
exclusion. Nothing in `metadata/` can currently say "SQL Server only".

Same physics as F9 — `sp_refreshview` has no PostgreSQL equivalent — surfacing a third way.

---

# ⭐ THE TIER RAN ON POSTGRESQL — first time ever (#3257)

Harness enablement (Phase 2) landed: `packages/TestingFramework/CLI/src/lib/mj-provider.ts` now
branches on platform, `config-loader.ts` carries `dbPlatform`, `package.json` declares the PG
provider as an optionalDependency, `getContextUser()` resolves identically on both platforms
(System → well-known ID → first active Owner with `.trim()` on the space-padded `Type`), and
`mj.config.cjs` gained `dbPlatform` + a platform-aware `dbPort` default (inert on SQL Server, which
sets neither variable).

**MJAPI also boots and serves on PostgreSQL** — health probe `HTTP 200`, startup vector sync
completed (`1,302 records vectorized`), so the client-transport bundles exercised the real wire.

| run | condition | result |
|---|---|---|
| 1 | MJAPI absent (port occupied by an unrelated process) | `[SUMMARY] 32/61 passed` — 32 Passed / 9 Failed / **20 Error** |
| 2 | MJAPI live on PG | **`[SUMMARY] 47/61 passed (77.0%)`** — 14 non-passing |

All **61 executed in both runs; zero skipped** (no `SKIPPED (environment gap)`, no `Bootstrap failed`
in run 2).

### Run-1 artifact worth reporting on its own (skip-vs-fail, the #3688 class)
An unrelated process answering on the configured GraphQL port turned 20 client-transport bundles into
**`Error`**, not skips: `preflightMJAPI` only maps *connection refusal* to the skip path
(`/MJAPI is not reachable/i`), while an HTTP response — here `answered HTTP 501` — falls through as a
hard error. So "MJAPI absent" and "MJAPI wrong" are indistinguishable to the operator but produce
opposite statuses. Class (c) for this audit; worth a small hardening issue.

### The 14 non-passing bundles on PostgreSQL (run 2)
IT01, IT02, IT03, IT06, IT08, IT21, IT22, IT29, IT33, IT34, IT50, IT52, IT69, IT74.

### Root causes attributed by error signature (counts from the run log)

| # | signature | count | attribution | class |
|---|---|---|---|---|
| **T1** | `column "rowcount" does not exist` | 7,168 | **`packages/TaskGraph/src/TaskClaimStore.ts:258`** emits `` `${sql};\nSELECT @@ROWCOUNT AS ${db.QuoteIdentifier('AffectedRows')}` ``. `@@ROWCOUNT` is T-SQL-only; PG has no equivalent, the `@@` is consumed as a parameter marker and bare `ROWCOUNT` folds to `rowcount`. Note the line *is* dialect-aware for the alias and hardcodes the T-SQL function anyway. Breaks IT74. | **(a)** |
| **T2** | `syntax error at or near "["` | 16 | Stored **query SQL executed verbatim**. Measured: **21 queries exist, only 10 have a PostgreSQL `QuerySQL` dialect variant, and 9 carry T-SQL brackets in their base SQL.** RunQuery falls back to the T-SQL base rather than failing clearly. Breaks IT02/IT33/IT34. | **(a)** |
| **T3** | `column "__mj_updatedat" does not exist` | 6 | `__mj_UpdatedAt` reaching PG unquoted and folding to lowercase — the identifier-quoting class #3697 addresses, evidently not covered on this path. | **(a)** |
| **T4** | `type "uniqueidentifier" does not exist` | 4 | A T-SQL type name leaking into runtime SQL. | **(a)** |
| **T5** | `operator does not exist: uuid = character varying` (+ the mirror) | 3 | UUID compared to a string parameter with no cast. SQL Server converts implicitly; PostgreSQL will not. | **(a)** |
| **T6** | `Cannot read properties of null (reading 'SearchEntities')` | 4 | Null engine/cache on the search path (IT52). | (a), needs triage |
| **T7** | `update or delete on table …` FK violations | 5 | Deferred-constraint / teardown-ordering differences. | needs triage |
| **T8** | `relation "nowhere_at_all" does not exist` | 2 | A test's own negative control firing correctly — **benign**. | (b) |

IT50 (CodeGen Artifact Consistency) and IT69 (Layered Base Views) fail for the reasons already
established as F9/F12 — metadata/view drift and the SQL-Server-only layered-view metadata.

**Bottom line:** with the harness enabled and a correctly bootstrapped database, PostgreSQL runs
**47 of 61** deterministic bundles. The residue is a small number of *specific, attributable*
dialect leaks — not a broad failure of the provider.

## F3 — `ctx.Pool` is undefined on the CLI suite path on BOTH platforms (SS CI gate hole)

**Class:** (a)-adjacent — a SQL Server CI coverage hole, not a PG regression. #3688 class.
Verified in code (two independent passes):
- `suite.ts:39-48` installs only the instrumented storage; it never creates a server bootstrap.
- `IntegrationTestDriver.ts:391` takes `pool = activeBootstrap?.Pool`; the `if (!storage)` fallback that would call `bootstrapIntegrationServer()` (the only `_setCurrentServerBootstrap` caller) never fires because storage is always set.
⇒ `ctx.Pool === undefined` regardless of platform ⇒ **11 checks skip-as-pass in today's SQL Server CI**:
- IT24 metadata-consistency: **7** (MC1–MC6 + **MC8**) — `poolOrSkip` call sites at :368,385,408,448,472,502,549
- IT69 layered-base-views: **4** (LBV2–LBV5) — `catalogOrSkip` at :80
Counted programmatically (`grep -c` = 8 and 5 including the two helper definitions).
To confirm empirically with one SS run before filing.

## F4 — `applyLLMPrimaryKeys` uses the LLM's spelling in the UPDATE (platform-neutral bug, PG-fatal)
`packages/CodeGenLib/src/Database/manage-metadata.ts:2376-2396`: `validPKs` is filtered case-**insensitively** against `entity.Fields`, but keeps the LLM's string; the UPDATE then runs `WHERE … AND Name='${pk}'`. On PG (case-sensitive) a returned `orderid` for column `OrderID` matches 0 rows — and the method still returns `true`. Fix: map to the matched field's actual `.Name`.

## F5 — `sql_logging.ts` PG folder swap is pinned to v5 by exact match
`packages/CodeGenLib/src/Misc/sql_logging.ts:7-8,42`: swap fires only when `folderPath === './migrations/v5/'`. With the repo now on v6, a `./migrations/v6/` setting doesn't swap and PG CodeGen audit SQL is written into the **SQL Server** tree. Fix: prefix rewrite `./migrations/` → `./migrations-pg/` under `dbPlatform()==='postgresql'`, preserving the "explicit non-default path honored as-is" intent.
