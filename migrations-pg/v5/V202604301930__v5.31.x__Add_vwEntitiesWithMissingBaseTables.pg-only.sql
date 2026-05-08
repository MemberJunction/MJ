-- =============================================================================
-- V202604301930__v5.30.x__Add_vwEntitiesWithMissingBaseTables.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The v5.0 PG baseline (B202602151200__v5.0__Baseline.pg.sql) wraps view
--   creation in DO blocks with EXCEPTION handlers. For
--   vwEntitiesWithMissingBaseTables, the wrapped CREATE silently failed during
--   baseline apply (the dependent vwEntities was not yet in its final shape),
--   leaving the view absent from the resulting database.
--
--   This view IS present in the SQL Server baseline and CodeGen depends on it
--   to detect entity rows whose backing tables have been dropped. Without it,
--   `mj codegen` against PG fails with "relation __mj.vwEntitiesWithMissingBaseTables
--   does not exist" during the metadata-management phase.
--
-- WHAT THIS MIGRATION DOES:
--   Creates the missing view with the same query as the SQL Server source —
--   a LEFT JOIN against information_schema.tables to find Entity rows with no
--   matching table in the schema.
--
-- COMPANION:
--   The earlier patch V202603011600__v5.5.x__Create_Missing_Views.pg-only.sql
--   caught 24 other views that the baseline failed to create. This view was
--   overlooked at that time and is being added now.
-- =============================================================================

DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwEntitiesWithMissingBaseTables" CASCADE;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwEntitiesWithMissingBaseTables" AS
SELECT
    e.*
FROM
    ${flyway:defaultSchema}."vwEntities" e
LEFT JOIN
    information_schema.tables t
        ON e."SchemaName" = t.table_schema
       AND e."BaseTable"  = t.table_name
WHERE
    t.table_name IS NULL;

DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwEntitiesWithMissingBaseTables" TO "cdp_UI";          EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwEntitiesWithMissingBaseTables" TO "cdp_Developer";   EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwEntitiesWithMissingBaseTables" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
