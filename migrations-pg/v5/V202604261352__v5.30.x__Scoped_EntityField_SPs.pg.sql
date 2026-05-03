-- Scoped Entity Field Stored Procedures (Phase A of PR #2342) — PG hand-port
--
-- HAND-PORT NOTE: The T-SQL source for this migration is composed entirely of
-- CodeGen-bootstrap stored procedures using SQL Server-specific constructs
-- (temp tables, table variables, OBJECT_ID checks, STRING_SPLIT, TRY_CONVERT)
-- that the deterministic SQL→PG converter classifies as SKIP_SQLSERVER.
-- This file is the human-authored PG equivalent of the same logical change:
-- adding an optional `p_entityids` parameter to the two CodeGen-bootstrap
-- functions so that CodeGen Pass-2 can scope the EntityField field-management
-- scan to entities that actually changed.
--
-- The body for each function is a delta from the existing PG implementation
-- (which lives in the v5.0 baseline + later regenerations) — only the WHERE
-- clauses gain the entity-scope filter; everything else is preserved verbatim
-- so the behavioral surface stays identical when p_entityids is NULL/empty.

-- ─── 1. spDeleteUnneededEntityFields ───────────────────────────────────────
-- Drop the existing 1-parameter signature; PG requires DROP for parameter
-- list changes (CREATE OR REPLACE only allows body changes).
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(text);

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(
    p_excludedschemanames text,
    p_entityids text DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."EntityField"
LANGUAGE plpgsql
AS $func$
DECLARE
    v_deleted_entity_ids UUID[];
    v_scoped_ids UUID[] := NULL;
BEGIN
    -- Materialize the optional entity-scope list. NULL/empty → unscoped (matches
    -- T-SQL @IsScoped=0 path). Bad UUIDs are silently skipped (TRY_CONVERT semantics).
    IF p_entityids IS NOT NULL AND length(BTRIM(p_entityids)) > 0 THEN
        SELECT array_agg(DISTINCT s::uuid) INTO v_scoped_ids
        FROM (
            SELECT BTRIM(unnest(string_to_array(p_entityids, ','))) AS s
        ) raw
        WHERE raw.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        IF v_scoped_ids IS NULL OR array_length(v_scoped_ids, 1) IS NULL THEN
            v_scoped_ids := NULL; -- normalize empty array → NULL for IS NULL short-circuit
        END IF;
    END IF;

    DROP TABLE IF EXISTS tmp_deleted_fields;
    CREATE TEMP TABLE tmp_deleted_fields ON COMMIT DROP AS
    SELECT ef.*
    FROM ${flyway:defaultSchema}."vwEntityFields" ef
    INNER JOIN ${flyway:defaultSchema}."vwEntities" e
            ON ef."EntityID" = e."ID"
    WHERE
        e."VirtualEntity" = false
        AND (
            p_ExcludedSchemaNames IS NULL
            OR p_ExcludedSchemaNames = ''
            OR e."SchemaName" NOT IN (
                SELECT TRIM(s)
                FROM unnest(string_to_array(p_ExcludedSchemaNames, ',')) AS s
                WHERE TRIM(s) <> ''
            )
        )
        -- Entity-scope filter: NULL/empty → unscoped; otherwise restrict to provided UUIDs.
        AND (v_scoped_ids IS NULL OR e."ID" = ANY(v_scoped_ids))
        AND NOT EXISTS (
            SELECT 1
            FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" actual
            WHERE actual."EntityID"        = ef."EntityID"
              AND actual."EntityFieldName" = ef."Name"
        );

    -- 1) Touch the Entity rows that will have fields removed (cache invalidation).
    SELECT ARRAY(SELECT DISTINCT "EntityID" FROM tmp_deleted_fields)
      INTO v_deleted_entity_ids;

    IF array_length(v_deleted_entity_ids, 1) IS NOT NULL THEN
        UPDATE ${flyway:defaultSchema}."Entity"
        SET "__mj_UpdatedAt" = NOW()
        WHERE "ID" = ANY(v_deleted_entity_ids);
    END IF;

    -- 2) Remove dependent EntityFieldValue rows
    DELETE FROM ${flyway:defaultSchema}."EntityFieldValue"
    WHERE "EntityFieldID" IN (SELECT "ID" FROM tmp_deleted_fields);

    -- 3) Remove the EntityField rows themselves and return them
    RETURN QUERY
    WITH removed AS (
        DELETE FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."ID" IN (SELECT "ID" FROM tmp_deleted_fields)
        RETURNING ef.*
    )
    SELECT * FROM removed;
END;
$func$;

-- Re-grant EXECUTE for the recreated signature (best-effort; ignore role-missing errors).
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;


-- ─── 2. spUpdateExistingEntityFieldsFromSchema ─────────────────────────────
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text);

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
            (fromSQL."AutoIncrement" = TRUE)              AS "AutoIncrement",
            (fromSQL."IsVirtual" = TRUE)                  AS "IsVirtual",
            fromSQL."Sequence"::INTEGER                AS "Sequence",
            re."ID"                                    AS "RelatedEntityID",
            fk."referenced_column"::VARCHAR            AS "RelatedEntityFieldName",
            (pk."ColumnName" IS NOT NULL)              AS "IsPrimaryKey",
            CASE
                WHEN pk."ColumnName" IS NOT NULL THEN true
                WHEN uk."ColumnName" IS NOT NULL THEN true
                ELSE false
            END                                        AS "IsUnique"
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
            -- Entity-scope filter: NULL/empty → unscoped; otherwise restrict to provided UUIDs.
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
                OR ef."AutoIncrement" <> (fromSQL."AutoIncrement" = TRUE)
                OR ef."IsVirtual"     <> (fromSQL."IsVirtual" = TRUE)
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
    applied AS (
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
            "Sequence"      = fr."Sequence",
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
            "IsPrimaryKey" = CASE
                WHEN ef."IsSoftPrimaryKey" = false THEN fr."IsPrimaryKey"
                ELSE ef."IsPrimaryKey"
            END,
            "IsUnique"        = fr."IsUnique",
            "__mj_UpdatedAt"  = NOW()
        FROM filtered fr
        WHERE ef."ID" = fr."EntityFieldID"
        RETURNING ef."ID" AS "ID"
    )
    SELECT
        fr."EntityID", fr."EntityName", fr."EntityFieldID", fr."EntityFieldName",
        fr."AutoUpdateDescription", fr."ExistingDescription", fr."SQLDescription",
        fr."Type", fr."Length", fr."Precision", fr."Scale", fr."AllowsNull",
        fr."DefaultValue", fr."AutoIncrement", fr."IsVirtual", fr."Sequence",
        fr."RelatedEntityID", fr."RelatedEntityFieldName", fr."IsPrimaryKey", fr."IsUnique"
    FROM filtered fr
    WHERE fr."EntityFieldID" IN (SELECT a."ID" FROM applied a);
END;
$func$;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
