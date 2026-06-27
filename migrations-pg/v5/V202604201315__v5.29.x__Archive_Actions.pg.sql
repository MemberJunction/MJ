-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ----------------------------------------------------------------------------
-- Manual fix (Category F5): the auto-converter SKIPPED the IF NOT EXISTS / EXEC
-- spCreateAction / spCreateActionParam blocks. Rewritten as DO $$ ... END $$;
-- with direct INSERTs because the fn_create_* functions are CodeGen-emitted
-- and may not exist when this seeding migration runs on a fresh install.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Migration: Seed Action records for the Archive Data and Restore Archived Record actions.
-- These actions are implemented by @memberjunction/archiving-action and registered via
-- @RegisterClass(BaseAction, 'Archive Data') / @RegisterClass(BaseAction, 'Restore Archived Record').
-- The database Action records are required for the MJ Action Engine to discover and execute them.

------------------------------------------------------
-- 0) Archive action category
------------------------------------------------------
DO $$
DECLARE
    v_archive_category_id UUID := '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."ActionCategory" WHERE "ID" = v_archive_category_id) THEN
        INSERT INTO __mj."ActionCategory" ("ID", "Name", "Description", "ParentID")
        VALUES (v_archive_category_id, 'Archive', 'Actions related to data archiving, restoration, and lifecycle management.', NULL);
    END IF;
END $$;

------------------------------------------------------
-- 1) Archive Data action
------------------------------------------------------
DO $$
DECLARE
    v_archive_action_id   UUID := 'F7481B20-E85D-4C74-A5BE-CD9B4FADB131';
    v_archive_category_id UUID := '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."Action" WHERE "Name" = 'Archive Data') THEN
        INSERT INTO __mj."Action" (
            "ID", "CategoryID", "Name", "Description", "Type",
            "UserPrompt", "UserComments", "Code", "CodeComments",
            "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt",
            "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status",
            "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config"
        ) VALUES (
            v_archive_action_id, v_archive_category_id, 'Archive Data',
            'Executes an archive run for a given Archive Configuration. Archives eligible records to external storage based on retention rules, field configuration, and entity settings.',
            'Custom',
            NULL, NULL, NULL, NULL,
            'Approved', NULL, NULL, NULL,
            TRUE, FALSE, NULL, 'Active',
            'Archive Data', NULL, 'fa-solid fa-box-archive', NULL, NULL
        );
    END IF;
END $$;

-- Archive Data: ConfigurationID input param
DO $$
DECLARE
    v_archive_param_id  UUID := '611417D2-183B-42DE-93A1-EB83FAD64C5E';
    v_archive_action_id UUID := 'F7481B20-E85D-4C74-A5BE-CD9B4FADB131';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ActionParam"
        WHERE "ActionID" = v_archive_action_id AND "Name" = 'ConfigurationID'
    ) THEN
        INSERT INTO __mj."ActionParam" (
            "ID", "ActionID", "Name", "DefaultValue", "Type", "ValueType",
            "IsArray", "Description", "IsRequired", "MediaModality"
        ) VALUES (
            v_archive_param_id, v_archive_action_id, 'ConfigurationID', NULL, 'Input', 'Scalar',
            FALSE,
            'ID (UUID) of the MJ: Archive Configuration record to execute. The configuration must be active and have at least one entity configured.',
            TRUE, NULL
        );
    END IF;
END $$;

------------------------------------------------------
-- 2) Restore Archived Record action
------------------------------------------------------
DO $$
DECLARE
    v_restore_action_id   UUID := '5433037C-7B58-40E6-8044-48D7C11A398D';
    v_archive_category_id UUID := '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."Action" WHERE "Name" = 'Restore Archived Record') THEN
        INSERT INTO __mj."Action" (
            "ID", "CategoryID", "Name", "Description", "Type",
            "UserPrompt", "UserComments", "Code", "CodeComments",
            "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt",
            "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status",
            "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config"
        ) VALUES (
            v_restore_action_id, v_archive_category_id, 'Restore Archived Record',
            'Restores a previously archived record version by reading the archived field data from storage and writing it back to the database record.',
            'Custom',
            NULL, NULL, NULL, NULL,
            'Approved', NULL, NULL, NULL,
            TRUE, FALSE, NULL, 'Active',
            'Restore Archived Record', NULL, 'fa-solid fa-rotate-left', NULL, NULL
        );
    END IF;
END $$;

-- Restore Archived Record: ArchiveRunDetailID input param
DO $$
DECLARE
    v_restore_param_id  UUID := '4EA1569C-F850-417A-9901-C7CB2B829A74';
    v_restore_action_id UUID := '5433037C-7B58-40E6-8044-48D7C11A398D';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."ActionParam"
        WHERE "ActionID" = v_restore_action_id AND "Name" = 'ArchiveRunDetailID'
    ) THEN
        INSERT INTO __mj."ActionParam" (
            "ID", "ActionID", "Name", "DefaultValue", "Type", "ValueType",
            "IsArray", "Description", "IsRequired", "MediaModality"
        ) VALUES (
            v_restore_param_id, v_restore_action_id, 'ArchiveRunDetailID', NULL, 'Input', 'Scalar',
            FALSE,
            'ID (UUID) of the MJ: Archive Run Detail record to restore. The detail record contains the storage path and entity/record reference needed for restoration.',
            TRUE, NULL
        );
    END IF;
END $$;
