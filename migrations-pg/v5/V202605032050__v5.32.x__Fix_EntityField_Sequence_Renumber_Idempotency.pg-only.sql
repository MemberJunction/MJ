-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Fix EntityField Sequence renumber idempotency: 2-pass renumber inside    ║
-- ║ spUpdateExistingEntityFieldsFromSchema.                                 ║
-- ║                                                                          ║
-- ║ BUG: codegen Pass-2 calls spUpdateExistingEntityFieldsFromSchema, which ║
-- ║ issues a single UPDATE that renumbers Sequence values for many fields   ║
-- ║ within an entity. PG enforces non-deferrable UNIQUE constraints         ║
-- ║ row-by-row inside an UPDATE, so any transient duplicate during the      ║
-- ║ renumber (e.g. field A: 24→28 and field B: 28→33 — A's update sees      ║
-- ║ B's pre-update value 28) raises 23505 immediately, even though the      ║
-- ║ end-of-statement state would be unique. Result: every codegen run      ║
-- ║ after the first aborts with                                              ║
-- ║   "duplicate key value violates unique constraint                        ║
-- ║    UQ_EntityField_EntityID_Sequence"                                     ║
-- ║ and 32 CRUD routines downstream of "Updating existing entity fields    ║
-- ║ from schema" are silently skipped.                                      ║
-- ║                                                                          ║
-- ║ FIX: split the UPDATE into two passes via the staging-then-final         ║
-- ║ pattern:                                                                 ║
-- ║   Pass A: stage every field that's getting a Sequence change at a      ║
-- ║           negative offset (-1, -2, -3, …). Negatives never collide      ║
-- ║           with existing positive Sequence values OR with each other     ║
-- ║           (each row gets a unique negative).                            ║
-- ║   Pass B: write the final positive Sequence in a second UPDATE,         ║
-- ║           keyed off the entity-field ID. Now every "from" value is     ║
-- ║           negative so no collision with existing positives can occur.   ║
-- ║                                                                          ║
-- ║ Other column updates (Description, Type, Length, …) move with the      ║
-- ║ row in Pass A; Pass B only fixes Sequence.                              ║
-- ║                                                                          ║
-- ║ Did NOT pursue ALTER CONSTRAINT … DEFERRABLE because codegen-emitted    ║
-- ║ INSERT … ON CONFLICT (EntityID, Sequence) elsewhere uses this           ║
-- ║ constraint as an arbiter, and PG rejects deferrable arbiters with      ║
-- ║ "ON CONFLICT does not support deferrable unique constraints".           ║
-- ║                                                                          ║
-- ║ Idempotent: CREATE OR REPLACE FUNCTION; safe to re-apply.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─── Pre-fix: clean up rows with case-mismatched CodeType values ─────────────
-- The CK_EntityField_CodeType constraint was originally added with NOT VALID,
-- so existing rows with case-incorrect CodeType (e.g. 'Typescript' instead of
-- 'TypeScript') slipped through. Any UPDATE on those rows triggers
-- re-validation and fails the renumber. Normalize the casing here.
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
            -- vwSQLColumnsAndEntityFields now returns BOOLEAN for these
            -- (see V202605031857). The redundant `= TRUE` in the previous
            -- SP body has been removed.
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
            -- Globally unique within the SP run; we only need it transient.
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
    -- write the desired positive sequence. Each row's negative is unique,
    -- and no remaining unchanged row holds a target positive that's also
    -- a current target (since unchanged rows already had their final
    -- sequence and aren't in `staged`).
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

-- Re-grant — DROP FUNCTION dropped previous grants.
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
