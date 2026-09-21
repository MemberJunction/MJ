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
-- The other four routines in the SQL Server file stay deliberately absent:
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

-- ----------------------------------------------------------------------------
-- Stale base views — the third thing that drifts on the migrate-only path, and the one this
-- file previously said it could not touch.
--
-- SQL Server's R__RefreshMetadata opens with spRecompileAllViews, which heals every view whose
-- cached column list went stale when a migration altered a base table. PostgreSQL has no
-- in-place refresh: a view's targetlist is frozen at creation, CREATE OR REPLACE VIEW may only
-- append columns, and pg_get_viewdef hands back the already-expanded definition — so the only
-- repair is DROP + CREATE from the ORIGINAL source, which lives in CodeGen rather than in the
-- database. That half genuinely cannot be closed from here and is not attempted.
--
-- What CAN be closed is the silence. A stale view says nothing until something reads it and
-- fails with `column "X" does not exist`, which takes BaseEngine loads and `mj sync push` down
-- with it, far from the migration that caused it. The PostgreSQL spRecompileAllViews (emitted by
-- metadataSupportObjects.ts, same as the prune above) compares every entity base view against
-- its base table and RAISEs a WARNING naming each drifted view and the columns it is missing, so
-- the condition lands in the migrate log at the point it is introduced. The repair it names is
-- `mj codegen`.
--
-- Idempotent and non-fatal: a database with no drifted view warns nothing.
--
-- GUARDED ON THE FUNCTION EXISTING, because this file must not require CodeGen to have run.
-- `spRecompileAllViews` is emitted by metadataSupportObjects.ts, so on the migrate-only path --
-- a fresh database brought up by `mj migrate` alone, which is exactly what release-time PG
-- validation does -- it is not there yet, and an unguarded PERFORM fails the whole migration
-- with `function __mj.spRecompileAllViews(unknown) does not exist`. The prune above survives
-- only because a versioned migration ships its function; this one has no such migration.
--
-- `to_regprocedure` returns NULL instead of raising for an absent routine, and the argument is
-- cast so the lookup matches the emitted `text` signature rather than resolving `unknown`.
DO $$
BEGIN
  IF to_regprocedure('${flyway:defaultSchema}."spRecompileAllViews"(text)') IS NOT NULL THEN
    PERFORM ${flyway:defaultSchema}."spRecompileAllViews"('sys,information_schema,staging'::text);
  ELSE
    RAISE NOTICE 'spRecompileAllViews is not present yet - skipping the stale-view check. It is emitted by CodeGen; run `mj codegen` to get it.';
  END IF;
END $$;
