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

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJApplicationEntities_ApplicationIDID UUID;
    p_MJApplicationRoles_ApplicationIDID UUID;
    p_MJApplicationSettings_ApplicationIDID UUID;
    p_MJConversations_ApplicationIDID UUID;
    p_MJConversations_ApplicationID_UserID UUID;
    p_MJConversations_ApplicationID_ExternalID VARCHAR(500);
    p_MJConversations_ApplicationID_Name VARCHAR(255);
    p_MJConversations_ApplicationID_Description TEXT;
    p_MJConversations_ApplicationID_Type VARCHAR(50);
    p_MJConversations_ApplicationID_IsArchived BOOLEAN;
    p_MJConversations_ApplicationID_LinkedEntityID UUID;
    p_MJConversations_ApplicationID_LinkedRecordID VARCHAR(500);
    p_MJConversations_ApplicationID_DataContextID UUID;
    p_MJConversations_ApplicationID_Status VARCHAR(20);
    p_MJConversations_ApplicationID_EnvironmentID UUID;
    p_MJConversations_ApplicationID_ProjectID UUID;
    p_MJConversations_ApplicationID_IsPinned BOOLEAN;
    p_MJConversations_ApplicationID_TestRunID UUID;
    p_MJConversations_ApplicationID_ApplicationScope VARCHAR(20);
    p_MJConversations_ApplicationID_ApplicationID UUID;
    p_MJConversations_ApplicationID_DefaultAgentID UUID;
    p_MJConversations_ApplicationID_AdditionalData TEXT;
    p_MJDashboardUserPreferences_ApplicationIDID UUID;
    p_MJDashboards_ApplicationIDID UUID;
    p_MJDashboards_ApplicationID_Name VARCHAR(255);
    p_MJDashboards_ApplicationID_Description TEXT;
    p_MJDashboards_ApplicationID_UserID UUID;
    p_MJDashboards_ApplicationID_CategoryID UUID;
    p_MJDashboards_ApplicationID_UIConfigDetails TEXT;
    p_MJDashboards_ApplicationID_Type VARCHAR(20);
    p_MJDashboards_ApplicationID_Thumbnail TEXT;
    p_MJDashboards_ApplicationID_Scope VARCHAR(20);
    p_MJDashboards_ApplicationID_ApplicationID UUID;
    p_MJDashboards_ApplicationID_DriverClass VARCHAR(255);
    p_MJDashboards_ApplicationID_Code VARCHAR(255);
    p_MJDashboards_ApplicationID_EnvironmentID UUID;
    p_MJUserApplications_ApplicationIDID UUID;
BEGIN
-- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationEntity" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationEntities_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationEntity"(p_ID => p_MJApplicationEntities_ApplicationIDID);

    END LOOP;


    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationRole" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationRoles_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationRole"(p_ID => p_MJApplicationRoles_ApplicationIDID);

    END LOOP;


    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting

    FOR _rec IN SELECT "ID" FROM __mj."ApplicationSetting" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJApplicationSettings_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteApplicationSetting"(p_ID => p_MJApplicationSettings_ApplicationIDID);

    END LOOP;


    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData" FROM __mj."Conversation" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJConversations_ApplicationIDID := _rec."ID";
        p_MJConversations_ApplicationID_UserID := _rec."UserID";
        p_MJConversations_ApplicationID_ExternalID := _rec."ExternalID";
        p_MJConversations_ApplicationID_Name := _rec."Name";
        p_MJConversations_ApplicationID_Description := _rec."Description";
        p_MJConversations_ApplicationID_Type := _rec."Type";
        p_MJConversations_ApplicationID_IsArchived := _rec."IsArchived";
        p_MJConversations_ApplicationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_ApplicationID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_ApplicationID_DataContextID := _rec."DataContextID";
        p_MJConversations_ApplicationID_Status := _rec."Status";
        p_MJConversations_ApplicationID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_ApplicationID_ProjectID := _rec."ProjectID";
        p_MJConversations_ApplicationID_IsPinned := _rec."IsPinned";
        p_MJConversations_ApplicationID_TestRunID := _rec."TestRunID";
        p_MJConversations_ApplicationID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_ApplicationID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_ApplicationID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_ApplicationID_AdditionalData := _rec."AdditionalData";
        -- Set the FK field to NULL
        p_MJConversations_ApplicationID_ApplicationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_ApplicationIDID, p_UserID => p_MJConversations_ApplicationID_UserID, p_ExternalID => p_MJConversations_ApplicationID_ExternalID, p_Name => p_MJConversations_ApplicationID_Name, p_Description => p_MJConversations_ApplicationID_Description, p_Type => p_MJConversations_ApplicationID_Type, p_IsArchived => p_MJConversations_ApplicationID_IsArchived, p_LinkedEntityID => p_MJConversations_ApplicationID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_ApplicationID_LinkedRecordID, p_DataContextID => p_MJConversations_ApplicationID_DataContextID, p_Status => p_MJConversations_ApplicationID_Status, p_EnvironmentID => p_MJConversations_ApplicationID_EnvironmentID, p_ProjectID => p_MJConversations_ApplicationID_ProjectID, p_IsPinned => p_MJConversations_ApplicationID_IsPinned, p_TestRunID => p_MJConversations_ApplicationID_TestRunID, p_ApplicationScope => p_MJConversations_ApplicationID_ApplicationScope, p_ApplicationID_Clear => 1, p_ApplicationID => p_MJConversations_ApplicationID_ApplicationID, p_DefaultAgentID => p_MJConversations_ApplicationID_DefaultAgentID, p_AdditionalData => p_MJConversations_ApplicationID_AdditionalData);

    END LOOP;


    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference

    FOR _rec IN SELECT "ID" FROM __mj."DashboardUserPreference" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJDashboardUserPreferences_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardUserPreference"(p_ID => p_MJDashboardUserPreferences_ApplicationIDID);

    END LOOP;


    -- Cascade update on Dashboard using cursor to call spUpdateDashboard


    FOR _rec IN SELECT "ID", "Name", "Description", "UserID", "CategoryID", "UIConfigDetails", "Type", "Thumbnail", "Scope", "ApplicationID", "DriverClass", "Code", "EnvironmentID" FROM __mj."Dashboard" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJDashboards_ApplicationIDID := _rec."ID";
        p_MJDashboards_ApplicationID_Name := _rec."Name";
        p_MJDashboards_ApplicationID_Description := _rec."Description";
        p_MJDashboards_ApplicationID_UserID := _rec."UserID";
        p_MJDashboards_ApplicationID_CategoryID := _rec."CategoryID";
        p_MJDashboards_ApplicationID_UIConfigDetails := _rec."UIConfigDetails";
        p_MJDashboards_ApplicationID_Type := _rec."Type";
        p_MJDashboards_ApplicationID_Thumbnail := _rec."Thumbnail";
        p_MJDashboards_ApplicationID_Scope := _rec."Scope";
        p_MJDashboards_ApplicationID_ApplicationID := _rec."ApplicationID";
        p_MJDashboards_ApplicationID_DriverClass := _rec."DriverClass";
        p_MJDashboards_ApplicationID_Code := _rec."Code";
        p_MJDashboards_ApplicationID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJDashboards_ApplicationID_ApplicationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDashboard"(p_ID => p_MJDashboards_ApplicationIDID, p_Name => p_MJDashboards_ApplicationID_Name, p_Description => p_MJDashboards_ApplicationID_Description, p_UserID => p_MJDashboards_ApplicationID_UserID, p_CategoryID => p_MJDashboards_ApplicationID_CategoryID, p_UIConfigDetails => p_MJDashboards_ApplicationID_UIConfigDetails, p_Type => p_MJDashboards_ApplicationID_Type, p_Thumbnail => p_MJDashboards_ApplicationID_Thumbnail, p_Scope => p_MJDashboards_ApplicationID_Scope, p_ApplicationID_Clear => 1, p_ApplicationID => p_MJDashboards_ApplicationID_ApplicationID, p_DriverClass => p_MJDashboards_ApplicationID_DriverClass, p_Code => p_MJDashboards_ApplicationID_Code, p_EnvironmentID => p_MJDashboards_ApplicationID_EnvironmentID);

    END LOOP;


    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication

    FOR _rec IN SELECT "ID" FROM __mj."UserApplication" WHERE "ApplicationID" = p_ID
    LOOP
        p_MJUserApplications_ApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteUserApplication"(p_ID => p_MJUserApplications_ApplicationIDID);

    END LOOP;


    DELETE FROM
        __mj."Application"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJUserApplicationEntities_UserApplicationIDID UUID;
BEGIN
-- Cascade delete from UserApplicationEntity using cursor to call spDeleteUserApplicationEntity

    FOR _rec IN SELECT "ID" FROM __mj."UserApplicationEntity" WHERE "UserApplicationID" = p_ID
    LOOP
        p_MJUserApplicationEntities_UserApplicationIDID := _rec."ID";
        PERFORM __mj."spDeleteUserApplicationEntity"(p_ID => p_MJUserApplicationEntities_UserApplicationIDID);

    END LOOP;


    DELETE FROM
        __mj."UserApplication"
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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."Entity"
SET "CascadeDeletes" = TRUE
WHERE "ID" = 'E8238F34-2837-EF11-86D4-6045BDEE16E6';

-- MJ: User Applications (child of Applications, parent of User Application Entities)

UPDATE __mj."Entity"
SET "CascadeDeletes" = TRUE
WHERE "ID" = 'EC238F34-2837-EF11-86D4-6045BDEE16E6';

-- ============================================================================
-- CodeGen: Regenerated spDeleteApplication with cascade logic
-- ============================================================================

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ============================================================================
-- CodeGen: Regenerated spDeleteUserApplication with cascade logic
-- ============================================================================

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Applications
-- Item: spDeleteUserApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserApplication
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserApplication" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Other =====================

-- Migration: Enable Cascade Deletes for MJ: Applications
-- Description: Setting CascadeDeletes = 1 on Applications and User Applications
--              so that deleting an Application automatically cleans up all child records.
--
-- Child entities of Applications (all have AllowDeleteAPI=1 already):
--   - Application Entities        (ApplicationID, NOT NULL) -> DELETE cascade
--   - Application Roles           (ApplicationID, NOT NULL) -> DELETE cascade
--   - Application Settings        (ApplicationID, NOT NULL) -> DELETE cascade
--   - User Applications           (ApplicationID, NOT NULL) -> DELETE cascade
--   - Dashboard User Preferences  (ApplicationID, NULL)     -> DELETE cascade
--   - Conversations               (ApplicationID, NULL)     -> UPDATE SET NULL
--   - Dashboards                  (ApplicationID, NULL)     -> UPDATE SET NULL
--
-- User Applications also needs cascade because it has a child:
--   - User Application Entities (UserApplicationID, NOT NULL) -> DELETE cascade

-- ============================================================================
-- Entity metadata CascadeDeletes flag
-- ============================================================================

-- MJ: Applications
