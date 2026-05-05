-- ============================================================================
-- Fix vwSQLColumnsAndEntityFields.AllowsNull to source from the BASE TABLE.
--
-- Background:
--   PostgreSQL stores `attnotnull` per column in pg_attribute. For BASE TABLE
--   columns this is the actual NOT NULL constraint flag. For VIEW columns the
--   value is always FALSE because views can have arbitrary expressions and PG
--   does not infer NOT NULL through them.
--
--   The previous view definition (V202605012100) reads `attnotnull` from
--   `src_cls` — which is COALESCE(view_oid, table_oid). For every entity that
--   has a base view (the common case), this returns the VIEW's attribute, so
--   `NOT a.attnotnull` is ALWAYS TRUE — meaning every field is reported as
--   nullable, including primary keys.
--
--   Downstream impact:
--     - `spUpdateExistingEntityFieldsFromSchema` reads this view, sees every
--       field as nullable, and OVERWRITES `__mj.EntityField.AllowsNull` to TRUE
--       on every codegen run. Even after a remediation UPDATE that fixes the
--       drift directly, the next codegen pass clobbers it again.
--     - CodeGen emits TypeScript types with `field: number | null` for
--       primary keys and other NOT NULL columns. Consumers of those types
--       (e.g. testing-engine-base.TestEngineBase line 234 subtracts two
--       Sequence values) fail to compile with `'X' is possibly 'null'`.
--
-- Fix:
--   Use `bt_a.attnotnull` (the BASE TABLE's pg_attribute row, already joined
--   in the existing definition) when the column exists on the base table.
--   For pure-virtual columns (computed in the view, no base-table backing) the
--   only signal we have is `a.attnotnull` from the view — which is always
--   FALSE — so virtual columns continue to be reported as nullable. That's
--   the correct behaviour: the view never declares them NOT NULL.
--
--   Concretely: `NOT COALESCE(bt_a.attnotnull, a.attnotnull)`.
--
-- Idempotency:
--   DROP VIEW IF EXISTS + recreate. Re-applying is a no-op on already-fixed
--   state because the new definition is what the view ends up as.
--
-- Cascade considerations:
--   This view is consumed by `spUpdateExistingEntityFieldsFromSchema` only
--   (verified via `pg_depend` audit on 2026-05-04). Recreating with `DROP …
--   CASCADE` would also drop that SP, but plain DROP suffices since we're not
--   changing the column shape — we're only adjusting one expression. The SP
--   continues to type-check against the recreated view because column names
--   and types are unchanged.
-- ============================================================================

DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields";

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
    -- AllowsNull: prefer the BASE TABLE's attnotnull when the column exists
    -- on the base table (most fields). Fall back to the view's attnotnull
    -- only for purely-virtual fields (joined/computed view-only columns),
    -- which the view never declares NOT NULL anyway, so the result is TRUE.
    NOT COALESCE(bt_a.attnotnull, a.attnotnull) AS "AllowsNull",
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
