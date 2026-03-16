-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

/*************************************************************
 * Sub-Phase A: Composable Query Engine — Schema Changes
 *
 * 1. Add Reusable BOOLEAN column to Query table
 * 2. Create QueryDependency table
 *
 * CodeGen handles: views, stored procedures, entity metadata,
 * EntityField records, and all other metadata registration.
 *************************************************************/

-- ============================================================
-- 1. Add Reusable column to Query table
-- ============================================================
ALTER TABLE __mj."Query"
 ADD COLUMN "Reusable" BOOLEAN NOT NULL CONSTRAINT DF_Query_Reusable DEFAULT 0;

-- ============================================================
-- 2. Create QueryDependency table
-- ============================================================
CREATE TABLE __mj."QueryDependency" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "QueryID" UUID NOT NULL,
 "DependsOnQueryID" UUID NOT NULL,
 "ReferencePath" VARCHAR(500) NOT NULL,
 "Alias" VARCHAR(100) NULL,
 "ParameterMapping" TEXT NULL,
 "DetectionMethod" VARCHAR(20) NOT NULL CONSTRAINT DF_QueryDependency_DetectionMethod DEFAULT 'Auto',
 CONSTRAINT PK_QueryDependency PRIMARY KEY ("ID"),
 CONSTRAINT FK_QueryDependency_Query FOREIGN KEY ("QueryID")
 REFERENCES __mj."Query"("ID"),
 CONSTRAINT FK_QueryDependency_DependsOn FOREIGN KEY ("DependsOnQueryID")
 REFERENCES __mj."Query"("ID"),
 CONSTRAINT UQ_QueryDependency UNIQUE ("QueryID", "DependsOnQueryID", "ReferencePath"),
 CONSTRAINT CK_QueryDependency_DetectionMethod
 CHECK ("DetectionMethod" IN ('Auto', 'Manual'))
);

ALTER TABLE __mj."QueryDependency"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."QueryDependency" */;

ALTER TABLE __mj."QueryDependency"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to insert new entity field */;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QueryDependency_QueryID" ON __mj."QueryDependency" ("QueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_QueryDependency_DependsOnQueryID" ON __mj."QueryDependency" ("DependsOnQueryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_CategoryID" ON __mj."Query" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID" ON __mj."Query" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Query_SQLDialectID" ON __mj."Query" ("SQLDialectID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwQueryDependencies"
AS SELECT
    q.*,
    "MJQuery_QueryID"."Name" AS "Query",
    "MJQuery_DependsOnQueryID"."Name" AS "DependsOnQuery"
FROM
    __mj."QueryDependency" AS q
INNER JOIN
    __mj."Query" AS "MJQuery_QueryID"
  ON
    q."QueryID" = "MJQuery_QueryID"."ID"
INNER JOIN
    __mj."Query" AS "MJQuery_DependsOnQueryID"
  ON
    q."DependsOnQueryID" = "MJQuery_DependsOnQueryID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwQueryDependencies" CASCADE;
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

CREATE OR REPLACE FUNCTION __mj."spCreateQueryDependency"(
    IN p_ID UUID DEFAULT NULL,
    IN p_QueryID UUID DEFAULT NULL,
    IN p_DependsOnQueryID UUID DEFAULT NULL,
    IN p_ReferencePath VARCHAR(500) DEFAULT NULL,
    IN p_Alias VARCHAR(100) DEFAULT NULL,
    IN p_ParameterMapping TEXT DEFAULT NULL,
    IN p_DetectionMethod VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwQueryDependencies" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."QueryDependency"
            (
                "ID",
                "QueryID",
                "DependsOnQueryID",
                "ReferencePath",
                "Alias",
                "ParameterMapping",
                "DetectionMethod"
            )
        VALUES
            (
                p_ID,
                p_QueryID,
                p_DependsOnQueryID,
                p_ReferencePath,
                p_Alias,
                p_ParameterMapping,
                COALESCE(p_DetectionMethod, 'Auto')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."QueryDependency"
            (
                "QueryID",
                "DependsOnQueryID",
                "ReferencePath",
                "Alias",
                "ParameterMapping",
                "DetectionMethod"
            )
        VALUES
            (
                p_QueryID,
                p_DependsOnQueryID,
                p_ReferencePath,
                p_Alias,
                p_ParameterMapping,
                COALESCE(p_DetectionMethod, 'Auto')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwQueryDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryDependency"(
    IN p_ID UUID,
    IN p_QueryID UUID,
    IN p_DependsOnQueryID UUID,
    IN p_ReferencePath VARCHAR(500),
    IN p_Alias VARCHAR(100),
    IN p_ParameterMapping TEXT,
    IN p_DetectionMethod VARCHAR(20)
)
RETURNS SETOF __mj."vwQueryDependencies" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."QueryDependency"
    SET
        "QueryID" = p_QueryID,
        "DependsOnQueryID" = p_DependsOnQueryID,
        "ReferencePath" = p_ReferencePath,
        "Alias" = p_Alias,
        "ParameterMapping" = p_ParameterMapping,
        "DetectionMethod" = p_DetectionMethod
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwQueryDependencies" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwQueryDependencies" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryDependency"
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
    IN p_SQLDialectID UUID DEFAULT NULL,
    IN p_Reusable BOOLEAN DEFAULT NULL
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
                "SQLDialectID",
                "Reusable"
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
                CASE p_SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_Reusable, FALSE)
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
                "SQLDialectID",
                "Reusable"
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
                CASE p_SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_Reusable, FALSE)
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
    IN p_SQLDialectID UUID,
    IN p_Reusable BOOLEAN
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
        "SQLDialectID" = p_SQLDialectID,
        "Reusable" = p_Reusable
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
    p_MJQueryDependencies_QueryIDID UUID;
    p_MJQueryDependencies_DependsOnQueryIDID UUID;
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

    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryDependencies_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_MJQueryDependencies_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "DependsOnQueryID" = p_ID
    LOOP
        p_MJQueryDependencies_DependsOnQueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_MJQueryDependencies_DependsOnQueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity

    FOR _rec IN SELECT "ID" FROM __mj."QueryEntity" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryEntities_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryEntity"(p_MJQueryEntities_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField

    FOR _rec IN SELECT "ID" FROM __mj."QueryField" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryFields_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryField"(p_MJQueryFields_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter

    FOR _rec IN SELECT "ID" FROM __mj."QueryParameter" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryParameters_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryParameter"(p_MJQueryParameters_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission

    FOR _rec IN SELECT "ID" FROM __mj."QueryPermission" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryPermissions_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryPermission"(p_MJQueryPermissions_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL

    FOR _rec IN SELECT "ID" FROM __mj."QuerySQL" WHERE "QueryID" = p_ID
    LOOP
        p_MJQuerySQLs_QueryIDID := _rec."ID";
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateQueryDependency_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateQueryDependency" ON __mj."QueryDependency";
CREATE TRIGGER "trgUpdateQueryDependency"
    BEFORE UPDATE ON __mj."QueryDependency"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateQueryDependency_func"();

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

INSERT INTO __mj."Entity" (
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
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a',
         'MJ: Query Dependencies',
         'Query Dependencies',
         'Tracks which queries reference other queries via composition syntax. Auto-populated by the query save pipeline.',
         NULL,
         'QueryDependency',
         'vwQueryDependencies',
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
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: Query Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Query Dependencies for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Query Dependencies for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: Query Dependencies for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."QueryDependency" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bed169e9-d673-4aaa-8a63-ff8ca0cde8cb' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bed169e9-d673-4aaa-8a63-ff8ca0cde8cb',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'gen_random_uuid()',
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '09de6c3f-0506-4ccb-9f64-c43ae3f426c0' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'QueryID')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '09de6c3f-0506-4ccb-9f64-c43ae3f426c0',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100002,
        'QueryID',
        'Query ID',
        'Foreign key to the query that contains the composition reference.',
        'UUID',
        16,
        0,
        0,
        0,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd6fed8f-1e8c-4658-9d13-b361430c7303' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'DependsOnQueryID')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'dd6fed8f-1e8c-4658-9d13-b361430c7303',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100003,
        'DependsOnQueryID',
        'Depends On Query ID',
        'Foreign key to the referenced (depended-upon) query.',
        'UUID',
        16,
        0,
        0,
        0,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cb10b534-3af4-4d7b-a5f5-42a9f1ec7e43' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'ReferencePath')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cb10b534-3af4-4d7b-a5f5-42a9f1ec7e43',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100004,
        'ReferencePath',
        'Reference Path',
        'The full composition reference path as written in the SQL.',
        'TEXT',
        1000,
        0,
        0,
        0,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7baf397e-775f-4b18-bac1-81fef4a1e30b' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'Alias')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7baf397e-775f-4b18-bac1-81fef4a1e30b',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100005,
        'Alias',
        'Alias',
        'SQL alias used for the composed CTE in the referencing query.',
        'TEXT',
        200,
        0,
        0,
        1,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b64128c-c0ce-4d98-a13c-69fe233b1abe' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'ParameterMapping')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1b64128c-c0ce-4d98-a13c-69fe233b1abe',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100006,
        'ParameterMapping',
        'Parameter Mapping',
        'JSON object mapping parameter names to values or pass-through parameter names.',
        'TEXT',
        -1,
        0,
        0,
        1,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a517c8b7-e1b5-4042-acda-b94d0d215e93' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'DetectionMethod')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a517c8b7-e1b5-4042-acda-b94d0d215e93',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100007,
        'DetectionMethod',
        'Detection Method',
        'How the dependency was detected: Auto (parsed from SQL) or Manual (user-specified).',
        'TEXT',
        40,
        0,
        0,
        0,
        'Auto',
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2bbd0b19-ae1e-4dd6-b5f0-25996bf4e015' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2bbd0b19-ae1e-4dd6-b5f0-25996bf4e015',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100008,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bd169b61-1e4d-480f-8f9f-d23778a8bbfd' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bd169b61-1e4d-480f-8f9f-d23778a8bbfd',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100009,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b65b3b9-7ebc-4bdf-b094-691b2cd96fbc' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Reusable')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1b65b3b9-7ebc-4bdf-b094-691b2cd96fbc',
        '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Queries"
        100050,
        'Reusable',
        'Reusable',
        'When true, this query can be referenced by other queries using composition syntax. Only queries that are both Reusable and Approved can be composed into other queries.',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(0)',
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e3455b95-1c78-4995-b4e8-e4fd225191d6', 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93', 1, 'Auto', 'Auto', NOW(), NOW());
/* SQL text to insert entity field value with ID e7fea35b-20d4-4062-a01d-dbc0fa8c9310 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e7fea35b-20d4-4062-a01d-dbc0fa8c9310', 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93', 2, 'Manual', 'Manual', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID A517C8B7-E1B5-4042-ACDA-B94D0D215E93 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='A517C8B7-E1B5-4042-ACDA-B94D0D215E93';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=3 WHERE "ID"='5978FE3A-1BE9-4CFB-83B6-E9B34CBB587E';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='EA37F71B-6463-4D68-996C-BD69CC10EC21';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='7DDC2EF5-7E08-490C-8409-F576A303E3DE';
/* Create Entity Relationship: MJ: Queries -> MJ: Query Dependencies (One To Many via DependsOnQueryID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '85542755-2a36-4477-b4d1-9a758540e210'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('85542755-2a36-4477-b4d1-9a758540e210', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'DependsOnQueryID', 'One To Many', 1, 1, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4406a873-d594-4d55-8b9f-5275dbf3e07f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4406a873-d594-4d55-8b9f-5275dbf3e07f', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'QueryID', 'One To Many', 1, 1, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dcf286d-4abc-4b88-aece-5f0665506446' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'Query')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4dcf286d-4abc-4b88-aece-5f0665506446',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100019,
        'Query',
        'Query',
        NULL,
        'TEXT',
        510,
        0,
        0,
        0,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '46ead876-24f9-40f7-befb-06576fd68625' OR ("EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND "Name" = 'DependsOnQuery')
    ) THEN
        INSERT INTO __mj."EntityField"
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
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '46ead876-24f9-40f7-befb-06576fd68625',
        'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- "Entity": "MJ": "Query" "Dependencies"
        100020,
        'DependsOnQuery',
        'Depends On Query',
        NULL,
        'TEXT',
        510,
        0,
        0,
        0,
        NULL,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '4DCF286D-4ABC-4B88-AECE-5F0665506446'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '46EAD876-24F9-40F7-BEFB-06576FD68625'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '4DCF286D-4ABC-4B88-AECE-5F0665506446'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '46EAD876-24F9-40F7-BEFB-06576FD68625'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: Query Dependencies."QueryID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Query',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09DE6C3F-0506-4CCB-9F64-C43AE3F426C0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."Query"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Query Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4DCF286D-4ABC-4B88-AECE-5F0665506446' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."DependsOnQueryID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Depends On Query',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD6FED8F-1E8C-4658-9D13-B361430C7303' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."DependsOnQuery"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Relationships',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Target Query Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '46EAD876-24F9-40F7-BEFB-06576FD68625' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."ReferencePath"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Composition Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."Alias"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Composition Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."ParameterMapping"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Composition Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1B64128C-C0CE-4D98-A13C-69FE233B1ABE' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."DetectionMethod"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Composition Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BED169E9-D673-4AAA-8A63-FF8CA0CDE8CB' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2BBD0B19-AE1E-4DD6-B5F0-25996BF4E015' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Query Dependencies.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BD169B61-1E4D-480F-8F9F-D23778A8BBFD' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-project-diagram */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('264145eb-c726-431e-a254-2e56cc3029f2', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'FieldCategoryInfo', '{"Dependency Relationships":{"icon":"fa fa-link","description":"Links between the referencing query and the query it depends upon"},"Composition Details":{"icon":"fa fa-info-circle","description":"Technical details regarding the SQL alias, pathing, and parameter mapping"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system-managed identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('536b34ae-1c24-478a-9621-2f9f929c0e49', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'FieldCategoryIcons', '{"Dependency Relationships":"fa fa-link","Composition Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A';
/* Set categories for 27 fields */
-- UPDATE Entity Field Category Info MJ: Queries."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '874317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '274D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '884317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '774E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."UserQuestion"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '894317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '8B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."TechnicalDescription"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."OriginalSQL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '8C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."UsesTemplate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQLDialectID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '250EDAD5-57FF-4CEB-A2A3-3C932C120FA9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."SQLDialect"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F42F7B6-12EC-4F34-8A1C-981879499727' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Reusable"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Query Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Reusable',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B65B3B9-7EBC-4BDF-B094-691B2CD96FBC' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Feedback"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '724E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '734E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."QualityRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '744E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."ExecutionCostRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."AuditQueryRuns"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1CA275F3-757F-4D4D-8EE3-2443393CD676' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F075DB33-92E3-45D9-86BB-08711205829D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheTTLMinutes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0420AC10-6902-484B-B976-1C51573EDF4C' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheMaxSize"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '89288495-3472-436F-860D-AEE7F746CFF9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."CacheValidationSQL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'SQL'
WHERE 
   "ID" = '2DF7C600-B13B-4E58-9DCD-173C82F13770' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingVector"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CDBF7167-76D6-41DE-A50D-01CBFFEDC1E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '00136468-3433-4B6C-BCEF-649E76497AFC' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Queries."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B241317-2875-4E3C-B80E-952C7270A308' AND "AutoUpdateCategory" = 1;


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwQueryDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: Permissions for vwQueryDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwQueryDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spCreateQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQueryDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Query Dependencies */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateQueryDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spUpdateQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateQueryDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spDeleteQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Dependencies */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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

COMMENT ON COLUMN __mj."Query"."Reusable" IS 'When true, this query can be referenced by other queries using composition syntax. Only queries that are both Reusable and Approved can be composed into other queries.';

COMMENT ON TABLE __mj."QueryDependency" IS 'Tracks which queries reference other queries via composition syntax. Auto-populated by the query save pipeline.';

COMMENT ON COLUMN __mj."QueryDependency"."QueryID" IS 'Foreign key to the query that contains the composition reference.';

COMMENT ON COLUMN __mj."QueryDependency"."DependsOnQueryID" IS 'Foreign key to the referenced (depended-upon) query.';

COMMENT ON COLUMN __mj."QueryDependency"."ReferencePath" IS 'The full composition reference path as written in the SQL.';

COMMENT ON COLUMN __mj."QueryDependency"."Alias" IS 'SQL alias used for the composed CTE in the referencing query.';

COMMENT ON COLUMN __mj."QueryDependency"."ParameterMapping" IS 'JSON object mapping parameter names to values or pass-through parameter names.';

COMMENT ON COLUMN __mj."QueryDependency"."DetectionMethod" IS 'How the dependency was detected: Auto (parsed from SQL) or Manual (user-specified).';


-- ===================== Other =====================

-- CODE GEN RUN 
/* SQL generated to create new entity MJ: Query Dependencies */

/* spUpdate Permissions for MJ: Query Dependencies */

/* spUpdate Permissions for MJ: Queries */
