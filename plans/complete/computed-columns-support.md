# Implementation Plan — First-Class Support for SQL Computed Columns

**Status**: Draft — awaiting review
**Author**: Drafted from the conversation that produced PR #2556
**Branch**: `CB-plan-computed-columns`
**Target**: `migrations/v5/` (current migration version)

## TL;DR

CodeGen currently conflates two different flavors of "virtual" column under a single `EntityField.IsVirtual = 1` flag: **(a)** view-only columns that are not in the base table, and **(b)** SQL Server computed columns and PostgreSQL generated columns that ARE in the base table but are SQL-read-only. The conflation forces base-view generation to route foreign-key Name lookups through the related entity's *view* (instead of its *base table*), which causes a latent breakage for self-referencing FKs whose Name Field is a computed column. Add an additive `EntityField.IsComputed` flag, populate it from the database catalog, and refine the join-target decision in `sql_codegen.ts` to prefer the base table when the related Name Field is `IsComputed = 1`. No existing semantics of `IsVirtual` change; the new flag is strictly additive.

## Goal

Make CodeGen correctly distinguish SQL computed/generated columns from view-only columns so that:

1. Foreign-key Name lookups whose target is a computed column join to the **base table**, not the view (eliminates unnecessary view materialization and unblocks self-FK cases).
2. Self-referencing FKs (e.g. `ParentID` on a self-table) whose Name Field is a computed column produce a working base view on both SQL Server and PostgreSQL — without the skip path introduced by PR #2556.
3. Existing `IsVirtual` consumers (sproc generation, GraphQL input types, IS-A inheritance, RLS projection, form generation) continue to behave exactly as they do today.

## Context From the Discussion

This plan emerges from a sequence of findings:

- **The metadata view conflates the two flavors**. `vwSQLColumnsAndEntityFields` defines `IsVirtual` as `IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0)`. The first disjunct catches view-only columns; the second catches SQL Server computed columns. Once the bit is set, downstream code can't tell the cases apart.
- **The conflation propagates into the FK Name-lookup join target**. [`packages/CodeGenLib/src/Database/sql_codegen.ts:1645`](packages/CodeGenLib/src/Database/sql_codegen.ts#L1645) chooses `RelatedEntityBaseView` whenever the related entity's Name Field is virtual — even when the column is physically in the base table.
- **The conflation creates a latent self-FK bug**. For a self-FK whose Name Field is a computed column, CodeGen tries to emit `LEFT JOIN vwFoo AS parent ...` inside `CREATE VIEW vwFoo AS ...`. SQL Server (DROP+CREATE pattern + immediate name resolution) and PostgreSQL (`CREATE OR REPLACE VIEW` + parse-time name resolution) both reject the self-reference. PR #2556 papered over this with a capability flag (`canSelfJoinViewForVirtualNameField()`) that defaults to `false` and skips the join entirely. The skip drops the virtual lookup column from the view.
- **No emitted view in the migrations tree exercises the broken path today**. The only existing self-FK base view (`vwTags` for `Tag.ParentID → Tag.ID`) joins to the base table because `Tag.Name` is a regular column. The combination (self-FK) + (computed Name Field) has never coincided in the schema, so the bug is latent.
- **`vwSQLColumnsAndEntityFields` already exposes `cc.definition AS ComputedColumnDefinition`**. The catalog data is right there; we just don't use it.
- **`AllowUpdateAPI` is already set to 0 for `IsVirtual = 1` columns** by [`SQLServerCodeGenProvider.ts:1336-1339`](packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts#L1336-L1339), so the runtime `ReadOnly` getter (`!AllowUpdateAPI || IsPrimaryKey || IsSpecialDateField`) handles computed columns correctly today regardless of `IsVirtual`.

## Current Consumers of `IsVirtual` (Inventory)

Captured for clarity — this plan **does not touch any of them**. They continue to read `IsVirtual` exactly as today.

| File | Line | What `IsVirtual = 1` means here |
|---|---|---|
| [`codeGenDatabaseProvider.ts:430`](packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts#L430) | `shouldIncludeFieldInParams` | Skip in spCreate / spUpdate parameter lists |
| [`codeGenDatabaseProvider.ts:569`](packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts#L569) | UPDATE column list | Skip in UPDATE column list |
| [`graphql_server_codegen.ts:495`](packages/CodeGenLib/src/Misc/graphql_server_codegen.ts#L495) | GraphQL input type filter | Exclude from mutation input (unless IS-A parent field) |
| [`angular-codegen.ts:712`](packages/CodeGenLib/src/Angular/angular-codegen.ts#L712) | Form generation | Skip rendering as form input when paired with FK |
| [`GenericDatabaseProvider.ts:2957`](packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts#L2957) | RLS projection | Skip in row-level-security projection check |
| [`manage-metadata.ts:1932-1983`](packages/CodeGenLib/src/Database/manage-metadata.ts#L1932-L1983) | IS-A inheritance | Combined with `AllowUpdateAPI = 1` to identify IS-A parent fields |
| [`entityInfo.ts:1005-1013`](packages/MJCore/src/generic/entityInfo.ts#L1005-L1013) `ReadOnly` getter | (intentionally ignores `IsVirtual`) | — |
| [`entityInfo.ts:1906`](packages/MJCore/src/generic/entityInfo.ts#L1906) | Parent field filter | Exclude from parent-field iteration |
| [`sql_codegen.ts:1645`](packages/CodeGenLib/src/Database/sql_codegen.ts#L1645) | **THIS PLAN TOUCHES THIS LINE** | Choose `RelatedEntityBaseView` over `RelatedEntityBaseTable` |
| [`sql_codegen.ts:1782`](packages/CodeGenLib/src/Database/sql_codegen.ts#L1782) | **THIS PLAN TOUCHES THIS LINE** | Skip self-FK virtual-NameField join when capability flag is `false` |

The runtime read-only semantics stay correct because `AllowUpdateAPI = 0` is auto-set for any `IsVirtual = 1` field, including computed columns.

## Proposed Design

### Recommended: Option B — Additive `IsComputed` Flag

Keep `IsVirtual` semantically unchanged. Add a new orthogonal flag `IsComputed` that means *"this column is a SQL-computed/generated column physically present in the base table."*

| Column type | `IsVirtual` | `IsComputed` |
|---|---|---|
| Regular base-table column | 0 | 0 |
| View-only column (joined name lookup, computed expression in view, etc.) | 1 | 0 |
| SQL Server computed column / PG generated column | 1 | 1 |

**Decision logic that changes:**

```typescript
// Old (sql_codegen.ts:1645)
const relatedTable = ef._RelatedEntityNameFieldIsVirtual
    ? ef.RelatedEntityBaseView
    : ef.RelatedEntityBaseTable;

// New
// Computed columns are physically in the base table, so we can resolve them
// from the table directly even though IsVirtual=1.
const useView = ef._RelatedEntityNameFieldIsVirtual && !ef._RelatedEntityNameFieldIsComputed;
const relatedTable = useView
    ? ef.RelatedEntityBaseView
    : ef.RelatedEntityBaseTable;
```

```typescript
// Old (sql_codegen.ts:1782)
if (nameField !== '' && nameFieldIsVirtual && isSelfFK
    && !this._dbProvider.canSelfJoinViewForVirtualNameField()) {
    continue; // skip
}

// New
// If the Name Field is a computed column, the join targets the base table
// (not the view), so the self-reference problem doesn't apply. Only skip
// when the Name Field is genuinely view-only.
if (nameField !== '' && nameFieldIsVirtual && !nameFieldIsComputed && isSelfFK
    && !this._dbProvider.canSelfJoinViewForVirtualNameField()) {
    continue; // skip — view-only NameField + self-FK + dialect can't self-reference
}
```

**Pros:**
- Strictly additive: no existing behavior changes.
- Narrow blast radius — exactly two decision points are refined.
- No audit of existing `IsVirtual` consumers required.
- New column on `EntityField` is non-breaking for external metadata consumers.

**Cons:**
- `IsVirtual` remains semantically overloaded ("not in base table" OR "computed in base table"). Future readers must consult `IsComputed` to fully disambiguate.
- Two flags express what one cleanly-named flag could express.

### Alternative: Option A — Split `IsVirtual` Into Two Orthogonal Flags

Make `IsVirtual` mean *only* "not in base table." Introduce `IsComputed` for the computed-in-base-table case. Computed columns flip from `IsVirtual=1, IsComputed=0` to `IsVirtual=0, IsComputed=1`.

**Required changes beyond Option B:**

- Audit and update every `IsVirtual` check in the inventory above to use `IsVirtual || IsComputed` (or an `IsReadOnlyInSQL` derived helper) where the original intent was "do not write this column."
- Backfill existing `EntityField` rows for computed columns to flip the bit.
- Increases the surface area of testing — sproc generation, GraphQL, form generation, RLS, IS-A inheritance, etc.

**Pros:**
- Clean semantics. Each flag means one thing.
- Future-proofs the metadata for any consumer that asks "is this physically in the base table?"

**Cons:**
- Significant blast radius — many call sites updated, several packages touched (`CodeGenLib`, `MJCore`, `GenericDatabaseProvider`, possibly `MJServer`).
- Requires data migration of existing `IsVirtual` rows.
- External consumers of MJ metadata (queries against `EntityField.IsVirtual`) would see semantically different rows after upgrade.

### Recommendation

**Option B.** The blast radius is right-sized to the actual problem. The cleanliness gain of Option A is real but doesn't justify the audit cost given that no current consumer is harmed by the conflation outside of the join-target decision. Option A can be revisited as a follow-up cleanup once Option B has shipped and the new flag is established.

The remainder of this plan describes Option B.

## Implementation Steps

### Step 1 — Add `EntityField.IsComputed` Column (Migration)

**File**: `migrations/v5/V<YYYYMMDDHHMM>__v5.x_AddIsComputedToEntityField.sql`
**Format**: per [`migrations/CLAUDE.md`](migrations/CLAUDE.md), use `VYYYYMMDDHHMM__v[VERSION].x_[DESCRIPTION].sql` and `${flyway:defaultSchema}` placeholder.

```sql
-- Add IsComputed flag to EntityField. Distinguishes SQL Server computed columns /
-- PostgreSQL generated columns (physically in the base table, but read-only at the
-- SQL layer) from view-only virtual columns. See plans/computed-columns-support.md.

ALTER TABLE ${flyway:defaultSchema}.EntityField ADD
    IsComputed BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=1 (read-only at the API layer) and IsComputed=1 (physically in the table).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsComputed';

-- Update the existing IsVirtual description to cross-reference IsComputed.
-- The current value is the literal string 'NULL' (effectively undocumented).
-- CodeGen pulls this into TSDoc on EntityFieldEntity.IsVirtual, so the
-- explanation surfaces in IntelliSense everywhere the property is used.
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this field is read-only at the API layer (excluded from spCreate / spUpdate / GraphQL input types). Set automatically when the column is either (a) not present in the base table — e.g., a joined name lookup in the base view, or (b) a SQL Server computed column or PostgreSQL generated column. Cases (a) and (b) are distinguished by the IsComputed flag: IsVirtual=1, IsComputed=0 means view-only; IsVirtual=1, IsComputed=1 means computed/generated and physically present in the base table.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsVirtual';
```

**Notes:**
- Single `ALTER TABLE` per the consolidation rule in `CLAUDE.md`.
- `sp_addextendedproperty` description for `IsComputed` is verbose because the flag's relationship to `IsVirtual` is non-obvious — future readers will appreciate the inline explanation.
- `sp_updateextendedproperty` (not `sp_addextendedproperty`) is required for `IsVirtual` because the property already exists (with value `'NULL'`). The pair stays in sync — both descriptions cross-reference each other so a developer reading either column's TSDoc gets the full picture.
- `__mj_*` timestamps and FK indexes are auto-handled by CodeGen — do not include them.

### Step 2 — Update `vwSQLColumnsAndEntityFields` Metadata View (SQL Server)

**File**: same migration as Step 1, OR a paired migration immediately after.
**Source of truth today**: [`SQL Scripts/MJ_BASE_BEFORE_SQL.sql`](SQL Scripts/MJ_BASE_BEFORE_SQL.sql) (also re-applied via versioned migrations).

The view already projects `cc.definition AS ComputedColumnDefinition`. Add the boolean form:

```sql
-- Inside the SELECT list, alongside the existing IsVirtual expression:
IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) AS IsVirtual,
IIF(cc.definition IS NOT NULL, 1, 0) AS IsComputed,
cc.definition AS ComputedColumnDefinition,
```

Both `MJ_BASE_BEFORE_SQL.sql` (CodeGen-applied baseline) and the migration script must be updated. The migration adds `IsComputed` non-destructively via an `ALTER VIEW` (or DROP+CREATE) — view changes do not need data migration.

### Step 3 — Add PostgreSQL Generated-Column Detection

**Investigation finding**: PG has no equivalent of `vwSQLColumnsAndEntityFields`. CodeGen reads PG metadata via direct queries against `information_schema.columns` from multiple call sites in [`packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`](packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts) (around lines 626, 841, 845).

PostgreSQL stores generated-column status in `pg_attribute.attgenerated`:
- `''` (empty) — regular column
- `'s'` — stored generated column (PG 12+)
- `'v'` — virtual generated column (PG 18+)

**Required changes:**

1. Audit every PG metadata extraction query in `PostgreSQLCodeGenProvider.ts`. Where each query returns column rows, add a `JOIN pg_attribute` (or a subquery) that exposes `attgenerated <> ''` as a boolean.
2. Map the boolean into the `IsComputed` field on the row payload.
3. Set `IsVirtual` to follow the same SQL Server logic — generated columns are also "read-only at the API layer," so `IsVirtual = 1, IsComputed = 1`.

**Decision point for the implementer**: rather than scattering the detection across query sites, consider creating a helper function (or, better, a PG view `pg_mj_columns_and_entity_fields`) that centralizes the logic and is queried once. This mirrors SQL Server's pattern and is the cleaner long-term shape. Recommend the view approach.

**Sample PG query fragment** (for the centralized view):

```sql
CREATE OR REPLACE VIEW ${flyway:defaultSchema}.vw_sql_columns_and_entity_fields AS
SELECT
    -- ... existing columns ...
    (a.attgenerated <> '') AS is_computed,
    -- For PG, "view-only" means the column appears in a view definition but
    -- not in any underlying base table. For now, treat is_virtual as
    -- (column is generated) OR (column appears only in a view) — same
    -- semantic as SQL Server's IIF.
    ((column_appears_in_view_only) OR (a.attgenerated <> '')) AS is_virtual,
    pg_get_expr(adb.adbin, adb.adrelid) AS computed_column_definition
FROM
    pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef adb ON adb.adrelid = a.attrelid AND adb.adnum = a.attnum
WHERE
    a.attnum > 0
    AND NOT a.attisdropped
    AND n.nspname = '${flyway:defaultSchema}';
```

The exact predicate for "view-only" requires more investigation against the existing PG provider's logic. Mark as TODO during implementation.

### Step 4 — Update Metadata Sync Logic to Propagate `IsComputed`

**Field-creation path** (new column being added to `EntityField` for the first time):
- File: [`packages/CodeGenLib/src/Database/manage-metadata.ts`](packages/CodeGenLib/src/Database/manage-metadata.ts), function `getPendingEntityFieldINSERTSQL` around lines 3151–3248.
- Today the function builds an `INSERT INTO EntityField (...)` with these columns: `ID, EntityID, Sequence, Name, DisplayName, Description, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, AllowUpdateAPI, IsVirtual, RelatedEntityID, RelatedEntityFieldName, IsNameField, IncludeInUserSearchAPI, IncludeRelatedEntityNameFieldInBaseView, DefaultInView, IsPrimaryKey, IsUnique, RelatedEntityDisplayType`.
- Add `IsComputed` to the column list and to the corresponding `VALUES` expression. Source the value from the metadata-view row produced in Steps 2 and 3.

**Field-update path** (existing `EntityField` row being refreshed from schema):
- The update is performed by stored procedure `spUpdateExistingEntityFieldsFromSchema`, invoked from `updateExistingEntityFieldsFromSchema()` in `manage-metadata.ts` around lines 3361–3390.
- The sproc body needs to be modified to also `UPDATE` the `IsComputed` column from the metadata view. Locate the sproc definition (likely in `SQL Scripts/MJ_BASE_BEFORE_SQL.sql` or a versioned migration that introduced it) and add the column to its `MERGE` / `UPDATE` body.

**Important**: there's a question of whether to *forcibly overwrite* `IsComputed` from the catalog every CodeGen run, or to only set it on first detection. Recommendation: overwrite every run, same policy as `IsVirtual`. If a customer adds a computed column, the next CodeGen run flips `IsComputed = 1`; if they remove it, the next CodeGen flips it back. Aligns with treating the database catalog as the source of truth.

### Step 5 — CodeGen TypeScript: Track `IsComputed` on FK Name-Lookup State

**File**: [`packages/CodeGenLib/src/Database/sql_codegen.ts`](packages/CodeGenLib/src/Database/sql_codegen.ts)

Today there's a tracker `_RelatedEntityNameFieldIsVirtual` on the FK field (set around lines 1815, 1862, 1869, 1881–1887). Add a parallel tracker:

```typescript
ef._RelatedEntityNameFieldIsComputed = anyFieldIsComputed; // NEW

protected getIsNameFieldForSingleEntity(entityName: string): {
    nameField: string,
    nameFieldIsVirtual: boolean,
    nameFieldIsComputed: boolean,        // NEW
} {
    const md: Metadata = new Metadata();
    const e: EntityInfo = md.EntityByName(entityName);
    if (e && e.NameField) {
        return {
            nameField: e.NameField.Name,
            nameFieldIsVirtual: e.NameField.IsVirtual,
            nameFieldIsComputed: e.NameField.IsComputed,    // NEW
        };
    }
    return { nameField: '', nameFieldIsVirtual: false, nameFieldIsComputed: false };
}
```

The corresponding `EntityFieldInfo` type in [`packages/MJCore/src/generic/entityInfo.ts`](packages/MJCore/src/generic/entityInfo.ts) gets a new `IsComputed` getter — this is auto-generated by CodeGen from the EntityField table column, so no manual edit. **However**, the bootstrap step on a fresh checkout requires that the generated entity classes have run *after* the migration applied. Document this in the rollout section.

### Step 6 — Refine the Join-Target Decision

**File**: [`packages/CodeGenLib/src/Database/sql_codegen.ts:1645`](packages/CodeGenLib/src/Database/sql_codegen.ts#L1645)

```typescript
// BEFORE
const relatedTable = ef._RelatedEntityNameFieldIsVirtual
    ? ef.RelatedEntityBaseView
    : ef.RelatedEntityBaseTable;

// AFTER
// Computed columns are physically present in the base table even though IsVirtual=1.
// Joining to the base table avoids unnecessary view materialization and sidesteps
// the self-reference problem for self-FKs whose Name Field is computed.
const useView = ef._RelatedEntityNameFieldIsVirtual && !ef._RelatedEntityNameFieldIsComputed;
const relatedTable = useView
    ? ef.RelatedEntityBaseView
    : ef.RelatedEntityBaseTable;
```

### Step 7 — Refine the Self-FK Skip Condition

**File**: [`packages/CodeGenLib/src/Database/sql_codegen.ts:1782`](packages/CodeGenLib/src/Database/sql_codegen.ts#L1782)

```typescript
// BEFORE
if (nameField !== '' && nameFieldIsVirtual && isSelfFK
    && !this._dbProvider.canSelfJoinViewForVirtualNameField()) {
    logStatus(`  Skipping self-referential virtual NameField join for ${owningEntity?.Name}...`);
    continue;
}

// AFTER
// Computed Name Fields don't require a view self-join — they resolve from the
// base table. Only skip when the Name Field is genuinely view-only AND the
// dialect cannot handle a view self-reference.
if (nameField !== '' && nameFieldIsVirtual && !nameFieldIsComputed && isSelfFK
    && !this._dbProvider.canSelfJoinViewForVirtualNameField()) {
    logStatus(`  Skipping self-referential view-only NameField join for ${owningEntity?.Name}...`);
    continue;
}
```

The skip path remains for the (probably-non-existent) case of a self-FK whose Name Field is genuinely a view-only column. The capability flag `canSelfJoinViewForVirtualNameField()` and PR #2556's default of `false` stay in place — they're now correctly scoped to only the view-only case.

### Step 8 — Rebuild & Regenerate

Order of operations on a developer machine after the code/migration changes are merged:

1. Apply the migration (Flyway / `mj migrate`) — adds `IsComputed` column, updates view, updates sync sproc.
2. Run `npm run build` in `packages/CodeGenLib`.
3. Run CodeGen — refreshes `EntityField` rows (populates `IsComputed`), regenerates `entity_subclasses.ts` (adds `IsComputed` getter), regenerates base views with new join targets where applicable.
4. Run `npm run build` from repo root to pick up regenerated entity classes.
5. Run `npm run test` in affected packages.

For customer / production deployment, document this order in the release notes.

### Step 9 — Forced View Regeneration Pass

CodeGen normally only re-emits views for entities whose schema has changed since the last run. To pick up the new join-target logic on **all** existing entities, perform a one-time forced regeneration:

- Option 1: introduce a CodeGen flag `--regenerate-all-views` that forces emission regardless of change detection.
- Option 2: bump a CodeGen version constant that's stamped into emitted views; mismatched constants force re-emission. (Cleaner if a similar mechanism already exists.)

If neither exists, document the workaround: temporarily touch each affected entity's `__mj_UpdatedAt` to trigger re-emission, then run CodeGen. **Verify** post-regeneration that the only entities whose views changed are those with FK columns pointing to entities whose Name Field is `IsComputed = 1`. No baseline schema entity matches this today, so the diff should be empty until a customer adds such a column.

### Step 10 — PR #2556 Interaction

PR #2556 sets `canSelfJoinViewForVirtualNameField()` default to `false` and removes both provider overrides. This plan **leaves that default in place**. Rationale:

- Computed Name Fields are now handled by the base-table join path (Step 6), so PR #2556's skip condition is no longer reached for them.
- The capability flag remains a correct safety mechanism for *genuinely view-only* Name Fields combined with self-FKs — which is a path that may not exist today but isn't impossible to construct.
- A future provider with stub-then-alter view emission could override the flag back to `true` and opt in.

Net result: PR #2556 + this plan = computed columns work; view-only-NameField self-FKs are correctly skipped; future opt-in path is intact.

## File-by-File Checklist

| File | Change |
|---|---|
| `migrations/v5/V<TS>__v5.x_AddIsComputedToEntityField.sql` | New migration: ALTER TABLE EntityField ADD IsComputed; sp_addextendedproperty for IsComputed; sp_updateextendedproperty for IsVirtual (cross-reference); ALTER VIEW vwSQLColumnsAndEntityFields; CREATE OR ALTER spUpdateExistingEntityFieldsFromSchema |
| `SQL Scripts/MJ_BASE_BEFORE_SQL.sql` | Update view definition (add `IsComputed` column expression) so fresh installs are correct |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Update `getPendingEntityFieldINSERTSQL` (and any related INSERT builder) to include `IsComputed` |
| `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts` | Add `attgenerated` detection to PG metadata queries (or create centralized PG metadata view) |
| `packages/CodeGenLib/src/Database/sql_codegen.ts` | (1) Add `_RelatedEntityNameFieldIsComputed` tracker, (2) `getIsNameFieldForSingleEntity` returns `nameFieldIsComputed`, (3) line 1645 join-target decision, (4) line 1782 self-FK skip refinement |
| `packages/MJCore/src/generic/entityInfo.ts` | (Auto-generated) `EntityFieldInfo.IsComputed` getter — no manual edit; verify after CodeGen runs |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | (Auto-regenerated) `EntityFieldEntity.IsComputed` getter/setter |
| `packages/Angular/Explorer/core-entity-forms/src/lib/generated/...` | (Auto-regenerated) Entity Field form picks up new column |
| `.changeset/<name>.md` | Patch bump for `@memberjunction/codegen-lib` (and any other directly modified package); minor bump for `@memberjunction/core` because of the new migration |
| `plans/computed-columns-support.md` | This document |

## Test Plan

### Unit tests (CodeGenLib)

Add to `packages/CodeGenLib/src/Database/providers/sqlserver/__tests__/SQLServerCodeGenProvider.test.ts` (and the PG counterpart):

1. **Join-target decision — regular column.** FK to entity whose Name Field is `IsVirtual=0, IsComputed=0`. Assert `relatedTable === RelatedEntityBaseTable`.
2. **Join-target decision — view-only Name Field.** FK to entity whose Name Field is `IsVirtual=1, IsComputed=0`. Assert `relatedTable === RelatedEntityBaseView`.
3. **Join-target decision — computed Name Field.** FK to entity whose Name Field is `IsVirtual=1, IsComputed=1`. Assert `relatedTable === RelatedEntityBaseTable`. **This is the new behavior.**
4. **Self-FK + computed Name Field.** Self-referencing FK whose related Name Field is `IsVirtual=1, IsComputed=1`. Assert the join is **emitted** (not skipped) and targets the base table.
5. **Self-FK + view-only Name Field on PG (or SS with flag=false).** Self-referencing FK whose related Name Field is `IsVirtual=1, IsComputed=0`. Assert the join is **skipped** (existing PR #2556 behavior preserved).
6. **`getIsNameFieldForSingleEntity` returns `nameFieldIsComputed` correctly** for each of the three column flavors.

### Integration test (DB-backed, marked skipped by default à la `pg-*.integration.test.ts`)

Construct a temp schema with:
- A `TempFoo` table that has a `ParentID UNIQUEIDENTIFIER NULL` self-FK and a computed Name column: `Name AS (CONCAT(FirstName, ' ', LastName)) PERSISTED`.
- Run CodeGen.
- Assert: `EntityField` row for `Name` has `IsVirtual=1, IsComputed=1`.
- Assert: emitted `vwTempFoo` includes `LEFT JOIN [schema].[TempFoo] AS Foo_ParentID ON ...` (base table, NOT view).
- Assert: applying the emitted SQL succeeds (the view actually creates).
- Run the same against PG with a `GENERATED ALWAYS AS (...) STORED` column.

### Regression (no schema change)

After regenerating views with the new logic, diff against the previous output. Expected: zero changes for entities without computed Name Fields. Any unexpected diff is a regression and must be investigated.

### Lint / build

- `npx turbo build --filter="@memberjunction/codegen-lib"` clean
- `npm run test` passes in CodeGenLib (≥ 435 tests today, plus the new ones)
- Generated entity_subclasses.ts re-emits cleanly with new `IsComputed` getter
- Generated Angular forms re-emit cleanly

## Validation Post-Deploy

1. On a customer DB with computed columns, after upgrade and CodeGen re-run, query `SELECT Name, IsVirtual, IsComputed FROM EntityField WHERE IsComputed = 1` and confirm exactly the columns that should be flagged.
2. Inspect the regenerated base view for any entity that has an FK to an entity with a computed Name Field — confirm the JOIN clause names the base table, not the view.
3. Confirm runtime read behavior is unchanged: querying the base view still returns the computed column's value (it always did; the change is only in *how* the view computes its output).

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Auto-regenerated `entity_subclasses.ts` drift breaks downstream consumers | Low | The new field is additive and read-only; no consumer should break on a new readonly getter. Run full repo build to verify. |
| `spUpdateExistingEntityFieldsFromSchema` modification breaks existing customer upgrade paths | Medium | Sproc must be idempotent and not require existing rows to have any particular `IsComputed` value. Default of 0 + sync from view on next CodeGen handles this. Test the upgrade path against a v5.0 baseline DB. |
| PG generated-column detection missed in some query path | Medium | Centralize the detection in a single helper or PG view. Add a dedicated unit test that exercises every query site. |
| Forced view regeneration produces unexpected diffs | Low | Run regeneration in a staging environment first; diff-review each modified view before merging. |
| External consumer queries `WHERE IsVirtual = 1` and now sees `IsComputed = 1` rows differently | Low | `IsVirtual = 1` is *not* changing for computed columns under Option B. External queries still see them as virtual. |
| New column on `EntityField` triggers MetadataSync diff noise on every push | Low | `IsComputed` is sourced from catalog, not authored — should be excluded from MetadataSync diffs (verify the sync config). |
| Self-FK + computed Name Field test entity creates baseline noise | Low | Keep the integration test's temp schema isolated and dropped after each run. |

## Out of Scope

- **Option A migration** (flipping `IsVirtual = 0` for computed columns and updating all `IsVirtual` consumers). Tracked as a follow-up cleanup; not part of this plan.
- **Persisting `ComputedColumnDefinition` on `EntityField`**. The metadata view exposes it; CodeGen doesn't need it persisted. Defer.
- **Removing `canSelfJoinViewForVirtualNameField()` capability flag**. The flag is still correct for genuinely view-only Name Fields with self-FKs. Keep the default of `false` from PR #2556.
- **Stub-then-alter view emission pattern**. A separate optimization that would let the capability flag flip to `true` for SQL Server / PG. Out of scope here.
- **PG metadata view for *all* PG metadata sources**, beyond columns. The PG provider has many query sites; this plan only requires touching the column-introspection path.

## Open Questions

1. **PG centralization vs in-place fixes.** Is there appetite for introducing a `vw_sql_columns_and_entity_fields` equivalent on PG side, or should we patch the in-line queries? The view approach is cleaner long-term and parallels SQL Server, but is a larger one-time effort. Recommend the view approach; flag for reviewer decision.
2. **`spUpdateExistingEntityFieldsFromSchema` location.** Confirm the current sproc body location (versioned migration vs `MJ_BASE_BEFORE_SQL.sql`) before writing the migration patch.
3. **Forced-regeneration mechanism.** Does CodeGen already have an "always re-emit" flag? If not, decide whether to add one or rely on the touch-`__mj_UpdatedAt` workaround.
4. **MetadataSync field exclusion.** Verify whether `IsComputed` should be added to the `excludeFields` list for `EntityField` metadata sync (similar to other catalog-derived fields).
5. **Documentation.** Should `CLAUDE.md` get a short note about `IsComputed` next to the existing `IsVirtual` discussion in the "Entity Metadata Best Practices" section? Recommend yes after merge.

## References

- PR #2556 — Disable view self-join for virtual NameField across all providers (the capability-flag mitigation that this plan reaches past)
- [`packages/CodeGenLib/src/Database/sql_codegen.ts`](packages/CodeGenLib/src/Database/sql_codegen.ts) — primary CodeGen logic touched in Steps 5–7
- [`packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts`](packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts) — base provider; `canSelfJoinViewForVirtualNameField()` lives here
- [`SQL Scripts/MJ_BASE_BEFORE_SQL.sql`](SQL Scripts/MJ_BASE_BEFORE_SQL.sql) — `vwSQLColumnsAndEntityFields` source of truth
- [`packages/CodeGenLib/src/Database/manage-metadata.ts`](packages/CodeGenLib/src/Database/manage-metadata.ts) — EntityField sync logic
- [`packages/MJCore/src/generic/entityInfo.ts`](packages/MJCore/src/generic/entityInfo.ts) — runtime `ReadOnly` getter (intentionally ignores `IsVirtual`; will not change)
- `migrations/CLAUDE.md` — migration authoring conventions
- `CLAUDE.md` (root) — project-wide standards including "no `any` types," BaseEntity patterns, Publish-Then-No-Breaking-Changes
