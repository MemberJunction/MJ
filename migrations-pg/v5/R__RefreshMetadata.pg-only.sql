-- ============================================================================
-- R__RefreshMetadata (PostgreSQL) — repeatable EntityField metadata self-heal
--
-- The PostgreSQL analog of migrations/R__RefreshMetadata.sql. Repeatable migrations
-- run on EVERY `mj migrate` and are always included regardless of baseline; the
-- ${flyway:timestamp} below changes the checksum each run so Flyway always re-applies
-- it (matching the SQL Server file's mechanism). It runs AFTER all versioned/baseline
-- migrations, so it heals the final state of the whole migration set.
--
-- Why PostgreSQL needs this: Path C deploys via `mj migrate` ALONE (no `mj codegen`),
-- so the deploy-time EntityField schema-resync that codegen's manageEntityFields
-- normally performs is otherwise lost. When a migration ALTERs a pre-existing column's
-- nullability, the stored EntityField.AllowsNull would go stale and BaseEntity
-- validation (and `mj sync push`) would reject otherwise-valid NULLs. SQL Server never
-- hit this because its R__RefreshMetadata self-heals every deploy; PG simply lacked the
-- counterpart.
--
-- Scope: AllowsNull only. It is the one schema-derived EntityField attribute that
-- genuinely drifts on PG — Type/Length/Precision/Scale/Default match the converted
-- metadata, and the canonical manageEntityFields SP additionally rewrites Sequence from
-- PG physical column order (attnum), a cosmetic difference we deliberately do NOT touch.
-- Derived straight from information_schema (no transient codegen support objects), scoped
-- to REAL columns, and applied ONLY where the stored value disagrees with the live schema.
-- Idempotent: a deploy with no drift updates zero rows.
--
-- ${flyway:timestamp}
-- ============================================================================

-- NOTE: PostgreSQL forbids referencing the UPDATE target (ef) inside a JOIN's ON clause,
-- so Entity/column are comma-joined FROM relations and every correlation lives in WHERE.
UPDATE ${flyway:defaultSchema}."EntityField" ef
   SET "AllowsNull" = (c.is_nullable = 'YES')
  FROM ${flyway:defaultSchema}."Entity" e,
       information_schema.columns c
 WHERE ef."EntityID"  = e."ID"
   AND c.table_schema = e."SchemaName"
   AND c.table_name   = e."BaseTable"
   AND c.column_name  = ef."Name"
   AND ef."IsVirtual" = false
   AND ef."AllowsNull" <> (c.is_nullable = 'YES');

-- ----------------------------------------------------------------------------
-- Orphaned EntityField rows — the second thing that genuinely drifts on the migrate-only path.
--
-- A migration can drop a column, or re-insert a virtual field that an earlier migration in the
-- same run deleted (baked CodeGen INSERTs do exactly that), leaving EntityField rows describing
-- columns the base view does not have. Every read of that entity's base view then fails with
-- `column "X" does not exist`, which takes out BaseEngine loads and `mj sync push` with them.
-- Measured on a from-scratch v6 database: 6 such rows across 5 entities — 4 of them created when
-- a fix migration's DELETE was undone by the very next migration's baked INSERTs.
--
-- SQL Server's R__RefreshMetadata clears these via spDeleteUnneededEntityFields on every deploy.
-- The PostgreSQL function already ships (emitted by metadataSupportObjects.ts) with the same
-- external-entity and scoping guards — it simply was never called from here.
--
-- The other five routines in the SQL Server file stay deliberately absent:
--   * spRecompileAllViews has no PostgreSQL equivalent — PG freezes a view's column list at
--     creation and there is no sp_refreshview. That gap is real, is tracked separately, and
--     cannot be closed from this file.
--   * spUpdateExistingEntitiesFromSchema / spUpdateExistingEntityFieldsFromSchema /
--     spSetDefaultColumnWidthWhereNeeded / spUpdateSchemaInfoFromDatabase would rewrite Sequence
--     from PG physical column order — the cosmetic difference this file's header already states
--     it will not touch.
--
-- Idempotent: a database with no orphans deletes nothing.
DO $$
BEGIN
  PERFORM ${flyway:defaultSchema}."spDeleteUnneededEntityFields"('sys,staging');
END $$;
