
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
    IN p_ConfigData TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID UUID DEFAULT NULL
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
                "ConfigData",
                "ScheduledJobRunID"
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
                p_ConfigData,
                p_ScheduledJobRunID
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
                "ConfigData",
                "ScheduledJobRunID"
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
                p_ConfigData,
                p_ScheduledJobRunID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE "ID" = p_ID;
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
    IN p_LockExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ScheduledJobID UUID DEFAULT NULL
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
                "LockExpiresAt",
                "ScheduledJobID"
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
                p_LockExpiresAt,
                p_ScheduledJobID
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
                "LockExpiresAt",
                "ScheduledJobID"
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
                p_LockExpiresAt,
                p_ScheduledJobID
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
    IN p_LockExpiresAt TIMESTAMPTZ,
    IN p_ScheduledJobID UUID
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
        "LockExpiresAt" = p_LockExpiresAt,
        "ScheduledJobID" = p_ScheduledJobID
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
    IN p_ConfigData TEXT,
    IN p_ScheduledJobRunID UUID
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
        "ConfigData" = p_ConfigData,
        "ScheduledJobRunID" = p_ScheduledJobRunID
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
