-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PostgreSQL end-to-end unblock — consolidated migration                  ║
-- ║                                                                          ║
-- ║ Six fixes that together get a fresh PG mint through `mj migrate` and    ║
-- ║ `mj codegen --skipfiles` cleanly. Each section is independent and       ║
-- ║ self-contained; ordering matters only where noted.                      ║
-- ║                                                                          ║
-- ║   1. CREATE ROLE for cdp_Developer / cdp_Integration / cdp_UI          ║
-- ║      (the v5.0 baseline already has the equivalent at the top now via   ║
-- ║      a sibling commit; this re-asserts idempotently for safety).        ║
-- ║                                                                          ║
-- ║   2. GRANT USAGE on __mj + ALTER DEFAULT PRIVILEGES so subsequent       ║
-- ║      migrations' new objects auto-grant to cdp_*.                       ║
-- ║                                                                          ║
-- ║   3. Recreate vwSQLColumnsAndEntityFields with native BOOLEAN for       ║
-- ║      IsVirtual + AutoIncrement (was INTEGER 0/1). PostgreSQLCodeGen-    ║
-- ║      Provider compares to BOOLEAN literals and PG won't implicit-cast.  ║
-- ║                                                                          ║
-- ║   4. Recreate spUpdateExistingEntityFieldsFromSchema as a 2-pass        ║
-- ║      renumber so transient duplicate Sequence values during the bulk    ║
-- ║      UPDATE don't trip UQ_EntityField_EntityID_Sequence (PG enforces    ║
-- ║      non-deferrable UNIQUE row-by-row inside an UPDATE).                ║
-- ║                                                                          ║
-- ║   5. Pre-fix existing rows with case-mismatched CodeType values         ║
-- ║      ('Typescript' → 'TypeScript', etc.) that slipped through the      ║
-- ║      original NOT VALID CHECK constraint and trip                       ║
-- ║      CK_EntityField_CodeType on any UPDATE of those rows.               ║
-- ║                                                                          ║
-- ║   6. Recreate vwDatasetItems to use Entity.Name (not Entity.DisplayName)║
-- ║      for the "Entity" column. Consumers (e.g. TemplateEngineBase via   ║
-- ║      GetDatasetByName) use this column as an EntityName for downstream  ║
-- ║      EntityByName() lookups; with DisplayName they look up the unqualified║
-- ║      name "Templates" instead of the actual "MJ: Templates" and crash. ║
-- ║                                                                          ║
-- ║ Idempotent end-to-end: every CREATE/REPLACE, GRANT, and INSERT is safe ║
-- ║ to re-apply.                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─── 1. CREATE ROLE for cdp_* (idempotent) ───────────────────────────────────
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
GRANT USAGE ON SCHEMA ${flyway:defaultSchema} TO "cdp_Developer", "cdp_Integration", "cdp_UI";

ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT SELECT ON TABLES    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT INSERT, UPDATE, DELETE ON TABLES TO "cdp_Developer", "cdp_Integration";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT USAGE, SELECT ON SEQUENCES TO "cdp_Developer", "cdp_Integration", "cdp_UI";
ALTER DEFAULT PRIVILEGES IN SCHEMA ${flyway:defaultSchema}
    GRANT EXECUTE ON FUNCTIONS TO "cdp_Developer", "cdp_Integration", "cdp_UI";

GRANT SELECT ON ALL TABLES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${flyway:defaultSchema}
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";

-- ─── 3. Fix vwSQLColumnsAndEntityFields type contract ────────────────────────
-- PG's CREATE OR REPLACE VIEW cannot change a column's data type, so we
-- DROP and CREATE. Verified at write time that no other view depends on
-- vwSQLColumnsAndEntityFields, so CASCADE isn't needed.
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

GRANT SELECT ON ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields"
    TO "cdp_Developer", "cdp_Integration", "cdp_UI";

-- ─── 4. Pre-fix case-mismatched CodeType values (must precede the SP) ────────
-- The CK_EntityField_CodeType constraint was originally added with NOT VALID,
-- so existing rows with case-incorrect CodeType slipped through. Any UPDATE
-- on those rows triggers re-validation and fails the SP's renumber UPDATE.
-- Normalize the casing here so the SP can run cleanly.
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'TypeScript'
   WHERE "CodeType" ILIKE 'typescript' AND "CodeType" <> 'TypeScript';
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'JavaScript'
   WHERE "CodeType" ILIKE 'javascript' AND "CodeType" <> 'JavaScript';
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'HTML'
   WHERE "CodeType" ILIKE 'html' AND "CodeType" <> 'HTML';
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'CSS'
   WHERE "CodeType" ILIKE 'css' AND "CodeType" <> 'CSS';
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'SQL'
   WHERE "CodeType" ILIKE 'sql' AND "CodeType" <> 'SQL';
UPDATE ${flyway:defaultSchema}."EntityField"
   SET "CodeType" = 'Other'
   WHERE "CodeType" ILIKE 'other' AND "CodeType" <> 'Other';

-- ─── 5. Re-create spUpdateExistingEntityFieldsFromSchema as 2-pass renumber ──
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text);

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(
    p_excludedschemanames text,
    p_entityids text DEFAULT NULL
)
RETURNS TABLE(
    "EntityID" uuid,
    "EntityName" character varying,
    "EntityFieldID" uuid,
    "EntityFieldName" character varying,
    "AutoUpdateDescription" boolean,
    "ExistingDescription" text,
    "SQLDescription" text,
    "Type" character varying,
    "Length" integer,
    "Precision" integer,
    "Scale" integer,
    "AllowsNull" boolean,
    "DefaultValue" text,
    "AutoIncrement" boolean,
    "IsVirtual" boolean,
    "Sequence" integer,
    "RelatedEntityID" uuid,
    "RelatedEntityFieldName" character varying,
    "IsPrimaryKey" boolean,
    "IsUnique" boolean
)
LANGUAGE plpgsql
AS $func$
DECLARE
    v_scoped_ids UUID[] := NULL;
BEGIN
    -- Same scope-list materialization as spDeleteUnneededEntityFields.
    IF p_entityids IS NOT NULL AND length(BTRIM(p_entityids)) > 0 THEN
        SELECT array_agg(DISTINCT s::uuid) INTO v_scoped_ids
        FROM (
            SELECT BTRIM(unnest(string_to_array(p_entityids, ','))) AS s
        ) raw
        WHERE raw.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        IF v_scoped_ids IS NULL OR array_length(v_scoped_ids, 1) IS NULL THEN
            v_scoped_ids := NULL;
        END IF;
    END IF;

    -- Self-heal: any rows left with negative Sequence (from a prior interrupted
    -- run, or from row-by-row code paths in CodeGen that crashed mid-update)
    -- would otherwise collide with this run's staging negatives in Pass A.
    -- Reseat them at the tail of their entity's existing positive range so the
    -- 2-pass renumber below has a clean negative space to work in. Rerunable.
    WITH stale AS (
        SELECT ef."ID",
               ef."EntityID",
               ROW_NUMBER() OVER (
                   PARTITION BY ef."EntityID"
                   ORDER BY abs(ef."Sequence") DESC, ef."ID"
               )
                 + COALESCE((
                     SELECT max(ef2."Sequence")
                     FROM ${flyway:defaultSchema}."EntityField" ef2
                     WHERE ef2."EntityID" = ef."EntityID"
                       AND ef2."Sequence" >= 0
                 ), 0) AS new_seq
        FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."Sequence" < 0
    )
    UPDATE ${flyway:defaultSchema}."EntityField" target
    SET "Sequence" = stale.new_seq
    FROM stale
    WHERE target."ID" = stale."ID";

    RETURN QUERY
    WITH excluded AS (
        SELECT TRIM(s) AS "SchemaName"
        FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
        WHERE TRIM(s) <> ''
    ),
    filtered AS (
        SELECT
            e."ID"                                     AS "EntityID",
            e."Name"::VARCHAR                          AS "EntityName",
            ef."ID"                                    AS "EntityFieldID",
            ef."Name"::VARCHAR                         AS "EntityFieldName",
            ef."AutoUpdateDescription"                 AS "AutoUpdateDescription",
            ef."Description"::TEXT                     AS "ExistingDescription",
            fromSQL."Description"::TEXT                AS "SQLDescription",
            fromSQL."Type"::VARCHAR                    AS "Type",
            fromSQL."Length"::INTEGER                  AS "Length",
            fromSQL."Precision"::INTEGER               AS "Precision",
            fromSQL."Scale"::INTEGER                   AS "Scale",
            fromSQL."AllowsNull"                       AS "AllowsNull",
            fromSQL."DefaultValue"::TEXT               AS "DefaultValue",
            -- Section 3 above gives us BOOLEAN now; the redundant `= TRUE` in
            -- the previous SP body has been removed.
            fromSQL."AutoIncrement"                    AS "AutoIncrement",
            fromSQL."IsVirtual"                        AS "IsVirtual",
            fromSQL."Sequence"::INTEGER                AS "Sequence",
            re."ID"                                    AS "RelatedEntityID",
            fk."referenced_column"::VARCHAR            AS "RelatedEntityFieldName",
            (pk."ColumnName" IS NOT NULL)              AS "IsPrimaryKey",
            CASE
                WHEN pk."ColumnName" IS NOT NULL THEN true
                WHEN uk."ColumnName" IS NOT NULL THEN true
                ELSE false
            END                                        AS "IsUnique",
            -- Per-row index used for the staging negative offset in Pass A.
            ROW_NUMBER() OVER ()                       AS "StageRow"
        FROM ${flyway:defaultSchema}."EntityField" ef
        INNER JOIN ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" fromSQL
              ON ef."EntityID" = fromSQL."EntityID"
             AND ef."Name"     = fromSQL."FieldName"
        INNER JOIN ${flyway:defaultSchema}."Entity" e
              ON ef."EntityID" = e."ID"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwForeignKeys" fk
              ON ef."Name"      = fk."column"
             AND e."BaseTable"  = fk."table"
             AND e."SchemaName" = fk."schema_name"
        LEFT OUTER JOIN ${flyway:defaultSchema}."Entity" re
              ON re."BaseTable"  = fk."referenced_table"
             AND re."SchemaName" = fk."referenced_schema"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwTablePrimaryKeys" pk
              ON e."BaseTable"  = pk."TableName"
             AND ef."Name"      = pk."ColumnName"
             AND e."SchemaName" = pk."SchemaName"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwTableUniqueKeys" uk
              ON e."BaseTable"  = uk."TableName"
             AND ef."Name"      = uk."ColumnName"
             AND e."SchemaName" = uk."SchemaName"
        LEFT OUTER JOIN excluded x ON e."SchemaName" = x."SchemaName"
        WHERE
            e."VirtualEntity" = false
            AND x."SchemaName" IS NULL
            AND ef."ID" IS NOT NULL
            AND (v_scoped_ids IS NULL OR e."ID" = ANY(v_scoped_ids))
            AND (
                   COALESCE(BTRIM(ef."Description"), '')
                        <> COALESCE(
                               BTRIM(
                                   CASE WHEN ef."AutoUpdateDescription" = true THEN fromSQL."Description" ELSE ef."Description" END
                               ), ''
                           )
                OR ef."Type"       <> fromSQL."Type"
                OR COALESCE(ef."Length",     -1) <> COALESCE(fromSQL."Length",     -1)
                OR COALESCE(ef."Precision",  -1) <> COALESCE(fromSQL."Precision",  -1)
                OR COALESCE(ef."Scale",      -1) <> COALESCE(fromSQL."Scale",      -1)
                OR ef."AllowsNull" <> fromSQL."AllowsNull"
                OR COALESCE(BTRIM(ef."DefaultValue"), '') <> COALESCE(BTRIM(fromSQL."DefaultValue"), '')
                OR ef."AutoIncrement" <> fromSQL."AutoIncrement"
                OR ef."IsVirtual"     <> fromSQL."IsVirtual"
                OR ef."Sequence"      <> fromSQL."Sequence"
                OR COALESCE(ef."RelatedEntityID", '00000000-0000-0000-0000-000000000000'::uuid)
                        <> COALESCE(re."ID", '00000000-0000-0000-0000-000000000000'::uuid)
                OR COALESCE(BTRIM(ef."RelatedEntityFieldName"), '') <> COALESCE(BTRIM(fk."referenced_column"), '')
                OR ef."IsPrimaryKey" <> (pk."ColumnName" IS NOT NULL)
                OR ef."IsUnique" <> (
                       CASE
                           WHEN pk."ColumnName" IS NOT NULL THEN true
                           WHEN uk."ColumnName" IS NOT NULL THEN true
                           ELSE false
                       END
                   )
            )
    ),
    -- Pass A: stage all changing rows. Sequence is set to a unique negative
    -- value so we can never collide with the (positive) existing Sequence
    -- values OR with each other during this UPDATE. Every other column gets
    -- its final value here.
    staged AS (
        UPDATE ${flyway:defaultSchema}."EntityField" ef
        SET
            "Description" = CASE WHEN fr."AutoUpdateDescription" = true THEN fr."SQLDescription" ELSE ef."Description" END,
            "Type"          = fr."Type",
            "Length"        = fr."Length",
            "Precision"     = fr."Precision",
            "Scale"         = fr."Scale",
            "AllowsNull"    = fr."AllowsNull",
            "DefaultValue"  = fr."DefaultValue",
            "AutoIncrement" = fr."AutoIncrement",
            "IsVirtual"     = fr."IsVirtual",
            "Sequence"      = -fr."StageRow"::INTEGER,   -- transient negative
            "RelatedEntityID" = CASE
                WHEN ef."AutoUpdateRelatedEntityInfo" = true AND ef."IsSoftForeignKey" = false
                    THEN fr."RelatedEntityID"
                ELSE ef."RelatedEntityID"
            END,
            "RelatedEntityFieldName" = CASE
                WHEN ef."AutoUpdateRelatedEntityInfo" = true AND ef."IsSoftForeignKey" = false
                    THEN fr."RelatedEntityFieldName"
                ELSE ef."RelatedEntityFieldName"
            END,
            "IsPrimaryKey"  = fr."IsPrimaryKey",
            "IsUnique"      = fr."IsUnique"
        FROM filtered fr
        WHERE ef."ID" = fr."EntityFieldID"
        RETURNING
            ef."ID" AS "EntityFieldID",
            fr."EntityID", fr."EntityName", fr."EntityFieldName",
            fr."AutoUpdateDescription", fr."ExistingDescription",
            fr."SQLDescription", fr."Type", fr."Length", fr."Precision",
            fr."Scale", fr."AllowsNull",
            fr."DefaultValue", fr."AutoIncrement", fr."IsVirtual",
            fr."Sequence" AS "FinalSequence",   -- the desired positive value
            fr."RelatedEntityID", fr."RelatedEntityFieldName",
            fr."IsPrimaryKey", fr."IsUnique"
    ),
    -- Pass B: now that all changing rows have unique negative sequences,
    -- write the desired positive sequence. No collision possible.
    finalized AS (
        UPDATE ${flyway:defaultSchema}."EntityField" ef
        SET "Sequence" = s."FinalSequence"
        FROM staged s
        WHERE ef."ID" = s."EntityFieldID"
        RETURNING s.*
    )
    SELECT
        f."EntityID", f."EntityName", f."EntityFieldID", f."EntityFieldName",
        f."AutoUpdateDescription", f."ExistingDescription", f."SQLDescription",
        f."Type", f."Length", f."Precision", f."Scale", f."AllowsNull",
        f."DefaultValue", f."AutoIncrement", f."IsVirtual",
        f."FinalSequence" AS "Sequence",
        f."RelatedEntityID", f."RelatedEntityFieldName",
        f."IsPrimaryKey", f."IsUnique"
    FROM finalized f;
END;
$func$;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;

-- ─── 6. Fix vwDatasetItems."Entity" column to use Name, not DisplayName ──────
DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwDatasetItems" CASCADE;

CREATE VIEW ${flyway:defaultSchema}."vwDatasetItems" AS
SELECT d."ID",
    d."Code",
    d."DatasetID",
    d."Sequence",
    d."EntityID",
    d."WhereClause",
    d."DateFieldToCheck",
    d."Description",
    d."__mj_CreatedAt",
    d."__mj_UpdatedAt",
    d."Columns",
    mjentity_entityid."Name" AS "Entity",
    mjdataset_datasetid."Name" AS "Dataset"
FROM ${flyway:defaultSchema}."DatasetItem" d
LEFT JOIN ${flyway:defaultSchema}."Entity" mjentity_entityid ON d."EntityID" = mjentity_entityid."ID"
LEFT JOIN ${flyway:defaultSchema}."Dataset" mjdataset_datasetid ON d."DatasetID" = mjdataset_datasetid."ID";

GRANT SELECT ON ${flyway:defaultSchema}."vwDatasetItems" TO "cdp_Developer", "cdp_Integration", "cdp_UI";
