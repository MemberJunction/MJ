-- PG-ONLY: remove orphan related-entity-name virtual EntityField rows.
--
-- The SS->PG converted baseline seeds related-entity-name virtual EntityField rows (e.g.
-- EntityActionFilter."EntityAction") whose backing column is NOT present in the generated PG base
-- view. PG base-view generation only emits the related-name column when the related entity has a
-- designated NameField; for name-less targets (Test Runs, Scheduled Job Runs, AI Prompt Models,
-- Entity Actions, ...) there is no name to join, so the column is correctly never produced — but the
-- virtual field still claims to exist. At runtime, engines `RunView` that field and PostgreSQL raises
-- `column "<X>" does not exist`, which prevents EntityActionEngine, AI Credential Bindings, and the
-- Scheduling engine from loading.
--
-- Fix: delete virtual EntityField rows whose column is absent from their entity's base view, so the
-- metadata is consistent with what the view actually provides. Guarded so it ONLY removes a virtual
-- field when the base view EXISTS but does not contain the column (never when a view is missing, which
-- would otherwise wrongly drop every virtual field for that entity). Non-virtual fields and virtual
-- fields whose column IS present (the normal related-name columns) are untouched. SQL Server is
-- unaffected (its baseline views contain these columns), so this is PG-only.

DELETE FROM ${flyway:defaultSchema}."EntityField" ef
USING ${flyway:defaultSchema}."Entity" e
WHERE ef."EntityID" = e."ID"
  AND ef."IsVirtual" = true
  AND e."BaseView" IS NOT NULL
  AND EXISTS (
        SELECT 1 FROM information_schema.views v
        WHERE v.table_schema = e."SchemaName" AND v.table_name = e."BaseView")
  AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = e."SchemaName"
          AND col.table_name = e."BaseView"
          AND LOWER(col.column_name) = LOWER(ef."Name"));
