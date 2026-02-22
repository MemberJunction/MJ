-- =====================================================================
-- PostgreSQL Parity Fixes Migration
-- Addresses remaining gaps identified in VERIFICATION_REPORT.md:
--
--   1. Fix: Duplicate lowercase "allowmultiplesubtypes" column on Entity
--      (caused by unquoted identifier in V202602141421 migration)
--   2. Ensure tr_APIScope_UpdateFullPath trigger exists
--      (already in baseline but flagged in verification)
--   3. Add missing utility functions:
--      - ToTitleCase, ExtractVersionComponents
--      - spGetAuthenticationDataByExternalSystemID
--      - spGetPrimaryKeyForTable
--      - spSetDefaultColumnWidthWhereNeeded
--   4. Add missing stored procedures (converted from SQL Server):
--      - spCreateVirtualEntity
--      - spCreateUserViewRunWithDetail
--      - spUpdateSchemaInfoFromDatabase (using pg_catalog)
--   5. Add placeholder/stub SPs for SQL Server-specific introspection:
--      - spCreateEntityBehavior / spUpdateEntityBehavior
--      - spCreateEntityBehaviorType / spUpdateEntityBehaviorType
--      - spUpdateExistingEntitiesFromSchema (stub)
--      - spUpdateExistingEntityFieldsFromSchema (stub)
--      - spDeleteUnneededEntityFields (stub)
--   6. Add missing timestamp triggers (ConversationDetail, ErrorLog)
--
-- Note: The following SQL Server SPs have NO PostgreSQL equivalent and
-- are intentionally omitted:
--   - spRecompileAllStoredProcedures (PG doesn't need recompilation)
--   - spRecompileAllViews (PG doesn't need recompilation)
--   - CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And
--     _UpdatedAt_Columns (one-time historical migration, never needed again)
-- =====================================================================

-- =====================================================================
-- SECTION 1: Fix AllowMultipleSubtypes case-sensitivity issue
-- The V202602141421 migration used an unquoted identifier which PG
-- lowercased to "allowmultiplesubtypes", creating a duplicate column
-- alongside the properly quoted "AllowMultipleSubtypes" from baseline.
-- =====================================================================

DO $$
BEGIN
    -- Check if the lowercase duplicate column exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '__mj'
          AND table_name = 'Entity'
          AND column_name = 'allowmultiplesubtypes'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '__mj'
          AND table_name = 'Entity'
          AND column_name = 'AllowMultipleSubtypes'
    )
    THEN
        -- Both columns exist (duplicate) — drop the lowercase one
        -- First drop the constraint if it exists
        IF EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_schema = '__mj'
              AND table_name = 'Entity'
              AND constraint_name = 'DF_Entity_AllowMultipleSubtypes'
        )
        THEN
            EXECUTE 'ALTER TABLE __mj."Entity" DROP CONSTRAINT "DF_Entity_AllowMultipleSubtypes"';
        END IF;

        -- Drop the lowercase duplicate column
        EXECUTE 'ALTER TABLE __mj."Entity" DROP COLUMN IF EXISTS allowmultiplesubtypes';
        RAISE NOTICE 'Dropped duplicate lowercase column "allowmultiplesubtypes" from Entity table';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '__mj'
          AND table_name = 'Entity'
          AND column_name = 'allowmultiplesubtypes'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '__mj'
          AND table_name = 'Entity'
          AND column_name = 'AllowMultipleSubtypes'
    )
    THEN
        -- Only the lowercase column exists (fresh DB without baseline column)
        -- Rename it to the correct casing
        EXECUTE 'ALTER TABLE __mj."Entity" RENAME COLUMN allowmultiplesubtypes TO "AllowMultipleSubtypes"';
        RAISE NOTICE 'Renamed lowercase "allowmultiplesubtypes" to "AllowMultipleSubtypes"';
    ELSE
        RAISE NOTICE 'AllowMultipleSubtypes column casing is already correct — no fix needed';
    END IF;
END $$;


-- =====================================================================
-- SECTION 2: Ensure tr_APIScope_UpdateFullPath trigger exists
-- This trigger is in the PG baseline but was flagged as missing in
-- verification. Adding idempotently to guarantee it exists.
-- =====================================================================

CREATE OR REPLACE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent recursive trigger firing
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

    -- Only run if Name or ParentID changed (or new insert)
    IF TG_OP = 'INSERT'
       OR NEW."Name" IS DISTINCT FROM OLD."Name"
       OR NEW."ParentID" IS DISTINCT FROM OLD."ParentID" THEN

        -- Recalculate all FullPath values using recursive CTE
        WITH RECURSIVE "ScopePaths" AS (
            -- Base case: root scopes (no parent)
            SELECT
                "ID",
                "Name",
                "ParentID",
                CAST("Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."APIScope"
            WHERE "ParentID" IS NULL

            UNION ALL

            -- Recursive case: child scopes
            SELECT
                s."ID",
                s."Name",
                s."ParentID",
                CAST(sp."ComputedPath" || ':' || s."Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."APIScope" s
            INNER JOIN "ScopePaths" sp ON s."ParentID" = sp."ID"
        )
        UPDATE __mj."APIScope" s
        SET "FullPath" = sp."ComputedPath"
        FROM "ScopePaths" sp
        WHERE s."ID" = sp."ID"
          AND (s."FullPath" != sp."ComputedPath" OR s."FullPath" IS NULL);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tr_APIScope_UpdateFullPath" ON __mj."APIScope";
CREATE TRIGGER "tr_APIScope_UpdateFullPath"
    AFTER INSERT OR UPDATE ON __mj."APIScope"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"();


-- =====================================================================
-- SECTION 3: Missing utility functions
-- =====================================================================

-- 3a. ToTitleCase — scalar function to convert strings to title case
CREATE OR REPLACE FUNCTION __mj."ToTitleCase"(input_string VARCHAR(4000))
RETURNS VARCHAR(4000)
LANGUAGE plpgsql
AS $$
DECLARE
    idx INT;
    ch CHAR(1);
    output_string VARCHAR(4000);
    input_len INT;
BEGIN
    IF input_string IS NULL THEN
        RETURN NULL;
    END IF;

    output_string := LOWER(input_string);
    input_len := LENGTH(input_string);

    IF input_len = 0 THEN
        RETURN output_string;
    END IF;

    -- Capitalize first character
    output_string := UPPER(SUBSTRING(output_string, 1, 1)) || SUBSTRING(output_string, 2);

    idx := 2;
    WHILE idx <= input_len LOOP
        ch := SUBSTRING(input_string, idx, 1);
        IF ch IN (' ', ';', ':', '!', '?', ',', '.', '_', '-', '/', '&', '''', '(') THEN
            IF idx + 1 <= input_len THEN
                output_string := SUBSTRING(output_string, 1, idx)
                    || UPPER(SUBSTRING(input_string, idx + 1, 1))
                    || SUBSTRING(output_string, idx + 2);
            END IF;
        END IF;
        idx := idx + 1;
    END LOOP;

    RETURN output_string;
END;
$$;

-- 3b. ExtractVersionComponents — table-valued function to parse version strings
DROP FUNCTION IF EXISTS __mj."ExtractVersionComponents"(TEXT);
CREATE OR REPLACE FUNCTION __mj."ExtractVersionComponents"(description_input TEXT)
RETURNS TABLE (
    "Version" TEXT,
    "Major" TEXT,
    "Minor" TEXT,
    "Patch" TEXT,
    "VersionDescription" TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    cleaned TEXT;
    i INT := 1;
    input_len INT;
    extracted TEXT := '';
    ch CHAR(1);
    version_description TEXT := '';
    dot_count INT;
    parts TEXT[];
    v_major TEXT := '';
    v_minor TEXT := '';
    v_patch TEXT := '';
BEGIN
    cleaned := TRIM(description_input);
    IF cleaned LIKE 'v%' THEN
        cleaned := SUBSTRING(cleaned, 2);
    END IF;

    input_len := LENGTH(cleaned);

    WHILE i <= input_len LOOP
        ch := SUBSTRING(cleaned, i, 1);
        IF ch >= '0' AND ch <= '9' OR ch = '.' THEN
            extracted := extracted || ch;
            i := i + 1;
        ELSIF ch = 'x' THEN
            IF LENGTH(extracted) > 0 AND RIGHT(extracted, 1) = '.' THEN
                extracted := extracted || ch;
                i := i + 1;
            ELSE
                EXIT;
            END IF;
        ELSE
            IF LENGTH(extracted) > 0 AND RIGHT(extracted, 1) = '.' THEN
                extracted := LEFT(extracted, LENGTH(extracted) - 1);
            END IF;
            EXIT;
        END IF;
    END LOOP;

    IF i <= input_len THEN
        version_description := TRIM(SUBSTRING(cleaned, i));
    ELSE
        version_description := '';
    END IF;

    dot_count := LENGTH(extracted) - LENGTH(REPLACE(extracted, '.', ''));
    parts := STRING_TO_ARRAY(extracted, '.');

    IF dot_count = 0 THEN
        v_major := extracted;
    ELSIF dot_count = 1 THEN
        v_major := parts[1];
        v_minor := parts[2];
    ELSIF dot_count >= 2 THEN
        v_major := parts[1];
        v_minor := parts[2];
        v_patch := parts[3];
    END IF;

    RETURN QUERY SELECT extracted, v_major, v_minor, v_patch, version_description;
END;
$$;

-- 3c. spGetAuthenticationDataByExternalSystemID
CREATE OR REPLACE FUNCTION __mj."spGetAuthenticationDataByExternalSystemID"(
    p_IntegrationName TEXT,
    p_ExternalSystemID TEXT
)
RETURNS TABLE (
    "AccessToken" TEXT,
    "RefreshToken" TEXT,
    "TokenExpirationDate" TIMESTAMPTZ,
    "APIKey" TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ci."AccessToken"::TEXT,
        ci."RefreshToken"::TEXT,
        ci."TokenExpirationDate",
        ci."APIKey"::TEXT
    FROM
        __mj."CompanyIntegration" ci
    JOIN __mj."Integration" i
        ON i."ID" = ci."IntegrationID"
    WHERE
        i."Name" = TRIM(p_IntegrationName)
        AND ci."ExternalSystemID" = TRIM(p_ExternalSystemID)
        AND ci."IsActive" = TRUE;
END;
$$;

-- 3d. spGetPrimaryKeyForTable — uses information_schema (PG equivalent of sys.* approach)
CREATE OR REPLACE FUNCTION __mj."spGetPrimaryKeyForTable"(
    p_TableName TEXT,
    p_SchemaName TEXT
)
RETURNS TABLE (
    "SchemaName" TEXT,
    "TableName" TEXT,
    "ColumnName" TEXT,
    "DataType" TEXT,
    "max_length" INT,
    "precision" INT,
    "scale" INT,
    "is_nullable" BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tc.table_schema::TEXT,
        tc.table_name::TEXT,
        kcu.column_name::TEXT,
        c.data_type::TEXT,
        COALESCE(c.character_maximum_length, 0)::INT,
        COALESCE(c.numeric_precision, 0)::INT,
        COALESCE(c.numeric_scale, 0)::INT,
        (c.is_nullable = 'YES')::BOOLEAN
    FROM
        information_schema.table_constraints tc
    JOIN
        information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN
        information_schema.columns c
        ON kcu.table_schema = c.table_schema
        AND kcu.table_name = c.table_name
        AND kcu.column_name = c.column_name
    WHERE
        tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = p_TableName
        AND tc.table_schema = p_SchemaName;
END;
$$;

-- 3e. spSetDefaultColumnWidthWhereNeeded — one-time maintenance utility
CREATE OR REPLACE FUNCTION __mj."spSetDefaultColumnWidthWhereNeeded"(
    p_ExcludedSchemaNames TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE __mj."EntityField" ef
    SET
        "DefaultColumnWidth" = CASE
            WHEN ef."Type" = 'int' THEN 50
            WHEN ef."Type" = 'datetimeoffset' THEN 100
            WHEN ef."Type" = 'money' THEN 100
            WHEN ef."Type" = 'nchar' THEN 75
            ELSE 150
        END,
        "__mj_UpdatedAt" = NOW() AT TIME ZONE 'UTC'
    FROM __mj."Entity" e
    WHERE ef."EntityID" = e."ID"
      AND ef."DefaultColumnWidth" IS NULL
      AND e."SchemaName" NOT IN (
          SELECT TRIM(s) FROM UNNEST(STRING_TO_ARRAY(p_ExcludedSchemaNames, ',')) AS s
      );
END;
$$;


-- =====================================================================
-- SECTION 4: Converted stored procedures
-- =====================================================================

-- 4a. spCreateVirtualEntity — creates a virtual (non-physical) entity
--     with a single PK field in EntityField
CREATE OR REPLACE FUNCTION __mj."spCreateVirtualEntity"(
    p_Name VARCHAR(255),
    p_BaseView VARCHAR(255),
    p_SchemaName VARCHAR(255),
    p_PrimaryKeyFieldName VARCHAR(255),
    p_Description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_NewEntityID UUID;
BEGIN
    INSERT INTO __mj."Entity"
    (
        "Name",
        "BaseView",
        "BaseTable",
        "VirtualEntity",
        "SchemaName",
        "IncludeInAPI",
        "AllowCreateAPI",
        "AllowUpdateAPI",
        "AllowDeleteAPI",
        "AllowRecordMerge",
        "TrackRecordChanges"
    )
    VALUES
    (
        p_Name,
        p_BaseView,
        p_BaseView, -- use baseview as basetable for Code/Class virtual fields
        TRUE,
        p_SchemaName,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE
    )
    RETURNING "ID" INTO v_NewEntityID;

    -- Create a single row in EntityField for the PK column
    INSERT INTO __mj."EntityField"
    (
        "EntityID",
        "Sequence",
        "Name",
        "IsPrimaryKey",
        "IsUnique",
        "Type"
    )
    VALUES
    (
        v_NewEntityID,
        1,
        p_PrimaryKeyFieldName,
        TRUE,
        TRUE,
        'int' -- placeholder, CodeGen updates the true type
    );

    RETURN v_NewEntityID;
END;
$$;

-- 4b. spCreateUserViewRunWithDetail — creates a UserViewRun record and
--     inserts associated detail records from a UUID array
CREATE OR REPLACE FUNCTION __mj."spCreateUserViewRunWithDetail"(
    p_UserViewID UUID,
    p_UserEmail VARCHAR(255),
    p_RecordIDs TEXT[] -- array of record ID strings
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_RunID UUID;
    v_UserID UUID;
    v_Now TIMESTAMPTZ;
    v_rec RECORD;
BEGIN
    v_Now := NOW() AT TIME ZONE 'UTC';

    -- Look up the user by email
    SELECT "ID" INTO v_UserID
    FROM __mj."vwUsers"
    WHERE "Email" = p_UserEmail;

    IF v_UserID IS NULL THEN
        RAISE EXCEPTION 'User not found with email: %', p_UserEmail;
    END IF;

    -- Create the UserViewRun record via the existing SP
    SELECT r."ID" INTO v_RunID
    FROM __mj."spCreateUserViewRun"(
        p_UserViewID,
        v_Now,
        v_UserID
    ) r;

    -- Insert all detail records
    INSERT INTO __mj."UserViewRunDetail"
    (
        "UserViewRunID",
        "RecordID"
    )
    SELECT v_RunID, UNNEST(p_RecordIDs);

    RETURN v_RunID;
END;
$$;

-- 4c. spUpdateSchemaInfoFromDatabase — syncs SchemaInfo table with
--     actual database schemas using pg_catalog
CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfoFromDatabase"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS TABLE (
    "ID" UUID,
    "SchemaName" VARCHAR(255),
    "EntityIDMin" INT,
    "EntityIDMax" INT,
    "Comments" TEXT,
    "Description" TEXT,
    "__mj_CreatedAt" TIMESTAMPTZ,
    "__mj_UpdatedAt" TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ExcludedSchemas TEXT[];
BEGIN
    -- Parse excluded schema names into an array
    IF p_ExcludedSchemaNames IS NOT NULL AND LENGTH(TRIM(p_ExcludedSchemaNames)) > 0 THEN
        SELECT ARRAY_AGG(TRIM(s))
        INTO v_ExcludedSchemas
        FROM UNNEST(STRING_TO_ARRAY(p_ExcludedSchemaNames, ',')) AS s
        WHERE TRIM(s) <> '';
    ELSE
        v_ExcludedSchemas := ARRAY[]::TEXT[];
    END IF;

    -- Update descriptions for existing SchemaInfo records from pg_catalog
    UPDATE __mj."SchemaInfo" si
    SET "Description" = d.description
    FROM pg_namespace n
    LEFT JOIN pg_description d ON n.oid = d.objoid AND d.objsubid = 0
    WHERE si."SchemaName" = n.nspname
      AND (si."Description" IS NULL OR si."Description" <> COALESCE(d.description, ''))
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp%'
      AND n.nspname NOT LIKE 'pg_toast%'
      AND NOT (n.nspname = ANY(v_ExcludedSchemas));

    -- Insert new SchemaInfo records for schemas not yet tracked
    INSERT INTO __mj."SchemaInfo"
    (
        "SchemaName",
        "EntityIDMin",
        "EntityIDMax",
        "Comments",
        "Description"
    )
    SELECT
        n.nspname,
        1,          -- Default min ID (should be updated by administrator)
        999999999,  -- Default max ID (should be updated by administrator)
        'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
        d.description
    FROM pg_namespace n
    LEFT JOIN pg_description d ON n.oid = d.objoid AND d.objsubid = 0
    LEFT JOIN __mj."SchemaInfo" si ON n.nspname = si."SchemaName"
    WHERE si."ID" IS NULL  -- Schema doesn't exist in SchemaInfo yet
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp%'
      AND n.nspname NOT LIKE 'pg_toast%'
      AND NOT (n.nspname = ANY(v_ExcludedSchemas));

    -- Return the processed records
    RETURN QUERY
    SELECT
        si2."ID",
        si2."SchemaName",
        si2."EntityIDMin",
        si2."EntityIDMax",
        si2."Comments",
        si2."Description",
        si2."__mj_CreatedAt",
        si2."__mj_UpdatedAt"
    FROM __mj."SchemaInfo" si2
    JOIN pg_namespace n ON si2."SchemaName" = n.nspname
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp%'
      AND n.nspname NOT LIKE 'pg_toast%'
      AND NOT (n.nspname = ANY(v_ExcludedSchemas));
END;
$$;


-- =====================================================================
-- SECTION 5: EntityBehavior placeholder SPs
-- These tables don't exist in the baseline yet. Placeholder functions
-- maintain SP name parity with SQL Server.
-- =====================================================================

CREATE OR REPLACE FUNCTION __mj."spCreateEntityBehavior"(
    p_EntityID UUID,
    p_BehaviorTypeID UUID,
    p_Description TEXT,
    p_RegenerateCode BOOLEAN,
    p_Code TEXT,
    p_CodeExplanation TEXT,
    p_CodeGenerated BOOLEAN
)
RETURNS TABLE (
    "ID" UUID,
    "EntityID" UUID,
    "BehaviorTypeID" UUID,
    "Description" TEXT,
    "RegenerateCode" BOOLEAN,
    "Code" TEXT,
    "CodeExplanation" TEXT,
    "CodeGenerated" BOOLEAN
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehavior table does not exist in baseline — placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityBehavior"(
    p_ID UUID,
    p_EntityID UUID,
    p_BehaviorTypeID UUID,
    p_Description TEXT,
    p_RegenerateCode BOOLEAN,
    p_Code TEXT,
    p_CodeExplanation TEXT,
    p_CodeGenerated BOOLEAN
)
RETURNS TABLE (
    "ID" UUID,
    "EntityID" UUID,
    "BehaviorTypeID" UUID,
    "Description" TEXT,
    "RegenerateCode" BOOLEAN,
    "Code" TEXT,
    "CodeExplanation" TEXT,
    "CodeGenerated" BOOLEAN
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehavior table does not exist in baseline — placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityBehaviorType"(
    p_Name TEXT,
    p_Description TEXT
)
RETURNS TABLE (
    "ID" UUID,
    "Name" TEXT,
    "Description" TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehaviorType table does not exist in baseline — placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityBehaviorType"(
    p_ID UUID,
    p_Name TEXT,
    p_Description TEXT
)
RETURNS TABLE (
    "ID" UUID,
    "Name" TEXT,
    "Description" TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehaviorType table does not exist in baseline — placeholder for schema parity';
    RETURN;
END;
$$;


-- =====================================================================
-- SECTION 6: Schema introspection SP stubs
-- These SPs use SQL Server sys.* catalog views heavily. Full PG
-- equivalents require pg_catalog/information_schema rewrites that
-- will be needed when CodeGen supports PostgreSQL natively.
-- For now, stubs maintain name parity and document the gap.
-- =====================================================================

-- 6a. spUpdateExistingEntitiesFromSchema
--     SQL Server version: syncs Entity descriptions from extended properties
--     PG equivalent: would use pg_description for table/schema comments
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntitiesFromSchema"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS TABLE (
    "ID" UUID
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'spUpdateExistingEntitiesFromSchema: stub — full pg_catalog implementation '
                 'needed when CodeGen supports PostgreSQL. SQL Server version uses sys.tables '
                 'and sys.extended_properties; PG equivalent should use information_schema.tables '
                 'and pg_description.';
    RETURN;
END;
$$;

-- 6b. spUpdateExistingEntityFieldsFromSchema
--     SQL Server version: syncs EntityField metadata from sys.columns,
--     sys.foreign_keys, sys.key_constraints
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntityFieldsFromSchema"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS TABLE (
    "ID" UUID
)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'spUpdateExistingEntityFieldsFromSchema: stub — full pg_catalog implementation '
                 'needed when CodeGen supports PostgreSQL. SQL Server version uses '
                 'vwSQLColumnsAndEntityFields, vwForeignKeys, vwTablePrimaryKeys, '
                 'vwTableUniqueKeys; PG equivalent should use information_schema.columns, '
                 'pg_constraint, and pg_attribute.';
    RETURN;
END;
$$;

-- 6c. spDeleteUnneededEntityFields
--     SQL Server version: removes EntityField records for columns that
--     no longer exist in the database schema
CREATE OR REPLACE FUNCTION __mj."spDeleteUnneededEntityFields"(
    p_ExcludedSchemaNames TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'spDeleteUnneededEntityFields: stub — full pg_catalog implementation '
                 'needed when CodeGen supports PostgreSQL. SQL Server version compares '
                 'EntityField metadata against vwSQLColumnsAndEntityFields (sys.columns); '
                 'PG equivalent should use information_schema.columns.';
END;
$$;


-- =====================================================================
-- SECTION 7: Missing timestamp triggers
-- These were identified in the schema parity analysis as missing
-- from the baseline.
-- =====================================================================

-- 7a. ConversationDetail update trigger
CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetail_func"()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetail" ON __mj."ConversationDetail";
CREATE TRIGGER "trgUpdateConversationDetail"
    BEFORE UPDATE ON __mj."ConversationDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetail_func"();

-- 7b. ErrorLog update trigger
CREATE OR REPLACE FUNCTION __mj."trgUpdateErrorLog_func"()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trgUpdateErrorLog" ON __mj."ErrorLog";
CREATE TRIGGER "trgUpdateErrorLog"
    BEFORE UPDATE ON __mj."ErrorLog"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateErrorLog_func"();


-- =====================================================================
-- Migration complete.
--
-- Summary of changes:
--   - Fixed: Entity.allowmultiplesubtypes duplicate column (case issue)
--   - Added: tr_APIScope_UpdateFullPath trigger (idempotent)
--   - Added: 5 utility functions (ToTitleCase, ExtractVersionComponents,
--            spGetAuthenticationDataByExternalSystemID,
--            spGetPrimaryKeyForTable, spSetDefaultColumnWidthWhereNeeded)
--   - Added: 3 converted SPs (spCreateVirtualEntity,
--            spCreateUserViewRunWithDetail, spUpdateSchemaInfoFromDatabase)
--   - Added: 4 EntityBehavior placeholder SPs
--   - Added: 3 schema introspection stub SPs
--   - Added: 2 missing timestamp triggers
--
-- Intentionally omitted (no PG equivalent needed):
--   - spRecompileAllStoredProcedures (PG has no recompilation concept)
--   - spRecompileAllViews (PG has no recompilation concept)
--   - CAREFUL_MoveDatesToNewSpecialFields... (historical one-time utility)
-- =====================================================================
