-- Fix vwSQLColumnsAndEntityFields IsVirtual / AutoIncrement type mismatch — PG-only
--
-- BUG: The view returns IsVirtual and AutoIncrement as INTEGER 0/1
-- (SQL-Server-BIT-style port), but every consumer compares them to BOOLEAN
-- literals — both in CodeGenLib's PostgreSQLCodeGenProvider
-- (`sf."IsVirtual" = true`) and in the hand-ported
-- spUpdateExistingEntityFieldsFromSchema (`fromSQL."IsVirtual" = TRUE`,
-- `fromSQL."AutoIncrement" = TRUE`). PostgreSQL refuses to implicit-cast
-- INTEGER↔BOOLEAN, so every codegen Pass-2 invocation fails with:
--   ERROR: operator does not exist: integer = boolean
--
-- The underlying __mj."EntityField" columns are already BOOLEAN, so the view
-- was the inconsistent layer. Returning BOOLEAN aligns the view's type
-- contract with the table column it represents and makes every existing
-- comparison and downstream INSERT correct without further changes.
--
-- This is a CREATE OR REPLACE VIEW that preserves every other column
-- exactly as in the v5.0 PG baseline (B202602151200) — only the IsVirtual
-- and AutoIncrement expressions change. Idempotent and additive.

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" AS
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
    -- BUG FIX: was `CASE WHEN ... THEN 1 ELSE 0 END` returning INTEGER.
    -- Native PG boolean expression so the view's type matches
    -- __mj."EntityField"."AutoIncrement" (BOOLEAN).
    (COALESCE(bt_a.attidentity, '') IN ('a','d'))
                                               AS "AutoIncrement",
    a.attnum                                   AS column_id,
    -- BUG FIX: was `CASE WHEN bt_a.attnum IS NULL THEN 1 ELSE 0 END` returning
    -- INTEGER. Native PG boolean so the view's type matches
    -- __mj."EntityField"."IsVirtual" (BOOLEAN).
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
