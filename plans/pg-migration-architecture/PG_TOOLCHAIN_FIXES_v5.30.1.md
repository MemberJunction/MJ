# PG Toolchain Fixes — v5.30.1

Concrete plan for unblocking the `/pg-migrate` workflow on `next` so it produces working PG migrations + working CodeGen for v5.31 onward.

## Why this exists

Empirical test on `next` (2026-05-01) — running `/pg-migrate` against the v5.31 `Create_UDT_Schema.sql` produces output that fails to apply on PG, and `mj codegen` against a fresh PG install fails with multiple type-mismatch errors. Both surface the same class of regression introduced by PR #2208 (the PG support work) — patterns that work fine in one place but were never propagated everywhere.

Each release cycle compounds the gap if not fixed: every new SS migration without a working PG counterpart and every new entity without working CRUD sprocs accumulates technical debt.

## Scope — five concrete fixes

### Fix 1: `IF NOT EXISTS (sys.schemas) ... EXEC('CREATE SCHEMA [X]')` translation

**Symptom:** The v5.31 file's schema-creation pattern survives into PG output untranslated:
```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_UDT') THEN
        "EXEC"('CREATE SCHEMA [__mj_UDT]');
    END IF;
END $$;
```

**Target output:**
```sql
CREATE SCHEMA IF NOT EXISTS "__mj_UDT";
```

**Fix location:** Add a new rule (or extend `StatementClassifier.ts:134` + `ExecBlockRule.ts`) that recognizes the `IF NOT EXISTS (sys.schemas WHERE name = X) ... EXEC('CREATE SCHEMA [X]')` shape and emits idempotent `CREATE SCHEMA IF NOT EXISTS "X"`.

**Test fixture:** v5.31 `Create_UDT_Schema.sql` lines 6-9.

---

### Fix 2: Wrapped `EXEC sp_addextendedproperty` translation

**Symptom:** When `sp_addextendedproperty` is wrapped in `IF NOT EXISTS (sys.extended_properties) BEGIN ... END`, the existing `ExtendedPropertyRule` regex doesn't match and the whole block survives untranslated:
```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE ...) THEN
        "EXEC" sp_addextendedproperty
        @name = 'MS_Description',
        @value = '...',
        @level0type = 'SCHEMA',
        @level0name = '__mj_UDT';
    END IF;
END $$;
```

**Target output:**
```sql
COMMENT ON SCHEMA "__mj_UDT" IS '...';
```

**Fix location:** `packages/SQLConverter/src/rules/ExtendedPropertyRule.ts` — extend the regex on line 75 to handle the `IF NOT EXISTS (sys.extended_properties) BEGIN EXEC sp_addextendedproperty ... END` wrapper, OR prepend a stripping pass in `StatementClassifier` that unwraps these guards before the rule matches.

**Test fixture:** v5.31 `Create_UDT_Schema.sql` lines 12-26.

---

### Fix 3: Managed-PG regression — stop emitting `UPDATE pg_cast`

**Symptom:** The converter still emits `UPDATE pg_cast SET castcontext = 'i'` in every output's dialect header (`DialectHeaderBuilder.ts:51`). The v5.30 fix (`5c8d1a2f06`) stripped this from existing migration files but did not fix the converter — so every NEW migration regenerates the regression. Managed PG (RDS, Aurora, Cloud SQL, Azure) rejects this because users don't have superuser.

**Fix location:** `packages/SQLConverter/src/rules/DialectHeaderBuilder.ts:51` — drop the `UPDATE pg_cast` block entirely. The reason this UPDATE existed was to support `INSERT INTO bool_column VALUES (1)` (SS-style integer-as-boolean). Since v5.30 also rewrote all bulk INSERTs to use `TRUE`/`FALSE` directly, the UPDATE serves no purpose anymore.

**Side-effect check:** Any fresh PG install with self-managed superuser-controlled PG that *was* relying on this UPDATE? In practice no — every committed migration uses `TRUE`/`FALSE` now. Worth grepping the migration corpus for any remaining `0`/`1`-into-boolean inserts to be safe.

---

### Fix 4: CodeGenLib PG provider boolean=integer in CASE expressions

**Symptom:** When `mj codegen` runs against PG, three CASE expressions in `PostgreSQLCodeGenProvider.ts` return `1`/`0` for output columns whose downstream consumers expect BOOLEAN. PG's strict typing rejects this. We mapped these earlier today.

**Fix location:** `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`

| Line | Current | Fix |
|---|---|---|
| 908 | `CASE WHEN is_nullable = 'YES' THEN 1 ELSE 0 END AS "AllowsNull"` | `THEN TRUE ELSE FALSE` |
| 1882 | `CASE WHEN sf."FieldName" = 'Name' THEN 1 ELSE 0 END AS "IsNameField"` | `THEN TRUE ELSE FALSE` |
| 1883 | `CASE WHEN pk."ColumnName" IS NOT NULL THEN 1 ELSE 0 END AS "IsPrimaryKey"` | `THEN TRUE ELSE FALSE` |
| 1885-1887 | `CASE WHEN pk... THEN 1 WHEN uk... THEN 1 ELSE 0 END AS "IsUnique"` | `THEN TRUE ... ELSE FALSE` |
| 1919-1925 | `buildAllowUpdateAPICase()` — 5x `THEN 0`, 1x `ELSE 1` | All `THEN FALSE`, `ELSE TRUE` |

These edits were verified locally to unblock the immediate codegen errors during the migrations PR work today. Total: ~12 line changes, zero behavioral change beyond fixing the type error.

---

### Fix 5: View↔sproc type mismatch in `vwSQLColumnsAndEntityFields`

**Symptom:** The view returns `INTEGER` for `AutoIncrement` and `IsVirtual`, but the sproc `spUpdateExistingEntityFieldsFromSchema` consumes those columns with `(fromSQL."AutoIncrement" = TRUE)` — INTEGER `=` BOOLEAN, PG rejects.

**Fix location:** Two options, pick one:

**Option A — fix the view to return BOOLEAN.** Edit the view definition wherever it's defined (likely in the v5.0 PG baseline or `Create_Missing_Views.pg-only.sql`). The view source query reads from `information_schema.columns` which already has correct types; the `INTEGER` cast is a v5.0-baseline artifact.

**Option B — fix the sproc to compare with `1` instead of `TRUE`.** Edit `migrations-pg/v5/V202604261352__v5.30.x__Scoped_EntityField_SPs.pg.sql` lines 169, 170, 221, 222.

Option A is cleaner (one place, one direction). Option B touches a committed migration file which means flyway repair on every dev DB. Recommend Option A via a new `.pg-only.sql` patch.

---

## Order of operations

1. **Fix 4** first (CodeGenLib CASE expressions) — single file, ~12 lines, lowest risk, immediate verifiable gain (reverses today's empirically-found errors).
2. **Fix 3** second (drop pg_cast emission) — single file, ~10 lines deleted, no behavioral risk.
3. **Fix 1 & 2** together (converter rules for schema CREATE + sp_addextendedproperty wrapper) — same area of the code, share test fixture (v5.31 file).
4. **Fix 5** last — once 1-4 are in place, re-run the full /pg-migrate loop. Fix 5's view-or-sproc decision can be informed by what we learn applying the rest.

After all five: re-run `/pg-migrate` against `next` + v5.31. Phase 2 conversion should be clean. Phase 4 smoke testing should have working CodeGen → working CRUD on new entities.

## Verification gate

Same gate that exists today, plus targeted additions:

- **CodeGenLib unit tests** (`cd packages/CodeGenLib && npm test`) — must stay green for both SS and PG paths.
- **SQLConverter regression test** (`cd packages/SQLConverter && npm test`) — must stay green; new rule fixtures added for Fix 1 & 2.
- **`pg-migrations.yml` workflow** — must stay green (apply step exercises the fixed converter output).
- **Manual `/pg-migrate` dry-run** on the v5.31 file — must convert + apply cleanly + complete CodeGen end-to-end.

## Out of scope

- Schema-parity perfection between SS and PG (still has known divergences per `PG_MANUAL_FIXES_CATALOG.md`).
- The v5.30 `Metadata_Sync.sql` 964k-line port — separate workaround via `mj sync push --dir metadata` already documented.
- AI-prompt-dependent CodeGen features (Check Constraint Parser, etc.) that need API keys — environmental, not source bugs.

## Estimated effort

- Fix 4: 30 min including tests
- Fix 3: 30 min including tests + grep audit
- Fix 1 & 2: 2-4 hours (new rules, test fixtures, edge cases)
- Fix 5: 1-2 hours (view rewrite + flyway-safe migration)
- End-to-end /pg-migrate verification: 1-2 hours
- CLI republish: ~30 min after merge

**Total: ~1-2 days of focused work** assuming no surprise discoveries. Same caveat as before: each fix may surface a layer below it.
