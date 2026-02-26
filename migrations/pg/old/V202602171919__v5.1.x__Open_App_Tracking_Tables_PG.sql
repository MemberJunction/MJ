
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Open App tracking tables
-- These tables live in the __mj core schema and are part of MemberJunction itself,
-- not part of any individual app. They track what Open Apps are installed in this instance.

-----------------------------------------------------------------------
-- 1. Open Apps
-----------------------------------------------------------------------
CREATE TABLE __mj."OpenApp" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(64) NOT NULL,
 "DisplayName" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "Version" VARCHAR(50) NOT NULL,
 "Publisher" VARCHAR(200) NOT NULL,
 "PublisherEmail" VARCHAR(255) NULL,
 "PublisherURL" VARCHAR(500) NULL,
 "RepositoryURL" VARCHAR(500) NOT NULL,
 "SchemaName" VARCHAR(128) NULL,
 "MJVersionRange" VARCHAR(100) NOT NULL,
 "License" VARCHAR(50) NULL,
 "Icon" VARCHAR(100) NULL,
 "Color" VARCHAR(20) NULL,
 "ManifestJSON" TEXT NOT NULL,
 "ConfigurationSchemaJSON" TEXT NULL,
 "InstalledByUserID" UUID NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_OpenApp PRIMARY KEY ("ID"),
 CONSTRAINT UQ_OpenApp_Name UNIQUE ("Name"),
 CONSTRAINT UQ_OpenApp_Schema UNIQUE ("SchemaName"),
 CONSTRAINT FK_OpenApp_User FOREIGN KEY ("InstalledByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_OpenApp_Status CHECK ("Status" IN (
 'Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing', 'Removed'
 )),
 CONSTRAINT CK_OpenApp_Name CHECK ("Name" ~ '^[a-z0-9-]+$')
);

-----------------------------------------------------------------------
-- 2. Open App Install History (audit trail)
-----------------------------------------------------------------------
CREATE TABLE __mj."OpenAppInstallHistory" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OpenAppID" UUID NOT NULL,
 "Version" VARCHAR(50) NOT NULL,
 "PreviousVersion" VARCHAR(50) NULL,
 "Action" VARCHAR(20) NOT NULL,
 "ManifestJSON" TEXT NOT NULL,
 "Summary" TEXT NULL,
 "ExecutedByUserID" UUID NOT NULL,
 "DurationSeconds" INTEGER NULL,
 "StartedAt" TIMESTAMPTZ NULL,
 "EndedAt" TIMESTAMPTZ NULL,
 "Success" BOOLEAN NOT NULL DEFAULT TRUE,
 "ErrorMessage" TEXT NULL,
 "ErrorPhase" VARCHAR(50) NULL,
 CONSTRAINT PK_OpenAppInstallHistory PRIMARY KEY ("ID"),
 CONSTRAINT FK_OpenAppInstallHistory_App FOREIGN KEY ("OpenAppID")
 REFERENCES __mj."OpenApp"("ID"),
 CONSTRAINT FK_OpenAppInstallHistory_User FOREIGN KEY ("ExecutedByUserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_OpenAppInstallHistory_Action CHECK ("Action" IN (
 'Install', 'Upgrade', 'Remove'
 )),
 CONSTRAINT CK_OpenAppInstallHistory_Phase CHECK ("ErrorPhase" IS NULL OR "ErrorPhase" IN (
 'Schema', 'Migration', 'Packages', 'Config', 'Hooks', 'Record'
 ))
);

-----------------------------------------------------------------------
-- 3. Open App Dependencies
-----------------------------------------------------------------------
CREATE TABLE __mj."OpenAppDependency" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "OpenAppID" UUID NOT NULL,
 "DependsOnAppName" VARCHAR(64) NOT NULL,
 "DependsOnAppID" UUID NULL,
 "VersionRange" VARCHAR(100) NOT NULL,
 "InstalledVersion" VARCHAR(50) NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Satisfied',
 CONSTRAINT PK_OpenAppDependency PRIMARY KEY ("ID"),
 CONSTRAINT FK_OpenAppDep_App FOREIGN KEY ("OpenAppID")
 REFERENCES __mj."OpenApp"("ID"),
 CONSTRAINT FK_OpenAppDep_DepApp FOREIGN KEY ("DependsOnAppID")
 REFERENCES __mj."OpenApp"("ID"),
 CONSTRAINT UQ_OpenAppDep UNIQUE ("OpenAppID", "DependsOnAppName"),
 CONSTRAINT CK_OpenAppDep_Status CHECK ("Status" IN (
 'Satisfied', 'Missing', 'Incompatible'
 ))
);

ALTER TABLE __mj."OpenAppDependency" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."OpenAppDependency" */;

ALTER TABLE __mj."OpenAppDependency" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_CreatedAt to entity __mj."OpenApp" */;

ALTER TABLE __mj."OpenApp" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."OpenApp" */;

ALTER TABLE __mj."OpenApp" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_CreatedAt to entity __mj."OpenAppInstallHistory" */;

ALTER TABLE __mj."OpenAppInstallHistory" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."OpenAppInstallHistory" */;

ALTER TABLE __mj."OpenAppInstallHistory" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()

/* SQL text to insert new entity field */;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID' 
--     AND object_id = OBJECT_ID('__mj."OpenAppDependency"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID ON __mj."OpenAppDependency" ("OpenAppID");

-- Index for foreign key DependsOnAppID in table OpenAppDependency;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID' 
--     AND object_id = OBJECT_ID('__mj."OpenAppDependency"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID ON __mj."OpenAppDependency" ("DependsOnAppID");

/* SQL text to update entity field related entity name field map for entity field ID 5C270696-51C2-451F-88B4-8E99F1DE57FA */;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID' 
--     AND object_id = OBJECT_ID('__mj."OpenAppInstallHistory"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID ON __mj."OpenAppInstallHistory" ("OpenAppID");

-- Index for foreign key ExecutedByUserID in table OpenAppInstallHistory;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID' 
--     AND object_id = OBJECT_ID('__mj."OpenAppInstallHistory"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID ON __mj."OpenAppInstallHistory" ("ExecutedByUserID");

/* SQL text to update entity field related entity name field map for entity field ID 2EFCED4C-6D5D-44E5-94D6-579D5A9AB715 */;

-- TODO: Review conditional DDL
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.indexes
--     WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
--     AND object_id = OBJECT_ID('__mj."OpenApp"')
-- )


CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON __mj."OpenApp" ("InstalledByUserID");

/* SQL text to update entity field related entity name field map for entity field ID A47E36F4-7942-4A8B-9735-72F74B07C618 */;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================

CREATE OR REPLACE VIEW __mj."vwOpenAppDependencies"
AS SELECT
    o.*,
    "MJOpenApp_OpenAppID"."Name" AS "OpenApp",
    "MJOpenApp_DependsOnAppID"."Name" AS "DependsOnApp"
FROM
    __mj."OpenAppDependency" AS o
INNER JOIN
    __mj."OpenApp" AS "MJOpenApp_OpenAppID"
  ON
    "o"."OpenAppID" = "MJOpenApp_OpenAppID"."ID"
LEFT OUTER JOIN
    __mj."OpenApp" AS "MJOpenApp_DependsOnAppID"
  ON
    "o"."DependsOnAppID" = "MJOpenApp_DependsOnAppID"."ID";

CREATE OR REPLACE VIEW __mj."vwOpenApps"
AS SELECT
    o.*,
    "MJUser_InstalledByUserID"."Name" AS "InstalledByUser"
FROM
    __mj."OpenApp" AS o
INNER JOIN
    __mj."User" AS "MJUser_InstalledByUserID"
  ON
    "o"."InstalledByUserID" = "MJUser_InstalledByUserID"."ID";

CREATE OR REPLACE VIEW __mj."vwOpenAppInstallHistories"
AS SELECT
    o.*,
    "MJOpenApp_OpenAppID"."Name" AS "OpenApp",
    "MJUser_ExecutedByUserID"."Name" AS "ExecutedByUser"
FROM
    __mj."OpenAppInstallHistory" AS o
INNER JOIN
    __mj."OpenApp" AS "MJOpenApp_OpenAppID"
  ON
    "o"."OpenAppID" = "MJOpenApp_OpenAppID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_ExecutedByUserID"
  ON
    "o"."ExecutedByUserID" = "MJUser_ExecutedByUserID"."ID";


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateOpenAppDependency"(
    IN p_ID UUID DEFAULT NULL,
    IN p_OpenAppID UUID DEFAULT NULL,
    IN p_DependsOnAppName VARCHAR(64) DEFAULT NULL,
    IN p_DependsOnAppID UUID DEFAULT NULL,
    IN p_VersionRange VARCHAR(100) DEFAULT NULL,
    IN p_InstalledVersion VARCHAR(50) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwOpenAppDependencies" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."OpenAppDependency"
            (
                "ID",
                "OpenAppID",
                "DependsOnAppName",
                "DependsOnAppID",
                "VersionRange",
                "InstalledVersion",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_OpenAppID,
                p_DependsOnAppName,
                p_DependsOnAppID,
                p_VersionRange,
                p_InstalledVersion,
                COALESCE(p_Status, 'Satisfied')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."OpenAppDependency"
            (
                "OpenAppID",
                "DependsOnAppName",
                "DependsOnAppID",
                "VersionRange",
                "InstalledVersion",
                "Status"
            )
        VALUES
            (
                p_OpenAppID,
                p_DependsOnAppName,
                p_DependsOnAppID,
                p_VersionRange,
                p_InstalledVersion,
                COALESCE(p_Status, 'Satisfied')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwOpenAppDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOpenAppDependency"(
    IN p_ID UUID,
    IN p_OpenAppID UUID,
    IN p_DependsOnAppName VARCHAR(64),
    IN p_DependsOnAppID UUID,
    IN p_VersionRange VARCHAR(100),
    IN p_InstalledVersion VARCHAR(50),
    IN p_Status VARCHAR(20)
)
RETURNS SETOF __mj."vwOpenAppDependencies" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."OpenAppDependency"
    SET
        "OpenAppID" = p_OpenAppID,
        "DependsOnAppName" = p_DependsOnAppName,
        "DependsOnAppID" = p_DependsOnAppID,
        "VersionRange" = p_VersionRange,
        "InstalledVersion" = p_InstalledVersion,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwOpenAppDependencies" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwOpenAppDependencies" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOpenAppDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenAppDependency"
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

CREATE OR REPLACE FUNCTION __mj."spCreateOpenApp"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(64) DEFAULT NULL,
    IN p_DisplayName VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Version VARCHAR(50) DEFAULT NULL,
    IN p_Publisher VARCHAR(200) DEFAULT NULL,
    IN p_PublisherEmail VARCHAR(255) DEFAULT NULL,
    IN p_PublisherURL VARCHAR(500) DEFAULT NULL,
    IN p_RepositoryURL VARCHAR(500) DEFAULT NULL,
    IN p_SchemaName VARCHAR(128) DEFAULT NULL,
    IN p_MJVersionRange VARCHAR(100) DEFAULT NULL,
    IN p_License VARCHAR(50) DEFAULT NULL,
    IN p_Icon VARCHAR(100) DEFAULT NULL,
    IN p_Color VARCHAR(20) DEFAULT NULL,
    IN p_ManifestJSON TEXT DEFAULT NULL,
    IN p_ConfigurationSchemaJSON TEXT DEFAULT NULL,
    IN p_InstalledByUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwOpenApps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."OpenApp"
            (
                "ID",
                "Name",
                "DisplayName",
                "Description",
                "Version",
                "Publisher",
                "PublisherEmail",
                "PublisherURL",
                "RepositoryURL",
                "SchemaName",
                "MJVersionRange",
                "License",
                "Icon",
                "Color",
                "ManifestJSON",
                "ConfigurationSchemaJSON",
                "InstalledByUserID",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_DisplayName,
                p_Description,
                p_Version,
                p_Publisher,
                p_PublisherEmail,
                p_PublisherURL,
                p_RepositoryURL,
                p_SchemaName,
                p_MJVersionRange,
                p_License,
                p_Icon,
                p_Color,
                p_ManifestJSON,
                p_ConfigurationSchemaJSON,
                p_InstalledByUserID,
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."OpenApp"
            (
                "Name",
                "DisplayName",
                "Description",
                "Version",
                "Publisher",
                "PublisherEmail",
                "PublisherURL",
                "RepositoryURL",
                "SchemaName",
                "MJVersionRange",
                "License",
                "Icon",
                "Color",
                "ManifestJSON",
                "ConfigurationSchemaJSON",
                "InstalledByUserID",
                "Status"
            )
        VALUES
            (
                p_Name,
                p_DisplayName,
                p_Description,
                p_Version,
                p_Publisher,
                p_PublisherEmail,
                p_PublisherURL,
                p_RepositoryURL,
                p_SchemaName,
                p_MJVersionRange,
                p_License,
                p_Icon,
                p_Color,
                p_ManifestJSON,
                p_ConfigurationSchemaJSON,
                p_InstalledByUserID,
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwOpenApps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOpenApp"(
    IN p_ID UUID,
    IN p_Name VARCHAR(64),
    IN p_DisplayName VARCHAR(200),
    IN p_Description TEXT,
    IN p_Version VARCHAR(50),
    IN p_Publisher VARCHAR(200),
    IN p_PublisherEmail VARCHAR(255),
    IN p_PublisherURL VARCHAR(500),
    IN p_RepositoryURL VARCHAR(500),
    IN p_SchemaName VARCHAR(128),
    IN p_MJVersionRange VARCHAR(100),
    IN p_License VARCHAR(50),
    IN p_Icon VARCHAR(100),
    IN p_Color VARCHAR(20),
    IN p_ManifestJSON TEXT,
    IN p_ConfigurationSchemaJSON TEXT,
    IN p_InstalledByUserID UUID,
    IN p_Status VARCHAR(20)
)
RETURNS SETOF __mj."vwOpenApps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."OpenApp"
    SET
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "Version" = p_Version,
        "Publisher" = p_Publisher,
        "PublisherEmail" = p_PublisherEmail,
        "PublisherURL" = p_PublisherURL,
        "RepositoryURL" = p_RepositoryURL,
        "SchemaName" = p_SchemaName,
        "MJVersionRange" = p_MJVersionRange,
        "License" = p_License,
        "Icon" = p_Icon,
        "Color" = p_Color,
        "ManifestJSON" = p_ManifestJSON,
        "ConfigurationSchemaJSON" = p_ConfigurationSchemaJSON,
        "InstalledByUserID" = p_InstalledByUserID,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwOpenApps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwOpenApps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOpenApp"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenApp"
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

CREATE OR REPLACE FUNCTION __mj."spCreateOpenAppInstallHistory"(
    IN p_ID UUID DEFAULT NULL,
    IN p_OpenAppID UUID DEFAULT NULL,
    IN p_Version VARCHAR(50) DEFAULT NULL,
    IN p_PreviousVersion VARCHAR(50) DEFAULT NULL,
    IN p_Action VARCHAR(20) DEFAULT NULL,
    IN p_ManifestJSON TEXT DEFAULT NULL,
    IN p_Summary TEXT DEFAULT NULL,
    IN p_ExecutedByUserID UUID DEFAULT NULL,
    IN p_DurationSeconds INTEGER DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ErrorPhase VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwOpenAppInstallHistories" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."OpenAppInstallHistory"
            (
                "ID",
                "OpenAppID",
                "Version",
                "PreviousVersion",
                "Action",
                "ManifestJSON",
                "Summary",
                "ExecutedByUserID",
                "DurationSeconds",
                "StartedAt",
                "EndedAt",
                "Success",
                "ErrorMessage",
                "ErrorPhase"
            )
        VALUES
            (
                p_ID,
                p_OpenAppID,
                p_Version,
                p_PreviousVersion,
                p_Action,
                p_ManifestJSON,
                p_Summary,
                p_ExecutedByUserID,
                p_DurationSeconds,
                p_StartedAt,
                p_EndedAt,
                COALESCE(p_Success, 1),
                p_ErrorMessage,
                p_ErrorPhase
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."OpenAppInstallHistory"
            (
                "OpenAppID",
                "Version",
                "PreviousVersion",
                "Action",
                "ManifestJSON",
                "Summary",
                "ExecutedByUserID",
                "DurationSeconds",
                "StartedAt",
                "EndedAt",
                "Success",
                "ErrorMessage",
                "ErrorPhase"
            )
        VALUES
            (
                p_OpenAppID,
                p_Version,
                p_PreviousVersion,
                p_Action,
                p_ManifestJSON,
                p_Summary,
                p_ExecutedByUserID,
                p_DurationSeconds,
                p_StartedAt,
                p_EndedAt,
                COALESCE(p_Success, 1),
                p_ErrorMessage,
                p_ErrorPhase
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwOpenAppInstallHistories" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOpenAppInstallHistory"(
    IN p_ID UUID,
    IN p_OpenAppID UUID,
    IN p_Version VARCHAR(50),
    IN p_PreviousVersion VARCHAR(50),
    IN p_Action VARCHAR(20),
    IN p_ManifestJSON TEXT,
    IN p_Summary TEXT,
    IN p_ExecutedByUserID UUID,
    IN p_DurationSeconds INTEGER,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_EndedAt TIMESTAMPTZ,
    IN p_Success BOOLEAN,
    IN p_ErrorMessage TEXT,
    IN p_ErrorPhase VARCHAR(50)
)
RETURNS SETOF __mj."vwOpenAppInstallHistories" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."OpenAppInstallHistory"
    SET
        "OpenAppID" = p_OpenAppID,
        "Version" = p_Version,
        "PreviousVersion" = p_PreviousVersion,
        "Action" = p_Action,
        "ManifestJSON" = p_ManifestJSON,
        "Summary" = p_Summary,
        "ExecutedByUserID" = p_ExecutedByUserID,
        "DurationSeconds" = p_DurationSeconds,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "ErrorPhase" = p_ErrorPhase
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwOpenAppInstallHistories" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwOpenAppInstallHistories" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOpenAppInstallHistory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenAppInstallHistory"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateOpenAppDependency_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateOpenAppDependency" ON __mj."OpenAppDependency";
CREATE TRIGGER "trgUpdateOpenAppDependency"
    BEFORE UPDATE ON __mj."OpenAppDependency"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateOpenAppDependency_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateOpenApp_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateOpenApp" ON __mj."OpenApp";
CREATE TRIGGER "trgUpdateOpenApp"
    BEFORE UPDATE ON __mj."OpenApp"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateOpenApp_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateOpenAppInstallHistory_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateOpenAppInstallHistory" ON __mj."OpenAppInstallHistory";
CREATE TRIGGER "trgUpdateOpenAppInstallHistory"
    BEFORE UPDATE ON __mj."OpenAppInstallHistory"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateOpenAppInstallHistory_func"();


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
         'ac4a2799-454b-4395-aa56-a42241f32c12',
         'MJ: Open Apps',
         'Open Apps',
         NULL,
         NULL,
         'OpenApp',
         'vwOpenApps',
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
   

/* SQL generated to add new entity MJ: Open Apps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */;

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ac4a2799-454b-4395-aa56-a42241f32c12', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open Apps for role UI */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Developer */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Integration */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open App Install Histories */;

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
         '0fcff292-3e37-42bb-b5c3-e7751ef9b875',
         'MJ: Open App Install Histories',
         'Open App Install Histories',
         NULL,
         NULL,
         'OpenAppInstallHistory',
         'vwOpenAppInstallHistories',
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
   

/* SQL generated to add new entity MJ: Open App Install Histories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */;

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0fcff292-3e37-42bb-b5c3-e7751ef9b875', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role UI */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Developer */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Integration */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open App Dependencies */;

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
         '57a740fa-ce0f-440b-8b90-6bf2bb9440de',
         'MJ: Open App Dependencies',
         'Open App Dependencies',
         NULL,
         NULL,
         'OpenAppDependency',
         'vwOpenAppDependencies',
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
   

/* SQL generated to add new entity MJ: Open App Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */;

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57a740fa-ce0f-440b-8b90-6bf2bb9440de', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role UI */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Developer */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Integration */;

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete") VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity __mj."OpenAppDependency" */;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '93528c37-1530-453b-8a5c-3dfc5c7825fd'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'ID')
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
        '93528c37-1530-453b-8a5c-3dfc5c7825fd',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
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
        WHERE "ID" = '5c270696-51c2-451f-88b4-8e99f1de57fa'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'OpenAppID')
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
        '5c270696-51c2-451f-88b4-8e99f1de57fa',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100002,
        'OpenAppID',
        'Open App ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'AC4A2799-454B-4395-AA56-A42241F32C12',
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
        WHERE "ID" = 'c698c8d9-54f9-4ada-be93-74863a865572'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'DependsOnAppName')
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
        'c698c8d9-54f9-4ada-be93-74863a865572',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100003,
        'DependsOnAppName',
        'Depends On App Name',
        'Name of the app that this app depends on (matches OpenApp.Name)',
        'TEXT',
        128,
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
        WHERE "ID" = '542dcb06-633a-4c84-8e32-d38390250821'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'DependsOnAppID')
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
        '542dcb06-633a-4c84-8e32-d38390250821',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100004,
        'DependsOnAppID',
        'Depends On App ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        1,
        'null',
        0,
        1,
        0,
        'AC4A2799-454B-4395-AA56-A42241F32C12',
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
        WHERE "ID" = '5a532892-61d9-4a21-b13e-e0515b153022'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'VersionRange')
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
        '5a532892-61d9-4a21-b13e-e0515b153022',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100005,
        'VersionRange',
        'Version Range',
        'Semver range specifying which versions of the dependency are acceptable (e.g. ^1.0.0)',
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
        WHERE "ID" = 'ab40b6e0-9247-4c1a-b042-e6e522b8a496'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'InstalledVersion')
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
        'ab40b6e0-9247-4c1a-b042-e6e522b8a496',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100006,
        'InstalledVersion',
        'Installed Version',
        'Actual installed version of the dependency (NULL if not yet installed)',
        'TEXT',
        100,
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
        WHERE "ID" = 'f6bca0fe-d58b-4356-9c80-f0468fd9398e'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'Status')
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
        'f6bca0fe-d58b-4356-9c80-f0468fd9398e',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100007,
        'Status',
        'Status',
        'Whether the dependency is satisfied: Satisfied, Missing, or Incompatible',
        'TEXT',
        40,
        0,
        0,
        0,
        'Satisfied',
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
        WHERE "ID" = '05af039a-db95-4c18-89b0-c309b6211c3c'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = '__mj_CreatedAt')
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
        '05af039a-db95-4c18-89b0-c309b6211c3c',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100008,
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
        WHERE "ID" = 'b040b769-17f4-407f-8589-27600340936f'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = '__mj_UpdatedAt')
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
        'b040b769-17f4-407f-8589-27600340936f',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100009,
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
        WHERE "ID" = '7655de67-050c-4fec-833f-3b3fe61e2451'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'ID')
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
        '7655de67-050c-4fec-833f-3b3fe61e2451',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
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
        WHERE "ID" = '6ac413dc-ebe1-4dfc-9be4-8e44377b7f46'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Name')
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
        '6ac413dc-ebe1-4dfc-9be4-8e44377b7f46',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100002,
        'Name',
        'Name',
        'Unique lowercase identifier for the app (e.g. acme-crm). Must contain only lowercase letters, digits, and hyphens.',
        'TEXT',
        128,
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
        WHERE "ID" = '27e04775-d00d-4d25-a076-4a6ff0205260'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'DisplayName')
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
        '27e04775-d00d-4d25-a076-4a6ff0205260',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100003,
        'DisplayName',
        'Display Name',
        'Human-readable display name shown in the UI (e.g. Acme CRM)',
        'TEXT',
        400,
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
        WHERE "ID" = '3849db2d-73c2-46bf-b263-af66d6a0b34d'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Description')
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
        '3849db2d-73c2-46bf-b263-af66d6a0b34d',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100004,
        'Description',
        'Description',
        'Optional long description of what this app does',
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
        WHERE "ID" = 'abe2e189-4467-4e98-87c5-b209d656438b'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Version')
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
        'abe2e189-4467-4e98-87c5-b209d656438b',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100005,
        'Version',
        'Version',
        'Currently installed semver version string (e.g. 1.2.3)',
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
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'bf1ac3d5-615d-4c91-aff7-6a9c88bc6d26'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Publisher')
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
        'bf1ac3d5-615d-4c91-aff7-6a9c88bc6d26',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100006,
        'Publisher',
        'Publisher',
        'Name of the organization or individual who published the app',
        'TEXT',
        400,
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
        WHERE "ID" = '0f40cc6a-b28a-4b49-af23-befe1b9907d3'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'PublisherEmail')
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
        '0f40cc6a-b28a-4b49-af23-befe1b9907d3',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100007,
        'PublisherEmail',
        'Publisher Email',
        'Optional contact email for the publisher',
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
        WHERE "ID" = 'f099ed4e-387c-4f5e-87a7-5272516719d1'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'PublisherURL')
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
        'f099ed4e-387c-4f5e-87a7-5272516719d1',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100008,
        'PublisherURL',
        'Publisher URL',
        'Optional website URL for the publisher',
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
        WHERE "ID" = '132cf4b3-e5e5-4083-b91d-1a629352872b'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'RepositoryURL')
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
        '132cf4b3-e5e5-4083-b91d-1a629352872b',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100009,
        'RepositoryURL',
        'Repository URL',
        'GitHub repository URL where this app is hosted',
        'TEXT',
        1000,
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
        WHERE "ID" = 'd8a2781a-95c0-4335-81b6-0021b7078e06'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'SchemaName')
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
        'd8a2781a-95c0-4335-81b6-0021b7078e06',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100010,
        'SchemaName',
        'Schema Name',
        'Database schema name used by this app for its tables and objects. Unique per instance.',
        'TEXT',
        256,
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
        1,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '0a1465db-2055-46ab-93d8-a70dd2245102'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'MJVersionRange')
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
        '0a1465db-2055-46ab-93d8-a70dd2245102',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100011,
        'MJVersionRange',
        'MJ Version Range',
        'Semver range specifying which MJ versions this app is compatible with (e.g. >=4.0.0 <5.0.0)',
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
        WHERE "ID" = '8721ceb2-e802-4c49-bbfc-bf6aeb51544b'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'License')
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
        '8721ceb2-e802-4c49-bbfc-bf6aeb51544b',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100012,
        'License',
        'License',
        'SPDX license identifier for this app (e.g. MIT, Apache-2.0)',
        'TEXT',
        100,
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
        WHERE "ID" = '19cd1851-4da5-43e7-bce7-175f1248eb26'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Icon')
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
        '19cd1851-4da5-43e7-bce7-175f1248eb26',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100013,
        'Icon',
        'Icon',
        'Optional icon identifier (e.g. Font Awesome class) for UI display',
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
        WHERE "ID" = 'a8a25dc2-66a9-4338-8cd5-c169f940372e'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Color')
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
        'a8a25dc2-66a9-4338-8cd5-c169f940372e',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100014,
        'Color',
        'Color',
        'Optional hex color code for branding in the UI (e.g. #FF5733)',
        'TEXT',
        40,
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
        WHERE "ID" = 'b37c9605-c957-4a09-acc6-2862c1a86d67'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'ManifestJSON')
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
        'b37c9605-c957-4a09-acc6-2862c1a86d67',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100015,
        'ManifestJSON',
        'Manifest JSON',
        'Full mj-app.json manifest stored as JSON for the currently installed version',
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
        WHERE "ID" = '519a5582-4618-4138-b19c-1713064cc457'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'ConfigurationSchemaJSON')
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
        '519a5582-4618-4138-b19c-1713064cc457',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100016,
        'ConfigurationSchemaJSON',
        'Configuration Schema JSON',
        'Optional JSON Schema defining the configuration options this app accepts',
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
        WHERE "ID" = 'a47e36f4-7942-4a8b-9735-72f74b07c618'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'InstalledByUserID')
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
        'a47e36f4-7942-4a8b-9735-72f74b07c618',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100017,
        'InstalledByUserID',
        'Installed By User ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
        WHERE "ID" = 'f96177d9-9802-44f6-a6c4-9e8ba2116bab'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Status')
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
        'f96177d9-9802-44f6-a6c4-9e8ba2116bab',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100018,
        'Status',
        'Status',
        'Current lifecycle status of the app: Active, Disabled, Error, Installing, Upgrading, Removing, or Removed',
        'TEXT',
        40,
        0,
        0,
        0,
        'Active',
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
        WHERE "ID" = '8416b44a-1a4d-4d48-ac1f-5831d14dfa12'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = '__mj_CreatedAt')
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
        '8416b44a-1a4d-4d48-ac1f-5831d14dfa12',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100019,
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
        WHERE "ID" = '12a25c96-e439-471a-ab5d-e190a3ffc957'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = '__mj_UpdatedAt')
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
        '12a25c96-e439-471a-ab5d-e190a3ffc957',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100020,
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
        WHERE "ID" = '6d1744ce-eeeb-42bf-b28b-a11792a71bdd'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ID')
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
        '6d1744ce-eeeb-42bf-b28b-a11792a71bdd',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
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
        WHERE "ID" = '2efced4c-6d5d-44e5-94d6-579d5a9ab715'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'OpenAppID')
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
        '2efced4c-6d5d-44e5-94d6-579d5a9ab715',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100002,
        'OpenAppID',
        'Open App ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'AC4A2799-454B-4395-AA56-A42241F32C12',
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
        WHERE "ID" = '428f3b7c-9739-4b55-973d-eefd321e8b39'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'Version')
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
        '428f3b7c-9739-4b55-973d-eefd321e8b39',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100003,
        'Version',
        'Version',
        'Semver version that was installed or upgraded to in this operation',
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
        0,
        'Search'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '4d60aa68-feb5-4330-a568-9a7616ca8446'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'PreviousVersion')
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
        '4d60aa68-feb5-4330-a568-9a7616ca8446',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100004,
        'PreviousVersion',
        'Previous Version',
        'Version that was installed before this operation (NULL for initial installs)',
        'TEXT',
        100,
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
        WHERE "ID" = '418e9648-0eaa-4d37-aee2-49b204c8ad89'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'Action')
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
        '418e9648-0eaa-4d37-aee2-49b204c8ad89',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100005,
        'Action',
        'Action',
        'Type of operation performed: Install, Upgrade, or Remove',
        'TEXT',
        40,
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
        WHERE "ID" = 'fb44993b-77ca-44ac-995a-9a3283759941'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ManifestJSON')
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
        'fb44993b-77ca-44ac-995a-9a3283759941',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100006,
        'ManifestJSON',
        'Manifest JSON',
        'Snapshot of the mj-app.json manifest at the time of this operation',
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
        WHERE "ID" = '13964cae-99b6-4a82-a8ea-a57452e2afca'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'Summary')
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
        '13964cae-99b6-4a82-a8ea-a57452e2afca',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100007,
        'Summary',
        'Summary',
        'Human-readable summary of what happened during this operation',
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
        WHERE "ID" = '0d4ec1c7-d177-454e-93ff-c97ab42bddff'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ExecutedByUserID')
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
        '0d4ec1c7-d177-454e-93ff-c97ab42bddff',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100008,
        'ExecutedByUserID',
        'Executed By User ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'null',
        0,
        1,
        0,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
        WHERE "ID" = 'e369a9c1-d637-4798-a5cc-79c93ec73029'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'DurationSeconds')
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
        'e369a9c1-d637-4798-a5cc-79c93ec73029',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100009,
        'DurationSeconds',
        'Duration Seconds',
        'Total wall-clock seconds the operation took to complete',
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
        WHERE "ID" = '4bbc4c22-3b9e-4632-a217-0abd0392afbe'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'StartedAt')
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
        '4bbc4c22-3b9e-4632-a217-0abd0392afbe',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100010,
        'StartedAt',
        'Started At',
        'Timestamp when the operation began',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        WHERE "ID" = '254f11c7-e80a-49c9-89b7-2305a482920c'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'EndedAt')
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
        '254f11c7-e80a-49c9-89b7-2305a482920c',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100011,
        'EndedAt',
        'Ended At',
        'Timestamp when the operation completed (success or failure)',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        WHERE "ID" = '276b0477-74d2-43c7-9836-99a70decdd44'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'Success')
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
        '276b0477-74d2-43c7-9836-99a70decdd44',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100012,
        'Success',
        'Success',
        'Whether the operation completed successfully (1) or failed (0)',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(1)',
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
        WHERE "ID" = '2b1fa518-5351-4449-8e5e-2904f7186e7e'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ErrorMessage')
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
        '2b1fa518-5351-4449-8e5e-2904f7186e7e',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100013,
        'ErrorMessage',
        'Error Message',
        'Detailed error message if the operation failed',
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
        WHERE "ID" = 'f26b581d-f6e3-47ba-bbbc-167e0f8e5867'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ErrorPhase')
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
        'f26b581d-f6e3-47ba-bbbc-167e0f8e5867',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100014,
        'ErrorPhase',
        'Error Phase',
        'Which phase of the operation failed: Schema, Migration, Packages, Config, Hooks, or Record',
        'TEXT',
        100,
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
        WHERE "ID" = 'd9441101-7b59-4a75-8627-39aa40ab657f'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = '__mj_CreatedAt')
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
        'd9441101-7b59-4a75-8627-39aa40ab657f',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
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
        WHERE "ID" = '724bc32b-7c1c-4e0f-9372-d6916372a729'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = '__mj_UpdatedAt')
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
        '724bc32b-7c1c-4e0f-9372-d6916372a729',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
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

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('4dabd128-c970-4fe9-aa10-42dcdef3e687', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 89e0c912-ed96-4005-915a-6c88e1bbdbab */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('89e0c912-ed96-4005-915a-6c88e1bbdbab', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID d62f5ca8-0c50-439d-9afa-7d74ad3e55b3 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('d62f5ca8-0c50-439d-9afa-7d74ad3e55b3', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 3, 'Error', 'Error')

/* SQL text to insert entity field value with ID dc4fd238-6204-430a-b095-950c93c1ecd9 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('dc4fd238-6204-430a-b095-950c93c1ecd9', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 4, 'Installing', 'Installing')

/* SQL text to insert entity field value with ID 370e4855-bc2e-46c2-b57c-5b7aa38f8474 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('370e4855-bc2e-46c2-b57c-5b7aa38f8474', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 5, 'Removed', 'Removed')

/* SQL text to insert entity field value with ID f4dcc7a8-6ca6-4508-af98-60fde4fadb1c */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('f4dcc7a8-6ca6-4508-af98-60fde4fadb1c', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 6, 'Removing', 'Removing')

/* SQL text to insert entity field value with ID 26ed1bb0-ee7c-4553-a227-b02028687b5f */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('26ed1bb0-ee7c-4553-a227-b02028687b5f', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 7, 'Upgrading', 'Upgrading')

/* SQL text to update ValueListType for entity field ID F96177D9-9802-44F6-A6C4-9E8BA2116BAB */;

UPDATE "__mj"."EntityField" SET "ValueListType"='List' WHERE "ID"='F96177D9-9802-44F6-A6C4-9E8BA2116BAB'

/* SQL text to insert entity field value with ID 6071c527-a0fc-4b5b-a157-b774b8afbc88 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('6071c527-a0fc-4b5b-a157-b774b8afbc88', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 1, 'Install', 'Install')

/* SQL text to insert entity field value with ID ec783aa6-9671-4969-b1ca-6e0143a63ce5 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('ec783aa6-9671-4969-b1ca-6e0143a63ce5', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 2, 'Remove', 'Remove')

/* SQL text to insert entity field value with ID 0199797e-c718-4b05-bb0e-7316c093b330 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('0199797e-c718-4b05-bb0e-7316c093b330', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 3, 'Upgrade', 'Upgrade')

/* SQL text to update ValueListType for entity field ID 418E9648-0EAA-4D37-AEE2-49B204C8AD89 */;

UPDATE "__mj"."EntityField" SET "ValueListType"='List' WHERE "ID"='418E9648-0EAA-4D37-AEE2-49B204C8AD89'

/* SQL text to insert entity field value with ID 6d50c950-5c3b-4acc-93c9-1d458ee5c415 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('6d50c950-5c3b-4acc-93c9-1d458ee5c415', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 1, 'Config', 'Config')

/* SQL text to insert entity field value with ID d9d4fe80-1357-432d-844f-5ad6d8f0b23f */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('d9d4fe80-1357-432d-844f-5ad6d8f0b23f', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 2, 'Hooks', 'Hooks')

/* SQL text to insert entity field value with ID d4de62a4-4a8d-4df9-bb38-0d5384afb5c1 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('d4de62a4-4a8d-4df9-bb38-0d5384afb5c1', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 3, 'Migration', 'Migration')

/* SQL text to insert entity field value with ID 69113e75-7abe-42c2-b758-a8a5dcdf29b6 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('69113e75-7abe-42c2-b758-a8a5dcdf29b6', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 4, 'Packages', 'Packages')

/* SQL text to insert entity field value with ID 27cac7fb-02c9-4439-822f-bb7401c1b82f */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('27cac7fb-02c9-4439-822f-bb7401c1b82f', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 5, 'Record', 'Record')

/* SQL text to insert entity field value with ID 0d45f847-99a0-4461-9633-58aa6ce7e26b */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('0d45f847-99a0-4461-9633-58aa6ce7e26b', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 6, 'Schema', 'Schema')

/* SQL text to update ValueListType for entity field ID F26B581D-F6E3-47BA-BBBC-167E0F8E5867 */;

UPDATE "__mj"."EntityField" SET "ValueListType"='List' WHERE "ID"='F26B581D-F6E3-47BA-BBBC-167E0F8E5867'

/* SQL text to insert entity field value with ID 10438f88-7021-4cda-86d3-8f9d38cf9383 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('10438f88-7021-4cda-86d3-8f9d38cf9383', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 1, 'Incompatible', 'Incompatible')

/* SQL text to insert entity field value with ID 643db15e-a984-44e8-8c37-88031a81f3a2 */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('643db15e-a984-44e8-8c37-88031a81f3a2', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 2, 'Missing', 'Missing')

/* SQL text to insert entity field value with ID 247e3736-bc93-42e5-9dd5-f649d8af9b3a */;

INSERT INTO "__mj"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code")
                                    VALUES
                                       ('247e3736-bc93-42e5-9dd5-f649d8af9b3a', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 3, 'Satisfied', 'Satisfied')

/* SQL text to update ValueListType for entity field ID F6BCA0FE-D58B-4356-9C80-F0468FD9398E */;

UPDATE "__mj"."EntityField" SET "ValueListType"='List' WHERE "ID"='F6BCA0FE-D58B-4356-9C80-F0468FD9398E'

/* SQL text to create Entitiy Relationships */;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = 'cf8ada7c-2030-49a6-83d4-a3bd68f09dac'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('cf8ada7c-2030-49a6-83d4-a3bd68f09dac', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'InstalledByUserID', 'One To Many', 1, 1, 'MJ: Open Apps', 1);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = '8c1f3348-0bda-4949-a1b8-81bc51b238f2'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('8c1f3348-0bda-4949-a1b8-81bc51b238f2', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', 'ExecutedByUserID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 1);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = '5ac78474-4f4d-479f-8db0-46cb0cd78442'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('5ac78474-4f4d-479f-8db0-46cb0cd78442', 'AC4A2799-454B-4395-AA56-A42241F32C12', '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 1);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = '6157799d-72af-43c6-8512-3bc8c9663ba5'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('6157799d-72af-43c6-8512-3bc8c9663ba5', 'AC4A2799-454B-4395-AA56-A42241F32C12', '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', 'DependsOnAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 2);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "__mj"."EntityRelationship"
        WHERE "ID" = 'a87478ba-99ad-48b8-a2f7-eddfeb989222'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "DisplayName", "Sequence")
        VALUES ('a87478ba-99ad-48b8-a2f7-eddfeb989222', 'AC4A2799-454B-4395-AA56-A42241F32C12', '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 2);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = 'eac84d79-54e1-446e-bb28-5c94596df798'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'OpenApp')
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
        'eac84d79-54e1-446e-bb28-5c94596df798',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100019,
        'OpenApp',
        'Open App',
        NULL,
        'TEXT',
        128,
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
        WHERE "ID" = 'df8c4b7f-fdc5-4b5f-bde0-3cce901702a9'  OR
        ("EntityID" = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND "Name" = 'DependsOnApp')
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
        'df8c4b7f-fdc5-4b5f-bde0-3cce901702a9',
        '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- "Entity": "MJ": "Open" "App" "Dependencies"
        100020,
        'DependsOnApp',
        'Depends On App',
        NULL,
        'TEXT',
        128,
        0,
        0,
        1,
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
        WHERE "ID" = 'ac2d5658-7cad-45ca-bcc5-a87e70144545'  OR
        ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'InstalledByUser')
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
        'ac2d5658-7cad-45ca-bcc5-a87e70144545',
        'AC4A2799-454B-4395-AA56-A42241F32C12', -- "Entity": "MJ": "Open" "Apps"
        100041,
        'InstalledByUser',
        'Installed By User',
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
        WHERE "ID" = '67329e25-81bf-4be6-8ee8-97b3e8795a8d'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'OpenApp')
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
        '67329e25-81bf-4be6-8ee8-97b3e8795a8d',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100033,
        'OpenApp',
        'Open App',
        NULL,
        'TEXT',
        128,
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
        WHERE "ID" = 'b9c5df9a-363b-4fa1-887b-6082950d5bb7'  OR
        ("EntityID" = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND "Name" = 'ExecutedByUser')
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
        'b9c5df9a-363b-4fa1-887b-6082950d5bb7',
        '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- "Entity": "MJ": "Open" "App" "Install" "Histories"
        100034,
        'ExecutedByUser',
        'Executed By User',
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


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwOpenAppDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: Permissions for vwOpenAppDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwOpenAppDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spCreateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenAppDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Open App Dependencies */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenAppDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spUpdateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenAppDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenAppDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spDeleteOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open App Dependencies */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for OpenAppInstallHistory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OpenAppID in table OpenAppInstallHistory;

GRANT SELECT ON __mj."vwOpenApps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwOpenApps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenApp" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Open Apps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenApp" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenApp" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenApp" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open Apps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 0D4EC1C7-D177-454E-93FF-C97AB42BDDFF */;

GRANT SELECT ON __mj."vwOpenAppInstallHistories" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    

/* Base View Permissions SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Permissions for vwOpenAppInstallHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwOpenAppInstallHistories" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spCreateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenAppInstallHistory" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Open App Install Histories */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateOpenAppInstallHistory" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spUpdateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenAppInstallHistory" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenAppInstallHistory" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spDeleteOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppInstallHistory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open App Install Histories */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppInstallHistory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;


-- ===================== Comments =====================

COMMENT ON TABLE __mj."OpenApp" IS 'Tracks all MJ Open Apps installed in this instance';

COMMENT ON COLUMN __mj."OpenApp"."Name" IS 'Unique lowercase identifier for the app (e.g. acme-crm). Must contain only lowercase letters, digits, and hyphens.';

COMMENT ON COLUMN __mj."OpenApp"."DisplayName" IS 'Human-readable display name shown in the UI (e.g. Acme CRM)';

COMMENT ON COLUMN __mj."OpenApp"."Description" IS 'Optional long description of what this app does';

COMMENT ON COLUMN __mj."OpenApp"."Version" IS 'Currently installed semver version string (e.g. 1.2.3)';

COMMENT ON COLUMN __mj."OpenApp"."Publisher" IS 'Name of the organization or individual who published the app';

COMMENT ON COLUMN __mj."OpenApp"."PublisherEmail" IS 'Optional contact email for the publisher';

COMMENT ON COLUMN __mj."OpenApp"."PublisherURL" IS 'Optional website URL for the publisher';

COMMENT ON COLUMN __mj."OpenApp"."RepositoryURL" IS 'GitHub repository URL where this app is hosted';

COMMENT ON COLUMN __mj."OpenApp"."SchemaName" IS 'Database schema name used by this app for its tables and objects. Unique per instance.';

COMMENT ON COLUMN __mj."OpenApp"."MJVersionRange" IS 'Semver range specifying which MJ versions this app is compatible with (e.g. >=4.0.0 <5.0.0)';

COMMENT ON COLUMN __mj."OpenApp"."License" IS 'SPDX license identifier for this app (e.g. MIT, Apache-2.0)';

COMMENT ON COLUMN __mj."OpenApp"."Icon" IS 'Optional icon identifier (e.g. Font Awesome class) for UI display';

COMMENT ON COLUMN __mj."OpenApp"."Color" IS 'Optional hex color code for branding in the UI (e.g. #FF5733)';

COMMENT ON COLUMN __mj."OpenApp"."ManifestJSON" IS 'Full mj-app.json manifest stored as JSON for the currently installed version';

COMMENT ON COLUMN __mj."OpenApp"."ConfigurationSchemaJSON" IS 'Optional JSON Schema defining the configuration options this app accepts';

COMMENT ON COLUMN __mj."OpenApp"."Status" IS 'Current lifecycle status of the app: Active, Disabled, Error, Installing, Upgrading, Removing, or Removed';

COMMENT ON TABLE __mj."OpenAppInstallHistory" IS 'Audit trail of every install, upgrade, and removal for Open Apps';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."Version" IS 'Semver version that was installed or upgraded to in this operation';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."PreviousVersion" IS 'Version that was installed before this operation (NULL for initial installs)';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."Action" IS 'Type of operation performed: Install, Upgrade, or Remove';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."ManifestJSON" IS 'Snapshot of the mj-app.json manifest at the time of this operation';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."Summary" IS 'Human-readable summary of what happened during this operation';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."DurationSeconds" IS 'Total wall-clock seconds the operation took to complete';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."StartedAt" IS 'Timestamp when the operation began';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."EndedAt" IS 'Timestamp when the operation completed (success or failure)';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."Success" IS 'Whether the operation completed successfully (1) or failed (0)';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."ErrorMessage" IS 'Detailed error message if the operation failed';

COMMENT ON COLUMN __mj."OpenAppInstallHistory"."ErrorPhase" IS 'Which phase of the operation failed: Schema, Migration, Packages, Config, Hooks, or Record';

COMMENT ON TABLE __mj."OpenAppDependency" IS 'Inter-app dependency relationships between installed Open Apps';

COMMENT ON COLUMN __mj."OpenAppDependency"."DependsOnAppName" IS 'Name of the app that this app depends on (matches OpenApp.Name)';

COMMENT ON COLUMN __mj."OpenAppDependency"."VersionRange" IS 'Semver range specifying which versions of the dependency are acceptable (e.g. ^1.0.0)';

COMMENT ON COLUMN __mj."OpenAppDependency"."InstalledVersion" IS 'Actual installed version of the dependency (NULL if not yet installed)';

COMMENT ON COLUMN __mj."OpenAppDependency"."Status" IS 'Whether the dependency is satisfied: Satisfied, Missing, or Incompatible';


-- ===================== Other =====================

-- CODEGEN OUTPUT --
/* SQL generated to create new entity MJ: Open Apps */

/* spUpdate Permissions for MJ: Open App Dependencies */

/* spUpdate Permissions for MJ: Open Apps */

/* spUpdate Permissions for MJ: Open App Install Histories */
