-- PostgreSQL Schema Parity Fixes
-- These functions were present in SQL Server but missing from PostgreSQL
-- Applied: 2026-02-18

-- ============================================================
-- 1. ToTitleCase - Scalar function to convert strings to title case
-- ============================================================
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
                output_string := SUBSTRING(output_string, 1, idx) || UPPER(SUBSTRING(input_string, idx + 1, 1)) || SUBSTRING(output_string, idx + 2);
            END IF;
        END IF;
        idx := idx + 1;
    END LOOP;

    RETURN output_string;
END;
$$;

-- ============================================================
-- 2. ExtractVersionComponents - Table-valued function to parse version strings
-- ============================================================
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

-- ============================================================
-- 3. spGetAuthenticationDataByExternalSystemID
-- ============================================================
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
        ci."AccessToken",
        ci."RefreshToken",
        ci."TokenExpirationDate",
        ci."APIKey"
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

-- ============================================================
-- 4. spGetPrimaryKeyForTable
-- ============================================================
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

-- ============================================================
-- 5. spSetDefaultColumnWidthWhereNeeded
-- ============================================================
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

-- ============================================================
-- 6. EntityBehavior placeholder CRUDs (tables don't exist yet)
-- ============================================================
CREATE OR REPLACE FUNCTION __mj."spCreateEntityBehavior"(
    p_EntityID INT, p_BehaviorTypeID INT, p_Description TEXT,
    p_RegenerateCode BOOLEAN, p_Code TEXT, p_CodeExplanation TEXT, p_CodeGenerated BOOLEAN
)
RETURNS TABLE ("ID" INT, "EntityID" INT, "BehaviorTypeID" INT, "Description" TEXT,
    "RegenerateCode" BOOLEAN, "Code" TEXT, "CodeExplanation" TEXT, "CodeGenerated" BOOLEAN)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehavior table does not exist - placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityBehavior"(
    p_ID INT, p_EntityID INT, p_BehaviorTypeID INT, p_Description TEXT,
    p_RegenerateCode BOOLEAN, p_Code TEXT, p_CodeExplanation TEXT, p_CodeGenerated BOOLEAN
)
RETURNS TABLE ("ID" INT, "EntityID" INT, "BehaviorTypeID" INT, "Description" TEXT,
    "RegenerateCode" BOOLEAN, "Code" TEXT, "CodeExplanation" TEXT, "CodeGenerated" BOOLEAN)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehavior table does not exist - placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityBehaviorType"(
    p_Name TEXT, p_Description TEXT
)
RETURNS TABLE ("ID" INT, "Name" TEXT, "Description" TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehaviorType table does not exist - placeholder for schema parity';
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityBehaviorType"(
    p_ID INT, p_Name TEXT, p_Description TEXT
)
RETURNS TABLE ("ID" INT, "Name" TEXT, "Description" TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'EntityBehaviorType table does not exist - placeholder for schema parity';
    RETURN;
END;
$$;

-- ============================================================
-- 7. Missing triggers for ConversationDetail and ErrorLog
-- ============================================================
CREATE OR REPLACE FUNCTION __mj.fn_trg_ConversationDetail_UpdatedAt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ConversationDetail_UpdatedAt ON __mj."ConversationDetail";
CREATE TRIGGER trg_ConversationDetail_UpdatedAt
    BEFORE UPDATE ON __mj."ConversationDetail"
    FOR EACH ROW EXECUTE FUNCTION __mj.fn_trg_ConversationDetail_UpdatedAt();

CREATE OR REPLACE FUNCTION __mj.fn_trg_ErrorLog_UpdatedAt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ErrorLog_UpdatedAt ON __mj."ErrorLog";
CREATE TRIGGER trg_ErrorLog_UpdatedAt
    BEFORE UPDATE ON __mj."ErrorLog"
    FOR EACH ROW EXECUTE FUNCTION __mj.fn_trg_ErrorLog_UpdatedAt();
