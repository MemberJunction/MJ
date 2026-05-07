# PG Migration & CodeGen Changes — Issue #2552 (JSON-arg CRUD sprocs)

This document tracks every change applied during the v5.33 PostgreSQL
migration cleanup + JSON-arg CRUD sproc rollout. The work spans three
fronts:

1. **Self-heal migration cleanup** — strip kitchen-sink codegen output from
   `V202605032310` down to its actual repair scope.
2. **Bug 5 fix** — repair `spUpdateExistingEntityFieldsFromSchema` so it
   doesn't strand `EntityField.Sequence` values on negatives.
3. **Issue #2552 — JSON-arg force-regen** — produce a v5.33 force-regen
   migration that ships JSON-arg CRUD sprocs for wide entities (PG's
   100-arg function limit) plus broad-rule typed-arg `_Clear` companions
   for narrow entities. Includes underlying CodeGenLib bug fixes that
   surfaced while testing the force-regen.

Final state of the modified files:

| File | Before | After |
|---|---:|---:|
| `V202605032310...Self_Heal.pg-only.sql` | 89,286 lines | ~340 lines |
| `V202605040300...Unblock.pg-only.sql` | (Bug 5 broken) | (Bug 5 fixed in body) |
| `V202605072300...Force_Regen...pg-only.sql` | (didn't exist) | ~66,039 lines |

---

## 1. Self-heal migration (V202605032310) — stripped down

The self-heal file shipped at **89,286 lines** because it was a full
codegen dump masquerading as a sproc-repair patch. The dump included a lot
of content unrelated to the actual repair (and in some cases actively
regressing prior migrations).

After cleanup the file is **~340 lines**, focused on the sproc fix +
virtual nullability repair only.

### What was stripped

#### 1a. 291 entity codegen regions (74,870 lines)

Each entity in the original file produced a 5-block codegen region:

```text
/* Base View SQL for X */                  — view rewrite via DO $vw_regen$
/* Base View Permissions SQL for X */      — duplicate GRANTs
/* spCreate SQL for X */                   — DROP-FUNCTION cleanup block
/* spUpdate SQL for X */                   — duplicate __mj_UpdatedAt trigger
/* spDelete SQL for X */                   — comment-only block
```

Per-block reasoning:

- **Base View SQL** — REGRESSION RISK. Some of the 291 view rewrites
  silently dropped columns that earlier migrations had added. Confirmed
  example: `vwRecordChanges` lost its `RestoredFrom` join column
  (relationship-name display field for `RestoredFromID`, added in
  V202604191500). Removing the self-heal's stale rewrite preserves the
  correct view from V202604191500 / V202604191502.
- **Base View Permissions SQL** — DUPLICATE. Three GRANT SELECT statements
  per entity, identical to the GRANTs already issued at the end of the
  Base View SQL block.
- **spCreate SQL** — OBSOLETE CLEANUP. Reduced to a `DROP FUNCTION IF
  EXISTS` to clear out broken sprocs. Immediately-preceding migration
  V202605032116 already re-installs every CRUD sproc with the correct
  tolerant signature. Nothing to drop.
- **spUpdate SQL** — DUPLICATE TRIGGER POLLUTION. Each block created a NEW
  trigger named `trg_update_<entity>` (snake_case) plus a function
  `fn_trg_update_<entity>()`. The PG baseline already creates equivalent
  triggers as `trgUpdate<Entity>` (camelCase). Inspection of the live DB
  after self-heal application confirmed both triggers were active
  simultaneously — both fire on every UPDATE.
- **spDelete SQL** — EMPTY. Comment-only blocks with no body.

#### 1b. 970 timestamp default-constraint blocks (13,560 lines)

For nearly every entity table, two paired blocks per `__mj_CreatedAt` and
`__mj_UpdatedAt` column:

```sql
/* SQL text to drop default existing default constraints in entity __mj.X */
... DO $$ ... DROP CONSTRAINT ... ALTER TABLE ... DROP DEFAULT ... $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity __mj.X */
ALTER TABLE __mj."X" ALTER COLUMN "__mj_CreatedAt"
    SET DEFAULT (NOW() AT TIME ZONE 'UTC');
```

Same pair for `__mj_UpdatedAt`. ~242 entity tables × 4 blocks each ≈ 968
total, plus 2 extras for "add special date field" creation. **968 + 2 = 970
removed.**

**Why removed**: The expression `(NOW() AT TIME ZONE 'UTC')` is
**session-TZ broken** in PG. Empirical proof in a non-UTC session:

```sql
SET TIME ZONE 'America/New_York';
CREATE TEMP TABLE t1 (
  a TIMESTAMPTZ DEFAULT now(),
  b TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'UTC')
);
INSERT INTO t1 DEFAULT VALUES;
SELECT a, b, a = b FROM t1;
```

```text
               a               |               b               | same_instant
-------------------------------+-------------------------------+--------------
 2026-05-07 15:48:16.736152-04 | 2026-05-07 19:48:16.736152-04 | f
```

The two columns store **different instants** — 4 hours apart. `now()`
records the actual current UTC instant (TIMESTAMPTZ stores in UTC
internally). `(now() AT TIME ZONE 'UTC')` strips the TZ to produce a
wall-clock UTC `TIMESTAMP`, which PG then interprets as session-local when
converting back to TIMESTAMPTZ — double-shifting the instant.

PG `now()` matches SS `GETUTCDATE()` semantics in any session. The
`(NOW() AT TIME ZONE 'UTC')` form *happens to work* in UTC sessions
(production default) which is why it hadn't been noticed.

A scan of every other `*.pg.sql` and `*.pg-only.sql` migration found
**zero** other migrations setting `ALTER COLUMN "__mj_CreatedAt" SET
DEFAULT (NOW() AT TIME ZONE 'UTC')`. The self-heal was the only place
installing the buggy form.

#### 1c. System Events entity registration (~540 lines)

The self-heal contained INSERTs for an Entity row + ApplicationEntity link
+ 3 EntityPermission rows + 7 EntityField rows + 1 EntityRelationship for
`MJ: System Events` (Entity ID `dc72d1f2-9b87-409f-b000-4a79c7078f1c`),
which corresponds to the `__mj.SystemEvent` table that the baseline
already creates.

**Why removed**: cross-platform parity violation.

- `__mj.SystemEvent` table exists in both PG and SS baselines.
- The Entity metadata row for `MJ: System Events` is **NOT** registered in
  any SS migration through v5.33.
- The PG self-heal was the **only** place registering it.
- Result: PG would have the entity registered while SS wouldn't.

If the `MJ: System Events` entity needs to be registered, that's its own
migration that targets both SS and PG. Out of scope for this self-heal.

### What's preserved (~340 lines)

#### A. Header + Bug 5-fixed sproc

The header banner + a self-heal prelude (UPDATE that reseats any leftover
negative `Sequence` values from prior failed runs) + the four-pass
`spUpdateExistingEntityFieldsFromSchema` rewrite + grants. See section 2
below for the Bug 5 fix details.

#### B. `/* SQL to fix virtual field nullability */` UPDATE

A single hand-written UPDATE that aligns virtual relationship-name fields'
`AllowsNull` with their underlying FK column's `AllowsNull`. Real
intentional self-heal repair logic.

```sql
UPDATE __mj."EntityField" vf
SET "AllowsNull" = fk."AllowsNull"
FROM __mj."EntityField" fk
WHERE vf."IsVirtual" = true
  AND fk."IsVirtual" = false
  AND vf."EntityID" = fk."EntityID"
  AND fk."RelatedEntityID" IS NOT NULL
  AND ( ... matching predicates between vf.Name and fk.Name ... )
  AND vf."AllowsNull" != fk."AllowsNull";
```

---

## 2. Bug 5 — `spUpdateExistingEntityFieldsFromSchema` four-pass design

### Symptom

After running the sproc, ~4,453 EntityField rows ended up with
`Sequence < 0`. Subsequent invocations failed with
`UQ_EntityField_EntityID_Sequence` unique-key violations because the same
negative-sequence space got re-used.

### Root cause — two interacting PG semantics

1. **Single snapshot inside `WITH`**: All sub-statements in a single
   `WITH` clause share one snapshot. Chaining `staged AS (UPDATE ...)`
   and `finalized AS (UPDATE ...)` against the same target rows means
   `finalized` cannot see `staged`'s commits.
2. **Per-row unique constraint enforcement**: The
   `UQ_EntityField_EntityID_Sequence` index is non-deferrable and checked
   per-row mid-statement. If a filtered row's *final* `Sequence` collides
   with an *unfiltered* row in the same entity that holds that value, a
   single UPDATE can't reorder them.

### Fix — four-pass design

Applied to both **V202605032310** AND **V202605040300**, since the latter
is the actual last writer (V202605032310's earlier fix was getting
overwritten). Each pass is a standalone top-level statement so each gets
its own snapshot.

```text
Temp tables built up-front
    _efs_filtered    — rows that genuinely changed (full payload available)
    _efs_stage_seq   — every row in any "affected" entity, with a unique
                       per-entity negative sequence

Pass A   — UPDATE every row in every affected entity to its negative.
           Unique-per-entity negatives dodge the constraint mid-statement.

Pass B   — UPDATE only the changed rows with their full payload (Type,
           AllowsNull, DefaultValue, etc). Sequence stays negative.

Pass C   — UPDATE every affected-entity row whose name matches a row in
           vwSQLColumnsAndEntityFields, setting Sequence to the SQL-derived
           value. Pass A's commits are visible, so we never collide with
           old positive sequences.

Pass D   — Catch-all for affected-entity rows still on negatives because
           they have no SQL counterpart (virtual relationship-name fields
           like "Entity"/"User"/"RestoredFrom"). Place them after the last
           SQL-derived sequence in their entity, preserving relative
           ordering. Without this pass those rows stay stuck on negatives
           forever and the next sproc call diff-detects them again.
```

### Verification

On a fresh DB:
- First call returns 4,455 rows updated.
- Second call returns 0 rows (idempotent).
- `SELECT COUNT(*) FROM __mj."EntityField" WHERE "Sequence" < 0` returns
  0 after either call.
- Each entity's EntityFields are sequenced 1..N with no gaps or
  duplicates.

---

## 3. Issue #2552 — JSON-arg force-regen migration (V202605072300)

### Why this migration exists

PG functions cap parameters at 100 (`FUNC_MAX_ARGS`). Wide entities like
`MJ: AI Agents` (~60 columns × 2 for `_Clear` companions ≈ 120 params
under broad rule) overshoot the limit, so the typed-arg sproc shape
literally cannot be created. The fix is **JSON-arg shape** for wide
entities: a single `p_data JSONB` parameter carrying the payload, with
key-presence semantics for tri-state field handling (key absent → leave
unchanged, key=null → clear, key=value → set).

Narrow entities continue to use the typed-arg shape, but with the
**broad-rule** `_Clear` companion (any nullable column gets a `_Clear`
companion). The earlier narrow rule (`AllowsNull AND HasDefaultValue AND
default<>NULL`) was deleted as a separate change earlier in the branch.

### Generation process

1. Reset `MJ_PG_5_33_0` and apply all v5.33 migrations (without the
   force-regen file).
2. Run `mj codegen` with `forceRegeneration: { spCreate: true, spUpdate:
   true, spDelete: true }` and `SQLOutput.enabled = true` writing to
   `migrations-pg/v5/V202605072300__v5.33.x__Force_Regen_All_CRUD_Sprocs_JSON_Arg_Shape.pg-only.sql`.
3. CodeGen produces a 6.8 MB file (~158k lines) containing the 1,884
   sproc blocks (314 entities × 6: spCreate SQL + spCreate Permissions +
   spUpdate SQL + spUpdate Permissions + spDelete SQL + spDelete
   Permissions) **plus** the kitchen-sink dump (view rewrites, timestamp
   defaults, FK indexes, System Events registration, etc.).
4. Strip the noise via `/tmp/strip_regen_to_sprocs.py` — keeps only the
   six sproc-block types per entity. Excludes `MJ: System Events`
   entirely (its `vwSystemEvents` view doesn't exist in production).
5. **Strip 313 duplicate trigger DDL blocks** via
   `/tmp/strip_trigger_ddl.py`. CodeGen embeds an
   `__mj_UpdatedAt`-bumping trigger DDL inside every spUpdate sproc
   block, using the snake-case naming `fn_trg_update_<entity>` /
   `trg_update_<entity>` AND the session-TZ-broken `NOW() AT TIME ZONE
   'UTC'` expression. These shadow the canonical `trgUpdate<Entity>` /
   `trgUpdate<Entity>_func` triggers installed by the baseline + earlier
   migrations. Strip them; the canonical triggers continue to bump
   `__mj_UpdatedAt` correctly (verified empirically with INSERT + UPDATE
   on `ActionCategory` showing the timestamp bump after a sproc-driven
   update).
6. Result: **~66,039 lines**, CRUD sprocs only.

### Shape distribution

The codegen-emitted force-regen contains:

| Shape | Count | Entities |
|---|---:|---|
| **JSON-arg** (`p_data JSONB`) | 4 | `spCreateAIAgent`, `spUpdateAIAgent`, `spCreateAIPromptRun`, `spUpdateAIPromptRun` |
| **Typed-arg + `_Clear` companions** (broad rule) | 624 | All 312 narrow entities × spCreate + spUpdate |
| **Typed-arg PK-only** | 314 | All entity spDelete sprocs |

Plus 942 GRANT/Permissions blocks (one per sproc).

### Convention precedent

The earlier force-regen migrations (V202605021056 v5.31, V202605032116
v5.32, V202605051430 v5.33) were **hand-written or SS→PG-converted** via
SQLConverter — they don't have codegen-banner comments and never went
through PG-native codegen. They emit bare quoted defaults (e.g.
`COALESCE(p_status, 'Pending')`).

V202605072300 is the **first PG-native codegen migration**, generated
because issue #2552's JSON-arg shape is PG-specific (no SS counterpart
exists to convert from). PG-native codegen is and should remain a
special case; everyday CRUD sproc work should continue flowing through
SS migrations + SQLConverter.

---

## 4. CodeGenLib bug fixes

PG-native codegen surfaced three real bugs in CodeGenLib that had
previously been latent (because the SS→PG conversion path didn't exercise
them).

### 4a. Provider lookup-key mismatch (`manage-metadata.ts`, `sql.ts`)

**Symptom**: Calling `getSystemSchemasToExclude()` (and other
PG-dialect-specific methods) at runtime threw `... is not a function`,
because `ClassFactory.CreateInstance` silently fell back to the abstract
base class on a mismatched registration key.

**Cause**: The lookup key passed to `ClassFactory.CreateInstance` was the
literal string `'PostgreSQLCodeGenProvider'`, but the
`@RegisterClass` decorator on that class registers it under the key
`'postgresql'` (the platform string).

**Fix**: Use `dbPlatform()` / `configInfo.dbPlatform` (which returns
`'postgresql'`) as the lookup key in both `manage-metadata.ts` and
`sql.ts`.

### 4b. JSON-arg `spCreate` dynamic-SQL parameterization (`PostgreSQLCodeGenProvider.ts`)

**Symptom**: `spCreateAIAgent('{"Name":"X"}'::jsonb)` failed at runtime
with `column "p_data" does not exist`.

**Cause**: The generated sproc body builds a dynamic INSERT via
`format()` then runs it through `EXECUTE v_sql`. The cast expressions
(e.g., `(p_data->>'Name')::TEXT`) were embedded as-is into the dynamic
SQL string. PG's dynamic-SQL parser does NOT see the enclosing
function's locals — `p_data` is unbound inside the dynamic SQL.

**Fix**: Two changes in `generateCRUDCreateJsonArg`:

1. Cast expressions in the JS-emitted `WHEN ... THEN ...` clauses use
   `$1` instead of `p_data` — i.e. `($1->>'Name')::TEXT`.
2. The EXECUTE binds `p_data` as the first parameter:
   `EXECUTE v_sql USING p_data;`

This is the canonical safe pattern for dynamic SQL with values: values
flow through the parameterized binding, never through string
interpolation, so there's zero injection surface.

The `spUpdate` JSON-arg sproc was unaffected — it uses a static
`UPDATE ... SET col = CASE WHEN p_data ? 'col' THEN ... END` clause
where `p_data` IS in scope (no `EXECUTE` indirection).

### 4c. Multi-word PG type names in `formatDefaultValue` (`PostgreSQLCodeGenProvider.ts`)

**Symptom**: For columns with a `varchar` default like `Status` (default
`'Pending'::character varying`), the generated sproc emitted
`COALESCE(p_status, '''Pending''::character varying')` — a string
literal whose content was the cast syntax. INSERTs failed with `value
too long for type character varying(20)`.

**Cause**: PG returns column defaults in the form
`'<value>'::<type-name>`. `formatDefaultValue`'s typed-literal-detection
regex was `^'.*'::\w+(\s*\(\s*\d+\s*\))?(\s*\[\s*\])?$` — it only
matched single-identifier type names (`text`, `uuid`). Multi-word PG
type names — `character varying`, `double precision`, `time with time
zone`, `timestamp with time zone`, `timestamp without time zone`, `time
without time zone`, `bit varying` — failed the match and fell through
to the path that strips quotes and re-wraps, producing the broken
literal-of-a-cast above.

**Fix**: Extend the regex to allow multi-word type names:

```js
/^'.*'::\w+(?:\s+\w+)*(\s*\(\s*\d+\s*\))?(\s*\[\s*\])?$/
```

The `\w+(?:\s+\w+)*` portion captures both single-word and multi-word
type names. **Pass-through behavior is preserved** — typed-cast literals
come from PG, go back as-is. Most defensive choice; PG handles typed
literals natively in every context the generated SQL uses (INSERT
VALUES, COALESCE, CASE-WHEN clear-companion patterns), empirically
verified across `character varying`, `integer`, `uuid`, `bigint`,
`double precision`, `boolean`, `timestamp with time zone`.

---

## End-to-end verification

After all changes, verified on fresh `MJ_PG_5_33_0` databases:

### Migration apply
- [x] All **128** PG migrations apply cleanly via `mj migrate` (127
  prior + the new V202605072300 force-regen).

### Bug 5 sproc
- [x] `spUpdateExistingEntityFieldsFromSchema('sys,staging')` returns
  **4,455** rows on first call.
- [x] `SELECT COUNT(*) FROM __mj."EntityField" WHERE "Sequence" < 0`
  returns **0** after first call.
- [x] Second call returns **0** rows (idempotent).

### Self-heal
- [x] `vwRecordChanges` includes both `RestoredFrom` AND
  `RootRestoredFromID` columns.
- [x] Trigger `trgUpdateAccessControlRule` (canonical, from baseline)
  exists; `trg_update_access_control_rule` (self-heal duplicate) does
  NOT exist.
- [x] Timestamp defaults on `__mj.ScheduledAction.__mj_CreatedAt` are
  `now()` (baseline form), NOT `(now() AT TIME ZONE 'UTC')`.
- [x] `MJ: System Events` Entity row does NOT exist (preserves SS
  parity).
- [x] Virtual nullability UPDATE corrects ~365+ field-mismatches at
  migration time (the residual 364 mismatches that re-appear after
  a subsequent `spUpdateExistingEntityFieldsFromSchema` run are a
  pre-existing design issue, not a regression).

### Wide entity (JSON-arg shape) — direct sproc test
- [x] `spCreateAIAgent('{"Name":"x"}'::jsonb)` creates row with
  auto-UUID and `Status='Pending'` (column default applied for
  omitted key).
- [x] `spUpdateAIAgent({ID, Name})` updates only `Name`; absent
  `Description` key keeps existing value.
- [x] `spUpdateAIAgent({ID, Description: null})` clears `Description`
  to NULL.

### Narrow entity (typed-arg + `_Clear` companions) — direct sproc test
- [x] `spCreateActionCategory(p_id, p_name)` creates with
  `Status='Pending'`.
- [x] `spUpdateActionCategory(p_id, p_description => 'first set')`
  sets the description.
- [x] `spUpdateActionCategory(p_id, p_name => 'renamed')` keeps
  description (omitted scalar param → COALESCE with column).
- [x] `spUpdateActionCategory(p_id, p_description_clear => TRUE)`
  clears description to NULL.
- [x] `spDeleteActionCategory(p_id)` deletes the row.

### Trigger functionality after strip
- [x] On a fresh DB, `information_schema.triggers` shows **313**
  canonical `trgUpdate<Entity>` triggers and **0** snake-case
  `trg_update_<entity>` duplicates.
- [x] `__mj_UpdatedAt` continues to be bumped on UPDATE: an INSERT
  followed 1.1s later by an UPDATE produces `__mj_UpdatedAt >
  __mj_CreatedAt`. The canonical baseline triggers handle the bump
  without the codegen-emitted duplicates.

### Runtime dispatch through `PostgreSQLDataProvider`
- [x] End-to-end test via `BaseEntity.Save()` exercises the runtime
  JSON-payload construction and parameterized binding through
  `PostgreSQLDataProvider`. Create + Update + Load + Delete all work
  for `MJ: AI Agents`, the same code path MJAPI uses behind GraphQL
  mutations. Verified key-omit semantics: updating only `Name`
  preserves `Description`.

### Unit tests
- [x] `@memberjunction/codegen-lib`: **447** tests pass.
- [x] `@memberjunction/postgresql-dataprovider`: **120** tests pass.

---

## Related files

- `migrations-pg/v5/V202605040300__v5.33.x__Unblock_PostgreSQL_End_To_End.pg-only.sql`
  — Has the same Bug 5 four-pass fix applied. Order matters: this file
  is the actual last writer for the sproc.
- `migrations-pg/v5/V202605032116__v5.32.x__Force_Regen_Tolerant_SP_All_Nullable_Columns.pg.sql`
  — Re-installs every CRUD sproc with the correct tolerant signature
  immediately before the self-heal runs. This is why the self-heal's
  spCreate DROP-FUNCTION blocks were redundant.
- `migrations-pg/v5/V202605072300__v5.33.x__Force_Regen_All_CRUD_Sprocs_JSON_Arg_Shape.pg-only.sql`
  — The new PG-native force-regen migration shipping JSON-arg sprocs
  for wide entities + broad-rule `_Clear` companions for narrow
  entities. Generated by `mj codegen` against `MJ_PG_5_33_0`, then
  trimmed to sproc blocks only via `/tmp/strip_regen_to_sprocs.py`.
- `migrations-pg/v5/B202602151200__v5.0__Baseline.pg.sql` — Installs
  the canonical `trgUpdate<Entity>` triggers and the correct `now()`
  defaults the self-heal was overwriting.
- `packages/CodeGenLib/src/Database/manage-metadata.ts`,
  `packages/CodeGenLib/src/Database/sql.ts` — Provider lookup-key fix
  (use `dbPlatform()` instead of literal class-name string).
- `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`
  — JSON-arg dynamic-SQL parameterization fix +
  `formatDefaultValue` regex extended for multi-word type names.
- `packages/CodeGenLib/src/__tests__/PostgreSQLCodeGenProvider.test.ts`
  — Two new regression-guard tests: one for JSON-arg `EXECUTE v_sql
  USING p_data` + `$1`-bound cast expressions; one for `formatDefault
  Value` typed-literal pass-through across single-word and multi-word
  type names.
