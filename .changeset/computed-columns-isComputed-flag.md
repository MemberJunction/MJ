---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
"@memberjunction/sql-converter": patch
---

Add `EntityField.IsComputed` flag to distinguish SQL Server computed columns and PostgreSQL generated columns from view-only virtual columns. Both flavors continue to be flagged `IsVirtual = 1`, so every existing IsVirtual consumer (sproc generation, GraphQL input types, IS-A inheritance, RLS, form generation) is unchanged. The new flag refines base-view JOIN-target selection in CodeGen — when an FK's related Name Field is `IsComputed = 1`, the generated view joins to the related entity's base table instead of its view, avoiding unnecessary view materialization and unblocking self-referencing FKs whose Name Field is computed. Includes the migration that adds the column, extends the `vwSQLColumnsAndEntityFields` metadata view, and updates `spUpdateExistingEntityFieldsFromSchema` to sync the flag from the catalog. PG side: the SQLConverter `CatalogViewRule` now sources `IsComputed` from `pg_attribute.attgenerated`. After deploying, run CodeGen once to repopulate `IsComputed` and regenerate base views that depend on entities with computed Name Fields.
