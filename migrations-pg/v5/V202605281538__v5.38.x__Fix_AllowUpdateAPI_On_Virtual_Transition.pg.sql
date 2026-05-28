-- ============================================================================
-- Fix AllowUpdateAPI when IsVirtual transitions 0 → 1 (PostgreSQL)
-- ============================================================================
--
-- When a column is dropped from a table but the entity's base view still
-- exposes it (e.g. via a JOIN), CodeGen correctly flips IsVirtual from 0 to 1
-- via spUpdateExistingEntityFieldsFromSchema. However, the SP never touches
-- AllowUpdateAPI, leaving it at true (writable). Virtual view-only fields
-- cannot be written to and should have AllowUpdateAPI = false.
--
-- This migration updates spUpdateExistingEntityFieldsFromSchema to set
-- AllowUpdateAPI = false whenever the field transitions to virtual. IS-A
-- parent fields are unaffected because they are always created as virtual
-- (they never undergo a false→true transition in this SP).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. Recreate spUpdateExistingEntityFieldsFromSchema with the fix
-- ──────────────────────────────────────────────────────────────────────
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

    -- Materialize the filtered set into a temp table. Two reasons we can't
    -- do this as a chained WITH ... data-modifying CTE on PG:
    --   1. CTEs in a single WITH share one snapshot AND forbid updating the
    --      same row twice, so Pass A's stage-to-negative + Pass B's write-
    --      back-to-final collapses Pass B to a silent no-op.
    --   2. The unique index on (EntityID, Sequence) is non-deferrable and
    --      enforced per-row mid-statement. If a filtered row's *final*
    --      Sequence collides with an *unfiltered* row in the same entity
    --      that's stuck on the value the filtered row currently occupies,
    --      a single UPDATE can't reorder them — we must transiently move
    --      every row in an "affected" entity into negative space and then
    --      write the SQL-derived sequences back.
    -- Splitting into separate top-level statements + a "resequence everyone
    -- in the entity" pass gives us correct ordering without constraint
    -- collisions and matches the SS semantics functionally.
    CREATE TEMP TABLE "_efs_filtered" ON COMMIT DROP AS
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
            -- Track whether the field is transitioning to virtual so Pass B
            -- can clear AllowUpdateAPI.
            (ef."IsVirtual" = false AND fromSQL."IsVirtual" = true)
                                                       AS "TransitioningToVirtual",
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
        LEFT OUTER JOIN (
            SELECT TRIM(s) AS "SchemaName"
            FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
            WHERE TRIM(s) <> ''
        ) x ON e."SchemaName" = x."SchemaName"
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
                -- Detect AllowUpdateAPI that needs clearing on virtual transition
                OR (ef."AllowUpdateAPI" = true AND fromSQL."IsVirtual" = true AND ef."IsVirtual" = false)
            );

    -- Stage *every* row in any "affected" entity (any entity that has at
    -- least one row in _efs_filtered) into negative-sequence space. We do
    -- this with row_number() so each transient sequence is unique within
    -- an entity, dodging the (EntityID, Sequence) unique index. This is
    -- the only way to guarantee Pass C below can land filtered rows on
    -- their final positions even when those positions are currently held
    -- by *unfiltered* rows in the same entity.
    CREATE TEMP TABLE "_efs_stage_seq" ON COMMIT DROP AS
        SELECT
            ef."ID"                                                  AS "EntityFieldID",
            ef."EntityID"                                            AS "EntityID",
            -ROW_NUMBER() OVER (PARTITION BY ef."EntityID"
                                ORDER BY ef."ID")::INTEGER           AS "StagedNegativeSequence"
        FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."EntityID" IN (SELECT DISTINCT f2."EntityID" FROM "_efs_filtered" f2);

    -- Pass A: stage every row of every affected entity into a unique
    -- negative sequence. Standalone statement — its own snapshot. The
    -- unique-per-entity negative values mean PG's per-row index check
    -- never sees a duplicate during this UPDATE.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = s."StagedNegativeSequence"
    FROM "_efs_stage_seq" s
    WHERE ef."ID" = s."EntityFieldID";

    -- Pass B: write the full payload (Type/AllowsNull/DefaultValue/etc.)
    -- ONLY for rows that actually changed. Sequence stays negative for
    -- now — Pass C is responsible for putting every affected row back
    -- on its final positive Sequence in one safe statement.
    -- When a field transitions to virtual, also clear AllowUpdateAPI.
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
        "IsUnique"      = fr."IsUnique",
        -- Clear AllowUpdateAPI when field transitions to virtual.
        -- IS-A parent fields are unaffected: they are created as virtual
        -- and never undergo a false→true transition in this SP.
        "AllowUpdateAPI" = CASE
            WHEN fr."TransitioningToVirtual" = true THEN false
            ELSE ef."AllowUpdateAPI"
        END
    FROM "_efs_filtered" fr
    WHERE ef."ID" = fr."EntityFieldID";

    -- Pass C: resequence every row of every affected entity that has a
    -- corresponding row in vwSQLColumnsAndEntityFields. Standalone
    -- statement — gets a fresh snapshot where Pass A's negatives are
    -- visible, so we never collide with another row's old positive
    -- sequence.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = fromSQL."Sequence"::INTEGER
    FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" fromSQL
    WHERE ef."EntityID" = fromSQL."EntityID"
      AND ef."Name"     = fromSQL."FieldName"
      AND ef."EntityID" IN (SELECT DISTINCT f2."EntityID" FROM "_efs_filtered" f2);

    -- Pass D: handle any rows in affected entities that are NOT in
    -- vwSQLColumnsAndEntityFields (typically virtual relationship fields
    -- like "Entity"/"User" lookups that have no SQL counterpart). Pass A
    -- left them at a transient negative; Pass C couldn't touch them.
    -- Place them after the last SQL-derived sequence in the same entity,
    -- preserving their existing relative order via row_number(). Without
    -- this pass, those rows are stuck on negatives and the next sproc
    -- call diff-detects them again forever.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = leftover."NewSequence"::INTEGER
    FROM (
        SELECT
            stuck."ID" AS "EntityFieldID",
            COALESCE(maxseq."MaxSeq", 0)
                + ROW_NUMBER() OVER (PARTITION BY stuck."EntityID"
                                     ORDER BY stuck."Sequence" DESC, stuck."ID")
                AS "NewSequence"
        FROM ${flyway:defaultSchema}."EntityField" stuck
        LEFT JOIN (
            SELECT vw."EntityID", MAX(vw."Sequence") AS "MaxSeq"
            FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" vw
            GROUP BY vw."EntityID"
        ) maxseq
            ON maxseq."EntityID" = stuck."EntityID"
        WHERE stuck."Sequence" < 0
          AND stuck."EntityID" IN (SELECT DISTINCT f3."EntityID" FROM "_efs_filtered" f3)
    ) leftover
    WHERE ef."ID" = leftover."EntityFieldID";

    -- Return the staged set so callers can discover which rows changed.
    RETURN QUERY
    SELECT
        f."EntityID", f."EntityName", f."EntityFieldID", f."EntityFieldName",
        f."AutoUpdateDescription", f."ExistingDescription", f."SQLDescription",
        f."Type", f."Length", f."Precision", f."Scale", f."AllowsNull",
        f."DefaultValue", f."AutoIncrement", f."IsVirtual",
        f."Sequence",
        f."RelatedEntityID", f."RelatedEntityFieldName",
        f."IsPrimaryKey", f."IsUnique"
    FROM "_efs_filtered" f;

    DROP TABLE "_efs_filtered";
    DROP TABLE "_efs_stage_seq";
END;
$func$;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
