
-- ===================== DDL: Tables, PKs, Indexes =====================

-- =============================================================================
-- Migration: Integration Scheduled Job Support
-- Version:   5.12.x
-- Purpose:   1. Add ScheduledJobRunID FK to CompanyIntegrationRun for traceability
--            2. Add ScheduledJobID FK to CompanyIntegration for association
-- =============================================================================

-- 1a. Add ScheduledJobRunID to CompanyIntegrationRun
ALTER TABLE __mj."CompanyIntegrationRun"
 ADD COLUMN "ScheduledJobRunID" UUID NULL;

-- 1b. Add ScheduledJobID to CompanyIntegration
ALTER TABLE __mj."CompanyIntegration"
 ADD COLUMN "ScheduledJobID" UUID NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID" ON __mj."CompanyIntegrationRun" ("CompanyIntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID" ON __mj."CompanyIntegrationRun" ("RunByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID" ON __mj."CompanyIntegration" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID" ON __mj."CompanyIntegration" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID" ON __mj."CompanyIntegration" ("SourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID" ON __mj."CompanyIntegration" ("CredentialID");


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CompanyIntegrationID UUID DEFAULT NULL,
    IN p_RunByUserID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_TotalRecords INTEGER DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_ErrorLog TEXT DEFAULT NULL,
    IN p_ConfigData TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationRun"
            (
                "ID",
                "CompanyIntegrationID",
                "RunByUserID",
                "StartedAt",
                "EndedAt",
                "TotalRecords",
                "Comments",
                "Status",
                "ErrorLog",
                "ConfigData"
            )
        VALUES
            (
                p_ID,
                p_CompanyIntegrationID,
                p_RunByUserID,
                p_StartedAt,
                p_EndedAt,
                p_TotalRecords,
                p_Comments,
                COALESCE(p_Status, 'Pending'),
                p_ErrorLog,
                p_ConfigData
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationRun"
            (
                "CompanyIntegrationID",
                "RunByUserID",
                "StartedAt",
                "EndedAt",
                "TotalRecords",
                "Comments",
                "Status",
                "ErrorLog",
                "ConfigData"
            )
        VALUES
            (
                p_CompanyIntegrationID,
                p_RunByUserID,
                p_StartedAt,
                p_EndedAt,
                p_TotalRecords,
                p_Comments,
                COALESCE(p_Status, 'Pending'),
                p_ErrorLog,
                p_ConfigData
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationRun"(
    IN p_ID UUID,
    IN p_CompanyIntegrationID UUID,
    IN p_RunByUserID UUID,
    IN p_StartedAt TIMESTAMPTZ,
    IN p_EndedAt TIMESTAMPTZ,
    IN p_TotalRecords INTEGER,
    IN p_Comments TEXT,
    IN p_Status VARCHAR(20),
    IN p_ErrorLog TEXT,
    IN p_ConfigData TEXT
)
RETURNS SETOF __mj."vwCompanyIntegrationRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationRun"
    SET
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "RunByUserID" = p_RunByUserID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "TotalRecords" = p_TotalRecords,
        "Comments" = p_Comments,
        "Status" = p_Status,
        "ErrorLog" = p_ErrorLog,
        "ConfigData" = p_ConfigData
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegration"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_AccessToken VARCHAR(255) DEFAULT NULL,
    IN p_RefreshToken VARCHAR(255) DEFAULT NULL,
    IN p_TokenExpirationDate TIMESTAMPTZ DEFAULT NULL,
    IN p_APIKey VARCHAR(255) DEFAULT NULL,
    IN p_ExternalSystemID VARCHAR(100) DEFAULT NULL,
    IN p_IsExternalSystemReadOnly BOOLEAN DEFAULT NULL,
    IN p_ClientID VARCHAR(255) DEFAULT NULL,
    IN p_ClientSecret VARCHAR(255) DEFAULT NULL,
    IN p_CustomAttribute1 VARCHAR(255) DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_SourceTypeID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_ScheduleEnabled BOOLEAN DEFAULT NULL,
    IN p_ScheduleType VARCHAR(20) DEFAULT NULL,
    IN p_ScheduleIntervalMinutes INTEGER DEFAULT NULL,
    IN p_CronExpression VARCHAR(200) DEFAULT NULL,
    IN p_NextScheduledRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastScheduledRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_IsLocked BOOLEAN DEFAULT NULL,
    IN p_LockedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LockedByInstance VARCHAR(200) DEFAULT NULL,
    IN p_LockExpiresAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegration"
            (
                "ID",
                "CompanyID",
                "IntegrationID",
                "IsActive",
                "AccessToken",
                "RefreshToken",
                "TokenExpirationDate",
                "APIKey",
                "ExternalSystemID",
                "IsExternalSystemReadOnly",
                "ClientID",
                "ClientSecret",
                "CustomAttribute1",
                "Name",
                "SourceTypeID",
                "Configuration",
                "CredentialID",
                "ScheduleEnabled",
                "ScheduleType",
                "ScheduleIntervalMinutes",
                "CronExpression",
                "NextScheduledRunAt",
                "LastScheduledRunAt",
                "IsLocked",
                "LockedAt",
                "LockedByInstance",
                "LockExpiresAt"
            )
        VALUES
            (
                p_ID,
                p_CompanyID,
                p_IntegrationID,
                p_IsActive,
                p_AccessToken,
                p_RefreshToken,
                p_TokenExpirationDate,
                p_APIKey,
                p_ExternalSystemID,
                COALESCE(p_IsExternalSystemReadOnly, FALSE),
                p_ClientID,
                p_ClientSecret,
                p_CustomAttribute1,
                p_Name,
                p_SourceTypeID,
                p_Configuration,
                p_CredentialID,
                COALESCE(p_ScheduleEnabled, FALSE),
                COALESCE(p_ScheduleType, 'Manual'),
                p_ScheduleIntervalMinutes,
                p_CronExpression,
                p_NextScheduledRunAt,
                p_LastScheduledRunAt,
                COALESCE(p_IsLocked, FALSE),
                p_LockedAt,
                p_LockedByInstance,
                p_LockExpiresAt
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegration"
            (
                "CompanyID",
                "IntegrationID",
                "IsActive",
                "AccessToken",
                "RefreshToken",
                "TokenExpirationDate",
                "APIKey",
                "ExternalSystemID",
                "IsExternalSystemReadOnly",
                "ClientID",
                "ClientSecret",
                "CustomAttribute1",
                "Name",
                "SourceTypeID",
                "Configuration",
                "CredentialID",
                "ScheduleEnabled",
                "ScheduleType",
                "ScheduleIntervalMinutes",
                "CronExpression",
                "NextScheduledRunAt",
                "LastScheduledRunAt",
                "IsLocked",
                "LockedAt",
                "LockedByInstance",
                "LockExpiresAt"
            )
        VALUES
            (
                p_CompanyID,
                p_IntegrationID,
                p_IsActive,
                p_AccessToken,
                p_RefreshToken,
                p_TokenExpirationDate,
                p_APIKey,
                p_ExternalSystemID,
                COALESCE(p_IsExternalSystemReadOnly, FALSE),
                p_ClientID,
                p_ClientSecret,
                p_CustomAttribute1,
                p_Name,
                p_SourceTypeID,
                p_Configuration,
                p_CredentialID,
                COALESCE(p_ScheduleEnabled, FALSE),
                COALESCE(p_ScheduleType, 'Manual'),
                p_ScheduleIntervalMinutes,
                p_CronExpression,
                p_NextScheduledRunAt,
                p_LastScheduledRunAt,
                COALESCE(p_IsLocked, FALSE),
                p_LockedAt,
                p_LockedByInstance,
                p_LockExpiresAt
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegration"(
    IN p_ID UUID,
    IN p_CompanyID UUID,
    IN p_IntegrationID UUID,
    IN p_IsActive BOOLEAN,
    IN p_AccessToken VARCHAR(255),
    IN p_RefreshToken VARCHAR(255),
    IN p_TokenExpirationDate TIMESTAMPTZ,
    IN p_APIKey VARCHAR(255),
    IN p_ExternalSystemID VARCHAR(100),
    IN p_IsExternalSystemReadOnly BOOLEAN,
    IN p_ClientID VARCHAR(255),
    IN p_ClientSecret VARCHAR(255),
    IN p_CustomAttribute1 VARCHAR(255),
    IN p_Name VARCHAR(255),
    IN p_SourceTypeID UUID,
    IN p_Configuration TEXT,
    IN p_CredentialID UUID,
    IN p_ScheduleEnabled BOOLEAN,
    IN p_ScheduleType VARCHAR(20),
    IN p_ScheduleIntervalMinutes INTEGER,
    IN p_CronExpression VARCHAR(200),
    IN p_NextScheduledRunAt TIMESTAMPTZ,
    IN p_LastScheduledRunAt TIMESTAMPTZ,
    IN p_IsLocked BOOLEAN,
    IN p_LockedAt TIMESTAMPTZ,
    IN p_LockedByInstance VARCHAR(200),
    IN p_LockExpiresAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwCompanyIntegrations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegration"
    SET
        "CompanyID" = p_CompanyID,
        "IntegrationID" = p_IntegrationID,
        "IsActive" = p_IsActive,
        "AccessToken" = p_AccessToken,
        "RefreshToken" = p_RefreshToken,
        "TokenExpirationDate" = p_TokenExpirationDate,
        "APIKey" = p_APIKey,
        "ExternalSystemID" = p_ExternalSystemID,
        "IsExternalSystemReadOnly" = p_IsExternalSystemReadOnly,
        "ClientID" = p_ClientID,
        "ClientSecret" = p_ClientSecret,
        "CustomAttribute1" = p_CustomAttribute1,
        "Name" = p_Name,
        "SourceTypeID" = p_SourceTypeID,
        "Configuration" = p_Configuration,
        "CredentialID" = p_CredentialID,
        "ScheduleEnabled" = p_ScheduleEnabled,
        "ScheduleType" = p_ScheduleType,
        "ScheduleIntervalMinutes" = p_ScheduleIntervalMinutes,
        "CronExpression" = p_CronExpression,
        "NextScheduledRunAt" = p_NextScheduledRunAt,
        "LastScheduledRunAt" = p_LastScheduledRunAt,
        "IsLocked" = p_IsLocked,
        "LockedAt" = p_LockedAt,
        "LockedByInstance" = p_LockedByInstance,
        "LockExpiresAt" = p_LockExpiresAt
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationRun"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegration"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationRun" ON __mj."CompanyIntegrationRun";
CREATE TRIGGER "trgUpdateCompanyIntegrationRun"
    BEFORE UPDATE ON __mj."CompanyIntegrationRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationRun_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegration" ON __mj."CompanyIntegration";
CREATE TRIGGER "trgUpdateCompanyIntegration"
    BEFORE UPDATE ON __mj."CompanyIntegration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegration_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'df93b894-b6db-4928-825f-3ec8efbc9521' OR ("EntityID" = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ScheduledJobID')
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
        'df93b894-b6db-4928-825f-3ec8efbc9521',
        'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Company" "Integrations"
        100067,
        'ScheduledJobID',
        'Scheduled Job ID',
        'Associates this company integration with a scheduled job for automatic sync execution. NULL if no schedule is configured.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'F48D2E6C-61C8-46B8-A617-C8228601EB3C',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '98758b73-bcf9-4f1d-84d2-5c897f46eff3' OR ("EntityID" = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ScheduledJobRunID')
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
        '98758b73-bcf9-4f1d-84d2-5c897f46eff3',
        'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Company" "Integration" "Runs"
        100029,
        'ScheduledJobRunID',
        'Scheduled Job Run ID',
        'Links to the scheduled job run that triggered this integration sync. NULL for manually-triggered syncs.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '05853432-5E13-4F2A-8618-77857ADF17FA',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityFieldValue" SET "Sequence"=3 WHERE "ID"='5978FE3A-1BE9-4CFB-83B6-E9B34CBB587E';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='EA37F71B-6463-4D68-996C-BD69CC10EC21';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='7DDC2EF5-7E08-490C-8409-F576A303E3DE';
/* Create Entity Relationship: MJ: Scheduled Job Runs -> MJ: Company Integration Runs (One To Many via ScheduledJobRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f63d8578-c310-4de2-9bf2-15b047c0397f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f63d8578-c310-4de2-9bf2-15b047c0397f', '05853432-5E13-4F2A-8618-77857ADF17FA', 'E5238F34-2837-EF11-86D4-6045BDEE16E6', 'ScheduledJobRunID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '10b4a3f3-9b46-4fa9-ae66-eef4a3c43d2f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('10b4a3f3-9b46-4fa9-ae66-eef4a3c43d2f', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'ScheduledJobID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4D811E36-6C67-4927-957C-CF3692941C43'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '385817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."CompanyIntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."RunByUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Run By User ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C2E756D-4457-495D-B7BF-43402A1E4E4E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2C8D1AD8-7743-46C2-9B40-A7C6C9F0765B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."RunByUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C55717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."ScheduledJobRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Run Overview',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Job Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '98758B73-BCF9-4F1D-84D2-5C897F46EFF3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."StartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."EndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '704D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."TotalRecords"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '714D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7D91381D-ABC9-46DD-AA66-3E1909BE1CB2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '724D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."ErrorLog"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '429C9B37-8575-4F2D-9E19-F39378EC3A12' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs."ConfigData"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Configuration Data',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CB3F1399-7741-4882-99D6-F6CDE80E3897' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integration Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 37 fields */
-- UPDATE Entity Field Category Info MJ: Company Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CompanyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsActive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."SourceTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F647023E-D909-4ECB-B59D-EE477C274827' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsExternalSystemReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Read Only',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."AccessToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."RefreshToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."TokenExpirationDate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."APIKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientSecret"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CredentialID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '131B9CC4-3755-46F6-925A-7E3A13BCDFD6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ExternalSystemID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CustomAttribute1"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '987EAF20-227F-4043-BD87-06C9E01598F4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ScheduleEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D811E36-6C67-4927-957C-CF3692941C43' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ScheduleType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91E87B89-A40E-49CE-8464-75EC06BFF1A7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ScheduleIntervalMinutes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '801D0E7D-4FCB-4249-9052-4E929307F070' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CronExpression"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA43CB1D-7A04-40D8-AC9A-2036E3F06252' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."NextScheduledRunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '45E7C880-19C4-45FB-BA3C-9FFD9533FB12' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastScheduledRunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CAC39331-FA43-46BD-ABC0-11AE683EA5EC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ScheduledJobID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Scheduling',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Job',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF93B894-B6DB-4928-825F-3EC8EFBC9521' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsLocked"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6E0A21B0-0039-4ACC-B40A-3B8E1767D4D4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LockedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B9EDF01-96FE-4506-97D8-1971830F101E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LockedByInstance"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '186EB537-B916-46AC-82F3-DCE1789B572F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LockExpiresAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9E35F33-7ED2-4413-922F-12BA98E60355' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Last Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunStartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunEndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."CompanyIntegrationRun"
 ADD CONSTRAINT "FK_CompanyIntegrationRun_ScheduledJobRun"
    FOREIGN KEY ("ScheduledJobRunID")
    REFERENCES __mj."ScheduledJobRun"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."CompanyIntegration"
 ADD CONSTRAINT "FK_CompanyIntegration_ScheduledJob"
    FOREIGN KEY ("ScheduledJobID")
    REFERENCES __mj."ScheduledJob"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrationRuns" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spCreateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spUpdateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for CompanyIntegration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CompanyIntegration;

DO $$ BEGIN GRANT SELECT ON __mj."vwCompanyIntegrations" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."CompanyIntegrationRun"."ScheduledJobRunID" IS 'Links to the scheduled job run that triggered this integration sync. NULL for manually-triggered syncs.';

COMMENT ON COLUMN __mj."CompanyIntegration"."ScheduledJobID" IS 'Associates this company integration with a scheduled job for automatic sync execution. NULL if no schedule is configured.';


-- ===================== Other =====================

-- Extended properties

/* spUpdate Permissions for MJ: Company Integration Runs */

/* spUpdate Permissions for MJ: Company Integrations */


-- ===================== Refresh hand-rolled view to expose ScheduledJobRunID =====================
-- The ScheduledJobRunID column was added to __mj."CompanyIntegrationRun" earlier in this
-- migration, but __mj."vwCompanyIntegrationRuns" is hand-rolled (BaseViewGenerated=FALSE) so
-- CodeGen does not regenerate it. SQL Server's counterpart uses EXEC sp_refreshview; PG has
-- no equivalent for hand-rolled views. Plain CREATE OR REPLACE VIEW with the column appended
-- at the end (PG accepts a superset column list as long as existing columns are preserved).
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationRuns" AS
 SELECT cir."ID",
    cir."CompanyIntegrationID",
    cir."RunByUserID",
    cir."StartedAt",
    cir."EndedAt",
    cir."TotalRecords",
    cir."Comments",
    cir."__mj_CreatedAt",
    cir."__mj_UpdatedAt",
    cir."Status",
    cir."ErrorLog",
    cir."ConfigData",
    i."Name" AS "Integration",
    c."Name" AS "Company",
    u."Name" AS "RunByUser",
    -- New column appended (v5.12.x): expose ScheduledJobRunID added to CompanyIntegrationRun above.
    cir."ScheduledJobRunID"
   FROM __mj."CompanyIntegrationRun" cir
     JOIN __mj."CompanyIntegration" ci ON cir."CompanyIntegrationID" = ci."ID"
     JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
     JOIN __mj."User" u ON cir."RunByUserID" = u."ID"
     JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID";
