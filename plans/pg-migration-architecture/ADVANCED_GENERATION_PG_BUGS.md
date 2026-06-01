# Advanced Generation Bugs on PostgreSQL

## Summary

`mj codegen` against PostgreSQL fails repeatedly inside the **advanced generation
phase** with a series of platform-specific bugs. The CRUD-sproc generation
phase (the part this branch's JSON-arg work depends on) runs cleanly. Advanced
generation is independent — it produces AI-driven metadata enrichment that
nobody on the JSON-arg path needs.

This document captures every bug found during a deep verbose run on
2026-05-07, the structural pattern they share, and the recommended fix.

## Bugs found

All bugs fire only when `advancedGeneration.enableAdvancedGeneration: true`
(the default). They do not affect CRUD sproc generation, which runs in an
earlier phase.

### Bug 1 — Missing `;` between batched UPDATE statements

**Symptom:** `syntax error at or near "UPDATE"` (~600 occurrences per run).

**Source:**
- [packages/CodeGenLib/src/Database/manage-metadata.ts](../../packages/CodeGenLib/src/Database/manage-metadata.ts)
- Five callsites: `applyLLMIdentifiedPKs` (~line 1688), `applyLLMIdentifiedFKs`
  (~1747), `applyLLMGeneratedDescriptions` (~1798), `applySmartFieldIdentification`
  (~4914), `applyFieldCategories` (~5410).
- Pattern: `sqlStatements.join('\n')` followed by `LogSQLAndExecute(...)`.
  Each pushed UPDATE is missing a trailing `;`, so the joined string is
  `UPDATE ...\nUPDATE ...` — multiple statements with no terminator.

**Why SS hides this:** SS tolerates newline-separated statements in single-batch
mode. PG's parser does not.

**Tactical fix attempted (currently in stash):** added `;` to each pushed
statement template + introduced `LogSQLBatchAndExecute(pool, statements[], ...)`
private method on `ManageMetadataBase` that owns the per-statement termination
+ join logic. The method works, but it's a band-aid — the real bug is callers
hand-writing SQL strings.

### Bug 2 — Float→INT4 conversion (Groq adapter)

**Symptom:** `invalid input syntax for type integer: "71.610453"` (~2,000
occurrences per run).

**Source:**
- [packages/AI/Providers/Groq/src/models/groq.ts](../../packages/AI/Providers/Groq/src/models/groq.ts)
- Groq returns timing in seconds (e.g. `0.07161...`); the adapter multiplies
  by 1000 to convert to ms. The result is a float (`71.610...`), but the
  destination columns (`AIPromptRun.QueueTime`/`PromptTime`/`CompletionTime`)
  are declared `INT4` on PG.

**Why SS hides this:** SS does implicit FLOAT→INT truncation. PG's strict
typing rejects non-integer values for integer columns.

**Tactical fix attempted (currently in stash):** wrap each `* 1000` conversion
in `Math.trunc()`. Matches SS's documented FLOAT→INT truncate semantics so
the platforms behave identically.

### Bug 3 — Unquoted PascalCase identifiers in INSERT/UPDATE statements

**Symptom:** `column "__mj_createdat" of relation "EntitySetting" does not exist`
(~60 occurrences per run, plus related "Entity Icon" / "Category Info Settings"
errors).

**Source:**
- [packages/CodeGenLib/src/Database/manage-metadata.ts](../../packages/CodeGenLib/src/Database/manage-metadata.ts)
- `applyEntityIcon` (~line 5436), `applyCategoryInfoSettings` (4 SQL templates,
  ~5470, ~5481, ~5506, ~5517), `applyEntityImportance` (~5538).
- Pattern: hand-written SQL with unquoted column names like `__mj_CreatedAt`,
  `__mj_UpdatedAt`, `Icon`, `Value`, `EntityID`, `Name`, `ID`.

**Why SS hides this:** SS uses case-insensitive collation by default, so
`SET Icon = ...` resolves the column regardless of case. PG case-folds
*unquoted* identifiers to lowercase, but the actual columns were created with
quoted PascalCase names (`"Icon"`, `"__mj_CreatedAt"`), so the lowercase
form doesn't exist.

**Tactical fix attempted (currently in stash):** wrap every column reference
in `this.qi(...)`. Made the immediate symptom go away. Same band-aid quality
as Bug 1.

### Bug 4 — SS-style `[brackets]` and `GETUTCDATE()` in validator-function emission

**Symptom:** `syntax error at or near "["` (~268 occurrences per run, masked
as `Error logging and executing SQL for MJ: <Entity> Permissions`).

**Source:**
- [packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts](../../packages/CodeGenLib/src/Misc/entity_subclasses_codegen.ts)
  lines ~508 and ~520.
- Pattern: literal SS T-SQL syntax embedded in a hand-written template:
  `UPDATE [${mj_core_schema()}].[GeneratedCode] SET ...`, with bare column
  names and `GETUTCDATE()` for timestamps. The `EntitySubClassGeneratorBase`
  class does not import or use `SQLDialect`.

**Why SS hides this:** the syntax IS valid T-SQL. There's no dialect routing
— this code path was written assuming SQL Server.

**Tactical fix not attempted.** The pattern is so SS-specific it would
require a full rewrite to PG-aware dialect emission — same shape as the
real fix described below.

### Bug 5 — `EntityField` unique-constraint violation during AI field-creation

**Symptom:** `duplicate key value violates unique constraint
"UQ_EntityField_EntityID_Sequence"` (4 occurrences per run).

**Source:** AI-driven entity-field-from-schema sync. The advanced-generation
phase asks the LLM to suggest new fields and inserts them into `EntityField`
without first checking what `Sequence` values are already taken.

**Why SS hides this:** this one isn't actually SS-specific. The bug exists on
both platforms, but only fires when AI suggestions duplicate an existing
sequence. In practice it's rare on SS because most SS installs don't churn
through advanced generation often enough to hit it.

**Not attempted:** no tactical fix written. Needs proper "find next available
sequence" logic at insert time.

### Cascade — LLM rate limit and retry storms

**Symptom:** `429 rate_limit_exceeded` (~3,800 per run).

**Source:** Groq throttles calls; codegen retries with backoff. **Recoverable —
not a bug, just slows things down.** Listed for completeness because it
dominates the error log when grepping.

## The shared structural pattern

Every bug except Bug 5 has the same root cause: **CodeGen advanced-generation
hand-writes SQL strings**, and those strings were authored assuming SQL
Server's lenient dialect. The bugs are:

| Hand-written SQL feature | SS treatment | PG treatment |
|---|---|---|
| `UPDATE ...\nUPDATE ...` | Fine | Syntax error (no `;` separator) |
| `Icon`, `Value` (unquoted) | Case-insensitive resolve | Folded to lowercase, not found |
| `[Schema].[Table]` | Native | Syntax error |
| `GETUTCDATE()` | Native | Function does not exist |

`SQLDialect` already owns abstractions for every one of these:
- `QuoteIdentifier(name)` — `[name]` vs `"name"`
- `QuoteSchema(schema, object)` — `[schema].[object]` vs `schema."object"`
- `CurrentTimestampUTC()` — `GETUTCDATE()` vs `(NOW() AT TIME ZONE 'UTC')`
- `BatchSeparator()` / `BooleanLiteral(b)` / etc.

But callers don't use them consistently. Some places do (see the 79 existing
`this.qi()` calls in `manage-metadata.ts`), some places don't (the 6
callsites Bug 3 covers, plus all of `entity_subclasses_codegen.ts`'s
validator emission).

## Recommended structural fix

**Add SQL-builder methods to `SQLDialect`** so callers stop hand-writing SQL:

```typescript
// New abstract methods on SQLDialect:
abstract BuildInsert(schema: string, table: string, columns: Record<string, string>): string;
abstract BuildUpdate(schema: string, table: string, sets: Record<string, string>, where: string): string;
abstract BuildBatch(statements: string[]): string;  // joins with proper separators
```

`columns` / `sets` is a map of column name → pre-formed SQL value expression
(`'literal'`, `${dialect.CurrentTimestampUTC()}`, etc.). The builder owns
identifier quoting, statement termination, and batch separator emission.

Then refactor every hand-written CRUD-against-MJ-metadata-table SQL to use
the builders. Callers can no longer forget `qi()`, can no longer forget `;`,
can no longer accidentally embed `GETUTCDATE()`. The bug class becomes
structurally impossible.

**Scope:** all `INSERT INTO ${this.qs(mj_core_schema(), 'X')}` and
`UPDATE ${this.qs(mj_core_schema(), 'X')}` in `CodeGenLib` (~10–15
callsites). Other CodeGenLib SQL (DDL, user-schema CRUD) is a separate
concern and shouldn't get caught up in this refactor.

**Out of scope:** Bug 5 (sequence collision) — needs its own fix at the
insert-time logic level.

## Why this stayed latent until now

`mj codegen` against PG is a **rarely-exercised path**. The `pg-migrate`
skill workflow goes through `mj migrate` (Skyway-driven application of
pre-generated migration files), never `mj codegen`. The team's day-to-day
PG validation has been "do the migrations apply cleanly", not "does
codegen produce correct output for new entity changes."

Our JSON-arg work is the first time we've forced a full `mj codegen` run
against PG with `forceRegeneration: true`, exercising every entity through
the entire pipeline including advanced generation. That's why these bugs
all surfaced at once — they've all been there, just dormant.

## Workaround for the JSON-arg branch

The CRUD sproc generation phase (`manageSQLScriptsAndExecution`) runs
**before** advanced generation and is unaffected by these bugs. The
migration files we want come out of that earlier phase cleanly.

Disabling advanced generation skips the entire buggy phase:

```js
// mj.config.cjs
advancedGeneration: {
  enableAdvancedGeneration: false,
  // ...
}
```

This gets us a clean codegen run, lets the pipeline reach `finishSQLLogging`,
runs the `${flyway:defaultSchema}` substitution, and produces shipping-ready
migration files.

The bugs above remain unfixed in the codebase but become moot for the
JSON-arg work. They should be tracked and fixed in a separate PR with the
SQLDialect builder approach.

## Status of attempted fixes

All tactical fixes are stashed under:

```
git stash list
# stash@{0}: advanced-generation PG bug investigation + tactical fixes ...
```

The stash contains:
- Bug 1: `LogSQLBatchAndExecute` helper + 5 callsite refactors.
- Bug 2: `Math.trunc()` in Groq adapter.
- Bug 3: `this.qi()` wrapping at 6 callsites in `manage-metadata.ts`.
- An unrelated lookup-key fix in `manage-metadata.ts` and `sql.ts` (uses
  `'PostgreSQLCodeGenProvider'` literal where it should use the platform
  string `'postgresql'` — fall-through to abstract base class).
- `forceRegeneration` and `verboseOutput` config additions in `mj.config.cjs`.
- The regenerated `V202605032116__...pg.sql` (with literal `__mj`, not yet
  Flyway-substituted because finishSQLLogging didn't run on that attempt).
- All 480+ generated Angular forms / GraphQL resolvers / TS entity classes
  from the codegen run.

These fixes are **not the right answer**. The right answer is the SQLDialect
builder approach. The stash exists as a record of what we tried so the next
person doesn't repeat the work.

## Recommended next steps

1. **JSON-arg branch:** disable `advancedGeneration`, run codegen, ship clean
   migration files for `V202605032116` and `V202605051430`.
2. **Separate PR:** add `BuildInsert` / `BuildUpdate` / `BuildBatch` to
   `SQLDialect`, refactor the bug-prone callsites to use them, delete the
   tactical patches from the stash if they got partially landed.
3. **Bug 5 (separate small PR):** fix the `Sequence` collision in AI-driven
   field insert.
