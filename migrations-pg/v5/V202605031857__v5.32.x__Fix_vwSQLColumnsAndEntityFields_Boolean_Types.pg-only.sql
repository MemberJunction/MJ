-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PostgreSQL end-to-end fix migration — six issues blocking PG mints       ║
-- ║                                                                          ║
-- ║  1. CREATE ROLE for cdp_Developer / cdp_Integration / cdp_UI             ║
-- ║     (the v5.0 PG baseline references these in 800+ unwrapped GRANTs but  ║
-- ║      never CREATEs them — every PG mint aborts at baseline today).       ║
-- ║                                                                          ║
-- ║  2. GRANT USAGE on __mj to cdp_* roles + ALTER DEFAULT PRIVILEGES so     ║
-- ║     subsequent migrations' new objects inherit grants automatically.     ║
-- ║     (Until now, only objects created during the baseline got grants;     ║
-- ║      every later codegen-output object was inaccessible.)                ║
-- ║                                                                          ║
-- ║  3+4. Re-create __mj.vwSQLColumnsAndEntityFields with native BOOLEAN     ║
-- ║     IsVirtual + AutoIncrement (was INTEGER 0/1 in baseline). This        ║
-- ║     fixes both PostgreSQLCodeGenProvider.buildAllowUpdateAPICase         ║
-- ║     (`sf."IsVirtual" = true`) and the hand-ported                        ║
-- ║     spUpdateExistingEntityFieldsFromSchema body                          ║
-- ║     (`fromSQL."IsVirtual" = TRUE`, `fromSQL."AutoIncrement" = TRUE`)     ║
-- ║     in one stroke — the underlying __mj."EntityField" column types are  ║
-- ║     already BOOLEAN, so the view was the inconsistent layer.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─── 1. CREATE ROLE for cdp_* (idempotent) ───────────────────────────────────
-- These roles are referenced thousands of times by GRANT statements in the v5.0
-- baseline but never CREATEd. PG aborts on missing-role GRANTs that aren't
-- inside DO $$ EXCEPTION blocks. CREATE ROLE IF NOT EXISTS is awkward in PG
-- (no native syntax pre-PG-16-style), so we use the catalog probe pattern.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cdp_Developer') THEN
        CREATE ROLE "cdp_Developer" NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cdp_Integration') THEN
        CREATE ROLE "cdp_Integration" NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cdp_UI') THEN
        CREATE ROLE "cdp_UI" NOLOGIN;
    END IF;
END
$$;

-- ─── 2. Schema-level USAGE + default privileges ──────────────────────────────
-- USAGE on schema lets the cdp_* roles see/qualify objects (without it,
-- even SELECT-granted tables are inaccessible). Idempotent — repeat GRANTs
-- are no-ops in PG.
GRANT USAGE ON SCHEMA ${flyway:defaultSchema} TO "cdp_Developer", "cdp_Integration", "cdp_UI";

-- Default privileges so EVERY future object created in __mj by the current role
-- (typically MJ_CodeGen / mj_admin / whoever runs migrations) is automatically
-- granted to cdp_*. This is the equivalent of SQL Server's
-- db_datareader/db_datawriter blanket coverage and makes subsequent
-- codegen-emitted views and sprocs accessible without per-object GRANTs.
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT SELECT ON TABLES    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT INSERT, UPDATE, DELETE ON TABLES TO "cdp_Developer", "cdp_Integration";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT USAGE, SELECT ON SEQUENCES TO "cdp_Developer", "cdp_Integration", "cdp_UI";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT EXECUTE ON FUNCTIONS TO "cdp_Developer", "cdp_Integration", "cdp_UI";

-- Backfill: bulk-grant on objects that already exist (idempotent — repeat
-- GRANTs are no-ops). Catches the 800+ cdp_* references in the baseline that
-- only fire on baseline-created objects, plus anything from later migrations
-- that didn't have an explicit GRANT.
GRANT SELECT ON ALL TABLES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";

-- ─── 3+4. Fix vwSQLColumnsAndEntityFields type contract ──────────────────────
-- The v5.0 PG baseline created this view with SQL-Server-BIT-style INTEGER 0/1
-- outputs for IsVirtual and AutoIncrement, but every consumer compares them
-- to BOOLEAN literals — both in CodeGenLib's PostgreSQLCodeGenProvider
-- (`sf."IsVirtual" = true`) and in the hand-ported
-- spUpdateExistingEntityFieldsFromSchema (`fromSQL."IsVirtual" = TRUE`,
-- `fromSQL."AutoIncrement" = TRUE`).
--
-- PostgreSQL refuses to implicit-cast INTEGER↔BOOLEAN, so every CodeGen Pass-2
-- invocation against PG fails with: `operator does not exist: integer = boolean`.
--
-- The underlying __mj."EntityField" columns are already BOOLEAN — only the
-- view was inconsistent. Returning native BOOLEAN aligns the view with the
-- table column types and makes every existing comparison + downstream INSERT
-- correct without further changes.

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
    -- BUG FIX: was `CASE ... THEN 1 ELSE 0 END` (INTEGER). Now native BOOLEAN
    -- to match __mj."EntityField"."AutoIncrement" (BOOLEAN).
    (COALESCE(bt_a.attidentity, '') IN ('a','d'))
                                               AS "AutoIncrement",
    a.attnum                                   AS column_id,
    -- BUG FIX: was `CASE WHEN bt_a.attnum IS NULL THEN 1 ELSE 0 END` (INTEGER).
    -- Now native BOOLEAN to match __mj."EntityField"."IsVirtual" (BOOLEAN).
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
INNER JOIN
    pg_catalog.pg_class bt_cls ON bt_cls.oid = e.object_id
LEFT JOIN
    pg_catalog.pg_attribute bt_a
        ON bt_a.attrelid = bt_cls.oid
        AND bt_a.attname = a.attname
        AND bt_a.attnum > 0
        AND NOT bt_a.attisdropped
LEFT JOIN
    pg_catalog.pg_attrdef ad
        ON ad.adrelid = bt_cls.oid
        AND ad.adnum = bt_a.attnum
LEFT JOIN
    ${flyway:defaultSchema}."EntityField" ef
        ON e."EntityID" = ef."EntityID"
        AND a.attname = ef."Name";

-- Re-grant on the recreated view (CREATE OR REPLACE preserves grants but be
-- explicit so this migration is also self-contained).
GRANT SELECT ON ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields"
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
