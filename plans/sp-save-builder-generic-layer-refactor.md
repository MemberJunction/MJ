# Plan: Bubble SP-Call SQL Builder Up to the Generic Database Provider

## Status

Draft (rev 3) — proposed follow-up to the `IsSPParameter` consolidation
that fixed the "Procedure or function spCreateArtifactVersion has too many
arguments specified" regression. The runtime/CodeGen filter symmetry that
bug exposed is now correct, but the **broader duplication** between
`SQLServerDataProvider` and `PostgreSQLDataProvider` that allowed the
asymmetry to exist in the first place is still on the table.

**Changes in rev 3** (for reviewers comparing against rev 2):

- **Architecture pivot: dialect grammar grows on `SQLDialect`, not three
  new abstract methods on `GenericDatabaseProvider`.** MJ already has a
  mature dialect-grammar descriptor (`SQLDialect`, 725 lines, 80+ methods
  including `ProcedureCallSyntax`, `ParameterRef`, `ParameterPlaceholder`,
  `BooleanLiteral`, `ReturnInsertedClause`, etc.). The save path is
  currently the one major area that bypasses it and hand-rolls SQL inside
  the data providers. Extending `SQLDialect` to absorb the save grammar
  puts the override surface where MJ has already decided dialect-grammar
  overrides go, instead of splitting it across two parallel hierarchies
  (dialect descriptor + abstract methods on the data provider).
- Consequence: the `TRendered` generic parameter and the `CoerceResult`
  tagged-union sketched in rev 2 are dropped — they were artifacts of the
  abstract-methods-on-provider approach. Each new `SQLDialect` method
  returns its own concrete shape directly; the wrapper methods on the
  same dialect pattern-match it.
- Consequence: deprecation-shim concern collapses. Downstream extenders
  override `SQLDialect` subclasses (the established pattern), not the
  provider's save methods (which were already private/package-internal).
- Consequence: `GenerateSaveSQL` on `GenericDatabaseProvider` becomes a
  single concrete method with no abstract calls, delegating every
  dialect-specific decision through `this.Dialect.X(...)`. Provider
  subclasses (`SQLServerDataProvider`, `PostgreSQLDataProvider`) end up
  with **zero save-related code** after the refactor — they contribute
  their `SQLDialect` instance via the existing `getDialect()` and
  nothing else for this path.

**Changes carried over from rev 2** (still applies):

- **Scar tissue** section enumerating recent fixes (PG 100-arg limit,
  JSON-arg shape, savepoint wraps, `IsComputed`, bool→int) that the new
  code must explicitly preserve. The table's "new home" column now
  points at dialect methods rather than provider hooks.
- JSON-arg shape for wide PG entities (commit `5ff75b96ae`) — second
  parameter-binding mode, not a marginal variant. Lives in
  `PostgreSQLDialect.RenderSaveCallBinding` as one branch of the
  dialect-specific binding shape.
- Sequencing: ship as **one PR**, gated by a **save-SQL snapshot
  harness** that lands first. Cross-dialect SP-signature parity is
  **not** in the harness — already covered by the existing pg-migrate
  CI workflow. The harness is per-dialect before/after equivalence
  for the rewrite only.
- Acceptance criteria expanded into a breadth-explicit integration-test
  checklist + a microbenchmark gate.

## Background — how we got here

For each entity, the `spCreate` / `spUpdate` parameter list is decided in two
independent places:

| Where | What it produces |
|---|---|
| **CodeGen** (`codeGenDatabaseProvider.shouldIncludeFieldInParams`) | The SP body — `CREATE PROCEDURE` declared parameters + the columns referenced in `INSERT` / `UPDATE` |
| **Runtime** (`SQLServerDataProvider.generateSPParams`, `PostgreSQLDataProvider.getWritableFields`) | The argument list passed to `EXEC` / `SELECT FROM function()` at save time |

These two need to agree. If they don't, SQL Server raises **"Procedure or
function has too many arguments specified"** (or its PG equivalent) when a
client tries to save.

Originally the two paths used different filter rules:

- **CodeGen** filtered on `IsVirtual`, `IsSpecialDateField`, `IsPrimaryKey
  + AutoIncrement`, and `AllowUpdateAPI`.
- **SQL Server runtime** filtered on `AllowUpdateAPI` and `SkipValidation`.
  `SkipValidation` happens to include `IsVirtual` in its checks, so virtual
  fields were excluded **indirectly**. The contract was not stated locally.
- **Postgres runtime** had its own filter list (`getWritableFields`).

This worked **only as long as metadata flags stayed self-consistent**. The
moment any agent produced an `EntityField` row where `IsVirtual=1` but
`AllowUpdateAPI=1`, the SQL Server runtime included the field while the SP
body didn't declare it → too many arguments.

### The consolidation that just landed

A new predicate `EntityFieldInfo.IsSPParameter(isUpdate: boolean)` is now the
single source of truth. CodeGen, SQL Server runtime, and PostgreSQL runtime
all delegate to it. Symmetry is now enforced at the predicate level.

```ts
public IsSPParameter(isUpdate: boolean): boolean {
    if (this.IsVirtual) return false;
    if (this.IsComputed) return false;
    if (this.IsSpecialDateField) return false;
    if (this.IsPrimaryKey) return isUpdate || !this.AutoIncrement;
    return this.AllowUpdateAPI;
}
```

This fixes the immediate class of bug. **But** the larger duplication remains:
the SQL string template that calls the SP, the variable declaration / SET
pattern, the EXEC argument list assembly, the wrapper for record-change
tracking, the result-table boilerplate — all of it is hand-rolled twice (once
per dialect provider). This plan addresses **that**.

## Why dialect, not provider hooks

`SQLDialect` (`packages/SQLDialect/src/sqlDialect.ts`) is MJ's existing
single-place-for-dialect-grammar abstraction. It already covers:

- Identifier quoting (`QuoteIdentifier`, `QuoteSchema`, `QuoteColumnAlias`,
  `QuoteStringLiteral`)
- Parameter syntax (`ParameterRef` → `@Name` vs `p_name`,
  `ParameterPlaceholder` → `@p0` vs `$1`, `ParameterDefault`)
- Type-related grammar (`BooleanLiteral`, `BooleanParameterType`,
  `CastToText`, `CastToUUID`, `CastToBoundedString`, `EmptyUUIDLiteral`,
  full per-platform type-name sets, `TypeMap`)
- UUID handling (`NewUUID`, `UUIDPKDefault`)
- Null coalescing (`IsNull`, `Coalesce`, `IsNullLiteral`)
- Conditional expressions (`IIF`)
- DDL grammar (CREATE TABLE, ADD/ALTER COLUMN, COMMENT ON, GRANT,
  CreateOrReplace, CreateSchema, trigger DDL, index DDL)
- Result-return patterns (`ReturnInsertedClause` → `OUTPUT INSERTED.x` vs
  `RETURNING x`, `AutoIncrementPKExpression`, `ScopeIdentityExpression`,
  `RowCountExpression`)
- CTE and recursion (`RecursiveCTESyntax`, `AllowsOrderByInCTE`)
- Schema introspection queries
- Full-text search (`FullTextSearchPredicate`, `FullTextIndexDDL`)
- Date arithmetic (`DateAddExpression`, `CurrentTimestampUTC`)
- Procedural control (`ConditionalBlock`, `RaiseSignalSQL`)
- Migration emission (`EscapeFlywayStringInterpolation`, `BatchSeparator`)
- Crucially: **`ProcedureCallSyntax(schema, name, params)`** — already
  abstract at `sqlDialect.ts:569`, already implemented by
  `SQLServerDialect.ProcedureCallSyntax` (`sqlServerDialect.ts:370`) and
  `PostgreSQLDialect.ProcedureCallSyntax` (`postgresqlDialect.ts:446`).

The save path is the major remaining area that bypasses this descriptor:

- SQL Server hardcodes `` `EXEC [${entity.EntityInfo.SchemaName}].${spName} ${spParams.execParams}` `` inline at five sites
  (`SQLServerDataProvider.ts:646, 785, 829, 1213, 1267, 2079`). Never calls
  `ProcedureCallSyntax`.
- PostgreSQL hand-builds `` `SELECT * FROM ${this._schemaName}.${pgDialect.QuoteIdentifier(fnName)}(${paramPlaceholders})` ``
  inline at `PostgreSQLDataProvider.ts:644`. Also never calls
  `ProcedureCallSyntax`.

The natural completion is to **grow `SQLDialect` to cover the rest of the
save grammar** (parameter binding, value coercion, result-capture wrapper,
record-change wrapper, JSON-arg variant) and let `GenericDatabaseProvider`
host one concrete `BuildSaveSQL` that delegates every grammar decision to
`this.Dialect`.

This matches AN-BC's stated end state ("subclasses do small overrides,
generic layer holds flow and logic") more cleanly than three new abstract
methods on the data provider, because:

1. **One override surface, not two.** Today, contributors who want to
   extend MJ for a new dialect have a clear answer: subclass `SQLDialect`.
   Three new abstract methods on `GenericDatabaseProvider` would create a
   second extension surface alongside the existing one, with arbitrary
   partition between them (why does `RenderSPParams` live on the provider
   when `ProcedureCallSyntax` lives on the dialect?).
2. **Adding MySQL becomes mechanical.** With the dialect-driven approach:
   write `MySQLDialect extends SQLDialect`, register it via
   `dialectFactory`, done. With abstract-methods-on-provider: write
   *both* a `MySQLDialect` AND a `MySQLDataProvider` overriding the three
   hooks, and keep the two aligned across every future grammar addition.
3. **Data-provider subclasses shrink.** `SQLServerDataProvider` (2295
   lines) and `PostgreSQLDataProvider` (1459 lines) are already too
   large. The hook approach keeps them as-large or grows them. The
   dialect approach removes save code from them entirely.

## Current shape (post-`IsSPParameter`)

```
SQLDialect (abstract, 725 lines, 80+ methods)
├── QuoteIdentifier, QuoteSchema, BooleanLiteral, ParameterRef, ParameterPlaceholder
├── ProcedureCallSyntax — DEFINED but unused by the save path
├── ReturnInsertedClause, ScopeIdentityExpression, AutoIncrementPKExpression
├── TypeMap, MapDataType, type-name sets
└── ... (full DDL, CTE, full-text-search, index, trigger grammars)

GenericDatabaseProvider / DatabaseProviderBase
├── Save() — high-level orchestration (validation, hooks, encryption, record-change, transaction)
├── EncryptFieldValuesForSave() — shared
├── BuildRecordChangePayload() — shared (dialect-agnostic diff + restore lineage)
└── BuildRecordChangeSQL() — abstract (dialect renders the actual INSERT/EXEC)

SQLServerDataProvider                          PostgreSQLDataProvider
├── GenerateSaveSQL() — override               ├── GenerateSaveSQL() — override
├── GetSaveSQLWithDetails() — hand-rolled      ├── (parallel impl, hand-rolled)
├── generateSPParams() — ~250 lines            ├── getWritableFields() + parallel
│   ├── per-field iteration                    │       SQL-template glue
│   ├── inline value coercion                  │   ├── per-field iteration
│   ├── DECLARE/SET/EXEC fragments             │   ├── inline value coercion
│   └── _Clear companion handling              │   ├── $1, $2 binding (or JSON-arg)
├── generateSetStatementValue()                │   └── inline SELECT FROM function()
└── getAllEntityColumnsSQL()                   └── inline CTE for record-change wrap
```

The duplicated parts (iteration, value coercion, SQL-text assembly)
bypass `SQLDialect` entirely.

## Proposed shape

```
SQLDialect (gains 5 new save-grammar methods)
├── (existing 80+ methods unchanged)
├── CoerceSaveFieldValue(field, value, isUpdate)         — NEW: per-type value transform
├── UseJsonArgShape(entity, sprocType)                   — NEW: moves from crudSprocFieldRules.ts
├── RenderSaveCallBinding(entity, fieldValues, isUpdate) — NEW: dialect's binding emitter
├── WrapSaveCallForResult(binding, entityInfo, spName)   — NEW: dialect's result-capture wrapper
└── WrapSaveCallWithRecordChange(saveSQL, payload, ...)  — NEW: dialect's audit-log wrapper

GenericDatabaseProvider (gains one concrete method, no new abstracts)
└── GenerateSaveSQL(entity, isNew, user) — NEW concrete, overrides DatabaseProviderBase.GenerateSaveSQL
    ├── collectSaveFieldValues()       — shared loop: IsSPParameter + PK-on-create + CoerceSaveFieldValue
    ├── EncryptFieldValuesForSave()    — existing shared (between coercion and rendering — Risks §1)
    ├── this.Dialect.RenderSaveCallBinding(...)
    ├── this.Dialect.WrapSaveCallForResult(...)
    └── this.Dialect.WrapSaveCallWithRecordChange(...)  — only if entity tracks changes

SQLServerDataProvider                          PostgreSQLDataProvider
├── (no save-related code)                     ├── (no save-related code)
└── getDialect() returns SQLServerDialect       └── getDialect() returns PostgreSQLDialect
                                                  (already true today)
```

### Dialect surface extensions (signatures)

```ts
// On SQLDialect (abstract base) — five new methods

// Per-field value transform applied before encryption + rendering.
// "skip" covers cases like "the field value is a function literal
// (newid()/gen_random_uuid()) — let the DB default fire instead of
// inserting the literal string." Both dialects need this distinction;
// living on SQLDialect keeps the rule in one place per dialect rather
// than scattered in coerceFieldValue + resolveFieldValue + inline blocks
// in generateSPParams.
abstract CoerceSaveFieldValue(
    field: EntityFieldInfo,
    value: unknown,
    isUpdate: boolean,
): { kind: 'use'; value: unknown } | { kind: 'skip' };

// Predicate moved from crudSprocFieldRules.ts. Each dialect owns its
// threshold (SQL Server: Infinity = never; PostgreSQL: 90 today). Used
// by this dialect's RenderSaveCallBinding *and* by CodeGen's matching
// emitter — same predicate, two consumers.
abstract UseJsonArgShape(entity: EntityInfo, sprocType: CRUDSprocType): boolean;

// Returns a dialect-specific binding shape. The provider treats the
// result as opaque and hands it to WrapSaveCallForResult / WrapSaveCall
// WithRecordChange below — those methods (also on the same dialect)
// know how to pattern-match it.
//
// SQLServerDialect emits:
//   { kind: 'mssql-declare-exec'; preambleSQL: string; callArgsSQL: string;
//     simpleParamsSQL: string }
// PostgreSQLDialect emits one of:
//   { kind: 'pg-positional'; callArgsSQL: string; values: unknown[] }
//   { kind: 'pg-json-arg';   callArgsSQL: string; values: [string] }
abstract RenderSaveCallBinding(
    entity: BaseEntity,
    fieldValues: Map<EntityFieldInfo, unknown>,
    isUpdate: boolean,
): SaveCallBinding;

// Wraps the bare SP call with the dialect's result-capture pattern.
//   SS: DECLARE @ResultTable + INSERT INTO @ResultTable EXEC + SELECT @ResultTable
//   PG: SELECT * FROM fn(...) returns the row directly
abstract WrapSaveCallForResult(
    binding: SaveCallBinding,
    entityInfo: EntityInfo,
    spName: string,
): SaveSQLFragment;

// Wraps with the dialect's record-change emission.
//   SS: inlines spCreateRecordChange_Internal EXEC after the result table
//   PG: WITH save_result AS (...), record_change AS (INSERT INTO ... RETURNING)
abstract WrapSaveCallWithRecordChange(
    saveSQL: SaveSQLFragment,
    payload: RecordChangePayload,
    entityInfo: EntityInfo,
): SaveSQLFragment;
```

Types:

```ts
type SaveCallBinding =
    | { kind: 'mssql-declare-exec'; preambleSQL: string; callArgsSQL: string; simpleParamsSQL: string }
    | { kind: 'pg-positional';      callArgsSQL: string; values: unknown[] }
    | { kind: 'pg-json-arg';        callArgsSQL: string; values: [string] };

type SaveSQLFragment = { sql: string; parameters?: unknown[] };
```

The `SaveCallBinding` discriminated union lives in `sql-dialect`. Each
variant is "owned" by its dialect, but the union exists so the wrapper
methods can pattern-match without `any`. Adding MySQL adds a new variant
to this union.

### The concrete provider method

```ts
// On GenericDatabaseProvider (concrete — overrides DatabaseProviderBase.GenerateSaveSQL,
// no abstract calls of its own)

protected override async GenerateSaveSQL(
    entity: BaseEntity,
    isNew: boolean,
    user: UserInfo,
): Promise<SaveSQLResult> {
    const isUpdate = !isNew;
    const spName = this.GetCreateUpdateSPName(entity, isNew);

    // 1. Iterate fields, apply IsSPParameter, coerce values
    const fieldValueMap = new Map<EntityFieldInfo, unknown>();
    for (const f of entity.EntityInfo.Fields) {
        if (!f.IsSPParameter(isUpdate)) continue;

        // PK-on-create: in the SP signature, but only pass when caller
        // provided an explicit value — otherwise let the DB default fire.
        if (!isUpdate && f.IsPrimaryKey && !f.AutoIncrement) {
            const v = entity.Get(f.Name);
            if (v === null || v === undefined) continue;
        }

        const raw = entity.Get(f.Name);
        const coerced = this.Dialect.CoerceSaveFieldValue(f, raw, isUpdate);
        if (coerced.kind === 'skip') continue;
        fieldValueMap.set(f, coerced.value);
    }

    // 2. Encrypt — runs AFTER coercion and BEFORE rendering (Risks §1)
    await this.EncryptFieldValuesForSave(entity, fieldValueMap, user);

    // 3. Render dialect-specific parameter binding
    const binding = this.Dialect.RenderSaveCallBinding(entity, fieldValueMap, isUpdate);

    // 4. Wrap with the dialect's result-capture pattern
    let saveSQL = this.Dialect.WrapSaveCallForResult(binding, entity.EntityInfo, spName);

    // 5. Optionally wrap with record-change
    if (this.ShouldTrackRecordChanges(entity.EntityInfo) && isUpdate) {
        const newData = entity.GetAll(false);
        const oldData = entity.GetAll(true);
        const payload = this.BuildRecordChangePayload(
            newData, oldData, /* recordID resolved by wrapper */ '',
            entity.EntityInfo, isNew ? 'Create' : 'Update', user,
            entity.RestoreContext, "'",
        );
        if (payload) {
            saveSQL = this.Dialect.WrapSaveCallWithRecordChange(saveSQL, payload, entity.EntityInfo);
        }
    }

    return {
        fullSQL: saveSQL.sql,
        simpleSQL: binding.callArgsSQL,  // for TransactionGroup / logging
        parameters: saveSQL.parameters,
    };
}
```

Provider subclasses (`SQLServerDataProvider`, `PostgreSQLDataProvider`)
delete their `GenerateSaveSQL` overrides entirely — this concrete one
wins by polymorphism.

## What collapses, what stays

### Collapses into `GenericDatabaseProvider`
- The field iteration loop
- The `IsSPParameter` filter application
- The PK-on-create "pass only if value provided" rule
- The encryption integration point (already shared, just hoisted to
  the new method)
- The complete top-level `GenerateSaveSQL` orchestration
- The record-change wrap decision (which payload, when to wrap)

### Moves onto `SQLDialect`
- Value coercion per type (was scattered: SS's `generateSetStatementValue`
  + inline blocks in `generateSPParams`; PG's `resolveFieldValue`).
- Parameter binding emission (SS's DECLARE/SET/EXEC fragments + simpleParams
  for back-compat; PG's positional `$N` and JSON-arg variants).
- Result-capture wrapper (SS's `DECLARE @ResultTable + INSERT INTO
  @ResultTable EXEC`; PG's bare `SELECT * FROM fn(...)`).
- Record-change wrap (SS's inline EXEC after the result table; PG's CTE
  with RETURNING).
- JSON-arg shape predicate (currently a pure function in
  `crudSprocFieldRules.ts` — moves to the dialect as instance method so
  PG owns its threshold; SS returns false unconditionally).

### Stays on the provider
- Connection pool, query execution, transaction management.
- `BuildRecordChangePayload` (already shared on `DatabaseProviderBase`).
- `EncryptFieldValuesForSave` (already shared on `GenericDatabaseProvider`).
- Post-save row processing.
- TransactionGroup integration (the existing entry point `GetSaveSQL`
  keeps its current signature — it just routes through the new
  `GenerateSaveSQL` under the hood).

## Scar tissue — recent fixes the new code must preserve

The current save pipeline has been patched repeatedly over the past two
months. Every one of these patches lives inside the code paths this
refactor is rewriting, so each one needs an explicit home in the new
shape. Reviewers should sanity-check that the corresponding test exists.

| Commit | What it fixed | New home |
|---|---|---|
| `c136d41f03` | Narrowed `_Clear` companion rule to stay under PG's 100-argument hard limit | `PostgreSQLDialect.RenderSaveCallBinding` — `_Clear` emission is part of binding |
| `5ff75b96ae` | **JSON-arg sproc shape for wide entities** (AIAgent, AIPromptRun): one `_args jsonb` parameter instead of N positional. Second binding mode on PG | `PostgreSQLDialect.UseJsonArgShape` + `RenderSaveCallBinding` branches on it to emit `{ kind: 'pg-json-arg', ... }`. Coercion rules for binary fields (base64 inside JSON) live in `CoerceSaveFieldValue` or in a JSON-arg-specific helper called by `RenderSaveCallBinding` |
| `7b1d9b5673` | PG savepoint-wrap around TemplateContent param extraction so PG matches SS semantics under failure | `PostgreSQLDialect.WrapSaveCallForResult` — savepoint wrapper around the SELECT-FROM-function call |
| `da2e347d72` | DROP-overload guard + named-arg `PERFORM` in `CREATE OR REPLACE FUNCTION` output | CodeGen-side, not this refactor. But `PostgreSQLDialect.RenderSaveCallBinding` must continue to emit named args (`p_id => $1`) so the overload guard works |
| `387d46728b` + `003317fa08` | `IsComputed` flag added to `EntityField`; included in `IsSPParameter`. Both dialects must skip computed columns | `GenericDatabaseProvider.GenerateSaveSQL`'s iteration uses `IsSPParameter`, which already excludes `IsComputed`. Verify no parallel filter remains in either dialect |
| `aabaff858f` | Disable self-join view for virtual `NameField` on SQL Server | Adjacent to `CoerceSaveFieldValue` — virtual NameField filtered before value lookup via `IsSPParameter` (already covers `IsVirtual`) |
| `adc8da9ea1` | Align codegen↔runtime contract + bool/INTEGER SQL coercions on PG | `PostgreSQLDialect.CoerceSaveFieldValue` — bool→int conversion lives here |

If any of these are not reproduced in the new code, you will reintroduce
the exact regression the commit fixed. Treat the table as a literal test
checklist.

## Risks & migration concerns

1. **Encryption ordering.** `EncryptFieldValuesForSave` mutates the
   `fieldValueMap` after population but before SQL rendering. The new
   flow preserves this — same call site, just moved up into the concrete
   `GenerateSaveSQL`. Coercion runs *before* encryption; rendering runs
   *after* encryption. A unit test that asserts the mutation order is
   cheap insurance.

2. **Variable name uniqueness in batched saves.** SQL Server's
   `SQLServerTransactionGroup` batches multiple saves into one SQL
   string, so each save's variables must be uniquely named to avoid
   collisions — that's the `_<uuid-suffix>` we generate today.
   `SQLServerDialect.RenderSaveCallBinding` owns the naming strategy.
   PG uses positional parameters and sidesteps this entirely.

3. **`simpleParams` back-compat.** Some external callers (manifest-driven
   tooling, the GraphQL test harness) consume the old-style
   `EXEC sp @x='value'` one-line form. `SQLServerDialect.RenderSaveCallBinding`
   returns it as `simpleParamsSQL` on the `mssql-declare-exec` binding
   variant. Existing consumers keep working unchanged.

4. **Record-change inlining vs separate-statement.** SQL Server inlines
   the record-change `EXEC` into the same SQL batch as the entity save
   (one round trip). PG wraps in a CTE with RETURNING. Both styles flow
   through `WrapSaveCallWithRecordChange` — same input, dialect-specific
   output. `BuildRecordChangeSQL` (the standalone non-save path) stays
   abstract and is unchanged by this refactor.

5. **Snapshot tests.** Both `SQLServerDataProvider` and
   `PostgreSQLDataProvider` have unit tests asserting against generated
   SQL strings. Behavior is preserved but the exact line breaks /
   whitespace may shift. Expect to re-bless ~10-20 snapshots. Each
   snapshot diff should be a no-op semantically; that's part of the PR
   review.

6. **Downstream subclass extension surface.** Previously the concern was
   that anyone subclassing `SQLServerDataProvider` to override
   `generateSPParams` or `GetSaveSQLWithDetails` would break. Under the
   dialect approach this concern shrinks: those provider methods become
   private to `GenericDatabaseProvider`, but the override surface MJ
   *publicly* documents — `SQLDialect` subclasses — is the natural place
   for downstream customization. If a downstream consumer was overriding
   the private provider methods, that was already off-contract; we can
   add a one-release deprecation note rather than a shim.

7. **TransactionGroup interaction.** `SQLServerTransactionGroup` calls
   `GetSaveSQL` to regenerate per-item SQL when variables get rebound
   from earlier items in the same batch. `GetSaveSQL` becomes a thin
   wrapper that calls into the new concrete `GenerateSaveSQL`. Same
   inputs, same `{ fullSQL, simpleSQL, parameters }` outputs.

8. **PG JSON-arg shape for wide entities.** PG has a hard 100-argument
   limit on functions, so wide entities (AIAgent, AIPromptRun, anything
   with ≥90 fields after filtering) use a single `_args jsonb` parameter
   instead of positional bindings (commit `5ff75b96ae`). This is NOT a
   minor variant — different value-serialization rules (JSON-encoded,
   not type-cast), different SP signature, different binary-field
   handling (base64 inside JSON). Under the dialect approach it's a
   second variant of the `SaveCallBinding` discriminated union:
   ```ts
   type SaveCallBinding =
       | { kind: 'pg-positional'; callArgsSQL: string; values: unknown[] }
       | { kind: 'pg-json-arg';   callArgsSQL: string; values: [string] }
       | { kind: 'mssql-declare-exec'; ... };
   ```
   `PostgreSQLDialect.RenderSaveCallBinding` picks based on
   `UseJsonArgShape(entity, sprocType)`. `WrapSaveCallForResult` and
   `WrapSaveCallWithRecordChange` pattern-match the variant.
   **Do not start the refactor without confirming the threshold and
   coercion rules with whoever owns the JSON-arg work** — getting these
   wrong silently breaks every wide entity on PG.

9. **Dialect-shape leakage.** `SaveCallBinding` is a discriminated union
   declared in `sql-dialect`. Each variant is "owned" by one dialect,
   but the type lives in the shared package so wrapper methods can
   pattern-match without `any`. This is a deliberate one-way coupling:
   `sql-dialect` knows the set of variants (closed union); individual
   dialect classes only produce/consume their own variant. Adding MySQL
   means adding `mysql-positional` (or whatever) to this union — touches
   the shared file once, no provider-side changes.

## Sequencing — ship in one PR, gated by a parity harness

The blast radius of this refactor is "every save in MJ" across both
dialects, regardless of whether we ship in one PR or five. Phasing
doesn't reduce the risk; it just smears it across multiple rebases
against `next`, multiple rounds of snapshot re-blessing, and multiple
context-loads for reviewers.

**The thing that actually de-risks this is a SQL parity harness, not
phasing.** Build the harness first; ship the refactor as one PR; let
the harness be the safety net.

### What we get for free from pg-migrate (don't rebuild this)

The existing pg-migrate toolchain already covers a slice of the parity
story at the migration-file layer:

- `generateParityReport(tsqlDir, pgDir)` from
  `@memberjunction/sql-converter` — **filename-level** coverage: every
  T-SQL migration in `migrations/v5/` has a `.pg.sql` counterpart in
  `migrations-pg/v5/`. Emits gaps + coverage %.
- `.github/workflows/pg-migrations.yml` — applies both dialects'
  migrations to fresh DBs, runs the two-pass
  `migrate → codegen → migrate` cycle, verifies schema counts.
  End-to-end SP-signature agreement across dialects.
- `mj migrate convert` — rule-based T-SQL → PG converter for SP bodies.

**Cross-dialect SP-signature parity is already covered by this CI.**
Don't duplicate it.

**What pg-migrate does NOT cover for this refactor:** it compares SP
*definitions* in migration files. The bug class we just patched — and
the code this refactor is rewriting — lives one layer up, at the
**runtime caller**: what `generateSPParams` / `getWritableFields` emit
at save time. pg-migrate has no visibility into runtime-emitted SQL.

So the parity check we still need is narrower: **per-dialect
before/after equivalence for the rewrite**, not a fresh cross-dialect
comparison.

### Step 0 — Save-SQL snapshot harness (per-dialect before/after)

A test helper that, for every entity in the fixture corpus and for each
`{create, update} × {SQL Server, PG}`:

1. Constructs a representative field-value payload (covering nulls,
   default-eligible fields, encrypted fields, function-literal PKs,
   wide entities that trigger PG's JSON-arg path).
2. Calls the **current** `GenerateSaveSQL` and captures the exact
   emitted SQL string (plus the `simpleSQL` and `parameters`).
3. Normalizes the captured SQL — strips per-save uuid variable
   suffixes, whitespace, line breaks — and writes it as a golden file.
4. On subsequent runs, regenerates and diffs against the golden.

Lands on `next` first. No code-under-test changes. The harness is the
checkpoint; the goldens become the contract for the rewrite.

Cross-dialect SP-signature agreement remains the existing pg-migrate
CI's job — this harness only proves "the SAME dialect emits the SAME
runtime SQL before and after the refactor."

### Step 1 (the actual refactor — one PR)

Implements all of the architecture sections above at once:

- Adds 5 new abstract methods to `SQLDialect`:
  `CoerceSaveFieldValue`, `UseJsonArgShape`, `RenderSaveCallBinding`,
  `WrapSaveCallForResult`, `WrapSaveCallWithRecordChange`.
- Implements them in `SQLServerDialect` (DECLARE/SET/EXEC + result-table
  pattern + inline record-change EXEC).
- Implements them in `PostgreSQLDialect` (positional **and** JSON-arg
  binding variants + bare SELECT FROM fn() result + CTE record-change
  wrap).
- Declares the `SaveCallBinding` discriminated union in `sql-dialect`.
- Adds the concrete `GenerateSaveSQL` to `GenericDatabaseProvider`.
- Deletes `generateSPParams`, `generateSetStatementValue`,
  `getAllEntityColumnsSQL`, `GetSaveSQLWithDetails`, and the
  `GenerateSaveSQL` override from `SQLServerDataProvider`.
- Deletes `getWritableFields`, `buildCRUDParams`, `buildJsonArgCRUDParams`,
  `resolveFieldValue`, and the `GenerateSaveSQL` override from
  `PostgreSQLDataProvider`.
- Migrates `crudSprocFieldRules.ts`'s `useJsonArgShape` to be the
  dispatching impl of `SQLDialect.UseJsonArgShape` (the pure function
  stays for CodeGen's separate consumption path).
- Re-runs the parity harness — every diff is either zero or explicitly
  justified in the PR description.

### Step 2 (follow-up, optional)

Drop the one-release deprecation note for any downstream consumer of
the deleted private provider methods. Filed as a separate issue.

## Out of scope

- **Cross-dialect feature parity.** This refactor doesn't try to make
  SQL Server and PG behave identically — only to share the orchestration
  through a single dialect descriptor.
- **`spDelete` consolidation.** Same pattern likely applies and the
  dialect approach extends naturally (add `RenderDeleteCallBinding`,
  `WrapDeleteCallForResult`), but it's its own refactor.
- **Encryption refactor.** `EncryptFieldValuesForSave` is already shared
  and works; left as-is.
- **TransactionGroup overhaul.** PG and SQL Server have separate
  transaction group classes today; that's a parallel concern, not
  bundled here.
- **CodeGen-side dialect-driven emission.** CodeGen has its own dialect
  classes (`SQLServerCodeGenProvider`, `PostgreSQLCodeGenProvider`) that
  also emit dialect-specific SQL. Unifying CodeGen through `SQLDialect`
  is the next obvious extension, but separate from this PR.

## Acceptance criteria

### Behavior-preservation (the decisive signal)

- **Parity harness** (Step 0) shows **zero unjustified diffs** across
  the full fixture corpus on both dialects, for both create and update.
  Any diff is called out in the PR description with a one-line rationale
  ("whitespace normalization", "deterministic ordering of SET statements
  after Map→array conversion", etc.). Reviewer sign-off is on the diff
  list, not on the code in isolation.

### Round-trip integration tests (the "SQL still actually works" signal)

Run against a real SQL Server (docker workbench) AND a real PG instance.
The parity harness only proves the string is the same; these prove the
string still does the right thing.

- [ ] **Regression: virtual field with mis-set `AllowUpdateAPI=1`**
  saves cleanly. (The original bug class.)
- [ ] **Value-coercion edges**: `datetimeoffset` with non-null value;
  `uniqueidentifier` set to literal `"newid()"`; bool→INTEGER on PG;
  bytea/binary field through both positional and JSON-arg paths.
- [ ] **Encrypted field**: save with a field marked for encryption,
  verify the stored value is the encrypted form (encryption must run
  AFTER coercion and BEFORE rendering — Risks §1).
- [ ] **`SQLServerTransactionGroup` batch save**: 5+ saves in one batch,
  verify no `@variable` name collisions and all rows land.
- [ ] **Wide PG entity (AIAgent or AIPromptRun)**: must hit the JSON-arg
  path, not positional. Verify the persisted row matches the input
  field-by-field (Risks §8).
- [ ] **PG `_Clear` companion**: entity that triggers `_Clear` columns
  on PG, verify the total argument count stays under 100 (commit
  `c136d41f03`).
- [ ] **PK-on-create with value provided** vs **PK-on-create with
  function literal `"newid()"`**: both code paths in the iteration loop,
  verify the first uses the user-supplied UUID and the second lets the
  DB default fire.
- [ ] **Record-change row**: save with record-change tracking enabled on
  both dialects (inlined on SQL Server, CTE on PG).
- [ ] **`IsComputed` field**: entity with a computed column saves
  successfully and the computed column is read back correctly.
- [ ] **The original repro**: a fresh agent run that produces an
  artifact payload completes with the artifact + version + junction all
  persisted.

### Code-quality bars

- All existing unit tests pass.
- New unit tests for each of the 5 new `SQLDialect` methods, per
  dialect (10 test groups), exercising the relevant paths in isolation
  against fixture data. The tests live alongside the existing
  `sqlDialect`-package tests, not inside the data-provider packages —
  this is a `sql-dialect` extension, not a provider-package change.
- No new `any` types introduced. TS `strict` remains clean.
- `SQLServerDataProvider` line count drops by ~300 lines.
  `PostgreSQLDataProvider` line count drops by ~150 lines. Net
  generic-layer / dialect line count rises by ~200 lines (one concrete
  method + 10 dialect-method implementations).
- Microbenchmark: save throughput on a 50-field test entity (1000
  rows, both dialects) is within ±5% of the pre-refactor baseline.
  Map iteration allocates differently than the parallel-array
  approach; this check catches an accidental N² or hot-path
  allocation regression.

### Out of scope for this PR (filed as separate issues)

- `spDelete` consolidation (apply the same dialect-method pattern).
- Cross-dialect feature parity (e.g. unifying `OUTPUT INTO @ResultTable`
  with `RETURNING` semantics).
- TransactionGroup overhaul.
- CodeGen-side dialect-driven emission.
