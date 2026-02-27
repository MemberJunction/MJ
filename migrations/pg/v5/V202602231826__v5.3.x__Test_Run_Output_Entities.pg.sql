-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
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

/**************************************************************************************************
 * Migration: Test Run Output Entities
 *
 * Purpose: Create two new generic entities for storing structured, sequenced outputs from test runs.
 * Any test type can use these for output storage (screenshots, logs, data, video, audio, etc.).
 *
 * Entities created:
 * 1. MJ: Test Run Output Types - Lookup table for output categories
 * 2. MJ: Test Run Outputs - Individual output artifacts from test runs
 *
 * Version: 4.4.x
 **************************************************************************************************/

-- ============================================================================
-- 1. TestRunOutputType (MJ: Test Run Output Types)
-- ============================================================================
CREATE TABLE __mj."TestRunOutputType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" TEXT NULL,
 CONSTRAINT "PK_TestRunOutputType" PRIMARY KEY ("ID"),
 CONSTRAINT "UQ_TestRunOutputType_Name" UNIQUE ("Name")
);

-- ============================================================================
-- 2. TestRunOutput (MJ: Test Run Outputs)
-- ============================================================================
CREATE TABLE __mj."TestRunOutput" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "TestRunID" UUID NOT NULL,
 "OutputTypeID" UUID NOT NULL,
 "Sequence" INTEGER NOT NULL DEFAULT 0,
 "StepNumber" INTEGER NULL,
 "Name" VARCHAR(255) NULL,
 "Description" TEXT NULL,
 "MimeType" VARCHAR(100) NULL,
 "InlineData" TEXT NULL,
 "FileSizeBytes" INTEGER NULL,
 "Width" INTEGER NULL,
 "Height" INTEGER NULL,
 "DurationSeconds" DECIMAL(10, 3) NULL,
 "Metadata" TEXT NULL,
 CONSTRAINT "PK_TestRunOutput" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_TestRunOutput_TestRun" FOREIGN KEY ("TestRunID")
 REFERENCES __mj."TestRun"("ID"),
 CONSTRAINT "FK_TestRunOutput_OutputType" FOREIGN KEY ("OutputTypeID")
 REFERENCES __mj."TestRunOutputType"("ID")
);

ALTER TABLE __mj."TestRunOutput" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TestRunOutput" */;

ALTER TABLE __mj."TestRunOutput" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TestRunOutputType" */;

ALTER TABLE __mj."TestRunOutputType" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."TestRunOutputType" */;

ALTER TABLE __mj."TestRunOutputType" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to insert new entity field */;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunOutput_TestRunID' 
--     AND object_id = OBJECT_ID('"__mj"."TestRunOutput"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_TestRunOutput_TestRunID ON __mj."TestRunOutput" ("TestRunID");

-- Index for foreign key OutputTypeID in table TestRunOutput;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunOutput_OutputTypeID' 
--     AND object_id = OBJECT_ID('"__mj"."TestRunOutput"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_TestRunOutput_OutputTypeID ON __mj."TestRunOutput" ("OutputTypeID");

/* SQL text to update entity field related entity name field map for entity field ID 72663DD0-11B3-43BF-9896-29BA131291FF */;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW __mj."vwTestRunOutputTypes"
AS SELECT
    t.*
FROM
    __mj."TestRunOutputType" AS t;

CREATE OR REPLACE VIEW __mj."vwTestRunOutputs"
AS SELECT
    t.*,
    "MJTestRun_TestRunID"."Test" AS "TestRun",
    "MJTestRunOutputType_OutputTypeID"."Name" AS "OutputType"
FROM
    __mj."TestRunOutput" AS t
INNER JOIN
    __mj."vwTestRuns" AS "MJTestRun_TestRunID"
  ON
    t."TestRunID" = "MJTestRun_TestRunID"."ID"
INNER JOIN
    __mj."TestRunOutputType" AS "MJTestRunOutputType_OutputTypeID"
  ON
    t."OutputTypeID" = "MJTestRunOutputType_OutputTypeID"."ID";


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateTestRunOutputType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTestRunOutputTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TestRunOutputType"
            (
                "ID",
                "Name",
                "Description"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TestRunOutputType"
            (
                "Name",
                "Description"
            )
        VALUES
            (
                p_Name,
                p_Description
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTestRunOutputTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRunOutputType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT
)
RETURNS SETOF __mj."vwTestRunOutputTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TestRunOutputType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTestRunOutputTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTestRunOutputTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunOutputType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRunOutputType"
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

CREATE OR REPLACE FUNCTION __mj."spCreateTestRunOutput"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_OutputTypeID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_StepNumber INTEGER DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds NUMERIC(10,3) DEFAULT NULL,
    IN p_Metadata TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTestRunOutputs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TestRunOutput"
            (
                "ID",
                "TestRunID",
                "OutputTypeID",
                "Sequence",
                "StepNumber",
                "Name",
                "Description",
                "MimeType",
                "InlineData",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "Metadata"
            )
        VALUES
            (
                p_ID,
                p_TestRunID,
                p_OutputTypeID,
                COALESCE(p_Sequence, 0),
                p_StepNumber,
                p_Name,
                p_Description,
                p_MimeType,
                p_InlineData,
                p_FileSizeBytes,
                p_Width,
                p_Height,
                p_DurationSeconds,
                p_Metadata
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TestRunOutput"
            (
                "TestRunID",
                "OutputTypeID",
                "Sequence",
                "StepNumber",
                "Name",
                "Description",
                "MimeType",
                "InlineData",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "Metadata"
            )
        VALUES
            (
                p_TestRunID,
                p_OutputTypeID,
                COALESCE(p_Sequence, 0),
                p_StepNumber,
                p_Name,
                p_Description,
                p_MimeType,
                p_InlineData,
                p_FileSizeBytes,
                p_Width,
                p_Height,
                p_DurationSeconds,
                p_Metadata
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTestRunOutputs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRunOutput"(
    IN p_ID UUID,
    IN p_TestRunID UUID,
    IN p_OutputTypeID UUID,
    IN p_Sequence INTEGER,
    IN p_StepNumber INTEGER,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_MimeType VARCHAR(100),
    IN p_InlineData TEXT,
    IN p_FileSizeBytes INTEGER,
    IN p_Width INTEGER,
    IN p_Height INTEGER,
    IN p_DurationSeconds NUMERIC(10,3),
    IN p_Metadata TEXT
)
RETURNS SETOF __mj."vwTestRunOutputs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TestRunOutput"
    SET
        "TestRunID" = p_TestRunID,
        "OutputTypeID" = p_OutputTypeID,
        "Sequence" = p_Sequence,
        "StepNumber" = p_StepNumber,
        "Name" = p_Name,
        "Description" = p_Description,
        "MimeType" = p_MimeType,
        "InlineData" = p_InlineData,
        "FileSizeBytes" = p_FileSizeBytes,
        "Width" = p_Width,
        "Height" = p_Height,
        "DurationSeconds" = p_DurationSeconds,
        "Metadata" = p_Metadata
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTestRunOutputs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTestRunOutputs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunOutput"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRunOutput"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateTestRunOutputType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTestRunOutputType" ON __mj."TestRunOutputType";
CREATE TRIGGER "trgUpdateTestRunOutputType"
    BEFORE UPDATE ON __mj."TestRunOutputType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTestRunOutputType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTestRunOutput_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTestRunOutput" ON __mj."TestRunOutput";
CREATE TRIGGER "trgUpdateTestRunOutput"
    BEFORE UPDATE ON __mj."TestRunOutput"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTestRunOutput_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ============================================================================
-- 3. Seed TestRunOutputType rows
-- ============================================================================
INSERT INTO __mj."TestRunOutputType" ("ID", "Name", "Description")
VALUES
    ('e946773a-09ac-445e-8ab9-075be4f397d8', 'Screenshot', 'Image capture at a point in time'),
    ('b11b2c55-6f8e-42d2-a876-beba05c768be', 'Log', 'Text log output'),
    ('e8ac7fb0-e7f9-4fc6-9791-2a623dc85d2c', 'Data', 'Structured JSON data'),
    ('37fb1881-356d-4fd3-8689-f8fb5f3cab18', 'HTML', 'HTML content'),
    ('1c25ceef-bea1-4484-bf80-b5a3d25a8381', 'Video', 'Video recording'),
    ('023be4c1-abbb-4de1-b017-5acbfdcf7cba', 'Audio', 'Audio recording'),
    ('c223778a-eb3f-41c8-8fa3-4faf2262b189', 'File', 'Generic file output');

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
         'ce3761bc-5ca6-44e1-9521-97c48f4d8bb6',
         'MJ: Test Run Output Types',
         'Test Run Output Types',
         NULL,
         NULL,
         'TestRunOutputType',
         'vwTestRunOutputTypes',
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
      )
   

/* SQL generated to add new entity MJ: Test Run Output Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */;

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ce3761bc-5ca6-44e1-9521-97c48f4d8bb6', (SELECT COALESCE(MAX("Sequence"),0)||1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role UI */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ce3761bc-5ca6-44e1-9521-97c48f4d8bb6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Developer */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ce3761bc-5ca6-44e1-9521-97c48f4d8bb6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Integration */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ce3761bc-5ca6-44e1-9521-97c48f4d8bb6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Test Run Outputs */;

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
         '51bc27f7-dc57-4372-8812-3f219fa762b4',
         'MJ: Test Run Outputs',
         'Test Run Outputs',
         NULL,
         NULL,
         'TestRunOutput',
         'vwTestRunOutputs',
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
      )
   

/* SQL generated to add new entity MJ: Test Run Outputs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */;

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '51bc27f7-dc57-4372-8812-3f219fa762b4', (SELECT COALESCE(MAX("Sequence"),0)||1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role UI */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('51bc27f7-dc57-4372-8812-3f219fa762b4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Developer */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('51bc27f7-dc57-4372-8812-3f219fa762b4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Integration */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('51bc27f7-dc57-4372-8812-3f219fa762b4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity __mj."TestRunOutput" */;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '09df0f14-7259-40e3-b17a-ab54c5529bd1'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'ID')
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
        '09df0f14-7259-40e3-b17a-ab54c5529bd1',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
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
        WHERE "ID" = '72663dd0-11b3-43bf-9896-29ba131291ff'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'TestRunID')
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
        '72663dd0-11b3-43bf-9896-29ba131291ff',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100002,
        'TestRunID',
        'Test Run ID',
        'Foreign key to the parent test run that produced this output',
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA',
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
        WHERE "ID" = '660fe22c-f2d0-4372-a4ac-17c33b9bb829'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'OutputTypeID')
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
        '660fe22c-f2d0-4372-a4ac-17c33b9bb829',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100003,
        'OutputTypeID',
        'Output Type ID',
        'Foreign key to the output type category (Screenshot, Log, Video, etc.)',
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6',
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
        WHERE "ID" = 'f866bc1e-5d1b-48c8-8ba6-8e71b2e8d7cc'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Sequence')
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
        'f866bc1e-5d1b-48c8-8ba6-8e71b2e8d7cc',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100004,
        'Sequence',
        'Sequence',
        'Chronological ordering for storyboarding outputs across steps',
        'INTEGER',
        4,
        10,
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
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'f333c5aa-490f-437a-8799-27318aee6995'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'StepNumber')
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
        'f333c5aa-490f-437a-8799-27318aee6995',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100005,
        'StepNumber',
        'Step Number',
        'Which step produced this output, for step-based tests like Computer Use',
        'INTEGER',
        4,
        10,
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
        WHERE "ID" = 'f30b5229-c80d-4c84-a9dd-327a6ce5e738'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Name')
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
        'f30b5229-c80d-4c84-a9dd-327a6ce5e738',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100006,
        'Name',
        'Name',
        'Human-readable label for this output (e.g., Step 3 Screenshot)',
        'TEXT',
        510,
        0,
        0,
        1,
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
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'b07389fa-3e06-4e15-a65b-ef4be19ce648'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Description')
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
        'b07389fa-3e06-4e15-a65b-ef4be19ce648',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100007,
        'Description',
        'Description',
        'Additional context about this output',
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
        WHERE "ID" = '85bb9d46-27df-4763-b832-7ee9259100a0'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'MimeType')
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
        '85bb9d46-27df-4763-b832-7ee9259100a0',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100008,
        'MimeType',
        'Mime Type',
        'MIME type of the output data (e.g., BYTEA/png, text/plain, application/json, video/mp4)',
        'TEXT',
        200,
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
        WHERE "ID" = '79a10f51-c0ff-40c1-af59-e82f6cc67d04'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'InlineData')
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
        '79a10f51-c0ff-40c1-af59-e82f6cc67d04',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100009,
        'InlineData',
        'Inline Data',
        'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)',
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
        WHERE "ID" = '257b0084-ea5f-4325-9f92-60a6c0ffb947'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'FileSizeBytes')
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
        '257b0084-ea5f-4325-9f92-60a6c0ffb947',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100010,
        'FileSizeBytes',
        'File Size Bytes',
        'Size of the output data in bytes',
        'INTEGER',
        4,
        10,
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
        WHERE "ID" = '7d653d7b-985e-44b5-b220-9e93cc559d0d'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Width')
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
        '7d653d7b-985e-44b5-b220-9e93cc559d0d',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100011,
        'Width',
        'Width',
        'Width in pixels for BYTEA or video outputs',
        'INTEGER',
        4,
        10,
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
        WHERE "ID" = 'dbbcd366-b3ab-4b03-8ee1-47429c0a65df'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Height')
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
        'dbbcd366-b3ab-4b03-8ee1-47429c0a65df',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100012,
        'Height',
        'Height',
        'Height in pixels for BYTEA or video outputs',
        'INTEGER',
        4,
        10,
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
        WHERE "ID" = '53fe9deb-d1a9-4130-8233-15fe3b62ded0'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'DurationSeconds')
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
        '53fe9deb-d1a9-4130-8233-15fe3b62ded0',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100013,
        'DurationSeconds',
        'Duration Seconds',
        'Duration in seconds for audio or video outputs',
        'decimal',
        9,
        10,
        3,
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
        WHERE "ID" = 'aca5d96a-9c5f-4dcf-976e-1dd45c66461b'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'Metadata')
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
        'aca5d96a-9c5f-4dcf-976e-1dd45c66461b',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100014,
        'Metadata',
        'Metadata',
        'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)',
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
        WHERE "ID" = '3129f5b4-2f39-4991-a4b4-49821f6fdaf1'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = '__mj_CreatedAt')
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
        '3129f5b4-2f39-4991-a4b4-49821f6fdaf1',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100015,
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
        WHERE "ID" = 'eafb19ac-10b4-432d-8f35-46e0f75294c1'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = '__mj_UpdatedAt')
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
        'eafb19ac-10b4-432d-8f35-46e0f75294c1',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100016,
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
        WHERE "ID" = '6f060635-7133-44ce-8b30-3cd01a268806'  OR
        ("EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6' AND "Name" = 'ID')
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
        '6f060635-7133-44ce-8b30-3cd01a268806',
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', -- "Entity": "MJ": "Test" "Run" "Output" "Types"
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
        WHERE "ID" = 'e3440032-2077-44a9-ac17-051d04ea6f9d'  OR
        ("EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6' AND "Name" = 'Name')
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
        'e3440032-2077-44a9-ac17-051d04ea6f9d',
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', -- "Entity": "MJ": "Test" "Run" "Output" "Types"
        100002,
        'Name',
        'Name',
        'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)',
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
        WHERE "ID" = 'f58c6e89-6415-41a0-b577-d7645ae801b9'  OR
        ("EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6' AND "Name" = 'Description')
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
        'f58c6e89-6415-41a0-b577-d7645ae801b9',
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', -- "Entity": "MJ": "Test" "Run" "Output" "Types"
        100003,
        'Description',
        'Description',
        'Description of what this output type represents and when it is used',
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
        WHERE "ID" = '5cb629cb-9021-4d1e-b11c-522e61933b65'  OR
        ("EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6' AND "Name" = '__mj_CreatedAt')
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
        '5cb629cb-9021-4d1e-b11c-522e61933b65',
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', -- "Entity": "MJ": "Test" "Run" "Output" "Types"
        100004,
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
        WHERE "ID" = '97ac25d1-088e-4fc5-a3ff-7c7355be483e'  OR
        ("EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6' AND "Name" = '__mj_UpdatedAt')
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
        '97ac25d1-088e-4fc5-a3ff-7c7355be483e',
        'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', -- "Entity": "MJ": "Test" "Run" "Output" "Types"
        100005,
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
        WHERE "ID" = 'aa16d9a0-5588-4b2e-872e-caf71b527b9c'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('aa16d9a0-5588-4b2e-872e-caf71b527b9c', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', '51BC27F7-DC57-4372-8812-3F219FA762B4', 'TestRunID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 1);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = 'a2867775-023b-4fd5-97d5-0e85afd74bdc'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('a2867775-023b-4fd5-97d5-0e85afd74bdc', 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', '51BC27F7-DC57-4372-8812-3F219FA762B4', 'OutputTypeID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 2);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '032e8231-6926-414e-bed1-093b09c7ee93'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'TestRun')
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
        '032e8231-6926-414e-bed1-093b09c7ee93',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100033,
        'TestRun',
        'Test Run',
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
        WHERE "ID" = '44b424a4-928a-4479-881b-ca8eaa53f130'  OR
        ("EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4' AND "Name" = 'OutputType')
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
        '44b424a4-928a-4479-881b-ca8eaa53f130',
        '51BC27F7-DC57-4372-8812-3F219FA762B4', -- "Entity": "MJ": "Test" "Run" "Outputs"
        100034,
        'OutputType',
        'Output Type',
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
            SET "IsNameField" = 1
            WHERE "ID" = 'E3440032-2077-44A9-AC17-051D04EA6F9D'
            AND "AutoUpdateIsNameField" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'E3440032-2077-44A9-AC17-051D04EA6F9D'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'F58C6E89-6415-41A0-B577-D7645AE801B9'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'E3440032-2077-44A9-AC17-051D04EA6F9D'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1
            

/* Set field properties for entity */;

UPDATE "__mj"."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'F30B5229-C80D-4C84-A9DD-327A6CE5E738'
            AND "AutoUpdateIsNameField" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'F333C5AA-490F-437A-8799-27318AEE6995'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'F30B5229-C80D-4C84-A9DD-327A6CE5E738'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '85BB9D46-27DF-4763-B832-7EE9259100A0'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '3129F5B4-2F39-4991-A4B4-49821F6FDAF1'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '032E8231-6926-414E-BED1-093B09C7EE93'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '44B424A4-928A-4479-881B-CA8EAA53F130'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'F30B5229-C80D-4C84-A9DD-327A6CE5E738'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'B07389FA-3E06-4E15-A65B-EF4BE19CE648'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '85BB9D46-27DF-4763-B832-7EE9259100A0'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '032E8231-6926-414E-BED1-093B09C7EE93'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '44B424A4-928A-4479-881B-CA8EAA53F130'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1
            

/* Set categories for 5 fields */;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'ID',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '6F060635-7133-44CE-8B30-3CD01A268806'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Type Details',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'E3440032-2077-44A9-AC17-051D04EA6F9D'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Type Details',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Description',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F58C6E89-6415-41A0-B577-D7645AE801B9'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Created At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '5CB629CB-9021-4D1E-B11C-522E61933B65'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Updated At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '97AC25D1-088E-4FC5-A3FF-7C7355BE483E'
   AND "AutoUpdateCategory" = 1

/* Set entity icon to fa fa-file-code */;

UPDATE "__mj"."Entity"
               SET "Icon" = 'fa fa-file-code', __mj_UpdatedAt = NOW()
               WHERE "ID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6'
            

/* Insert FieldCategoryInfo setting for entity */;

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
            VALUES ('e097f582-b6fb-4444-b9e1-cd7d289afe59', 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', 'FieldCategoryInfo', '{"Output Type Details":{"icon":"fa fa-vial","description":"Core information defining the specific type of test output such as logs, screenshots, or video."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', NOW(), NOW())
         

/* Insert FieldCategoryIcons setting (legacy) */;

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
            VALUES ('7abda917-5743-4a36-a5e5-4f68808ee748', 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', 'FieldCategoryIcons', '{"Output Type Details":"fa fa-vial","System Metadata":"fa fa-cog"}', NOW(), NOW())
         

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */;

UPDATE "__mj"."ApplicationEntity"
         SET "DefaultForNewUser" = 0, __mj_UpdatedAt = NOW()
         WHERE "EntityID" = 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6'
      

/* Set categories for 18 fields */;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'ID',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '09DF0F14-7259-40E3-B17A-AB54C5529BD1'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Test Context',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Test Run',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '72663DD0-11B3-43BF-9896-29BA131291FF'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Test Context',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Test Run Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '032E8231-6926-414E-BED1-093B09C7EE93'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Test Context',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Sequence',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F866BC1E-5D1B-48C8-8BA6-8E71B2E8D7CC'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Test Context',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Step Number',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F333C5AA-490F-437A-8799-27318AEE6995'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Information',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Output Type',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '660FE22C-F2D0-4372-A4AC-17C33B9BB829'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Information',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Output Type Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '44B424A4-928A-4479-881B-CA8EAA53F130'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Information',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F30B5229-C80D-4C84-A9DD-327A6CE5E738'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Output Information',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Description',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'B07389FA-3E06-4E15-A65B-EF4BE19CE648'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'MIME Type',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '85BB9D46-27DF-4763-B832-7EE9259100A0'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Inline Data',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '79A10F51-C0FF-40C1-AF59-E82F6CC67D04'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'File Size (Bytes)',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '257B0084-EA5F-4325-9F92-60A6C0FFB947'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Width',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '7D653D7B-985E-44B5-B220-9E93CC559D0D'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Height',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'DBBCD366-B3AB-4B03-8EE1-47429C0A65DF'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Duration (Seconds)',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '53FE9DEB-D1A9-4130-8233-15FE3B62DED0'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Data and Media',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Technical Metadata',
       "ExtendedType" = 'Code',
       "CodeType" = 'Other'
   WHERE "ID" = 'ACA5D96A-9C5F-4DCF-976E-1DD45C66461B'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Created At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '3129F5B4-2F39-4991-A4B4-49821F6FDAF1'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Updated At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'EAFB19AC-10B4-432D-8F35-46E0F75294C1'
   AND "AutoUpdateCategory" = 1

/* Set entity icon to fa fa-file-image */;

UPDATE "__mj"."Entity"
               SET "Icon" = 'fa fa-file-image', __mj_UpdatedAt = NOW()
               WHERE "ID" = '51BC27F7-DC57-4372-8812-3F219FA762B4'
            

/* Insert FieldCategoryInfo setting for entity */;

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
            VALUES ('a2225df6-d49a-4079-8e48-029ee82bee9d', '51BC27F7-DC57-4372-8812-3F219FA762B4', 'FieldCategoryInfo', '{"Test Context":{"icon":"fa fa-flask","description":"Information linking this output to the specific test run, step, and execution sequence"},"Output Information":{"icon":"fa fa-info-circle","description":"Basic identification and categorization of the test artifact"},"Data and Media":{"icon":"fa fa-photo-video","description":"The actual content, dimensions, and technical properties of the test output"},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and audit timestamps managed by the system"}}', NOW(), NOW())
         

/* Insert FieldCategoryIcons setting (legacy) */;

INSERT INTO "__mj"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
            VALUES ('9b139486-7c93-4fe9-9209-bb5e9f43bc21', '51BC27F7-DC57-4372-8812-3F219FA762B4', 'FieldCategoryIcons', '{"Test Context":"fa fa-flask","Output Information":"fa fa-info-circle","Data and Media":"fa fa-photo-video","System Metadata":"fa fa-cog"}', NOW(), NOW())
         

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */;

UPDATE "__mj"."ApplicationEntity"
         SET "DefaultForNewUser" = 0, __mj_UpdatedAt = NOW()
         WHERE "EntityID" = '51BC27F7-DC57-4372-8812-3F219FA762B4';


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwTestRunOutputTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: Permissions for vwTestRunOutputTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwTestRunOutputTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spCreateTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTestRunOutputType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Test Run Output Types */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTestRunOutputType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spUpdateTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTestRunOutputType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTestRunOutputType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spDeleteTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutputType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Run Output Types */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutputType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for TestRunOutput */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestRunID in table TestRunOutput;

GRANT SELECT ON __mj."vwTestRunOutputs" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: Permissions for vwTestRunOutputs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwTestRunOutputs" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spCreateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Test Run Outputs */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spUpdateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTestRunOutput" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spDeleteTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutput
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutput" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Run Outputs */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutput" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."TestRunOutputType"."Name" IS 'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)';

COMMENT ON COLUMN __mj."TestRunOutputType"."Description" IS 'Description of what this output type represents and when it is used';

COMMENT ON COLUMN __mj."TestRunOutput"."TestRunID" IS 'Foreign key to the parent test run that produced this output';

COMMENT ON COLUMN __mj."TestRunOutput"."OutputTypeID" IS 'Foreign key to the output type category (Screenshot, Log, Video, etc.)';

COMMENT ON COLUMN __mj."TestRunOutput"."Sequence" IS 'Chronological ordering for storyboarding outputs across steps';

COMMENT ON COLUMN __mj."TestRunOutput"."StepNumber" IS 'Which step produced this output, for step-based tests like Computer Use';

COMMENT ON COLUMN __mj."TestRunOutput"."Name" IS 'Human-readable label for this output (e.g., Step 3 Screenshot)';

COMMENT ON COLUMN __mj."TestRunOutput"."Description" IS 'Additional context about this output';

COMMENT ON COLUMN __mj."TestRunOutput"."MimeType" IS 'MIME type of the output data (e.g., image/png, text/plain, application/json, video/mp4)';

COMMENT ON COLUMN __mj."TestRunOutput"."InlineData" IS 'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)';

COMMENT ON COLUMN __mj."TestRunOutput"."FileSizeBytes" IS 'Size of the output data in bytes';

COMMENT ON COLUMN __mj."TestRunOutput"."Width" IS 'Width in pixels for image or video outputs';

COMMENT ON COLUMN __mj."TestRunOutput"."Height" IS 'Height in pixels for image or video outputs';

COMMENT ON COLUMN __mj."TestRunOutput"."DurationSeconds" IS 'Duration in seconds for audio or video outputs';

COMMENT ON COLUMN __mj."TestRunOutput"."Metadata" IS 'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)';


-- ===================== Other =====================

-- Extended properties for TestRunOutputType

-- Extended properties for TestRunOutput

/* SQL generated to create new entity MJ: Test Run Output Types */

/* spUpdate Permissions for MJ: Test Run Output Types */

/* spUpdate Permissions for MJ: Test Run Outputs */
