-- =============================================================================
-- V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The T-SQL -> PG baseline converter could not translate several of the
--   CodeGen-metadata-management stored procedures in the SQL Server baseline
--   (B202602151200__v5.0__Baseline.sql) because they rely on heavy T-SQL
--   features: sys.* catalog joins, STRING_SPLIT, IIF, table variables,
--   tempdb temp tables, and SELECT...INTO.  As a result, the PG baseline
--   (B202602151200__v5.0__Baseline.pg.sql) omits or stubs them, which breaks
--   fresh PG installs the moment MJ CodeGen runs its metadata-sync phase.
--
--   This pg-only migration ports the following 7 sprocs to plpgsql functions,
--   using pg_catalog / information_schema equivalents and the already-ported
--   helper views in __mj ("vwSQLSchemas", "vwSQLTablesAndEntities",
--   "vwSQLColumnsAndEntityFields", "vwForeignKeys", "vwTablePrimaryKeys",
--   "vwTableUniqueKeys", "vwEntities", "vwEntityFields"):
--
--     1. spGetPrimaryKeyForTable
--     2. spSetDefaultColumnWidthWhereNeeded
--     3. spUpdateEntityFieldRelatedEntityNameFieldMap
--          (fixes arity bug in existing PG baseline, which only had 1 param)
--     4. spUpdateExistingEntitiesFromSchema
--     5. spUpdateExistingEntityFieldsFromSchema
--     6. spUpdateSchemaInfoFromDatabase
--     7. spDeleteUnneededEntityFields
--
--   All functions live in __mj (the ${flyway:defaultSchema} placeholder is
--   used for consistency with sibling migrations).  They are functions, not
--   procedures, so CodeGen's existing "SELECT * FROM __mj.spX(...)"
--   invocation pattern works uniformly.
--
--   PARAMETER NAMING CONVENTION:
--     p_<OriginalParamName> in the declaration.  PostgreSQL folds unquoted
--     identifiers to lowercase at execution time, which is fine for these
--     system sprocs -- callers pass positional args.
-- =============================================================================


-- =============================================================================
-- 1. spGetPrimaryKeyForTable
--    Returns the primary-key column(s) for a given (schema, table).
--    Replaces sys.tables/sys.indexes/sys.index_columns/sys.columns/sys.types
--    with pg_catalog equivalents.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spGetPrimaryKeyForTable"(VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spGetPrimaryKeyForTable"(
    p_TableName  VARCHAR(255),
    p_SchemaName VARCHAR(255)
)
RETURNS TABLE(
    "SchemaName"  VARCHAR,
    "TableName"   VARCHAR,
    "ColumnName"  VARCHAR,
    "DataType"    VARCHAR,
    "max_length"  INTEGER,
    "precision"   INTEGER,
    "scale"       INTEGER,
    "is_nullable" BOOLEAN
) AS
$$
BEGIN
    RETURN QUERY
    SELECT
        n.nspname::VARCHAR                         AS "SchemaName",
        c.relname::VARCHAR                         AS "TableName",
        a.attname::VARCHAR                         AS "ColumnName",
        COALESCE(base_t.typname, t.typname)::VARCHAR
                                                   AS "DataType",
        CASE
            WHEN t.typname IN ('varchar', 'bpchar', 'char')
                THEN CASE WHEN a.atttypmod = -1 THEN -1 ELSE a.atttypmod - 4 END
            WHEN t.typname = 'text' THEN -1
            ELSE a.attlen::integer
        END                                        AS "max_length",
        CASE
            WHEN t.typname = 'numeric' AND a.atttypmod <> -1
                THEN ((a.atttypmod - 4) >> 16) & 65535
            ELSE 0
        END                                        AS "precision",
        CASE
            WHEN t.typname = 'numeric' AND a.atttypmod <> -1
                THEN (a.atttypmod - 4) & 65535
            ELSE 0
        END                                        AS "scale",
        (NOT a.attnotnull)                         AS "is_nullable"
    FROM
        pg_catalog.pg_index     i
    INNER JOIN pg_catalog.pg_class     c  ON c.oid = i.indrelid
    INNER JOIN pg_catalog.pg_namespace n  ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) AS cols(col_num)
    INNER JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c.oid AND a.attnum = cols.col_num
    INNER JOIN pg_catalog.pg_type      t  ON t.oid = a.atttypid
    LEFT  JOIN pg_catalog.pg_type      base_t
        ON base_t.oid = t.typbasetype AND t.typtype = 'd'
    WHERE
        i.indisprimary = true
        AND c.relname = p_TableName
        AND n.nspname = p_SchemaName
        AND a.attnum > 0
        AND NOT a.attisdropped;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 2. spSetDefaultColumnWidthWhereNeeded
--    Populates DefaultColumnWidth where it is NULL, using a per-type heuristic,
--    skipping entities in excluded schemas.  STRING_SPLIT -> string_to_array +
--    unnest.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spSetDefaultColumnWidthWhereNeeded"(TEXT);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spSetDefaultColumnWidthWhereNeeded"(
    p_ExcludedSchemaNames TEXT
)
RETURNS VOID AS
$$
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET
        "DefaultColumnWidth" =
            CASE
                WHEN ef."Type" = 'int'            THEN 50
                WHEN ef."Type" = 'datetimeoffset' THEN 100
                WHEN ef."Type" = 'money'          THEN 100
                WHEN ef."Type" = 'nchar'          THEN 75
                ELSE 150
            END,
        "__mj_UpdatedAt" = NOW()
    FROM
        ${flyway:defaultSchema}."Entity" e
    WHERE
        ef."EntityID" = e."ID"
        AND ef."DefaultColumnWidth" IS NULL
        AND (
            p_ExcludedSchemaNames IS NULL
            OR p_ExcludedSchemaNames = ''
            OR e."SchemaName" NOT IN (
                SELECT TRIM(s)
                FROM unnest(string_to_array(p_ExcludedSchemaNames, ',')) AS s
                WHERE TRIM(s) <> ''
            )
        );
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 3. spUpdateEntityFieldRelatedEntityNameFieldMap
--    FIX: the existing PG baseline defined this with only 1 parameter
--    (p_RelatedEntityNameFieldMap) and referenced an undeclared
--    p_EntityFieldID, so any call failed.  Drop the broken version and
--    re-create with the correct 2-parameter signature from the T-SQL source.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateEntityFieldRelatedEntityNameFieldMap"(VARCHAR);
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateEntityFieldRelatedEntityNameFieldMap"(UUID, VARCHAR);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_EntityFieldID            UUID,
    p_RelatedEntityNameFieldMap VARCHAR(50)
)
RETURNS VOID AS
$$
BEGIN
    UPDATE ${flyway:defaultSchema}."EntityField"
    SET
        "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap
    WHERE
        "ID" = p_EntityFieldID;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 4. spUpdateExistingEntitiesFromSchema
--    For rows in __mj."Entity" whose AutoUpdateDescription=true and whose
--    current Description differs from the live SQL-object description,
--    refresh Description from vwSQLTablesAndEntities; returns the touched
--    rows as a result set.
--
--    T-SQL table variable -> CTE.  IIF -> CASE.  NVARCHAR(MAX) -> TEXT.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntitiesFromSchema"(TEXT);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntitiesFromSchema"(
    p_ExcludedSchemaNames TEXT
)
RETURNS TABLE(
    "ID"                 UUID,
    "Name"               VARCHAR,
    "CurrentDescription" TEXT,
    "NewDescription"     TEXT,
    "EntityDescription"  TEXT,
    "SchemaName"         TEXT
) AS
$$
BEGIN
    RETURN QUERY
    WITH excluded AS (
        SELECT TRIM(s) AS "SchemaName"
        FROM unnest(
            string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')
        ) AS s
        WHERE TRIM(s) <> ''
    ),
    filtered AS (
        SELECT
            e."ID"                                     AS "ID",
            e."Name"::VARCHAR                          AS "Name",
            e."Description"::TEXT                      AS "CurrentDescription",
            CASE
                WHEN e."AutoUpdateDescription" = true
                    THEN fromSQL."EntityDescription"::TEXT
                ELSE e."Description"::TEXT
            END                                        AS "NewDescription",
            fromSQL."EntityDescription"::TEXT          AS "EntityDescription",
            fromSQL."SchemaName"::TEXT                 AS "SchemaName"
        FROM
            ${flyway:defaultSchema}."Entity" e
        INNER JOIN
            ${flyway:defaultSchema}."vwSQLTablesAndEntities" fromSQL
              ON e."ID" = fromSQL."EntityID"
        LEFT OUTER JOIN
            excluded x ON fromSQL."SchemaName" = x."SchemaName"
        WHERE
            e."VirtualEntity" = false
            AND x."SchemaName" IS NULL
            AND COALESCE(
                    CASE
                        WHEN e."AutoUpdateDescription" = true
                            THEN fromSQL."EntityDescription"
                        ELSE e."Description"
                    END,
                    ''
                ) <> COALESCE(e."Description", '')
    ),
    updated AS (
        UPDATE ${flyway:defaultSchema}."Entity" e
        SET
            "Description"    = fr."NewDescription",
            "__mj_UpdatedAt" = NOW()
        FROM filtered fr
        WHERE e."ID" = fr."ID"
        RETURNING e."ID" AS "ID"
    )
    SELECT
        fr."ID",
        fr."Name",
        fr."CurrentDescription",
        fr."NewDescription",
        fr."EntityDescription",
        fr."SchemaName"
    FROM filtered fr
    WHERE fr."ID" IN (SELECT u."ID" FROM updated u);
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 5. spUpdateExistingEntityFieldsFromSchema
--    For each EntityField whose underlying column metadata has drifted from
--    the SQL catalog, refresh the drifted fields (respecting IsSoftPrimaryKey
--    / IsSoftForeignKey flags) and return the set of rows that were touched.
--
--    T-SQL table variable -> CTE + a RETURNING side-effect.  IIF -> CASE.
--    TRY_CONVERT(UNIQUEIDENTIFIER, ...) is unnecessary in PG because
--    EntityField.RelatedEntityID is already UUID-typed.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(TEXT);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(
    p_ExcludedSchemaNames TEXT
)
RETURNS TABLE(
    "EntityID"                UUID,
    "EntityName"              VARCHAR,
    "EntityFieldID"           UUID,
    "EntityFieldName"         VARCHAR,
    "AutoUpdateDescription"   BOOLEAN,
    "ExistingDescription"     TEXT,
    "SQLDescription"          TEXT,
    "Type"                    VARCHAR,
    "Length"                  INTEGER,
    "Precision"               INTEGER,
    "Scale"                   INTEGER,
    "AllowsNull"              BOOLEAN,
    "DefaultValue"            TEXT,
    "AutoIncrement"           BOOLEAN,
    "IsVirtual"               BOOLEAN,
    "Sequence"                INTEGER,
    "RelatedEntityID"         UUID,
    "RelatedEntityFieldName"  VARCHAR,
    "IsPrimaryKey"            BOOLEAN,
    "IsUnique"                BOOLEAN
) AS
$$
BEGIN
    RETURN QUERY
    WITH excluded AS (
        SELECT TRIM(s) AS "SchemaName"
        FROM unnest(
            string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')
        ) AS s
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
            -- AutoIncrement: vwSQLColumnsAndEntityFields returns 0/1 INT
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
        FROM
            ${flyway:defaultSchema}."EntityField" ef
        INNER JOIN
            ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" fromSQL
              ON ef."EntityID" = fromSQL."EntityID"
             AND ef."Name"     = fromSQL."FieldName"
        INNER JOIN
            ${flyway:defaultSchema}."Entity" e
              ON ef."EntityID" = e."ID"
        LEFT  OUTER JOIN
            ${flyway:defaultSchema}."vwForeignKeys" fk
              ON ef."Name"      = fk."column"
             AND e."BaseTable"  = fk."table"
             AND e."SchemaName" = fk."schema_name"
        LEFT  OUTER JOIN
            ${flyway:defaultSchema}."Entity" re
              ON re."BaseTable"  = fk."referenced_table"
             AND re."SchemaName" = fk."referenced_schema"
        LEFT  OUTER JOIN
            ${flyway:defaultSchema}."vwTablePrimaryKeys" pk
              ON e."BaseTable"  = pk."TableName"
             AND ef."Name"      = pk."ColumnName"
             AND e."SchemaName" = pk."SchemaName"
        LEFT  OUTER JOIN
            ${flyway:defaultSchema}."vwTableUniqueKeys" uk
              ON e."BaseTable"  = uk."TableName"
             AND ef."Name"      = uk."ColumnName"
             AND e."SchemaName" = uk."SchemaName"
        LEFT  OUTER JOIN
            excluded x ON e."SchemaName" = x."SchemaName"
        WHERE
            e."VirtualEntity" = false
            AND x."SchemaName" IS NULL
            AND ef."ID" IS NOT NULL
            AND (
                   COALESCE(BTRIM(ef."Description"), '')
                        <> COALESCE(
                               BTRIM(
                                   CASE
                                       WHEN ef."AutoUpdateDescription" = true
                                           THEN fromSQL."Description"
                                       ELSE ef."Description"
                                   END
                               ),
                               ''
                           )
                OR ef."Type"       <> fromSQL."Type"
                OR COALESCE(ef."Length",     -1) <> COALESCE(fromSQL."Length",     -1)
                OR COALESCE(ef."Precision",  -1) <> COALESCE(fromSQL."Precision",  -1)
                OR COALESCE(ef."Scale",      -1) <> COALESCE(fromSQL."Scale",      -1)
                OR ef."AllowsNull" <> fromSQL."AllowsNull"
                OR COALESCE(BTRIM(ef."DefaultValue"), '')
                        <> COALESCE(BTRIM(fromSQL."DefaultValue"), '')
                OR ef."AutoIncrement" <> (fromSQL."AutoIncrement" = TRUE)
                OR ef."IsVirtual"     <> (fromSQL."IsVirtual" = TRUE)
                OR ef."Sequence"      <> fromSQL."Sequence"
                OR COALESCE(ef."RelatedEntityID",
                            '00000000-0000-0000-0000-000000000000'::uuid)
                        <> COALESCE(re."ID",
                            '00000000-0000-0000-0000-000000000000'::uuid)
                OR COALESCE(BTRIM(ef."RelatedEntityFieldName"), '')
                        <> COALESCE(BTRIM(fk."referenced_column"), '')
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
            "Description" =
                CASE
                    WHEN fr."AutoUpdateDescription" = true
                        THEN fr."SQLDescription"
                    ELSE ef."Description"
                END,
            "Type"          = fr."Type",
            "Length"        = fr."Length",
            "Precision"     = fr."Precision",
            "Scale"         = fr."Scale",
            "AllowsNull"    = fr."AllowsNull",
            "DefaultValue"  = fr."DefaultValue",
            "AutoIncrement" = fr."AutoIncrement",
            "IsVirtual"     = fr."IsVirtual",
            "Sequence"      = fr."Sequence",
            -- Protect soft FKs: don't overwrite if IsSoftForeignKey=true
            "RelatedEntityID" =
                CASE
                    WHEN ef."AutoUpdateRelatedEntityInfo" = true
                         AND ef."IsSoftForeignKey" = false
                        THEN fr."RelatedEntityID"
                    ELSE ef."RelatedEntityID"
                END,
            "RelatedEntityFieldName" =
                CASE
                    WHEN ef."AutoUpdateRelatedEntityInfo" = true
                         AND ef."IsSoftForeignKey" = false
                        THEN fr."RelatedEntityFieldName"
                    ELSE ef."RelatedEntityFieldName"
                END,
            -- Protect soft PKs: don't overwrite if IsSoftPrimaryKey=true
            "IsPrimaryKey" =
                CASE
                    WHEN ef."IsSoftPrimaryKey" = false
                        THEN fr."IsPrimaryKey"
                    ELSE ef."IsPrimaryKey"
                END,
            "IsUnique"        = fr."IsUnique",
            "__mj_UpdatedAt"  = NOW()
        FROM filtered fr
        WHERE ef."ID" = fr."EntityFieldID"
        RETURNING ef."ID" AS "ID"
    )
    SELECT
        fr."EntityID",
        fr."EntityName",
        fr."EntityFieldID",
        fr."EntityFieldName",
        fr."AutoUpdateDescription",
        fr."ExistingDescription",
        fr."SQLDescription",
        fr."Type",
        fr."Length",
        fr."Precision",
        fr."Scale",
        fr."AllowsNull",
        fr."DefaultValue",
        fr."AutoIncrement",
        fr."IsVirtual",
        fr."Sequence",
        fr."RelatedEntityID",
        fr."RelatedEntityFieldName",
        fr."IsPrimaryKey",
        fr."IsUnique"
    FROM filtered fr
    WHERE fr."EntityFieldID" IN (SELECT a."ID" FROM applied a);
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 6. spUpdateSchemaInfoFromDatabase
--    Upserts __mj."SchemaInfo" rows from live schemas (vwSQLSchemas),
--    skipping excluded schema names.  Returns the rows for the non-excluded
--    schemas so the caller can see the current state.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateSchemaInfoFromDatabase"(TEXT);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateSchemaInfoFromDatabase"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS SETOF ${flyway:defaultSchema}."SchemaInfo" AS
$$
BEGIN
    -- 1) Refresh Description from extended properties (schema comments in PG)
    UPDATE ${flyway:defaultSchema}."SchemaInfo" si
    SET
        "Description"    = ss."SchemaDescription",
        "__mj_UpdatedAt" = NOW()
    FROM ${flyway:defaultSchema}."vwSQLSchemas" ss
    WHERE
        si."SchemaName" = ss."SchemaName"
        AND (
            si."Description" IS NULL
            OR si."Description" <> COALESCE(ss."SchemaDescription", '')
        )
        AND (
            p_ExcludedSchemaNames IS NULL
            OR p_ExcludedSchemaNames = ''
            OR ss."SchemaName" NOT IN (
                SELECT TRIM(s)
                FROM unnest(string_to_array(p_ExcludedSchemaNames, ',')) AS s
                WHERE TRIM(s) <> ''
            )
        );

    -- 2) Insert rows for schemas that aren't in SchemaInfo yet
    INSERT INTO ${flyway:defaultSchema}."SchemaInfo" (
        "SchemaName",
        "EntityIDMin",
        "EntityIDMax",
        "Comments",
        "Description"
    )
    SELECT
        ss."SchemaName",
        1,
        999999999,
        'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
        ss."SchemaDescription"
    FROM
        ${flyway:defaultSchema}."vwSQLSchemas" ss
    LEFT OUTER JOIN
        ${flyway:defaultSchema}."SchemaInfo" si
          ON ss."SchemaName" = si."SchemaName"
    WHERE
        si."ID" IS NULL
        AND (
            p_ExcludedSchemaNames IS NULL
            OR p_ExcludedSchemaNames = ''
            OR ss."SchemaName" NOT IN (
                SELECT TRIM(s)
                FROM unnest(string_to_array(p_ExcludedSchemaNames, ',')) AS s
                WHERE TRIM(s) <> ''
            )
        );

    -- 3) Return the current set of SchemaInfo rows for non-excluded schemas
    RETURN QUERY
    SELECT si.*
    FROM ${flyway:defaultSchema}."SchemaInfo" si
    INNER JOIN ${flyway:defaultSchema}."vwSQLSchemas" ss
          ON si."SchemaName" = ss."SchemaName"
    WHERE
        p_ExcludedSchemaNames IS NULL
        OR p_ExcludedSchemaNames = ''
        OR ss."SchemaName" NOT IN (
            SELECT TRIM(s)
            FROM unnest(string_to_array(p_ExcludedSchemaNames, ',')) AS s
            WHERE TRIM(s) <> ''
        );
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 7. spDeleteUnneededEntityFields
--    Deletes EntityField rows whose underlying SQL column no longer exists
--    (renamed, dropped, etc.) for entities in non-excluded schemas.  Returns
--    the rows that were removed so the caller can log them.
--
--    SQL Server temp tables (#ef, #actual, #DeletedFields) collapse to a
--    single CTE chain + an EntityField-shaped RETURNING set.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(TEXT);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteUnneededEntityFields"(
    p_ExcludedSchemaNames TEXT
)
RETURNS SETOF ${flyway:defaultSchema}."EntityField" AS
$$
DECLARE
    v_deleted_entity_ids UUID[];
BEGIN
    -- Resolve the set of EntityField IDs that are orphaned:
    --   * the field belongs to a non-virtual entity in a non-excluded schema
    --   * the entity's base table/view no longer has a matching column
    --
    -- DROP IF EXISTS guards against re-entrance if the function is called
    -- multiple times within the same session/transaction before commit.
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
        AND NOT EXISTS (
            SELECT 1
            FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" actual
            WHERE actual."EntityID"        = ef."EntityID"
              AND actual."EntityFieldName" = ef."Name"
        );

    -- 1) Touch the Entity rows that will have fields removed (keeps metadata
    --    __mj_UpdatedAt fresh so downstream cache invalidation works).
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
$$ LANGUAGE plpgsql;
