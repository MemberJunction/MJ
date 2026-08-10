-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $mj$
BEGIN
  /* ==============================================================================================
  Stop four entities asking for a name column that MJ: Entity Actions does not have.
  MJ's convention: a foreign key with IncludeRelatedEntityNameFieldInBaseView = 1 gets a
  denormalized display column in the base view, named after the TARGET entity, carrying that
  record's name — so a grid shows a readable value instead of a UUID.
  Four entities set that flag on their EntityActionID FK:
  MJ: Action Execution Logs
  MJ: Entity Action Filters
  MJ: Entity Action Invocations
  MJ: Entity Action Params
  The target, MJ: Entity Actions, is a pure junction — EntityID + ActionID + Status. It has no
  name column and no field flagged IsNameField, so there is nothing for the join to select.
  CodeGen therefore creates the EntityField row announcing an `EntityAction` column, and then
  cannot emit that column into the view. Anything selecting it gets:
  Invalid column name 'EntityAction'
  The same request also breaks the entity's field ordering, because the metadata carries a field
  the view does not, which is what surfaced it: CodeGen's entityFieldsSequenceCheck reports a
  metadata/view mismatch at positions 8 and 9 of vwEntityActionInvocations, and integration bundle
  IT50 (oracle codegen-determinism.CD3) fails naming all four.
  Note this was invisible on long-lived databases: a previous CodeGen run had deleted the orphan
  EntityField rows there, so the mismatch — and IT50 — silently disappeared. It reproduces exactly
  on a database built only from migrations, which is where it was found.
  The fix is to stop asking. Sibling FKs are unaffected: InvocationTypeID keeps its flag and its
  working `InvocationType` column, because MJ: Entity Action Invocation Types does have a name.
  Targeted by (EntityID, Name) rather than by EntityField.ID, because the orphan rows are created
  by CodeGen and their IDs differ per database — on some they do not exist at all.
  ============================================================================================== */
  CREATE TEMP TABLE v_EntityActionConsumers ("EntityID" UUID PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO v_EntityActionConsumers ("EntityID")
  VALUES
  ('3E248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Action Execution Logs
  ('39248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Filters
  ('35248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Invocations
  ('56248F34-2837-EF11-86D4-6045BDEE16E6');  -- MJ: Entity Action Params
  /* 1. Stop the request. Without this, the next CodeGen run recreates the orphan field. */
  UPDATE __mj."EntityField" SET "IncludeRelatedEntityNameFieldInBaseView" = FALSE,
  "__mj_UpdatedAt" = NOW()
  FROM v_EntityActionConsumers c
  WHERE c."EntityID" = __mj."EntityField"."EntityID"
  AND __mj."EntityField"."Name" = 'EntityActionID'
  AND __mj."EntityField"."IncludeRelatedEntityNameFieldInBaseView" = TRUE;
  /* 2. Remove the orphan virtual fields already created. Scoped to virtual fields named
  'EntityAction' on those four entities only — a real, view-backed column is never IsVirtual,
  so this cannot remove a working field. */
  DELETE FROM __mj."EntityField" ef
  USING v_EntityActionConsumers c
  WHERE c."EntityID" = ef."EntityID"
  AND ef."Name" = 'EntityAction'
  AND ef."IsVirtual" = TRUE;
END $mj$;
