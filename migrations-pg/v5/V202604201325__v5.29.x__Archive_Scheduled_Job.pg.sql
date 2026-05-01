-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ----------------------------------------------------------------------------
-- Manual fix (Category F5): the auto-converter SKIPPED the IF NOT EXISTS / EXEC
-- spCreateAction block (and chunked the ScheduledAction INSERT around the
-- DECLARE statements). Rewritten as DO $$ ... END $$; blocks with direct
-- INSERTs for symmetry with V202604201315__v5.29.x__Archive_Actions.pg.sql.
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

-- Migration: Create "Run All Active Archives" action and daily scheduled job.
-- The action queries all active ArchiveConfigurations and runs each one.
-- The scheduled job fires at 2:00 AM Central Time (America/Chicago) daily.

------------------------------------------------------
-- 1) Run All Active Archives action
------------------------------------------------------
DO $$
DECLARE
    v_run_all_action_id   UUID := 'D65B5245-2A54-42EA-8CC6-85689A9E765F';
    v_archive_category_id UUID := '0FADE0AA-E3BA-4A73-9D31-96B81B3D59AF';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."Action" WHERE "Name" = 'Run All Active Archives') THEN
        INSERT INTO __mj."Action" (
            "ID", "CategoryID", "Name", "Description", "Type",
            "UserPrompt", "UserComments", "Code", "CodeComments",
            "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt",
            "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status",
            "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config"
        ) VALUES (
            v_run_all_action_id, v_archive_category_id, 'Run All Active Archives',
            'Discovers all active Archive Configurations and executes each one sequentially. Designed for scheduled daily runs — no parameters required.',
            'Custom',
            NULL, NULL, NULL, NULL,
            'Approved', NULL, NULL, NULL,
            TRUE, FALSE, NULL, 'Active',
            'Run All Active Archives', NULL, 'fa-solid fa-boxes-stacked', NULL, NULL
        );
    END IF;
END $$;

------------------------------------------------------
-- 2) Daily scheduled job — 2:00 AM Central Time
------------------------------------------------------
DO $$
DECLARE
    v_scheduled_action_id UUID := '41912D10-E0D1-4F98-A2CC-56FC56215EB1';
    v_run_all_action_id   UUID := 'D65B5245-2A54-42EA-8CC6-85689A9E765F';
    v_system_user_id      UUID := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM __mj."ScheduledAction" WHERE "Name" = 'Daily Archive Run') THEN
        INSERT INTO __mj."ScheduledAction" (
            "ID", "Name", "Description", "CreatedByUserID", "ActionID",
            "Type", "CronExpression", "Timezone", "Status"
        ) VALUES (
            v_scheduled_action_id,
            'Daily Archive Run',
            'Runs all active archive configurations once per day at 2:00 AM Central Time.',
            v_system_user_id,
            v_run_all_action_id,
            'Custom',
            '0 2 * * *',
            'America/Chicago',
            'Disabled'
        );
    END IF;
END $$;
