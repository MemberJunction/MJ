-- =============================================================================
-- V202605012100__v5.30.x__Fix_vwSQLColumnsAndEntityFields_Boolean_Columns.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The v5.0 PG baseline defines vwSQLColumnsAndEntityFields with two columns
--   that return INTEGER but represent boolean concepts:
--
--     CASE WHEN COALESCE(bt_a.attidentity, '') IN ('a','d') THEN 1 ELSE 0 END
--                                                AS "AutoIncrement",
--     CASE WHEN bt_a.attnum IS NULL THEN 1 ELSE 0 END
--                                                AS "IsVirtual",
--
--   These are consumed by spUpdateExistingEntityFieldsFromSchema (and related
--   v5.30 sprocs) which declare them as BOOLEAN in their RETURNS TABLE clauses
--   and compare them with TRUE in the body. PostgreSQL strict typing rejects
--   the integer-to-boolean comparison, so `mj codegen` against PG fails during
--   the metadata-management phase with:
--
--       error: operator does not exist: integer = boolean
--
-- WHAT THIS MIGRATION DOES:
--   Recreates vwSQLColumnsAndEntityFields with the two CASE expressions
--   returning TRUE/FALSE instead of 1/0. This makes the view's output types
--   match what the consuming sprocs declare, eliminating the type-mismatch
--   error end-to-end. All other view columns are unchanged.
--
-- COMPANION:
--   This is part of the v5.30.1 PG toolchain fixes alongside the CodeGenLib
--   PostgreSQLCodeGenProvider.ts CASE-expression fixes that landed in source.
--   Together they unblock `mj codegen` against fresh PG installs.
-- =============================================================================

-- PG won't let CREATE OR REPLACE VIEW change a column's data type. DROP + CREATE
-- is required. CASCADE drops any dependent views (functions/sprocs reference views
-- by name at runtime, so they're not in the dependency graph and are unaffected).
-- Any dependent views that get dropped need to be recreated below if necessary —
-- as of v5.30 nothing in the corpus depends on this view at the view level.
DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" CASCADE;

CREATE VIEW ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" AS
SELECT
    e."EntityID",
    e."EntityName"                             AS "Entity",
    e."SchemaName",
    e."TableName",
    ef."ID"                                    AS "EntityFieldID",
    ef."Sequence"                              AS "EntityFieldSequence",
    ef."Name"                                  AS "EntityFieldName",
    a.attnum                                   AS "Sequence",
    bt_a.attnum                                AS "BaseTableSequence",
    a.attname                                  AS "FieldName",
    COALESCE(base_t.typname, t.typname)        AS "Type",
    CASE WHEN t.typtype = 'd' THEN t.typname ELSE NULL END
                                               AS "UserDefinedType",
    CASE
        WHEN t.typname IN ('varchar', 'bpchar', 'char')
            THEN CASE WHEN a.atttypmod = -1 THEN -1 ELSE a.atttypmod - 4 END
        WHEN t.typname = 'text' THEN -1
        ELSE a.attlen::integer
    END                                        AS "Length",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN ((a.atttypmod - 4) >> 16) & 65535
        ELSE 0
    END                                        AS "Precision",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN (a.atttypmod - 4) & 65535
        ELSE 0
    END                                        AS "Scale",
    NOT a.attnotnull                           AS "AllowsNull",
    -- Fix: return BOOLEAN to match the type declared in consuming sprocs
    -- (spUpdateExistingEntityFieldsFromSchema, etc.). Returning INTEGER 1/0
    -- caused `operator does not exist: integer = boolean` errors.
    (COALESCE(bt_a.attidentity, '') IN ('a','d'))
                                               AS "AutoIncrement",
    a.attnum                                   AS column_id,
    -- Fix: same as above — return BOOLEAN, not INTEGER 1/0.
    (bt_a.attnum IS NULL)                      AS "IsVirtual",
    src_cls.oid                                AS object_id,
    NULL::text                                 AS "DefaultConstraintName",
    pg_get_expr(ad.adbin, ad.adrelid)          AS "DefaultValue",
    NULL::text                                 AS "ComputedColumnDefinition",
    COALESCE(
        col_description(src_cls.oid, a.attnum),
        col_description(bt_cls.oid, bt_a.attnum)
    )                                          AS "Description",
    col_description(src_cls.oid, a.attnum)     AS "ViewColumnDescription",
    CASE
        WHEN bt_a.attnum IS NOT NULL
            THEN col_description(bt_cls.oid, bt_a.attnum)
        ELSE NULL
    END                                        AS "TableColumnDescription"
FROM
    ${flyway:defaultSchema}."vwSQLTablesAndEntities" e
-- Source class: view if it exists, otherwise the base table
INNER JOIN
    pg_catalog.pg_class src_cls
        ON src_cls.oid = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
    pg_catalog.pg_attribute a
        ON a.attrelid = src_cls.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
INNER JOIN
    pg_catalog.pg_type t ON a.atttypid = t.oid
LEFT JOIN
    pg_catalog.pg_type base_t
        ON t.typbasetype = base_t.oid AND t.typtype = 'd'
-- Base table class (always the table, not the view)
INNER JOIN
    pg_catalog.pg_class bt_cls ON bt_cls.oid = e.object_id
-- Base table column (NULL when column exists only in the view → IsVirtual)
LEFT JOIN
    pg_catalog.pg_attribute bt_a
        ON bt_a.attrelid = bt_cls.oid
        AND bt_a.attname = a.attname
        AND bt_a.attnum > 0
        AND NOT bt_a.attisdropped
-- Default value from base table
LEFT JOIN
    pg_catalog.pg_attrdef ad
        ON ad.adrelid = bt_cls.oid
        AND ad.adnum = bt_a.attnum
-- MemberJunction EntityField metadata
LEFT JOIN
    ${flyway:defaultSchema}."EntityField" ef
        ON e."EntityID" = ef."EntityID"
        AND a.attname = ef."Name";

DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" TO "cdp_UI";          EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" TO "cdp_Developer";   EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
