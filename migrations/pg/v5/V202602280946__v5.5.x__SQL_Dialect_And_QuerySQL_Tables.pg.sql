
-- ===================== DDL: Tables, PKs, Indexes =====================

/**************************************************************************************************
 * Migration: SQL Dialect and Query SQL Tables
 *
 * Purpose: Add multi-dialect SQL support for the Query system. Queries can now store
 * dialect-specific SQL variants (e.g., T-SQL, PostgreSQL) so the correct SQL is executed
 * at runtime based on the active database platform.
 *
 * Entities created:
 * 1. MJ: SQL Dialects - Lookup table for SQL language dialects
 * 2. MJ: Query SQLs - Dialect-specific SQL for each query
 *
 * Entity modified:
 * 1. MJ: Queries - Added SQLDialectID column (defaults to T-SQL dialect)
 *
 * Version: 5.5.x
 **************************************************************************************************/

-- ============================================================================
-- 1. SQLDialect (MJ: SQL Dialects)
-- ============================================================================
CREATE TABLE __mj."SQLDialect" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "PlatformKey" VARCHAR(50) NOT NULL,
 "DatabaseName" VARCHAR(100) NOT NULL,
 "LanguageName" VARCHAR(100) NOT NULL,
 "VendorName" VARCHAR(200) NULL,
 "WebURL" VARCHAR(500) NULL,
 "Icon" VARCHAR(500) NULL,
 "Description" TEXT NULL,
 CONSTRAINT "PK_SQLDialect" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_SQLDialect_Name" UNIQUE ("Name"),
 CONSTRAINT "UQ_SQLDialect_PlatformKey" UNIQUE ("PlatformKey")
);

-- ============================================================================
-- 3. QuerySQL (MJ: Query SQLs)
-- ============================================================================
CREATE TABLE __mj."QuerySQL" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "QueryID" UUID NOT NULL,
 "SQLDialectID" UUID NOT NULL,
 "SQL" TEXT NOT NULL,
 CONSTRAINT "PK_QuerySQL" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_QuerySQL_Query" FOREIGN KEY ("QueryID")
 REFERENCES __mj."Query"("ID"),
 CONSTRAINT "FK_QuerySQL_SQLDialect" FOREIGN KEY ("SQLDialectID")
 REFERENCES __mj."SQLDialect"("ID"),
 CONSTRAINT "UQ_QuerySQL_Query_Dialect" UNIQUE ("QueryID", "SQLDialectID")
);

-- ============================================================================
-- 4. Add SQLDialectID to Query table (defaults to T-SQL)
-- ============================================================================
ALTER TABLE __mj."Query"
ADD "SQLDialectID" UUID NULL;

ALTER TABLE __mj."Query"
ADD CONSTRAINT "FK_Query_SQLDialect" FOREIGN KEY ("SQLDialectID")
    REFERENCES __mj."SQLDialect"("ID") DEFERRABLE INITIALLY DEFERRED;

-- Seed SQLDialect rows (must come before NOT NULL constraint)
INSERT INTO __mj."SQLDialect" ("ID", "Name", "PlatformKey", "DatabaseName", "LanguageName", "VendorName", "WebURL", "Icon", "Description")
VALUES
    ('1F203987-A37B-4BC1-85B3-BA50DC33C3E0', 'T-SQL', 'sqlserver', 'SQL Server', 'T-SQL', 'Microsoft', 'https://learn.microsoft.com/en-us/sql/', 'fa-brands fa-microsoft', 'Transact-SQL dialect used by Microsoft SQL Server and Azure SQL Database'),
    ('426915F2-D4FE-4AB9-97A8-39063561DE9F', 'PostgreSQL', 'postgresql', 'PostgreSQL', 'PL/pgSQL', 'PostgreSQL Global Development Group', 'https://www.postgresql.org/', 'fa-solid fa-database', 'PostgreSQL SQL dialect with PL/pgSQL procedural extensions');

-- Set existing queries to T-SQL dialect
UPDATE __mj."Query"
SET "SQLDialectID" = '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';

-- Now make it NOT NULL with a default
ALTER TABLE __mj."Query"
ALTER COLUMN "SQLDialectID" SET NOT NULL;

ALTER TABLE __mj."Query"
ALTER COLUMN "SQLDialectID" SET DEFAULT '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';

ALTER TABLE __mj."SQLDialect" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."SQLDialect" */;

ALTER TABLE __mj."SQLDialect" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_CreatedAt to entity __mj."QuerySQL" */;

ALTER TABLE __mj."QuerySQL" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."QuerySQL" */;

ALTER TABLE __mj."QuerySQL" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to insert new entity field */;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QuerySQL_QueryID" ON __mj."QuerySQL" ("QueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QuerySQL_SQLDialectID" ON __mj."QuerySQL" ("SQLDialectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_CategoryID" ON __mj."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID" ON __mj."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_SQLDialectID" ON __mj."Query" ("SQLDialectID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQuerySQLs"
AS SELECT
    q.*,
    "MJQuery_QueryID"."Name" AS "Query",
    "MJSQLDialect_SQLDialectID"."Name" AS "SQLDialect"
FROM
    __mj."QuerySQL" AS q
INNER JOIN
    __mj."Query" AS "MJQuery_QueryID"
  ON
    q."QueryID" = "MJQuery_QueryID"."ID"
INNER JOIN
    __mj."SQLDialect" AS "MJSQLDialect_SQLDialectID"
  ON
    q."SQLDialectID" = "MJSQLDialect_SQLDialectID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwQuerySQLs" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwSQLDialects"
AS SELECT
    s.*
FROM
    __mj."SQLDialect" AS s$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwSQLDialects" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueries"
AS SELECT
    q.*,
    "MJQueryCategory_CategoryID"."Name" AS "Category",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJSQLDialect_SQLDialectID"."Name" AS "SQLDialect"
FROM
    __mj."Query" AS q
LEFT OUTER JOIN
    __mj."QueryCategory" AS "MJQueryCategory_CategoryID"
  ON
    q."CategoryID" = "MJQueryCategory_CategoryID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    q."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
INNER JOIN
    __mj."SQLDialect" AS "MJSQLDialect_SQLDialectID"
  ON
    q."SQLDialectID" = "MJSQLDialect_SQLDialectID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwQueries" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateQuerySQL"(
    IN p_ID UUID DEFAULT NULL,
    IN p_QueryID UUID DEFAULT NULL,
    IN p_SQLDialectID UUID DEFAULT NULL,
    IN p_SQL TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwQuerySQLs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."QuerySQL"
            (
                "ID",
                "QueryID",
                "SQLDialectID",
                "SQL"
            )
        VALUES
            (
                p_ID,
                p_QueryID,
                p_SQLDialectID,
                p_SQL
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."QuerySQL"
            (
                "QueryID",
                "SQLDialectID",
                "SQL"
            )
        VALUES
            (
                p_QueryID,
                p_SQLDialectID,
                p_SQL
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwQuerySQLs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQuerySQL"(
    IN p_ID UUID,
    IN p_QueryID UUID,
    IN p_SQLDialectID UUID,
    IN p_SQL TEXT
)
RETURNS SETOF __mj."vwQuerySQLs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."QuerySQL"
    SET
        "QueryID" = p_QueryID,
        "SQLDialectID" = p_SQLDialectID,
        "SQL" = p_SQL
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwQuerySQLs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwQuerySQLs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQuerySQL"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QuerySQL"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateSQLDialect"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_PlatformKey VARCHAR(50) DEFAULT NULL,
    IN p_DatabaseName VARCHAR(100) DEFAULT NULL,
    IN p_LanguageName VARCHAR(100) DEFAULT NULL,
    IN p_VendorName VARCHAR(200) DEFAULT NULL,
    IN p_WebURL VARCHAR(500) DEFAULT NULL,
    IN p_Icon VARCHAR(500) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwSQLDialects" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."SQLDialect"
            (
                "ID",
                "Name",
                "PlatformKey",
                "DatabaseName",
                "LanguageName",
                "VendorName",
                "WebURL",
                "Icon",
                "Description"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_PlatformKey,
                p_DatabaseName,
                p_LanguageName,
                p_VendorName,
                p_WebURL,
                p_Icon,
                p_Description
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."SQLDialect"
            (
                "Name",
                "PlatformKey",
                "DatabaseName",
                "LanguageName",
                "VendorName",
                "WebURL",
                "Icon",
                "Description"
            )
        VALUES
            (
                p_Name,
                p_PlatformKey,
                p_DatabaseName,
                p_LanguageName,
                p_VendorName,
                p_WebURL,
                p_Icon,
                p_Description
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwSQLDialects" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateSQLDialect"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_PlatformKey VARCHAR(50),
    IN p_DatabaseName VARCHAR(100),
    IN p_LanguageName VARCHAR(100),
    IN p_VendorName VARCHAR(200),
    IN p_WebURL VARCHAR(500),
    IN p_Icon VARCHAR(500),
    IN p_Description TEXT
)
RETURNS SETOF __mj."vwSQLDialects" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."SQLDialect"
    SET
        "Name" = p_Name,
        "PlatformKey" = p_PlatformKey,
        "DatabaseName" = p_DatabaseName,
        "LanguageName" = p_LanguageName,
        "VendorName" = p_VendorName,
        "WebURL" = p_WebURL,
        "Icon" = p_Icon,
        "Description" = p_Description
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwSQLDialects" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwSQLDialects" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteSQLDialect"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SQLDialect"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQuery"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_UserQuestion TEXT DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_SQL TEXT DEFAULT NULL,
    IN p_TechnicalDescription TEXT DEFAULT NULL,
    IN p_OriginalSQL TEXT DEFAULT NULL,
    IN p_Feedback TEXT DEFAULT NULL,
    IN p_Status VARCHAR(15) DEFAULT NULL,
    IN p_QualityRank INTEGER DEFAULT NULL,
    IN p_ExecutionCostRank INTEGER DEFAULT NULL,
    IN p_UsesTemplate BOOLEAN DEFAULT NULL,
    IN p_AuditQueryRuns BOOLEAN DEFAULT NULL,
    IN p_CacheEnabled BOOLEAN DEFAULT NULL,
    IN p_CacheTTLMinutes INTEGER DEFAULT NULL,
    IN p_CacheMaxSize INTEGER DEFAULT NULL,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_CacheValidationSQL TEXT DEFAULT NULL,
    IN p_SQLDialectID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwQueries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Query"
            (
                "ID",
                "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_CategoryID,
                p_UserQuestion,
                p_Description,
                p_SQL,
                p_TechnicalDescription,
                p_OriginalSQL,
                p_Feedback,
                COALESCE(p_Status, 'Pending'),
                p_QualityRank,
                p_ExecutionCostRank,
                p_UsesTemplate,
                COALESCE(p_AuditQueryRuns, FALSE),
                COALESCE(p_CacheEnabled, FALSE),
                p_CacheTTLMinutes,
                p_CacheMaxSize,
                p_EmbeddingVector,
                p_EmbeddingModelID,
                p_CacheValidationSQL,
                CASE p_SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Query"
            (
                "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID"
            )
        VALUES
            (
                p_Name,
                p_CategoryID,
                p_UserQuestion,
                p_Description,
                p_SQL,
                p_TechnicalDescription,
                p_OriginalSQL,
                p_Feedback,
                COALESCE(p_Status, 'Pending'),
                p_QualityRank,
                p_ExecutionCostRank,
                p_UsesTemplate,
                COALESCE(p_AuditQueryRuns, FALSE),
                COALESCE(p_CacheEnabled, FALSE),
                p_CacheTTLMinutes,
                p_CacheMaxSize,
                p_EmbeddingVector,
                p_EmbeddingModelID,
                p_CacheValidationSQL,
                CASE p_SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQuery"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_CategoryID UUID,
    IN p_UserQuestion TEXT,
    IN p_Description TEXT,
    IN p_SQL TEXT,
    IN p_TechnicalDescription TEXT,
    IN p_OriginalSQL TEXT,
    IN p_Feedback TEXT,
    IN p_Status VARCHAR(15),
    IN p_QualityRank INTEGER,
    IN p_ExecutionCostRank INTEGER,
    IN p_UsesTemplate BOOLEAN,
    IN p_AuditQueryRuns BOOLEAN,
    IN p_CacheEnabled BOOLEAN,
    IN p_CacheTTLMinutes INTEGER,
    IN p_CacheMaxSize INTEGER,
    IN p_EmbeddingVector TEXT,
    IN p_EmbeddingModelID UUID,
    IN p_CacheValidationSQL TEXT,
    IN p_SQLDialectID UUID
)
RETURNS SETOF __mj."vwQueries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Query"
    SET
        "Name" = p_Name,
        "CategoryID" = p_CategoryID,
        "UserQuestion" = p_UserQuestion,
        "Description" = p_Description,
        "SQL" = p_SQL,
        "TechnicalDescription" = p_TechnicalDescription,
        "OriginalSQL" = p_OriginalSQL,
        "Feedback" = p_Feedback,
        "Status" = p_Status,
        "QualityRank" = p_QualityRank,
        "ExecutionCostRank" = p_ExecutionCostRank,
        "UsesTemplate" = p_UsesTemplate,
        "AuditQueryRuns" = p_AuditQueryRuns,
        "CacheEnabled" = p_CacheEnabled,
        "CacheTTLMinutes" = p_CacheTTLMinutes,
        "CacheMaxSize" = p_CacheMaxSize,
        "EmbeddingVector" = p_EmbeddingVector,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "CacheValidationSQL" = p_CacheValidationSQL,
        "SQLDialectID" = p_SQLDialectID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJDataContextItems_QueryIDID UUID;
    p_MJDataContextItems_QueryID_DataContextID UUID;
    p_MJDataContextItems_QueryID_Type VARCHAR(50);
    p_MJDataContextItems_QueryID_ViewID UUID;
    p_MJDataContextItems_QueryID_QueryID UUID;
    p_MJDataContextItems_QueryID_EntityID UUID;
    p_MJDataContextItems_QueryID_RecordID VARCHAR(450);
    p_MJDataContextItems_QueryID_SQL TEXT;
    p_MJDataContextItems_QueryID_DataJSON TEXT;
    p_MJDataContextItems_QueryID_LastRefreshedAt TIMESTAMPTZ;
    p_MJDataContextItems_QueryID_Description TEXT;
    p_MJDataContextItems_QueryID_CodeName VARCHAR(255);
    p_MJQueryEntities_QueryIDID UUID;
    p_MJQueryFields_QueryIDID UUID;
    p_MJQueryParameters_QueryIDID UUID;
    p_MJQueryPermissions_QueryIDID UUID;
    p_MJQuerySQLs_QueryIDID UUID;
BEGIN
-- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem


    FOR _rec IN SELECT "ID", "DataContextID", "Type", "ViewID", "QueryID", "EntityID", "RecordID", "SQL", "DataJSON", "LastRefreshedAt", "Description", "CodeName" FROM __mj."DataContextItem" WHERE "QueryID" = p_ID
    LOOP
        p_MJDataContextItems_QueryIDID := _rec."ID";
        p_MJDataContextItems_QueryID_DataContextID := _rec."DataContextID";
        p_MJDataContextItems_QueryID_Type := _rec."Type";
        p_MJDataContextItems_QueryID_ViewID := _rec."ViewID";
        p_MJDataContextItems_QueryID_QueryID := _rec."QueryID";
        p_MJDataContextItems_QueryID_EntityID := _rec."EntityID";
        p_MJDataContextItems_QueryID_RecordID := _rec."RecordID";
        p_MJDataContextItems_QueryID_SQL := _rec."SQL";
        p_MJDataContextItems_QueryID_DataJSON := _rec."DataJSON";
        p_MJDataContextItems_QueryID_LastRefreshedAt := _rec."LastRefreshedAt";
        p_MJDataContextItems_QueryID_Description := _rec."Description";
        p_MJDataContextItems_QueryID_CodeName := _rec."CodeName";
        -- Set the FK field to NULL
        p_MJDataContextItems_QueryID_QueryID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDataContextItem"(p_MJDataContextItems_QueryIDID, p_MJDataContextItems_QueryID_DataContextID, p_MJDataContextItems_QueryID_Type, p_MJDataContextItems_QueryID_ViewID, p_MJDataContextItems_QueryID_QueryID, p_MJDataContextItems_QueryID_EntityID, p_MJDataContextItems_QueryID_RecordID, p_MJDataContextItems_QueryID_SQL, p_MJDataContextItems_QueryID_DataJSON, p_MJDataContextItems_QueryID_LastRefreshedAt, p_MJDataContextItems_QueryID_Description, p_MJDataContextItems_QueryID_CodeName);

    END LOOP;

    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity

    FOR _rec IN SELECT "ID" FROM __mj."QueryEntity" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryEntities_QueryIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteQueryEntity"(p_MJQueryEntities_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField

    FOR _rec IN SELECT "ID" FROM __mj."QueryField" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryFields_QueryIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteQueryField"(p_MJQueryFields_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter

    FOR _rec IN SELECT "ID" FROM __mj."QueryParameter" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryParameters_QueryIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteQueryParameter"(p_MJQueryParameters_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission

    FOR _rec IN SELECT "ID" FROM __mj."QueryPermission" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryPermissions_QueryIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteQueryPermission"(p_MJQueryPermissions_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL

    FOR _rec IN SELECT "ID" FROM __mj."QuerySQL" WHERE "QueryID" = p_ID
    LOOP
        p_MJQuerySQLs_QueryIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteQuerySQL"(p_MJQuerySQLs_QueryIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Query"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateQuerySQL_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateQuerySQL" ON __mj."QuerySQL";
CREATE TRIGGER "trgUpdateQuerySQL"
    BEFORE UPDATE ON __mj."QuerySQL"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateQuerySQL_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateSQLDialect_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateSQLDialect" ON __mj."SQLDialect";
CREATE TRIGGER "trgUpdateSQLDialect"
    BEFORE UPDATE ON __mj."SQLDialect"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateSQLDialect_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateQuery_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateQuery" ON __mj."Query";
CREATE TRIGGER "trgUpdateQuery"
    BEFORE UPDATE ON __mj."Query"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateQuery_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO "__mj"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
      )
      VALUES (
         'c6cd026f-239f-4ca8-9adc-50e5b81ef230',
         'MJ: SQL Dialects',
         'SQL Dialects',
         NULL,
         NULL,
         'SQLDialect',
         'vwSQLDialects',
         '__mj',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      );
/* SQL generated to add new entity MJ: SQL Dialects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c6cd026f-239f-4ca8-9adc-50e5b81ef230', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'));
/* SQL generated to add new permission for entity MJ: SQL Dialects for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0);
/* SQL generated to add new permission for entity MJ: SQL Dialects for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0);
/* SQL generated to add new permission for entity MJ: SQL Dialects for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1);
/* SQL generated to create new entity MJ: Query SQLs */

INSERT INTO "__mj"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
      )
      VALUES (
         'fe37218e-259f-47f2-909d-9aecbe5385db',
         'MJ: Query SQLs',
         'Query SQLs',
         NULL,
         NULL,
         'QuerySQL',
         'vwQuerySQLs',
         '__mj',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      );
/* SQL generated to add new entity MJ: Query SQLs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fe37218e-259f-47f2-909d-9aecbe5385db', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'));
/* SQL generated to add new permission for entity MJ: Query SQLs for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0);
/* SQL generated to add new permission for entity MJ: Query SQLs for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0);
/* SQL generated to add new permission for entity MJ: Query SQLs for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1);
/* SQL text to add special date field "__mj_CreatedAt" to entity __mj."SQLDialect" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '5d25f06d-7fc2-4710-a2f8-b8fe86cd482b'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'ID')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '5d25f06d-7fc2-4710-a2f8-b8fe86cd482b',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'newsequentialid()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        1,
        0,
        0,
        1,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'ea72829b-b531-497a-aab4-a78dda81c113'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'Name')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'ea72829b-b531-497a-aab4-a78dda81c113',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100002,
        'Name',
        'Name',
        'Unique display name for the SQL dialect (e.g., T-SQL, PostgreSQL)',
        'TEXT',
        200,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        1,
        1,
        0,
        1,
        0,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'd690750e-bc40-41f7-8f99-14ab36beab5b'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'PlatformKey')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'd690750e-bc40-41f7-8f99-14ab36beab5b',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100003,
        'PlatformKey',
        'Platform Key',
        'Lowercase identifier matching DatabasePlatform type in code (e.g., sqlserver, postgresql). Used by providers to find their dialect at runtime.',
        'TEXT',
        100,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '711ae31a-847e-4c4e-852b-c3390ae480c9'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'DatabaseName')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '711ae31a-847e-4c4e-852b-c3390ae480c9',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100004,
        'DatabaseName',
        'Database Name',
        'Name of the database engine (e.g., SQL Server, PostgreSQL, MySQL)',
        'TEXT',
        200,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '0320a305-4065-4a67-921d-d6cf9c7fba69'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'LanguageName')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '0320a305-4065-4a67-921d-d6cf9c7fba69',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100005,
        'LanguageName',
        'Language Name',
        'Name of the SQL language variant (e.g., T-SQL, PL/pgSQL, SQL/PSM)',
        'TEXT',
        200,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '99b589ba-2c1b-47f3-b7d0-0a1ff1e97198'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'VendorName')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '99b589ba-2c1b-47f3-b7d0-0a1ff1e97198',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100006,
        'VendorName',
        'Vendor Name',
        'Primary vendor or organization behind this database (e.g., Microsoft, PostgreSQL Global Development Group)',
        'TEXT',
        400,
        0,
        0,
        1,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '29663992-2b7e-4b22-b726-f23abea906d2'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'WebURL')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '29663992-2b7e-4b22-b726-f23abea906d2',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100007,
        'WebURL',
        'Web URL',
        'URL to the database vendor or documentation website',
        'TEXT',
        1000,
        0,
        0,
        1,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'c948f312-3ed8-4e57-8805-c65d1bde9767'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'Icon')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'c948f312-3ed8-4e57-8805-c65d1bde9767',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100008,
        'Icon',
        'Icon',
        'CSS class or icon reference for UI display',
        'TEXT',
        1000,
        0,
        0,
        1,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'db0e0e22-3c5b-4e14-bd92-7ee4a6044929'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = 'Description')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'db0e0e22-3c5b-4e14-bd92-7ee4a6044929',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100009,
        'Description',
        'Description',
        'Detailed description of this SQL dialect and its characteristics',
        'TEXT',
        -1,
        0,
        0,
        1,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '52676912-1fbe-4fc2-a7ee-d816bf3cebe0'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = '__mj_CreatedAt')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '52676912-1fbe-4fc2-a7ee-d816bf3cebe0',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100010,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'getutcdate()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'be642b48-8232-4584-a0a3-acda406bc297'  OR
        ("EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND "Name" = '__mj_UpdatedAt')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'be642b48-8232-4584-a0a3-acda406bc297',
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- "Entity": "MJ": "SQL" "Dialects"
        100011,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'getutcdate()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '250edad5-57ff-4ceb-a2a3-3c932c120fa9'  OR
        ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SQLDialectID')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '250edad5-57ff-4ceb-a2a3-3c932c120fa9',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        100047,
        'SQLDialectID',
        'SQL Dialect ID',
        'The SQL dialect that the SQL column is written in. Defaults to T-SQL for backward compatibility.',
        'UUID',
        16,
        0,
        0,
        0,
        '1F203987-A37B-4BC1-85B3-BA50DC33C3E0',
        0,
        1,
        0,
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'e3cdac73-8b3e-4c31-9c81-f5e780c68436'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'ID')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'e3cdac73-8b3e-4c31-9c81-f5e780c68436',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'newsequentialid()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        1,
        0,
        0,
        1,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'cf1fb8dc-b8cb-4b59-9d66-40dcfc19eaea'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'QueryID')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'cf1fb8dc-b8cb-4b59-9d66-40dcfc19eaea',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100002,
        'QueryID',
        'Query ID',
        'Foreign key to the query this SQL variant belongs to',
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        '1B248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        0,
        0,
        1,
        0,
        0,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'e38f14e4-644a-4a90-a80a-19245ba59e97'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'SQLDialectID')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'e38f14e4-644a-4a90-a80a-19245ba59e97',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100003,
        'SQLDialectID',
        'SQL Dialect ID',
        'Foreign key to the SQL dialect this SQL is written in',
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
        'ID',
        0,
        0,
        1,
        0,
        0,
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '9b29ac05-61d8-4dd2-9780-ff9040b17140'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'SQL')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '9b29ac05-61d8-4dd2-9780-ff9040b17140',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100004,
        'SQL',
        'SQL',
        'The SQL query text in the specified dialect. May include Nunjucks template parameters.',
        'TEXT',
        -1,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '4ea8cf6e-d64f-4741-816e-61de1b337b0e'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = '__mj_CreatedAt')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '4ea8cf6e-d64f-4741-816e-61de1b337b0e',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100005,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'getutcdate()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '642cf0f5-0277-42e1-9837-1fd764803de6'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = '__mj_UpdatedAt')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '642cf0f5-0277-42e1-9837-1fd764803de6',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100006,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'getutcdate()',
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = '6abdabc9-0b46-489f-91e1-5a127c51efff'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence")
        VALUES ('6abdabc9-0b46-489f-91e1-5a127c51efff', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'SQLDialectID', 'One To Many', 1, 1, 6);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = 'b4081c69-5310-4fb1-825a-b1d2096ff1c6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence")
        VALUES ('b4081c69-5310-4fb1-825a-b1d2096ff1c6', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'SQLDialectID', 'One To Many', 1, 1, 1);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = '5a2809f4-b3b7-44a2-a07a-51e71554e6dc'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence")
        VALUES ('5a2809f4-b3b7-44a2-a07a-51e71554e6dc', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'QueryID', 'One To Many', 1, 1, 2);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '2f42f7b6-12ec-4f34-8a1c-981879499727'  OR
        ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SQLDialect')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '2f42f7b6-12ec-4f34-8a1c-981879499727',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        100051,
        'SQLDialect',
        'SQL Dialect',
        NULL,
        'TEXT',
        200,
        0,
        0,
        0,
        'null',
        0,
        0,
        1,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '3d6b3d9a-599c-4ee0-80e3-8f8ff3735849'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'Query')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '3d6b3d9a-599c-4ee0-80e3-8f8ff3735849',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100013,
        'Query',
        'Query',
        NULL,
        'TEXT',
        510,
        0,
        0,
        0,
        'null',
        0,
        0,
        1,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'fd15d419-8f40-4c0c-b365-880b6a84702e'  OR
        ("EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND "Name" = 'SQLDialect')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        'fd15d419-8f40-4c0c-b365-880b6a84702e',
        'FE37218E-259F-47F2-909D-9AECBE5385DB', -- "Entity": "MJ": "Query" "SQLs"
        100014,
        'SQLDialect',
        'SQL Dialect',
        NULL,
        'TEXT',
        200,
        0,
        0,
        0,
        'null',
        0,
        0,
        1,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search'
        );
    END IF;
END $$;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '711AE31A-847E-4C4E-852B-C3390AE480C9'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '0320A305-4065-4A67-921D-D6CF9C7FBA69'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '711AE31A-847E-4C4E-852B-C3390AE480C9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '0320A305-4065-4A67-921D-D6CF9C7FBA69'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '2F42F7B6-12EC-4F34-8A1C-981879499727'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '2F42F7B6-12EC-4F34-8A1C-981879499727'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE "__mj"."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
            AND "AutoUpdateIsNameField" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '642CF0F5-0277-42E1-9837-1FD764803DE6'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'FD15D419-8F40-4C0C-B365-880B6A84702E'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'FD15D419-8F40-4C0C-B365-880B6A84702E'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: SQL Dialects."ID"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D25F06D-7FC2-4710-A2F8-B8FE86CD482B' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."Name"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Dialect Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA72829B-B531-497A-AAB4-A78DDA81C113' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."DatabaseName"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Dialect Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '711AE31A-847E-4C4E-852B-C3390AE480C9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."LanguageName"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Dialect Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0320A305-4065-4A67-921D-D6CF9C7FBA69' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."Description"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Dialect Information',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB0E0E22-3C5B-4E14-BD92-7EE4A6044929' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."PlatformKey"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Integration & Resources',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."Icon"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Integration & Resources',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C948F312-3ED8-4E57-8805-C65D1BDE9767' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."VendorName"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Integration & Resources',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."WebURL"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Integration & Resources',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '29663992-2B7E-4B22-B726-F23ABEA906D2' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."__mj_CreatedAt"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52676912-1FBE-4FC2-A7EE-D816BF3CEBE0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: SQL Dialects."__mj_UpdatedAt"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BE642B48-8232-4584-A0A3-ACDA406BC297' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-database */

UPDATE "__mj"."Entity"
               SET "Icon" = 'fa fa-database', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('ef11701f-c84d-4aef-99da-d46e1b6bd6a6', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FieldCategoryInfo', '{"Dialect Information":{"icon":"fa fa-language","description":"Core identification and descriptive details of the SQL dialect and its language variant"},"Integration & Resources":{"icon":"fa fa-microchip","description":"Technical keys for system integration, UI icons, and external vendor resources"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit tracking timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c717fe16-f343-4c57-b239-499e30406a65', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FieldCategoryIcons', '{"Dialect Information":"fa fa-language","Integration & Resources":"fa fa-microchip","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE "__mj"."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230';
/* Set categories for 8 fields */
-- UPDATE Entity Field Category Info MJ: Query SQLs."SQL"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'SQL Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'SQL Query',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '9B29AC05-61D8-4DD2-9780-FF9040B17140' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."SQLDialectID"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'SQL Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'SQL Dialect',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E38F14E4-644A-4A90-A80A-19245BA59E97' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."SQLDialect"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'SQL Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Dialect Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD15D419-8F40-4C0C-B365-880B6A84702E' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."QueryID"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Query Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF1FB8DC-B8CB-4B59-9D66-40DCFC19EAEA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."Query"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Query Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."ID"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3CDAC73-8B3E-4C31-9C81-F5E780C68436' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."__mj_CreatedAt"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4EA8CF6E-D64F-4741-816E-61DE1B337B0E' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query SQLs."__mj_UpdatedAt"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '642CF0F5-0277-42E1-9837-1FD764803DE6' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-terminal */

UPDATE "__mj"."Entity"
               SET "Icon" = 'fa fa-terminal', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('e0028b4a-3728-4974-9946-900431a745e3', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'FieldCategoryInfo', '{"SQL Definition":{"icon":"fa fa-code","description":"The actual SQL code and the specific dialect (PostgreSQL, SQL Server, etc.) it is written for"},"Query Context":{"icon":"fa fa-link","description":"Relationships linking this SQL variant to its parent query definition"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('3590cfc4-ba8c-4b1c-82d2-e8215ae5d207', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'FieldCategoryIcons', '{"SQL Definition":"fa fa-code","Query Context":"fa fa-link","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE "__mj"."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'FE37218E-259F-47F2-909D-9AECBE5385DB';
/* Set categories for 26 fields */
-- UPDATE Entity Field Category Info MJ: Queries."ID"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '874317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Name"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '884317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CategoryID"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Category"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '774E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."UserQuestion"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Description"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '894317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQL"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '8B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQLDialectID"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'SQL Dialect',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '250EDAD5-57FF-4CEB-A2A3-3C932C120FA9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQLDialect"

UPDATE "__mj"."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'SQL Dialect Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F42F7B6-12EC-4F34-8A1C-981879499727' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."TechnicalDescription"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."OriginalSQL"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '8C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."UsesTemplate"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Feedback"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '724E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Status"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '734E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."QualityRank"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '744E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."ExecutionCostRank"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."AuditQueryRuns"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1CA275F3-757F-4D4D-8EE3-2443393CD676' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheEnabled"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F075DB33-92E3-45D9-86BB-08711205829D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheTTLMinutes"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Cache TTL (Minutes)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0420AC10-6902-484B-B976-1C51573EDF4C' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheMaxSize"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '89288495-3472-436F-860D-AEE7F746CFF9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheValidationSQL"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '2DF7C600-B13B-4E58-9DCD-173C82F13770' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingVector"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CDBF7167-76D6-41DE-A50D-01CBFFEDC1E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingModelID"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '00136468-3433-4B6C-BCEF-649E76497AFC' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingModel"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B241317-2875-4E3C-B80E-952C7270A308' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."__mj_CreatedAt"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '274D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."__mj_UpdatedAt"

UPDATE "__mj"."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwQuerySQLs" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: Permissions for vwQuerySQLs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwQuerySQLs" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spCreateQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QuerySQL
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuerySQL" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Query SQLs */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuerySQL" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spUpdateQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QuerySQL
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuerySQL" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuerySQL" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spDeleteQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QuerySQL
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuerySQL" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query SQLs */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuerySQL" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SQLDialect */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: vwSQLDialects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: SQL Dialects
-----               SCHEMA:      __mj
-----               BASE TABLE:  SQLDialect
-----               PRIMARY KEY: ID
------------------------------------------------------------;

GRANT SELECT ON __mj."vwSQLDialects" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: Permissions for vwSQLDialects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwSQLDialects" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spCreateSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SQLDialect
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSQLDialect" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: SQL Dialects */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateSQLDialect" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spUpdateSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SQLDialect
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSQLDialect" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateSQLDialect" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spDeleteSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SQLDialect
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSQLDialect" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: SQL Dialects */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSQLDialect" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query;

GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer", "cdp_UI", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwQueries" TO "cdp_Developer", "cdp_UI", "cdp_Integration";

/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Queries */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQuery" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Queries */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."SQLDialect"."Name" IS 'Unique display name for the SQL dialect (e.g., T-SQL, PostgreSQL)';

COMMENT ON COLUMN __mj."SQLDialect"."PlatformKey" IS 'Lowercase identifier matching DatabasePlatform type in code (e.g., sqlserver, postgresql). Used by providers to find their dialect at runtime.';

COMMENT ON COLUMN __mj."SQLDialect"."DatabaseName" IS 'Name of the database engine (e.g., SQL Server, PostgreSQL, MySQL)';

COMMENT ON COLUMN __mj."SQLDialect"."LanguageName" IS 'Name of the SQL language variant (e.g., T-SQL, PL/pgSQL, SQL/PSM)';

COMMENT ON COLUMN __mj."SQLDialect"."VendorName" IS 'Primary vendor or organization behind this database (e.g., Microsoft, PostgreSQL Global Development Group)';

COMMENT ON COLUMN __mj."SQLDialect"."WebURL" IS 'URL to the database vendor or documentation website';

COMMENT ON COLUMN __mj."SQLDialect"."Icon" IS 'CSS class or icon reference for UI display';

COMMENT ON COLUMN __mj."SQLDialect"."Description" IS 'Detailed description of this SQL dialect and its characteristics';

COMMENT ON COLUMN __mj."QuerySQL"."QueryID" IS 'Foreign key to the query this SQL variant belongs to';

COMMENT ON COLUMN __mj."QuerySQL"."SQLDialectID" IS 'Foreign key to the SQL dialect this SQL is written in';

COMMENT ON COLUMN __mj."QuerySQL"."SQL" IS 'The SQL query text in the specified dialect. May include Nunjucks template parameters.';

COMMENT ON COLUMN __mj."Query"."SQLDialectID" IS 'The SQL dialect that the SQL column is written in. Defaults to T-SQL for backward compatibility.';


-- ===================== Other =====================

-- Extended properties for SQLDialect

-- Extended properties for QuerySQL

-- CODEGEN RUN 
/* SQL generated to create new entity MJ: SQL Dialects */

/* spUpdate Permissions for MJ: Query SQLs */

/* spUpdate Permissions for MJ: SQL Dialects */

/* spUpdate Permissions for MJ: Queries */
