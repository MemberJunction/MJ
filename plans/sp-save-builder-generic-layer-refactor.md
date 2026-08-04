# Plan: Bubble SP-Call SQL Builder Up to the Generic Database Provider

## Status

Draft (rev 4) — supersedes rev 3 based on reviewer feedback that
`SQLDialect` is intended to stay simple. Rev 3's architecture pivot
(absorbing save-call composition into `SQLDialect`) was overreach. Rev 4
returns to the rev 2 shape — abstract hooks on `GenericDatabaseProvider`,
implemented by provider subclasses — with refinements informed by the
rev 3 prototype that briefly landed locally (commit `4c5c56b`,
reset before push).

The original goal stands: kill the duplication between
`SQLServerDataProvider` and `PostgreSQLDataProvider` save builders that
allowed the `spCreateArtifactVersion` "too many arguments" regression
to exist in the first place. The corrected design achieves that goal
without bloating `SQLDialect`.

## Changes in rev 4 (vs rev 3)

- **Save-call composition moves to `GenericDatabaseProvider` abstract
  hooks, not `SQLDialect` methods.** Template-method pattern: the
  generic layer holds the orchestration (iteration, encryption, payload
  diff); provider subclasses implement the dialect-specific composition
  (`RenderSaveCallBinding`, `WrapSaveCallForResult`,
  `WrapSaveCallWithRecordChange`).
- **`SQLDialect` gains nothing in this refactor.** Strictest reading of
  the reviewer's principle. Coercion rules (`datetimeoffset → ISO`,
  `gen_random_uuid() → fresh UUID`) are deeply provider-specific
  behavior; they live on the provider subclass alongside binding and
  wrap. `useJsonArgShape` is already centralized in
  `crudSprocFieldRules.useJsonArgShape` (one pure function, called by
  both runtime and CodeGen) — no duplication to fix there.
- **No structural shadow types in `sql-dialect`.** Rev 3 introduced
  `SaveFieldDescriptor`, `SaveEntityContext`, `SaveRecordChangePayload`
  etc. to work around the fact that sql-dialect can't import
  `@memberjunction/core`. Those shadows were the strongest tell that
  the logic was on the wrong side. With composition moved to the
  provider layer, the methods can import `EntityFieldInfo` directly —
  shadows go away.
- **The two-issue distinction is preserved:** save-call composition is
  runtime-path provider-specific behavior (belongs in provider
  subclasses); AST-level T-SQL → PG conversion for migrations is
  SQLGlot's responsibility (belongs in `@memberjunction/sqlglot-ts`).
  `SQLDialect` straddles neither — it remains the "simple grammar
  primitives" descriptor it was designed to be.

## Background — how we got here

For each entity, the `spCreate` / `spUpdate` parameter list is decided
in two independent places:

| Where | What it produces |
|---|---|
| **CodeGen** (`codeGenDatabaseProvider.shouldIncludeFieldInParams`) | The SP body — `CREATE PROCEDURE` declared parameters + the columns referenced in `INSERT` / `UPDATE` |
| **Runtime** (`SQLServerDataProvider.generateSPParams`, `PostgreSQLDataProvider.getWritableFields`) | The argument list passed to `EXEC` / `SELECT FROM function()` at save time |

These two need to agree. If they don't, SQL Server raises **"Procedure or
function has too many arguments specified"** (or its PG equivalent).

A new predicate `EntityFieldInfo.IsSPParameter(isUpdate: boolean)` is now
the single source of truth. CodeGen, SQL Server runtime, and PostgreSQL
runtime all delegate to it.

```ts
public IsSPParameter(isUpdate: boolean): boolean {
    if (this.IsVirtual) return false;
    if (this.IsComputed) return false;
    if (this.IsSpecialDateField) return false;
    if (this.IsPrimaryKey) return isUpdate || !this.AutoIncrement;
    return this.AllowUpdateAPI;
}
```

This fixes the immediate class of bug. **But** the larger duplication
remains: the SQL string template that calls the SP, the variable
declaration / SET pattern, the EXEC argument list assembly, the wrapper
for record-change tracking, the result-table boilerplate — all of it is
hand-rolled twice. This plan addresses that.

## Why provider hooks, not SQLDialect overrides

`SQLDialect` is MJ's simple-grammar-primitives descriptor — identifier
quoting, parameter syntax, type maps, conditional expressions,
`BooleanLiteral`, `IIF`. Its 80+ methods are intentionally small,
returning single SQL fragments. The save path has different shape:

- **Multi-statement SQL templates.** SS: `DECLARE @ResultTable + INSERT
  INTO @ResultTable EXEC + SELECT * FROM @ResultTable + inline
  spCreateRecordChange_Internal EXEC`. PG: `WITH save_result AS (...),
  record_change AS (INSERT ... RETURNING) SELECT * FROM save_result`.
  These are full save-flow templates, not grammar primitives.
- **Provider-state coupling.** The composition needs `entity.Fields`,
  `entity.PrimaryKey.KeyValuePairs`, the configured MJ core schema name,
  the record-changes entity metadata. Putting it on `SQLDialect` forces
  the dialect to either import core types (creates a dep cycle) or
  declare structural shadows (the rev 3 smell).
- **Different mental model for extenders.** `SQLDialect` is "how does
  this dialect quote / format / cast / parameterize a primitive?"
  Downstream contributors expect small methods returning short strings.
  Save composition is "given this entity and these field values, build
  the multi-statement transaction." Different concern, different shape.

What stays on `SQLDialect`: the two new methods are predicate-shaped
and primitive-sized, matching the existing surface:

- `UseJsonArgShape(entityFieldCount, sprocType) → boolean` — same shape
  as `BooleanLiteral`. Both CodeGen and runtime call it so they agree
  on shape selection.
- `CoerceSaveFieldValue(field, value, isUpdate) → { kind: 'use', value }
  | { kind: 'skip' }` — pure per-field transform. Same shape as
  `IIF` or `CastToText` — small function, simple return.

For AST-level T-SQL → PG conversion (migration files): that's SQLGlot's
job, not SQLDialect's. The dialect roadmap and the migration-conversion
toolchain are separate concerns.

## Proposed shape

```
SQLDialect — UNCHANGED (no new methods)

GenericDatabaseProvider (gains 4 abstracts + 1 concrete orchestrator)
├── GenerateSaveSQL(entity, isNew, user) — NEW concrete orchestrator
│   ├── 1. Iterate fields, apply IsSPParameter, this.CoerceSaveFieldValue
│   ├── 2. EncryptFieldValuesForSave (existing shared)
│   ├── 3. this.RenderSaveCallBinding(...)         — abstract
│   ├── 4. this.WrapSaveCallForResult(...)         — abstract
│   └── 5. this.WrapSaveCallWithRecordChange(...)  — abstract, only if tracked
├── CoerceSaveFieldValue       — abstract
├── RenderSaveCallBinding      — abstract
├── WrapSaveCallForResult      — abstract
└── WrapSaveCallWithRecordChange — abstract

SQLServerDataProvider                       PostgreSQLDataProvider
├── CoerceSaveFieldValue (concrete)         ├── CoerceSaveFieldValue (concrete)
│   datetimeoffset → ISO; newid() skip      │   gen_random_uuid() → UUID; NOW() → null
├── RenderSaveCallBinding (concrete)        ├── RenderSaveCallBinding (concrete)
│   DECLARE/SET/EXEC binding                │   positional OR pg-json-arg binding
├── WrapSaveCallForResult (concrete)        ├── WrapSaveCallForResult (concrete)
│   DECLARE @ResultTable + INSERT EXEC      │   bare SELECT * FROM fn(...)
└── WrapSaveCallWithRecordChange (concrete) └── WrapSaveCallWithRecordChange (concrete)
    inline spCreateRecordChange EXEC            WITH save_result AS … CTE chain
```

### Hook signatures

```ts
// On GenericDatabaseProvider

/**
 * Renders the dialect-specific parameter binding for a save call.
 * The result is treated as opaque by GenerateSaveSQL and is handed
 * back to the same provider's WrapSaveCallForResult /
 * WrapSaveCallWithRecordChange — each provider knows the binding shape
 * it just produced.
 */
protected abstract RenderSaveCallBinding(
    entity: BaseEntity,
    fieldValues: Map<EntityFieldInfo, unknown>,
    isUpdate: boolean,
    spName: string,
): SaveCallBinding;

/**
 * Wraps the bare SP-call binding with the dialect's result-capture
 * pattern. SQL Server emits `DECLARE @ResultTable + INSERT INTO
 * @ResultTable EXEC`; PostgreSQL emits the bare `SELECT * FROM fn(...)`.
 */
protected abstract WrapSaveCallForResult(
    binding: SaveCallBinding,
    entity: BaseEntity,
    spName: string,
): SaveSQLFragment;

/**
 * Wraps the result-captured save SQL with the dialect's record-change
 * emission. Only called when ShouldTrackRecordChanges(entity) and
 * BuildRecordChangePayload returned non-null.
 */
protected abstract WrapSaveCallWithRecordChange(
    saveSQL: SaveSQLFragment,
    binding: SaveCallBinding,
    payload: RecordChangePayload,
    entity: BaseEntity,
): SaveSQLFragment;
```

`SaveCallBinding` and `SaveSQLFragment` are type aliases declared on
`GenericDatabaseProvider` (or a sibling types file in
`@memberjunction/generic-database-provider`). They use real
`EntityFieldInfo` / core types — no shadows, no `unknown` casts. Each
provider defines its own binding variant; the union is closed in the
generic-database-provider package.

```ts
// In @memberjunction/generic-database-provider/saveTypes.ts
export type SaveCallBinding =
    | { kind: 'mssql-declare-exec'; preambleSQL: string; setSQL: string; callArgsSQL: string; simpleParamsSQL: string }
    | { kind: 'pg-positional';      callArgsSQL: string; values: unknown[] }
    | { kind: 'pg-json-arg';        callArgsSQL: string; values: [string] };

export interface SaveSQLFragment {
    sql: string;
    parameters?: unknown[];
}
```

Adding a new dialect adds a new variant in `saveTypes.ts` and a new
provider subclass implementing the three hooks. No `SQLDialect` changes
(beyond the two predicates if the new dialect's behavior differs).

### The concrete orchestrator

```ts
// On GenericDatabaseProvider — concrete, overrides DatabaseProviderBase
// abstract; provider subclasses do NOT override this.

protected override async GenerateSaveSQL(
    entity: BaseEntity,
    isNew: boolean,
    user: UserInfo,
): Promise<SaveSQLResult> {
    const isUpdate = !isNew;
    const spName = this.GetCreateUpdateSPName(entity, isNew);
    const dialect = this.getDialect();

    // 1. Iterate fields. Apply IsSPParameter, coerce via dialect.
    const fieldValueMap = new Map<EntityFieldInfo, unknown>();
    for (const f of entity.EntityInfo.Fields) {
        if (!f.IsSPParameter(isUpdate)) continue;

        // PK-on-UPDATE: tail-appended by the provider's binding renderer.
        if (isUpdate && f.IsPrimaryKey) continue;

        // PK-on-CREATE: omit when no explicit value, let DB default fire.
        if (!isUpdate && f.IsPrimaryKey && !f.AutoIncrement) {
            const v = entity.Get(f.Name);
            if (v === null || v === undefined) continue;
        }

        const raw = entity.Get(f.Name);
        const coerced = dialect.CoerceSaveFieldValue(f, raw, isUpdate);
        if (coerced.kind === 'skip') continue;
        fieldValueMap.set(f, coerced.value);
    }

    // 2. Encrypt — between coercion and rendering.
    await this.EncryptFieldValuesForSave(entity, fieldValueMap, user);

    // 3. Dispatch to provider-specific binding + wrap.
    const binding = this.RenderSaveCallBinding(entity, fieldValueMap, isUpdate, spName);
    let saveSQL = this.WrapSaveCallForResult(binding, entity, spName);

    // 4. Optional record-change wrap.
    let overlappingChangeData: { changesJSON: string; changesDescription: string } | undefined;
    if (this.ShouldTrackRecordChanges(entity.EntityInfo)) {
        const newData = entity.GetAll(false);
        const oldData = isUpdate ? entity.GetAll(true) : null;

        // ISA propagation hook (SS-only consumer reads this from extraData)
        if (isUpdate && oldData) {
            const diff = this.DiffObjects(oldData, newData, entity.EntityInfo, "'");
            if (diff && Object.keys(diff).length > 0) {
                overlappingChangeData = {
                    changesJSON: JSON.stringify(diff),
                    changesDescription: this.CreateUserDescriptionOfChanges(diff),
                };
            }
        }

        const payload = this.BuildRecordChangePayload(
            newData, oldData, '', entity.EntityInfo,
            isNew ? 'Create' : 'Update', user, entity.RestoreContext, "'",
        );
        if (payload) {
            saveSQL = this.WrapSaveCallWithRecordChange(saveSQL, binding, payload, entity);
        }
    }

    const result: SaveSQLResult = {
        fullSQL: saveSQL.sql,
        simpleSQL: this.deriveSimpleSQL(binding, entity, spName),
        parameters: saveSQL.parameters ?? null,
    };
    if (overlappingChangeData) result.extraData = { overlappingChangeData };
    return result;
}
```

## What collapses, what stays

### Collapses into `GenericDatabaseProvider`
- The field iteration loop (one place, calls `IsSPParameter`)
- PK-on-create "skip when no value" rule (one place)
- Encryption integration point (already shared, hoisted into the new method)
- Record-change payload + diff computation
- `overlappingChangeData` ISA propagation plumbing
- Top-level orchestration

### Moves onto provider abstract hooks
- Per-dialect parameter binding (SS DECLARE/SET/EXEC; PG positional + JSON-arg)
- Per-dialect result-capture template
- Per-dialect record-change wrap (SS inline EXEC; PG CTE)

### Stays on `SQLDialect`
- `ProcedureCallSyntax`, `ParameterRef`, `BooleanLiteral`, all existing 80+ methods
- New: `UseJsonArgShape`, `CoerceSaveFieldValue`

### Stays on provider subclasses (unrelated paths)
- Connection pool, query execution, transaction management
- Delete-SQL composition (separate refactor — see follow-up plan)
- Query / view rendering
- Post-save row processing

## Scar tissue — recent fixes the new code must preserve

| Commit | What it fixed | New home |
|---|---|---|
| `c136d41f03` | PG `_Clear` companion narrowed to stay under 100-arg limit | `PostgreSQLDataProvider.RenderSaveCallBinding` |
| `5ff75b96ae` | JSON-arg sproc shape for wide PG entities | `PostgreSQLDataProvider.RenderSaveCallBinding` branches on `SQLDialect.UseJsonArgShape` |
| `7b1d9b5673` | PG savepoint wrap around TemplateContent param extraction | `PostgreSQLDataProvider.WrapSaveCallForResult` |
| `da2e347d72` | DROP-overload guard + named-arg `PERFORM` in CodeGen output | CodeGen-side, not this refactor; PG provider must continue emitting named args |
| `387d46728b` + `003317fa08` | `IsComputed` flag — both dialects must skip computed columns | `GenericDatabaseProvider.GenerateSaveSQL` iteration uses `IsSPParameter` (already covers `IsComputed`) |
| `aabaff858f` | Disable self-join view for virtual `NameField` on SQL Server | Covered by `IsSPParameter` (already excludes `IsVirtual`) |
| `adc8da9ea1` | bool/INTEGER coercions on PG | `PostgreSQLDataProvider.CoerceSaveFieldValue` impl on SQLDialect, called from binding renderer |

## Risks & migration concerns

1. **Encryption ordering.** `EncryptFieldValuesForSave` runs *after*
   coercion and *before* rendering. Preserved — same call site, moved
   into `GenerateSaveSQL`. A unit test asserting the order is cheap
   insurance.

2. **Variable name uniqueness in batched saves.**
   `SQLServerTransactionGroup` batches multiple saves into one SQL
   string; per-save variables must be uniquely named to avoid
   collisions. `SQLServerDataProvider.RenderSaveCallBinding` owns the
   uuid-suffix strategy. PG uses positional `$N` and sidesteps this.

3. **`simpleSQL` semantics.** SS produces a self-contained single-line
   `EXEC [s].sp @x=N'v', ...`. PG produces `SELECT * FROM s."fn"(p_id
   => $1, ...)` — references positional placeholders, not
   self-contained. `SaveSQLResult.simpleSQL` JSDoc must explicitly call
   out the per-dialect semantics so downstream consumers (manifest
   tooling, GraphQL test harness) don't assume MSSQL semantics on PG.

4. **`getAllEntityColumnsSQL`** stays on `SQLServerDataProvider` because
   the delete path uses it. The save path uses a new private helper on
   the same provider (post-rev-4) — same implementation, but the delete
   path's continued reliance on the old method is intentional out-of-scope.
   A follow-up plan covers delete unification.

5. **Snapshot tests.** Behavior is preserved; whitespace / line-break
   formatting may shift. Re-bless ~10-20 snapshots, each diff explicitly
   justified in the PR description.

## Sequencing — ship in one PR, gated by a parity harness

### Step 0 — Save-SQL parity harness

For every entity in the fixture corpus, for `{create, update} × {SS, PG}`:
1. Construct representative field-value payloads (nulls, default-eligible
   fields, encrypted fields, function-literal PKs, wide PG entities for
   JSON-arg path).
2. Call current `GenerateSaveSQL`, capture emitted SQL string +
   `simpleSQL` + parameters.
3. Normalize (strip uuid suffixes, whitespace), write as golden files.
4. After the refactor, regenerate and diff against goldens. Zero
   unjustified diffs.

Lands on `next` first. No code-under-test changes. The harness is the
contract for the rewrite.

### Step 1 — The refactor (one PR)

- Two new methods on `SQLDialect`: `UseJsonArgShape`,
  `CoerceSaveFieldValue`. Implemented by `SQLServerDialect` and
  `PostgreSQLDialect`.
- Three new abstract methods on `GenericDatabaseProvider`:
  `RenderSaveCallBinding`, `WrapSaveCallForResult`,
  `WrapSaveCallWithRecordChange`. Concrete in `SQLServerDataProvider`
  and `PostgreSQLDataProvider`.
- `SaveCallBinding` discriminated union + `SaveSQLFragment` declared in
  `@memberjunction/generic-database-provider`.
- Concrete `GenerateSaveSQL` on `GenericDatabaseProvider`. Override
  removed from both providers.
- Deletions from `SQLServerDataProvider`: `GetSaveSQLWithDetails`,
  `generateSPParams`, `generateSetStatementValue`,
  `generateSingleSPParam`, `packageSPParam`.
- Deletions from `PostgreSQLDataProvider`: `buildCRUDParams`,
  `buildJsonArgCRUDParams`, `resolveFieldValue`, `getWritableFields`
  (`isBinaryField`, `encodeBinaryToBase64` stay — used by `WrapSaveCallForResult`).
- Parity harness shows zero unjustified diffs.

## Out of scope

- **`spDelete` consolidation.** Same template-method pattern applies;
  separate refactor.
- **Cross-dialect feature parity.** This refactor doesn't try to make SS
  and PG behave identically — only to share orchestration.
- **CodeGen-side dialect-driven emission.** CodeGen's separate
  `SQLServerCodeGenProvider` / `PostgreSQLCodeGenProvider` hierarchy is
  a separate concern.
- **Encryption refactor.** Already shared, works.
- **TransactionGroup overhaul.** Separate refactor.
- **Migration-file T-SQL → PG conversion.** SQLGlot's job (via
  `@memberjunction/sqlglot-ts`), not `SQLDialect`'s.

## Acceptance criteria

### Behavior-preservation
- Parity harness shows zero unjustified diffs across the full fixture
  corpus on both dialects, for both create and update.

### Round-trip integration tests
Run against real SS and real PG.

- [ ] **Regression: virtual field with mis-set `AllowUpdateAPI=1`** saves cleanly.
- [ ] **Value-coercion edges**: `datetimeoffset` non-null; `uniqueidentifier` set to `"newid()"`; bool→INTEGER on PG; bytea through positional and JSON-arg paths.
- [ ] **Encrypted field**: encryption runs after coercion, before rendering.
- [ ] **`SQLServerTransactionGroup` batch save**: 5+ saves, no variable name collisions.
- [ ] **Wide PG entity (AIAgent or AIPromptRun)**: must hit JSON-arg path.
- [ ] **PG `_Clear` companion**: argument count stays under 100.
- [ ] **PK-on-create with explicit value vs function literal**: both paths.
- [ ] **Record-change**: SS inlined, PG CTE.
- [ ] **`IsComputed` field**: round-trip succeeds.
- [ ] **The original repro**: agent run that produces artifact + version + junction.

### Code-quality bars
- All existing unit tests pass.
- New unit tests for `UseJsonArgShape` + `CoerceSaveFieldValue` per
  dialect (4 test groups) in `SQLDialect`.
- New unit tests for `RenderSaveCallBinding` + `WrapSaveCallForResult`
  + `WrapSaveCallWithRecordChange` per provider (6 test groups) in the
  respective provider packages.
- No new `any` types. `unknown` only at boundaries; narrowed within.
- No structural shadow types in `sql-dialect`.
- `SQLServerDataProvider` line count drops by ~400 lines.
  `PostgreSQLDataProvider` drops by ~200 lines.
- `GenericDatabaseProvider` grows by ~150 lines (the concrete orchestrator
  + helper).

### Out of scope for this PR (separate plans)
- `spDelete` consolidation.
- CodeGen-side dialect-driven emission.
- `useJsonArgShape` predicate de-duplication (3 copies after this PR).
- Metadata-primitives package extraction.

## Lessons from rev 3 (preserved here for the next refactor)

The rev 3 prototype (commit `4c5c56b`, reset before push) absorbed
save-call composition into `SQLDialect` via five new methods. Reviewer
feedback (`SQLDialect is intended to stay simple; provider-specific
stuff in subclasses; SQLGlot owns AST-level conversion`) flagged this
as overreach. The strongest tell was the seven structural shadow types
that had to be added to `sql-dialect` to avoid a dep cycle with
`@memberjunction/core` — they existed *because* the logic was in the
wrong place.

Rule of thumb for future dialect refactors: if you have to add
shadow types to a package to make the refactor compile, the refactor
is probably putting logic on the wrong side of a dep boundary.
Step back and put the logic where it can see the real types.
