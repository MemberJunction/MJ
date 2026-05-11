# Plan: Bubble SP-Call SQL Builder Up to the Generic Database Provider

## Status

Draft — proposed follow-up to the `IsSPParameter` consolidation that fixed the
"Procedure or function spCreateArtifactVersion has too many arguments
specified" regression. The runtime/CodeGen filter symmetry that bug exposed
is now correct, but the **broader duplication** between `SQLServerDataProvider`
and `PostgreSQLDataProvider` that allowed the asymmetry to exist in the first
place is still on the table.

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

- **CodeGen** filtered on `IsVirtual` (always excluded), `IsSpecialDateField`,
  `IsPrimaryKey + AutoIncrement`, and `AllowUpdateAPI`.
- **SQL Server runtime** filtered on `AllowUpdateAPI` and `SkipValidation`.
  `SkipValidation` happens to include `IsVirtual` in its checks, so virtual
  fields were excluded **indirectly**. The contract was not stated locally.
- **Postgres runtime** had its own filter list (`getWritableFields`).

This worked **only as long as metadata flags stayed self-consistent**. The
moment any agent (CodeGen sync SP, metadata import, a manual fix-up script,
a stale local cache) produced an `EntityField` row where `IsVirtual=1` but
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

## Goal

Move the SP-save SQL composition into the generic provider layer
(`GenericDatabaseProvider` / `DatabaseProviderBase`), with dialect-specific
behavior expressed as a small set of abstract hook methods. The two existing
hand-rolled implementations collapse to ~80 lines of dialect-specific code
each instead of ~250.

## Current shape (post-`IsSPParameter`)

```
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
│   ├── value coercion (datetimeoffset, GUID)  │   ├── per-field iteration
│   ├── DECLARE / SET / EXEC fragments         │   ├── value coercion (gen_random_uuid, etc.)
│   └── _Clear companion handling              │   ├── $1, $2 positional binding
├── generateSetStatementValue()                │   └── CALL / SELECT FROM function()
└── getAllEntityColumnsSQL() — for result table
```

The duplicated parts are the **iteration**, the **value coercion**, and the
**SQL-text assembly**. The dialect-specific parts are the binding syntax,
the result-shape wrapper, and the value-formatting rules.

## Proposed shape

```
GenericDatabaseProvider (NEW)
├── BuildSaveSQL(entity, isUpdate, contextUser) — NEW, replaces both providers' GenerateSaveSQL
│   ├── collectSaveFieldValues() — NEW, shared loop
│   │   └── delegates to EntityFieldInfo.IsSPParameter for inclusion
│   ├── EncryptFieldValuesForSave() — existing shared
│   ├── coerceFieldValue() — NEW, abstract dialect hook (datetimeoffset, GUID functions)
│   ├── RenderSPParams() — NEW, abstract dialect hook (DECLARE/SET/EXEC vs $1, $2)
│   └── ComposeSaveSQL() — NEW, abstract dialect hook (result-table wrapper, record-change glue)

SQLServerDataProvider
├── overrides coerceFieldValue(): datetimeoffset → ISO, newid()/newsequentialid() literal skip
├── overrides RenderSPParams(): DECLARE @x TYPE / SET @x = ... / EXEC sp @x=@x_uuid
└── overrides ComposeSaveSQL(): DECLARE @ResultTable + INSERT INTO @ResultTable EXEC ...
                                + spCreateRecordChange_Internal glue
                                + SELECT * FROM @ResultTable

PostgreSQLDataProvider
├── overrides coerceFieldValue(): gen_random_uuid() literal skip, timestamp normalization
├── overrides RenderSPParams(): positional $1, $2, ... + parameters[] array
└── overrides ComposeSaveSQL(): SELECT * FROM schema.sp_create_x($1, $2, ...)
                                + separate INSERT INTO RecordChange (handled by BuildRecordChangeSQL)
```

### Hook signatures (sketch)

```ts
// On GenericDatabaseProvider / DatabaseProviderBase

protected async BuildSaveSQL(
    entity: BaseEntity,
    isUpdate: boolean,
    contextUser: UserInfo,
): Promise<SaveSQLResult> {
    // 1. Iterate fields, gather values, apply IsSPParameter filter
    const fieldValueMap = await this.collectSaveFieldValues(entity, isUpdate, contextUser);

    // 2. Encryption (existing shared path)
    await this.EncryptFieldValuesForSave(entity, fieldValueMap, contextUser);

    // 3. Dialect renders the param syntax
    const rendered = this.RenderSPParams(entity, fieldValueMap, isUpdate);

    // 4. Dialect composes the final SQL (including record-change tracking)
    return this.ComposeSaveSQL(entity, rendered, isUpdate, contextUser);
}

protected async collectSaveFieldValues(
    entity: BaseEntity,
    isUpdate: boolean,
    contextUser: UserInfo,
): Promise<Map<EntityFieldInfo, unknown>> {
    const map = new Map<EntityFieldInfo, unknown>();
    for (const f of entity.EntityInfo.Fields) {
        if (!f.IsSPParameter(isUpdate)) continue;

        // PK-on-create is in the signature but only PASS it if user provided a value
        if (!isUpdate && f.IsPrimaryKey && !f.AutoIncrement) {
            const v = entity.Get(f.Name);
            if (v === null || v === undefined) continue;
        }

        const value = await this.coerceFieldValue(f, entity, isUpdate);
        if (value === SKIP_FIELD) continue;  // dialect can opt out
        map.set(f, value);
    }
    return map;
}

protected abstract coerceFieldValue(
    f: EntityFieldInfo,
    entity: BaseEntity,
    isUpdate: boolean,
): Promise<unknown | typeof SKIP_FIELD>;

protected abstract RenderSPParams(
    entity: BaseEntity,
    values: Map<EntityFieldInfo, unknown>,
    isUpdate: boolean,
): RenderedSPParams;

protected abstract ComposeSaveSQL(
    entity: BaseEntity,
    rendered: RenderedSPParams,
    isUpdate: boolean,
    contextUser: UserInfo,
): Promise<SaveSQLResult>;
```

`RenderedSPParams` is a dialect-shaped struct (named-param fragments on SQL
Server, positional + values[] array on PG) — opaque to the base class, passed
straight from `RenderSPParams` into `ComposeSaveSQL`.

`SKIP_FIELD` is a sentinel returned from `coerceFieldValue` for the
"user provided a function-call literal like `newid()` — let the DB default
fire instead" case. Cleaner than returning a marker value the renderer has
to special-case.

## What collapses, what stays

### Collapses into the base
- The field iteration loop (today: ~50 lines in SQL Server, ~10 lines in PG)
- The `IsSPParameter` filter application
- The encryption integration point
- The PK-on-create "pass only if value provided" rule
- The top-level `Save → GenerateSaveSQL → execute` dispatch (currently each
  provider overrides `GenerateSaveSQL` to do the same orchestration)

### Stays dialect-specific (as override hooks)
- **Value coercion**: how `datetimeoffset` is formatted for the wire, how
  `gen_random_uuid()` / `newid()` literal detection works, encryption type
  shape.
- **Parameter syntax**: SQL Server `DECLARE/SET/EXEC` with `@var_uuid`
  uniqueness vs PG positional `$1, $2, ...` with a values array. The base
  doesn't need to know which it is.
- **SQL template shape**: SQL Server's `DECLARE @ResultTable + INSERT INTO
  @ResultTable EXEC sp + RecordChange glue + SELECT @ResultTable` vs PG's
  `SELECT * FROM function(...)` + separate `INSERT INTO RecordChange`.
- **Record-change integration**: stays in `BuildRecordChangeSQL` (already
  abstract today — dialect-specific INSERT-INTO-RecordChange).

## Risks & migration concerns

1. **Encryption ordering.** `EncryptFieldValuesForSave` mutates the
   `fieldValueMap` after population but before SQL rendering. The new flow
   preserves this — same call site, just moved up into the base method.

2. **Variable name uniqueness in batched saves.** SQL Server's
   `SQLServerTransactionGroup` batches multiple saves into one SQL string,
   so each save's variables must be uniquely named to avoid collisions —
   that's the `_<uuid-suffix>` we generate today. PG uses positional
   parameters and sidesteps this entirely. The base method must let
   `RenderSPParams` own naming (since the strategy is dialect-specific).

3. **`generateSingleSPParam` (SQL Server, line 1088) — the "simpleParams"
   builder.** Used by some external callers (manifest-driven tooling, the
   GraphQL test harness) for backward compat. Stays SQL-Server-specific.
   The new `RenderSPParams` can emit it as part of its result so existing
   consumers keep working unchanged.

4. **Record-change inlining vs separate-statement.** SQL Server inlines
   the record-change `EXEC` into the same SQL batch as the entity save
   (one round trip). PG runs it as a separate statement after the save
   commits. Both styles must be possible — the `ComposeSaveSQL` hook
   decides. `BuildRecordChangeSQL` already supports both shapes (returns
   `{ sql, parameters? }`).

5. **Snapshot tests.** Both `SQLServerDataProvider` and
   `PostgreSQLDataProvider` have unit tests asserting against generated
   SQL strings. Behavior is preserved but the exact line breaks / whitespace
   may shift. Expect to re-bless ~10-20 snapshots. Each snapshot diff should
   be a no-op semantically; that's part of the PR review.

6. **Public API breakage for downstream subclasses.** Anyone who has
   subclassed `SQLServerDataProvider` and overridden `generateSPParams` or
   `GetSaveSQLWithDetails` directly will need to migrate to the new hook
   surface. Mitigation: ship a deprecation shim that calls the new hooks
   (so old overrides still get invoked, just with a deprecation warning),
   and remove the shim one major version later. Audience is small (this is
   private-ish API today) but worth being explicit about.

7. **TransactionGroup interaction.** `SQLServerTransactionGroup` already
   calls `GetSaveSQL` to regenerate per-item SQL when variables get rebound
   from earlier items in the same batch. That entry point needs to either
   keep working (via wrapper) or migrate to call `BuildSaveSQL`.
   Straightforward — same input, new output shape.

## Suggested sequencing

This refactor is large enough to be its own PR, ideally split into reviewable
chunks:

1. **Phase 1 — base method skeleton.** Add `BuildSaveSQL` and the three
   abstract hooks to `GenericDatabaseProvider`. Keep the existing
   `GenerateSaveSQL` overrides in both dialect providers. Empty default
   implementations of the new hooks that throw "not implemented". No
   behavior change yet.

2. **Phase 2 — SQL Server migration.** Implement the three hooks in
   `SQLServerDataProvider`. Switch its `GenerateSaveSQL` to call the new
   `BuildSaveSQL`. Snapshot tests re-blessed in this commit. Verify
   `SQLServerTransactionGroup` still works end-to-end.

3. **Phase 3 — Postgres migration.** Same as Phase 2 for the PG provider.
   Snapshot tests re-blessed.

4. **Phase 4 — base method becomes canonical.** Delete `GenerateSaveSQL`
   overrides from both providers; they now inherit `BuildSaveSQL` from the
   base.

5. **Phase 5 — cleanup.** Remove dead code paths (`generateSPParams` etc.
   only invoked by the now-deleted overrides). Document the new public hook
   surface.

Each phase is independently revertable. The full sequence can ship across
one release with feature-flag gating if desired, but probably doesn't need
it since each phase is internally consistent.

## Out of scope

- **Cross-dialect feature parity.** This refactor doesn't try to make
  SQL Server and PG behave identically — only to share the orchestration.
  Dialect-specific behavior (e.g. SQL Server's `OUTPUT INTO @ResultTable`
  pattern vs PG's `RETURNING` clause) stays where it is.
- **`spDelete` consolidation.** Same pattern likely applies but is its own
  refactor; this plan covers `spCreate`/`spUpdate` only.
- **Encryption refactor.** `EncryptFieldValuesForSave` is already shared and
  works; left as-is.
- **TransactionGroup overhaul.** PG and SQL Server have separate transaction
  group classes today; that's a parallel concern, not bundled here.

## Acceptance criteria

- All existing tests pass — no behavior change.
- Snapshot tests re-blessed with semantically equivalent generated SQL.
- New unit tests for `BuildSaveSQL` + the three hooks (each dialect
  exercising the full path against a fixture entity).
- A regression test mirroring the original bug: an entity with a virtual
  field whose `AllowUpdateAPI` flag is mis-set saves cleanly (the base
  `IsSPParameter` filter rejects the bad field independent of the runtime
  path).
- No new entries in any downstream package's `@memberjunction/*` major
  version bump tracker (the public API for the providers is preserved via
  the deprecation shim during the transition).
- One real-world smoke test: a fresh agent run that produces an artifact
  payload completes with the artifact + version + junction all persisted
  (the regression scenario from the original bug).
